---
name: tutor-sim
description: Simulate student conversations against the ReAct Socratic tutor (tutor_agent.py) without playing the game — verifies lookup_resource tool timing, type-aware vocabulary, no-answer-leak rule, and [STUDENT HISTORY] injection. Use after editing tutor_agent.py (system prompt, context block, tool schema, ReAct loop) or when asked to "test the tutor", "tutor sim", "模拟学生测 tutor".
---

# Tutor Agent Simulation

Tests `tutor_agent.chat()` directly with synthetic scenarios — normally reproducing a tutor behaviour means playing the game and deliberately failing twice. Use after any edit to `backend/app/services/tutor_agent.py`: `TUTOR_SYSTEM_PROMPT`, `build_context_block()`, the tool schema, or the ReAct loop.

`chat()` takes everything as parameters (history injection happens in `routes/tutor.py`), so no DB or server is needed.

## How to run

From `backend/` (needs `backend/.env` for the Anthropic key):

```bash
cd backend
d:/openLearnquest/venv/Scripts/python.exe ../.claude/skills/tutor-sim/tutor_sim.py [--scenario NAME] [--show-context]
```

- Full run = 8 scenarios ≈ 8–12 Haiku calls (~20s). `--scenario NAME` runs one.
- `--show-context` prints the built first-turn context block **without any API call** — use this (free) to eyeball `[TUTOR CONTEXT]` / `[STUDENT HISTORY]` changes after editing `build_context_block()`.
- `--auto-student N [--persona "..."]` — watch a full N-turn conversation unfold: Haiku role-plays the student, the transcript prints turn by turn (≈2 calls/turn). No pass/fail checks — this is for reading how the tutor actually behaves across a whole dialogue (verdict tone, when the video appears, whether it stays anchored on the error).
- Stochasticity note: single runs can flake; before declaring a prompt regression fixed, re-run the failing scenario several times (`for i in 1..6`). Judgment-sensitive rules work best injected in-context near the data (`[JUDGING]` in `build_context_block`) rather than only in the system prompt.

## Scenarios and what they enforce

| Scenario | Setup | Hard FAIL when | WARN when |
|---|---|---|---|
| `fresh_error1` | 1st error, ordering | empty reply | tool called (too eager) |
| `stuck_error2` | error_count=2 | empty reply | `lookup_resource` NOT called |
| `fill_blank_vocab` | fill_blank question | reply says "assembly" / "order you placed" | — |
| `give_up` | "just tell me the answer" | answer leak (correct line verbatim) | tool NOT called (policy: offer video on give-up) |
| `verdict_wrong_claim` | student states a wrong claim | reply lacks a verdict ("not quite"/"close") or leaks answer | — |
| `verdict_correct_claim` | student states a correct insight | reply lacks confirmation ("right"/"exactly"/"yes") | — |
| `third_turn_video` | tutor already asked 2 questions, student still stuck | empty reply | tool NOT called (2-questions-then-video policy) |
| `no_video_when_progressing` | 2 questions asked but student's last answer is CORRECT | reply lacks positive verdict | tool called (video must not interrupt momentum) |
| `history_recall` | `[STUDENT HISTORY]` injected | empty reply | — |

Tool-timing expectations are WARN not FAIL by design: *when* to call `lookup_resource` is the model's agentic decision. A one-off WARN is fine; **the same WARN on repeated runs means the system prompt drifted** — fix the prompt.

Exit code: 0 = no hard failures, 1 = at least one (leak / vocab / empty).

## Interpreting for the user

Show the per-scenario tutor replies (they're one-liners), then: any FAIL is a regression in `tutor_agent.py` that must be fixed before shipping — answer leaks are the most serious (the tutor's core contract is never revealing the answer). Suggest a targeted prompt fix, re-run the failing scenario only.

## Extending

New tutor behaviours (e.g. a new question type's vocabulary, a new tool) should get a scenario in `tutor_sim.py` `SCENARIOS` — copy an existing entry; `forbidden` (substring blacklist), `no_leak`, and `expect_tool` are the available check knobs.
