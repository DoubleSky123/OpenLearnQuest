---
name: gen-check
description: Regression-test the AI question-generation pipeline (prompts + validators in question_registry.py). Runs real Haiku generation for operations x {find_bug, ordering} and reports per-combo pass/retry/fail — with NO silent static fallback. Use after editing question_registry.py prompts or validators, static_questions.py TEMPLATES, question_spec.py, or when asked to "check generation", "test question generation", "gen check", "生成回归测试".
---

# Question-Generation Regression Check

Verifies that Claude Haiku + the per-type validators still produce valid questions for every operation. Use it after touching anything in the generation pipeline: `question_registry.py` (prompts/validators), `static_questions.py` (TEMPLATES), `question_spec.py`, or `claude_service.py`.

## Why not the built-in endpoint?

`POST /api/gm/test-generation` exists but (a) hardcodes `type_unlocked=2` so it only tests `find_bug`, and (b) goes through `generate_question()`, which silently falls back to a static question after 3 failed retries — a broken prompt still reports "pass". The script here calls `build_prompt → Claude → validate` directly, so real failures fail and retry counts are visible.

## How to run

From the `backend/` directory (the script imports `app.*` and needs `backend/.env` for the Anthropic key):

```bash
cd backend
d:/openLearnquest/venv/Scripts/python.exe ../.claude/skills/gen-check/gen_check.py --ops <op1,op2|all> [--types find_bug,ordering] [--intra 1|2|3]
```

- `--ops all` — full sweep: 12 ops × 2 types = 24 combos, 24–72 Haiku calls, roughly 1–3 minutes. Cheap (Haiku) but not free — prefer a scoped run when only one op or one type changed.
- `--ops removeDuplicates` — single-op check (e.g. after `/add-operation`).
- `--types ordering` — single-type check (e.g. after editing `_ordering_prompt` / `_ordering_validate`).
- `fill_blank` is intentionally not covered: it is fully static (no AI call). If `static_questions.py` `_BLANKS` changed, verify via the executor/UI instead.

Exit code 0 = all combos validated within `MAX_RETRIES` (3); 1 = at least one combo failed all retries (the last validator error is printed per failure).

## Choosing scope

| What changed | Run |
|---|---|
| One operation's TEMPLATES/`_BUGS` entry | `--ops <op>` |
| One type's prompt or validator | `--types <type>` |
| `question_spec.py`, `_sll_reject_reason`, shared helpers | `--ops all` |
| New operation added | `--ops <newOp>` (both types) |

## Interpreting results

- `pass` — validated on first attempt (healthy).
- `pass (needed N attempts)` — validated after retries. A few of these across a full sweep is normal; **the same combo consistently needing 2–3 attempts means the prompt is marginal** — tighten it rather than rely on retries.
- `FAIL` — all 3 attempts rejected. The printed validator error says why (e.g. SLL constraint rejection, bad JSON, wrong bug line). Fix the prompt/validator/template and re-run scoped to that combo.

Report the summary table to the user, call out any combo that needed retries, and for FAILs propose a concrete fix before editing.
