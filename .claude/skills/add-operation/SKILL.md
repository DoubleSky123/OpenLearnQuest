---
name: add-operation
description: Checklist workflow for adding a new linked-list operation to OpenLearnQuest. Adding an operation touches ~10 files across backend and frontend (templates, blanks, bugs, executor, concept graph, level tiers, animations); missing any one is a runtime-only bug. Use when asked to "add a new operation", "add removeDuplicates", "support a new linked-list op", "新增操作", or when editing TEMPLATES in static_questions.py to add a key.
---

# Add a New Linked-List Operation

Adding one operation requires coordinated edits in **many** per-operation registries. Work through every step below in order; do not skip a step without explicitly telling the user why it doesn't apply.

Throughout: `<op>` is the new operation's camelCase id (e.g. `removeDuplicates`). Match the exact style of the existing 12 entries in each file.

## Step 0 — Decide the operation's shape first

Before editing anything, pin down with the user (or infer and state):
- **Pseudocode** (3–5 steps, same style as existing TEMPLATES entries — semicolons, `NULL`, `.next`, no `.prev` unless justified). Naming is enforced by `question_registry._sll_reject_reason` + `tests/test_pointer_naming.py`, so get it right the first time:
  - traversal pointer is **`curr`** (never `node`/`cur`/`current`/`p`)
  - target position is **`index`**, 0-based (never `position`/`pos`/`k`)
  - write the payload as **`createNode({value})`** — `{value}` is a placeholder that `static_questions.instantiate()` replaces with the actual number. Keep `index` symbolic; don't templatise it.
- **Tier**: level 1 (basic head/tail), 2 (position/empty/whole-list), or 3 (algorithms like reverse/merge)
- **Meta**: `needsValue` (takes a value?), `needsPosition` (takes an index?), `minNodes` (minimum starting list size)

## Step 1 — Backend registries

### 1a. `backend/app/services/static_questions.py` — FOUR dicts, all required

1. **`TEMPLATES`** (top of file): full entry with `title`, `pseudocode`, `correctOrder`, `hint`, **`step_hints` (one Socratic line per pseudocode step — parallel array, enforced by `tests/test_step_hints.py`)**, `distractors` (3 near-miss lines that use ONLY names the program has and break the list wherever they are placed), `crux` (the steps that carry the big idea — blanked first), `needsValue`, `needsPosition`, `minNodes`. **Never** hand-write `validOrders`: they are computed by running every permutation (`static_questions.valid_orders_for`). The template must itself run correctly in `pseudo_exec` (fields are `value`/`next` only; `createNode` already sets `next = NULL`, so no `newNode.next = NULL;` no-op step).
2. **`_BLANKS`**: 4 blank sets; each set has one `{"a": answer, "w": [strongest wrong, wrong2]}` (or `None`) per pseudocode step. **Constraints**: each `"a"` must be an exact substring of the same-index step (`str.replace(a, "___", 1)` must hit its FIRST occurrence), and every blank must pass the item harness (CLAUDE.md "Item harness"): a semantic slot — never a new variable's name, a field, a function or the payload — exactly one correct option, every distractor failing for a linked-list reason.
3. **`_BUGS`**: 3 entries (subtlety 1/2/3) `{subtlety, line, buggy, fix, explanation, options}` — `line` is the 0-indexed step to corrupt, `options` includes the fix plus 2 wrong candidates. The bug must really break the program when run (and be visible on some served board); every wrong fix must really fail.
4. **`CONSIDER`**: 1–2 post-question extension questions (shown on the analysis card; "Ask the tutor" seeds the chat with one). Falls back to a generic question if missing, but write real ones.

**Check it**: `python item_report.py --all --ops <op>` shows what every option does; `pytest tests/test_item_quality.py` must pass.

### 1b. `backend/app/services/claude_service.py` — `OP_META`

Add a row mirroring `title` / `needsValue` / `needsPosition` / `minNodes` from TEMPLATES. (Yes, it's duplicated between the two files — keep them identical.)

### 1c. `backend/app/services/ll_executor.py` — `execute_operation()`

Add a branch that returns the final node list for the operation (this is the Python mirror of the JS executor and produces the `goalPattern` shown to students). Place it in the section matching its tier (Level 1/2/3 comment banners). `validate_question()` depends on this — an op without a branch falls through to the generic tail of the function.

### 1d. `backend/app/services/concept_graph.py` — `OP_CONCEPTS`

Map `<op>` to its concepts (subset of: `pointer_assignment`, `traversal`, `memory_management`, `node_creation`, `list_structure`). This drives concept mastery tracking and the tutor's resource lookup.

### 1e. `backend/app/services/game_master.py` — `LEVEL_OPS`

Add `<op>` to the chosen tier list (XP + within-type difficulty). `ALL_OPS` derives from it automatically.

### 1d'. `backend/app/services/misconceptions.py` — `_ALL` (misconception catalog)

For every existing misconception that applies to the new op (stop-on-target, forget-free, walk-off-end, ...), add the op's canonical mutant to its `mutants` (`_r(line, code)` / `_s(i, j)` / `_d(line)`, symbolic `{value}` form). Add a new catalog entry only for a genuinely new belief (`belief`/`correction` are student-facing prose with no code). `pytest tests/test_misconceptions.py` checks that every mutant is a runnable wrong program and that misconceptions on one op are behaviourally distinguishable (two with identical fingerprints can't be told apart from an answer — drop one). Then `python misconception_report.py --ops <op>` shows how many of the op's authored wrong options got tagged and which (op, type, misconception) cells are gaps.

Teach Quinn (`backend/app/services/npc_agent.py`): add the op to `_LENGTHS` (the list lengths a student may build: the operation's precondition, not minNodes — `KeyError` otherwise) and to its kind in `_OP_KINDS`; if it takes something other than a value/index/second list/cycle, extend `board_spec`/`parse_board` and the `TestBuilder` in `TeachSession.jsx`. `pytest tests/test_npc.py` checks the template is right on every buildable board, the hidden tests are buildable, and every mutant can be shown. A new catalog entry: read its correction against every other bug and add a `_FAMILIES` row when one would also explain the other.

### 1e'. `backend/app/services/curriculum.py` — `UNITS`

Put `<op>` in the unit whose IDEA it practises (`ops`), and decide its place in `groups`: its own group (a primary that climbs the full ladder) or a variant in the group of an op with the same idea (it joins once that primary is mastered and starts at the unit's `transfer_start`). Every op in a unit is required: the unit is mastered only when all of them are. A genuinely new idea is a new unit — write its `big_idea` and `watch_for` as a teacher would. `test_every_operation_is_taught_exactly_once` fails until it is placed.

### 1f. `backend/app/services/question_registry.py` — special-case sets (check, may be no-op)

- `_PREV_ALLOWED_OPS` — add `<op>` **only** if its pseudocode legitimately uses `prev` (like `reverseList`); otherwise the SLL validator rejects generated questions containing `prev`.

## Step 2 — Frontend registries

### 2a. `frontend/src/components/AgenticSession.jsx` — `_opLevel()`

The `L` map at the bottom of the file duplicates backend `LEVEL_OPS`. Add `<op>` to the same tier. **These two must stay in sync manually.**

### 2b. `frontend/src/services/linkedListOperations.js`

Add the JS executor branch (mirror of the `ll_executor.py` branch from 1c — same final list for the same inputs).

### 2c. `frontend/src/components/LinkedListHintAnimation.jsx`

Add a `case '<op>':` to the animation timeline `switch (operation)` — the step-by-step CSS animation shown by the always-visible hint button. Reuse the `at(delay, fn)` / `setCursor` / `addNode` / `removeNode` / `markColor` helpers like neighboring cases.

### 2d. `frontend/src/services/fillBlankSteps.js` — `computeStepStates()` (optional but recommended)

Add a `case '<op>':` returning the list state after each pseudocode step (indices aligned to TEMPLATES). Without it, fill_blank falls back to executing once at the end instead of animating per-step — functional, but a worse experience.

### 2e. `frontend/src/services/distractorAnalyzer.js` (optional)

Add the one-line per-op explanation string to the dict near the top if the op benefits from a tailored wrong-answer explanation.

> Files under `frontend/src/services/doubly*` are the separate doubly-linked-list module — do NOT touch them for a singly op.

## Step 3 — Docs

- `CLAUDE.md` → "Supported Operations" section: add `<op>` and bump the count; add it to its unit's row in the Curriculum table and update the full-course question count there (`test_the_whole_course`).
- `README.md` → both operation lists (search for `insertAtHead` to find them).

## Step 4 — Verify

1. **Consistency sweep**: `grep -rn "<op>"` across `backend/` and `frontend/src/` — confirm it appears in every location from Steps 1–2 (minus justified skips).
2. **Executor sanity** (from `backend/`): run the venv python and call `ll_executor.execute_operation("<op>", nodes, ...)` on a small list; check the result by hand.
3. **Generation check**: run `/gen-check` scoped to the new op (`--ops <op>`) — verifies the AI pipeline (find_bug + ordering prompts/validators) works for it.
4. **Stock the question pool** (from `backend/`): `venv/Scripts/python.exe refill_pool.py --ops <op>` — a new op has an empty pool, so students would hit live generation (slower, no class-shared reuse) until serving self-heals. If you later EDIT the op's TEMPLATES entry, re-run with `--purge` (pool payloads embed the template's pseudocode/step_hints at generation time and go stale). For misconception remediation, `refill_pool.py --misconceptions gaps --ops <op>` stocks the cells authored content can't target (costs Haiku calls; rows must pass R4).
5. **Memory City heap fixtures** (branch `feat/memory-city`): if the op should run in the heap interpreter, add it to `PHASE0_OPS` in `backend/export_heap_fixtures.py` and run it from `backend/`; then `cd frontend && npm test` — every wrong line in the op's blanks/bugs/distractors must classify (never "unsupported"). Editing an op that is already in `PHASE0_OPS` also requires a re-export (`test_heap_fixtures_match_current_templates` fails otherwise).
6. **Play it**: start the dev environment (`/dev`), set a test user's mastery or start a session that serves `<op>`, and confirm: fill_blank blanks render, the hint animation plays, and the goal pattern matches the executor output.

No DB migration is needed — operations are plain strings in `mastery.operation`, not an enum.
