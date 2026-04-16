import React, { useState, useMemo } from 'react';
import PetCanvas from './PetCanvas';

// ── Fixed star positions so they don't jump on re-render ──────────────────────
const STARS = [
  { left: 8,  top: 12, size: 1.5, op: 0.5 },
  { left: 23, top: 5,  size: 1,   op: 0.3 },
  { left: 45, top: 18, size: 2,   op: 0.4 },
  { left: 67, top: 8,  size: 1.5, op: 0.6 },
  { left: 82, top: 15, size: 1,   op: 0.3 },
  { left: 91, top: 40, size: 2,   op: 0.5 },
  { left: 5,  top: 55, size: 1.5, op: 0.4 },
  { left: 15, top: 80, size: 1,   op: 0.3 },
  { left: 30, top: 90, size: 2,   op: 0.5 },
  { left: 55, top: 85, size: 1.5, op: 0.4 },
  { left: 75, top: 78, size: 1,   op: 0.3 },
  { left: 88, top: 92, size: 2,   op: 0.6 },
  { left: 50, top: 3,  size: 1,   op: 0.4 },
  { left: 97, top: 60, size: 1.5, op: 0.3 },
  { left: 3,  top: 35, size: 1,   op: 0.5 },
];

// ── Gift Box SVG ──────────────────────────────────────────────────────────────
function GiftBoxSVG({ cracking }) {
  return (
    <svg width="180" height="216" viewBox="0 0 180 216" style={{ display: 'block' }}>
      {/* Shadow */}
      <ellipse cx="90" cy="210" rx="58" ry="9" fill="black" opacity="0.18" />

      {/* Box body */}
      <rect x="18" y="108" width="144" height="96" rx="8" fill="#EC4899"/>
      <rect x="18" y="108" width="144" height="96" rx="8" fill="none" stroke="#DB2777" strokeWidth="2"/>
      {/* Ribbon vertical on body */}
      <rect x="80" y="108" width="20" height="96" fill="#FCD34D"/>
      {/* Ribbon horizontal on body */}
      <rect x="18" y="148" width="144" height="20" fill="#FCD34D"/>
      {/* Sheen on body */}
      <rect x="26" y="116" width="14" height="62" rx="4" fill="white" opacity="0.15"/>

      {/* Lid — animates upward when opening */}
      <g style={cracking ? { animation: 'lid-lift 0.9s ease-out forwards' } : {}}>
        <rect x="12" y="82" width="156" height="34" rx="8" fill="#F472B6"/>
        <rect x="12" y="82" width="156" height="34" rx="8" fill="none" stroke="#DB2777" strokeWidth="2"/>
        {/* Ribbon on lid */}
        <rect x="80" y="82" width="20" height="34" fill="#FCD34D"/>

        {/* Bow — left loop */}
        <ellipse cx="66" cy="74" rx="26" ry="14" fill="#FDE68A" transform="rotate(-28 66 74)"/>
        <ellipse cx="66" cy="74" rx="26" ry="14" fill="none" stroke="#F59E0B" strokeWidth="1.2" transform="rotate(-28 66 74)"/>
        {/* Bow — right loop */}
        <ellipse cx="114" cy="74" rx="26" ry="14" fill="#FDE68A" transform="rotate(28 114 74)"/>
        <ellipse cx="114" cy="74" rx="26" ry="14" fill="none" stroke="#F59E0B" strokeWidth="1.2" transform="rotate(28 114 74)"/>
        {/* Bow center knot */}
        <circle cx="90" cy="79" r="11" fill="#F59E0B"/>
        <circle cx="90" cy="79" r="11" fill="none" stroke="#D97706" strokeWidth="1.5"/>
        <circle cx="86" cy="76" r="3"  fill="#FDE68A" opacity="0.6"/>
      </g>
    </svg>
  );
}

// ── Sparkle dots that burst outward on reveal ──────────────────────────────────
function Sparkles() {
  const sparks = [
    { angle: 0,   dist: 110, color: '#FCD34D', size: 10 },
    { angle: 45,  dist: 130, color: '#A78BFA', size: 8  },
    { angle: 90,  dist: 115, color: '#6EE7B7', size: 12 },
    { angle: 135, dist: 125, color: '#FCD34D', size: 8  },
    { angle: 180, dist: 110, color: '#A78BFA', size: 10 },
    { angle: 225, dist: 130, color: '#6EE7B7', size: 8  },
    { angle: 270, dist: 115, color: '#FCD34D', size: 12 },
    { angle: 315, dist: 120, color: '#A78BFA', size: 8  },
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {sparks.map((s, i) => {
        const rad = (s.angle * Math.PI) / 180;
        const x = Math.cos(rad) * s.dist;
        const y = Math.sin(rad) * s.dist;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: s.size, height: s.size,
              borderRadius: '50%',
              background: s.color,
              '--tx': `${x}px`,
              '--ty': `${y}px`,
              transform: `translate(0px, 0px) scale(0)`,
              animation: `sparkle-pop 0.7s cubic-bezier(0.34,1.56,0.64,1) ${i * 40}ms forwards`,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EggRevealModal({ onContinue }) {
  // phases: 'idle' | 'cracking' | 'revealed'
  const [phase, setPhase] = useState('idle');

  const handleTapEgg = () => {
    if (phase !== 'idle') return;
    setPhase('cracking');
    setTimeout(() => setPhase('revealed'), 1000);
  };

  const eggAnimation =
    phase === 'idle'     ? 'egg-float 2.4s ease-in-out infinite' :
    phase === 'cracking' ? 'egg-shake 0.9s ease-in-out forwards' :
    'none';

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 55%, #4c1d95 100%)' }}
    >
      <style>{`
        @keyframes egg-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-14px); }
        }
        @keyframes egg-shake {
          0%   { transform: translateY(0)    rotate(0deg);   }
          10%  { transform: translateY(-8px)  rotate(-6deg); }
          22%  { transform: translateY(-2px)  rotate(6deg);  }
          34%  { transform: translateY(-10px) rotate(-5deg); }
          46%  { transform: translateY(-3px)  rotate(5deg);  }
          58%  { transform: translateY(-8px)  rotate(-4deg); }
          70%  { transform: translateY(-2px)  rotate(4deg);  }
          82%  { transform: translateY(-6px)  rotate(-3deg); }
          92%  { transform: translateY(-2px)  rotate(2deg);  }
          100% { transform: translateY(0)    rotate(0deg);   }
        }
        @keyframes lid-lift {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          40%  { transform: translateY(-50px) rotate(-18deg); opacity: 1; }
          100% { transform: translateY(-110px) rotate(-25deg); opacity: 0; }
        }
        @keyframes pet-pop {
          0%   { transform: scale(0) translateY(24px); opacity: 0; }
          65%  { transform: scale(1.15) translateY(-8px); opacity: 1; }
          100% { transform: scale(1) translateY(0);     opacity: 1; }
        }
        @keyframes sparkle-pop {
          0%   { transform: translate(0, 0) scale(0); opacity: 0; }
          40%  { transform: translate(var(--tx), var(--ty)) scale(1.2); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0.8); opacity: 0; }
        }
        @keyframes title-in {
          0%   { transform: translateY(16px); opacity: 0; }
          100% { transform: translateY(0);    opacity: 1; }
        }
        @keyframes btn-in {
          0%   { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Background stars */}
      <div className="absolute inset-0 pointer-events-none">
        {STARS.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size * 2, height: s.size * 2, opacity: s.op }}
          />
        ))}
      </div>

      {/* ── IDLE / CRACKING ── */}
      {phase !== 'revealed' && (
        <>
          <div className="text-center mb-10 z-10">
            <p className="text-white text-3xl font-black mb-2">🎁 You earned a companion!</p>
            <p className="text-violet-300 text-xl">
              {phase === 'idle' ? 'Tap the gift to open it' : '✨ Opening…'}
            </p>
          </div>

          <div
            onClick={handleTapEgg}
            className="z-10 relative"
            style={{
              cursor: phase === 'idle' ? 'pointer' : 'default',
              animation: eggAnimation,
            }}
          >
            <GiftBoxSVG cracking={phase === 'cracking'} />
          </div>
        </>
      )}

      {/* ── REVEALED ── */}
      {phase === 'revealed' && (
        <div className="flex flex-col items-center z-10">

          {/* Title */}
          <p
            className="text-yellow-300 text-4xl font-black mb-1 text-center"
            style={{ animation: 'title-in 0.5s ease-out forwards' }}
          >
            ✨ Meet Algo! ✨
          </p>
          <p
            className="text-violet-300 text-xl mb-10 text-center"
            style={{ animation: 'title-in 0.5s ease-out 0.1s both' }}
          >
            Your companion throughout this journey
          </p>

          {/* Pet + sparkles */}
          <div className="relative" style={{ animation: 'pet-pop 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}>
            <Sparkles />
            <div
              className="rounded-3xl px-10 py-8"
              style={{ background: '#c8dfa8' }}
            >
              <PetCanvas stage="Newborn" mood="idle" size={160} />
            </div>
          </div>

          {/* Name badge */}
          <div
            className="mt-6 px-8 py-3 rounded-2xl text-center"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              animation: 'title-in 0.5s ease-out 0.4s both',
            }}
          >
            <p className="text-white text-2xl font-black">Algo</p>
            <p className="text-violet-300 text-base mt-0.5">Newborn · 0 / 500 XP</p>
          </div>

          {/* Continue button */}
          <button
            onClick={onContinue}
            className="mt-8 px-12 py-4 rounded-2xl font-bold text-white text-xl shadow-lg hover:opacity-90 active:scale-95 transition-all"
            style={{
              background: 'linear-gradient(135deg, #10b981, #0d9488)',
              animation: 'btn-in 0.5s ease-out 0.6s both',
            }}
          >
            Begin Tutorial Mode →
          </button>
        </div>
      )}
    </div>
  );
}
