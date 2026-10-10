import { useState, useEffect, useMemo } from 'react';

const COLORS = ['#8b5cf6', '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#14b8a6'];

// Rotated so a five-question session doesn't repeat the same sentence five
// times — praise that's obviously canned stops reading as praise.
const PERFECT_LINES = [
  'Every pointer in the right place, first try. That is exactly what understanding looks like.',
  'A clean run with no mistakes. You are not guessing any more — you are reasoning through it.',
  'Flawless. The order of those pointer moves clearly clicked for you.',
  'Not one wrong move. This operation is yours now.',
  'Perfect run. That is the kind of solve you can build the harder operations on.',
];

const RECOVERY_LINES = [
  'You worked it out. Getting there after a wrong turn is how it actually sticks.',
  'It took a couple of tries, and you still got there. That is real problem solving.',
  'You found the mistake and fixed it yourself — that is the skill that matters most.',
  'Tricky one, and you pushed through it. Next time this one will feel easier.',
  'Solved. Mistakes on the way are not a detour, they are the lesson.',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Question-complete celebration.
 *
 * Professor feedback: solving a question should FEEL like something. This is
 * deliberately UI-only — no LLM call, no network, nothing to wait for, so the
 * reward lands the instant the last blank is filled.
 *
 * It stays on screen until the student dismisses it (× / Got it / Esc /
 * backdrop). That is a deliberate reversal of the original auto-fade: a
 * congratulation that vanishes before it is read is not a congratulation.
 *
 * A perfect run gets a denser burst and different wording — identical fanfare
 * whether they nailed it first try or fought through four mistakes would make
 * the praise mean nothing.
 */
export default function CelebrationBurst({ perfect = false, errorCount = 0 }) {
  const [open, setOpen] = useState(true);

  const particles = useMemo(() => {
    const count = perfect ? 60 : 36;
    return Array.from({ length: count }, (_, i) => {
      const angle    = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const distance = 180 + Math.random() * (perfect ? 320 : 220);
      return {
        tx:    Math.cos(angle) * distance,
        ty:    Math.sin(angle) * distance,
        rot:   (Math.random() - 0.5) * 720,
        color: COLORS[i % COLORS.length],
        size:  8 + Math.random() * 8,
        round: Math.random() > 0.5,
        delay: Math.random() * 0.2,
        dur:   1.3 + Math.random() * 0.7,
      };
    });
  }, [perfect]);

  const message = useMemo(
    () => pick(perfect ? PERFECT_LINES : RECOVERY_LINES),
    [perfect],
  );

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/30 px-6"
      style={{ animation: 'olq-fade-in 0.25s ease-out' }}
      onClick={() => setOpen(false)}
    >
      {/* Expanding ring behind the card */}
      <div
        className="olq-ring absolute w-56 h-56 rounded-full border-4 border-violet-300 pointer-events-none"
        style={{ animation: 'olq-ring 1.1s ease-out forwards' }}
      />

      {/* Confetti */}
      {particles.map((p, i) => (
        <span
          key={i}
          className="olq-particle absolute pointer-events-none"
          style={{
            width:           p.size,
            height:          p.size,
            backgroundColor: p.color,
            borderRadius:    p.round ? '9999px' : '2px',
            '--tx':          `${p.tx}px`,
            '--ty':          `${p.ty}px`,
            '--rot':         `${p.rot}deg`,
            animation:       `olq-burst ${p.dur}s cubic-bezier(0.2, 0.7, 0.3, 1) ${p.delay}s forwards`,
          }}
        />
      ))}

      {/* Card — persists until dismissed */}
      <div
        className="olq-badge relative bg-white rounded-[2rem] shadow-2xl border-2 border-violet-200 px-12 py-10 text-center max-w-lg w-full"
        style={{ animation: 'olq-pop-in 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.1) forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-5 text-gray-300 hover:text-gray-600 text-3xl leading-none transition-colors"
          aria-label="Close"
        >
          ×
        </button>

        <div className="text-7xl mb-3">{perfect ? '🎉' : '✅'}</div>

        <p className="text-4xl font-black text-gray-900 mb-1">
          {perfect ? 'Perfect!' : 'Solved it!'}
        </p>
        <p className="text-base font-semibold text-violet-500 mb-4">
          {perfect
            ? 'Question complete — no mistakes'
            : `Question complete — ${errorCount} ${errorCount === 1 ? 'try' : 'tries'} along the way`}
        </p>

        <p className="text-lg text-gray-600 leading-relaxed mb-7">{message}</p>

        <button
          onClick={() => setOpen(false)}
          className="w-full py-4 rounded-2xl font-bold text-white text-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
