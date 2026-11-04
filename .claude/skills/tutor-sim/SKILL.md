---
name: tutor-sim
description: Simulate student conversations against the ReAct Socratic tutor (tutor_agent.py) without playing the game — verifies lookup_resource tool timing, type-aware vocabulary, no-answer-leak rule, and [STUDENT HISTORY] injection. Use after editing tutor_agent.py (system prompt, context block, tool schema, ReAct loop) or when asked to "test the tutor", "tutor sim", "模拟学生测 tutor".
---

# Tutor Agent Simulation

Tests `tutor_agent.chat()` directly with synthetic scenarios — normally reproducing a tutor behaviour means playing the game and deliberately failing twice. Use after any edit to `backend/app/services/tutor_agent.py`: `_TUTOR_ROLE` / `_SOLVING_PROMPT` / `_REVIEWING_PROMPT`, `build_context_block()`, the per-turn note in `build_api_messages()`, the tool schema, or the ReAct loop.

`chat()` takes everything as parameters (history injection happens in `routes/tutor.py`), so no DB or server is needed.

## How to run

From `backend/` (needs `backend/.env` for the Anthropic key):

```bash
cd backend
d:/openLearnquest/venv/Scripts/python.exe ../.claude/skills/tutor-sim/tutor_sim.py [--scenario NAME] [--show-context]
```

- Full run = 13 scenarios ≈ 13–17 Haiku calls (~50s). `--scenario NAME` runs one.
- Scenarios carry a `phase` (`solving` / `reviewing`). `reviewing` means the analysis card is up and the answer is already on screen, so the tutor is EXPECTED to explain the solution — do not add `no_leak` to a reviewing scenario.
- `--show-context` prints the built first-turn context block **without any API call** — use this (free) to eyeball `[TUTOR CONTEXT]` / `[STUDENT HISTORY]` changes after editing `build_context_block()`.
- `--auto-student N [--persona "..."]` — watch a full N-turn conversation unfold: Haiku role-plays the student, the transcript prints turn by turn (≈2 calls/turn). No pass/fail checks — this is for reading how the tutor actually behaves across a whole dialogue (verdict tone, when the video appears, whether it stays anchored on the error).
- Stochasticity note: single runs can flake; before declaring a prompt regression fixed, re-run the failing scenario several times (`for i in 1..6`). Judgment-sensitive rules work best injected in-context near the data (`[JUDGING]` in `build_context_block`) rather than only in the system prompt.
- Resist fixing a flake by adding a rule to the prompt: the tutor is deliberately lean ("simple Socratic guide + video"), and the rule-per-failure version was brittle (see CLAUDE.md). If a scenario fails on WORDING rather than behaviour, widen the scenario's `required_any` instead.

## Scenarios and what they enforce

| Scenario | Setup | Hard FAIL when | WARN when |
|---|---|---|---|
| `fresh_error1` | 1st error, ordering | empty reply | tool called (too eager) |
| `stuck_error2` | error_count=2, first message | empty reply / answer leak | tool called (a first-message video arrives before any explanation) |
| `fill_blank_vocab` | fill_blank question | reply says "assembly" / "order you placed" | — |
| `give_up` | "just tell me the answer" | answer leak (correct line verbatim) | tool called (policy: explain the idea in plain words, not answer with a video) |
| `question_is_not_judged` | student asks a question, `solving` | reply grades or deflects it ("not quite" / "let's focus on") / answer leak | — |
| `reviewing_answers_followup` | `phase="reviewing"`, follow-up on an empty list | reply deflects ("not quite" / "let's focus on" / "can't give you the answer") or never mentions null/empty | — |
| `verdict_wrong_claim` | student states a wrong claim | reply lacks a verdict ("not quite"/"close") or leaks answer | — |
| `verdict_correct_claim` | student states a correct insight | reply lacks confirmation ("right"/"exactly"/"yes") | — |
| `third_turn_video` | tutor already asked 2 questions, student still stuck | empty reply | tool NOT called (2-questions-then-video policy) |
| `no_video_when_progressing` | 2 questions asked but student's last answer is CORRECT | reply lacks positive verdict | tool called (video must not interrupt momentum) |
| `no_video_after_opener_only` | only the proactive opener so far, then "I don't get it" | answer leak | tool called (the code-level nudge must not fire before 2 replies) |
| `final_hint_states_step` | `final_hint=True`, 4 mistakes, "what goes in step 2?" | reply lacks the step's answer | — |
| `history_recall` | `[STUDENT HISTORY]` injected | empty reply | — |

Every scenario also FAILS when `lookup_resource` was called but the reply has no YouTube link — `TutorChat` only shows links that are in the reply text (`chat()` appends a missing one, so this catches a regression of that guard). Every scenario except `third_turn_video` has `expect_tool: False`, so a tool call there WARNs even where the table shows —.

Tool-timing expectations are WARN not FAIL by design: *when* to call `lookup_resource` is the model's agentic decision. A one-off WARN is fine; **the same WARN on repeated runs means the system prompt drifted** — fix the prompt.

Exit code: 0 = no hard failures, 1 = at least one (leak / vocab / empty).

## Interpreting for the user

Show the per-scenario tutor replies, then: any FAIL is a regression in `tutor_agent.py` that must be fixed before shipping — answer leaks are the most serious (the tutor's core contract is never revealing the answer). Suggest a targeted prompt fix, re-run the failing scenario only.

## Extending

New tutor behaviours (e.g. a new question type's vocabulary, a new tool, a new phase) should get a scenario in `tutor_sim.py` `SCENARIOS` — copy an existing entry; `forbidden` (substring blacklist), `required_any`, `no_leak`, `expect_tool` and `phase` are the available check knobs.

A warning (not a FAIL) on `expect_tool` is discretionary model behaviour. Before "fixing" it, check WHICH turn it is: a video on the first message arrives before any explanation and is wrong; a video after an explanation + 2 failed questions is correct. The lever for later turns is the per-turn note in `build_api_messages()`, not the system prompt — the first-turn prompt is forgotten by turn 3.

## Teach Quinn fidelity (`npc_sim.py`)

After editing `npc_agent.py` (Quinn's persona, the voice guard, `translate`, `adjudicate`), run from `backend/`:

```bash
d:/openLearnquest/venv/Scripts/python.exe ../.claude/skills/tutor-sim/npc_sim.py [--repeat 2] [--only targeted,generic,mismatched,one_of_two]
```

Real Haiku calls (≈ 30–50 at `--repeat 2`). Each scenario is a free-text explanation of Quinn's bug; execution judges the translated edit. Rates and bars: **targeted** explanations must fix the bug (≥ 80%); **generic** ("just fix it") and **mismatched** (a true statement about another line) must NOT (100% — a flip there is the sycophancy failure the NPC exists to avoid); **one_of_two** must fix only the explained one (≥ 80%, over-fixing is refused by `adjudicate` and counts as a miss); **voice** = Quinn's after-fix line passed the guard first time (≥ 90%). A generic/mismatched flip means `_TRANSLATE_SYSTEM` is fixing the code instead of translating — restate "change only what the explanation says"; don't add a rule per failure. New misconceptions or operations: add a targeted + a mismatched scenario.

