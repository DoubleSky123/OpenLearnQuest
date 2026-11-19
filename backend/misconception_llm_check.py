"""
Offline check: does an LLM that GUESSES the misconception (the Niousha et al. 2026
approach) agree with our misconception tags decided by RUNNING the code?

For a seeded sample of authored wrong options that a STUDENT can pick (fill_blank
options, find_bug wrong fixes, ordering distractors; not the find_bug buggy line,
which is the question's own bug), the model gets its best case: the correct
program, exactly what the student's pick changes, and the instructor's
misconception list for this operation (id, the student's belief, the instructor
note) plus "none". Its pick is compared with the execution tags.

  - tagged options:   agreement = model's pick is one of the execution tags
  - untagged options: does the model still name a misconception? (needs human review:
                      the option's behaviour matches no catalog mutant)
  - consistency:      a subset is asked twice

    cd backend
    d:/openLearnquest/venv/Scripts/python.exe misconception_llm_check.py --dry-run   # free: counts + one prompt
    d:/openLearnquest/venv/Scripts/python.exe misconception_llm_check.py             # ~130 Haiku calls

Writes docs/diagnosis-check-<date>/results.json and report.md (docs/ is local).
"""
import argparse
import json
import random
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from app.services import anthropic_client
from app.services import item_quality as iq
from app.services import misconceptions as mc
from app.services import pseudo_exec as px
from app.services.static_questions import TEMPLATES, _BLANKS

SEED = 20261119
N_TAGGED = {"fill_blank": 40, "find_bug": 20, "ordering": 15}
N_UNTAGGED = 25
N_REPEAT = 30
OUT = Path(__file__).resolve().parent.parent / "docs" / f"diagnosis-check-{date.today().isoformat()}"


# ── what the student's pick does ──────────────────────────────────────────────

def student_program(w: mc.WrongOption) -> tuple[list[str], int | None]:
    """The program the student's pick produces, and the line it changes."""
    steps = list(TEMPLATES[w.operation]["pseudocode"])
    if w.qtype == "fill_blank":
        answer = _BLANKS[w.operation][w.variant][w.line]["a"]
        steps[w.line] = steps[w.line].replace(answer, w.option, 1)
        return steps, w.line
    if w.qtype == "find_bug":
        steps[w.line] = w.option
        return steps, w.line
    # ordering distractor: the slot where it shows its tag (else the first slot)
    for i in range(len(steps)):
        if not w.tags or mc.tag_line(w.operation, list(TEMPLATES[w.operation]["pseudocode"]), i, w.option):
            steps[i] = w.option
            return steps, i
    steps[0] = w.option
    return steps, 0


def run_consequence(w: mc.WrongOption) -> str:
    prog, _ = student_program(w)
    for inst in iq.boards(w.operation):
        v = px.judge(w.operation, prog, inst)
        if not v.correct:
            return v.reason
    return "behaves correctly on every harness board"


# ── the prompt (the model's best case) ────────────────────────────────────────

def situation(w: mc.WrongOption) -> str:
    steps = TEMPLATES[w.operation]["pseudocode"]
    if w.qtype == "fill_blank":
        answer = _BLANKS[w.operation][w.variant][w.line]["a"]
        shown = steps[w.line].replace(answer, "___", 1)
        new = steps[w.line].replace(answer, w.option, 1)
        return (f"Fill-in-the-blank question. Line {w.line} was shown as `{shown}`. "
                f"The correct answer is `{answer}`. The student chose `{w.option}`, "
                f"which makes line {w.line}: `{new}`.")
    if w.qtype == "find_bug":
        return (f"Find-the-bug question. The student found the buggy line ({w.line}) but chose a "
                f"wrong fix. The correct line is `{steps[w.line]}`; the student's fix makes "
                f"line {w.line}: `{w.option}`.")
    return ("Ordering question: the student built the program from shuffled steps and used this "
            f"wrong step instead of one of the correct steps: `{w.option}`.")


def prompt_for(w: mc.WrongOption) -> tuple[str, list[str]]:
    steps = TEMPLATES[w.operation]["pseudocode"]
    cands = [m for m in mc.applicable(w.operation)]
    listing = "\n".join(f'- {m.id}: the student believes "{m.belief}" Instructor note: {m.tutor_note}'
                        for m in cands)
    code = "\n".join(f"{i}: {s}" for i, s in enumerate(steps))
    text = f"""You are helping a linked-list tutor. A student answered a question about the operation `{w.operation}` and made a mistake. Decide which misconception from the instructor's list best explains this wrong answer.

Node fields are `value` and `next`. createNode(v) returns a new node whose next is NULL. {{value}} stands for the value being inserted. Indices are 0-based.

Correct program for {w.operation}:
{code}

{situation(w)}

Instructor's list of misconceptions for this operation:
{listing}
- none: no misconception in this list explains the wrong answer.

Reply with JSON only: {{"misconception": "<one id from the list, or none>", "reason": "<one sentence>"}}"""
    return text, [m.id for m in cands] + ["none"]


# ── model call ────────────────────────────────────────────────────────────────

_client = None


def ask(text: str, allowed: list[str]) -> dict:
    global _client
    _client = _client or anthropic_client.get_client("generation")
    t0 = time.time()
    try:
        resp = _client.messages.create(
            **anthropic_client.options("generation"),
            max_tokens=300 + anthropic_client.THINKING_HEADROOM,
            messages=[{"role": "user", "content": text}],
        )
        raw = anthropic_client.text_of(resp)
        s, e = raw.find("{"), raw.rfind("}") + 1
        data = json.loads(raw[s:e]) if s != -1 and e > 0 else {}
        pick = data.get("misconception")
        return {"pick": pick if pick in allowed else f"INVALID:{pick}", "reason": data.get("reason", ""),
                "in": resp.usage.input_tokens, "out": resp.usage.output_tokens,
                "ms": int(1000 * (time.time() - t0))}
    except Exception as ex:   # noqa: BLE001 — record and keep going; reported as an error row
        return {"pick": "ERROR", "reason": type(ex).__name__, "in": 0, "out": 0,
                "ms": int(1000 * (time.time() - t0))}


# ── sampling and report ───────────────────────────────────────────────────────

def eligible() -> list[mc.WrongOption]:
    return [w for op in TEMPLATES for w in mc.authored_wrong_options(op) if w.role != "bug"]


def sample(pool: list[mc.WrongOption]) -> list[mc.WrongOption]:
    rng = random.Random(SEED)
    out = []
    for qt, n in N_TAGGED.items():
        tagged = [w for w in pool if w.qtype == qt and w.tags]
        out += rng.sample(tagged, min(n, len(tagged)))
    untagged = [w for w in pool if not w.tags]
    out += rng.sample(untagged, min(N_UNTAGGED, len(untagged)))
    return out


def pct(a: int, b: int) -> str:
    return f"{a}/{b} ({100 * a / b:.0f}%)" if b else "0/0"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="counts and one prompt, no model calls")
    args = ap.parse_args()

    pool = eligible()
    by = Counter((w.qtype, bool(w.tags)) for w in pool)
    print("eligible student-pickable wrong options:")
    for qt in ("fill_blank", "find_bug", "ordering"):
        print(f"  {qt:10} tagged {by[(qt, True)]:3}  untagged {by[(qt, False)]:3}")
    items = sample(pool)
    repeat = items[:N_REPEAT]
    print(f"sample: {len(items)} items + {len(repeat)} repeats = {len(items) + len(repeat)} model calls")
    if args.dry_run:
        print("\n--- example prompt ---\n" + prompt_for(items[0])[0])
        return 0

    jobs = [(i, w) for i, w in enumerate(items)] + [(i, w) for i, w in enumerate(repeat)]
    with ThreadPoolExecutor(max_workers=4) as ex:
        answers = list(ex.map(lambda iw: ask(*prompt_for(iw[1])), jobs))
    first, second = answers[:len(items)], answers[len(items):]

    rows = []
    for i, w in enumerate(items):
        a = first[i]
        rows.append({
            "operation": w.operation, "qtype": w.qtype, "where": w.where, "option": w.option,
            "exec_tags": sorted(w.tags), "run": run_consequence(w),
            "llm": a["pick"], "llm_reason": a["reason"],
            "llm_repeat": second[i]["pick"] if i < len(second) else None,
            "agree": (a["pick"] in w.tags) if w.tags else (a["pick"] == "none"),
        })
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")

    tagged = [r for r in rows if r["exec_tags"]]
    untagged = [r for r in rows if not r["exec_tags"]]
    errs = [r for r in rows if r["llm"] == "ERROR" or str(r["llm"]).startswith("INVALID")]
    rep = [r for r in rows if r["llm_repeat"] is not None]
    lines = [f"# LLM guess vs. execution tags ({date.today().isoformat()})", "",
             f"Model: {anthropic_client.MODEL}, effort {anthropic_client.EFFORT['generation']}. "
             f"Seed {SEED}. Script: `backend/misconception_llm_check.py`.", "",
             "## Summary", "",
             f"- Tagged options, the model's pick is one of the execution tags: **{pct(sum(r['agree'] for r in tagged), len(tagged))}**"]
    for qt in ("fill_blank", "find_bug", "ordering"):
        t = [r for r in tagged if r["qtype"] == qt]
        lines.append(f"  - {qt}: {pct(sum(r['agree'] for r in t), len(t))}")
    lines += [f"- Tagged options where the model said `none`: {pct(sum(r['llm'] == 'none' for r in tagged), len(tagged))}",
              f"- Untagged options (behaviour matches no catalog misconception), the model still named one: "
              f"**{pct(sum(r['llm'] not in ('none', 'ERROR') and not str(r['llm']).startswith('INVALID') for r in untagged), len(untagged))}**",
              f"- Same answer when asked twice: {pct(sum(r['llm'] == r['llm_repeat'] for r in rep), len(rep))}",
              f"- Errors / invalid replies: {len(errs)}",
              f"- Tokens: input {sum(a['in'] for a in answers)}, output {sum(a['out'] for a in answers)}; "
              f"calls {len(answers)}", ""]
    conf = Counter((r["exec_tags"][0], r["llm"]) for r in tagged if not r["agree"])
    if conf:
        lines += ["## Most common disagreements (execution tag → model's pick)", ""]
        lines += [f"- {a} → {b}: {n}" for (a, b), n in conf.most_common(10)] + [""]
    lines += ["## Every disagreement (for human review: who is right?)", ""]
    for r in rows:
        if r["agree"]:
            continue
        lines += [f"### {r['operation']} · {r['qtype']} · {r['where']}",
                  f"- option: `{r['option']}`",
                  f"- execution tags: {', '.join(r['exec_tags']) or '(none)'}",
                  f"- what it does when run: {r['run']}",
                  f"- model: **{r['llm']}** — {r['llm_reason']}", ""]
    (OUT / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines[:16]))
    print(f"\nwritten: {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
