"""Claude Haiku 5.5 request/response contract (services/anthropic_client.py).

Haiku 5.5 thinks by default (a response can START with thinking blocks),
rejects temperature/top_p/top_k and assistant prefill, and can decline with
stop_reason "refusal". These pin the code to that."""
import pathlib
import re
from types import SimpleNamespace

import pytest

from app.services import anthropic_client as ac

APP = pathlib.Path(__file__).resolve().parents[1] / "app"


def _msg(*blocks, stop="end_turn", category=None):
    return SimpleNamespace(stop_reason=stop, content=list(blocks),
                           stop_details=SimpleNamespace(category=category) if category else None)


def test_text_is_read_past_leading_thinking_blocks():
    m = _msg(SimpleNamespace(type="thinking", thinking="", signature="sig"),
             SimpleNamespace(type="text", text=" the answer "))
    assert ac.text_of(m) == "the answer"


def test_a_refusal_raises_instead_of_returning_empty_text():
    with pytest.raises(ac.RefusedError):
        ac.text_of(_msg(stop="refusal", category="general_harms"))


def test_every_purpose_has_an_explicit_effort():
    assert set(ac.EFFORT) == set(ac.PROFILES)
    for purpose in ac.PROFILES:
        assert ac.options(purpose) == {"model": ac.MODEL, "output_config": {"effort": ac.EFFORT[purpose]}}


def test_no_call_site_sends_sampling_params_or_an_old_model():
    """temperature/top_p/top_k 400 on Haiku 5.5; the model ID lives in one place."""
    for path in APP.rglob("*.py"):
        src = path.read_text(encoding="utf-8")
        assert not re.search(r"\b(temperature|top_p|top_k)\s*=", src), path
        if path.name != "anthropic_client.py":
            assert not re.search(r"\"claude-(haiku|sonnet|opus)-[\w-]+\"", src), path


def test_reply_text_is_never_read_by_position():
    """content[0].text breaks when the response starts with a thinking block."""
    for path in APP.rglob("*.py"):
        if path.name != "anthropic_client.py":      # its comment explains the rule
            assert "content[0].text" not in path.read_text(encoding="utf-8"), path
