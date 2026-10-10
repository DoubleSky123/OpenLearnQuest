/**
 * Memory City heap interpreter (Phase 0).
 *
 * Executes the pseudocode a student actually sees — including wrong answers —
 * over an explicit heap, so the city can show what the code really does.
 * Eng review decisions (docs/designs/memory-city.md, Decision ledger):
 *
 *   R6  runProgram(lines, init) is a pure function: the whole program is
 *       compile-checked first, then executed; Step/Run/Reset are just indexes
 *       into `steps`, and a "what if" branch is another call with one line swapped.
 *   R1  three outcomes, plus one escape hatch:
 *         compile_error  unknown function/field/variable, NULL assigned, type
 *                        misuse, calling a pointer -> nothing is built
 *         runtime_error  null dereference, uninitialised pointer, use after
 *                        free, double free, STEP_LIMIT executed statements
 *         ok             ran to the end (correct, or a logic error)
 *         unsupported    a line the parser doesn't know -> "the prototype
 *                        can't simulate this line yet"; NEVER the correct path
 *   R3  C semantics: nothing is ever collected. A node nothing references (head
 *       plus every live pointer variable) is leaked and stays on its plot; only
 *       free() demolishes. When the program ends the locals die, so the final
 *       leak set is every live node head can't reach.
 *   R2  every heap object gets a fixed `addr` and `plot` for its lifetime, so
 *       the 2D and 3D views can lay buildings out by plot, never by list order.
 *
 * Node fields match what students are shown (NodeClassComment): `value` and
 * `next`; createNode(v) sets next = NULL.
 */

export const STEP_LIMIT = 500;

const FIELDS = { next: 'ptr', value: 'int' };
const FUNCTIONS = {
  createNode: { param: 'int', returns: 'ptr' },
  free:       { param: 'ptr', returns: 'void' },
};
// Plausible names from other languages, with a pointed explanation.
const NOT_C = {
  delete: 'C has no delete() — memory is released with free().',
  remove: 'There is no remove() — memory is released with free().',
  malloc: 'Nodes are made with createNode(value) in these exercises.',
};
const DEFAULT_LOCALS = ['head', 'curr', 'temp', 'newNode', 'prev', 'dummy', 'slow', 'fast', 'mid'];
const UNDEF = 'undef';

/** Plot p -> a scattered-looking but stable address label: heap objects are not contiguous. */
export function addrForPlot(p) {
  return '0x' + (0x1a + p * 0x17).toString(16).toUpperCase();
}

// ── Errors ───────────────────────────────────────────────────────────────────

class CompileError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}
class RuntimeFault extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}
class Unsupported extends Error {}

// ── Tokenizer ────────────────────────────────────────────────────────────────

const SYMBOLS = ['==', '!=', '<=', '>=', '++', '&&', '||', '=', '<', '>', '+', '-', '(', ')', '{', '}', ';', '.', ',', '!', '?', ':'];

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const start = i;
    if (/\d/.test(ch)) {
      while (i < src.length && /\d/.test(src[i])) i++;
      out.push({ t: 'num', v: Number(src.slice(start, i)), start, end: i });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      while (i < src.length && /\w/.test(src[i])) i++;
      out.push({ t: 'id', v: src.slice(start, i), start, end: i });
      continue;
    }
    const sym = SYMBOLS.find(s => src.startsWith(s, i));
    if (!sym) throw new Unsupported(`unexpected character ${ch}`);
    i += sym.length;
    out.push({ t: 'sym', v: sym, start, end: i });
  }
  return out;
}

// ── Parser (recursive descent over one source line) ──────────────────────────

function parseLine(src) {
  const toks = tokenize(src);
  let k = 0;
  const peek = (v) => toks[k] && toks[k].v === v;
  const take = (v) => {
    const tok = toks[k];
    if (!tok || (v !== undefined && tok.v !== v)) throw new Unsupported(`expected ${v ?? 'more input'}`);
    k++;
    return tok;
  };
  const text = (from, to) => src.slice(from, to).trim();

  function statement() {
    const startTok = toks[k];
    if (!startTok) throw new Unsupported('empty statement');
    const from = startTok.start;
    let node;
    if (peek('{')) {
      take('{');
      const body = [];
      while (!peek('}')) body.push(statement());
      take('}');
      node = { type: 'block', body };
    } else if (peek('for')) {
      take('for'); take('(');
      if (peek('int')) take('int');
      const name = take().v;
      take('=');
      const init = expression();
      take(';');
      const cond = expression();
      take(';');
      const upd = take().v;
      if (upd !== name) throw new Unsupported('for-loop update must be the loop variable');
      take('++'); take(')');
      node = { type: 'for', name, init, cond, body: statement() };
    } else if (peek('while')) {
      take('while'); take('(');
      const cond = expression();
      take(')');
      node = { type: 'while', cond, body: statement() };
    } else if (peek('if')) {
      take('if'); take('(');
      const cond = expression();
      take(')');
      const then = statement();
      let otherwise = null;
      if (peek('else')) { take('else'); otherwise = statement(); }
      node = { type: 'if', cond, then, otherwise };
    } else if (peek('return')) {
      take('return');
      const value = peek(';') ? null : expression();
      take(';');
      node = { type: 'return', value };
    } else {
      const lhs = expression();
      if (peek('=')) {
        take('=');
        const value = expression();
        take(';');
        node = { type: 'assign', target: lhs, value };
      } else {
        take(';');
        node = { type: 'expr', expr: lhs };
      }
    }
    node.src = text(from, toks[k - 1].end);
    return node;
  }

  const BIN = [['||'], ['&&'], ['==', '!=', '<', '<=', '>', '>='], ['+', '-']];
  function expression(level = 0) {
    if (level === BIN.length) return unary();
    let left = expression(level + 1);
    while (toks[k] && toks[k].t === 'sym' && BIN[level].includes(toks[k].v)) {
      const op = take().v;
      left = { type: 'binary', op, left, right: expression(level + 1) };
      if (level === 2) break;   // comparisons don't chain
    }
    if (peek('?')) throw new Unsupported('conditional expressions are not supported yet');
    return left;
  }
  function unary() {
    if (peek('-')) { take('-'); return { type: 'neg', operand: unary() }; }
    if (peek('!')) throw new Unsupported('! is not supported yet');
    return postfix(primary());
  }
  function primary() {
    const tok = take();
    if (tok.t === 'num') return { type: 'num', value: tok.v };
    if (tok.t === 'id' && tok.v === 'NULL') return { type: 'null' };
    if (tok.t === 'id') {
      if (peek('(')) {
        take('(');
        const args = [];
        while (!peek(')')) {
          args.push(expression());
          if (!peek(')')) take(',');
        }
        take(')');
        return { type: 'call', name: tok.v, args };
      }
      return { type: 'var', name: tok.v };
    }
    if (tok.v === '(') { const e = expression(); take(')'); return e; }
    throw new Unsupported(`unexpected ${tok.v}`);
  }
  function postfix(expr) {
    while (peek('.')) {
      take('.');
      expr = { type: 'field', object: expr, field: take().v };
    }
    return expr;
  }

  const stmts = [];
  while (k < toks.length) stmts.push(statement());
  if (!stmts.length) throw new Unsupported('empty line');
  return stmts;
}

// ── Compile-time check (static types) ────────────────────────────────────────

const describe = (e) =>
  e.type === 'var' ? e.name
    : e.type === 'field' ? `${describe(e.object)}.${e.field}`
    : e.type === 'call' ? `${e.name}(…)`
    : e.type === 'null' ? 'NULL'
    : e.type === 'num' ? String(e.value)
    : 'that expression';

function checkProgram(lines, env) {
  const ptrs = new Set(env.locals);
  const ints = new Set(env.ints);

  function typeOf(e) {
    switch (e.type) {
      case 'num': return 'int';
      case 'null': return 'null';
      case 'neg':
        if (typeOf(e.operand) !== 'int') throw new CompileError('type_mismatch', 'Only numbers can be negated.');
        return 'int';
      case 'var':
        if (ints.has(e.name)) return 'int';
        if (ptrs.has(e.name)) return 'ptr';
        if (FUNCTIONS[e.name]) throw new CompileError('type_mismatch', `${e.name} is a function — call it with ( ).`);
        throw new CompileError('undeclared', `${e.name} isn't declared in this operation.`);
      case 'field': {
        const objType = typeOf(e.object);
        if (objType === 'int') throw new CompileError('type_mismatch', `${describe(e.object)} is a number, not a node, so it has no .${e.field}.`);
        if (!FIELDS[e.field]) throw new CompileError('unknown_field', `A Node has no field called ${e.field} — its fields are value and next.`);
        return FIELDS[e.field];
      }
      case 'call': {
        const fn = FUNCTIONS[e.name];
        if (!fn) {
          if (ptrs.has(e.name)) throw new CompileError('not_a_function', `${e.name} is a pointer, not a function.`);
          throw new CompileError('unknown_function', NOT_C[e.name] ?? `There is no function called ${e.name}().`);
        }
        if (e.args.length !== 1) throw new CompileError('type_mismatch', `${e.name}() takes exactly one argument.`);
        const argType = typeOf(e.args[0]);
        if (fn.param === 'int' && argType !== 'int')
          throw new CompileError('type_mismatch', `${e.name}() takes a number (the node's value), but ${describe(e.args[0])} is a pointer.`);
        if (fn.param === 'ptr' && argType === 'int')
          throw new CompileError('type_mismatch', `${e.name}() takes a pointer to a node, but ${describe(e.args[0])} is a number.`);
        return fn.returns;
      }
      case 'binary': {
        const l = typeOf(e.left), r = typeOf(e.right);
        if (['+', '-', '<', '<=', '>', '>='].includes(e.op)) {
          if (l !== 'int' || r !== 'int') throw new CompileError('type_mismatch', `${e.op} compares numbers, but ${describe(l !== 'int' ? e.left : e.right)} is a pointer.`);
          return e.op === '+' || e.op === '-' ? 'int' : 'bool';
        }
        if (e.op === '==' || e.op === '!=') {
          const num = (t) => t === 'int';
          if (num(l) !== num(r)) throw new CompileError('type_mismatch', `${describe(e.left)} and ${describe(e.right)} can't be compared — one is a number, the other a pointer.`);
          return 'bool';
        }
        return 'bool';   // && ||
      }
      default:
        throw new Unsupported(`unknown expression ${e.type}`);
    }
  }

  function assignable(target, valueType) {
    if (target.type === 'null') throw new CompileError('not_assignable', 'NULL is a constant — it can\'t be assigned to.');
    if (target.type !== 'var' && target.type !== 'field') throw new CompileError('not_assignable', `${describe(target)} can't be assigned to.`);
    const want = typeOf(target);
    if (valueType === 'void') throw new CompileError('type_mismatch', 'free() doesn\'t return anything, so there is nothing to assign.');
    if (want === 'ptr' && valueType === 'int') throw new CompileError('type_mismatch', `${describe(target)} holds a pointer, but the right-hand side is a number.`);
    if (want === 'int' && valueType !== 'int') throw new CompileError('type_mismatch', `${describe(target)} holds a number, but the right-hand side is a pointer.`);
  }

  function stmt(s) {
    switch (s.type) {
      case 'block': s.body.forEach(stmt); return;
      case 'assign': assignable(s.target, typeOf(s.value)); return;
      case 'expr': typeOf(s.expr); return;
      case 'return': if (s.value) typeOf(s.value); return;
      case 'if': typeOf(s.cond); stmt(s.then); if (s.otherwise) stmt(s.otherwise); return;
      case 'while': typeOf(s.cond); stmt(s.body); return;
      case 'for': {
        if (typeOf(s.init) !== 'int') throw new CompileError('type_mismatch', `${s.name} is an int loop counter — it must start at a number.`);
        const had = ints.has(s.name);
        ints.add(s.name);
        typeOf(s.cond); stmt(s.body);
        if (!had) ints.delete(s.name);
        return;
      }
      default: throw new Unsupported(`unknown statement ${s.type}`);
    }
  }

  lines.forEach((parsed, line) => {
    try { parsed.forEach(stmt); } catch (err) { err.line = line; throw err; }
  });
}

// ── Execution ────────────────────────────────────────────────────────────────

function buildInitialState(init, locals) {
  const nodes = init.initialNodes ?? [];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const pointed = new Set(nodes.map(n => n.next).filter(x => x != null));
  const headNode = nodes.find(n => !pointed.has(n.id)) ?? nodes[0];

  // plots follow list order from head, then any stragglers
  const order = [];
  const seen = new Set();
  for (let n = headNode; n && !seen.has(n.id); n = byId.get(n.next)) { order.push(n); seen.add(n.id); }
  nodes.forEach(n => { if (!seen.has(n.id)) order.push(n); });

  const addrOf = new Map(order.map((n, p) => [n.id, addrForPlot(p)]));
  const heap = new Map(order.map((n, p) => [addrOf.get(n.id), {
    addr: addrOf.get(n.id), plot: p, value: n.value,
    next: n.next == null ? null : (addrOf.get(n.next) ?? null), freed: false,
  }]));

  const vars = {};
  locals.forEach(name => { vars[name] = UNDEF; });
  vars.head = headNode ? addrOf.get(headNode.id) : null;
  const ints = {};
  if (Number.isInteger(init.operationPosition)) ints.index = init.operationPosition;
  return { heap, vars, ints, nextPlot: order.length, freedAt: new Map() };
}

function liveReachable(state, roots) {
  const seen = new Set();
  const stack = roots.filter(a => a && a !== UNDEF);
  while (stack.length) {
    const a = stack.pop();
    const node = state.heap.get(a);
    if (!node || node.freed || seen.has(a)) continue;
    seen.add(a);
    if (node.next) stack.push(node.next);
  }
  return seen;
}

function leakedSet(state, roots) {
  const reach = liveReachable(state, roots);
  return [...state.heap.values()].filter(n => !n.freed && !reach.has(n.addr)).map(n => n.addr);
}

function snapshot(state) {
  return {
    heap: [...state.heap.values()].sort((a, b) => a.plot - b.plot).map(n => ({ ...n })),
    vars: { ...state.vars },
    ints: { ...state.ints },
  };
}

function walkFromHead(state) {
  const values = [];
  const seen = new Set();
  let cycle = false, dangling = false;
  for (let a = state.vars.head; a && a !== UNDEF;) {
    const node = state.heap.get(a);
    if (node.freed) { dangling = true; break; }
    if (seen.has(a)) { cycle = true; break; }
    seen.add(a);
    values.push(node.value);
    a = node.next;
  }
  return { values, cycle, dangling };
}

function execute(lines, state) {
  const steps = [];
  let executed = 0;
  let prevLeaked = new Set();
  let line = 0;

  const tick = () => {
    if (++executed > STEP_LIMIT)
      throw new RuntimeFault('step_limit', `Still running after ${STEP_LIMIT} steps — this loop never ends.`);
  };
  const ptrRoots = () => Object.values(state.vars);
  const record = (label, events) => {
    const leaked = leakedSet(state, ptrRoots());
    const fresh = leaked.filter(a => !prevLeaked.has(a));
    if (fresh.length) events.push({ type: 'leak', addrs: fresh });
    prevLeaked = new Set(leaked);
    steps.push({
      line, label, ...snapshot(state),
      reachable: [...liveReachable(state, ptrRoots())], leaked, events,
    });
  };

  function deref(addr, expr) {
    if (addr === UNDEF) throw new RuntimeFault('uninitialized', `${describe(expr)} is used before it's given a value.`);
    if (addr === null) throw new RuntimeFault('null_deref', `${describe(expr)} is NULL, so there is no node to follow.`);
    const node = state.heap.get(addr);
    if (node.freed)
      throw new RuntimeFault('use_after_free', `${describe(expr)} points at memory freed on line ${state.freedAt.get(addr) + 1} — using it is use-after-free.`);
    return node;
  }

  function evaluate(e, events) {
    switch (e.type) {
      case 'num': return e.value;
      case 'null': return null;
      case 'neg': return -evaluate(e.operand, events);
      case 'var': {
        if (e.name in state.ints) return state.ints[e.name];
        const v = state.vars[e.name];
        if (v === UNDEF) throw new RuntimeFault('uninitialized', `${e.name} is used before it's given a value.`);
        return v;
      }
      case 'field': return deref(evaluate(e.object, events), e.object)[e.field];
      case 'call': {
        const arg = evaluate(e.args[0], events);
        if (e.name === 'createNode') {
          const plot = state.nextPlot++;
          const addr = addrForPlot(plot);
          state.heap.set(addr, { addr, plot, value: arg, next: null, freed: false });
          events.push({ type: 'alloc', addr });
          return addr;
        }
        // free()
        if (arg === null) return undefined;   // free(NULL) is a no-op in C
        const node = state.heap.get(arg);
        if (node.freed) throw new RuntimeFault('double_free', `${describe(e.args[0])} was already freed on line ${state.freedAt.get(arg) + 1} — freeing it twice is a double free.`);
        node.freed = true;
        state.freedAt.set(arg, line);
        events.push({ type: 'free', addr: arg });
        return undefined;
      }
      case 'binary': {
        if (e.op === '&&') return Boolean(evaluate(e.left, events)) && Boolean(evaluate(e.right, events));
        if (e.op === '||') return Boolean(evaluate(e.left, events)) || Boolean(evaluate(e.right, events));
        const l = evaluate(e.left, events), r = evaluate(e.right, events);
        switch (e.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '<': return l < r;
          case '<=': return l <= r;
          case '>': return l > r;
          case '>=': return l >= r;
          case '==': return l === r;
          case '!=': return l !== r;
        }
      }
    }
    throw new Unsupported(`cannot evaluate ${e.type}`);
  }

  // Returns 'return' to stop the program early.
  function run(s) {
    switch (s.type) {
      case 'block':
        for (const inner of s.body) if (run(inner) === 'return') return 'return';
        return undefined;
      case 'assign': {
        tick();
        const events = [];
        const value = evaluate(s.value, events);
        if (s.target.type === 'var') {
          if (s.target.name in state.ints) state.ints[s.target.name] = value;
          else { state.vars[s.target.name] = value; events.push({ type: 'set', name: s.target.name, to: value }); }
        } else {
          const node = deref(evaluate(s.target.object, events), s.target.object);
          node[s.target.field] = value;
          events.push(s.target.field === 'next'
            ? { type: 'link', from: node.addr, to: value }
            : { type: 'value', addr: node.addr, value });
        }
        record(s.src, events);
        return undefined;
      }
      case 'expr': {
        tick();
        const events = [];
        evaluate(s.expr, events);
        record(s.src, events);
        return undefined;
      }
      case 'return': {
        tick();
        const events = [];
        if (s.value) evaluate(s.value, events);
        record(s.src, events);
        return 'return';
      }
      case 'if': {
        tick();
        const branch = evaluate(s.cond, []) ? s.then : s.otherwise;
        return branch ? run(branch) : undefined;
      }
      case 'while': {
        for (;;) {
          tick();
          if (!evaluate(s.cond, [])) break;
          if (run(s.body) === 'return') return 'return';
        }
        record(`loop ends: ${s.src.slice(s.src.indexOf('(') + 1, s.src.indexOf(')'))} is false`, []);
        return undefined;
      }
      case 'for': {
        tick();
        state.ints[s.name] = evaluate(s.init, []);
        for (;;) {
          tick();
          if (!evaluate(s.cond, [])) break;
          if (run(s.body) === 'return') return 'return';
          state.ints[s.name] += 1;
        }
        const exitAt = state.ints[s.name];
        delete state.ints[s.name];
        record(`loop ends with ${s.name} = ${exitAt}`, []);
        return undefined;
      }
    }
    throw new Unsupported(`cannot run ${s.type}`);
  }

  try {
    for (line = 0; line < lines.length; line++) {
      let stop = false;
      for (const s of lines[line]) if (run(s) === 'return') { stop = true; break; }
      if (stop) break;
    }
    return { steps };
  } catch (err) {
    if (!(err instanceof RuntimeFault)) throw err;
    steps.push({
      line, label: err.message, ...snapshot(state),
      reachable: [...liveReachable(state, ptrRoots())], leaked: leakedSet(state, ptrRoots()),
      events: [{ type: 'fault', kind: err.kind, message: err.message }],
      fault: true,
    });
    return { steps, error: { line, kind: err.kind, message: err.message } };
  }
}

/**
 * Run a program over an explicit heap.
 *
 * @param {string[]} lines   one pseudocode line per entry, exactly as displayed
 * @param {{initialNodes?: {id:number, value:number, next:number|null}[],
 *          operationPosition?: number|null, goalPattern?: number[],
 *          declared?: string[]}} init
 *        `declared` = pointer locals of the operation (fixtures.json → declared);
 *        without it every common pointer name counts as declared.
 * @returns {{outcome: 'ok'|'compile_error'|'runtime_error'|'unsupported',
 *            steps: object[], error?: {line:number, kind:string, message:string},
 *            final: null|{values:number[], cycle:boolean, dangling:boolean,
 *                         leaked:string[], matchesGoal:boolean|null}}}
 */
export function runProgram(lines, init = {}) {
  const locals = [...new Set(['head', ...(init.declared ?? DEFAULT_LOCALS)])];
  const ints = Number.isInteger(init.operationPosition) ? ['index'] : [];

  let parsed;
  try {
    parsed = lines.map((src, line) => {
      try { return parseLine(src); } catch (err) { err.line = line; throw err; }
    });
    checkProgram(parsed, { locals, ints });
  } catch (err) {
    if (err instanceof Unsupported)
      return { outcome: 'unsupported', steps: [], final: null,
               error: { line: err.line, kind: 'unsupported', message: 'The prototype can\'t simulate this line yet.' } };
    if (err instanceof CompileError)
      return { outcome: 'compile_error', steps: [], final: null,
               error: { line: err.line, kind: err.kind, message: err.message } };
    throw err;
  }

  const state = buildInitialState(init, locals);
  let run;
  try {
    run = execute(parsed, state);
  } catch (err) {
    if (!(err instanceof Unsupported)) throw err;
    return { outcome: 'unsupported', steps: [], final: null,
             error: { line: 0, kind: 'unsupported', message: "The prototype can't simulate this program yet." } };
  }
  const { steps, error } = run;
  const walk = walkFromHead(state);
  const goal = init.goalPattern;
  const final = {
    ...walk,
    leaked: leakedSet(state, [state.vars.head]),   // the program is over: only head survives
    matchesGoal: Array.isArray(goal)
      ? !walk.cycle && !walk.dangling && walk.values.length === goal.length && walk.values.every((v, i) => v === goal[i])
      : null,
  };
  return error
    ? { outcome: 'runtime_error', steps, error, final }
    : { outcome: 'ok', steps, final };
}

/**
 * The correct answer to a prototype item's prediction, read off the trace —
 * never stored, so it can't drift from the interpreter (eng review R4).
 *   target   { line, var, field? }  address var(.field) holds after the LAST step on `line`
 *   leaked   {}                     sorted addresses leaked when the program ends
 *   outcome  {}                     result.outcome
 */
export function predictionAnswer(spec, result) {
  if (spec.kind === 'outcome') return result.outcome;
  if (spec.kind === 'leaked') return result.final ? [...result.final.leaked].sort() : null;
  if (spec.kind === 'target') {
    const step = [...result.steps].reverse().find(s => s.line === spec.line && !s.fault);
    if (!step) return undefined;
    const base = step.vars[spec.var];
    if (base === UNDEF) return undefined;
    if (!spec.field) return base;
    if (base === null) return undefined;
    return step.heap.find(n => n.addr === base)?.[spec.field];
  }
  throw new Error(`unknown prediction kind ${spec.kind}`);
}
