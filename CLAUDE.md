# OpenLearnQuest — CLAUDE.md

## Project Overview

AI-driven linked-list learning game. Students answer questions (fill-in-the-blank, find-the-bug, ordering) about linked-list operations. An adaptive engine adjusts question type and difficulty based on mastery and emotional state.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy (PostgreSQL) + Alembic migrations + Anthropic SDK
- **Frontend**: React 19 + Vite + Tailwind CSS (no router — state-machine navigation)
- **AI**: Claude Haiku 5.5 (`claude-haiku-5-5`, since 2026-10-27) for question generation, tutor chat (ReAct loop with tool use), chat emotion inference and memory summaries. One constant: `anthropic_client.MODEL`. Haiku 5.5 thinks by default (`effort` per purpose in `anthropic_client.EFFORT`, thinking counts toward `max_tokens` → `THINKING_HEADROOM`), rejects `temperature`/`top_p`/`top_k` and assistant prefill, can start a response with thinking blocks (read replies with `anthropic_client.text_of()`, never `content[0].text`) and can decline (`stop_reason: "refusal"` → `RefusedError`, not retried). `tests/test_model_contract.py` pins all of it.

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

**Pool staleness rule**: pool payloads embed TEMPLATES content (pseudocode, step_hints) at generation time. After editing an operation's TEMPLATES entry, regenerate its pool rows: `refill_pool.py --ops <op> --purge`. Until you do, `question_pool.is_current` refuses to serve rows whose pseudocode no longer matches the template (and doesn't count them toward the low-water mark, so self-heal replaces them), and `_sanitize` runs the item harness on every served copy (drops wrong fixes that are actually correct, unusable distractors; recomputes `validOrders`). Rows are never edited (their payload; after changing the `content_hash` formula, `refill_pool.py --rehash` recomputes the key for free, or old rows stop deduplicating).

### Item harness — is the question worth asking? (`pseudo_exec.py`, `item_quality.py`)
The tutor harness guards the tutor's OUTPUT; this guards the INPUT. Every rule is decided by RUNNING the pseudocode (`pseudo_exec`: explicit heap, C semantics, outcomes `ok` / `compile_error` / `runtime_error`, leaks and dangling nodes, sortList must halve), never by a model:
- **R1** a fill_blank blank is a SEMANTIC slot (which pointer / node / condition). Never a fresh variable's name (`___ = head` → curr/temp/prev: any name works — the alpha-rename test), a field name, a function name or the payload.
- **R2** exactly one option is correct on every board (`curr.next.next` IS `temp.next` when temp == curr.next).
- **R3** no distractor can be ruled out by reading: it must fail by crashing or building the wrong list, not by naming a variable/field/function the program doesn't have (`.val`, `makeNode`, `newNode` in reverseList).
- Ordering: `validOrders` are COMPUTED (every permutation run; a step after an unconditional return doesn't count); a distractor must not be able to take any step's place in any order (the board has exactly n slots).
- Serve time: the generators re-check on the board the student actually sees — distractors that happen to work there are dropped, a find_bug board is re-rolled until the bug is visible (detectCycle boards are cyclic half the time).
- Gate: `tests/test_item_quality.py` (every authored item in `_BLANKS` / `_BUGS` / TEMPLATES `distractors`). AI find_bug/ordering output goes through the same checks in `question_registry` before it can enter the pool.
- Review: `python item_report.py [--all] [--ops <op>] [--pool]` prints what every option DOES when run — the teacher-readable review. `--pool` audits pool rows read-only.

When authoring content: answers blank their FIRST occurrence in the step (str.replace contract); order `w` strongest-first (intra 1 shows only `w[0]`); `None` = this set never blanks that step; TEMPLATES `crux` lists the steps blanked first when only a few are.

### Misconception diagnosis & remediation (`misconceptions.py`, `misconception_model.py`)
Design: `docs/designs/misconception-adaptivity-and-teachable-npc.md`; build plan: `docs/designs/misconception-npc-implementation.md` (local, gitignored).
- **Catalog** (`misconceptions.CATALOG`, 24 entries): each misconception = what a student holding it WRITES — a canonical mutant of the template per operation (`replace`/`swap`/`delete`; extra forms after the first). An option is tagged m iff its program's **behaviour fingerprint** (outcome, fault, final list, leaks, dangling, on every harness board) equals m's mutant. Execution decides, never a model; ~60% of authored wrong options are tagged, the rest are untagged (no evidence). `belief`/`correction` are student-facing prose with **no code** (they are the classmate's explanation choices too). Two misconceptions with the same fingerprint on an op are indistinguishable from an answer — the test fails; drop one (`curr = head.next` on the position ops IS stop-on-target).
- **Evidence is server-side**: every served item is upserted into `served_items` with its tags (`_generate_with_fallback` is the single exit). A wrong pick (`POST /api/progress/mistakes` + `pick_line`/`pick_option`, or parsed from `your_answer`) is tagged by looking the item up — never trust a client tag; one question counts once per misconception. The client prefetches, so not every served row was seen: `/next` with `prefetched` records without serving, and `misconception_eval` counts only items with an attempt or a board mistake. A finished question writes `avoided` for every offered m not picked. Per-misconception BKT-style update with fixed constants; **active** needs p ≥ 0.6 AND picks on 2 different questions; **resolved** needs clean answers on TARGETED items on 2 different ops (twice on the one op for single-op misconceptions).
- **Remediation** (`plan_next`: stuck → **remediate** → review → practice): an active m that applies to an op in play in the unit and can be targeted without a live model call (authored item, or a tagged pool row this student hasn't done — `question_pool.can_serve_targeted` applies serve()'s filters); prefers an op where the student hasn't shown it (transfer); never twice in a row. Targeted authored items force the m option in and may leave the difficulty knob's list length so the misconception is visibly wrong on the board (`_board_sizes`). No target available → plain practice, logged as `shadow_plan.unmet`. `remediate` counts as practice for mastery; the server accepts it only for an item it targeted.
- **`MISCONCEPTION_MODE`** (config/.env): `off` (default — nothing recorded), `shadow` (record + diagnose + log what remediation would do; serving unchanged), `ab` (stable hash: half the students get remediation), `on`. Only students who get remediation see the analysis card's "What your choice did" and give the tutor `[LIKELY MISCONCEPTIONS]`.
- **AI**: a targeted spec (`QuestionSpec.target_misconception`) aims the find_bug/ordering prompt at the mutant's line; **R4** in the validators rejects output that does not show m when run. Pool rows carry `misconception_id` (set on insert by execution); `serve(..., misconception=m)`; `refill_pool.py --tag-existing` (free) / `--misconceptions gaps` (Haiku); `/gen-check --targeted gaps` measures R4 first.
- Tools: `python misconception_report.py [--all] [--ops <op>]` (tag coverage, gaps, untagged candidates — the teacher's review), `python -m app.analytics.misconception_eval` (recurrence by arm, resolution, shadow plans). Tests: `test_misconceptions.py`, `test_misconception_model.py`, `test_targeted_generation.py`.

### Teach Quinn — the teachable classmate (`npc_agent.py`, `routes/npc.py`, `TeachSession.jsx`)
An **elective**, not a unit: always open from the unit path (dashed card after the 5 units), never needed for mastery or the city. Behind `NPC_ENABLED` (config/.env, default off — it shows students a new screen). Hybrid NPC (ESS level E3): **everything Quinn knows is code state**, the model only words Quinn's replies and (free text) translates an explanation into an edit.
- **A case** = one operation + 1–2 misconceptions Quinn holds; Quinn's program = template + those canonical mutants (`program_for`). Drawn at random from the operations the student has **learned** (`best_perfect_type >= 2`, a zero-error find_bug pass); none yet → unit 1's ops, and the student is told so. Recent (op, misconception) pairs are avoided; after a first solved case, 35% get a second misconception — only a `compatible` one (different lines, not `related`, and each one VISIBLY changes behaviour: `stop-on-target` hides `forget-free` on removeAtTail, so they are never paired).
- **Tests**: the student builds boards inside the operation's precondition (`board_spec` — not the generator's minNodes: sortList's base case lives on 0/1-node lists). The template is correct on every buildable board and the harness boards (the "hidden tests") are buildable, both pinned by tests. Explaining needs a currently failing test of the student's own.
- **Explanations**: choice cards = held corrections + distractors that are true statements about something else (same op → same kind of op → same unit → any), never one `related` to a held misconception (same line on some op, or a hand-listed family in `_FAMILIES` — read every correction against every bug when the catalog grows). A held correction reverts exactly that mutant (deterministic); anything else changes nothing and the card is spent. Free text → `translate` (Haiku, JSON edit) → `adjudicate` by fingerprint: `fixed` only if it behaves exactly like "Quinn without m" on every harness board; `overfix` (two at once), `no_change`, `wrong`, `not_understood` all leave Quinn as is. After two wrong tries Quinn's voice gets its belief (`[WHAT YOU WERE THINKING]`).
- **Voice**: `voice()` — `interactive` client, 12 s, the persona never sees the correct code; the guard (`voice_ok`: `=`, braces, `.next`/`.value`, a call, `index-1`, any template line) regenerates once, then uses a fixed line. Model errors and the rate limit (8 explanations / 60 s) also fall back — Quinn never errors. Test reactions and the intro are fixed lines (no model call).
- **Coach**: computed, no model — per situation, first a way of thinking, then something concrete (the simplest buildable board that breaks the code, or the line that differs, shifted for other held deletions).
- **Evidence**: an accepted fix writes a `taught` misconception event (`record_taught`, weaker than `avoided`) when `MISCONCEPTION_MODE` records. `npc_events` keeps every test (with which held misconceptions it exposes), explanation (verdict, edit, voice/translate telemetry) and coach hint — the data for the second paper (selective flip, over-fix, break-character, test construction).
- Bump `NPC_VERSION` whenever what Quinn says or accepts changes. Tests: `test_npc.py` (fake model). Fidelity with the real model: `.claude/skills/tutor-sim/npc_sim.py` (costs Haiku calls).

**Heap fixtures rule** (Memory City, `feat/memory-city`): `frontend/src/prototype/fixtures.json` is generated from TEMPLATES/_BLANKS/_BUGS for the ops in `PHASE0_OPS` and is both the prototype's content and the interpreter's test oracle. After editing those ops' content, from `backend/` run `d:/openLearnquest/venv/Scripts/python.exe export_heap_fixtures.py` — `test_heap_fixtures_match_current_templates` fails until you do. Design + decisions: `docs/designs/memory-city.md` (local, gitignored).

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
In-memory SQLite fixtures (no Postgres needed); covers the deterministic core: `ll_executor`, the item harness (`test_item_quality.py`: every authored question passes R1–R3), the misconception catalog / diagnosis / remediation (`test_misconceptions.py`, `test_misconception_model.py`, `test_targeted_generation.py`), Teach Quinn (`test_npc.py`), the curriculum (`test_curriculum.py`), mastery/unlock rules, `select_spec`, `error_analyzer`, the ZPD controller contract, scaffold clamp + closed-loop telemetry, and the tutor stream route end to end with a fake Claude client (`test_tutor_harness.py`: retry / partial / generic error / rate limit / `tutor_turns`). `scaffold_level` from the client is clamped server-side (`game_master.clamp_scaffold`) — never trust client-computed telemetry.

Frontend (Vitest, node environment — the Memory City heap interpreter and the home city's traffic):
```bash
cd frontend
npm test
```
Parity of `heapInterpreter.runProgram` against `goalPattern` (computed by `ll_executor`), plus every wrong line the Phase 0 content can show (compile_error / runtime_error / ok, never "unsupported"). Data comes from `frontend/src/prototype/fixtures.json`. `city/traffic.test.js`: no rear-ending, never two directions inside one crossroads, nobody stuck, cars wait at red.

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
      city.py                 # /api/city — the student's home city (GET state, POST /place)
      npc.py                  # /api/npc — Teach Quinn (status, case, test, explain, coach)
    services/
      game_master.py          # orchestrates the multi-agent loop
      claude_service.py       # calls Claude API, retries, fallback
      question_registry.py    # per-type prompt builders + validators
      question_spec.py        # maps type_unlocked + emotion → QuestionSpec
      static_questions.py     # TEMPLATES dict: correct pseudocode for all 12 ops; _BLANKS / _BUGS content
      curriculum.py           # the 5 teaching units, mastery rules, transfer probe, next op in a unit
      pseudo_exec.py          # item-harness oracle: runs student-visible pseudocode on a heap
      item_quality.py         # item harness rules R1-R3 + serve-time board checks
      misconceptions.py       # misconception catalog: canonical mutants + execution fingerprints + tagging
      misconception_model.py  # served-item tags, evidence (picked/avoided), per-misconception diagnosis
      npc_agent.py            # Teach Quinn: case state, test boards, explanation adjudication, voice guard, coach
      emotion_agent.py        # behavioral signal → emotion label
      tutor_agent.py          # ReAct Socratic tutor (see Tutor Agent section)
      tutor_memory.py         # tutor memory: persistence + view compaction + episodic recall
      tutor_telemetry.py      # tutor_turns writes + per-student rate limit (see Classroom Harness)
      anthropic_client.py     # the only place Anthropic clients are built (timeout profiles)
      error_analyzer.py       # structured error diagnosis
      ll_executor.py          # simulates linked-list ops for goalPattern
      concept_graph.py        # concept dependency graph per operation
      city.py                 # home city: buildings earned from mastery, placement on lots
    models/                   # SQLAlchemy ORM models
    schemas/                  # Pydantic request/response schemas
```

### Frontend Structure
```
frontend/src/
  App.jsx                     # state-machine router (no react-router); home = lazy 3D city
  city/                       # 3D home city (React Three Fiber, Kenney CC0 models in city/models/)
    CityHome.jsx              # home page: HUD, backpack, placement flow, "Enter the school"
    HomeScene.jsx             # school, roads, empty lots, earned buildings
    CityCanvas.jsx            # shared canvas: sky/lights, orbit + reset, quality, DOM labels, GL-failure fallback
    homeLayout.js             # lot positions (must match backend LOT_COUNT), lake, mountains, camera, labels
    HomeNature.jsx            # mountains, lake + campsite, instanced forests/meadows, birds (layout: countryside.js)
    HomeTraffic.jsx           # cars + traffic lights, driven by traffic.js (pure, unit-tested)
    Instanced.jsx             # one Kenney model drawn many times (forests, roads) as instanced meshes
  contexts/
    AuthContext.jsx            # user auth state + login/register/logout
    EmotionContext.jsx         # current emotion state
  services/
    api.js                    # all fetch calls — authApi, gameMasterApi, etc.
    adaptiveEngine.js         # client-side emotion + difficulty helpers
  components/
    UnitPath.jsx              # the learning path: 5 units in teaching order (replaced the 12-card skill tree) + the Teach Quinn elective card
    TeachSession.jsx          # Teach Quinn: Quinn's code, test builder, tests, explanation cards / free text, coach
    AgenticSession.jsx        # main game loop (prefetch, timing, question flow)
    LinkedListHintAnimation.jsx  # always-visible animation hint modal (CSS transitions)
    FillBlankBoard.jsx        # fill-in-the-blank question UI
    FindBugBoard.jsx          # find-the-bug question UI
    AssemblyArea.jsx          # ordering question UI (drag/drop)
    TutorChat.jsx             # streaming tutor sidebar
    AuthPage.jsx              # login + register form
    AdminDashboard.jsx        # admin view
```

## Home City (`city/`, `services/city.py`)

Home is the student's 3D city: the school plus 8 empty lots. **Entering the school is the unchanged learning flow** (ModuleSelector → skill tree → AgenticSession); nothing in the lesson, tutor or scaffolding depends on the city.

- **Earned is derived, never stored.** `city.BUILDINGS` maps a building to a module; it is earned when `mastery_summary` reports every curriculum unit of that module mastered (`units_mastered == total_units`). Today: all 5 singly units → Linked List Tower. Only the placement is stored (`city_buildings`, unique per user+building and per user+lot); placing an already-placed building moves it.
- `homeLayout.LOTS` index i is backend lot i — change both together (`LOT_COUNT`).
- three.js loads only in the lazy `CityHome` chunk. No WebGL, a failed chunk, or a lost GL context → home falls back to the plain ModuleSelector (`App.jsx` `cityOk`).
- Labels are DOM spans projected in `useFrame` (`city/Labels.jsx`), not drei `<Html>` (React 19 unmount errors).
- Scenery is decoration only and seeded (same land for every student). Anything placed many times goes through `Instanced.jsx` (~1,500 trees/props cost ~60 draw calls); animation (tree sway, traffic, birds) runs only on High quality — Low renders on demand.
- **Windows resolves imports case-insensitively, `.js` before `.jsx`**: a data module must not share a component's name in another case (`homeNature.js` shadowed `HomeNature.jsx` → "no default export"; hence `countryside.js`).

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

**The one exception is tool use.** Models reliably under-call tools from descriptive guidance, so the per-turn note in `build_api_messages()` keeps an imperative ("stop re-explaining and CALL lookup_resource on this turn"). Style guidance belongs in the system prompt; the tool policy has to be operationalised per turn, because the first-turn prompt is forgotten by turn 3. The video policy is enforced in code, not prompt wording:
- the nudge appears only once the tutor has **replied ≥ 2 times** (the proactive opener counts) and no video was shared yet — on from the first follow-up, a student who just said "I don't get it" to the opener got a bare video before any explanation;
- the nudge goes **after** the per-turn phase note in the refresh — measured 6/6 fire when stuck vs 3/6 with the phase note last-but-one; 0/3 when the student is progressing;
- `missing_video_link()` appends a fetched video's URL when the reply leaves it out (both `chat()` and the stream route) — `TutorChat` only renders links that are in the reply text, and Haiku dropped it ~1 in 5.

### Three modes: `solving`, final hint, `reviewing`
`TutorRequest.phase` (client-sent, default `solving`; unknown values fall back to `solving` so a stale client can never unlock answer reveal) plus `final_hint` pick the prompt via `tutor_agent.system_prompt_for(phase, final_hint)`:

| | `solving` (exercise open) | final hint (open, scaffold level 4) | `reviewing` (analysis card up) |
|---|---|---|---|
| Concepts, tangents, casual chat | free | free | free |
| This exercise's answer (step order / blank token / bug line) | withheld — **including in plain English**; "first create it, then connect it, then move head" is as much a leak as the code | the answer for the **current step** may be stated (the board's `FinalHintCard` shows it too); later steps stay withheld | already on the student's screen, so explain it outright |

`AgenticSession` sets `phase='reviewing'` when the tutor is opened from the analysis card's "Ask the tutor" (the Consider follow-up). Without this the tutor answered that follow-up with "let's focus on..." — it was withholding an answer the student could already see. It sends `final_hint=true` while the level-4 final hint is available; the server honours it only with `FINAL_HINT_MIN_ERRORS` (3) board mistakes it saw — `Mistake` rows for this `question_id`, capped by the client's `error_count` (`routes/tutor._final_hint`) — and never in `reviewing` (`final_hint_allowed`).

The withholding principle (`_SOLVING_NOTE`, or `_FINAL_HINT_NOTE`) is restated in **every** context refresh, not just the first turn: students who kept saying "I don't know" used to get the order in plain English by turn 2–3 (diagnosis: 12/18 stuck replies leaked → 4–7/18 after; explicit "just tell me" 5/9 → 2/9). Naming the final hint gives the tutor something true to say instead of caving: keep trying, the game will show you this step.

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

### Classroom Harness (`routes/tutor.py`, `tutor_telemetry.py`, `anthropic_client.py`)
Built for ~30 students at once. Design + open items: `docs/designs/tutor-harness.md` (local, gitignored).
- **Clients**: every Anthropic client comes from `anthropic_client.get_client(purpose)` — `interactive` (tutor, chat emotion: 20 s, 1 retry), `generation` (30 s, 2), `background` (60 s, 2). The SDK default is a 10-minute timeout; `test_every_anthropic_client_comes_from_the_factory` fails on any direct `Anthropic(...)`. Streams also get a per-turn budget (`TURN_DEADLINE_S` = 45 s across the ReAct loop).
- **Failures**: before any token reached the student, the whole turn retries once — only for transient errors (`_worth_retrying`: overload/5xx/408/409/429/timeouts; a 400 like "credit balance too low" is not retried; an error event in the middle of a stream arrives on the 200 response, so it is judged by its error type — `overloaded_error` / `api_error` retry). After text was shown it can't be taken back: `PARTIAL_TAIL` closes the reply and it is stored as `partial`. Students only ever see `GENERIC_ERROR`; the real exception goes to the log. Never send `str(e)` to the client.
- **Model is server config** (`tutor_agent.TUTOR_MODEL` = `anthropic_client.MODEL`); `TutorRequest` has no `model` field. Bump `TUTOR_VERSION` whenever tutor behaviour changes — it is stamped on every telemetry row.
- **Rate limit**: 6 student messages / 60 s per user, counted from `tutor_messages` (holds across workers). `[PROACTIVE_INIT]` pushes are free up to `PROACTIVE_FREE` (2) per window, then count like any message — the prefix is plain text a client can type. A limited request is not stored and the model is not called; the stream returns an SSE `{"notice": ...}` event, which `TutorChat` shows as a grey system line and puts the text back in the input box.
- **Telemetry**: one `tutor_turns` row per request, inserted as `started` and finished in a `finally` (`ok` / `partial` / `error` / `rate_limited` / `cancelled`). It stores derived labels + question/board state, **never chat text** (`tool_calls` keeps name + concept, never the model's `reason`). Join to attempts on `(session_id, question_id)`; the client sends `question_id`, `board_phase` (`boardFocus.kind`) and `final_hint_step`.
- **Load test** (before each class, costs nothing — Claude is stubbed, a throwaway `openlearnquest_loadtest` Postgres DB is rebuilt each run):
  ```bash
  cd backend
  d:/openLearnquest/venv/Scripts/python.exe load_test.py --students 30 --seconds 90   # steady class
  d:/openLearnquest/venv/Scripts/python.exe load_test.py --students 30 --burst        # whole class hits the tutor at once
  ```
  2026-10-20, one uvicorn worker: both pass (burst TTFT p95 5.4 s against 5 s of fake model latency; `/api/auth/me` probe max 0.4 s). It does not simulate Anthropic 429s.

## Adaptive Learning System

### Curriculum — progress by idea, not by operation (`curriculum.py`, `UnitPath.jsx`)
Twelve operations are a few reusable ideas. The student moves through 5 units in teaching order; operations are the contexts each idea is practised in:

| Unit | Idea | Ops (group = primary → variants; every op required) |
|---|---|---|
| 1 Change the front | link before you move head; save before you cut | [insertAtHead → insertIntoEmpty] + [removeAtHead] |
| 2 Walk to the node before | stand on the predecessor; pick the stop condition | [insertAtTail → insertAtPosition] + [removeAtTail → removeAtPosition] |
| 3 Save next, then go | save curr.next before destroying/rewiring it | [deleteEntireList] + [reverseList] |
| 4 Two pointers | fast catches slow only in a loop; dummy head | [detectCycle] + [mergeSortedLists] |
| 5 Put it together | slow/fast split + cut + recurse + merge | [sortList] |

- **An op is mastered by a zero-error ORDERING pass** (`mastery.best_perfect_type >= 3`). fill_blank/find_bug are the scaffolding on the way; a 3-way blank can be guessed. "Mastered ✓" used to be any one perfect pass.
- A unit is mastered when ALL its ops are; units unlock in order. A primary climbs the full ladder; a variant (same idea, another form) joins once its primary is mastered and starts at `transfer_start` — one clean ordering question.
- **Block, then interleave**: the unit's anchor (first op) is practised alone until it passes fill_blank cleanly; then every op in play (`curriculum.active_ops`: unmastered primaries + variants whose primary is mastered or that were started) takes turns, LEAST RECENTLY PRACTISED first (ties in unit order), each at its own level. Two ops alternate; 3–4 ops rotate; a newly joined variant (never practised) goes next.
- **Stuck → detour**: 3 questions in a row on one op with mistakes → one question of another op in the unit (`curriculum.detour_op`), then back. A unit with one op (sortList) has no detour.
- **Review**: every 4 unit questions, the 5th is an ORDERING question on an op of an earlier mastered unit (badly-answered reviews come back first, then least recently seen). Recorded with `question_attempts.purpose = 'review'`, never applied to mastery; the server only accepts `review` for an op that is already mastered.
- A student who struggles (2+ errors or a fail) on a level they SKIPPED (a variant's probe) steps down one level; a level they earned is never taken away.
- The question type answered is server-derived (`game_master.played_level`: the type served, clamped by the client's claim — never above). Stored on `question_attempts.question_type`.
- A session started from a unit is pinned to the unit: `game_master.plan_next` decides stuck → remediate → review → practice from the attempt history (+ misconception state, see "Misconception diagnosis") only (deterministic, so the prefetch and the background `/next` agree). The question carries `purpose`; `AgenticSession` shows a banner for review/detour/remediate and echoes it back.
- Blank-set rotation is offset per student (`_variant_offset`) so set order is counterbalanced across a class; wrong picks are logged (`mistakes.your_answer = ["line 3: curr.next.next"]`) for item analysis.
- Full course for a perfect student: 30 practice questions (7 + 8 + 6 + 6 + 3), all 12 ops covered, plus a review every 5th question from unit 2 on (`tests/test_curriculum.py::test_the_whole_course`). Review recency comes from attempt times (a review never touches `mastery.last_seen` — keying on it re-picked the same op forever).

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
- a perfect pass at level L also unlocks L+1 (a transfer probe that starts at find_bug)

**Student-controlled progression (`active_type_level`)**: `type_unlocked` is the *ceiling* (what's earned); `active_type_level` (≤ ceiling, in `mastery`, persisted) is what the student is *practicing* and is what actually drives the question type. Unlocking does NOT auto-advance — on unlock a non-dismissing popup (`UnlockPopup.jsx`) offers *advance* or *stay*, and a persistent 🔓 Level Up button (`POST /api/gm/session/level-up`, `gm.level_up`) lets them advance any time.

### State Axis — within-type difficulty + scaffolding (emotion-driven)
**Two-axis design**: the competence axis above owns the question *type*; emotion drives two orthogonal channels that never change the type:
- **ZPD difficulty controller** (`game_master._intra_from_history`, pure; DB wrapper `compute_intra_difficulty`): targets ~25–30% error rate via **EMA + hysteresis** (dead zone 0.22–0.40, 2 consecutive confirmations, one level per move — replaced the windowed-rate version that oscillated). Emotion only scales the gain (frustrated → eases sooner, bored → ramps sooner, confused → neutral). Behavioural contract in `tests/test_intra_controller.py`. Output `intra_difficulty` (1–3) drives `select_spec` params + `INTRA_KNOBS` (node count, distractor count/similarity, blanks, bug subtlety) in `question_spec.py` / `static_questions.py`.
- **Scaffold orchestrator** (`hooks/useScaffold.js`): `scaffold_level = emotion baseline + per-error climb − mastery fading cap`; what fires on a question (`AgenticSession`): error-highlight always; **1st mistake → animation auto-opens, 2nd mistake → proactive tutor push** (needs level ≥2, waits while the animation is open; the animation never opens over an open chat); **level 4 + ≥3 mistakes → final hint** (`FinalHintCard`, closed until the student asks; the answer for the current step only, built by `services/finalHint.js` from the question data — never from the model; engaged/bored at the 4th mistake, confused/frustrated at the 3rd; never for experts, whose cap is 2). **Only board tries count**, by design (gaming guard): saying "I don't know" in the tutor chat never triggers it, and an emotion inferred from the chat (`setEmotion(..., 'chat')`) never brings it forward — `EmotionContext.boardEmotion` / `countsForFinalHint`; the tutor is told the same, so it sends a chat-only student back to the board. `confused` raises scaffolding but keeps difficulty; `frustrated` lowers difficulty.

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
Always-visible hint button; also auto-opens once on the student's first mistake of a question (before the tutor push, see Scaffold orchestrator). Click → modal with a per-node CSS transition animation showing the operation step-by-step (cursor traversal, nodes appearing/disappearing). Has a Replay button. Does not use AI — purely deterministic based on `question.operation`.

### Per-step animation in fill_blank (`fillBlankSteps.js` + `FillBlankBoard.jsx`)
`fill_blank` animates **each step as the student fills it** (not one animation at the end). `computeStepStates(operation, ...)` returns the list state after each pseudocode step (aligned to TEMPLATES); the board reuses `AnimNode`/`Arrow` (exported from `LinkedListHintAnimation.jsx`). Operations not modelled fall back to executing once at the end.

## Database Schema (key tables)

| Table | Key columns |
|---|---|
| `users` | id, email, username, xp, is_admin |
| `game_sessions` | id, user_id, module_id, mode |
| `question_attempts` | session_id, question_id, difficulty, passed, error_count, error_type, error_concept, **intra_difficulty, scaffold_level, emotion** (state-axis telemetry), **variant** (content-variant tag: `blanksN`/`bugN-sK`/`pool:<hash8>`, null for live-AI questions), **question_type** (server-clamped), **purpose** (practice / detour / review / remediate), **target_misconception** |
| `question_pool` | operation, question_type, intra_difficulty, payload (JSON), content_hash (unique, pedagogical identity — not node values), times_served, **misconception_id** (what its bug/distractor shows, by execution) — class-shared pre-generated AI questions; serving excludes only the student's own attempted question_ids |
| `served_items` | user_id + question_id (unique; pool ids are shared), session_id (SET NULL), operation, question_type, variant, purpose, target_misconception, arm, tags (JSON, per option, server-computed), board, shadow_plan — what the server handed this student |
| `misconception_events` | user_id, misconception_id, kind (picked / avoided / taught), question_id, operation, line, option, targeted, p_after — the evidence stream |
| `misconception_state` | user_id + misconception_id (unique), p_hold, n_picked, n_avoided, picked_items, picked_ops, resolved_ops, status (unknown / suspected / active / resolved) |
| `npc_cases` | user_id, operation, held_initial / held (misconception ids), program (Quinn's code, symbolic), changed, choices ([{id, mid}]), tried, tests (the student's boards), coach, policy, status (open / solved / abandoned), n_wrong, arm, npc_version |
| `npc_events` | case_id (CASCADE), user_id, kind (start / test / explain / coach), payload (board + what it exposes; advice, edit, verdict, Quinn's line + voice/translate telemetry; hint) |
| `mastery` | user_id, operation, module_id, attempts, passes, consecutive_passes, perfect_pass, type_unlocked, **active_type_level**, **best_perfect_type** (0–3; mastered at 3 = ordering) |
| `city_buildings` | user_id, building_key, lot, placed_at — where the student put each earned building (earned-ness itself is derived from `mastery`) |
| `concept_mastery` | user_id, concept, mastery (0–1 float), attempts — Bayesian-style per-concept posterior |
| `mistakes` | user_id, question_id, source, title, your_answer (JSON), correct_answer (JSON), explanation, created_at |
| `emotion_logs` | user_id, session_id (SET NULL on session delete), emotion, source, confidence, signals (JSON), action_taken, **outcome (JSON)** — closed-loop: the question result is written back onto interventions when the attempt is recorded; tutor_chat rows carry `signals.last_message_id` linking the label to the stored transcript |
| `tutor_conversations` | user_id, session_id (SET NULL on session delete), operation, question_title, message_count, **summary/key_struggles/resolved** (episodic layer), **compact_summary/compacted_through_id** (working-memory view); UNIQUE (session_id, question_title) |
| `tutor_messages` | conversation_id, role, content, created_at — verbatim append-only transcript (clean text; prompt wrappers are never stored) |
| `tutor_turns` | user_id, conversation_id (CASCADE), session_id (SET NULL), question_id, status, phase, final_hint(_step), board/question state, guard_* (off until the answer guard ships), tutor_version, arm, model, tokens, ttft_ms/ttfv_ms/total_ms, tool_calls — per-request telemetry, no chat text |

**Note**: `mistakes.title` matches `q.title` sent from the frontend. Filter by `title == question_title` to get operation-specific history. `your_answer` may be an empty list for early-stage wrong attempts — skip these when building tutor context.

## Key Conventions

- **Pseudocode naming** (`tests/test_pointer_naming.py` locks all of it in; `question_registry._sll_reject_reason` hard-rejects violations in AI output — code fields only, so "the last node" in an explanation is fine):
  - Traversal pointer is `curr` everywhere a student can see code — TEMPLATES, distractors, blanks, bugs, the hint animation's cursor label, tutorial slides. Never `node` / `cur` / `current` / `p`. `newNode` / `createNode` are unaffected.
  - Target position is `index`, never `position` / `pos` / `k`. Indices are **0-based**, matching the labels under the nodes.
  - `{value}` in TEMPLATES is a **placeholder** for the operation's payload, substituted by `static_questions.instantiate()` at payload assembly (`_enrich` for AI paths, the return of each static generator) so students read `createNode(35)`. `index` deliberately stays symbolic — `index-1` is the off-by-one rule being taught, and `3-1` lets them compute the answer without learning it.
  - Everything upstream of `instantiate` (prompts, validators, alias analysis, `content_hash`) works on the symbolic form. `question_pool.content_hash` masks `createNode(<n>)` before hashing — the payload literal is re-rolled per build and would otherwise defeat pool dedup.
  - Node fields are `value` and `next` only (the Node reference students see). `instantiate` never touches `.value`. `createNode(v)` sets `next = NULL` (shown in the reference), so templates have no `newNode.next = NULL;` no-op step — that line made a dozen orders "valid" and let distractors stand in for it.
- All API routes use `/api/<prefix>/` pattern
- Frontend calls backend directly (no Vite proxy) — `VITE_API_URL` sets the base
- Frontend uses `/api/ai/tutor/stream` (SSE) for tutor chat, not the non-streaming endpoint
- `consecutive_passes` in `Mastery` = consecutive **perfect** passes (error_count == 0)
- When creating a new `Mastery` record, always pass `type_unlocked` and `active_type_level` explicitly — SQLAlchemy `default=` doesn't apply at Python object creation. Both are `curriculum.entry_level(op, mastery_map)`: 1 for a primary, 3 for a variant whose primary is mastered (its transfer probe); `best_perfect_type=0`
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
| Edited `_BLANKS` / `_BUGS` / TEMPLATES content, or want the teacher-readable review | `python item_report.py --all --ops <op>` (free) + `pytest tests/test_item_quality.py` |
| Edited the misconception catalog, or want to see what the content can target | `python misconception_report.py` (free) + `pytest tests/test_misconceptions.py`; before stocking targeted pool rows, `/gen-check --targeted gaps` |
| Adding a new linked-list operation (touches ~10 files; never do this ad hoc) | `/add-operation` |
| Edited `tutor_agent.py` (system prompt, context block, tools, ReAct loop) | `/tutor-sim` (`--show-context` is free; full run ≈ 5–10 Haiku calls) |
| Edited `npc_agent.py` (Quinn's persona, the guard, `translate`, `adjudicate`, choices) | `pytest tests/test_npc.py` (free) + `npc_sim.py` in the tutor-sim skill (≈ 30–50 Haiku calls at `--repeat 2`) |
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
