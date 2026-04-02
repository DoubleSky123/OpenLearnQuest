import React from 'react';
import { ChevronRight } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────
const XP_PER_LEVEL = 500;
const LEVEL_NAMES = [
  'Novice', 'Explorer', 'Learner', 'Practitioner',
  'Skilled', 'Advanced', 'Expert', 'Master',
];

// ── Module data ────────────────────────────────────────────────────────────────
const MODULES = [
  {
    id:       'singly',
    title:    'Singly Linked List',
    subtitle: 'next pointer only',
    description:
      'Master fundamental linked-list operations: insert, remove, and traverse using a single next pointer.',
    icon:  '→',
    color: 'violet',
    features: [
      'Insert & remove at head',
      'Insert & remove at tail',
      'Insert & remove at position',
      'Advanced: reverse, merge, cycle',
    ],
  },
  {
    id:       'doubly',
    title:    'Doubly Linked List',
    subtitle: 'prev & next pointers',
    description:
      'Extend your skills to doubly linked lists, where each node holds both a previous and a next pointer.',
    icon:  '⇄',
    color: 'pink',
    features: [
      'Bidirectional traversal',
      'Insert & remove from either end',
      'Position-based operations',
      'Prev pointer management',
    ],
  },
];

const COLOR_MAP = {
  violet: {
    icon:  'bg-violet-100 text-violet-700',
    badge: 'bg-violet-50 text-violet-700 border border-violet-200',
    dot:   'bg-violet-400',
    cta:   'text-violet-600',
    ring:  'focus:ring-violet-300',
    hover: 'hover:border-violet-200 hover:shadow-violet-50',
  },
  pink: {
    icon:  'bg-pink-100 text-pink-700',
    badge: 'bg-pink-50 text-pink-700 border border-pink-200',
    dot:   'bg-pink-400',
    cta:   'text-pink-600',
    ring:  'focus:ring-pink-300',
    hover: 'hover:border-pink-200 hover:shadow-pink-50',
  },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function ModuleSelector({ onSelect, completedModules = [], xp = 0 }) {
  const level     = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelName = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)];
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL) * 100);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-7xl font-black text-gray-900 tracking-tight mb-3">
          OpenLearnQuest
        </h1>
        <p className="text-gray-500 text-2xl">
          Master data structures one quest at a time
        </p>
      </div>

      {/* XP bar */}
      <div className="flex items-center gap-6 bg-white rounded-2xl px-8 py-4 shadow-sm border border-gray-200 mb-10 w-auto min-w-[520px]">
        <div className="text-violet-700 text-xl font-bold shrink-0">
          Level {level} · {levelName}
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500"
              style={{ width: `${xpPct}%` }}
            />
          </div>
        </div>
        <span className="text-xl text-gray-400 shrink-0">{xpInLevel} / {XP_PER_LEVEL}</span>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl mb-8">
        {MODULES.map(mod => {
          const c      = COLOR_MAP[mod.color];
          const isDone = completedModules.includes(mod.id);
          return (
            <button
              key={mod.id}
              onClick={() => onSelect(mod.id)}
              className={`group text-left bg-white rounded-2xl border border-gray-200 ${c.hover} hover:shadow-md p-8 transition-all duration-200 focus:outline-none focus:ring-2 ${c.ring}`}
            >
              <div className="flex items-start justify-between mb-5">
                <div className={`w-20 h-20 rounded-2xl ${c.icon} flex items-center justify-center text-4xl font-bold`}>
                  {mod.icon}
                </div>
                {isDone && (
                  <span className={`text-xl font-medium px-4 py-2 rounded-full ${c.badge}`}>
                    ✓ Completed
                  </span>
                )}
              </div>

              <h2 className="text-3xl font-semibold text-gray-900 mb-1">{mod.title}</h2>
              <p className="text-gray-400 text-xl mb-4">{mod.subtitle}</p>
              <p className="text-gray-600 text-xl leading-relaxed mb-6">{mod.description}</p>

              <ul className="space-y-3 mb-6">
                {mod.features.map(f => (
                  <li key={f} className="flex items-center gap-3 text-gray-500 text-xl">
                    <span className={`w-3 h-3 rounded-full ${c.dot} shrink-0`} />
                    {f}
                  </li>
                ))}
              </ul>

              <div className={`flex items-center gap-2 font-semibold text-2xl ${c.cta} group-hover:gap-3 transition-all`}>
                Start <ChevronRight size={24} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <p className="mt-8 text-gray-400 text-xl">
        Assemble pseudocode blocks · Master pointer operations · Level up
      </p>
    </div>
  );
}
