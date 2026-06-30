import React, { useState } from 'react';
import HelpModal from './HelpModal';

const XP_PER_LEVEL = 500;
const LEVEL_NAMES = ['Novice', 'Explorer', 'Learner', 'Practitioner', 'Skilled', 'Advanced', 'Expert', 'Master'];

const MODES = [
  {
    id:       'stress-free',
    icon:     '🧘',
    title:    'Stress-Free',
    subtitle: 'Learn at your own pace',
    bullets:  ['No timer', 'No lives', 'AI adapts to how you feel'],
    color:    '#2563EB',
    bg:       'rgba(37,99,235,0.06)',
    border:   'rgba(37,99,235,0.25)',
    selBorder:'#2563EB',
    selBg:    'rgba(37,99,235,0.12)',
  },
  {
    id:       'competitive',
    icon:     '⚡',
    title:    'Competitive',
    subtitle: 'Push your limits',
    bullets:  ['Countdown timer', '5 lives', 'AI adapts to your emotion'],
    color:    '#7C3AED',
    bg:       'rgba(124,58,237,0.06)',
    border:   'rgba(124,58,237,0.25)',
    selBorder:'#7C3AED',
    selBg:    'rgba(124,58,237,0.12)',
  },
];

function TopBar({ onBack, moduleName, xp }) {
  const level     = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelName = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)];
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#1E1B4B', boxShadow: '0 3px 14px rgba(0,0,0,0.28)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '13px 36px', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            style={{ background: 'rgba(255,255,255,0.14)', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: 10, color: 'white', fontSize: 20, fontWeight: 600, padding: '6px 18px', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
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

export default function ModeSelector({ moduleId, onSelect, onBack, xp = 0, onMistakeBook, onLeaderboard, onDailyChallenge }) {
  const moduleName = moduleId === 'singly' ? 'Singly Linked List' : 'Doubly Linked List';
  const [selected, setSelected] = useState('stress-free');

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F0F4F8 0%, #E8EEF5 100%)' }}>
      <TopBar onBack={onBack} moduleName={moduleName} xp={xp} />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '60px 24px 40px' }}>

        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#1E1B4B', margin: '0 0 8px' }}>
            Choose your mode
          </h2>
          <p style={{ color: '#6B7280', fontSize: 16, margin: 0 }}>
            The AI adapts questions to your emotion and mastery in both modes.
          </p>
        </div>

        {/* Mode cards */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 48 }}>
          {MODES.map(m => {
            const isSel = selected === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                style={{
                  flex: 1, padding: '36px 28px', borderRadius: 24, cursor: 'pointer', textAlign: 'left',
                  background:  isSel ? m.selBg  : m.bg,
                  border:      `2px solid ${isSel ? m.selBorder : m.border}`,
                  boxShadow:   isSel ? `0 8px 28px ${m.border}` : 'none',
                  transform:   isSel ? 'translateY(-3px)' : 'none',
                  transition:  'all 0.18s ease',
                  outline:     'none',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ fontSize: 48, marginBottom: 16, lineHeight: 1 }}>{m.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: m.color, marginBottom: 6 }}>{m.title}</div>
                <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>{m.subtitle}</div>
                {m.bullets.map(b => (
                  <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: '#374151' }}>{b}</span>
                  </div>
                ))}
                {isSel && (
                  <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'white', fontWeight: 900 }}>✓</span>
                    <span style={{ fontSize: 13, color: m.color, fontWeight: 700 }}>Selected</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Start button */}
        <button
          onClick={() => onSelect(selected)}
          style={{
            width: '100%', padding: '18px 0', borderRadius: 16,
            background: selected === 'stress-free'
              ? 'linear-gradient(135deg, #2563EB, #1D4ED8)'
              : 'linear-gradient(135deg, #7C3AED, #5B21B6)',
            color: 'white', fontSize: 20, fontWeight: 800, border: 'none',
            cursor: 'pointer', marginBottom: 32,
            boxShadow: selected === 'stress-free'
              ? '0 8px 24px rgba(37,99,235,0.4)'
              : '0 8px 24px rgba(124,58,237,0.4)',
            transition: 'opacity 0.15s, transform 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1';   e.currentTarget.style.transform = ''; }}
        >
          Start {selected === 'stress-free' ? 'Learning' : 'Challenge'} →
        </button>

        {/* Secondary buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          {onDailyChallenge && (
            <SecBtn icon="🐛" label="Daily Debug" onClick={onDailyChallenge} color="#D97706" />
          )}
          {onLeaderboard && (
            <SecBtn icon="🏆" label="My Records" onClick={onLeaderboard} color="#D97706" />
          )}
          {onMistakeBook && (
            <SecBtn icon="📖" label="Mistake Book" onClick={onMistakeBook} color="#7C3AED" />
          )}
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
    >
      {icon} {label}
    </button>
  );
}
