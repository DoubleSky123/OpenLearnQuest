---
name: add-operation
description: Checklist workflow for adding a new linked-list operation to OpenLearnQuest. Adding an operation touches ~10 files across backend and frontend (templates, blanks, bugs, executor, concept graph, level tiers, animations); missing any one is a runtime-only bug. Use when asked to "add a new operation", "add removeDuplicates", "support a new linked-list op", "新增操作", or when editing TEMPLATES in static_questions.py to add a key.
---

# Add a New Linked-List Operation

Adding one operation requires coordinated edits in **many** per-operation registries. Work through every step below in order; do not skip a step without explicitly telling the user why it doesn't apply.

Throughout: `<op>` is the new operation's camelCase id (e.g. `removeDuplicates`). Match the exact style of the existing 12 entries in each file.

## Step 0 — Decide the operation's shape first

Before editing anything, pin down with the user (or infer and state):
- **Pseudocode** (3–5 steps, same style as existing TEMPLATES entries — semicolons, `NULL`, `.next`, no `.prev` unless justified)
- **Tier**: level 1 (basic head/tail), 2 (position/empty/whole-list), or 3 (algorithms like reverse/merge)
- **Meta**: `needsValue` (takes a value?), `needsPosition` (takes an index?), `minNodes` (minimum starting list size)

## Step 1 — Backend registries

### 1a. `backend/app/services/static_questions.py` — FOUR dicts, all required

1. **`TEMPLATES`** (top of file): full entry with `title`, `pseudocode`, `correctOrder`, `hint`, `distractors` (3 plausible-but-wrong lines), `needsValue`, `needsPosition`, `minNodes`. Add `validOrders` only if some steps genuinely commute (e.g. `createNode` before vs. after traversal — see `insertAtTail`).
2. **`_BLANKS`**: 2 blank sets; each set has one `{"a": answer, "w": [wrong1, wrong2]}` per pseudocode step. **Constraint**: each `"a"` must be an exact substring of the same-index pseudocode step (`str.replace(a, "___", 1)` must hit).
3. **`_BUGS`**: one entry `{line, buggy, fix, explanation, options}` — `line` is the 0-indexed pseudocode step to corrupt, `options` includes the fix plus 2 wrong candidates.
4. **`CONSIDER`**: 1–2 post-question extension questions (shown on the analysis card; "Ask the tutor" seeds the chat with one). Falls back to a generic question if missing, but write real ones.

### 1b. `backend/app/services/claude_service.py` — `OP_META`

Add a row mirroring `title` / `needsValue` / `needsPosition` / `minNodes` from TEMPLATES. (Yes, it's duplicated between the two files — keep them identical.)

### 1c. `backend/app/services/ll_executor.py` — `execute_operation()`

Add a branch that returns the final node list for the operation (this is the Python mirror of the JS executor and produces the `goalPattern` shown to students). Place it in the section matching its tier (Level 1/2/3 comment banners). `validate_question()` depends on this — an op without a branch falls through to the generic tail of the function.

### 1d. `backend/app/services/concept_graph.py` — `OP_CONCEPTS`

Map `<op>` to its concepts (subset of: `pointer_assignment`, `traversal`, `memory_management`, `node_creation`, `list_structure`). This drives concept mastery tracking and the tutor's resource lookup.

### 1e. `backend/app/services/game_master.py` — `LEVEL_OPS`

Add `<op>` to the chosen tier list. `ALL_OPS` derives from it automatically.

### 1f. `backend/app/services/question_registry.py` — special-case sets (check, may be no-op)

- `_PREV_ALLOWED_OPS` — add `<op>` **only** if its pseudocode legitimately uses `prev` (like `reverseList`); otherwise the SLL validator rejects generated questions containing `prev`.
- `_PARALLEL_CREATE_OPS` — add `<op>` if `createNode` can be reordered relative to traversal (must be consistent with `validOrders` in TEMPLATES).

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

- `CLAUDE.md` → "Supported Operations" section: add `<op>` and bump the count.
- `README.md` → both operation lists (search for `insertAtHead` to find them).

## Step 4 — Verify

1. **Consistency sweep**: `grep -rn "<op>"` across `backend/` and `frontend/src/` — confirm it appears in every location from Steps 1–2 (minus justified skips).
2. **Executor sanity** (from `backend/`): run the venv python and call `ll_executor.execute_operation("<op>", nodes, ...)` on a small list; check the result by hand.
3. **Generation check**: run `/gen-check` scoped to the new op (`--ops <op>`) — verifies the AI pipeline (find_bug + ordering prompts/validators) works for it.
4. **Play it**: start the dev environment (`/dev`), set a test user's mastery or start a session that serves `<op>`, and confirm: fill_blank blanks render, the hint animation plays, and the goal pattern matches the executor output.

No DB migration is needed — operations are plain strings in `mastery.operation`, not an enum.
