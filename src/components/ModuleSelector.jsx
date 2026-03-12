import React from 'react';
import { ChevronRight, Link, Link2 } from 'lucide-react';

/**
 * Module selection screen — choose between Singly and Doubly Linked List games
 */
export default function ModuleSelector({ onSelect }) {
  const modules = [
    {
      id: 'singly',
      title: 'Singly Linked List',
      subtitle: 'One direction · next pointer only',
      description:
        'Each node holds a value and a single next pointer. Practice insertion and removal at the head, tail, and arbitrary positions.',
      icon: '→',
      gradient: 'from-blue-600 to-indigo-600',
      border: 'border-blue-500',
      hover: 'hover:border-blue-400 hover:shadow-blue-500/30',
      badge: 'bg-blue-700 text-blue-100',
      badgeText: 'Available',
      topics: ['Insert / Remove at Head', 'Insert / Remove at Tail', 'Insert / Remove at Position', 'Combined Operations'],
    },
    {
      id: 'doubly',
      title: 'Doubly Linked List',
      subtitle: 'Bidirectional · prev & next pointers',
      description:
        'Each node carries both a next and a prev pointer, enabling traversal in both directions. Master the extra bookkeeping required for safe insertion and removal.',
      icon: '⇄',
      gradient: 'from-purple-600 to-pink-600',
      border: 'border-purple-500',
      hover: 'hover:border-purple-400 hover:shadow-purple-500/30',
      badge: 'bg-purple-700 text-purple-100',
      badgeText: 'Available',
      topics: ['Insert / Remove at Head', 'Insert / Remove at Tail', 'Insert / Remove at Position', 'Combined Operations'],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-extrabold text-white mb-3 tracking-tight">
          OpenLearnQuest
        </h1>
        <p className="text-slate-400 text-lg">
          Choose a module to start your linked list adventure
        </p>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        {modules.map((mod) => (
          <button
            key={mod.id}
            onClick={() => onSelect(mod.id)}
            className={`group text-left bg-slate-800 rounded-2xl border-2 ${mod.border} ${mod.hover} p-8 transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-white`}
          >
            {/* Icon + badge row */}
            <div className="flex items-start justify-between mb-5">
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${mod.gradient} flex items-center justify-center text-2xl font-bold text-white shadow-md`}>
                {mod.icon}
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${mod.badge}`}>
                {mod.badgeText}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-1">{mod.title}</h2>
            <p className="text-slate-400 text-sm mb-4">{mod.subtitle}</p>
            <p className="text-slate-300 text-sm leading-relaxed mb-6">{mod.description}</p>

            {/* Topic list */}
            <ul className="space-y-1.5 mb-6">
              {mod.topics.map((t) => (
                <li key={t} className="flex items-center gap-2 text-slate-400 text-sm">
                  <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-br ${mod.gradient} shrink-0`} />
                  {t}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className={`flex items-center gap-1 font-semibold text-sm bg-gradient-to-r ${mod.gradient} bg-clip-text text-transparent group-hover:gap-2 transition-all`}>
              Start Module <ChevronRight size={16} className="text-current opacity-80" />
            </div>
          </button>
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-12 text-slate-600 text-sm">
        Drag &amp; drop pseudocode blocks · Master pointer operations · Level up
      </p>
    </div>
  );
}
