---
name: eval-adaptivity
description: Evaluate whether the two-axis adaptive system (ZPD difficulty controller + scaffold orchestrator) is actually working, from real telemetry in the DB. Wraps app/analytics/difficulty_eval.py and adds a ZPD error-rate check against the 25–30% target. Use after tuning compute_intra_difficulty/useScaffold/emotion_agent, after collecting new play sessions, or when asked to "evaluate adaptivity", "check the difficulty controller", "自适应评估".
---

# Adaptive-System Evaluation

Offline evaluation of the state axis (emotion → within-type difficulty + scaffolding) from `emotion_logs` + `question_attempts` telemetry. Read-only, no API calls, free to run.

Run it after: tuning `game_master.compute_intra_difficulty` or `hooks/useScaffold.js`, changing `emotion_agent` rules, or accumulating new play sessions worth checking.

## 1. Run the built-in evaluator

From `backend/` (module mode, needs the DB running):

```bash
cd backend
d:/openLearnquest/venv/Scripts/python.exe -m app.analytics.difficulty_eval [--email <user email>]
```

`--email` scopes to one user — useful when evaluating a specific test account instead of averaging over everyone.

## 2. Add the ZPD target check (evaluator doesn't cover it)

The controller targets a **25–30% error rate**; `difficulty_eval.py` reports oscillation/distributions but not this. Compute it separately:

```bash
d:/openLearnquest/venv/Scripts/python.exe -c "
import sys; sys.path.insert(0, '.')
from app.database import SessionLocal
from app.models.question_attempt import QuestionAttempt
db = SessionLocal()
rows = db.query(QuestionAttempt).filter(QuestionAttempt.intra_difficulty.isnot(None)).all()
n = len(rows); fails = sum(1 for r in rows if not r.passed)
print(f'telemetered attempts: {n}, error rate: {fails}/{n} = {100*fails/n:.1f}% (ZPD target 25-30%)' if n else 'no telemetered attempts yet')
db.close()"
```

## 3. Interpreting the six report sections

| Section | Healthy looks like | Red flag |
|---|---|---|
| 1. Emotion distribution | mostly `engaged`, per source | one source (behavioral vs tutor_chat) wildly disagreeing with the other → check that inference path |
| 2. Transition matrix | `frustrated → engaged/confused` transitions exist | `frustrated → frustrated` dominant → interventions not landing |
| 3. Intervention success | >50% of actions followed by improvement; **closed-loop subsection** (from `emotion_logs.outcome`) is authoritative once populated — per-action pass rates + avg errors | a specific `action_taken` consistently <50% → that intervention is miscalibrated |
| 4. Difficulty oscillation | avg rate ≈ 0 — the EMA+hysteresis controller (2026-07) should produce monotonic staircases | rate creeping back up → controller thresholds/confirmations were changed without re-running `tests/test_intra_controller.py` |
| 5. Distributions | intra_difficulty spread across L1–L3 | stuck at one level → controller output is pinned; check `compute_intra_difficulty` inputs |
| 6. Summary + ZPD check | error rate 25–30%, telemetry coverage high | error rate ≪25% = too easy (bored risk); ≫30% = too hard (frustration risk). Low coverage = old pre-telemetry data — judge from recent sessions only |

## Caveats

- Small n makes every metric noisy — with under ~30 telemetered attempts, report the numbers but say the sample is too small for tuning decisions.
- Attempts predating the telemetry migration have NULL `intra_difficulty` and are excluded; the coverage line in section 6 tells you how much data is actually usable.
- If a metric looks off, the tunable surfaces are: `game_master.compute_intra_difficulty` (gain/targets), `question_spec.INTRA_KNOBS` (what each level means), `hooks/useScaffold.js` (scaffold climb/fade), `emotion_agent` rules (inference itself).

Report the six sections + ZPD check as a short verdict per section, not a raw dump.
