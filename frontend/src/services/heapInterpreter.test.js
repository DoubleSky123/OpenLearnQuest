import { describe, expect, it } from 'vitest';
import fixtures from '../prototype/fixtures.json';
import { STEP_LIMIT, addrForPlot, predictionAnswer, runProgram } from './heapInterpreter';

const declared = (op) => fixtures.declared[op];
const run = (row) => runProgram(row.program, { ...row, declared: declared(row.operation) });
const list = (...values) => values.map((value, i) => ({ id: i + 1, value, next: i + 1 < values.length ? i + 2 : null }));

// ── R5: parity with ll_executor (goalPattern is the question bank's authority) ──

describe('parity with ll_executor', () => {
  it.each(fixtures.parity.map(q => [q.id, q]))('%s: correct program ends on goalPattern', (_id, q) => {
    const r = run(q);
    expect(r.outcome).toBe('ok');
    expect(r.final.values).toEqual(q.goalPattern);
    expect(r.final).toMatchObject({ cycle: false, dangling: false, leaked: [], matchesGoal: true });
  });
});

// ── R1 / R10: every wrong line the content can show gets a definite outcome ────

// Lines that are wrong as answers but genuinely harmless on their input: an extra
// traversal appended after a correct insertAtPosition changes nothing.
const HARMLESS = new Set(['insertAtPosition|distractor_end|while (curr.next != NULL) curr = curr.next;']);

describe('wrong lines', () => {
  it('covers every distinct wrong line in the Phase 0 content', () => {
    expect(new Set(fixtures.wrong.map(w => w.text)).size).toBeGreaterThanOrEqual(71);
  });

  it.each(fixtures.wrong.map(w => [w.id, w.text, w]))('%s %s', (_id, _text, w) => {
    const r = run(w);
    expect(['compile_error', 'runtime_error', 'ok']).toContain(r.outcome);
    expect(run(w)).toEqual(r);   // deterministic
    if (r.outcome === 'compile_error') expect(r.steps).toEqual([]);   // nothing is built
    if (r.outcome === 'ok' && !HARMLESS.has(`${w.operation}|${w.kind}|${w.text}`)) {
      // a wrong answer must never quietly reproduce the correct city
      const looksCorrect = r.final.matchesGoal && r.final.leaked.length === 0 && !r.final.dangling;
      expect(looksCorrect).toBe(false);
    }
  });
});

// ── R1 / R3 / R10: the faults and leaks the city has to get right ───────────────

const HEAD3 = { initialNodes: list(10, 20, 30), declared: ['head', 'newNode'] };
const POS = (index) => ({ initialNodes: list(10, 20, 30, 40), operationPosition: index, declared: ['curr', 'head', 'newNode'] });
const REM = (index) => ({ initialNodes: list(10, 20, 30, 40), operationPosition: index, declared: ['curr', 'head', 'temp'] });
const LOOP = 'for (int i = 0; i < index-1; i++) curr = curr.next;';

describe('semantics', () => {
  it('insertAtHead with head moved first: self-loop, and the old list leaks the moment head moves', () => {
    const r = runProgram(['newNode = createNode(5);', 'head = newNode;', 'newNode.next = head;'], HEAD3);
    expect(r.outcome).toBe('ok');
    expect(r.final.cycle).toBe(true);
    expect(r.final.leaked).toEqual([addrForPlot(0), addrForPlot(1), addrForPlot(2)]);
    expect(r.steps[1].events).toContainEqual({ type: 'leak', addrs: [addrForPlot(0), addrForPlot(1), addrForPlot(2)] });
  });

  it('removeAtPosition without free: the list is right but the removed node leaks', () => {
    const r = runProgram(['curr = head;', LOOP, 'temp = curr.next;', 'curr.next = temp.next;'], REM(2));
    expect(r.final.values).toEqual([10, 20, 40]);
    expect(r.final.leaked).toEqual([addrForPlot(2)]);
  });

  it('free before the bypass: reading temp.next is use-after-free', () => {
    const r = runProgram(['curr = head;', LOOP, 'temp = curr.next;', 'free(temp);', 'curr.next = temp.next;'], REM(2));
    expect(r.outcome).toBe('runtime_error');
    expect(r.error).toMatchObject({ line: 4, kind: 'use_after_free' });
    expect(r.steps.at(-1).fault).toBe(true);
  });

  it('i < index walks one node too far: inserted one position late', () => {
    const r = runProgram(['curr = head;', 'for (int i = 0; i < index; i++) curr = curr.next;',
      'newNode = createNode(5);', 'newNode.next = curr.next;', 'curr.next = newNode;'], POS(2));
    expect(r.final.values).toEqual([10, 20, 30, 5, 40]);
  });

  it('walking off the end, then curr.next: null dereference', () => {
    const r = runProgram(['curr = head;', 'while (curr != NULL) curr = curr.next;',
      'newNode = createNode(5);', 'newNode.next = curr.next;', 'curr.next = newNode;'], POS(2));
    expect(r.error).toMatchObject({ line: 3, kind: 'null_deref' });
  });

  it('newNode.next = newNode is a self-loop', () => {
    const r = runProgram(['newNode = createNode(5);', 'newNode.next = newNode;', 'head = newNode;'], HEAD3);
    expect(r.final.cycle).toBe(true);
    expect(r.final.values).toEqual([5]);
  });

  it(`a loop over a cycle stops after ${STEP_LIMIT} executed statements`, () => {
    const r = runProgram(['curr = head;', 'curr.next = head;', 'while (curr.next != NULL) curr = curr.next;'],
      { initialNodes: list(10, 20, 30), declared: ['curr', 'head'] });
    expect(r.error).toMatchObject({ line: 2, kind: 'step_limit' });
  });

  it('a pointer read before it is assigned is uninitialised', () => {
    const r = runProgram(['curr = head;', LOOP, 'curr.next = temp.next;', 'temp = curr.next;', 'free(temp);'], REM(2));
    expect(r.error).toMatchObject({ line: 2, kind: 'uninitialized' });
  });

  it('freeing the same node twice is a double free', () => {
    const r = runProgram(['temp = head;', 'head = head.next;', 'free(temp);', 'free(temp);'],
      { initialNodes: list(10, 20), declared: ['head', 'temp'] });
    expect(r.error).toMatchObject({ line: 3, kind: 'double_free' });
  });

  it('a node held by temp is not leaked mid-program; only what head cannot reach at the end is', () => {
    const r = runProgram(['temp = head;', 'head = head.next;', 'free(temp);'],
      { initialNodes: list(10, 20, 30), declared: ['head', 'temp'] });
    expect(r.steps[1].leaked).toEqual([]);              // after head = head.next, temp still holds the old head
    expect(r.steps[2].events).toContainEqual({ type: 'free', addr: addrForPlot(0) });
    expect(r.final).toMatchObject({ values: [20, 30], leaked: [], matchesGoal: null });
  });

  it.each([
    ['newNode = makeNode(5);', 'unknown_function'],
    ['newNode.val = head;', 'unknown_field'],
    ['newNode.prev = head;', 'unknown_field'],
    ['NULL = newNode;', 'not_assignable'],
    ['newNode = createNode(head);', 'type_mismatch'],
    ['newNode = newNode(5);', 'not_a_function'],
    ['curr = head;', 'undeclared'],
  ])('%s is rejected before anything is built (%s)', (line, kind) => {
    const r = runProgram(['newNode = createNode(5);', line, 'head = newNode;'], HEAD3);
    expect(r).toMatchObject({ outcome: 'compile_error', steps: [], error: { line: 1, kind } });
  });

  it('a line the parser cannot handle is "unsupported", never the correct path', () => {
    const r = runProgram(['newNode = createNode(5);', 'newNode.next = (head != NULL) ? head : NULL;', 'head = newNode;'], HEAD3);
    expect(r).toMatchObject({ outcome: 'unsupported', steps: [], final: null, error: { line: 1 } });
  });
});

// ── R2: buildings keep their plot for life ─────────────────────────────────────

describe('layout', () => {
  it('every object keeps its addr and plot across steps; new nodes take the next plot', () => {
    const r = runProgram(['curr = head;', LOOP, 'newNode = createNode(5);', 'newNode.next = curr.next;', 'curr.next = newNode;'], POS(2));
    const plotOf = new Map();
    for (const step of r.steps) {
      for (const n of step.heap) {
        if (plotOf.has(n.addr)) expect(n.plot).toBe(plotOf.get(n.addr));
        plotOf.set(n.addr, n.plot);
        expect(n.addr).toBe(addrForPlot(n.plot));
      }
    }
    expect(r.steps.at(-1).heap.map(n => n.value)).toEqual([10, 20, 30, 40, 5]);   // plot order, not list order
    expect(r.final.values).toEqual([10, 20, 5, 30, 40]);
  });
});

// ── R4: prototype answer keys come from the trace ──────────────────────────────

describe('prototype items', () => {
  const item = (id) => fixtures.prototype.find(it => it.id === id);
  const expected = {
    A1: (it) => addrForPlot(it.initialNodes.length),                               // the new node points at itself
    A2: (it) => [addrForPlot(it.initialNodes.length - 1)],                         // the old tail-side successor leaks
    A3: () => 'runtime_error',                                                     // use after free
    B1: () => [addrForPlot(0)],                                                    // the original head leaks
    B2: (it) => addrForPlot(it.operationPosition),                                 // curr stops one node too far
    B3: () => 'ok',                                                                // runs, leaving a dangling link
  };

  it('has two sets of one item per operation, each with a distinct list', () => {
    for (const set of ['A', 'B'])
      expect(fixtures.prototype.filter(it => it.set === set).map(it => it.operation).sort()).toEqual([...fixtures.operations].sort());
    expect(new Set(fixtures.prototype.map(it => JSON.stringify(it.initialNodes))).size).toBe(6);
  });

  it.each(Object.keys(expected))('%s answer key', (id) => {
    const it = item(id);
    expect(predictionAnswer(it.predict, run(it))).toEqual(expected[id](it));
  });
});
