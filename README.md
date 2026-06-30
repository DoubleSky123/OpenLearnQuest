# OpenLearnQuest

An AI-powered adaptive learning system for linked list data structures. Students answer pseudocode assembly questions; a multi-component AI backend adjusts difficulty, generates questions, and tutors students through mistakes — across sessions.

---

## Demo

**Stack**: React 19 + FastAPI + PostgreSQL + Anthropic Claude Haiku 4.5  
**Local dev**: backend on `http://localhost:8001`, frontend on `http://localhost:5173`

---

## AI Agent Architecture

This is the core of the system. Three AI components work together, each with a distinct role and design pattern.

---

### 1. Question Generator — Retry Loop (Agentic)

**Pattern**: Validate-and-retry loop (the most genuinely "agentic" part of the system)

The question generator does not simply call Claude once and return the result. It runs a loop:

```
select_spec()          → QuestionSpec (type + difficulty)
     ↓
Claude Haiku call      → generates ONLY wrong options (not the answer)
     ↓
Python validator       → checks semantic correctness
     ↓
if invalid → retry (up to 3×) with adjusted prompt
     ↓
Python assembles       → correct pseudocode from TEMPLATES + AI-generated distractors
```

**Key design decision**: Correct pseudocode always comes from `static_questions.py` (deterministic `TEMPLATES` dict), never from Claude. Claude only generates wrong options (`distractors`, `buggy_line`, etc.). This eliminates hallucination of incorrect answers while keeping distractor generation creative and varied.

**Why this counts as agentic**: The system has a feedback loop — it evaluates its own output, and on failure, modifies its behavior (adjusts prompt, retries) without human intervention. The loop terminates when it produces valid output or exhausts retries.

#### Validation Pipeline (multi-layer)

Each question type has its own validator in `question_registry.py`. Validation runs in four layers:

**Layer 1 — Parsing & normalisation**
- Extract JSON from Claude's raw response (strips markdown fences, finds `{...}`)
- Unicode operator normalisation: `≠→!=`, `≤→<=`, `≥→>=`, `→->>`

**Layer 2 — Schema checks** (all types)
- Required fields present
- Type correctness (list, int, string)

**Layer 3 — Semantic correctness** (per type)

| Type | Checks |
|---|---|
| `ordering` | Distractors ≠ any correct step; no duplicates |
| `fill_blank` | `blanks` length == `pseudocode` length; `answer` in `options`; exactly one `___` per step |
| `find_bug` | Buggy line ≠ correct line; **alias substitution equivalence check**; `wrong_options` ≠ other correct steps; all options distinct |

The `find_bug` alias check is the most sophisticated: it builds an alias map from the other pseudocode steps (e.g. if step 0 is `newNode = create(val)`, then `newNode → create(val)`), then substitutes aliases in both the buggy line and the correct line to catch semantic equivalents that differ only in variable naming.

**Layer 4 — SLL constraint check** (all types)
- No `tail` variable (singly linked lists have no tail pointer)
- No `.prev` field (except `reverseList`)
- No Pascal-style `do` keyword

**Retry with error feedback**: On failure, the exact error message is appended to the next prompt:
```python
prompt += f"\n\nPrevious attempt failed: {last_error}\nReturn valid JSON only."
```

**Static fallback**: `fill_blank` always uses static templates (AI is unreliable for this highly structured task). `find_bug` / `ordering` fall back to static after 3 failed retries.

**Built-in evaluation endpoint**: `GET /api/gm/test-generation?operation=insertAtHead&n=10` runs `run_generation_test()` — generates N questions, reports per-attempt pass/fail and overall pass rate. Used during development to measure generation reliability.

---

### 2. Socratic Tutor Agent — ReAct Loop

**Pattern**: ReAct (Reason + Act) with tool use

The tutor is a multi-turn conversational agent that uses a ReAct loop: Claude reasons about the student's error, optionally calls a tool, observes the result, then responds.

```
Student message received
     ↓
[Iteration 1] Claude reasons + may call lookup_resource
     ├── stop_reason == "end_turn"   → return response
     └── stop_reason == "tool_use"  → execute tool, append result
          ↓
     [Iteration 2] Claude incorporates tool result → respond
```

**Tool: `lookup_resource(concept, reason)`**  
Queries `CONCEPT_RESOURCE_LIBRARY` — a static dict of curated NeetCode videos organised by **concept** (not by operation):

| Concept | What it addresses |
|---|---|
| `pointer_assignment` | Pointer reassignment order, lost-node bugs |
| `traversal` | While-loop stop conditions |
| `memory_management` | Null-out pointers, dangling refs |
| `node_creation` | New node initialisation |
| `list_structure` | Reverse, merge, cycle, sort patterns |

**Why concept-based, not operation-based**: A student struggling with `pointer_assignment` on `insertAtHead` has the same conceptual gap as one struggling on `reverseList`. Mapping to concept rather than operation makes the resource recommendation more accurate and reusable.

**Claude decides autonomously** when to call the tool (when error_count ≥ 2 or student is stuck 3+ exchanges). This is the key distinction from a hardcoded trigger — the model reasons about whether a resource is needed.

**Constraint**: Tool is called at most once per conversation (enforced via system prompt instruction). Prevents over-recommendation.

---

### 3. Proactive Push — Push vs Pull Architecture

**Problem with vanilla chatbots**: The student must initiate. If they don't open the tutor, no AI assistance occurs. This is a pure pull model.

**Solution**: When the scaffold level reaches the Socratic band (driven by errors + emotion — see §5), the backend is called automatically (without student action). Claude generates a targeted Socratic observation, phrased for the current question **type** (blank / buggy line / step order). This is delivered as a toast notification.

```
Student submits 2nd wrong answer
     ↓
Frontend fires streamTutorChat() in background (no student action)
     ↓
Backend: build_api_messages() injects full context + student history
Claude: reasons → may call lookup_resource → produces Socratic message
     ↓
Toast slides in from bottom-right (10s auto-dismiss)
     ↓
Student clicks "Open Chat →" → TutorChat opens with message pre-loaded
```

**Design constraints**:
- Fires exactly once per question (tracked via `proactiveTriggeredRef`)
- Does not fire if TutorChat is already open
- Resets on every new question (`initBoard()`)
- Auto-dismisses in 10 seconds to avoid UI clutter

---

### 4. Context Engineering

The tutor agent's context is carefully assembled on every first turn of a conversation:

```
[TUTOR CONTEXT]
Operation: Insert at Head (insertAtHead)
Student assembled: head = newNode → newNode.next = head
Correct order: newNode.next = head → head = newNode
Mistakes so far this session: 2

[STUDENT HISTORY — cross-session, from mistake book]
Past performance on insertAtHead: 8 attempts, 3 passes (37%), streak: 0
Recurring wrong answers:
  - head = newNode → newNode.next = head   ← same mistake, 3 sessions ago

[ERROR DIAGNOSIS — deterministic analysis]
error_type:    wrong_order
error_concept: pointer_assignment
detail:        Position 1: placed 'head = newNode', correct is 'newNode.next = head'
[INSTRUCTION] Ask ONE Socratic question specifically about 'pointer_assignment'

[END CONTEXT]
```

**Three layers of context:**

1. **Current state** — operation, student's assembly, correct order, session error count  
2. **Cross-session history** — queried from `mistakes` table (last 5 mistakes matching `title == question_title`) and `mastery` table (lifetime attempts/passes/streak). This is what makes the tutor "remember" across sessions without in-memory state.  
3. **Deterministic error diagnosis** — `error_analyzer.py` classifies the student's error into concept + error_type + confidence purely with Python rules (no LLM). This is injected as a high-reliability signal so Claude knows exactly which pointer concept to ask about.

**Multi-turn context refresh**: On turns 2+, a `[Context refresh]` block replaces the full context block — updating error count and current attempt without re-sending the full history.

**Type-aware wording**: the context block adapts to the question type — for `fill_blank` it talks about "the blank / the value that belongs here", for `find_bug` "the line", for `ordering` "the step order" — so the tutor never says "assembly" on a fill-in-the-blank question.

---

### 5. Two-Axis Adaptive System

Difficulty is decomposed into **two orthogonal axes** so a transient mood never overrides earned skill.

**Competence axis → question TYPE** (deterministic, earned, monotonic)
```
mastery.type_unlocked ∈ {1, 2, 3}  →  fill_blank / find_bug / ordering
consecutive perfect passes ≥ 1     →  unlock find_bug
consecutive perfect passes ≥ 2     →  unlock ordering
any error resets the streak; type_unlocked never decreases
```
Students **choose when to advance**: on unlock, a non-dismissing popup offers *Try the new type* or *Keep practicing*, and a persistent 🔓 Level Up button lets them advance any time. The chosen level (`active_type_level`, ≤ ceiling, persisted per operation) is what drives the question type — unlocking is an invitation, not a forced jump.

**State axis → within-type difficulty + scaffolding** (driven by inferred emotion)
- **ZPD controller** (`compute_intra_difficulty`): targets a ~25–30% error rate; difficulty is driven by the recent error rate, with emotion only scaling the control gain (the naïve "bored→harder / frustrated→easier" mapping is unsound).
- **Scaffold orchestrator** (`useScaffold`): `scaffold_level = emotion baseline + per-error climb − mastery fading cap`; escalates error-highlight → Socratic hint → step animation → near-reveal. **confused raises scaffolding but keeps difficulty; frustrated lowers difficulty** (D'Mello affect dynamics).

Emotion is inferred **every question** (instant behavioral rules) and from tutor chat (LLM), each with a confidence that weights its influence. Per-question telemetry (`intra_difficulty` / `scaffold_level` / `emotion`) is logged; `analytics/difficulty_eval.py` computes intervention-success rate, emotion-transition matrix, and difficulty-oscillation rate.

**Why deterministic for the competence axis / control loop**: progression and difficulty must be explainable, predictable, and stable; an LLM would add variance and latency without benefit. **Why LLM for tutoring**: natural-language guidance needs to understand the specific mistake and adapt tone — tasks where LLMs outperform rules.

**Grounded in**: ZPD / Flow (desirable difficulty), D'Mello & Graesser affect dynamics, Wood's contingent scaffolding + fading, Kalyuga's expertise-reversal effect. See `docs/research-difficulty-adaptation.md` and `docs/report-phase2-ai-emotion.md`.

---

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                        Frontend                          │
│  AgenticSession.jsx  ←──────────── TutorChat.jsx        │
│        │                                 ↑               │
│   error_count=2 ──→ [background call]   │               │
│        │                 ↓               │               │
│   TutorToast.jsx ──→ "Open Chat"        │               │
└─────────────────────────────────────────────────────────┘
         │                                 │
    /api/gm/*                    /api/ai/tutor/stream
         │                                 │
┌────────▼─────────────────────────────────▼─────────────┐
│                        Backend                          │
│                                                         │
│  game_master.py          tutor_agent.py                 │
│  ┌─────────────┐         ┌────────────────────────┐     │
│  │ select_spec │         │  build_context_block() │     │
│  │ Claude call │         │  ├─ current state       │     │
│  │ validator   │←retry   │  ├─ student history DB  │     │
│  │ assembler   │         │  └─ error diagnosis     │     │
│  └─────────────┘         │                         │     │
│                          │  ReAct loop:            │     │
│  error_analyzer.py       │  Claude → tool_use?     │     │
│  ┌─────────────┐         │  → lookup_resource()    │     │
│  │ classify()  │────────→│  → final response       │     │
│  └─────────────┘         └────────────────────────┘     │
│                                                         │
│  PostgreSQL: mastery / mistakes / emotion_logs          │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL |
| AI | Anthropic Claude Haiku 4.5 |
| Auth | JWT (python-jose) + bcrypt |

---

## Getting Started

### Prerequisites
- Python 3.11+, Node.js 18+, PostgreSQL
- Python venv at `d:/openLearnquest/venv/`

### Backend
```bash
cd backend
d:/openLearnquest/venv/Scripts/uvicorn main:app --reload --port 8001
```

### Frontend
```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

### Environment files
- `backend/.env` — `DATABASE_URL`, `SECRET_KEY`, `ANTHROPIC_API_KEY`, `ADMIN_KEY`
- `frontend/.env` — `VITE_API_URL=http://localhost:8001`

> Port 8000 may be occupied by another project. Always use `--port 8001`.

### Migrations
```bash
cd backend
d:/openLearnquest/venv/Scripts/alembic upgrade head
```

### Reset user data
```bash
d:/openLearnquest/venv/Scripts/python.exe backend/clear_user_data.py --apply
```

---

## Project Structure

```
backend/
  main.py                      # uvicorn entry point
  app/
    routes/
      auth.py                  # /api/auth
      game_master.py           # /api/gm — question flow
      progress.py              # /api/progress — XP, mistakes
      tutor.py                 # /api/ai/tutor — ReAct tutor (streaming)
      emotion.py               # /api/emotion
      admin.py                 # /api/admin
    services/
      game_master.py           # question selection + mastery update
      tutor_agent.py           # ReAct loop, tools, context engineering
      error_analyzer.py        # deterministic error diagnosis
      question_registry.py     # per-type Claude prompt builders
      question_spec.py         # emotion × mastery → QuestionSpec
      static_questions.py      # TEMPLATES: correct pseudocode for all 12 ops
      concept_graph.py         # concept dependency graph
      emotion_agent.py         # behavioral signal → emotion label
      claude_service.py        # Claude API wrapper with retry
    analytics/
      difficulty_eval.py       # offline eval: transition matrix, intervention success, oscillation

frontend/src/
  components/
    AgenticSession.jsx         # main game loop + proactive push + scaffold orchestration
    TutorChat.jsx              # streaming tutor sidebar (ReAct client, type-aware)
    TutorToast.jsx             # proactive hint toast notification
    UnlockPopup.jsx            # level-up choice (advance / keep practicing)
    LinkedListHintAnimation.jsx # CSS animation hint (no AI); AnimNode reused by FillBlankBoard
    FillBlankBoard.jsx         # fill-in-the-blank with per-step animation
    FindBugBoard.jsx
    AssemblyArea.jsx
  hooks/
    useScaffold.js             # scaffold-level orchestrator (emotion + errors + mastery cap)
  services/
    api.js                     # all API calls including streamTutorChat()
    fillBlankSteps.js          # per-operation per-step linked-list states
    adaptiveEngine.js
```

---

## Supported Operations (12 total)

`insertAtHead` · `insertAtTail` · `removeAtHead` · `removeAtTail` · `insertIntoEmpty` · `deleteEntireList` · `insertAtPosition` · `removeAtPosition` · `reverseList` · `mergeSortedLists` · `detectCycle` · `sortList`

---

## Design Decisions

**Why ReAct for the tutor, not Planner+Executor?**  
The tutor's job is reactive and single-step per turn — it receives a student message and responds. There is no multi-step execution plan needed. ReAct is the appropriate pattern when tool use is conditional and the decision horizon is one turn.

**Why hardcoded difficulty rules instead of an LLM Game Master?**  
Difficulty decisions (which question type to give next) are structured and explainable. Mastery-based progression is predictable and auditable. An LLM would add latency and variance without improving learning outcomes for this well-defined rule.

**Why concept-based resource library instead of operation-based?**  
Two operations can require the same conceptual fix. Mapping resources to the underlying concept (`pointer_assignment`, `traversal`) rather than the surface operation (`insertAtHead`, `reverseList`) produces more accurate recommendations and reduces redundancy in the library.

**Why context engineering over fine-tuning?**  
The student's mistake history, mastery stats, and current error diagnosis are dynamic per-user data that cannot be baked into model weights. Injecting structured context at inference time gives the model the information it needs without retraining.
