import { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import EggRevealModal from './EggRevealModal';

// Linked list demo values shown in the animated hero
const DEMO_NODES = [3, 7, 1, 9, 4];

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Socratic Tutor',
    desc: 'Stuck? The tutor guides with questions — it never just hands you the answer.',
    gradient: 'from-violet-500 to-indigo-500',
  },
  {
    icon: '🧠',
    title: 'Adaptive Questions',
    desc: 'Every question is chosen based on your real-time mastery across 5 concepts.',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: '📊',
    title: 'Concept Mastery',
    desc: 'Track your progress on pointers, traversal, memory, and more after every question.',
    gradient: 'from-emerald-500 to-teal-500',
  },
];

const MODES = [
  {
    icon: '🧘',
    name: 'Stress-Free',
    color: 'border-indigo-400/40',
    perks: ['No timer', 'No lives', 'Full AI support', 'Learn at your pace'],
  },
  {
    icon: '⚡',
    name: 'Competitive',
    color: 'border-violet-400/40',
    perks: ['Countdown timer', '5 lives', 'Leaderboard ranking', 'Test your speed'],
  },
];

export default function ModuleWelcomePage({ onBeginner, onExperienced, onBack }) {
  const [show,    setShow]    = useState(false);
  const [showEgg, setShowEgg] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Returns inline style for a staggered fade-up animation
  const fadeUp = (delaySec) => ({
    opacity:    show ? 1 : 0,
    transform:  show ? 'translateY(0)' : 'translateY(18px)',
    transition: `opacity 0.55s ease ${delaySec}s, transform 0.55s ease ${delaySec}s`,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 via-indigo-900 to-violet-900 text-white overflow-y-auto">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-sm"
        >
          <ChevronLeft size={16} /> Modules
        </button>
        <span className="text-white/30 text-xs uppercase tracking-widest">Singly Linked List</span>
        <div className="w-20" />
      </div>

      <div className="max-w-2xl mx-auto px-6 pb-20">

        {/* ── Hero: animated linked list ── */}
        <div className="text-center mb-10 pt-2">
          <div className="flex items-center justify-center mb-8">
            {DEMO_NODES.map((val, i) => (
              <div key={i} className="flex items-center">
                {/* Node circle */}
                <div
                  className="w-11 h-11 rounded-full bg-white/10 border-2 border-white/25 flex items-center justify-center font-bold text-base backdrop-blur-sm"
                  style={{
                    opacity:    show ? 1 : 0,
                    transform:  show ? 'scale(1)' : 'scale(0.4)',
                    transition: `opacity 0.4s ease ${i * 0.13}s, transform 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.13}s`,
                  }}
                >
                  {val}
                </div>
                {/* Arrow to next node */}
                {i < DEMO_NODES.length - 1 && (
                  <div
                    className="flex items-center mx-1 text-white/35 text-sm select-none"
                    style={{
                      opacity:    show ? 1 : 0,
                      transition: `opacity 0.3s ease ${i * 0.13 + 0.28}s`,
                    }}
                  >
                    →
                  </div>
                )}
              </div>
            ))}
            {/* NULL terminator */}
            <div
              className="flex items-center ml-1 text-white/30 font-mono text-xs"
              style={{
                opacity:    show ? 1 : 0,
                transition: `opacity 0.3s ease ${DEMO_NODES.length * 0.13 + 0.1}s`,
              }}
            >
              <span className="mr-1 text-white/25">→</span>NULL
            </div>
          </div>

          <h1 style={fadeUp(0.08)} className="text-4xl font-black mb-3 tracking-tight">
            Singly Linked List
          </h1>
          <p style={fadeUp(0.18)} className="text-white/55 text-base leading-relaxed">
            12 operations · 3 difficulty tiers · fully AI-adaptive.<br />
            Each session is unique to where you are right now.
          </p>
        </div>

        {/* ── Feature cards ── */}
        <div style={fadeUp(0.32)} className="grid grid-cols-3 gap-3 mb-8">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="bg-white/[0.07] rounded-2xl p-4 border border-white/10"
              style={{
                opacity:    show ? 1 : 0,
                transform:  show ? 'translateY(0)' : 'translateY(14px)',
                transition: `opacity 0.5s ease ${0.38 + i * 0.1}s, transform 0.5s ease ${0.38 + i * 0.1}s`,
              }}
            >
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center text-lg mb-3 shadow-lg`}>
                {f.icon}
              </div>
              <p className="font-semibold text-sm mb-1.5 leading-tight">{f.title}</p>
              <p className="text-white/45 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* ── Mode preview ── */}
        <div
          style={fadeUp(0.65)}
          className="mb-10"
        >
          <p className="text-white/35 text-xs uppercase tracking-widest text-center mb-3">
            Two ways to play
          </p>
          <div className="grid grid-cols-2 gap-3">
            {MODES.map((m) => (
              <div
                key={m.name}
                className={`bg-white/[0.07] rounded-2xl p-4 border ${m.color}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{m.icon}</span>
                  <span className="font-bold text-sm">{m.name}</span>
                </div>
                <ul className="space-y-1.5">
                  {m.perks.map((p) => (
                    <li key={p} className="text-white/45 text-xs flex items-center gap-1.5">
                      <span className="text-white/25 text-xs">·</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── The choice ── */}
        <div style={fadeUp(0.8)}>
          <p className="text-white/70 text-lg font-semibold text-center mb-5">
            How familiar are you with linked lists?
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={onBeginner}
              className="w-full py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl flex items-center justify-center gap-2"
            >
              🌱 I'm new — walk me through the basics
            </button>
            <button
              onClick={() => setShowEgg(true)}
              className="w-full py-4 rounded-2xl font-bold text-base bg-white/10 border border-white/20 hover:bg-white/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              ⚡ I already know this — let's start
            </button>
          </div>
          <p className="text-white/25 text-xs text-center mt-4">
            You can always review the concept slides later from the menu.
          </p>
        </div>

      </div>

      {/* Egg reveal for the "experienced" path */}
      {showEgg && (
        <EggRevealModal
          continueLabel="Start Learning →"
          onContinue={onExperienced}
        />
      )}
    </div>
  );
}
