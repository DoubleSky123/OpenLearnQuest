"""Classroom-safety harness around the tutor stream route (no real Claude calls).

The fake client below stands in for anthropic's `messages.stream` context
manager; each scripted attempt either streams tokens or raises — before or
after the first token — so retry / partial / error paths are exercised end to
end through FastAPI, the in-memory DB and tutor_turns telemetry.
"""
import json
import pathlib
import re
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.dependencies import get_current_user
from app.main import app
from app.models import GameSession, TutorConversation, TutorMessage, TutorTurn, User
from app.routes import tutor as tutor_route
from app.services import tutor_agent, tutor_telemetry


class _Boom(Exception):
    """Stands in for an Anthropic overload / timeout."""


class _FakeStream:
    def __init__(self, script: dict):
        self.script = script

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    @property
    def text_stream(self):
        for tok in self.script.get("tokens", []):
            yield tok
        if self.script.get("fail_with"):
            raise self.script["fail_with"]
        if self.script.get("fail"):
            raise _Boom("overloaded_error: secret internal detail")

    def get_final_message(self):
        return SimpleNamespace(
            stop_reason=self.script.get("stop_reason", "end_turn"),
            usage=SimpleNamespace(input_tokens=100, output_tokens=20),
            content=self.script.get("content", []),
        )


class _FakeClient:
    """Each messages.stream() call consumes the next scripted attempt."""

    def __init__(self, *scripts):
        self.scripts = list(scripts)
        self.calls: list[dict] = []
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **kwargs):
        self.calls.append(kwargs)
        script = self.scripts.pop(0)
        if script.get("raise"):
            raise script["raise"]
        if script.get("fail_on_open"):
            raise _Boom("connection refused: secret internal detail")
        return _FakeStream(script)


@pytest.fixture()
def harness(db, monkeypatch):
    user = User(email="s@example.com", username="student", password_hash="x")
    db.add(user)
    db.commit()
    session = GameSession(user_id=user.id, module_id="singly", mode="challenge")
    db.add(session)
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user

    def use(*scripts):
        fake = _FakeClient(*scripts)
        monkeypatch.setattr(tutor_route, "_client", fake)
        return fake

    yield SimpleNamespace(db=db, user=user, session=session, use=use, client=TestClient(app))
    app.dependency_overrides.clear()


def _body(h, **over):
    body = {
        "session_id": h.session.id,
        "question_id": "q-123",
        "question_title": "Insert at Head",
        "operation": "insertAtHead",
        "question_type": "ordering",
        "your_answer": ["newNode = createNode(5);", "head = newNode;", "newNode.next = head;"],
        "correct_answer": ["newNode = createNode(5);", "newNode.next = head;", "head = newNode;"],
        "error_count": 1,
        "user_message": "why is this wrong?",
        "board_phase": "assembly",
    }
    body.update(over)
    return body


def _events(resp) -> list:
    out = []
    for line in resp.text.splitlines():
        if not line.startswith("data: "):
            continue
        payload = line[6:]
        out.append(payload if payload == "[DONE]" else json.loads(payload))
    return out


def _streamed_text(events) -> str:
    return "".join(e["token"] for e in events if isinstance(e, dict) and "token" in e)


def _only_turn(db) -> TutorTurn:
    turns = db.query(TutorTurn).all()
    assert len(turns) == 1
    return turns[0]


def _assistant_texts(db) -> list[str]:
    return [m.content for m in db.query(TutorMessage).filter(TutorMessage.role == "assistant").all()]


def test_happy_path_streams_and_records_telemetry(harness):
    harness.use({"tokens": ["What does ", "head point to?"]})
    resp = harness.client.post("/api/ai/tutor/stream", json=_body(harness))
    events = _events(resp)

    assert _streamed_text(events) == "What does head point to?"
    assert events[-1] == "[DONE]"
    assert _assistant_texts(harness.db) == ["What does head point to?"]

    turn = _only_turn(harness.db)
    assert turn.status == "ok"
    assert turn.question_id == "q-123" and turn.session_id == harness.session.id
    assert turn.board_phase == "assembly" and turn.error_count_claimed == 1
    assert (turn.input_tokens, turn.output_tokens) == (100, 20)
    assert turn.ttft_ms is not None and turn.total_ms is not None
    assert turn.model == tutor_agent.TUTOR_MODEL and turn.tutor_version == tutor_agent.TUTOR_VERSION
    assert turn.message_id is not None and turn.ended_at is not None


def test_client_cannot_choose_the_model(harness):
    fake = harness.use({"tokens": ["ok"]})
    harness.client.post("/api/ai/tutor/stream", json=_body(harness, model="claude-opus-expensive"))
    assert fake.calls[0]["model"] == tutor_agent.TUTOR_MODEL
    assert fake.calls[0]["timeout"] <= tutor_route.PER_CALL_TIMEOUT_S


def test_failure_before_any_token_retries_the_whole_turn_once(harness):
    fake = harness.use({"fail_on_open": True}, {"tokens": ["Second try."]})
    events = _events(harness.client.post("/api/ai/tutor/stream", json=_body(harness)))
    assert len(fake.calls) == 2
    assert _streamed_text(events) == "Second try."
    assert _only_turn(harness.db).status == "ok"


def test_a_4xx_is_not_retried(harness):
    """No credit / bad request fails the same way twice — don't spend the call."""
    import httpx
    from anthropic import BadRequestError, InternalServerError

    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    no_credit = BadRequestError("credit balance is too low", response=httpx.Response(400, request=req), body=None)
    overloaded = InternalServerError("overloaded", response=httpx.Response(529, request=req), body=None)
    assert not tutor_route._worth_retrying(no_credit)
    assert tutor_route._worth_retrying(overloaded)

    fake = harness.use({"raise": no_credit}, {"tokens": ["should not be reached"]})
    events = _events(harness.client.post("/api/ai/tutor/stream", json=_body(harness)))
    assert len(fake.calls) == 1
    assert [e["error"] for e in events if isinstance(e, dict) and "error" in e] == [tutor_route.GENERIC_ERROR]


def _stream_error(error_type: str):
    """What the SDK raises for an `event: error` in the middle of a stream: the HTTP
    response was a 200, so status_code is 200 and only the body says what failed."""
    import httpx
    from anthropic import APIStatusError

    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    body = {"type": "error", "error": {"type": error_type, "message": "secret internal detail"}}
    return APIStatusError(str(body), response=httpx.Response(200, request=req), body=body)


def test_an_overload_in_the_middle_of_a_stream_is_retried(harness):
    """The most common failure with a class on the tutor at once."""
    assert tutor_route._worth_retrying(_stream_error("overloaded_error"))
    assert tutor_route._worth_retrying(_stream_error("api_error"))
    assert not tutor_route._worth_retrying(_stream_error("invalid_request_error"))

    fake = harness.use({"tokens": [], "fail_with": _stream_error("overloaded_error")},
                       {"tokens": ["Second try."]})
    events = _events(harness.client.post("/api/ai/tutor/stream", json=_body(harness)))
    assert len(fake.calls) == 2
    assert _streamed_text(events) == "Second try."
    assert _only_turn(harness.db).status == "ok"


def test_two_failures_show_a_generic_error_never_the_exception(harness):
    harness.use({"fail_on_open": True}, {"tokens": [], "fail": True})
    resp = harness.client.post("/api/ai/tutor/stream", json=_body(harness))
    events = _events(resp)
    errors = [e["error"] for e in events if isinstance(e, dict) and "error" in e]
    assert errors == [tutor_route.GENERIC_ERROR]
    assert "secret" not in resp.text
    assert _assistant_texts(harness.db) == []
    assert _only_turn(harness.db).status == "error"


def test_failure_after_text_was_shown_closes_the_reply_as_partial(harness):
    fake = harness.use({"tokens": ["Look at step one"], "fail": True})
    events = _events(harness.client.post("/api/ai/tutor/stream", json=_body(harness)))
    assert len(fake.calls) == 1, "text already reached the student, so no retry"
    expected = "Look at step one" + tutor_route.PARTIAL_TAIL
    assert _streamed_text(events) == expected
    assert _assistant_texts(harness.db) == [expected]
    assert _only_turn(harness.db).status == "partial"


def test_tool_calls_record_name_and_concept_but_never_the_reason(harness):
    tool_block = SimpleNamespace(
        type="tool_use", id="tu_1", name="lookup_resource",
        input={"concept": "pointer_assignment", "reason": "student said 'I am lost on line 2'"},
    )
    harness.use(
        {"tokens": ["Here is a video. "], "stop_reason": "tool_use", "content": [tool_block]},
        {"tokens": ["Watch the pointer order."]},
    )
    harness.client.post("/api/ai/tutor/stream", json=_body(harness))
    turn = _only_turn(harness.db)
    assert turn.tool_calls == [{"name": "lookup_resource", "concept": "pointer_assignment"}]
    assert "reason" not in json.dumps(turn.tool_calls)
    assert "youtube.com" in _assistant_texts(harness.db)[0], "a fetched video's link is always appended"


def _flood(h, n, prefix=""):
    conv = TutorConversation(user_id=h.user.id, session_id=h.session.id,
                             operation="insertAtHead", question_title=f"Insert at Head {prefix}{n}", message_count=n)
    h.db.add(conv)
    h.db.commit()
    for i in range(n):
        h.db.add(TutorMessage(conversation_id=conv.id, role="user", content=f"{prefix}msg {i}",
                              created_at=datetime.utcnow()))
    h.db.commit()


def test_rate_limit_returns_a_notice_without_calling_the_model(harness):
    _flood(harness, tutor_telemetry.RATE_LIMIT_MESSAGES)
    fake = harness.use()
    before = harness.db.query(TutorMessage).count()
    events = _events(harness.client.post("/api/ai/tutor/stream", json=_body(harness)))

    assert events == [{"notice": tutor_route.RATE_NOTICE}, "[DONE]"]
    assert fake.calls == []
    assert harness.db.query(TutorMessage).count() == before, "a rejected message is not stored"
    assert _only_turn(harness.db).status == "rate_limited"


def test_proactive_push_is_never_rate_limited(harness):
    _flood(harness, tutor_telemetry.RATE_LIMIT_MESSAGES)
    harness.use({"tokens": ["What happens to the old head?"]})
    body = _body(harness, user_message="[PROACTIVE_INIT] The student is struggling.")
    events = _events(harness.client.post("/api/ai/tutor/stream", json=body))
    assert _streamed_text(events) == "What happens to the old head?"
    assert _only_turn(harness.db).proactive is True


def test_the_proactive_prefix_is_not_a_way_around_the_limit(harness):
    """[PROACTIVE_INIT] is plain text a client can type: past the few real pushes a
    minute can hold, those messages count like any other."""
    P = tutor_telemetry.PROACTIVE_PREFIX
    _flood(harness, tutor_telemetry.RATE_LIMIT_MESSAGES + tutor_telemetry.PROACTIVE_FREE, prefix=P + " ")
    fake = harness.use()
    events = _events(harness.client.post("/api/ai/tutor/stream", json=_body(harness)))
    assert events == [{"notice": tutor_route.RATE_NOTICE}, "[DONE]"]
    events = _events(harness.client.post("/api/ai/tutor/stream",
                                         json=_body(harness, user_message=P + " again")))
    assert events == [{"notice": tutor_route.RATE_NOTICE}, "[DONE]"]
    assert fake.calls == []


def _mistakes(h, n, question_id="q-123"):
    from app.models import Mistake
    for _ in range(n):
        h.db.add(Mistake(user_id=h.user.id, question_id=question_id, source="agentic",
                         title="Insert at Head", your_answer=[], correct_answer=[], explanation=""))
    h.db.commit()


def test_the_final_hint_needs_mistakes_the_server_saw(harness):
    """The client's error_count is a claim; the final hint (the tutor may state the
    step) is honoured only for the board mistakes that were actually posted."""
    harness.use({"tokens": ["ok"]}, {"tokens": ["ok"]}, {"tokens": ["ok"]})
    body = _body(harness, final_hint=True, error_count=9, user_message="just tell me")
    harness.client.post("/api/ai/tutor/stream", json=body)
    _mistakes(harness, tutor_agent.FINAL_HINT_MIN_ERRORS, question_id="another-question")
    _mistakes(harness, tutor_agent.FINAL_HINT_MIN_ERRORS - 1)
    harness.client.post("/api/ai/tutor/stream", json=body)
    _mistakes(harness, 1)
    harness.client.post("/api/ai/tutor/stream", json={**body, "user_message": "and now?"})
    turns = harness.db.query(TutorTurn).order_by(TutorTurn.started_at).all()
    assert [t.final_hint for t in turns] == [False, False, True]


def test_legacy_post_hides_exception_text(harness, monkeypatch):
    def boom(**kw):
        raise _Boom("secret internal detail")
    monkeypatch.setattr(tutor_agent, "chat", boom)
    resp = harness.client.post("/api/ai/tutor", json=_body(harness))
    assert resp.status_code == 503
    assert resp.json()["detail"] == tutor_route.GENERIC_ERROR
    assert _only_turn(harness.db).status == "error"


def test_every_anthropic_client_comes_from_the_factory():
    """Only anthropic_client.py may construct Anthropic(): everything else must
    inherit its timeouts (the SDK default is 10 minutes)."""
    app_dir = pathlib.Path(__file__).resolve().parents[1] / "app"
    offenders = [
        str(p.relative_to(app_dir)) for p in app_dir.rglob("*.py")
        if p.name != "anthropic_client.py" and re.search(r"\bAnthropic\(", p.read_text(encoding="utf-8"))
    ]
    assert offenders == []


def test_reviewing_is_honoured_only_once_the_attempt_is_recorded(harness):
    """"reviewing" lets the tutor explain the answer outright. A client can send it
    while still solving; the server believes it only after the attempt exists."""
    from app.models import QuestionAttempt
    fake = harness.use({"tokens": ["ok"]}, {"tokens": ["ok"]})
    body = _body(harness, phase="reviewing", user_message="why is step 2 first?")
    harness.client.post("/api/ai/tutor/stream", json=body)
    harness.db.add(QuestionAttempt(session_id=harness.session.id, question_id="q-123", difficulty=1,
                                   passed=True, error_count=1))
    harness.db.commit()
    harness.client.post("/api/ai/tutor/stream", json={**body, "user_message": "and now?"})
    turns = harness.db.query(TutorTurn).order_by(TutorTurn.started_at).all()
    assert [t.phase for t in turns] == ["solving", "reviewing"]
    assert fake.calls[0]["system"] == tutor_agent.system_prompt_for("solving", False)
    assert fake.calls[1]["system"] == tutor_agent.system_prompt_for("reviewing", False)


def test_another_questions_mistakes_do_not_unlock_the_final_hint(harness):
    harness.use({"tokens": ["ok"]})
    from app.models import Mistake
    for _ in range(tutor_agent.FINAL_HINT_MIN_ERRORS):
        harness.db.add(Mistake(user_id=harness.user.id, question_id="q-123", source="agentic",
                               title="Reverse List", your_answer=[], correct_answer=[], explanation=""))
    harness.db.commit()
    harness.client.post("/api/ai/tutor/stream",
                        json=_body(harness, final_hint=True, error_count=9, user_message="just tell me"))
    assert _only_turn(harness.db).final_hint is False


def test_a_rate_limit_is_not_retried_by_the_route(harness):
    """The SDK already honoured retry-after once; a second turn from every student
    in a throttled class at the same moment only keeps the limit in place."""
    import httpx
    from anthropic import RateLimitError
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    limited = RateLimitError("rate limited", response=httpx.Response(429, request=req), body=None)
    assert not tutor_route._worth_retrying(limited)
    assert not tutor_route._worth_retrying(_stream_error("rate_limit_error"))
    fake = harness.use({"raise": limited}, {"tokens": ["should not be reached"]})
    events = _events(harness.client.post("/api/ai/tutor/stream", json=_body(harness)))
    assert len(fake.calls) == 1
    assert [e["error"] for e in events if isinstance(e, dict) and "error" in e] == [tutor_route.GENERIC_ERROR]


def test_a_crafted_oversized_request_is_refused(harness):
    fake = harness.use()
    r = harness.client.post("/api/ai/tutor/stream", json=_body(harness, board_note="x" * 100_000))
    assert r.status_code == 422 and fake.calls == []


def test_a_long_conversation_keeps_working(harness):
    """TutorChat resends the whole restored conversation every turn. A cap that
    rejected it locked the heaviest tutor users out for the rest of the session;
    the server keeps the recent tail instead."""
    harness.use({"tokens": ["Still here."]})
    history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"turn {i}"} for i in range(90)]
    events = _events(harness.client.post("/api/ai/tutor/stream", json=_body(harness, messages=history)))
    assert _streamed_text(events) == "Still here."


def test_an_oversized_free_form_field_is_refused(harness):
    fake = harness.use()
    r = harness.client.post("/api/ai/tutor/stream",
                            json=_body(harness, error_diagnosis={"error_type": "x", "detail": "x" * 100_000}))
    assert r.status_code == 422 and fake.calls == []


def test_chat_emotion_inference_is_rate_limited(harness, monkeypatch):
    """Each infer-chat is a paid model call; a looping client gets the neutral
    label without one."""
    from app.routes import emotion as emotion_route
    from app.services import emotion_agent
    calls = []
    monkeypatch.setattr(emotion_agent, "infer_from_chat",
                        lambda messages: calls.append(1) or {"emotion": "confused", "confidence": 0.8, "action": "none"})
    for _ in range(emotion_route.CHAT_INFER_MAX + 5):
        r = harness.client.post("/api/emotion/infer-chat", json={"messages": [{"role": "user", "content": "x"}]})
        assert r.status_code == 200
    assert len(calls) == emotion_route.CHAT_INFER_MAX


def test_the_generation_self_test_is_for_admins_only(harness):
    """Up to 20 questions x 3 model attempts per request: not a student endpoint."""
    r = harness.client.post("/api/gm/test-generation", json={"operation": "insertAtHead", "n": 20})
    assert r.status_code == 403
