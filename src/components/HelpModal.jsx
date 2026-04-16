import React from 'react';

// ── Section data ───────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    icon:    '⭐',
    color:   '#2563EB',
    bg:      '#EFF6FF',
    border:  '#93C5FD',
    title:   'XP & Level System',
    bullets: [
      'XP stands for Experience Points — you earn them by completing questions.',
      'Every completed question earns XP based on difficulty: Beginner 80 · Intermediate 120 · Advanced 160.',
      'Accumulate 500 XP to reach the next level and earn a new title (Novice → Explorer → … → Master).',
      'Your level and XP carry across all modes and modules.',
    ],
  },
  {
    icon:    '🐾',
    color:   '#DB2777',
    bg:      '#FDF2F8',
    border:  '#F9A8D4',
    title:   'Your Pet — Algo',
    bullets: [
      'Algo is your companion throughout the game.',
      'Every XP point you earn also feeds Algo\'s growth meter.',
      'Algo evolves through 5 stages as your total XP rises — keep practicing to unlock the final form!',
      'Algo reacts to your performance: happy on success, sad on errors.',
    ],
  },
  {
    icon:    '✏️',
    color:   '#059669',
    bg:      '#ECFDF5',
    border:  '#6EE7B7',
    title:   'Step 1 · Tutorial',
    bullets: [
      'Each exercise shows pseudocode with one blank per line.',
      'Click the correct word from the options below the code to fill in each blank.',
      'A hint is always visible to guide you toward the right answer.',
      'Wrong answers trigger a short explanation — read it, then try again.',
      'Complete all blanks to see the linked list update live.',
    ],
  },
  {
    icon:    '🏋️',
    color:   '#D97706',
    bg:      '#FFFBEB',
    border:  '#FCD34D',
    title:   'Step 2 · Training',
    bullets: [
      'All pseudocode blocks are shuffled in a Code Pool.',
      'Click (or drag) blocks into the Assembly Area in the correct order.',
      'Place them one by one — wrong order shows a hint for that step.',
      'Toggle "Show Hint" any time to reveal the step-by-step explanation.',
    ],
  },
  {
    icon:    '⚔️',
    color:   '#7C3AED',
    bg:      '#F5F3FF',
    border:  '#C4B5FD',
    title:   'Step 3 · Challenge',
    bullets: [
      'Assemble pseudocode blocks entirely on your own — no guided hints.',
      'You start with 5 lives ❤️. Each time you submit a wrong full assembly, you lose one life.',
      'A timer tracks how fast you solve each question.',
      'Three difficulty levels: Beginner → Intermediate → Advanced.',
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────
export default function HelpModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📖</span>
            <div>
              <h2 className="text-2xl font-black text-white leading-tight">Game Guide</h2>
              <p className="text-violet-200 text-base">How OpenLearnQuest works</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white text-lg font-bold flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto px-8 py-6 flex flex-col gap-5">
          {SECTIONS.map((sec, i) => (
            <div
              key={i}
              style={{ background: sec.bg, border: `1.5px solid ${sec.border}` }}
              className="rounded-2xl p-5"
            >
              {/* Section title */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{sec.icon}</span>
                <h3 className="text-xl font-black" style={{ color: sec.color }}>
                  {sec.title}
                </h3>
              </div>
              {/* Bullets */}
              <ul className="flex flex-col gap-2">
                {sec.bullets.map((b, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-gray-700 text-base leading-snug">
                    <span
                      className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                      style={{ background: sec.color }}
                    />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Footer tip */}
          <p className="text-center text-gray-400 text-sm pb-2">
            Tap anywhere outside this guide to close
          </p>
        </div>
      </div>
    </div>
  );
}
