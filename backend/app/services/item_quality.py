"""
Item harness — what makes a question worth asking.

The tutor harness guards the tutor's OUTPUT (no answer leaks). This guards the
INPUT: whether a question actually tests linked lists. Every rule is decided by
code — mostly by running the program with pseudo_exec — never by a model.

A fill-in-the-blank blank is worth asking only if:
  R1  it blanks a SEMANTIC slot: which pointer / node / condition. Not a fresh
      variable's name (`___ = head` → curr/temp/prev: any name works), a field
      name (`curr.___` → next: read it off the Node class), a function name
      (`___(temp)` → free) or the payload (`createNode(___)`: read it off the
      task card). Those test reading, not linked lists.
  R2  exactly one option is correct — every distractor, substituted and run on
      every board, gives a wrong program.
  R3  no distractor can be ruled out without linked-list reasoning: it must
      fail by crashing or by building the wrong list, not by naming a variable,
      field or function that does not exist (a compile error).
A find-the-bug item is worth asking only if the buggy line really breaks the
program for a linked-list reason (R2/R3 for the bug) and every wrong fix is
wrong (R2) for a linked-list reason (R3).
An ordering item's valid orders are COMPUTED (every permutation run), and a
distractor step must not be usable — neither in place of a step nor inserted
as an extra — and must only use names the program has (R3).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache

from . import pseudo_exec as px
from .pseudo_exec import Instance, check_program

SEMANTIC = "semantic"
_IDENT = re.compile(r"[A-Za-z_]\w*")

SLOT_PROBLEM = {
    "binder":   "names a new variable — any name works, so it tests naming, not linked lists",
    "field":    "is a field name — it can be read off the Node class",
    "function": "is a function name — it tests vocabulary, not linked lists",
    "payload":  "is the operation's input — it can be read off the task card",
}


def slot_kind(steps: list[str], line: int, answer: str) -> str:
    """What a blank at `answer`'s first occurrence in steps[line] actually tests.

    'binder' is the alpha-renaming test made syntactic: the blank is the
    assignment target where a local variable first appears in the program.
    Renaming it everywhere (curr -> p) leaves the program unchanged, so the
    only thing that picks the answer is the naming convention."""
    blanked = steps[line].replace(answer, "___", 1)
    if answer in ("{value}", "{index}"):
        return "payload"
    if _IDENT.fullmatch(answer):
        if answer in px.FIELDS and ".___" in blanked:
            return "field"
        if re.search(r"___\s*\(", blanked):
            return "function"
        at_target = re.search(r"(^|[;{]\s*)___\s*=(?!=)", blanked)
        seen_before = any(re.search(rf"\b{re.escape(answer)}\b", s) for s in steps[:line])
        if at_target and not seen_before and answer != "head":
            return "binder"
    return SEMANTIC


@lru_cache(maxsize=None)
def boards(operation: str) -> tuple[Instance, ...]:
    from .static_questions import TEMPLATES
    return tuple(px.instances(operation, TEMPLATES[operation]))


@dataclass
class OptionResult:
    option: str
    correct: bool
    outcome: str
    consequence: str


@dataclass
class ItemReport:
    """One item, judged. `issues` empty ⇔ the item passes the harness."""
    where: str
    issues: list[str] = field(default_factory=list)
    options: list[OptionResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.issues


@lru_cache(maxsize=8192)
def _program_report(operation: str, lines: tuple[str, ...]) -> px.ProgramReport:
    # boards are deterministic per operation, so a program's verdict is too
    return check_program(operation, list(lines), list(boards(operation)))


def _judge_options(operation: str, make_program, options: list[str]) -> list[OptionResult]:
    out = []
    for opt in options:
        rep = _program_report(operation, tuple(make_program(opt)))
        out.append(OptionResult(opt, rep.correct, rep.outcome, rep.reason))
    return out


@lru_cache(maxsize=2048)
def ordering_distractor_ok(operation: str, distractor: str) -> bool:
    """Cached: pool rows share distractors, and the any-order substitution
    search is the one expensive check."""
    from .static_questions import TEMPLATES
    return lint_ordering_distractor(operation, TEMPLATES[operation]["pseudocode"], distractor).ok


_KEYWORDS = {"while", "for", "if", "else", "return", "int", "NULL", "true", "false"}


@lru_cache(maxsize=None)
def _vocab(operation: str) -> frozenset[str]:
    """Every name the correct program mentions, its parameters, and the Node
    fields (always on screen in the Node reference)."""
    from .static_questions import TEMPLATES
    names = {t for s in TEMPLATES[operation]["pseudocode"] for t in _IDENT.findall(s)}
    names |= {"l1", "l2"} if operation == "mergeSortedLists" else {"head"}
    names |= px.FIELDS
    return frozenset(names - _KEYWORDS)


def foreign_names(operation: str, code: str) -> list[str]:
    """Names in `code` the program never mentions. A whole-line option that
    introduces one (`newNode = createNode(5);` in reverseList) compiles — it
    defines the name — but it is still the odd one out on screen (R3)."""
    code = code.replace("{value}", "").replace("{index}", "")
    return sorted({t for t in _IDENT.findall(code)} - _KEYWORDS - _vocab(operation))


def _wrong_option_issues(results: list[OptionResult], role: str, operation: str | None = None) -> list[str]:
    issues = []
    for r in results:
        if r.correct:
            issues.append(f"{role} {r.option!r} is ALSO correct — a student who picks it is marked wrong")
        elif r.outcome == "compile_error":
            issues.append(f"{role} {r.option!r} can be ruled out by reading alone ({r.consequence})")
        elif operation and foreign_names(operation, r.option):
            issues.append(f"{role} {r.option!r} can be ruled out by reading alone "
                          f"(uses {', '.join(foreign_names(operation, r.option))}, which this program never mentions)")
    return issues


# ── fill_blank ─────────────────────────────────────────────────────────────────

def lint_blank(operation: str, steps: list[str], line: int, answer: str,
               wrongs: list[str], where: str = "") -> ItemReport:
    rep = ItemReport(where or f"{operation} line {line}")
    step = steps[line]
    if answer not in step:
        rep.issues.append(f"answer {answer!r} does not occur in {step!r}")
        return rep
    kind = slot_kind(steps, line, answer)
    if kind != SEMANTIC:
        rep.issues.append(f"the blank {answer!r} {SLOT_PROBLEM[kind]}")
    opts = [answer, *wrongs]
    if len(set(opts)) != len(opts):
        rep.issues.append(f"duplicate options {opts}")
    blanked = step.replace(answer, "___", 1)

    def program(opt: str) -> list[str]:
        lines = list(steps)
        lines[line] = blanked.replace("___", opt, 1)
        return lines

    rep.options = _judge_options(operation, program, opts)
    if not rep.options[0].correct:
        rep.issues.append(f"the answer itself fails: {rep.options[0].consequence}")
    rep.issues += _wrong_option_issues(rep.options[1:], "distractor")
    return rep


# ── find_bug ───────────────────────────────────────────────────────────────────

def lint_bug(operation: str, steps: list[str], line: int, buggy: str,
             fix: str, wrong_fixes: list[str], where: str = "") -> ItemReport:
    rep = ItemReport(where or f"{operation} bug on line {line}")
    if not (0 <= line < len(steps)):
        rep.issues.append(f"bug line {line} is out of range")
        return rep
    if fix.strip() != steps[line].strip():
        rep.issues.append(f"fix {fix!r} is not the template line {steps[line]!r}")

    def program(code: str) -> list[str]:
        lines = list(steps)
        lines[line] = code
        return lines

    bug_res = _judge_options(operation, program, [buggy])[0]
    if bug_res.correct:
        rep.issues.append(f"the 'bug' {buggy!r} is a correct program — there is nothing to find")
    elif bug_res.outcome == "compile_error":
        rep.issues.append(f"the bug {buggy!r} is a typo the compiler would catch, "
                          f"not a linked-list bug ({bug_res.consequence})")
    rep.options = [bug_res] + _judge_options(operation, program, [fix, *wrong_fixes])
    if not rep.options[1].correct:
        rep.issues.append(f"the fix itself fails: {rep.options[1].consequence}")
    rep.issues += _wrong_option_issues(rep.options[2:], "wrong fix", operation)
    return rep


def usable_wrong_fixes(rep: ItemReport, operation: str) -> list[str]:
    """The wrong fixes of a lint_bug report that pass R2 and R3."""
    return [r.option for r in rep.options[2:]
            if not r.correct and r.outcome != "compile_error" and not foreign_names(operation, r.option)]


# ── ordering ───────────────────────────────────────────────────────────────────

@lru_cache(maxsize=None)
def template_valid_orders(operation: str) -> tuple[tuple[int, ...], ...]:
    """Valid orders of the operation's TEMPLATE steps, computed once."""
    from .static_questions import TEMPLATES
    steps = TEMPLATES[operation]["pseudocode"]
    return tuple(tuple(o) for o in px.valid_orders(operation, steps, list(boards(operation))))


def lint_ordering_distractor(operation: str, steps: list[str], distractor: str,
                             where: str = "") -> ItemReport:
    rep = ItemReport(where or f"{operation} distractor {distractor!r}")
    insts = list(boards(operation))
    if distractor.strip() in {s.strip() for s in steps}:
        rep.issues.append("is a copy of a correct step")
        return rep
    probe = check_program(operation, steps + [distractor], insts)
    if probe.outcome == "compile_error":
        rep.issues.append(f"can be ruled out by reading alone ({probe.reason})")
        return rep
    foreign = foreign_names(operation, distractor)
    if foreign:
        rep.issues.append(f"can be ruled out by reading alone (uses {', '.join(foreign)}, "
                          f"which this program never mentions)")
        return rep
    usable = px.usable_in_place_of(operation, steps, distractor, insts)
    if usable:
        k, _ = usable
        rep.issues.append(f"can take the place of step {k} ({steps[k]!r}) and the program "
                          f"is still correct — a student who uses it is marked wrong")
    return rep


# ── authored content sweep ─────────────────────────────────────────────────────

def lint_authored(operation: str) -> list[ItemReport]:
    """Every authored item for one operation: TEMPLATES distractors, _BLANKS, _BUGS."""
    from .static_questions import TEMPLATES, _BLANKS, _BUGS
    tmpl = TEMPLATES[operation]
    steps = tmpl["pseudocode"]
    reports: list[ItemReport] = []
    base = check_program(operation, steps, list(boards(operation)))
    if not base.correct:
        reports.append(ItemReport(f"{operation} TEMPLATE",
                                  [f"the template itself is wrong: {base.reason}"]))
        return reports
    for si, bset in enumerate(_BLANKS.get(operation, [])):
        if len(bset) != len(steps):
            reports.append(ItemReport(f"{operation} blanks[{si}]",
                                      [f"has {len(bset)} entries for {len(steps)} steps"]))
            continue
        for line, bd in enumerate(bset):
            if bd is None:
                continue
            reports.append(lint_blank(operation, steps, line, bd["a"], list(bd["w"]),
                                      where=f"{operation} blanks[{si}] line {line}"))
    for vi, bug in enumerate(_BUGS.get(operation, [])):
        wrong = [o for o in bug["options"] if o != bug["fix"]]
        if bug["fix"] not in bug["options"]:
            r = ItemReport(f"{operation} bugs[{vi}]", ["the fix is not among the options"])
            reports.append(r)
        reports.append(lint_bug(operation, steps, bug["line"], bug["buggy"], bug["fix"], wrong,
                                where=f"{operation} bugs[{vi}] (line {bug['line']})"))
    for di, d in enumerate(tmpl.get("distractors", [])):
        reports.append(lint_ordering_distractor(operation, steps, d,
                                                where=f"{operation} distractors[{di}]"))
    return reports


# ── serve time: the board the student actually sees ────────────────────────────

def board_of(operation: str, nodes: list[dict], op_value, op_pos, extra: dict | None = None) -> Instance:
    """The Instance for an assembled question's board (initialNodes are linear;
    detectCycle's loop comes from cycleTo, merge's second list from l2Values)."""
    from .ll_executor import traverse_values
    extra = extra or {}
    values = tuple(traverse_values(nodes)) if nodes else ()
    if operation == "mergeSortedLists" and isinstance(op_value, dict):
        return Instance(tuple(op_value.get("l1Values", ())), l2=tuple(op_value.get("l2Values", ())))
    return Instance(values,
                    value=op_value if isinstance(op_value, int) else None,
                    index=op_pos if isinstance(op_pos, int) else None,
                    cycle_to=extra.get("cycleTo"))


def wrong_on_board(operation: str, lines: list[str], board: Instance) -> bool:
    """A distractor or a bug the student can't SEE fail on their own board is not
    a fair item (e.g. `i < index-2` at index 1, or a bug that answers true on a
    board that really has a cycle). Generators drop/re-roll those."""
    return not px.judge(operation, lines, board).correct


def symbolic(code: str, operation_value) -> str:
    """Undo instantiate() for an assembled payload line: createNode(35) → createNode({value})."""
    if isinstance(operation_value, int):
        return re.sub(rf"createNode\(\s*{operation_value}\s*\)", "createNode({value})", code)
    return code
