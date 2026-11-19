import { useEffect, useRef, useState } from 'react';
import { npcApi } from '../services/api';

/**
 * Teach Quinn — the elective where the student teaches an AI classmate
 * (backend services/npc_agent.py). Quinn brings code with a misconception in it;
 * the student builds tests that break it, then explains what is wrong. Whether
 * Quinn learns is decided by running the code on the server; the model only
 * words Quinn's replies. This screen just shows the state the server sends.
 */

const C = {
  ink: '#1E1B4B', muted: '#6B7280', faint: '#9CA3AF', line: '#E5E7EB', bg: '#F5F7FA',
  ok: '#059669', okBg: '#D1FAE5', bad: '#DC2626', badBg: '#FEE2E2',
  quinn: '#0D9488', quinnBg: '#CCFBF1', you: '#2563EB', youBg: '#DBEAFE',
  coach: '#7C3AED', coachBg: '#EDE9FE', changed: '#FEF3C7',
};

const card = { background: 'white', borderRadius: 16, padding: '16px 18px', border: `1px solid ${C.line}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };
const h = { margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: C.ink };
const btn = (bg, color = 'white') => ({
  padding: '8px 16px', borderRadius: 10, border: 'none', background: bg, color, fontWeight: 700, fontSize: 14, cursor: 'pointer',
});

function TopBar({ onBack, onNewCase, busy }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 50, background: C.ink }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ ...btn('rgba(255,255,255,0.14)'), border: '1.5px solid rgba(255,255,255,0.22)' }}>← Units</button>
        <span style={{ flex: 1, textAlign: 'center', color: 'white', fontSize: 20, fontWeight: 800 }}>Teach Quinn</span>
        {onNewCase
          ? <button disabled={busy} onClick={onNewCase} style={{ ...btn('rgba(255,255,255,0.14)'), border: '1.5px solid rgba(255,255,255,0.22)' }}>New case</button>
          : <span style={{ width: 90 }} />}
      </div>
    </div>
  );
}

function Code({ c }) {
  const changed = new Set(c.changed);
  return (
    <div style={card}>
      <h3 style={h}>Quinn's {c.title.toLowerCase()}</h3>
      <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, color: C.muted, marginBottom: 8 }}>{c.signature}</div>
      <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 15, background: '#F9FAFB', borderRadius: 10, padding: '8px 0', overflowX: 'auto' }}>
        {c.code.map((ln, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '3px 12px', background: changed.has(i) ? C.changed : 'transparent' }}>
            <span style={{ color: C.faint, width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
            <span style={{ whiteSpace: 'pre', color: C.ink }}>{ln}</span>
            {changed.has(i) && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#B45309', fontFamily: 'system-ui' }}>changed</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Bubble({ m }) {
  const style = {
    npc:    { align: 'flex-start', bg: C.quinnBg, color: '#134E4A', label: 'Quinn' },
    you:    { align: 'flex-end',   bg: C.youBg,   color: '#1E3A8A', label: 'You' },
    coach:  { align: 'flex-start', bg: C.coachBg, color: '#4C1D95', label: 'Coach' },
    system: { align: 'center',     bg: 'transparent', color: C.muted, label: null },
  }[m.who] ?? { align: 'center', bg: 'transparent', color: C.muted };
  return (
    <div style={{ display: 'flex', justifyContent: style.align }}>
      <div style={{ maxWidth: '85%', background: style.bg, color: style.color, borderRadius: 12, padding: m.who === 'system' ? '2px 8px' : '8px 12px', fontSize: m.who === 'system' ? 13 : 14, lineHeight: 1.5 }}>
        {style.label && <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.7, marginBottom: 2 }}>{style.label}</div>}
        {m.text}
      </div>
    </div>
  );
}

function Conversation({ messages, thinking }) {
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages.length, thinking]);
  return (
    <div style={card}>
      <h3 style={h}>Conversation</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {messages.map((m, i) => <Bubble key={i} m={m} />)}
        {thinking && <Bubble m={{ who: 'npc', text: 'Quinn is thinking…' }} />}
        <div ref={end} />
      </div>
    </div>
  );
}

const parseList = (s) => {
  const parts = s.split(/[\s,→>-]+/).filter(Boolean);
  if (parts.some(p => !/^\d+$/.test(p))) return null;
  return parts.map(Number);
};
const preset = (n, start = 10, step = 10) => Array.from({ length: n }, (_, i) => start + step * i).join(', ');

function TestBuilder({ c, busy, onRun }) {
  const s = c.spec;
  const [values, setValues] = useState(preset(Math.max(s.min_len, Math.min(3, s.max_len))));
  const [l2, setL2] = useState(s.two_lists ? '15, 25' : '');
  const [value, setValue] = useState('77');
  const [index, setIndex] = useState('1');
  const [cycle, setCycle] = useState('none');
  const [err, setErr] = useState(null);

  const run = () => {
    const vals = parseList(values);
    const vals2 = s.two_lists ? parseList(l2) : null;
    if (vals === null || (s.two_lists && vals2 === null)) { setErr('Use whole numbers separated by commas, like 10, 20, 30.'); return; }
    const board = { values: vals };
    if (s.two_lists) board.l2 = vals2;
    if (s.value) board.value = Number(value);
    if (s.index) board.index = Number(index);
    if (s.cycle) board.cycle_to = cycle === 'none' ? null : Number(cycle);
    setErr(null);
    onRun(board).catch(e => setErr(e.message));
  };

  const lengths = [];
  for (let n = s.min_len; n <= Math.min(s.max_len, 5); n++) lengths.push(n);
  const input = { padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${C.line}`, fontSize: 14, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' };
  const label = { fontSize: 12, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 4 };
  const n = (parseList(values) ?? []).length;

  return (
    <div style={card}>
      <h3 style={h}>Build a test</h3>
      {s.max_len === 0 ? (
        <p style={{ fontSize: 14, color: C.muted, margin: '0 0 10px' }}>This operation always starts from an empty list.</p>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <span style={label}>{s.two_lists ? 'l1 (sorted)' : 'Starting list'}</span>
          <input value={values} onChange={e => setValues(e.target.value)} style={{ ...input, width: '100%', boxSizing: 'border-box' }} placeholder="empty" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {lengths.map(k => (
              <button key={k} onClick={() => setValues(preset(k))} style={{ ...btn('#F3F4F6', C.ink), padding: '3px 10px', fontSize: 12 }}>
                {k === 0 ? 'empty' : `${k} node${k > 1 ? 's' : ''}`}
              </button>
            ))}
          </div>
        </div>
      )}
      {s.two_lists && (
        <div style={{ marginBottom: 10 }}>
          <span style={label}>l2 (sorted)</span>
          <input value={l2} onChange={e => setL2(e.target.value)} style={{ ...input, width: '100%', boxSizing: 'border-box' }} placeholder="empty" />
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        {s.value && (
          <label><span style={label}>Value to insert</span>
            <input type="number" min={1} max={s.max_value} value={value} onChange={e => setValue(e.target.value)} style={{ ...input, width: 80 }} /></label>
        )}
        {s.index && (
          <label><span style={label}>index ({s.index.min} to {s.index.max === 'len' ? 'length' : 'length − 1'})</span>
            <input type="number" min={s.index.min} value={index} onChange={e => setIndex(e.target.value)} style={{ ...input, width: 80 }} /></label>
        )}
        {s.cycle && (
          <label><span style={label}>Cycle</span>
            <select value={cycle} onChange={e => setCycle(e.target.value)} style={{ ...input, fontFamily: 'inherit' }}>
              <option value="none">no cycle</option>
              {Array.from({ length: n }, (_, i) => <option key={i} value={i}>last node → index {i}</option>)}
            </select></label>
        )}
      </div>
      <button disabled={busy} onClick={run} style={{ ...btn(C.quinn), opacity: busy ? 0.6 : 1 }}>▶ Run Quinn's code</button>
      {err && <p style={{ color: C.bad, fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
    </div>
  );
}

function Tests({ c }) {
  return (
    <div style={card}>
      <h3 style={h}>Your tests</h3>
      {c.tests.length === 0 && <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>No tests yet. Build a list and run Quinn's code on it.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {c.tests.map(t => (
          <div key={t.id} style={{ borderRadius: 10, padding: '8px 10px', background: t.result.passed ? C.okBg : C.badBg }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{t.result.passed ? '✓' : '✗'} {t.board_text}</div>
            <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>
              Should give: <b>{t.expected_text}</b> · Quinn's code: <b style={{ color: t.result.passed ? C.ok : C.bad }}>{t.result.passed ? 'same' : t.result_text}</b>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: '10px 0 0' }}>
        Teacher's hidden tests: {c.hidden.failing === 0 ? `all ${c.hidden.total} pass` : `${c.hidden.failing} of ${c.hidden.total} fail`}
      </p>
    </div>
  );
}

function Explain({ c, busy, onChoice, onText, onCoach }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const send = (fn) => { setErr(null); fn().catch(e => setErr(e.message)); };
  return (
    <div style={card}>
      <h3 style={h}>Explain to Quinn</h3>
      {!c.can_explain && <p style={{ fontSize: 13, color: C.muted, margin: '0 0 10px' }}>First run a test that breaks Quinn's code, so you can show what goes wrong.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {c.choices.map(ch => {
          const off = busy || !c.can_explain || ch.state !== 'open';
          return (
            <button key={ch.id} disabled={off} onClick={() => send(() => onChoice(ch.id))}
              style={{
                textAlign: 'left', padding: '9px 12px', borderRadius: 10, fontSize: 14, lineHeight: 1.45, cursor: off ? 'default' : 'pointer',
                border: `1.5px solid ${ch.state === 'taught' ? C.ok : C.line}`,
                background: ch.state === 'taught' ? C.okBg : ch.state === 'tried' ? '#F9FAFB' : 'white',
                color: ch.state === 'tried' ? C.faint : C.ink, textDecoration: ch.state === 'tried' ? 'line-through' : 'none',
                opacity: !c.can_explain && ch.state === 'open' ? 0.55 : 1,
              }}>
              {ch.state === 'taught' ? '✓ ' : ''}{ch.text}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>…or in your own words</span>
        <textarea value={text} onChange={e => setText(e.target.value)} maxLength={500} rows={2}
          placeholder="What is Quinn's code doing wrong, and why?"
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${C.line}`, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button disabled={busy || !c.can_explain || !text.trim()} onClick={() => send(() => onText(text).then(() => setText('')))}
            style={{ ...btn(C.you), opacity: busy || !c.can_explain || !text.trim() ? 0.5 : 1 }}>Explain</button>
          <span style={{ flex: 1 }} />
          <button disabled={busy} onClick={() => send(onCoach)} style={btn(C.coachBg, C.coach)}>💡 Coach</button>
        </div>
      </div>
      {err && <p style={{ color: C.bad, fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
    </div>
  );
}

function Welcome({ learned, onStart, busy, error }) {
  return (
    <div style={{ ...card, maxWidth: 620, margin: '40px auto', textAlign: 'center', padding: '28px 28px' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.quinnBg, color: C.quinn, fontSize: 30, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>Q</div>
      <h2 style={{ margin: '0 0 8px', color: C.ink }}>Quinn needs a hand</h2>
      <p style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 8px' }}>
        Quinn, a classmate, wrote some linked-list code that fails the teacher's tests. Test it on lists you build,
        find out what goes wrong, and explain it so Quinn really understands.
      </p>
      <p style={{ color: C.muted, fontSize: 13, margin: '0 0 18px' }}>
        {learned ? 'Quinn brings an operation you have already learned, picked at random.'
                 : 'Quinn brings an operation from Unit 1. Learn more operations and Quinn brings other kinds of problems.'}
      </p>
      <button disabled={busy} onClick={onStart} style={{ ...btn(C.quinn), padding: '10px 24px', fontSize: 15 }}>Meet Quinn →</button>
      {error && <p style={{ color: C.bad, fontSize: 13, marginTop: 10 }}>{error}</p>}
    </div>
  );
}

export default function TeachSession({ onBack }) {
  const [c, setC] = useState(null);
  const [learned, setLearned] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    npcApi.current()
      .then(r => { setC(r.case); setLearned(r.learned); })
      .catch(() => setError("Couldn't reach the server — try again in a moment."))
      .finally(() => setLoading(false));
  }, []);

  // every action returns the whole case state; errors are re-thrown for the caller to show
  const act = async (fn, { think = false } = {}) => {
    setBusy(true); setThinking(think);
    try { setC(await fn()); }
    finally { setBusy(false); setThinking(false); }
  };
  const start = (fresh) => act(() => npcApi.start(fresh)).catch(e => setError(e.message));

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <TopBar onBack={onBack} onNewCase={c ? () => start(true) : null} busy={busy} />
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>Loading…</div>
      ) : !c ? (
        <Welcome learned={learned} onStart={() => start(false)} busy={busy} error={error} />
      ) : (
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 16px 60px' }}>
          {c.status === 'solved' && (
            <div style={{ ...card, background: C.okBg, borderColor: C.ok, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#065F46', flex: 1 }}>🎉 You taught Quinn! The code passes every test now.</span>
              <button disabled={busy} onClick={() => start(true)} style={btn(C.ok)}>Help Quinn with another →</button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Code c={c} />
              <Conversation messages={c.messages} thinking={thinking} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {c.status === 'open' && <TestBuilder key={c.id} c={c} busy={busy} onRun={(board) => act(() => npcApi.test(c.id, board))} />}
              <Tests c={c} />
              {c.status === 'open' && (
                <Explain c={c} busy={busy}
                  onChoice={(id) => act(() => npcApi.explain(c.id, { choice_id: id }), { think: true })}
                  onText={(text) => act(() => npcApi.explain(c.id, { text }), { think: true })}
                  onCoach={() => act(() => npcApi.coach(c.id))} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
