import React, { useState } from 'react';
import { EMOTIONS } from '../services/adaptiveEngine';

const OPTIONS = [
  {
    emotion:   EMOTIONS.ENGAGED,
    emoji:     '😊',
    label:     'Engaged',
    tagline:   "I'm in the zone",
    desc:      'Normal game flow — balanced challenge and support.',
    border:    'rgba(124,58,237,0.3)',
    selBorder: '#7C3AED',
    bg:        'rgba(124,58,237,0.1)',
    hoverBg:   'rgba(124,58,237,0.2)',
    selBg:     'rgba(124,58,237,0.25)',
    tagBg:     'rgba(124,58,237,0.18)',
    tagColor:  '#A78BFA',
    check:     '#7C3AED',
  },
  {
    emotion:   EMOTIONS.CONFUSED,
    emoji:     '🤔',
    label:     'Confused',
    tagline:   "Not sure what to do",
    desc:      'Tutorial links surface automatically, slower pace, guided hints.',
    border:    'rgba(59,130,246,0.35)',
    selBorder: '#3B82F6',
    bg:        'rgba(59,130,246,0.12)',
    hoverBg:   'rgba(59,130,246,0.22)',
    selBg:     'rgba(59,130,246,0.28)',
    tagBg:     'rgba(59,130,246,0.2)',
    tagColor:  '#60A5FA',
    check:     '#3B82F6',
  },
  {
    emotion:   EMOTIONS.FRUSTRATED,
    emoji:     '😤',
    label:     'Frustrated',
    tagline:   "I keep making mistakes",
    desc:      'Extra encouragement, reduced penalty, patient guidance from Algo.',
    border:    'rgba(239,68,68,0.3)',
    selBorder: '#EF4444',
    bg:        'rgba(239,68,68,0.1)',
    hoverBg:   'rgba(239,68,68,0.2)',
    selBg:     'rgba(239,68,68,0.22)',
    tagBg:     'rgba(239,68,68,0.18)',
    tagColor:  '#FCA5A5',
    check:     '#EF4444',
  },
  {
    emotion:   EMOTIONS.BORED,
    emoji:     '😴',
    label:     'Bored',
    tagline:   "Give me more!",
    desc:      'Bonus Jeopardy challenges, tighter timers, and higher XP rewards.',
    border:    'rgba(245,158,11,0.3)',
    selBorder: '#F59E0B',
    bg:        'rgba(245,158,11,0.1)',
    hoverBg:   'rgba(245,158,11,0.2)',
    selBg:     'rgba(245,158,11,0.25)',
    tagBg:     'rgba(245,158,11,0.2)',
    tagColor:  '#FCD34D',
    check:     '#F59E0B',
  },
];

export default function EmotionCheckIn({ onConfirm, onSkip }) {
  const [selected, setSelected] = useState(EMOTIONS.ENGAGED);
  const [hovered, setHovered]   = useState(null);

  const handleConfirm = () => onConfirm(selected);
  const handleSkip    = () => onSkip ? onSkip() : onConfirm(EMOTIONS.ENGAGED);

  return (
    <div style={{
      minHeight:       '100vh',
      background:      'linear-gradient(135deg, #1E1B4B 0%, #312E81 45%, #1E1B4B 100%)',
      display:         'flex',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         '40px 24px',
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 34, margin: '0 auto 20px',
        }}>
          🎮
        </div>
        <h1 style={{ color: 'white', fontSize: 36, fontWeight: 900, margin: '0 0 10px', letterSpacing: -0.5 }}>
          How did that feel?
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, margin: 0, maxWidth: 420 }}>
          Reflect on how you felt during the session.
          <br />This helps us understand your learning experience.
        </p>
      </div>

      {/* Emotion cards — 4 in a row */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap',
        justifyContent: 'center', marginBottom: 40,
        width: '100%', maxWidth: 1020,
      }}>
        {OPTIONS.map(opt => {
          const isSel = selected === opt.emotion;
          const isHov = hovered  === opt.emotion;
          return (
            <button
              key={opt.emotion}
              onClick={() => setSelected(opt.emotion)}
              onMouseEnter={() => setHovered(opt.emotion)}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex:        '1 1 200px',
                maxWidth:    230,
                background:  isSel ? opt.selBg : isHov ? opt.hoverBg : opt.bg,
                border:      `2px solid ${isSel ? opt.selBorder : opt.border}`,
                borderRadius: 20,
                padding:     '24px 18px 20px',
                cursor:      'pointer',
                textAlign:   'center',
                transition:  'all 0.18s ease',
                transform:   isSel ? 'translateY(-4px)' : isHov ? 'translateY(-2px)' : 'none',
                boxShadow:   isSel
                  ? `0 12px 32px ${opt.border}, 0 0 0 1px ${opt.selBorder}`
                  : isHov ? `0 6px 20px ${opt.border}` : 'none',
                position:    'relative',
                outline:     'none',
              }}
            >
              {isSel && (
                <div style={{
                  position: 'absolute', top: 12, right: 14,
                  width: 24, height: 24, borderRadius: '50%',
                  background: opt.check, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, color: 'white', fontWeight: 900,
                }}>✓</div>
              )}
              <div style={{ fontSize: 46, marginBottom: 10, lineHeight: 1 }}>{opt.emoji}</div>
              <div style={{ color: 'white', fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{opt.label}</div>
              <div style={{
                display: 'inline-block', background: opt.tagBg, color: opt.tagColor,
                borderRadius: 20, padding: '3px 10px', fontSize: 12,
                fontWeight: 600, marginBottom: 12,
              }}>
                {opt.tagline}
              </div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
                {opt.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* Confirm */}
      <button
        onClick={handleConfirm}
        style={{
          width: '100%', maxWidth: 380, padding: '16px 0', borderRadius: 16,
          background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
          color: 'white', fontSize: 18, fontWeight: 800, border: 'none',
          cursor: 'pointer', marginBottom: 14,
          boxShadow: '0 8px 24px rgba(124,58,237,0.4)',
          transition: 'opacity 0.15s, transform 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1';   e.currentTarget.style.transform = ''; }}
      >
        Save →
      </button>

      {/* Skip */}
      <button
        onClick={handleSkip}
        style={{
          background: 'none', border: 'none',
          color: 'rgba(255,255,255,0.45)', fontSize: 15,
          cursor: 'pointer', padding: '4px 0',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; }}
      >
        Skip for now
      </button>

    </div>
  );
}
