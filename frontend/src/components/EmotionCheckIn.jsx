import React, { useState } from 'react';
import { EMOTIONS } from '../services/adaptiveEngine';

/**
 * EmotionCheckIn
 *
 * Fullscreen check-in screen shown at the start of every game session.
 * Phase 0: user manually selects their current emotional state.
 * Phase 1+: this screen may be bypassed / pre-filled by sensor / AI detection.
 *
 * Props:
 *   onConfirm(emotion) — called when the user confirms their selection
 *   onSkip()           — called when user skips (defaults to EMOTIONS.OK)
 */

const OPTIONS = [
  {
    emotion:  EMOTIONS.STRESSED,
    emoji:    '😓',
    label:    'Stressed',
    tagline:  "Feeling overwhelmed",
    desc:     'Slower pace, tutorial links, and extra encouragement from Algo.',
    bg:       'rgba(59,130,246,0.12)',
    border:   'rgba(59,130,246,0.35)',
    hoverBg:  'rgba(59,130,246,0.22)',
    selBg:    'rgba(59,130,246,0.28)',
    selBorder:'#3B82F6',
    tagBg:    'rgba(59,130,246,0.2)',
    tagColor: '#3B82F6',
    check:    '#3B82F6',
  },
  {
    emotion:  EMOTIONS.OK,
    emoji:    '😊',
    label:    'Doing OK',
    tagline:  "I'm in the zone",
    desc:     'Normal game flow — balanced challenge and support.',
    bg:       'rgba(124,58,237,0.1)',
    border:   'rgba(124,58,237,0.3)',
    hoverBg:  'rgba(124,58,237,0.2)',
    selBg:    'rgba(124,58,237,0.25)',
    selBorder:'#7C3AED',
    tagBg:    'rgba(124,58,237,0.18)',
    tagColor: '#7C3AED',
    check:    '#7C3AED',
  },
  {
    emotion:  EMOTIONS.BORED,
    emoji:    '😴',
    label:    'Bored',
    tagline:  "Give me more!",
    desc:     'Bonus Jeopardy challenges, tighter timers, and higher XP rewards.',
    bg:       'rgba(245,158,11,0.1)',
    border:   'rgba(245,158,11,0.3)',
    hoverBg:  'rgba(245,158,11,0.2)',
    selBg:    'rgba(245,158,11,0.25)',
    selBorder:'#F59E0B',
    tagBg:    'rgba(245,158,11,0.2)',
    tagColor: '#D97706',
    check:    '#F59E0B',
  },
];

export default function EmotionCheckIn({ onConfirm, onSkip }) {
  const [selected, setSelected] = useState(EMOTIONS.OK);
  const [hovered, setHovered]   = useState(null);

  const handleConfirm = () => onConfirm(selected);
  const handleSkip    = () => onSkip ? onSkip() : onConfirm(EMOTIONS.OK);

  return (
    <div style={{
      minHeight:        '100vh',
      background:       'linear-gradient(135deg, #1E1B4B 0%, #312E81 45%, #1E1B4B 100%)',
      display:          'flex',
      flexDirection:    'column',
      alignItems:       'center',
      justifyContent:   'center',
      padding:          '40px 24px',
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{
          width:           72,
          height:          72,
          borderRadius:    '50%',
          background:      'rgba(255,255,255,0.1)',
          border:          '2px solid rgba(255,255,255,0.2)',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          fontSize:        34,
          margin:          '0 auto 20px',
        }}>
          🎮
        </div>
        <h1 style={{
          color:       'white',
          fontSize:    36,
          fontWeight:  900,
          margin:      '0 0 10px',
          letterSpacing: -0.5,
        }}>
          How are you feeling?
        </h1>
        <p style={{
          color:      'rgba(255,255,255,0.55)',
          fontSize:   17,
          margin:     0,
          maxWidth:   400,
        }}>
          Your game adapts to help you learn better.
          <br />Pick your current state and we'll adjust the difficulty.
        </p>
      </div>

      {/* Emotion cards */}
      <div style={{
        display:    'flex',
        gap:        20,
        flexWrap:   'wrap',
        justifyContent: 'center',
        marginBottom: 40,
        width:      '100%',
        maxWidth:   860,
      }}>
        {OPTIONS.map(opt => {
          const isSel  = selected === opt.emotion;
          const isHov  = hovered  === opt.emotion;

          return (
            <button
              key={opt.emotion}
              onClick={() => setSelected(opt.emotion)}
              onMouseEnter={() => setHovered(opt.emotion)}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex:           '1 1 220px',
                maxWidth:       260,
                background:     isSel ? opt.selBg : isHov ? opt.hoverBg : opt.bg,
                border:         `2px solid ${isSel ? opt.selBorder : opt.border}`,
                borderRadius:   20,
                padding:        '28px 20px 24px',
                cursor:         'pointer',
                textAlign:      'center',
                transition:     'all 0.18s ease',
                transform:      isSel ? 'translateY(-4px)' : isHov ? 'translateY(-2px)' : 'none',
                boxShadow:      isSel
                  ? `0 12px 32px ${opt.border}, 0 0 0 1px ${opt.selBorder}`
                  : isHov
                  ? `0 6px 20px ${opt.border}`
                  : 'none',
                position:       'relative',
                outline:        'none',
              }}
            >
              {/* Selected checkmark */}
              {isSel && (
                <div style={{
                  position:        'absolute',
                  top:             12,
                  right:           14,
                  width:           24,
                  height:          24,
                  borderRadius:    '50%',
                  background:      opt.check,
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  fontSize:        13,
                  color:           'white',
                  fontWeight:      900,
                }}>
                  ✓
                </div>
              )}

              {/* Emoji */}
              <div style={{ fontSize: 52, marginBottom: 12, lineHeight: 1 }}>
                {opt.emoji}
              </div>

              {/* Label */}
              <div style={{
                color:       'white',
                fontSize:    20,
                fontWeight:  800,
                marginBottom: 6,
              }}>
                {opt.label}
              </div>

              {/* Tagline badge */}
              <div style={{
                display:         'inline-block',
                background:      opt.tagBg,
                color:           opt.tagColor,
                borderRadius:    20,
                padding:         '3px 12px',
                fontSize:        13,
                fontWeight:      600,
                marginBottom:    14,
              }}>
                {opt.tagline}
              </div>

              {/* Description */}
              <p style={{
                color:       'rgba(255,255,255,0.55)',
                fontSize:    13.5,
                lineHeight:  1.5,
                margin:      0,
              }}>
                {opt.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        style={{
          width:        '100%',
          maxWidth:     380,
          padding:      '16px 0',
          borderRadius: 16,
          background:   'linear-gradient(135deg, #7C3AED, #4F46E5)',
          color:        'white',
          fontSize:     18,
          fontWeight:   800,
          border:       'none',
          cursor:       'pointer',
          marginBottom: 14,
          boxShadow:    '0 8px 24px rgba(124,58,237,0.4)',
          transition:   'opacity 0.15s, transform 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1';   e.currentTarget.style.transform = ''; }}
      >
        Start Session →
      </button>

      {/* Skip */}
      <button
        onClick={handleSkip}
        style={{
          background:  'none',
          border:      'none',
          color:       'rgba(255,255,255,0.35)',
          fontSize:    14,
          cursor:      'pointer',
          transition:  'color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
      >
        Skip — use default settings
      </button>

    </div>
  );
}
