"""
Pseudocode executor — the item harness's oracle.

Runs the C-style pseudocode students actually see (TEMPLATES steps, a blank
filled with any option, a buggy line, an ordering permutation) over an explicit
heap, and judges the result against ll_executor's ground truth. The item
quality rules (item_quality.py) are all built on this: "exactly one option is
correct", "a distractor fails for a linked-list reason, not because it names
something that doesn't exist", "this bug really breaks the program".

Semantics follow the Memory City interpreter (frontend/src/services/heapInterpreter.js):
  compile_error  unknown variable / field / function — the student could rule the
                 option out by reading, without any linked-list reasoning
  runtime_error  NULL dereference, uninitialised pointer, use after free, double
                 free, step limit (infinite loop)
  ok             ran to the end — correct, or a logic error (wrong list, leak)
C memory model: nothing is collected. A node of the ORIGINAL list that nothing
can reach and nobody freed is leaked; a freed node still reachable is dangling.

Program text may be symbolic: `{value}` is the operation's payload and
`{index}` its position, exactly as in TEMPLATES before instantiate().
"""
from __future__ import annotations

import itertools
import random
import re
from dataclasses import dataclass, field
from typing import Any

from .ll_executor import execute_operation

STEP_LIMIT = 2000
FIELDS = {"value", "next"}
NODE_FUNCS = {"createNode": 1, "free": 1}


class CompileError(Exception):
    pass


class RuntimeFault(Exception):
    pass


class _Return(Exception):
    def __init__(self, value):
        self.value = value


# ── Values ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Ref:
    """A pointer to heap node `id`. NULL is Python None."""
    id: int


@dataclass
class _Node:
    value: Any
    next: Ref | None
    original: bool
    freed: bool = False


# ── Tokenizer + parser ─────────────────────────────────────────────────────────

_TOKEN = re.compile(r"\s*(?:(\d+)|([A-Za-z_]\w*)|(==|!=|<=|>=|&&|\|\||\+\+|[-+<>=;(){}.,?:!*]))")


def _tokenize(src: str) -> list[str]:
    src = src.replace("{value}", "__value").replace("{index}", "__index")
    out, pos = [], 0
    while pos < len(src):
        if src[pos:].strip() == "":
            break
        m = _TOKEN.match(src, pos)
        if not m or m.end() == pos:
            raise CompileError(f"cannot read {src[pos:pos + 12]!r}")
        out.append(m.group(m.lastindex))
        pos = m.end()
    return out


class _Parser:
    def __init__(self, tokens: list[str]):
        self.t, self.i = tokens, 0

    def peek(self, k: int = 0) -> str | None:
        j = self.i + k
        return self.t[j] if j < len(self.t) else None

    def take(self, expect: str | None = None) -> str:
        tok = self.peek()
        if tok is None or (expect is not None and tok != expect):
            raise CompileError(f"expected {expect!r}, found {tok!r}")
        self.i += 1
        return tok

    def program(self) -> list:
        out = []
        while self.peek() is not None:
            out.append(self.stmt())
        return out

    def stmt(self):
        tok = self.peek()
        if tok == "{":
            self.take("{")
            body = []
            while self.peek() != "}":
                if self.peek() is None:
                    raise CompileError("missing '}'")
                body.append(self.stmt())
            self.take("}")
            return ("block", body)
        if tok == ";":
            self.take(";")
            return ("block", [])
        if tok == "while":
            self.take(); self.take("(")
            cond = self.expr(); self.take(")")
            return ("while", cond, self.stmt())
        if tok == "for":
            self.take(); self.take("(")
            if self.peek() == "int":
                self.take()
            var = self.ident(); self.take("=")
            init = self.expr(); self.take(";")
            cond = self.expr(); self.take(";")
            if self.ident() != var:
                raise CompileError("for-loop must step its own counter")
            self.take("++"); self.take(")")
            return ("for", var, init, cond, self.stmt())
        if tok == "if":
            self.take(); self.take("(")
            cond = self.expr(); self.take(")")
            then = self.stmt()
            other = None
            if self.peek() == "else":
                self.take()
                other = self.stmt()
            return ("if", cond, then, other)
        if tok == "return":
            self.take()
            val = None if self.peek() == ";" else self.expr()
            self.take(";")
            return ("return", val)
        target = self.expr()
        if self.peek() == "=":
            self.take("=")
            if target[0] not in ("var", "field"):
                raise CompileError("can only assign to a variable or a field")
            val = self.expr()
            self.take(";")
            return ("assign", target, val)
        self.take(";")
        return ("expr", target)

    def ident(self) -> str:
        tok = self.take()
        if not re.fullmatch(r"[A-Za-z_]\w*", tok):
            raise CompileError(f"expected a name, found {tok!r}")
        return tok

    # precedence climbing
    def expr(self):
        cond = self.or_()
        if self.peek() == "?":
            self.take("?")
            a = self.expr(); self.take(":")
            b = self.expr()
            return ("ternary", cond, a, b)
        return cond

    def _binary(self, sub, ops):
        left = sub()
        while self.peek() in ops:
            op = self.take()
            left = ("bin", op, left, sub())
        return left

    def or_(self):  return self._binary(self.and_, ("||",))
    def and_(self): return self._binary(self.eq, ("&&",))
    def eq(self):   return self._binary(self.rel, ("==", "!="))
    def rel(self):  return self._binary(self.add, ("<", "<=", ">", ">="))
    def add(self):  return self._binary(self.unary, ("+", "-"))

    def unary(self):
        if self.peek() == "!":
            self.take()
            return ("not", self.unary())
        if self.peek() == "-":
            self.take()
            return ("neg", self.unary())
        return self.postfix()

    def postfix(self):
        node = self.primary()
        while self.peek() in (".", "("):
            if self.peek() == ".":
                self.take(".")
                node = ("field", node, self.ident())
            else:
                if node[0] != "var":
                    raise CompileError("only named functions can be called")
                self.take("(")
                args = []
                while self.peek() != ")":
                    args.append(self.expr())
                    if self.peek() == ",":
                        self.take(",")
                    elif self.peek() != ")":
                        raise CompileError("expected ',' or ')'")
                self.take(")")
                node = ("call", node[1], args)
        return node

    def primary(self):
        tok = self.take()
        if tok.isdigit():
            return ("int", int(tok))
        if tok == "NULL":
            return ("null",)
        if tok in ("true", "false"):
            return ("bool", tok == "true")
        if tok == "(":
            e = self.expr()
            self.take(")")
            return e
        if re.fullmatch(r"[A-Za-z_]\w*", tok):
            return ("var", tok)
        raise CompileError(f"unexpected {tok!r}")


def parse(lines: list[str]) -> list:
    """Parse a whole program. Each line becomes ("line", idx, stmts) so a run
    can report which lines were reached (a step after an unconditional
    `return` is dead code — an ordering that buries one is not a valid order)."""
    return [("line", i, _Parser(_tokenize(line)).program()) for i, line in enumerate(lines)]


# ── Static check (the "compile" step) ──────────────────────────────────────────

def _walk(node, visit):
    if isinstance(node, tuple):
        visit(node)
        for child in node[1:]:
            _walk(child, visit)
    elif isinstance(node, list):
        for child in node:
            _walk(child, visit)


def _static_check(stmts: list, params: set[str], funcs: dict[str, int]) -> None:
    assigned = set(params)

    def collect(n):
        if n[0] == "assign" and n[1][0] == "var":
            assigned.add(n[1][1])
        elif n[0] == "for":
            assigned.add(n[1])
    _walk(stmts, collect)

    def check(n):
        kind = n[0]
        if kind == "var" and n[1] not in assigned:
            raise CompileError(f"'{n[1]}' is not a variable in this program")
        if kind == "field" and n[2] not in FIELDS:
            raise CompileError(f"a Node has no field '{n[2]}' (only value and next)")
        if kind == "call":
            if n[1] not in funcs:
                raise CompileError(f"there is no function '{n[1]}'")
            if len(n[2]) != funcs[n[1]]:
                raise CompileError(f"{n[1]}() takes {funcs[n[1]]} argument(s)")
    # call names are ("call", name, args): name is a str, never visited as a var
    _walk(stmts, check)


# ── Interpreter ────────────────────────────────────────────────────────────────

class _Machine:
    def __init__(self, heap: dict[int, _Node], stmts: list, funcs: dict[str, int]):
        self.heap = heap
        self.stmts = stmts
        self.funcs = funcs
        self.steps = 0
        self.depth = 0
        self.reached: set[int] = set()
        self.unbalanced = False

    # -- heap helpers
    def node(self, ref, what: str) -> _Node:
        if ref is None:
            raise RuntimeFault(f"NULL dereference ({what} of NULL)")
        if not isinstance(ref, Ref):
            raise RuntimeFault(f"{what} of something that is not a node")
        n = self.heap[ref.id]
        if n.freed:
            raise RuntimeFault(f"use after free ({what} of a freed node)")
        return n

    def new_node(self, value) -> Ref:
        nid = max(self.heap, default=0) + 1
        self.heap[nid] = _Node(value=value, next=None, original=False)
        return Ref(nid)

    def tick(self):
        self.steps += 1
        if self.steps > STEP_LIMIT:
            raise RuntimeFault("never stops (infinite loop)")

    # -- execution
    def call(self, env: dict) -> Any:
        self.depth += 1
        if self.depth > 40:
            raise RuntimeFault("recursion never bottoms out")
        try:
            self.block(self.stmts, env)
            return None
        except _Return as r:
            return r.value
        finally:
            self.depth -= 1

    def block(self, stmts: list, env: dict):
        for s in stmts:
            self.exec(s, env)

    def exec(self, s, env: dict):
        self.tick()
        kind = s[0]
        if kind == "line":
            self.reached.add(s[1])
            self.block(s[2], env)
        elif kind == "block":
            self.block(s[1], env)
        elif kind == "assign":
            val = self.eval(s[2], env)
            target = s[1]
            if target[0] == "var":
                env[target[1]] = val
            else:
                n = self.node(self.eval(target[1], env), f"writing .{target[2]}")
                if target[2] == "next" and val is not None and not isinstance(val, Ref):
                    raise RuntimeFault(".next must hold a node or NULL")
                setattr(n, target[2], val)
        elif kind == "expr":
            self.eval(s[1], env)
        elif kind == "while":
            while self.truthy(self.eval(s[1], env)):
                self.tick()
                self.exec(s[2], env)
        elif kind == "for":
            env[s[1]] = self.eval(s[2], env)
            while self.truthy(self.eval(s[3], env)):
                self.tick()
                self.exec(s[4], env)
                env[s[1]] = env[s[1]] + 1
        elif kind == "if":
            if self.truthy(self.eval(s[1], env)):
                self.exec(s[2], env)
            elif s[3] is not None:
                self.exec(s[3], env)
        elif kind == "return":
            raise _Return(None if s[1] is None else self.eval(s[1], env))

    def truthy(self, v) -> bool:
        return v is not None and v is not False and v != 0

    def eval(self, e, env: dict):
        kind = e[0]
        if kind == "int":
            return e[1]
        if kind == "null":
            return None
        if kind == "bool":
            return e[1]
        if kind == "var":
            if e[1] not in env:
                raise RuntimeFault(f"'{e[1]}' is used before it is given a value")
            return env[e[1]]
        if kind == "field":
            n = self.node(self.eval(e[1], env), f"reading .{e[2]}")
            return getattr(n, e[2])
        if kind == "not":
            return not self.truthy(self.eval(e[1], env))
        if kind == "neg":
            return -self._int(self.eval(e[1], env))
        if kind == "ternary":
            return self.eval(e[2] if self.truthy(self.eval(e[1], env)) else e[3], env)
        if kind == "bin":
            op = e[1]
            if op == "&&":
                return self.truthy(self.eval(e[2], env)) and self.truthy(self.eval(e[3], env))
            if op == "||":
                return self.truthy(self.eval(e[2], env)) or self.truthy(self.eval(e[3], env))
            a, b = self.eval(e[2], env), self.eval(e[3], env)
            if op == "==":
                return a == b
            if op == "!=":
                return a != b
            a, b = self._int(a), self._int(b)
            return {"<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b,
                    "+": a + b, "-": a - b}[op]
        if kind == "call":
            return self.call_fn(e[1], [self.eval(a, env) for a in e[2]])
        raise RuntimeFault(f"cannot evaluate {kind}")

    def _int(self, v) -> int:
        if isinstance(v, bool) or not isinstance(v, int):
            raise RuntimeFault("arithmetic or < on something that is not a number")
        return v

    def call_fn(self, name: str, args: list):
        if name == "createNode":
            return self.new_node(args[0])
        if name == "free":
            ref = args[0]
            if ref is None:
                return None
            if not isinstance(ref, Ref):
                raise RuntimeFault("free() of something that is not a node")
            n = self.heap[ref.id]
            if n.freed:
                raise RuntimeFault("double free")
            n.freed = True
            return None
        if name == "merge":
            return self._merge(args[0], args[1])
        if name == "sortList":
            return self.call({"head": args[0]})
        raise RuntimeFault(f"no function {name}")

    def _length(self, ref) -> int:
        n, seen = 0, set()
        while ref is not None and ref.id not in seen:
            seen.add(ref.id)
            n += 1
            ref = self.heap[ref.id].next
        return n

    def _merge(self, a, b):
        """Library merge used by sortList: relinks two sorted lists, no allocation.
        Also records an unbalanced split: output alone can't tell merge sort from
        a degenerate split that peels off one node per call (still sorts, O(n^2))."""
        if abs(self._length(a) - self._length(b)) > 1:
            self.unbalanced = True
        out_head = out_tail = None
        while a is not None and b is not None:
            self.tick()
            na, nb = self.node(a, "merge"), self.node(b, "merge")
            if na.value <= nb.value:
                pick, a = a, na.next
            else:
                pick, b = b, nb.next
            if out_tail is None:
                out_head = pick
            else:
                self.heap[out_tail.id].next = pick
            out_tail = pick
        rest = a if a is not None else b
        if out_tail is None:
            return rest
        self.heap[out_tail.id].next = rest
        return out_head


# ── Running a program on one instance ──────────────────────────────────────────

@dataclass(frozen=True)
class Instance:
    """One concrete board: the starting list(s) and the operation's inputs."""
    values: tuple[int, ...]
    value: int | None = None          # payload ({value})
    index: int | None = None          # position ({index} / index)
    l2: tuple[int, ...] | None = None  # second list (mergeSortedLists)
    cycle_to: int | None = None       # tail -> node at this 0-based index (detectCycle)

    def to_json(self) -> dict:
        """Plain JSON (served_items.board, npc_cases.tests, the Teach Quinn API)."""
        return {"values": list(self.values), "value": self.value, "index": self.index,
                "l2": list(self.l2) if self.l2 is not None else None, "cycle_to": self.cycle_to}

    @classmethod
    def from_json(cls, d: dict) -> "Instance":
        return cls(tuple(d.get("values") or ()), value=d.get("value"), index=d.get("index"),
                   l2=tuple(d["l2"]) if d.get("l2") is not None else None, cycle_to=d.get("cycle_to"))


@dataclass
class RunResult:
    outcome: str                      # 'ok' | 'compile_error' | 'runtime_error'
    error: str | None = None
    returned: Any = None
    values: list[int] | None = None   # final list walked from the result pointer
    cyclic: bool = False              # the result walk loops forever
    leaked: list[int] = field(default_factory=list)    # original nodes lost, not freed
    dangling: bool = False            # a freed node is still in the list
    reached: set[int] = field(default_factory=set)     # line indices that executed
    unbalanced: bool = False          # sortList split the list unevenly somewhere


def _build_list(heap: dict[int, _Node], values, cycle_to=None) -> Ref | None:
    start = max(heap, default=0) + 1
    ids = [start + i for i in range(len(values))]
    for i, (nid, v) in enumerate(zip(ids, values)):
        heap[nid] = _Node(value=v, next=Ref(ids[i + 1]) if i + 1 < len(ids) else None, original=True)
    if cycle_to is not None and ids:
        heap[ids[-1]].next = Ref(ids[cycle_to])
    return Ref(ids[0]) if ids else None


def _walk_list(heap, ref) -> tuple[list[int], bool, bool, set[int]]:
    seen: set[int] = set()
    vals, dangling = [], False
    while ref is not None:
        if ref.id in seen:
            return vals, True, dangling, seen
        seen.add(ref.id)
        n = heap[ref.id]
        if n.freed:
            dangling = True
        vals.append(n.value)
        ref = n.next
    return vals, False, dangling, seen


def run(operation: str, lines: list[str], inst: Instance) -> RunResult:
    """Execute `lines` as the body of `operation` on `inst`."""
    params, funcs = _signature(operation, inst)
    try:
        stmts = parse(lines)
        _static_check(stmts, params, funcs)
    except CompileError as e:
        return RunResult("compile_error", str(e))

    heap: dict[int, _Node] = {}
    env: dict[str, Any] = {}
    if operation == "mergeSortedLists":
        env["l1"] = _build_list(heap, inst.values)
        env["l2"] = _build_list(heap, inst.l2 or ())
    else:
        env["head"] = _build_list(heap, inst.values, inst.cycle_to)
    if inst.value is not None:
        env["__value"] = inst.value
    if inst.index is not None:
        env["index"] = env["__index"] = inst.index

    m = _Machine(heap, stmts, funcs)
    try:
        returned = m.call(env)
    except RuntimeFault as e:
        return RunResult("runtime_error", str(e))

    if operation == "detectCycle":
        return RunResult("ok", returned=returned, reached=m.reached)
    result_ref = returned if operation in ("mergeSortedLists", "sortList") else env.get("head")
    if result_ref is not None and not isinstance(result_ref, Ref):
        return RunResult("ok", returned=returned, values=None, reached=m.reached)
    vals, cyclic, dangling, reach = _walk_list(heap, result_ref)
    leaked = [n.value for nid, n in heap.items() if n.original and not n.freed and nid not in reach]
    return RunResult("ok", returned=returned, values=vals, cyclic=cyclic,
                     leaked=leaked, dangling=dangling, reached=m.reached,
                     unbalanced=m.unbalanced)


def _signature(operation: str, inst: Instance) -> tuple[set[str], dict[str, int]]:
    """Parameters and library functions in scope. Only what the operation really
    receives: `index` in insertAtHead is a compile error, not a runtime one."""
    funcs = dict(NODE_FUNCS)
    if operation == "mergeSortedLists":
        return {"l1", "l2"}, funcs
    params = {"head"}
    if inst.value is not None:
        params.add("__value")
    if inst.index is not None:
        params |= {"index", "__index"}
    if operation == "sortList":
        funcs.update({"merge": 2, "sortList": 1})
    return params, funcs


# ── Ground truth + verdicts ────────────────────────────────────────────────────

def expected(operation: str, inst: Instance):
    """What a correct program must produce on `inst` (list values, or a bool)."""
    if operation == "detectCycle":
        return inst.cycle_to is not None
    if operation == "mergeSortedLists":
        return sorted(inst.values + (inst.l2 or ()))
    nodes = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < len(inst.values) else None}
             for i, v in enumerate(inst.values)]
    op_value = inst.value
    return execute_operation(operation, nodes, op_value, inst.index)["values"]


@dataclass
class Verdict:
    correct: bool
    outcome: str        # run outcome
    reason: str         # short, student-readable consequence
    reached: set[int] = field(default_factory=set)


def judge(operation: str, lines: list[str], inst: Instance) -> Verdict:
    r = run(operation, lines, inst)
    if r.outcome != "ok":
        return Verdict(False, r.outcome, r.error or r.outcome)
    want = expected(operation, inst)

    def v(ok: bool, reason: str) -> Verdict:
        return Verdict(ok, "ok", reason, r.reached)

    if operation == "detectCycle":
        if r.returned is want:
            return v(True, "correct")
        return v(False, f"answers {str(r.returned).lower()} on a list "
                        f"{'with' if want else 'without'} a cycle")
    if r.values is None:
        return v(False, "the result is not a list")
    if r.cyclic:
        return v(False, "the list now loops back on itself")
    if r.dangling:
        return v(False, "a freed node is still in the list")
    if r.values != want:
        return v(False, f"the list ends up {' -> '.join(map(str, r.values)) or 'empty'}")
    if r.leaked:
        return v(False, f"node {r.leaked[0]} is lost but never freed (memory leak)")
    if r.unbalanced:
        return v(False, "sorts, but splits off one node at a time instead of halving "
                        "the list — that is O(n^2), not merge sort")
    return v(True, "correct")


def instances(operation: str, meta: dict) -> list[Instance]:
    """A deterministic spread of boards in the generator's distribution, so a
    program that is only coincidentally right (one length, one index) fails."""
    rng = random.Random(f"items:{operation}")
    out: list[Instance] = []
    if operation == "mergeSortedLists":
        # hand-picked so each list is the one that runs out first, interleaved
        # and one-list-entirely-smaller — random pairs left `while (l1 != NULL)`
        # passing because l1 always happened to run out first
        pairs = [((1,), (2,)), ((2,), (1,)), ((1, 4, 9), (2, 3)), ((2, 5), (1, 7, 8)),
                 ((1, 2, 3), (4, 5, 6)), ((4, 5, 6), (1, 2, 3)), ((3, 8), (1, 6, 9))]
        return [Instance(a, l2=b) for a, b in pairs]
    if meta.get("startsEmpty"):
        return [Instance((), value=v) for v in (7, 42, 88)]
    # from the shortest list the operation must handle: `curr = head.next`
    # happens to work for insertAtTail on every list of 2+ nodes
    lo = max(1, meta.get("minNodes", 1))
    for n in range(lo, 6):
        vals = tuple(rng.sample(range(1, 99), n))
        value = rng.choice([v for v in range(1, 99) if v not in vals]) if meta.get("needsValue") else None
        if operation == "detectCycle":
            out.append(Instance(vals))
            out.append(Instance(vals, cycle_to=1))
            out.append(Instance(vals, cycle_to=0))
        elif operation == "removeAtPosition":
            out.extend(Instance(vals, index=i) for i in range(1, n))
        elif operation == "insertAtPosition":
            out.extend(Instance(vals, value=value, index=i) for i in range(2, n + 1))
        else:
            out.append(Instance(vals, value=value))
    if operation == "sortList":
        # its base case is part of the algorithm: empty and one-node lists too
        out += [Instance(()), Instance((rng.randint(1, 98),))]
    return out


@dataclass
class ProgramReport:
    correct: bool
    outcome: str       # worst outcome across instances: compile_error > runtime_error > ok
    reason: str        # the first failure's consequence (or "correct")
    reached: set[int] = field(default_factory=set)   # lines reached on ANY instance


def check_program(operation: str, lines: list[str], insts: list[Instance],
                  stop_on_fail: bool = False) -> ProgramReport:
    """Correct only if correct on every instance. stop_on_fail skips the rest
    once one board fails (correctness-only callers; `outcome` is then partial)."""
    first_fail = None
    worst = "ok"
    reached: set[int] = set()
    rank = {"ok": 0, "runtime_error": 1, "compile_error": 2}
    for inst in insts:
        v = judge(operation, lines, inst)
        reached |= v.reached
        if rank[v.outcome] > rank[worst]:
            worst = v.outcome
        if not v.correct and first_fail is None:
            first_fail = v
        if v.outcome == "compile_error" or (stop_on_fail and first_fail is not None):
            break
    if first_fail is None:
        return ProgramReport(True, "ok", "correct", reached)
    return ProgramReport(False, worst, first_fail.reason, reached)


def valid_orders(operation: str, steps: list[str], insts: list[Instance]) -> list[list[int]]:
    """Every ordering of `steps` that is a correct program with no dead step —
    computed, not guessed. (A step parked after an unconditional `return` never
    runs; output alone can't tell, e.g. sortList still sorts without its
    midpoint loop, it just splits off one node at a time.)"""
    out = []
    for p in itertools.permutations(range(len(steps))):
        rep = check_program(operation, [steps[i] for i in p], insts, stop_on_fail=True)
        if rep.correct and len(rep.reached) == len(steps):
            out.append(list(p))
    return out


def usable_in_place_of(operation: str, steps: list[str], extra: str,
                       insts: list[Instance]) -> tuple[int, list[str]] | None:
    """The ordering board has exactly len(steps) slots, so a distractor can only
    take a real step's place — anywhere in the order. Returns (replaced step,
    a correct program using `extra`) if some such assembly is still correct."""
    n = len(steps)
    for k in range(n):
        pool = [s for i, s in enumerate(steps) if i != k] + [extra]
        for p in itertools.permutations(range(n)):
            lines = [pool[i] for i in p]
            rep = check_program(operation, lines, insts, stop_on_fail=True)
            if rep.correct and len(rep.reached) == n:
                return k, lines
    return None
