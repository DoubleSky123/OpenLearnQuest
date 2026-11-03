import { useState, useEffect } from 'react';
import { gameMasterApi, npcApi } from '../services/api';
import HelpModal from './HelpModal';

/**
 * The learning path: five ideas in teaching order (backend services/curriculum.py),
 * each practised on one or more operations. Replaces the 12-card operation grid —
 * professor feedback: linked lists are a few ideas, not twelve skills.
 *
 * A unit card starts a session on whatever the curriculum says to practise next
 * in that unit (`next_op`); the session then stays inside the unit.
 */

const C = {
  ink: '#1E1B4B', muted: '#6B7280', faint: '#9CA3AF', line: '#E5E7EB',
  done: '#10B981', doneBg: '#D1FAE5', doneInk: '#065F46',
  now: '#2563EB', nowBg: '#DBEAFE',
  locked: '#F3F4F6',
};

function TopBar({ onBack, moduleName }) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100, background: C.ink, boxShadow: '0 3px 14px rgba(0,0,0,0.28)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '13px 36px', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            style={{ background: 'rgba(255,255,255,0.14)', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: 10, color: 'white', fontSize: 20, fontWeight: 600, padding: '6px 18px', cursor: 'pointer' }}
          >⌂ Home</button>
          <button
            onClick={() => setShowHelp(true)}
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', border: '1.5px solid rgba(255,255,255,0.22)', color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >?</button>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>{moduleName}</span>
        </div>
        <div style={{ flex: 1 }} />
      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

function OpChip({ op }) {
  const state = op.mastered ? 'done' : op.attempts > 0 ? 'now' : 'new';
  const style = {
    done: { background: C.doneBg, color: C.doneInk, border: `1px solid ${C.done}40` },
    now:  { background: C.nowBg, color: C.now, border: `1px solid ${C.now}40` },
    new:  { background: 'white', color: C.muted, border: `1px solid ${C.line}` },
  }[state];
  return (
    <span style={{ ...style, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
      {state === 'done' ? '✓' : state === 'now' ? '●' : '○'} {op.title}
    </span>
  );
}

// One idea-group of the unit: the primary climbs the full ladder; each variant
// (same idea, another form) follows with one transfer question.
function GroupRow({ group, opsById }) {
  const done = group.every(id => opsById[id]?.mastered);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 16, fontSize: 13, color: done ? C.done : C.faint }}>{done ? '✓' : '•'}</span>
      {group.map((id, i) => (
        <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>then</span>}
          <OpChip op={opsById[id] ?? { operation: id, title: id }} />
          {i > 0 && <span style={{ fontSize: 11, color: C.faint }}>1 transfer question</span>}
        </span>
      ))}
    </div>
  );
}

function UnitCard({ unit, prevTitle, current, mode, onStart }) {
  const [open, setOpen] = useState(false);
  const locked = !unit.unlocked;
  const accent = unit.mastered ? C.done : current ? (mode === 'competitive' ? '#7C3AED' : C.now) : C.faint;
  const label = unit.mastered ? 'Review' : unit.ops.some(o => o.attempts > 0) ? 'Continue' : 'Start';
  const opsById = Object.fromEntries(unit.ops.map(o => [o.operation, o]));
  const extra = unit.ops.filter(o => !unit.groups.flat().includes(o.operation));

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* path marker */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44, flexShrink: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 18,
          background: locked ? C.locked : unit.mastered ? C.done : 'white',
          color: locked ? C.faint : unit.mastered ? 'white' : accent,
          border: `2.5px solid ${locked ? C.line : accent}`,
        }}>{unit.mastered ? '✓' : locked ? '🔒' : unit.number}</div>
        <div style={{ flex: 1, width: 2, background: C.line, marginTop: 4 }} />
      </div>

      <div style={{
        flex: 1, background: locked ? '#F9FAFB' : 'white', borderRadius: 16, padding: '18px 20px', marginBottom: 18,
        border: `2px solid ${current ? accent : C.line}`, opacity: locked ? 0.6 : 1,
        boxShadow: current ? `0 6px 20px ${accent}22` : '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: locked ? C.faint : C.ink }}>
            Unit {unit.number} · {unit.title}
          </h3>
          <span style={{ fontSize: 12, fontWeight: 700, color: unit.mastered ? C.doneInk : C.muted, whiteSpace: 'nowrap' }}>
            {unit.ops_done}/{unit.ops_total} done
          </span>
        </div>
        <p style={{ margin: '8px 0 12px', fontSize: 14, lineHeight: 1.5, color: locked ? C.faint : '#374151' }}>
          {unit.big_idea}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {unit.groups.map(g => <GroupRow key={g.join('|')} group={g} opsById={opsById} />)}
          {extra.map(o => <GroupRow key={o.operation} group={[o.operation]} opsById={opsById} />)}
        </div>

        {!locked && (
          <button
            onClick={() => setOpen(v => !v)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.muted }}
          >{open ? '▾' : '▸'} Watch out for</button>
        )}
        {open && !locked && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: '#4B5563' }}>
            {unit.watch_for.map(w => <li key={w}>{w}</li>)}
          </ul>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          {locked ? (
            <span style={{ fontSize: 13, color: C.faint }}>Finish “{prevTitle}” to unlock</span>
          ) : (
            <button
              onClick={() => onStart(mode, unit.next_op)}
              style={{
                padding: '9px 22px', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer',
                border: 'none', color: 'white', background: unit.mastered ? C.done : accent === C.faint ? C.now : accent,
              }}
            >{label} →</button>
          )}
        </div>
      </div>
    </div>
  );
}

// The elective: always open, not part of the units, never needed for mastery.
function TeachCard({ onTeach }) {
  const teal = '#0D9488';
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ width: 44, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#CCFBF1', color: teal, border: `2.5px solid ${teal}`, fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Q</div>
      </div>
      <div style={{ flex: 1, background: 'white', borderRadius: 16, padding: '18px 20px', marginBottom: 18, border: `2px dashed ${teal}66` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.ink }}>Elective · Teach Quinn</h3>
          <span style={{ fontSize: 12, fontWeight: 700, color: teal }}>optional · any time</span>
        </div>
        <p style={{ margin: '8px 0 12px', fontSize: 14, lineHeight: 1.5, color: '#374151' }}>
          A classmate's code fails the teacher's tests. Build lists that break it, then explain the bug until Quinn gets it.
          Quinn brings one of the operations you've learned.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onTeach} style={{ padding: '9px 22px', borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer', border: 'none', color: 'white', background: teal }}>
            Help Quinn →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UnitPath({ moduleId, onStart, onBack, onMistakeBook, onLeaderboard, onDailyChallenge, onTeach }) {
  const moduleName = moduleId === 'singly' ? 'Singly Linked List' : 'Doubly Linked List';
  const [mode, setMode]       = useState('stress-free');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teachOn, setTeachOn] = useState(false);

  useEffect(() => {
    gameMasterApi.getMastery(moduleId)
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [moduleId]);

  useEffect(() => {
    if (!onTeach || moduleId !== 'singly') return;
    npcApi.status().then(r => setTeachOn(!!r.enabled)).catch(() => {});
  }, [onTeach, moduleId]);

  const units = summary?.units ?? [];
  const currentIdx = units.findIndex(u => u.unlocked && !u.mastered);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F0F4F8 0%, #E8EEF5 100%)' }}>
      <TopBar onBack={onBack} moduleName={moduleName} />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 20px 60px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: C.ink, margin: '0 0 6px' }}>
            Linked lists, one idea at a time
          </h2>
          <p style={{ color: C.muted, fontSize: 15, margin: 0 }}>
            Show each idea once, then move on · {summary?.units_mastered ?? 0}/{summary?.total_units ?? 5} units mastered
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 30 }}>
          {[
            { id: 'stress-free', label: '🧘 Stress-Free', color: C.now },
            { id: 'competitive', label: '⚡ Competitive', color: '#7C3AED' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                padding: '8px 24px', borderRadius: 99, fontWeight: 700, fontSize: 14,
                border: `2px solid ${mode === m.id ? m.color : C.line}`,
                background: mode === m.id ? m.color : 'white',
                color: mode === m.id ? 'white' : C.muted,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >{m.label}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>Loading…</div>
        ) : units.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>Couldn't load your progress — try again in a moment.</div>
        ) : (
          units.map((u, i) => (
            <UnitCard
              key={u.id}
              unit={u}
              prevTitle={i > 0 ? units[i - 1].title : ''}
              current={i === currentIdx}
              mode={mode}
              onStart={onStart}
            />
          ))
        )}

        {teachOn && !loading && <TeachCard onTeach={onTeach} />}

        <p style={{ fontSize: 12, color: C.faint, textAlign: 'center', margin: '4px 0 0' }}>
          An operation counts once you can put the whole procedure in order with no mistakes.
        </p>

        <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
          {onDailyChallenge && <SecBtn icon="🐛" label="Daily Debug" onClick={onDailyChallenge} color="#D97706" />}
          {onLeaderboard    && <SecBtn icon="🏆" label="My Records"  onClick={onLeaderboard}    color="#D97706" />}
          {onMistakeBook    && <SecBtn icon="📖" label="Mistake Book" onClick={onMistakeBook}    color="#7C3AED" />}
        </div>
      </div>
    </div>
  );
}

function SecBtn({ icon, label, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '12px 0', borderRadius: 14, fontSize: 14, fontWeight: 700,
        background: 'white', border: `1.5px solid ${color}30`,
        color, cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}10`; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
    >{icon} {label}</button>
  );
}
