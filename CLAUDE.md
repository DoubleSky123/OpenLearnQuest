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

### Refill Question Pool
```bash
cd backend
d:/openLearnquest/venv/Scripts/python.exe refill_pool.py --ops all   # scope with --ops/--types/--intra — full run costs many Haiku calls
```
Serving also self-heals: when a (operation, type, intra) combo drops to the low-water mark, a background thread tops it up. Pool-empty serving falls back to live generation (warning logged). `fill_blank` is never pooled (static, instant).

**Pool staleness rule**: pool payloads embed TEMPLATES content (pseudocode, step_hints) at generation time. After editing an operation's TEMPLATES entry, regenerate its pool rows: `refill_pool.py --ops <op> --purge`.

### Run Migrations
```bash
cd backend
d:/openLearnquest/venv/Scripts/alembic upgrade head
```

### Run Tests
```bash
cd backend
d:/openLearnquest/venv/Scripts/python.exe -m pytest tests/ -q
```
In-memory SQLite fixtures (no Postgres needed); covers the deterministic core: `ll_executor`, mastery/unlock rules, `select_spec`, `error_analyzer`, the ZPD controller contract, scaffold clamp + closed-loop telemetry. `scaffold_level` from the client is clamped server-side (`game_master.clamp_scaffold`) — never trust client-computed telemetry.

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
      tutor_agent.py          # ReAct Socratic tutor (see Tutor Agent section)
      tutor_memory.py         # tutor memory: persistence + view compaction + episodic recall
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

### Prompt design rule: stay lean, do NOT add a rule per failure
The whole tutor is **"a simple Socratic guide, plus a video when guiding stalls"**. `_TUTOR_ROLE` (shared) + a short phase paragraph is the entire prompt — keep it that way. An earlier version grew one rule per observed failure and became brittle in ways that were worse than the bugs they fixed:

- Mandating a `"Right —"` / `"Not quite —"` opener made the tutor **grade the student's questions** ("Not quite —" in reply to a question), then deflect them.
- Over-stressing "never answer with a video" stopped `lookup_resource` firing **at all** (0/4 on a stuck student), killing a deliberate feature.
- A "≤ 2 sentences" cap was the *cause* of the unreadable phrasing — everything got crammed into one clause-stacked sentence. Tighter limit, more complex output.

When behaviour is off, prefer restating the *principle* over adding a clause. Tangents are explicitly allowed: a student wandering onto "why not just use an array?" should get a real answer, not a redirect.

**The one exception is tool use.** Models reliably under-call tools from descriptive guidance, so the per-turn note in `build_api_messages()` keeps an imperative ("stop re-explaining and CALL lookup_resource on this turn"). Style guidance belongs in the system prompt; the tool policy has to be operationalised per turn, because the first-turn prompt is forgotten by turn 3. Measured: 4/4 fire when stuck, 0/3 when the student is progressing.

### Two phases: `solving` vs `reviewing`
`TutorRequest.phase` (client-sent, default `solving`; unknown values fall back to `solving` so a stale client can never unlock answer reveal) picks the prompt via `tutor_agent.system_prompt_for()`:

| | `solving` (exercise open) | `reviewing` (analysis card up) |
|---|---|---|
| Concepts, tangents, casual chat | free | free |
| This exercise's answer (step order / blank token / bug line) | withheld — **including in plain English**; "first create it, then connect it, then move head" is as much a leak as the code | already on the student's screen, so explain it outright |

`AgenticSession` sets `phase='reviewing'` when the tutor is opened from the analysis card's "Ask the tutor" (the Consider follow-up). Without this the tutor answered that follow-up with "let's focus on..." — it was withholding an answer the student could already see.

**Verdicts are substance, not format**: give the honest read up front when the student *asserts* something, in whatever words; a student *question* just gets answered. `tests`/`tutor_sim.py` therefore assert that a verdict is PRESENT (a broad synonym list), never that it is phrased a particular way — extend the synonym list rather than constraining the prompt.

### Type-aware context
`build_context_block()` adapts its wording to the question type (passed as `question_type`): `fill_blank` → "the blank / value that belongs here", `find_bug` → "the line", `ordering` → "assembly / step order". This prevents the tutor from saying "assembly" on a fill-in-the-blank question. The proactive push (in `AgenticSession.jsx`) likewise uses a type-specific `PROACTIVE_INIT`.

### Cross-Session History Injection (context engineering)
On every first turn, `build_context_block()` injects a `[STUDENT HISTORY]` block:
- Past mastery stats for the current operation (attempts, passes, pass rate, streak) — from `mastery` table
- Recurring wrong answers from previous sessions — from `mistakes` table (filtered by `title == question_title`, last 5, skipping empty `your_answer`)
- `[PAST TUTOR CONVERSATIONS]` — episodic memories from `tutor_memory.episodic_block()` (see below)

This lets Claude say "I see you've made this mistake before" without the student having to explain.

### Tutor Memory (`tutor_memory.py`) — three layers
1. **Working memory (per question)**: every turn is persisted to `tutor_messages` (clean text, append-only). The DB is the authoritative history when `session_id` is present — `body.messages` from the client is a legacy fallback only. `GET /api/ai/tutor/stream`'s reply is saved *before* `[DONE]` (the client's onDone immediately calls infer-chat, which reads the DB). Window restore: `GET /api/ai/tutor/history?session_id&question_title`.
2. **Compaction (view, not storage)**: when a conversation's uncompacted messages exceed 20, the oldest are compressed into `compact_summary` keeping the last 8 verbatim (`maybe_compact`, runs after `[DONE]`). What Claude receives = recap pair + verbatim tail; storage stays complete.
3. **Episodic memory (cross-question)**: after a question attempt is recorded (`/session/record` and `/session/next` add a BackgroundTask), `summarize_pending` writes `summary` + `key_struggles` (concepts validated against the concept graph) + `resolved` (backfilled from the attempt, never LLM-guessed). Retrieval (`episodic_block`) is deterministic with decay: concept overlap via `OP_CONCEPTS` → mastery fading (skip if all concepts ≥ 0.75) → unresolved first → LIMIT 3. Conversations with no real student message get `summary=""` (sentinel: summarised, nothing to remember).

**Memory design rules**: forgetting happens at read time (filters), never by deleting rows; `summary=NULL` means "not yet summarised" and is retried, `summary=""` means "nothing worth remembering"; memory belongs to the user — `session_id` FK is SET NULL so memories survive session deletion.

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
- **ZPD difficulty controller** (`game_master._intra_from_history`, pure; DB wrapper `compute_intra_difficulty`): targets ~25–30% error rate via **EMA + hysteresis** (dead zone 0.22–0.40, 2 consecutive confirmations, one level per move — replaced the windowed-rate version that oscillated). Emotion only scales the gain (frustrated → eases sooner, bored → ramps sooner, confused → neutral). Behavioural contract in `tests/test_intra_controller.py`. Output `intra_difficulty` (1–3) drives `select_spec` params + `INTRA_KNOBS` (node count, distractor count/similarity, blanks, bug subtlety) in `question_spec.py` / `static_questions.py`.
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
| `question_attempts` | session_id, question_id, difficulty, passed, error_count, error_type, error_concept, **intra_difficulty, scaffold_level, emotion** (state-axis telemetry), **variant** (content-variant tag: `blanksN`/`bugN-sK`/`pool:<hash8>`, null for live-AI questions) |
| `question_pool` | operation, question_type, intra_difficulty, payload (JSON), content_hash (unique, pedagogical identity — not node values), times_served — class-shared pre-generated AI questions; serving excludes only the student's own attempted question_ids |
| `mastery` | user_id, operation, module_id, attempts, passes, consecutive_passes, perfect_pass, type_unlocked, **active_type_level** |
| `concept_mastery` | user_id, concept, mastery (0–1 float), attempts — Bayesian-style per-concept posterior |
| `mistakes` | user_id, question_id, source, title, your_answer (JSON), correct_answer (JSON), explanation, created_at |
| `emotion_logs` | user_id, session_id (SET NULL on session delete), emotion, source, confidence, signals (JSON), action_taken, **outcome (JSON)** — closed-loop: the question result is written back onto interventions when the attempt is recorded; tutor_chat rows carry `signals.last_message_id` linking the label to the stored transcript |
| `tutor_conversations` | user_id, session_id (SET NULL on session delete), operation, question_title, message_count, **summary/key_struggles/resolved** (episodic layer), **compact_summary/compacted_through_id** (working-memory view); UNIQUE (session_id, question_title) |
| `tutor_messages` | conversation_id, role, content, created_at — verbatim append-only transcript (clean text; prompt wrappers are never stored) |

**Note**: `mistakes.title` matches `q.title` sent from the frontend. Filter by `title == question_title` to get operation-specific history. `your_answer` may be an empty list for early-stage wrong attempts — skip these when building tutor context.

## Key Conventions

- **Pseudocode naming** (`tests/test_pointer_naming.py` locks all of it in; `question_registry._sll_reject_reason` hard-rejects violations in AI output — code fields only, so "the last node" in an explanation is fine):
  - Traversal pointer is `curr` everywhere a student can see code — TEMPLATES, distractors, blanks, bugs, the hint animation's cursor label, tutorial slides. Never `node` / `cur` / `current` / `p`. `newNode` / `createNode` are unaffected.
  - Target position is `index`, never `position` / `pos` / `k`. Indices are **0-based**, matching the labels under the nodes.
  - `{value}` in TEMPLATES is a **placeholder** for the operation's payload, substituted by `static_questions.instantiate()` at payload assembly (`_enrich` for AI paths, the return of each static generator) so students read `createNode(35)`. `index` deliberately stays symbolic — `index-1` is the off-by-one rule being taught, and `3-1` lets them compute the answer without learning it.
  - Everything upstream of `instantiate` (prompts, validators, alias analysis, `content_hash`) works on the symbolic form. `question_pool.content_hash` masks `createNode(<n>)` before hashing — the payload literal is re-rolled per build and would otherwise defeat pool dedup.
- All API routes use `/api/<prefix>/` pattern
- Frontend calls backend directly (no Vite proxy) — `VITE_API_URL` sets the base
- Frontend uses `/api/ai/tutor/stream` (SSE) for tutor chat, not the non-streaming endpoint
- `consecutive_passes` in `Mastery` = consecutive **perfect** passes (error_count == 0)
- When creating a new `Mastery` record, always pass `type_unlocked=1` and `active_type_level=1` explicitly — SQLAlchemy `default=` doesn't apply at Python object creation
- `backend/main.py` (root level) is the uvicorn entry point; `backend/app/main.py` is the same app for import use
- Alembic migrations live in `backend/alembic/versions/` — run from `backend/` directory

## Supported Operations (12 total)

`insertAtHead`, `insertAtTail`, `removeAtHead`, `removeAtTail`, `insertIntoEmpty`, `deleteEntireList`, `insertAtPosition`, `removeAtPosition`, `reverseList`, `mergeSortedLists`, `detectCycle`, `sortList`

## Skill Routing

### Project skills (`.claude/skills/`)

| Situation | Skill |
|---|---|
| Need the app running (start backend/frontend, before QA or manual testing) | `/dev` |
| Edited `question_registry.py` prompts/validators, `static_questions.py` TEMPLATES, or `question_spec.py` | `/gen-check` (scope with `--ops`/`--types` — full sweep costs 24–72 Haiku calls) |
| Adding a new linked-list operation (touches ~10 files; never do this ad hoc) | `/add-operation` |
| Edited `tutor_agent.py` (system prompt, context block, tools, ReAct loop) | `/tutor-sim` (`--show-context` is free; full run ≈ 5–10 Haiku calls) |
| Tuned the adaptive system (`compute_intra_difficulty`, `useScaffold.js`, `emotion_agent`) or collected new play data | `/eval-adaptivity` (DB read-only, free) |

**Skill maintenance rule**: project skills reference real code. When a change touches a surface a skill depends on, update the skill **in the same change**:
- Renaming/moving per-op registries (`TEMPLATES`/`_BLANKS`/`_BUGS`, `OP_META`, `LEVEL_OPS`, `_opLevel()`, animation/step switches) → edit `/add-operation`'s checklist
- Changing signatures in `claude_service.py`/`question_registry.py`/`question_spec.py` or `tutor_agent.chat()` → run `/gen-check` / `/tutor-sim` (they import the real code, so drift fails loudly) and fix the script
- Adding a question type, emotion label, or tutor rule → extend `gen_check.py` `AI_TYPES` / `tutor_sim.py` `SCENARIOS` / `/eval-adaptivity`'s interpretation table

### gstack skills (globally installed at `~/.claude/skills/gstack/`)

- Bugs, 500 errors, "why is this broken" → `/investigate`
- Test the site, find bugs, browser QA against localhost:5173 → `/qa` (report-only: `/qa-only`); web browsing → `/browse`
- Ship, push, create PR → `/ship`; check my diff → `/review`
- Docs out of sync after shipping → `/document-release`
- Save/resume work across sessions → `/context-save` / `/context-restore`

## Backend Identity Rule

Every route that needs the caller's identity MUST take it from `Depends(get_current_user)` (`app/dependencies.py`). NEVER read `user_id` from the request body, query params, or URL path — a client can send anyone's id there. Admin-only routes use `Depends(require_admin)` (`app/routes/admin.py`).

## Schema Change Rule

Any edit to `app/models/` requires an Alembic migration in the same change: from `backend/`, run `alembic revision --autogenerate -m "..."`, review the generated diff by hand (autogenerate misses renames), then `alembic upgrade head`. Never alter tables directly in the DB.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. Route only to skills in the session's available-skills list; answer directly for quick questions or small scoped edits.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
