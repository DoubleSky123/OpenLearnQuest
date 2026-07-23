"""Behavioural contract of the ZPD difficulty controller (EMA + hysteresis).

The controller replaced a windowed-rate version whose observed oscillation
rate was 0.5/session. These tests are the proof the replacement holds:
smooth staircases, no flapping, emotion as gain only.
"""
from app.services.game_master import _intra_from_history

E, P = True, False   # E = error on that question, P = perfect pass


def trajectory(flags, emotion="engaged"):
    """Level after each question — what a student would actually experience."""
    return [_intra_from_history(flags[: i + 1], emotion) for i in range(len(flags))]


def reversals(levels):
    r = 0
    for i in range(2, len(levels)):
        d1, d2 = levels[i - 1] - levels[i - 2], levels[i] - levels[i - 1]
        if d1 * d2 < 0:
            r += 1
    return r


def test_no_history_seeds_medium():
    assert _intra_from_history([]) == 2


def test_cruising_student_ramps_up_and_stays():
    t = trajectory([P] * 6)
    assert t[-1] == 3
    assert reversals(t) == 0          # a clean staircase, never back down


def test_struggling_student_eases_and_stays():
    t = trajectory([E] * 6)
    assert t[-1] == 1
    assert reversals(t) == 0


def test_band_edge_mix_does_not_flap():
    # ~33% error rate — right at the target band's edge. The old controller
    # flipped levels here; the new one must hold nearly still.
    t = trajectory([P, P, E, P, P, E, P, P, E])
    assert reversals(t) <= 1


def test_single_error_never_drops_the_level():
    # one unlucky question inside an otherwise-fine run
    t = trajectory([P, E, P])
    assert t == [2, 2, 2]


def test_levels_move_one_step_at_a_time():
    for flags in ([P] * 8, [E] * 8, [P, P, E, E, P, E, P, P]):
        t = trajectory(flags)
        assert all(abs(b - a) <= 1 for a, b in zip(t, t[1:]))


def test_frustrated_eases_faster_than_engaged():
    flags = [E, E]
    assert _intra_from_history(flags[:1], "frustrated") == 1   # single confirmation
    assert _intra_from_history(flags[:1], "engaged") == 2      # still deliberating


def test_bored_ramps_faster_than_engaged():
    assert _intra_from_history([P], "bored") == 3
    assert _intra_from_history([P], "engaged") == 2


def test_confused_is_neutral():
    # confusion raises scaffolding elsewhere — difficulty must be untouched
    for flags in ([P] * 4, [E] * 4, [P, E, P, E]):
        assert _intra_from_history(flags, "confused") == _intra_from_history(flags, "engaged")


def test_bounded():
    assert _intra_from_history([P] * 50) == 3
    assert _intra_from_history([E] * 50) == 1
