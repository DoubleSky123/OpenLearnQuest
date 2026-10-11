import { useEffect, useMemo, useRef, useState } from 'react';
import fixtures from './fixtures.json';
import { predictionAnswer, runProgram } from '../services/heapInterpreter';
import HeapView2D from './HeapView2D';
import CityView3D from './CityView3D';
import CityHub from './CityHub';

/**
 * Memory City Phase 0 prototype: predict-then-step on six programs a "classmate"
 * wrote, half in a flat 2D view and half in the 3D city, for the Gate 0 test
 * with the professor and 3–5 students (docs/designs/memory-city.md).
 *
 *   R12  within-subject crossover: P1 A3D/B2D, P2 A2D/B3D, P3 B3D/A2D,
 *        P4 B2D/A3D, P5 = P1. The view can't be switched before answering.
 *   R4   everything is recorded locally (sessionStorage, wrapped in try/catch)
 *        and downloaded as JSON at the end; no names, participant codes only.
 *   R7   no WebGL (or a lost context) -> the rest of the session is 2D and the
 *        affected items are recorded as '2D-fallback'.
 */
const STORAGE_KEY = 'memoryCity.prototype.session.v1';
const SCHEDULE = [
  [['A', '3D'], ['B', '2D']],
  [['A', '2D'], ['B', '3D']],
  [['B', '3D'], ['A', '2D']],
  [['B', '2D'], ['A', '3D']],
];
const OUTCOMES = [
  ['ok', 'It runs to the end'],
  ['runtime_error', 'It stops with a runtime error'],
  ['compile_error', 'It is rejected before it runs (won’t compile)'],
];

const store = {
  load() { try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)); } catch { return null; } },
  save(s) { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* storage blocked: keep going in memory */ } },
  clear() { try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } },
};

// Only ever called from event handlers / effects; kept outside the component so
// the timing read is visibly not part of rendering.
const now = () => performance.now();
const elapsedSince = (t0) => Math.round(now() - (t0 ?? now()));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function planFor(code) {
  const n = Number(code.slice(1));
  const halves = SCHEDULE[(n - 1) % SCHEDULE.length];
  return {
    schedule: halves.map(([set, view]) => `${set}${view}`).join('/'),
    items: halves.flatMap(([set, view]) =>
      fixtures.prototype.filter(it => it.set === set).map(it => ({ id: it.id, view }))),
  };
}

const itemById = (id) => fixtures.prototype.find(it => it.id === id);

function task(item) {
  switch (item.operation) {
    case 'insertAtHead': return `insert ${item.operationValue} at the head`;
    case 'insertAtPosition': return `insert ${item.operationValue} at index ${item.operationPosition}`;
    case 'removeAtPosition': return `remove the node at index ${item.operationPosition}`;
    default: return item.title;
  }
}

// frames = the city before line 1, one per executed statement, and — when the
// program ran to the end — a closing frame where the locals are gone and only
// head remains, which is when C leaks become final (eng review R3).
function framesFor(result) {
  const frames = [{ ...result.initial, line: null, label: 'Before line 1 runs' }, ...result.steps];
  if (result.outcome === 'ok') {
    const last = frames.at(-1);
    frames.push({
      ...last, line: null, end: true, events: [],
      vars: { head: last.vars.head }, leaked: result.final.leaked,
      label: 'The program ends — local pointers disappear; only head is left',
    });
  }
  return frames;
}

function nodeName(frame, addr) {
  if (addr === null) return 'NULL';
  if (addr === undefined) return '—';
  const n = frame.heap.find(x => x.addr === addr);
  return n ? `${addr} (${n.value})` : addr;
}

function sameAnswer(kind, a, b) {
  if (kind === 'leaked') return JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
  return a === b;
}

function describeAnswer(kind, value, frame) {
  if (kind === 'outcome') return OUTCOMES.find(([k]) => k === value)?.[1] ?? value;
  if (kind === 'leaked') return value?.length ? value.map(a => nodeName(frame, a)).join(', ') : 'nothing leaks';
  return nodeName(frame, value);
}

// ── Item screen ──────────────────────────────────────────────────────────────

function ItemScreen({ item, assignedView, webglOk, onWebglFail, position, total, onDone }) {
  const result = useMemo(
    () => runProgram(item.program, { ...item, declared: fixtures.declared[item.operation] }),
    [item]);
  const frames = useMemo(() => framesFor(result), [result]);
  const spec = item.predict;
  const answer = useMemo(() => predictionAnswer(spec, result), [spec, result]);

  // a "where does X point" question is asked just before the line runs — the
  // building it asks about may not exist yet at the start
  const gate = spec.kind === 'target' ? frames.findIndex(f => f.line === spec.line) : 0;
  const promptAt = Math.max(gate, 1) - 1;     // frame on which the prediction is asked
  const lockedFrom = promptAt + 1;            // first frame that needs the prediction
  // a target is revealed once the line has run for the last time (a loop's last pass)
  const revealAt = spec.kind === 'target' ? frames.findLastIndex(f => f.line === spec.line) : frames.length - 1;
  const condition = assignedView === '3D' && !webglOk ? '2D-fallback' : assignedView;

  const [cursor, setCursor] = useState(0);
  const [maxSeen, setMaxSeen] = useState(0);
  const [prediction, setPrediction] = useState(null);   // { value, ms }
  const [picking, setPicking] = useState([]);
  const [viewOverride, setViewOverride] = useState(null);   // only after predicting (R12)
  const [switched, setSwitched] = useState(false);
  const askedAt = useRef(null);
  const runTimer = useRef(null);

  const waiting = !prediction && cursor === promptAt;
  const atEnd = cursor >= frames.length - 1;
  const canAdvanceFrom = (c, predicted) => c < frames.length - 1 && (predicted || c + 1 < lockedFrom);
  const revealed = Boolean(prediction) && cursor >= revealAt;
  const shownView = condition === '2D-fallback' ? '2D' : (viewOverride ?? condition);

  useEffect(() => { if (waiting && askedAt.current === null) askedAt.current = now(); }, [waiting]);
  useEffect(() => () => clearInterval(runTimer.current), []);

  const go = (to) => {
    setCursor(to);
    setMaxSeen(m => Math.max(m, to));
  };
  const canStep = canAdvanceFrom(cursor, Boolean(prediction));
  const step = () => { if (canStep) go(cursor + 1); };
  const run = () => {
    clearInterval(runTimer.current);
    const predicted = Boolean(prediction);
    let c = cursor;
    runTimer.current = setInterval(() => {
      if (!canAdvanceFrom(c, predicted)) { clearInterval(runTimer.current); return; }
      c += 1;
      go(c);
    }, 650);
  };
  const reset = () => { clearInterval(runTimer.current); setCursor(0); };

  const lockIn = (value) => {
    setPrediction({ value, ms: elapsedSince(askedAt.current) });
    setPicking([]);
  };

  const frame = frames[cursor];
  const selectable = waiting && (spec.kind === 'target' || spec.kind === 'leaked');
  const onSelect = (addr) => {
    if (spec.kind === 'target') lockIn(addr);
    else setPicking(p => (p.includes(addr) ? p.filter(a => a !== addr) : [...p, addr]));
  };

  const finish = () => onDone({
    item: item.id, set: item.set, operation: item.operation, condition,
    prediction: prediction.value, answer, correct: sameAnswer(spec.kind, prediction.value, answer),
    msToPredict: prediction.ms, framesViewed: maxSeen + 1, framesTotal: frames.length,
    switchedView: switched,
  });

  const errorLine = result.error?.line;
  const showFault = result.outcome === 'runtime_error' && atEnd;
  const View = shownView === '3D' ? CityView3D : HeapView2D;
  const ints = frame.ints ?? {};

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold text-slate-800">
            {item.title} <span className="font-normal text-slate-500">— a classmate wrote this to {task(item)}</span>
          </h1>
          <span className="text-sm text-slate-500">Program {position} of {total}</span>
        </div>

        <div className="grid grid-cols-5 gap-5">
          {/* code + controls */}
          <section className="col-span-2 rounded-xl border border-slate-200 bg-white p-4">
            <ol className="mb-3 space-y-1 font-mono text-[13px]">
              {item.program.map((line, i) => {
                const current = frame.line === i;
                const bad = (result.outcome === 'compile_error' || result.outcome === 'unsupported' || showFault) && errorLine === i;
                return (
                  <li key={i} className={`flex gap-3 rounded px-2 py-1 ${bad ? 'bg-red-100 ring-1 ring-red-400' : current ? 'bg-amber-100 ring-1 ring-amber-400' : ''}`}>
                    <span className="w-4 text-right text-slate-400">{i + 1}</span>
                    <span className="text-slate-800">{line}</span>
                  </li>
                );
              })}
            </ol>
            <p className="mb-3 min-h-[2.5rem] text-sm text-slate-600">{frame.label}</p>
            <div className="mb-4 flex gap-2">
              <button onClick={step} disabled={!canStep} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-40">Step</button>
              <button onClick={run} disabled={!canStep} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">Run</button>
              <button onClick={reset} disabled={cursor === 0} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">Reset</button>
            </div>

            {waiting && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
                <p className="mb-2 font-medium">Predict first: {spec.prompt}</p>
                {spec.kind === 'outcome' && (
                  <div className="flex flex-col gap-2">
                    {OUTCOMES.map(([k, text]) => (
                      <button key={k} onClick={() => lockIn(k)} className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-left hover:bg-indigo-100">{text}</button>
                    ))}
                  </div>
                )}
                {spec.kind === 'target' && (
                  <button onClick={() => lockIn(null)} className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 hover:bg-indigo-100">It points at NULL</button>
                )}
                {spec.kind === 'leaked' && (
                  <button onClick={() => lockIn(picking)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-white">
                    Lock in ({picking.length ? `${picking.length} selected` : 'nothing leaks'})
                  </button>
                )}
              </div>
            )}
            {prediction && !revealed && (
              <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Locked in. Step through to see what really happens.</p>
            )}
            {revealed && (() => {
              const ok = sameAnswer(spec.kind, prediction.value, answer);
              return (
                <div className={`rounded-lg p-3 text-sm ${ok ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
                  <p className="font-medium">{ok ? 'Your prediction was right.' : 'Not what happened.'}</p>
                  <p>You said: {describeAnswer(spec.kind, prediction.value, frame)}</p>
                  <p>It was: {describeAnswer(spec.kind, answer, frame)}</p>
                  {atEnd && (
                    <button onClick={finish} className="mt-3 rounded-md bg-slate-800 px-3 py-1.5 text-white">
                      {position === total ? 'Finish' : 'Next program'}
                    </button>
                  )}
                </div>
              );
            })()}
          </section>

          {/* the city */}
          <section className="col-span-3 flex flex-col rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
              <span>Memory — every building is a node at its address</span>
              {prediction && webglOk && (
                <button onClick={() => { setViewOverride(shownView === '3D' ? '2D' : '3D'); setSwitched(true); }}
                  className="rounded border border-slate-300 px-2 py-0.5 text-slate-600">
                  Switch to {shownView === '3D' ? '2D' : '3D'}
                </button>
              )}
            </div>
            <div className="relative h-[460px]">
              {(result.outcome === 'compile_error' || result.outcome === 'unsupported') && (
                <div className="absolute inset-x-4 top-3 z-10 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {result.outcome === 'compile_error'
                    ? <>Blueprint rejected — nothing was built. Line {errorLine + 1}: {result.error.message}</>
                    : <>The prototype can&rsquo;t simulate line {errorLine + 1} yet.</>}
                </div>
              )}
              {showFault && (
                <div className="absolute inset-x-4 top-3 z-10 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                  Stopped on line {errorLine + 1}: {result.error.message}
                </div>
              )}
              <View frame={frame} selectable={selectable} selected={picking} onSelect={onSelect} onFail={onWebglFail} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 px-4 py-2 font-mono text-[12px] text-slate-600">
              {Object.entries(frame.vars).map(([name, v]) => (
                <span key={name}>{name} → {v === 'undef' ? 'not set yet' : nodeName(frame, v)}{v && v !== 'undef' && frame.heap.find(n => n.addr === v)?.freed ? ' (freed!)' : ''}</span>
              ))}
              {Object.entries(ints).map(([name, v]) => <span key={name}>{name} = {v}</span>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Start / end screens ─────────────────────────────────────────────────────

function StartScreen({ webglOk, saved, onStart, onResume }) {
  const [code, setCode] = useState('');
  const valid = /^P[1-9]\d*$/.test(code);
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="mb-1 text-xl font-semibold text-slate-800">Memory City — prototype</h1>
        <p className="mb-5 text-sm text-slate-600">
          Six short programs. For each one, predict what it does, then step through it and watch memory change.
        </p>
        {!webglOk && (
          <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            This computer can&rsquo;t show 3D (no WebGL), so the whole session will use the 2D view.
          </p>
        )}
        {saved && (
          <button onClick={onResume} className="mb-4 w-full rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            {saved.index >= saved.plan.length
              ? `Back to ${saved.participant}'s results (not downloaded yet?)`
              : `Resume ${saved.participant} (program ${saved.index + 1} of ${saved.plan.length})`}
          </button>
        )}
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="pcode">Participant code (facilitator)</label>
        <input id="pcode" value={code} onChange={e => setCode(e.target.value.trim().toUpperCase())} placeholder="P1"
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 font-mono" />
        <button disabled={!valid} onClick={() => onStart(code)} className="w-full rounded-md bg-slate-800 px-3 py-2 text-white disabled:opacity-40">
          Start
        </button>
      </div>
    </div>
  );
}

function download(session) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  a.href = url;
  a.download = `memory-city-${session.participant}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function EndScreen({ session, webglOk, onPrefer, onNewParticipant }) {
  const last = itemById(session.plan.at(-1).id);
  const frame = useMemo(() => {
    const r = runProgram(last.program, { ...last, declared: fixtures.declared[last.operation] });
    return framesFor(r).at(-1);
  }, [last]);
  const correct = session.records.filter(r => r.correct).length;
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="mb-1 text-xl font-semibold text-slate-800">Done — thank you!</h1>
        <p className="mb-5 text-sm text-slate-600">{correct} of {session.records.length} predictions were right.</p>
        <p className="mb-3 font-medium text-slate-800">The same memory, two ways. For homework, which view would you pick?</p>
        <div className={`mb-4 grid gap-4 ${webglOk ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div className="h-56 rounded-lg border border-slate-200"><HeapView2D frame={frame} /></div>
          {webglOk && <div className="h-56 rounded-lg border border-slate-200"><CityView3D frame={frame} /></div>}
        </div>
        <div className="mb-6 flex gap-2">
          {['2D', '3D', 'no preference'].map(p => (
            <button key={p} onClick={() => onPrefer(p)} disabled={p === '3D' && !webglOk}
              className={`rounded-md border px-3 py-1.5 text-sm ${session.preference === p ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'} disabled:opacity-40`}>
              {p === 'no preference' ? 'No preference' : p}
            </button>
          ))}
        </div>
        <div className="flex gap-2 border-t border-slate-100 pt-4">
          <button onClick={() => download(session)} disabled={!session.preference}
            className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-40">Download results (JSON)</button>
          <button onClick={onNewParticipant} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Next participant</button>
        </div>
        {!session.preference && <p className="mt-2 text-xs text-slate-500">Pick a view first — then download before closing this tab.</p>}
      </div>
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

export default function PrototypeApp() {
  const [webglOk, setWebglOk] = useState(() => hasWebGL());
  const [saved] = useState(() => store.load());
  const [session, setSession] = useState(null);

  // every change goes through a functional update (callbacks such as the WebGL
  // loss handler can fire from a stale render) and is persisted after commit
  useEffect(() => { if (session) store.save(session); }, [session]);

  const start = (code) => {
    const { schedule, items } = planFor(code);
    setSession({
      participant: code, schedule, plan: items, index: 0, records: [],
      webgl: webglOk, startedAt: new Date().toISOString(), preference: null, finishedAt: null,
      fixturesSchema: fixtures.schema,
    });
  };

  const onWebglFail = () => {
    setWebglOk(false);
    setSession(s => (s ? { ...s, webgl: false, webglLostAt: s.webglLostAt ?? s.index } : s));
  };

  if (!session)
    return <StartScreen webglOk={webglOk} saved={saved} onStart={start} onResume={() => setSession(saved)} />;

  if (session.index >= session.plan.length)
    return (
      <EndScreen session={session} webglOk={webglOk}
        onPrefer={(p) => setSession(s => ({ ...s, preference: p, finishedAt: new Date().toISOString() }))}
        onNewParticipant={() => { store.clear(); setSession(null); }} />
    );

  // the city first (3D only — on a machine without WebGL the session goes straight to class)
  if (webglOk && session.index === 0 && !session.enteredSchool)
    return (
      <CityHub participant={session.participant} onWebglFail={onWebglFail}
        onEnter={() => setSession(s => ({ ...s, enteredSchool: true }))} />
    );

  const planned = session.plan[session.index];
  return (
    <ItemScreen
      key={planned.id}
      item={itemById(planned.id)}
      assignedView={planned.view}
      webglOk={webglOk}
      onWebglFail={onWebglFail}
      position={session.index + 1}
      total={session.plan.length}
      onDone={(record) => setSession(s => ({ ...s, index: s.index + 1, records: [...s.records, record] }))}
    />
  );
}
