# OpenLearnQuest — CLAUDE.md

## Project Overview

AI-driven linked-list learning game. Students answer questions (fill-in-the-blank, find-the-bug, ordering) about linked-list operations. An adaptive engine adjusts question type and difficulty based on mastery and emotional state.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy (PostgreSQL) + Alembic migrations + Anthropic SDK
- **Frontend**: React 19 + Vite + Tailwind CSS (no router — state-machine navigation)
- **AI**: Claude Haiku 4.5 for question generation + tutor chat (ReAct loop with tool use)

## Dev Environment

### Prerequisites
- Python venv at `d:/openLearnquest/venv/`
- PostgreSQL running locally (`openlearnquest` database)
- Node.js for frontend

### Start Backend
```bash
cd backend
d:/openLearnquest/venv/Scripts/uvicorn main:app --reload --port 8001
```

### Start Frontend
```bash
cd frontend
npm run dev        # runs on http://localhost:5173
```

### Environment Files
- `backend/.env` — DB URL, secret key, Anthropic API key, admin key
- `frontend/.env` — `VITE_API_URL=http://localhost:8001`

**Note**: Port 8000 may be occupied by another project. Always use `--port 8001` for this backend.

### Reset User Data
```bash
d:/openLearnquest/venv/Scripts/python.exe backend/clear_user_data.py --apply
```

### Run Migrations
```bash
cd backend
d:/openLearnquest/venv/Scripts/alembic upgrade head
```

## Architecture

### Backend Structure
```
backend/
  main.py                     # uvicorn entry point (run from backend/)
  app/
    routes/                   # FastAPI routers (all prefixed /api/*)
      auth.py                 # /api/auth — register, login, me
      game_master.py          # /api/gm  — session start/next/hint/mastery
      progress.py             # /api/progress — XP, mistakes, leaderboard
      tutor.py                # /api/ai/tutor — ReAct tutor (non-streaming + streaming)
      emotion.py              # /api/emotion — behavioral + self-report
      admin.py                # /api/admin — admin dashboard
    services/
      game_master.py          # orchestrates the multi-agent loop
      claude_service.py       # calls Claude API, retries, fallback
      question_registry.py    # per-type prompt builders + validators
      question_spec.py        # maps type_unlocked + emotion → QuestionSpec
      static_questions.py     # TEMPLATES dict: correct pseudocode for all 12 ops
      emotion_agent.py        # behavioral signal → emotion label
      hint_agent.py           # generates hints on error_count ≥ 2
      tutor_agent.py          # ReAct Socratic tutor (see Tutor Agent section)
      error_analyzer.py       # structured error diagnosis
      ll_executor.py          # simulates linked-list ops for goalPattern
      concept_graph.py        # concept dependency graph per operation
    models/                   # SQLAlchemy ORM models
    schemas/                  # Pydantic request/response schemas
```

### Frontend Structure
```
frontend/src/
  App.jsx                     # state-machine router (no react-router)
  contexts/
    AuthContext.jsx            # user auth state + login/register/logout
    EmotionContext.jsx         # current emotion state
  services/
    api.js                    # all fetch calls — authApi, gameMasterApi, etc.
    adaptiveEngine.js         # client-side emotion + difficulty helpers
  components/
    AgenticSession.jsx        # main game loop (prefetch, timing, question flow)
    LinkedListHintAnimation.jsx  # always-visible animation hint modal (CSS transitions)
    FillBlankBoard.jsx        # fill-in-the-blank question UI
    FindBugBoard.jsx          # find-the-bug question UI
    AssemblyArea.jsx          # ordering question UI (drag/drop)
    TutorChat.jsx             # streaming tutor sidebar
    AuthPage.jsx              # login + register form
    AdminDashboard.jsx        # admin view
```

## Tutor Agent (`tutor_agent.py`)

The tutor uses a **ReAct (Reason + Act) loop** — Claude reasons about the student's error, optionally calls a tool, then responds.

### Tool: `lookup_resource`
When the student is stuck (error_count ≥ 2 or 3+ stalled exchanges), Claude autonomously calls `lookup_resource(concept, reason)`. The tool queries `CONCEPT_RESOURCE_LIBRARY` — a static dict of NeetCode videos organised by **concept** (not operation):

| Concept | What it covers |
|---|---|
| `pointer_assignment` | Pointer reassignment order, lost-node bugs |
| `traversal` | While-loop stop conditions, stop-before-target |
| `memory_management` | Null-out pointers, dangling references |
| `node_creation` | New node fields, initialisation |
| `list_structure` | Reverse, merge, cycle, sort patterns |

Claude decides WHEN to call the tool — this is the agentic behaviour (not a hardcoded threshold).

### Type-aware context
`build_context_block()` adapts its wording to the question type (passed as `question_type`): `fill_blank` → "the blank / value that belongs here", `find_bug` → "the line", `ordering` → "assembly / step order". This prevents the tutor from saying "assembly" on a fill-in-the-blank question. The proactive push (in `AgenticSession.jsx`) likewise uses a type-specific `PROACTIVE_INIT`.

### Cross-Session History Injection (context engineering)
On every first turn, `build_context_block()` injects a `[STUDENT HISTORY]` block:
- Past mastery stats for the current operation (attempts, passes, pass rate, streak) — from `mastery` table
- Recurring wrong answers from previous sessions — from `mistakes` table (filtered by `title == question_title`, last 5, skipping empty `your_answer`)

This lets Claude say "I see you've made this mistake before" without the student having to explain.

### ReAct Loop (max 3 iterations)
```
1. build_api_messages()  →  first turn includes [STUDENT HISTORY] + [TUTOR CONTEXT]
2. Claude call with tools
   a. stop_reason == "end_turn"  →  return text (done)
   b. stop_reason == "tool_use"  →  execute lookup_resource, append result, loop
3. Streaming: text_stream yields tokens; tool call = ~500ms pause then streaming resumes
```

## Adaptive Learning System

### Question Type Progression
Each operation has a `type_unlocked` (int, 1–3) stored in `mastery` table — **never decreases**.

| `type_unlocked` | Question type |
|---|---|
| 1 | `fill_blank` |
| 2 | `find_bug` |
| 3 | `ordering` |

**Unlock rules** (in `game_master.py → update_mastery()`):
- `consecutive_passes` only increments when `error_count == 0`
- Any error resets `consecutive_passes` to 0, but does NOT lower `type_unlocked`
- `consecutive_passes >= 1` → unlock level 2 (`find_bug`)
- `consecutive_passes >= 2` → unlock level 3 (`ordering`)

**Student-controlled progression (`active_type_level`)**: `type_unlocked` is the *ceiling* (what's earned); `active_type_level` (≤ ceiling, in `mastery`, persisted) is what the student is *practicing* and is what actually drives the question type. Unlocking does NOT auto-advance — on unlock a non-dismissing popup (`UnlockPopup.jsx`) offers *advance* or *stay*, and a persistent 🔓 Level Up button (`POST /api/gm/session/level-up`, `gm.level_up`) lets them advance any time.

### State Axis — within-type difficulty + scaffolding (emotion-driven)
**Two-axis design**: the competence axis above owns the question *type*; emotion drives two orthogonal channels that never change the type:
- **ZPD difficulty controller** (`game_master.compute_intra_difficulty`): targets a ~25–30% error rate using the session's recent error rate; emotion only scales the gain (frustrated → ease faster, bored → ramp faster, confused → neutral). Output `intra_difficulty` (1–3) drives `select_spec` params + `INTRA_KNOBS` (node count, distractor count/similarity, blanks, bug subtlety) in `question_spec.py` / `static_questions.py`.
- **Scaffold orchestrator** (`hooks/useScaffold.js`): `scaffold_level = emotion baseline + per-error climb − mastery fading cap`; gates error-highlight → Socratic hint / proactive push → animation → near-reveal. `confused` raises scaffolding but keeps difficulty; `frustrated` lowers difficulty.

Emotion is inferred **every question** (`emotion_agent.infer_from_behavior`, instant rules) + from tutor chat (`infer_from_chat`, LLM), each with a confidence. Per-question telemetry (`intra_difficulty`/`scaffold_level`/`emotion`) is recorded on `question_attempts`; `app/analytics/difficulty_eval.py` is the offline evaluator.

> Note: the old "emotion shifts difficulty ±1 on the type ladder" behaviour was **replaced** by this two-axis system — emotion no longer changes the question type.

### Question Generation Flow
1. `select_spec()` → `QuestionSpec` (type + difficulty + params)
2. `fill_blank` → static template, no AI call
3. `find_bug` / `ordering` → Claude Haiku generates **minimal fields only**:
   - `find_bug`: AI returns `{bug_line, buggy_line, wrong_options, bug_explanation, hint}`
   - `ordering`: AI returns `{distractors, hint}`
4. Python assembles full question from `TEMPLATES` in `static_questions.py`
5. Validator checks semantic correctness; retries up to 3× on failure

**Key principle**: correct pseudocode always comes from `TEMPLATES`, never from AI. AI only generates wrong options.

### Animation Hint (`LinkedListHintAnimation.jsx`)
Always-visible hint button (no error threshold). Click → modal with a per-node CSS transition animation showing the operation step-by-step (cursor traversal, nodes appearing/disappearing). Has a Replay button. Does not use AI — purely deterministic based on `question.operation`.

### Per-step animation in fill_blank (`fillBlankSteps.js` + `FillBlankBoard.jsx`)
`fill_blank` animates **each step as the student fills it** (not one animation at the end). `computeStepStates(operation, ...)` returns the list state after each pseudocode step (aligned to TEMPLATES); the board reuses `AnimNode`/`Arrow` (exported from `LinkedListHintAnimation.jsx`). Operations not modelled fall back to executing once at the end.

## Database Schema (key tables)

| Table | Key columns |
|---|---|
| `users` | id, email, username, xp, is_admin |
| `game_sessions` | id, user_id, module_id, mode |
| `question_attempts` | session_id, question_id, difficulty, passed, error_count, error_type, error_concept, **intra_difficulty, scaffold_level, emotion** (state-axis telemetry) |
| `mastery` | user_id, operation, module_id, attempts, passes, consecutive_passes, perfect_pass, type_unlocked, **active_type_level** |
| `concept_mastery` | user_id, concept, mastery (0–1 float), attempts — Bayesian-style per-concept posterior |
| `mistakes` | user_id, question_id, source, title, your_answer (JSON), correct_answer (JSON), explanation, created_at |
| `emotion_logs` | user_id, session_id, emotion, source, confidence, signals (JSON), action_taken |

**Note**: `mistakes.title` matches `q.title` sent from the frontend. Filter by `title == question_title` to get operation-specific history. `your_answer` may be an empty list for early-stage wrong attempts — skip these when building tutor context.

## Key Conventions

- All API routes use `/api/<prefix>/` pattern
- Frontend calls backend directly (no Vite proxy) — `VITE_API_URL` sets the base
- Frontend uses `/api/ai/tutor/stream` (SSE) for tutor chat, not the non-streaming endpoint
- `consecutive_passes` in `Mastery` = consecutive **perfect** passes (error_count == 0)
- When creating a new `Mastery` record, always pass `type_unlocked=1` and `active_type_level=1` explicitly — SQLAlchemy `default=` doesn't apply at Python object creation
- `backend/main.py` (root level) is the uvicorn entry point; `backend/app/main.py` is the same app for import use
- Alembic migrations live in `backend/alembic/versions/` — run from `backend/` directory

## Supported Operations (12 total)

`insertAtHead`, `insertAtTail`, `removeAtHead`, `removeAtTail`, `insertIntoEmpty`, `deleteEntireList`, `insertAtPosition`, `removeAtPosition`, `reverseList`, `mergeSortedLists`, `detectCycle`, `sortList`
