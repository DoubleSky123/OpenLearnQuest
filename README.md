# OpenLearnQuest

An AI-powered adaptive learning system for linked list data structures. Students answer pseudocode questions — fill-in-the-blank, find-the-bug, step ordering — while a multi-component AI backend generates the questions, adapts difficulty, remembers what each student struggles with, and tutors them through their mistakes across sessions.

---

## Demo

**Stack**: React 19 + FastAPI + PostgreSQL + Anthropic Claude Haiku 4.5
**Local dev**: backend on `http://localhost:8001`, frontend on `http://localhost:5173`
**Tests**: 197 backend tests, in-memory SQLite fixtures, no Postgres required

---

## AI Agent Architecture

Four AI subsystems work together, each with a distinct role and design pattern:

| # | Subsystem | Pattern | LLM? |
|---|---|---|---|
| 1 | Question generator | Validate-and-retry loop + shared pool | Haiku (distractors only) |
| 2 | Socratic tutor | ReAct loop with tool use | Haiku |
| 3 | Tutor memory | Three-layer memory with read-time forgetting | Haiku (summaries only) |
| 4 | Adaptive engine | Deterministic two-axis controller | No — pure Python/JS |

The dividing line throughout: **LLMs write natural language and wrong answers; Python writes correct answers and makes progression decisions.**

---

### 1. Question Generator — Retry Loop (Agentic)

**Pattern**: Validate-and-retry loop

The generator does not call Claude once and return the result. It runs a loop:

```
select_spec()          → QuestionSpec (type + intra-difficulty + params)
     ↓
Claude Haiku call      → generates ONLY wrong options (never the answer)
     ↓
Python validator       → schema + semantic + SLL-constraint checks
     ↓
if invalid → retry (up to 3×) with the exact error fed back into the prompt
     ↓
Python assembles       → correct pseudocode from TEMPLATES + AI distractors
     ↓
instantiate()          → substitutes the payload literal (createNode(35))
```

**Key design decision**: correct pseudocode always comes from `static_questions.py` (the deterministic `TEMPLATES` dict), never from Claude. Claude only produces `distractors`, `buggy_line`, `wrong_options`, and `hint`. This makes hallucinated *correct* answers structurally impossible while keeping distractors creative and varied.

**Why this counts as agentic**: the system evaluates its own output and, on failure, modifies its behaviour (adjusted prompt, retry) without human intervention. The loop terminates on valid output or exhausted retries.

#### Validation Pipeline (four layers)

Each question type has its own validator in `question_registry.py`.

**Layer 1 — Parsing & normalisation**
- Extract JSON from Claude's raw response (strips markdown fences, finds `{...}`)
- Unicode operator normalisation: `≠` → `!=`, `≤` → `<=`, `≥` → `>=`, `→` → `->`

**Layer 2 — Schema checks** (all types) — required fields present, types correct

**Layer 3 — Semantic correctness** (per type)

| Type | Checks |
|---|---|
| `ordering` | Distractors ≠ any correct step; no duplicates |
| `fill_blank` | `blanks` length == `pseudocode` length; `answer` ∈ `options`; exactly one `___` per step |
| `find_bug` | Buggy line ≠ correct line; **alias substitution equivalence check**; `wrong_options` ≠ other correct steps; all options distinct |

The `find_bug` alias check is the subtlest: it builds an alias map from the other pseudocode steps (if step 0 is `newNode = createNode(v)`, then `newNode → createNode(v)`), substitutes aliases in both the buggy and correct line, and rejects "bugs" that are semantically identical to the correct code under a different name.

**Layer 4 — Singly-linked-list + naming constraints** (all types)
- No `tail` variable (a singly linked list has no tail pointer)
- No `.prev` field (except `reverseList`)
- No Pascal-style `do` keyword
- Traversal pointer must be `curr` (never `node` / `cur` / `current` / `p`); target position must be `index` (never `pos` / `k`). Enforced by `_sll_reject_reason` on code fields only — prose in explanations is unaffected.

**Retry with error feedback**: on failure the exact error message is appended to the next prompt:
```python
prompt += f"\n\nPrevious attempt failed: {last_error}\nReturn valid JSON only."
```

**No silent static fallback in the pool path**: `generate_validated()` deliberately has no static fallback, so a broken prompt fails loudly instead of quietly poisoning the question pool with template questions.

#### Question Pool — class-shared pre-generation

Live Haiku generation on the critical path costs the student 2–4 seconds per question. `question_pool.py` moves that cost offline:

```
refill_pool.py --ops all        → fills question_pool up to 5 rows
                                  per (operation, type, intra_difficulty)
     ↓
serving: pick an unattempted row → payload returned in ~10ms
     ↓
below LOW_WATER (3)?            → background daemon thread tops it up
                                  (own DB session; never blocks the request)
```

- **Rows are class-shared, not consumed**: serving increments `times_served`; a student is excluded only from questions *they personally* attempted (via `question_attempts.question_id`).
- **`content_hash` is pedagogical identity, not payload equality**: the node literal (`createNode(35)`) is re-rolled on every build and is masked before hashing, otherwise two rows holding the same bug would hash differently and dedup would never fire. The intra tier *is* part of the key — small operations legitimately reuse a distractor set across tiers, and without the tier whichever tier pooled first would starve the others.
- **`fill_blank` is never pooled** — it is static and instant, so pooling would add nothing.
- **Staleness rule**: pool payloads embed TEMPLATES content (pseudocode, step hints) at generation time. After editing an operation's template, regenerate: `refill_pool.py --ops <op> --purge`.

**Built-in evaluation endpoint**: `POST /api/gm/test-generation?operation=insertAtHead&n=10` generates N questions and reports per-attempt pass/fail plus an overall pass rate. The `/gen-check` skill wraps this into a full sweep across operations × types.

#### Content variants

Every operation ships multiple authored variants so a student replaying it does not see the same board: 3 subtlety-tiered bugs (`bug<N>-s<K>`) and 4 blank sets (`blanks<N>`) per operation, rotated deterministically. The chosen variant is recorded on `question_attempts.variant` (`pool:<hash8>` for pooled AI questions, `null` for live generation) so content diversity is measurable rather than assumed.

---

### 2. Socratic Tutor Agent — ReAct Loop

**Pattern**: ReAct (Reason + Act) with tool use, max 3 iterations

```
Student message received
     ↓
[Iteration 1] Claude reasons + may call lookup_resource
     ├── stop_reason == "end_turn"  → return response
     └── stop_reason == "tool_use"  → execute tool, append result
          ↓
     [Iteration 2] Claude incorporates the tool result → responds
```
Streaming (`POST /api/ai/tutor/stream`, SSE) yields tokens as they arrive; a tool call shows as a ~500ms pause before streaming resumes.

**Tool: `lookup_resource(concept, reason)`**
Queries `CONCEPT_RESOURCE_LIBRARY` — curated beginner videos organised by **concept**, not by operation:

| Concept | What it addresses |
|---|---|
| `pointer_assignment` | Pointer reassignment order, lost-node bugs |
| `traversal` | While-loop stop conditions, stop-before-target |
| `memory_management` | Null-out pointers, dangling refs |
| `node_creation` | New node fields, initialisation |
| `list_structure` | Reverse, merge, cycle, sort patterns |

**Why concept-based**: a student stuck on `pointer_assignment` in `insertAtHead` has the same conceptual gap as one stuck in `reverseList`. Mapping to the concept makes recommendations reusable and the library small.

**Claude decides when to call it** — that autonomy is the agentic part. Measured behaviour: fires 4/4 when the student is genuinely stuck, 0/3 when they are making progress. Capped at once per conversation.

#### Two phases: `solving` vs `reviewing`

`TutorRequest.phase` (client-sent; unknown values fall back to `solving`, so a stale client can never unlock answer reveal) selects the system prompt:

| | `solving` (exercise open) | `reviewing` (analysis card up) |
|---|---|---|
| Concepts, tangents, casual chat | free | free |
| This exercise's answer (step order / blank token / bug line) | withheld — **including in plain English**; "first create it, then connect it, then move head" leaks as much as the code | already on the student's screen, so explain it outright |

Without the second phase the tutor answered the analysis card's own follow-up question with "let's focus on…" — withholding an answer the student could already read.

#### Prompt design rule: stay lean

The whole tutor is *"a simple Socratic guide, plus a video when guiding stalls."* A shared role paragraph plus one short phase paragraph is the entire prompt, and it stays that way on purpose. An earlier version grew one rule per observed failure and broke in worse ways than the bugs it fixed:

- Mandating a `"Right —"` / `"Not quite —"` opener made the tutor **grade the student's questions**.
- Over-stressing "never answer with a video" stopped `lookup_resource` firing **at all** (0/4 on a stuck student), killing a deliberate feature.
- A "≤ 2 sentences" cap was the *cause* of unreadable phrasing — everything got crammed into one clause-stacked sentence.

The one exception is tool use: models reliably under-call tools from descriptive guidance, so a per-turn imperative note is injected in `build_api_messages()`. Style guidance lives in the system prompt; tool policy has to be re-stated every turn, because the first-turn prompt is forgotten by turn 3.

#### Type-aware context and the board channel

`build_context_block()` adapts its vocabulary to the question type — `fill_blank` → "the blank / the value that belongs here", `find_bug` → "the line", `ordering` → "the step order" — so the tutor never says "assembly" on a fill-in-the-blank question. A `board_note` channel additionally tells the tutor *where the student is right now* on the board (which blank has focus, which line they suspect), lifted from the client on every turn.

---

### 3. Tutor Memory — Three Layers

`tutor_memory.py`. Storage is always verbatim; **forgetting happens at read time, never by deleting rows.**

**Layer 1 — Working memory (per question)**
Every turn is persisted to `tutor_messages` as clean text (prompt wrappers are never stored). The DB is the authoritative history whenever `session_id` is present; the client's `messages` array is a legacy fallback. Streaming replies are saved *before* `[DONE]`, because the client's `onDone` immediately calls emotion inference, which reads the DB. Window restore: `GET /api/ai/tutor/history?session_id&question_title`.

**Layer 2 — Compaction (a view, not storage)**
When a conversation exceeds 20 uncompacted messages, the oldest are compressed into `compact_summary` and the last 8 are kept verbatim. What Claude receives = recap pair + verbatim tail. What is stored stays complete.

**Layer 3 — Episodic memory (cross-question)**
After a question attempt is recorded, a background task writes `summary` + `key_struggles` (concepts validated against the concept graph) + `resolved` (backfilled from the actual attempt result — never LLM-guessed). Retrieval is deterministic with decay:

```
concept overlap via OP_CONCEPTS
  → mastery fading (skip concepts already ≥ 0.75)
  → unresolved struggles first
  → LIMIT 3
```

These land in the first turn's `[PAST TUTOR CONVERSATIONS]` block.

**Memory invariants**: `summary = NULL` means "not yet summarised" and is retried; `summary = ""` means "summarised, nothing worth remembering". Memory belongs to the user, so `session_id` is `SET NULL` on delete — memories survive session deletion. Every LLM call in this module is non-critical: a failure degrades to "no summary" and never blocks tutoring.

---

### 4. Context Engineering

The tutor's context is assembled fresh on every first turn:

```
[TUTOR CONTEXT]
Operation: Insert at Head (insertAtHead)
Student assembled: head = newNode → newNode.next = head
Correct order: newNode.next = head → head = newNode
Mistakes so far this session: 2
Where the student is RIGHT NOW: focused on step 1

[STUDENT HISTORY — cross-session, from mistake book]
Past performance on insertAtHead: 8 attempts, 3 passes (37%), streak: 0
Recurring wrong answers:
  - head = newNode → newNode.next = head   ← same mistake, 3 sessions ago

[PAST TUTOR CONVERSATIONS]
  - reverseList: still unclear on why the order of the two reassignments matters

[ERROR DIAGNOSIS — deterministic analysis]
error_type:    wrong_order
error_concept: pointer_assignment
detail:        Position 1: placed 'head = newNode', correct is 'newNode.next = head'
[INSTRUCTION] Ask ONE Socratic question specifically about 'pointer_assignment'

[END CONTEXT]
```

**Four sources, deliberately mixed:**

1. **Current state** — operation, the student's attempt, correct order, session error count, live board focus
2. **Cross-session history** — `mistakes` table (last 5 matching `title == question_title`, skipping empty answers) + `mastery` table (lifetime attempts/passes/streak)
3. **Episodic memory** — past tutor conversations, filtered by concept overlap and mastery decay
4. **Deterministic diagnosis** — `error_analyzer.py` classifies the error into concept + error_type + confidence with pure Python rules, injected as a high-reliability signal so Claude knows exactly which concept to probe

**Multi-turn refresh**: on turns 2+, a short `[Context refresh]` block replaces the full context — updating error count and current attempt without re-sending history.

**Why context engineering over fine-tuning**: mistake history, mastery stats, and the current diagnosis are per-user data that changes by the minute. Injecting structured context at inference time gives the model what it needs without retraining.

---

### 5. Proactive Push — Push vs Pull

**Problem with vanilla chatbots**: the student must initiate. If they never open the tutor, no AI help ever happens. That is a pure pull model, and struggling students are exactly the ones least likely to ask.

**Solution**: when the scaffold level reaches the Socratic band (driven by errors + emotion — see §6), the backend is called automatically, with no student action:

```
Student's scaffold level reaches 2
     ↓
Frontend fires streamTutorChat() in the background
     ↓
Backend: build_api_messages() injects full context + student history
Claude: reasons → may call lookup_resource → produces one Socratic observation
     ↓
Toast slides in from bottom-right (10s auto-dismiss)
     ↓
Student clicks "Open Chat →" → TutorChat opens with the message pre-loaded
```

The kick-off message is type-specific (`PROACTIVE_INIT_BY_TYPE`), so the tutor opens by asking about *the blank*, *the line*, or *the step order* rather than a generic "need help?".

**Constraints**: fires exactly once per question, never while the tutor is already open, resets on every new question.

---

### 6. Two-Axis Adaptive System

Difficulty is decomposed into **two orthogonal axes** so a transient mood never overrides earned skill.

**Competence axis → question TYPE** (deterministic, earned, monotonic)
```
mastery.type_unlocked ∈ {1, 2, 3}  →  fill_blank / find_bug / ordering
consecutive perfect passes ≥ 1     →  unlock find_bug
consecutive perfect passes ≥ 2     →  unlock ordering
any error resets the streak; type_unlocked never decreases
```
Students **choose when to advance**. `type_unlocked` is the ceiling (what has been earned); `active_type_level` (≤ ceiling, persisted per operation) is what they are actually practicing and is what drives the question type. On unlock a non-dismissing popup offers *Try the new type* or *Keep practicing*, and a persistent 🔓 Level Up button lets them advance any time. Unlocking is an invitation, not a forced jump.

**State axis → within-type difficulty + scaffolding** (driven by inferred emotion)

- **ZPD difficulty controller** (`_intra_from_history`, pure; `compute_intra_difficulty` is the DB wrapper): targets a ~25–30% error rate via **EMA + hysteresis** — dead zone 0.22–0.40, two consecutive confirmations, one level per move. This replaced a windowed-rate version that oscillated. Emotion only scales the control *gain* (frustrated eases sooner, bored ramps sooner, confused is neutral); the naïve "bored → harder / frustrated → easier" mapping is unsound. Output `intra_difficulty` ∈ {1,2,3} drives `select_spec` params and `INTRA_KNOBS` (node count, distractor count and similarity, number of blanks, bug subtlety).
- **Scaffold orchestrator** (`useScaffold.js`): `scaffold_level = emotion baseline + per-error climb − mastery fading cap`, escalating error-highlight → Socratic hint / proactive push → animation → near-reveal. **Confused raises scaffolding but keeps difficulty; frustrated lowers difficulty** (D'Mello affect dynamics). The client-computed level is **clamped server-side** (`game_master.clamp_scaffold`) — never trust client telemetry.

Emotion is inferred **every question** (instant behavioural rules) and from tutor chat (LLM), each with a confidence that weights its influence. Per-question telemetry (`intra_difficulty` / `scaffold_level` / `emotion` / `variant`) is written to `question_attempts`, and interventions in `emotion_logs` get the question result written back onto them (`outcome`) to close the loop. `analytics/difficulty_eval.py` is the offline evaluator: intervention-success rate, emotion-transition matrix, difficulty-oscillation rate.

**Why deterministic here**: progression and control loops must be explainable, predictable, and stable. An LLM would add variance and latency to a well-defined rule. **Why LLM for tutoring**: natural-language guidance has to understand a specific mistake and adapt tone — exactly where LLMs beat rules.

**Grounded in**: ZPD / Flow (desirable difficulty), D'Mello & Graesser affect dynamics, Wood's contingent scaffolding + fading, Kalyuga's expertise-reversal effect.

---

### 7. Post-Question Feedback

**Analysis card** (`AnalysisCard.jsx`) — non-blocking, LeetCode-style. Opened from the 📊 button in the pass strip, it floats bottom-left so the board stays readable; it is never a modal. Information architecture: verdict banner → status chips → labeled sections (concept mastery deltas, speed) → one "Consider" extension question wired straight into the tutor in `reviewing` phase.

**Step hints** — one authored hint table in `TEMPLATES`, shared by all three question types. For ordering, `selectOrderingHint` anchors on the first wrong position against the *closest* valid order and picks one of three responses: name a foreign distractor → escalate to an operation-level hint when the board is mostly wrong (chaos signals a concept gap, not a step slip) → otherwise the misplaced step's own hint.

**Animation hint** (`LinkedListHintAnimation.jsx`) — always available, no error threshold, no AI. A per-node CSS transition walks the operation step-by-step with a `curr` cursor. In `fill_blank` the same primitives animate **each step as the student fills it** (`fillBlankSteps.js` → `computeStepStates`), rather than one animation at the end.

---

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                          Frontend                             │
│  AgenticSession.jsx ──┬── TutorChat.jsx  ── TutorToast.jsx    │
│    useScaffold.js     ├── AnalysisCard.jsx (Consider →tutor)  │
│    prefetch/timing    └── FillBlank/FindBug/AssemblyArea      │
└──────────────────────────────────────────────────────────────┘
       │  /api/gm/*                     │  /api/ai/tutor/stream
┌──────▼─────────────────────────────────▼─────────────────────┐
│                          Backend                              │
│                                                               │
│  game_master.py            tutor_agent.py                     │
│  ┌──────────────────┐      ┌───────────────────────────┐      │
│  │ select_spec      │      │ build_context_block()     │      │
│  │ question_pool ◄──┼──┐   │  ├─ current state + board │      │
│  │ Claude call      │  │   │  ├─ cross-session history │      │
│  │ validator  ◄─retry│  │   │  ├─ episodic memories     │      │
│  │ assembler        │  │   │  └─ error diagnosis       │      │
│  │ update_mastery   │  │   │                           │      │
│  │ clamp_scaffold   │  │   │ ReAct loop:               │      │
│  └──────────────────┘  │   │  Claude → tool_use?       │      │
│                        │   │  → lookup_resource()      │      │
│  error_analyzer.py ────┼──►│  → final response         │      │
│  emotion_agent.py      │   └───────────┬───────────────┘      │
│  concept_graph.py      │               │                      │
│                   refill_pool.py   tutor_memory.py            │
│                   (offline/self-heal)  (persist/compact/recall)│
│                                                               │
│  PostgreSQL: mastery · concept_mastery · mistakes ·           │
│              emotion_logs · question_pool · question_attempts │
│              tutor_conversations · tutor_messages             │
└──────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS (state-machine navigation, no router) |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL |
| AI | Anthropic Claude Haiku 4.5 |
| Auth | JWT (python-jose) + bcrypt |
| Tests | pytest, in-memory SQLite fixtures |

---

## Getting Started

### Prerequisites
- Python 3.11+, Node.js 18+, PostgreSQL (`openlearnquest` database)
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
Any edit to `app/models/` requires a migration in the same change: `alembic revision --autogenerate -m "..."`, review the diff by hand (autogenerate misses renames), then `alembic upgrade head`. Never alter tables directly.

### Tests
```bash
cd backend
d:/openLearnquest/venv/Scripts/python.exe -m pytest tests/ -q     # 197 passed
```
Covers the deterministic core: `ll_executor`, mastery + unlock rules, `select_spec`, `error_analyzer`, the ZPD controller contract, the find-bug validator, pointer-naming conventions, content variants, question-pool dedup/serving, step hints, tutor context assembly, and scaffold-clamp / closed-loop telemetry integrity.

### Fill the question pool
```bash
cd backend
d:/openLearnquest/venv/Scripts/python.exe refill_pool.py --ops all
# scope it — a full run is 12 ops × 2 types × 3 tiers × target Haiku calls
d:/openLearnquest/venv/Scripts/python.exe refill_pool.py --ops reverseList --purge   # after a TEMPLATES edit
```

### Reset user data
```bash
d:/openLearnquest/venv/Scripts/python.exe backend/clear_user_data.py --apply
```

---

## Project Structure

```
backend/
  main.py                      # uvicorn entry point (run from backend/)
  refill_pool.py               # offline question-pool filler
  clear_user_data.py
  app/
    routes/                    # all prefixed /api/*
      auth.py                  # /api/auth
      game_master.py           # /api/gm       — session start/record/next/prefetch/level-up
      progress.py              # /api/progress — XP, mistakes, stats, leaderboard
      tutor.py                 # /api/ai/tutor — ReAct tutor (streaming + history)
      emotion.py               # /api/emotion  — behavioral + chat + self-report
      admin.py                 # /api/admin
    services/
      game_master.py           # orchestration, mastery update, ZPD controller, scaffold clamp
      question_spec.py         # type_unlocked × emotion × intra → QuestionSpec
      question_registry.py     # per-type prompt builders + validators
      question_pool.py         # class-shared pool: serving, dedup, self-heal refill
      static_questions.py      # TEMPLATES: correct pseudocode + step hints for all 12 ops
      claude_service.py        # Claude API wrapper with retry
      tutor_agent.py           # ReAct loop, tools, context engineering, phase prompts
      tutor_memory.py          # persistence, view compaction, episodic recall
      error_analyzer.py        # deterministic error diagnosis
      ll_executor.py           # simulates operations for goal patterns
      concept_graph.py         # concept dependency graph per operation
      emotion_agent.py         # behavioral signal → emotion label
    analytics/
      difficulty_eval.py       # offline eval: transition matrix, intervention success, oscillation
    models/ schemas/ alembic/
  tests/                       # 197 tests, in-memory SQLite

frontend/src/
  App.jsx                      # state-machine router (no react-router)
  components/
    AgenticSession.jsx         # main game loop: prefetch, timing, proactive push, scaffold
    TutorChat.jsx              # streaming tutor sidebar (ReAct client, type- and phase-aware)
    TutorToast.jsx             # proactive hint toast
    AnalysisCard.jsx           # post-question analysis (non-blocking, LC-style)
    UnlockPopup.jsx            # level-up choice (advance / keep practicing)
    LinkedListHintAnimation.jsx# CSS animation hint; AnimNode/Arrow reused by FillBlankBoard
    FillBlankBoard.jsx         # fill-in-the-blank with per-step animation
    FindBugBoard.jsx  AssemblyArea.jsx  MistakeBook.jsx  AdminDashboard.jsx
  hooks/
    useScaffold.js             # scaffold-level orchestrator (emotion + errors + mastery cap)
  services/
    api.js                     # all API calls including streamTutorChat()
    fillBlankSteps.js          # per-operation per-step list states
    stepHints.js               # ordering hint selection (pure)
    adaptiveEngine.js
  contexts/
    AuthContext.jsx  EmotionContext.jsx
```

---

## Supported Operations (12 total)

`insertAtHead` · `insertAtTail` · `removeAtHead` · `removeAtTail` · `insertIntoEmpty` · `deleteEntireList` · `insertAtPosition` · `removeAtPosition` · `reverseList` · `mergeSortedLists` · `detectCycle` · `sortList`

Adding a thirteenth touches ~10 files across backend and frontend (templates, blanks, bugs, executor, concept graph, level tiers, animations, step states) — the `/add-operation` skill is the checklist.

---

## Conventions

**Pseudocode naming** (locked in by `tests/test_pointer_naming.py`, enforced on AI output by `question_registry._sll_reject_reason`)
- The traversal pointer is `curr` everywhere a student can see code — templates, distractors, blanks, bugs, the animation cursor label, tutorial slides. Never `node` / `cur` / `current` / `p`. `newNode` / `createNode` are unaffected.
- The target position is `index`, never `position` / `pos` / `k`. Indices are **0-based**, matching the labels under the nodes.
- `{value}` in TEMPLATES is a placeholder substituted at payload assembly, so students read `createNode(35)`. `index` deliberately stays symbolic — `index-1` *is* the off-by-one rule being taught, and `3-1` would let them compute the answer without learning it.
- Everything upstream of `instantiate` (prompts, validators, alias analysis, `content_hash`) works on the symbolic form.

**Identity**: every route that needs the caller's identity takes it from `Depends(get_current_user)`. Never read `user_id` from the body, query, or path — a client can send anyone's id there. Admin routes use `Depends(require_admin)`.

**Other**: all routes follow `/api/<prefix>/`; the frontend calls the backend directly (no Vite proxy); `consecutive_passes` counts consecutive *perfect* passes (`error_count == 0`); when creating a `Mastery` row, pass `type_unlocked=1` and `active_type_level=1` explicitly (SQLAlchemy `default=` does not apply at Python object creation).

---

## Development Skills

Project skills live in `.claude/skills/` and import the real code, so drift fails loudly.

| Situation | Skill |
|---|---|
| Need the app running (before QA or manual testing) | `/dev` |
| Edited generation prompts, validators, TEMPLATES, or specs | `/gen-check` |
| Adding a new linked-list operation | `/add-operation` |
| Edited `tutor_agent.py` | `/tutor-sim` |
| Tuned the adaptive system or collected new play data | `/eval-adaptivity` |

When a change touches a surface a skill depends on, update the skill in the same change.

---

## Design Decisions

**Why ReAct for the tutor, not Planner+Executor?**
The tutor's job is reactive and single-step per turn: receive a student message, respond. There is no multi-step plan to execute. ReAct is the right pattern when tool use is conditional and the decision horizon is one turn.

**Why deterministic difficulty rules instead of an LLM Game Master?**
Which question type comes next, and how hard it is, must be explainable and auditable. A control loop with hysteresis is testable (`test_intra_controller.py` asserts the behavioural contract); an LLM would add latency and variance to a rule that is already well defined.

**Why a class-shared pool instead of per-student generation?**
Latency and cost. Pre-generating means the student waits ~10ms instead of ~3s, and one Haiku call serves a whole class. Sharing is safe because exclusion is per-student (own attempts) rather than per-row consumption, and `content_hash` keeps the pool pedagogically diverse rather than merely numerous.

**Why concept-based resources instead of operation-based?**
Two operations often need the same conceptual fix. Mapping to `pointer_assignment` or `traversal` rather than `insertAtHead` or `reverseList` makes recommendations more accurate and keeps the library small.

**Why forget at read time instead of deleting memories?**
Deleting is irreversible and gets the policy wrong permanently. Filtering at retrieval — mastery fading, unresolved-first, concept overlap — means the forgetting policy can be tuned, evaluated, and reversed, while the transcript stays complete for analysis.

**Why context engineering over fine-tuning?**
Mistake history, mastery stats, and the current diagnosis are dynamic per-user data that cannot be baked into weights. Structured context at inference time gives the model what it needs without retraining.
