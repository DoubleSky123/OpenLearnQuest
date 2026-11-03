"""
Classroom load test: 30 students at once, Claude stubbed out.

Answers one question before a class: does one backend process stay responsive
when every student has the tutor streaming at the same time? The tutor route is
a sync generator, so each open stream holds a threadpool thread while it waits
for the next chunk, and every request checks out DB connections. Real Haiku is
replaced by fakes with realistic latency (tutor: 2–5 s to first token), so this
costs nothing and measures OUR side only. Anthropic 429s are not simulated.

Runs against a throwaway Postgres database (openlearnquest_loadtest on the same
server as DATABASE_URL — created if missing, schema rebuilt each run), never the
dev database. Run from backend/:

    d:/openLearnquest/venv/Scripts/python.exe load_test.py [--students 30] [--seconds 90]

Exit code 0 = every threshold passed.
"""
import argparse
import random
import statistics
import sys
import threading
import time
import uuid
from types import SimpleNamespace

import httpx
import uvicorn
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

import app.database as database
from app.config import settings
from app.main import app
from app.models import Base, User
from app.routes import tutor as tutor_route
from app.services import auth, claude_service, emotion_agent, tutor_agent, tutor_memory

# pass/fail thresholds (seconds) — fake first-token latency tops out at 5 s
THRESHOLDS = {
    "tutor_ttft_p95": 7.0,
    "session_next_p95": 2.0,
    "probe_p95": 1.0,      # GET /api/auth/me while everything else is busy
    "probe_max": 3.0,
}


# ── fake Claude ────────────────────────────────────────────────────────────────

class _FakeStream:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    @property
    def text_stream(self):
        time.sleep(random.uniform(2.0, 5.0))           # time to first token
        for word in ("What ", "does ", "head ", "point ", "to ", "after ", "your ", "first ", "step?"):
            time.sleep(0.05)
            yield word

    def get_final_message(self):
        return SimpleNamespace(stop_reason="end_turn", content=[],
                               usage=SimpleNamespace(input_tokens=900, output_tokens=40))


class _FakeClaude:
    def __init__(self):
        self.messages = SimpleNamespace(stream=lambda **kw: _FakeStream(), create=self._create)

    @staticmethod
    def _create(**kw):
        time.sleep(random.uniform(1.0, 2.0))
        body = '{"emotion": "engaged", "confidence": 0.6, "action": "none", "summary": "", "concepts": []}'
        return SimpleNamespace(content=[SimpleNamespace(text=body)])


def _install_fakes():
    fake = _FakeClaude()
    for mod in (tutor_route, tutor_agent, emotion_agent, tutor_memory, claude_service):
        mod._client = fake


# ── throwaway database ─────────────────────────────────────────────────────────

def _prepare_db() -> str:
    url = make_url(settings.database_url).set(database="openlearnquest_loadtest")
    admin = create_engine(make_url(settings.database_url).set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        if not c.execute(text("SELECT 1 FROM pg_database WHERE datname = 'openlearnquest_loadtest'")).scalar():
            c.execute(text("CREATE DATABASE openlearnquest_loadtest"))
    admin.dispose()

    # same engine settings as app/database.py, so pool behaviour matches production
    engine = create_engine(url)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    database.engine = engine
    database.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    tutor_memory.SessionLocal = database.SessionLocal   # imported by name at module load
    return url.render_as_string(hide_password=True)


def _make_students(n: int) -> list[str]:
    db = database.SessionLocal()
    tokens = []
    for i in range(n):
        u = User(email=f"load{i}-{uuid.uuid4().hex[:6]}@example.com", username=f"load{i}-{uuid.uuid4().hex[:6]}",
                 password_hash="x")
        db.add(u)
        db.commit()
        tokens.append(auth.create_access_token(u.id))
    db.close()
    return tokens


# ── simulated students ─────────────────────────────────────────────────────────

class Stats:
    def __init__(self):
        self.lock = threading.Lock()
        self.samples: dict[str, list[float]] = {}
        self.errors: list[str] = []
        self.notices = 0

    def add(self, key, value):
        with self.lock:
            self.samples.setdefault(key, []).append(value)

    def error(self, msg):
        with self.lock:
            self.errors.append(msg)


def _tutor_turn(http: httpx.Client, headers, session_id, q, stats: Stats):
    body = {
        "session_id": session_id, "question_id": q.get("id"), "question_title": q.get("title", ""),
        "operation": q.get("operation", ""), "question_type": q.get("question_type", "fill_blank"),
        "your_answer": [], "correct_answer": [], "error_count": 1,
        "user_message": "I don't get why this is wrong.",
    }
    t0 = time.monotonic()
    ttft = None
    with http.stream("POST", "/api/ai/tutor/stream", json=body, headers=headers) as r:
        if r.status_code != 200:
            stats.error(f"tutor HTTP {r.status_code}")
            return
        for line in r.iter_lines():
            if '"token"' in line and ttft is None:
                ttft = time.monotonic() - t0
            elif '"error"' in line:
                stats.error("tutor error event")
            elif '"notice"' in line:
                with stats.lock:
                    stats.notices += 1
    stats.add("tutor_total", time.monotonic() - t0)
    if ttft is not None:
        stats.add("tutor_ttft", ttft)


def _timed(stats: Stats, key, fn):
    t0 = time.monotonic()
    r = fn()
    stats.add(key, time.monotonic() - t0)
    if r.status_code >= 400:
        stats.error(f"{key} HTTP {r.status_code}: {r.text[:120]}")
    return r


def _student(base, token, stop_at, stats: Stats, barrier: threading.Barrier | None = None, rounds: int = 3):
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(base_url=base, timeout=60) as http:
        r = _timed(stats, "session_start", lambda: http.post(
            "/api/gm/session/start", headers=headers,
            json={"module_id": "singly", "mode": "stress-free", "operation": "insertAtHead"}))
        if r.status_code >= 400:
            return
        data = r.json()
        sid, q, n = data["session_id"], data["question"], 1
        if barrier is not None:
            # worst case: the whole class hits the tutor in the same instant
            for _ in range(rounds):
                barrier.wait()
                _tutor_turn(http, headers, sid, q, stats)
                time.sleep(20)   # 3 messages a minute, under the rate limit
            return
        time.sleep(random.uniform(0, 5))   # students don't all click at the same instant
        while time.monotonic() < stop_at:
            _tutor_turn(http, headers, sid, q, stats)
            _timed(stats, "infer_chat", lambda: http.post(
                "/api/emotion/infer-chat", headers=headers,
                json={"session_id": sid, "question_title": q.get("title"), "messages": []}))
            if random.random() < 0.5:
                r = _timed(stats, "session_next", lambda: http.post(
                    "/api/gm/session/next", headers=headers,
                    json={"session_id": sid, "operation": q.get("operation", "insertAtHead"),
                          "question_id": q.get("id", "x"), "question_number": n, "passed": True,
                          "error_count": 1, "time_ms": 30000, "planned_questions": 50}))
                if r.status_code < 400 and r.json().get("question"):
                    q, n = r.json()["question"], n + 1
            time.sleep(random.uniform(6, 12))   # think time; keeps us under the 6-per-minute limit


def _probe(base, token, stop: dict, stats: Stats):
    """Polls a cheap sync endpoint until the students finish: if the threadpool or
    the DB pool is starved, this is where it shows."""
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(base_url=base, timeout=60) as http:
        while time.monotonic() < stop["at"]:
            _timed(stats, "probe", lambda: http.get("/api/auth/me", headers=headers))
            time.sleep(0.5)


def _pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--students", type=int, default=30)
    ap.add_argument("--seconds", type=int, default=90)
    ap.add_argument("--port", type=int, default=8799)
    ap.add_argument("--burst", action="store_true",
                    help="every student sends a tutor message at the same instant, 3 rounds (ignores --seconds)")
    args = ap.parse_args()

    random.seed(7)
    _install_fakes()
    print(f"database: {_prepare_db()}")
    tokens = _make_students(args.students + 1)

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=args.port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    while not server.started:
        time.sleep(0.1)
    base = f"http://127.0.0.1:{args.port}"

    stats = Stats()
    barrier = threading.Barrier(args.students) if args.burst else None
    student_threads = [threading.Thread(target=_student, args=(base, t, float("inf") if args.burst else time.monotonic() + args.seconds, stats, barrier))
                       for t in tokens[:-1]]
    probe_stop = {"at": float("inf")}
    probe = threading.Thread(target=_probe, args=(base, tokens[-1], probe_stop, stats))
    print(f"{args.students} students, " + ("burst mode (3 rounds)" if args.burst else f"{args.seconds}s") + " ...")
    probe.start()
    for t in student_threads:
        t.start()
    for t in student_threads:
        t.join()
    probe_stop["at"] = 0
    probe.join()
    server.should_exit = True

    print(f"\n{'metric':<16}{'n':>6}{'p50':>8}{'p95':>8}{'max':>8}   (seconds)")
    for key in ("session_start", "tutor_ttft", "tutor_total", "infer_chat", "session_next", "probe"):
        xs = stats.samples.get(key, [])
        if xs:
            print(f"{key:<16}{len(xs):>6}{statistics.median(xs):>8.2f}{_pct(xs, 95):>8.2f}{max(xs):>8.2f}")
    print(f"errors: {len(stats.errors)}   rate-limit notices: {stats.notices}")
    for e in stats.errors[:10]:
        print(f"  - {e}")

    s = stats.samples
    checks = {
        "no errors": not stats.errors,
        f"tutor TTFT p95 <= {THRESHOLDS['tutor_ttft_p95']}s": bool(s.get("tutor_ttft")) and _pct(s["tutor_ttft"], 95) <= THRESHOLDS["tutor_ttft_p95"],
        f"session/next p95 <= {THRESHOLDS['session_next_p95']}s": args.burst or (  # burst mode only hits the tutor
            bool(s.get("session_next")) and _pct(s["session_next"], 95) <= THRESHOLDS["session_next_p95"]),
        f"probe p95 <= {THRESHOLDS['probe_p95']}s": bool(s.get("probe")) and _pct(s["probe"], 95) <= THRESHOLDS["probe_p95"],
        f"probe max <= {THRESHOLDS['probe_max']}s": bool(s.get("probe")) and max(s["probe"]) <= THRESHOLDS["probe_max"],
    }
    print()
    for name, ok in checks.items():
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
