"""
Teach Quinn fidelity check (services/npc_agent.py) — real Haiku calls.

Quinn's state lives in code; the model only (a) translates a free-text
explanation into an edit and (b) voices Quinn. This measures whether those two
model jobs keep the NPC honest:

  selective flip   a targeted explanation fixes the bug; a vague or mismatched
                   one does NOT (the sycophancy failure of LLM-simulated students)
  over-fix         an explanation of one bug must not fix a second one
  break character  Quinn's line contains code (caught by the guard, regenerated)

Run from backend/:
    d:/openLearnquest/venv/Scripts/python.exe ../.claude/skills/tutor-sim/npc_sim.py [--repeat 2] [--only targeted,generic,mismatched,one_of_two]

Cost: one translate call per scenario run plus one voice call per accepted fix
(about 30–50 Haiku calls at --repeat 2). Exit 1 if any rate is below its bar.
"""
import argparse
import sys
import time

sys.path.insert(0, ".")  # expects cwd == backend/

from app.services import npc_agent as npc  # noqa: E402
from app.services.static_questions import TEMPLATES  # noqa: E402

# (kind, operation, held, explanation, the misconception it should fix or None)
SCENARIOS = [
    ("targeted", "removeAtTail", ["stop-on-target"],
     "You stop ON the last node, but to remove it you have to stand on the node before it. "
     "Stop the loop one node earlier.", "stop-on-target"),
    ("generic", "removeAtTail", ["stop-on-target"], "Your code is wrong, just fix it.", None),
    ("mismatched", "removeAtTail", ["stop-on-target"],
     "You forgot to free the node you removed, so it leaks.", None),

    ("targeted", "insertAtHead", ["move-before-link"],
     "You move head to the new node before the new node points at the old first node, so the rest of "
     "the list is lost. Connect the new node to the old head first, then move head.", "move-before-link"),
    ("generic", "insertAtHead", ["move-before-link"], "Something is off, try again.", None),
    ("mismatched", "insertAtHead", ["move-before-link"],
     "You have to make a brand-new node with createNode instead of reusing head.", None),

    ("targeted", "deleteEntireList", ["advance-after-free"],
     "After you free curr you can't read its next any more. Save the next node in temp before you free "
     "curr, then move to temp.", "advance-after-free"),
    ("generic", "deleteEntireList", ["advance-after-free"], "It's broken somewhere, please fix it.", None),
    ("mismatched", "deleteEntireList", ["advance-after-free"],
     "Start walking from head itself, not from the second node.", None),

    ("targeted", "reverseList", ["tail-not-null"],
     "prev has to start as NULL: the old first node becomes the last node, so it must end up pointing "
     "to NULL, not back into the list.", "tail-not-null"),
    ("generic", "reverseList", ["tail-not-null"], "Reverse it properly.", None),

    ("targeted", "detectCycle", ["meet-check-outside"],
     "You never compare slow and fast inside the loop, so on a list with a cycle it runs forever. "
     "After each step, check whether they are on the same node and return true if so.", "meet-check-outside"),

    ("targeted", "sortList", ["missing-base-case"],
     "A list with just one node is already sorted, so you also have to stop when head.next is NULL, "
     "otherwise the recursion never ends.", "missing-base-case"),

    ("one_of_two", "removeAtTail", ["stop-on-target", "free-wrong-node"],
     "At the end you free the node you are standing on, but the node you removed is the one you saved "
     "in temp. Free temp instead.", "free-wrong-node"),
    ("one_of_two", "insertAtPosition", ["move-before-link", "stop-on-target"],
     "Your loop walks one node too far: to insert at index you need to stand on the node before it, "
     "so walk index-1 steps.", "stop-on-target"),
]

BARS = {"targeted": 0.8, "generic": 1.0, "mismatched": 1.0, "one_of_two": 0.8, "voice": 0.9}


def run_one(op, held, text):
    prog = npc.program_for(op, held)
    edits, meta = npc.translate(op, prog, text)
    if not edits:
        return "not_understood", None, edits, meta
    edited = npc.apply_edits(npc.display(prog), edits)
    if edited is None:
        return "not_understood", None, edits, meta
    verdict, fixed = npc.adjudicate(op, held, [npc.undisplay(ln) for ln in edited])
    return verdict, fixed, edits, meta


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repeat", type=int, default=2)
    ap.add_argument("--only", default=None, help="comma-separated scenario kinds")
    args = ap.parse_args()
    kinds = set(args.only.split(",")) if args.only else None
    scen = [s for s in SCENARIOS if kinds is None or s[0] in kinds]

    print(f"npc-sim: {len(scen)} scenario(s) x {args.repeat}\n")
    print(f"{'kind':<11} {'operation':<17} {'expect':<20} result")
    print("-" * 78)
    ok = {k: [] for k in BARS}
    t0 = time.time()
    for kind, op, held, text, want in scen:
        for _ in range(args.repeat):
            verdict, fixed, edits, meta = run_one(op, held, text)
            good = (fixed == want) if want else verdict != "fixed"
            ok[kind].append(good)
            note = verdict + (f":{fixed}" if fixed else "") + ("" if meta.get("ok") or edits == [] else " (no JSON)")
            print(f"{kind:<11} {op:<17} {(want or 'no fix'):<20} {'ok ' if good else 'BAD'} {note}")
            if verdict == "fixed":
                after = [m for m in held if m != fixed]
                facts = (f"[OPERATION] {TEMPLATES[op]['title']}\n[WHAT JUST HAPPENED] Your friend explained: "
                         f"\"{text}\" It made sense, so you changed your code.\n[TESTS NOW] "
                         f"{'all tests pass' if not after else 'some hidden tests still fail'}.")
                _, vmeta = npc.voice(op, facts, "Thank your friend and say what you understand now.", "FALLBACK")
                ok["voice"].append(vmeta["source"] == "model" and vmeta["guard_rejections"] == 0)
    print("-" * 78)
    failed = False
    for k, vals in ok.items():
        if not vals:
            continue
        rate = sum(vals) / len(vals)
        flag = "" if rate >= BARS[k] else "   <-- below bar"
        failed |= bool(flag)
        label = {"voice": "voice in character (no guard catch)"}.get(k, k)
        print(f"{label:<38} {sum(vals)}/{len(vals)} = {rate:.0%} (bar {BARS[k]:.0%}){flag}")
    print(f"\n{time.time() - t0:.0f}s")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
