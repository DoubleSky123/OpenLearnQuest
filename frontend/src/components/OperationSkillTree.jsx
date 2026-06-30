import { useState, useEffect } from 'react';
import { gameMasterApi } from '../services/api';
import HelpModal from './HelpModal';

const XP_PER_LEVEL = 500;
const LEVEL_NAMES = ['Novice', 'Explorer', 'Learner', 'Practitioner', 'Skilled', 'Advanced', 'Expert', 'Master'];

const LEVEL_OPS = {
  1: ['insertAtHead', 'insertAtTail', 'removeAtHead', 'removeAtTail'],
  2: ['insertIntoEmpty', 'deleteEntireList', 'insertAtPosition', 'removeAtPosition'],
  3: ['reverseList', 'mergeSortedLists', 'detectCycle', 'sortList'],
};

const LEVEL_LABELS = { 1: 'Level 1 · Basics', 2: 'Level 2 · Intermediate', 3: 'Level 3 · Advanced' };

const OP_ICONS = {
  insertAtHead:    '⬆',
  insertAtTail:    '⬇',
  removeAtHead:    '✂',
  removeAtTail:    '✂',
  insertIntoEmpty: '＋',
  deleteEntireList:'✕',
  insertAtPosition:'↕',
  removeAtPosition:'↕',
  reverseList:     '↩',
  mergeSortedLists:'⇄',
  detectCycle:     '⟳',
  sortList:        '≡',
};

function TopBar({ onBack, moduleName, xp }) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelName = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)];
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#1E1B4B', boxShadow: '0 3px 14px rgba(0,0,0,0.28)' }}>
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
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: 700 }}>Lv {level} · {levelName}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
            <div style={{ flex: 1, height: 7, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${xpPct}%`, background: 'rgba(255,255,255,0.85)', borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{xpInLevel}/{XP_PER_LEVEL}</span>
          </div>
        </div>
      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

function OpCard({ op, mastery, locked, mode, onSelect }) {
  const attempts  = mastery?.attempts ?? 0;
  const mastered  = mastery?.mastered ?? false;
  const inProgress = attempts > 0 && !mastered;

  let borderColor = '#E5E7EB';
  let badgeBg     = '#F3F4F6';
  let badgeColor  = '#9CA3AF';
  let badgeText   = 'Not started';

  if (mastered)     { borderColor = '#10B981'; badgeBg = '#D1FAE5'; badgeColor = '#065F46'; badgeText = 'Mastered ✓'; }
  else if (inProgress) { borderColor = '#F59E0B'; badgeBg = '#FEF3C7'; badgeColor = '#92400E'; badgeText = `${attempts} attempt${attempts !== 1 ? 's' : ''}`; }

  if (locked) { borderColor = '#E5E7EB'; }

  const modeColor = mode === 'competitive' ? '#7C3AED' : '#2563EB';

  return (
    <button
      onClick={() => !locked && onSelect(op.operation)}
      disabled={locked}
      style={{
        flex: '1 1 0', minWidth: 0, padding: '16px 12px', borderRadius: 16,
        background: locked ? '#F9FAFB' : 'white',
        border: `2px solid ${borderColor}`,
        cursor: locked ? 'not-allowed' : 'pointer',
        textAlign: 'center', transition: 'all 0.15s',
        opacity: locked ? 0.55 : 1,
        boxShadow: locked ? 'none' : mastered ? '0 4px 14px rgba(16,185,129,0.18)' : '0 2px 8px rgba(0,0,0,0.06)',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { if (!locked) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${modeColor}30`; e.currentTarget.style.borderColor = modeColor; }}}
      onMouseLeave={e => { if (!locked) { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = mastered ? '0 4px 14px rgba(16,185,129,0.18)' : '0 2px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = borderColor; }}}
    >
      {mastered && (
        <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 28px 28px 0', borderColor: `transparent #10B981 transparent transparent` }} />
      )}
      <div style={{ fontSize: 26, marginBottom: 8, color: locked ? '#9CA3AF' : modeColor }}>
        {locked ? '🔒' : OP_ICONS[op.operation]}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: locked ? '#9CA3AF' : '#1E1B4B', marginBottom: 8, lineHeight: 1.3 }}>
        {op.title}
      </div>
      <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: badgeBg, color: badgeColor }}>
        {locked ? 'Locked' : badgeText}
      </div>
    </button>
  );
}

export default function OperationSkillTree({ moduleId, xp = 0, onStart, onBack, onMistakeBook, onLeaderboard, onDailyChallenge }) {
  const moduleName = moduleId === 'singly' ? 'Singly Linked List' : 'Doubly Linked List';
  const [mode,       setMode]       = useState('stress-free');
  const [opMap,      setOpMap]      = useState({});    // operation → mastery info
  const [totalMastered, setTotalMastered] = useState(0);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    gameMasterApi.getMastery(moduleId)
      .then(data => {
        const m = {};
        data.operations?.forEach(o => { m[o.operation] = o; });
        setOpMap(m);
        setTotalMastered(data.total_mastered ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [moduleId]);

  const l1Mastered = LEVEL_OPS[1].some(op => opMap[op]?.mastered);
  const l2Mastered = LEVEL_OPS[2].some(op => opMap[op]?.mastered);
  const l2Locked   = !l1Mastered;
  const l3Locked   = !l2Mastered;

  const modeColor = mode === 'competitive' ? '#7C3AED' : '#2563EB';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F0F4F8 0%, #E8EEF5 100%)' }}>
      <TopBar onBack={onBack} moduleName={moduleName} xp={xp} />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 60px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: '#1E1B4B', margin: '0 0 6px' }}>
            Choose an Operation
          </h2>
          <p style={{ color: '#6B7280', fontSize: 15, margin: 0 }}>
            Each session focuses on one operation · {totalMastered}/12 mastered
          </p>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 36 }}>
          {[
            { id: 'stress-free', label: '🧘 Stress-Free', color: '#2563EB' },
            { id: 'competitive', label: '⚡ Competitive', color: '#7C3AED' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                padding: '8px 24px', borderRadius: 99, fontWeight: 700, fontSize: 14,
                border: `2px solid ${mode === m.id ? m.color : '#E5E7EB'}`,
                background: mode === m.id ? m.color : 'white',
                color: mode === m.id ? 'white' : '#6B7280',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >{m.label}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#6B7280' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {[1, 2, 3].map(level => {
              const locked = level === 2 ? l2Locked : level === 3 ? l3Locked : false;
              return (
                <div key={level}>
                  {/* Level header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ height: 1, flex: 1, background: '#E5E7EB' }} />
                    <span style={{
                      fontSize: 13, fontWeight: 700, padding: '4px 14px', borderRadius: 99,
                      background: locked ? '#F3F4F6' : modeColor + '18',
                      color: locked ? '#9CA3AF' : modeColor,
                      border: `1px solid ${locked ? '#E5E7EB' : modeColor + '40'}`,
                    }}>
                      {LEVEL_LABELS[level]}
                      {locked && <span style={{ marginLeft: 6 }}>🔒</span>}
                    </span>
                    <div style={{ height: 1, flex: 1, background: '#E5E7EB' }} />
                  </div>

                  {locked && level === 2 && (
                    <p style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF', marginBottom: 12 }}>
                      Master any Level 1 operation to unlock
                    </p>
                  )}
                  {locked && level === 3 && (
                    <p style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF', marginBottom: 12 }}>
                      Master any Level 2 operation to unlock
                    </p>
                  )}

                  {/* Operation cards */}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {LEVEL_OPS[level].map(opKey => (
                      <OpCard
                        key={opKey}
                        op={opMap[opKey] ?? { operation: opKey, title: opKey }}
                        mastery={opMap[opKey]}
                        locked={locked}
                        mode={mode}
                        onSelect={() => onStart(mode, opKey)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Secondary links */}
        <div style={{ display: 'flex', gap: 12, marginTop: 36 }}>
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
