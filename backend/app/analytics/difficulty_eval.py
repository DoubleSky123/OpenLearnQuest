"""
Difficulty / emotion-adaptation evaluation.

Reads emotion_logs + question_attempts and reports whether the STATE axis
(emotion -> within-type difficulty + scaffolding) is actually helping, using
the metrics from docs/research-difficulty-adaptation.md section 7:

  1. Emotion distribution (by source)
  2. Emotion transition matrix    P(next emotion | current emotion)
  3. Intervention success rate    did an action move the student toward engaged?
  4. Difficulty oscillation        how often intra_difficulty reverses direction
  5. intra_difficulty / scaffold_level distributions
  6. Summary (engaged ratio, telemetry coverage)

Run:
    cd backend
    d:/openLearnquest/venv/Scripts/python.exe -m app.analytics.difficulty_eval
    d:/openLearnquest/venv/Scripts/python.exe -m app.analytics.difficulty_eval --email shi.kun@northeastern.edu
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict

from ..database import SessionLocal
from ..models.user import User
from ..models.emotion_log import EmotionLog
from ..models.question_attempt import QuestionAttempt
from ..models.game_session import GameSession

# Emotion "health" ranking — higher is closer to the engaged learning state.
HEALTH = {"engaged": 3, "confused": 2, "bored": 1, "frustrated": 0}
EMOTIONS = ["engaged", "confused", "frustrated", "bored"]


def _rule(title: str) -> None:
    print(f"\n{'=' * 4} {title} {'=' * 4}")


def _pct(n: int, d: int) -> str:
    return f"{(100.0 * n / d):.1f}%" if d else "n/a"


def emotion_distribution(logs: list[EmotionLog]) -> None:
    _rule("1. Emotion distribution (by source)")
    if not logs:
        print("  (no emotion logs)")
        return
    by_source: dict[str, Counter] = defaultdict(Counter)
    for l in logs:
        by_source[l.source][l.emotion] += 1
    for src, ctr in by_source.items():
        total = sum(ctr.values())
        parts = "  ".join(f"{e}={ctr.get(e, 0)} ({_pct(ctr.get(e, 0), total)})" for e in EMOTIONS)
        print(f"  [{src:11}] n={total}  {parts}")


def transition_matrix(logs: list[EmotionLog]) -> None:
    _rule("2. Emotion transition matrix  P(next | current), within session")
    # group by session, ordered by time
    by_session: dict[str, list[EmotionLog]] = defaultdict(list)
    for l in sorted(logs, key=lambda x: (x.session_id or "", x.timestamp)):
        by_session[l.session_id or "_none"].append(l)

    trans: dict[str, Counter] = defaultdict(Counter)
    for seq in by_session.values():
        for a, b in zip(seq, seq[1:]):
            trans[a.emotion][b.emotion] += 1

    if not any(trans.values()):
        print("  (not enough consecutive logs within sessions)")
        return
    header = "  from \\ to   " + "".join(f"{e[:5]:>9}" for e in EMOTIONS)
    print(header)
    for frm in EMOTIONS:
        row = trans.get(frm, Counter())
        total = sum(row.values())
        cells = "".join(f"{_pct(row.get(to, 0), total):>9}" for to in EMOTIONS)
        print(f"  {frm:11}{cells}   (n={total})")


def intervention_success(logs: list[EmotionLog]) -> None:
    _rule("3. Intervention success rate  (action -> next emotion improved?)")
    by_session: dict[str, list[EmotionLog]] = defaultdict(list)
    for l in sorted(logs, key=lambda x: (x.session_id or "", x.timestamp)):
        by_session[l.session_id or "_none"].append(l)

    by_action_total: Counter = Counter()
    by_action_ok: Counter = Counter()
    for seq in by_session.values():
        for cur, nxt in zip(seq, seq[1:]):
            act = cur.action_taken
            if not act or act == "none":
                continue
            by_action_total[act] += 1
            improved = HEALTH.get(nxt.emotion, 0) > HEALTH.get(cur.emotion, 0)
            maintained_engaged = cur.emotion == "engaged" and nxt.emotion == "engaged"
            if improved or maintained_engaged:
                by_action_ok[act] += 1

    if not by_action_total:
        print("  (no interventions with a following log — actions all 'none', or too little data)")
        return
    tot = sum(by_action_total.values())
    ok = sum(by_action_ok.values())
    print(f"  overall: {ok}/{tot} = {_pct(ok, tot)} improved (or stayed engaged) on the next log")
    for act, n in by_action_total.most_common():
        print(f"    {act:20} {by_action_ok.get(act, 0)}/{n} = {_pct(by_action_ok.get(act, 0), n)}")


def difficulty_oscillation(attempts: list[QuestionAttempt]) -> None:
    _rule("4. Difficulty oscillation (intra_difficulty reversals per session)")
    by_session: dict[str, list[QuestionAttempt]] = defaultdict(list)
    for a in attempts:
        if a.intra_difficulty is not None:
            by_session[a.session_id].append(a)

    rates: list[float] = []
    for sid, rows in by_session.items():
        rows.sort(key=lambda r: r.completed_at)
        seq = [r.intra_difficulty for r in rows]
        if len(seq) < 3:
            continue
        reversals = 0
        for i in range(2, len(seq)):
            d1 = seq[i - 1] - seq[i - 2]
            d2 = seq[i] - seq[i - 1]
            if d1 * d2 < 0:
                reversals += 1
        rate = reversals / (len(seq) - 2)
        rates.append(rate)
        print(f"  session {sid[:8]}: seq={seq}  reversals={reversals}  rate={rate:.2f}")
    if rates:
        print(f"  -> avg oscillation rate: {sum(rates) / len(rates):.2f}  (lower is better; 0 = monotonic)")
    else:
        print("  (need >=3 telemetered attempts in a session — keep testing)")


def telemetry_distributions(attempts: list[QuestionAttempt]) -> None:
    _rule("5. intra_difficulty / scaffold_level distributions")
    intra = Counter(a.intra_difficulty for a in attempts if a.intra_difficulty is not None)
    scaf = Counter(a.scaffold_level for a in attempts if a.scaffold_level is not None)
    if intra:
        print("  intra_difficulty:  " + "  ".join(f"L{k}={intra[k]}" for k in sorted(intra)))
    else:
        print("  intra_difficulty:  (none recorded yet)")
    if scaf:
        print("  scaffold_level:    " + "  ".join(f"S{k}={scaf[k]}" for k in sorted(scaf)))
    else:
        print("  scaffold_level:    (none recorded yet)")


def summary(logs: list[EmotionLog], attempts: list[QuestionAttempt]) -> None:
    _rule("6. Summary")
    if logs:
        eng = sum(1 for l in logs if l.emotion == "engaged")
        print(f"  engaged ratio (all logs):   {eng}/{len(logs)} = {_pct(eng, len(logs))}")
    n_tel = sum(1 for a in attempts if a.intra_difficulty is not None)
    print(f"  telemetry coverage:          {n_tel}/{len(attempts)} attempts have intra_difficulty "
          f"({_pct(n_tel, len(attempts))})")
    if n_tel == 0 and attempts:
        print("  NOTE: older attempts predate the telemetry埋点 — generate new attempts to populate it.")


def run(email: str | None) -> None:
    db = SessionLocal()
    try:
        if email:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                print(f"No user with email {email}")
                return
            uids = [user.id]
            print(f"Scope: user {user.username} ({email})")
        else:
            uids = [u.id for u in db.query(User.id).all()]
            print(f"Scope: all users (n={len(uids)})")

        logs = (db.query(EmotionLog)
                  .filter(EmotionLog.user_id.in_(uids))
                  .order_by(EmotionLog.timestamp).all())
        attempts = (db.query(QuestionAttempt)
                      .join(GameSession, GameSession.id == QuestionAttempt.session_id)
                      .filter(GameSession.user_id.in_(uids))
                      .order_by(QuestionAttempt.completed_at).all())

        print(f"emotion_logs={len(logs)}  question_attempts={len(attempts)}")
        emotion_distribution(logs)
        transition_matrix(logs)
        intervention_success(logs)
        difficulty_oscillation(attempts)
        telemetry_distributions(attempts)
        summary(logs, attempts)
    finally:
        db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Evaluate emotion/difficulty adaptation from the DB.")
    ap.add_argument("--email", help="restrict to one user's data", default=None)
    args = ap.parse_args()
    try:
        run(args.email)
    except Exception as e:  # pragma: no cover - diagnostic tool
        print(f"eval failed: {e}", file=sys.stderr)
        raise
