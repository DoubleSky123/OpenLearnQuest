import React from 'react';
import { ChevronRight, BookOpen, Dumbbell, Gamepad2, ArrowUpDown } from 'lucide-react';

/**
 * ModeSelector — shown after the player picks a module (SLL/DLL).
 * Lets the player choose Tutorial, Training, or Regular mode.
 *
 * Props:
 *   moduleId  {string}   — 'singly' | 'doubly'
 *   onSelect  {function} — called with mode string: 'tutorial' | 'training' | 'regular'
 *   onBack    {function} — go back to module selection
 */
export default function ModeSelector({ moduleId, onSelect, onBack }) {
  const moduleName = moduleId === 'singly' ? 'Singly Linked List' : 'Doubly Linked List';

  const modes = [
    ...(moduleId === 'singly' ? [{
      id: 'sort',
      title: 'Sort Mode',
      subtitle: 'Drag nodes to sort.',
      description:
        'Sort a linked list by dragging adjacent nodes to swap them. Watch the Bubble Sort pseudocode highlight in real time as you go.',
      icon: ArrowUpDown,
      gradient: 'from-rose-500 to-orange-500',
      border: 'border-rose-500',
      hover: 'hover:border-rose-400 hover:shadow-rose-500/30',
      badge: 'bg-rose-800 text-rose-100',
      badgeText: 'Interactive',
      features: ['Drag nodes to swap', 'Live pseudocode highlight', 'Bubble sort logic', 'Timer & swap counter'],
      disabled: false,
    }] : []),
    {
      id: 'tutorial',
      title: 'Tutorial Mode',
      subtitle: 'New to this? Start here.',
      description:
        'A guided walkthrough of the two most fundamental operations. Step-by-step hints show you exactly what to do at every stage.',
      icon: BookOpen,
      gradient: 'from-emerald-500 to-teal-500',
      border: 'border-emerald-500',
      hover: 'hover:border-emerald-400 hover:shadow-emerald-500/30',
      badge: 'bg-emerald-700 text-emerald-100',
      badgeText: 'Guided',
      features: ['Step-by-step hints', 'Instant error feedback', '2 fixed exercises', 'Learn the controls'],
      disabled: false,
    },
    {
      id: 'training',
      title: 'Training Mode',
      subtitle: 'Practice with guidance.',
      description:
        'Work through all operations with lighter hints available on demand. Build confidence before going solo.',
      icon: Dumbbell,
      gradient: 'from-amber-500 to-orange-500',
      border: 'border-amber-500',
      hover: 'hover:border-amber-400 hover:shadow-amber-500/30',
      badge: 'bg-amber-700 text-amber-100',
      badgeText: 'Guided',
      features: ['Step-by-step hints', 'Instant error feedback', '4 fixed exercises', 'Tail & position ops'],
      disabled: false,
    },
    {
      id: 'regular',
      title: 'Regular Mode',
      subtitle: 'Test your knowledge.',
      description:
        'No hints, randomised values, distractors included. Put everything you have learned to the test.',
      icon: Gamepad2,
      gradient: 'from-blue-500 to-indigo-600',
      border: 'border-blue-500',
      hover: 'hover:border-blue-400 hover:shadow-blue-500/30',
      badge: 'bg-blue-700 text-blue-100',
      badgeText: 'Challenge',
      features: ['No hints', 'Distractor blocks', 'All 3 levels', 'Star rating & timer'],
      disabled: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="text-center mb-10">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white text-sm transition-colors mb-4 flex items-center gap-1 mx-auto"
        >
          ← Back to Modules
        </button>
        <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">
          {moduleName}
        </h1>
        <p className="text-slate-400 text-lg">Choose your mode</p>
      </div>

      {/* Mode cards */}
      <div className={`grid grid-cols-1 gap-6 w-full max-w-5xl ${moduleId === 'singly' ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              key={mode.id}
              onClick={() => !mode.disabled && onSelect(mode.id)}
              disabled={mode.disabled}
              className={`
                group text-left bg-slate-800 rounded-2xl border-2 p-7 transition-all duration-200 shadow-lg
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-white
                ${mode.disabled
                  ? 'border-slate-600 opacity-50 cursor-not-allowed'
                  : `${mode.border} ${mode.hover} hover:shadow-xl hover:-translate-y-1 cursor-pointer`
                }
              `}
            >
              {/* Icon + badge */}
              <div className="flex items-start justify-between mb-5">
                <div className={`w-13 h-13 w-12 h-12 rounded-xl bg-gradient-to-br ${mode.gradient} flex items-center justify-center shadow-md`}>
                  <Icon size={24} className="text-white" />
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${mode.badge}`}>
                  {mode.badgeText}
                </span>
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-white mb-0.5">{mode.title}</h2>
              <p className="text-slate-400 text-xs mb-3">{mode.subtitle}</p>
              <p className="text-slate-300 text-sm leading-relaxed mb-5">{mode.description}</p>

              {/* Feature list */}
              <ul className="space-y-1.5 mb-5">
                {mode.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-400 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-br ${mode.gradient} shrink-0`} />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {!mode.disabled && (
                <div className={`flex items-center gap-1 font-semibold text-sm bg-gradient-to-r ${mode.gradient} bg-clip-text text-transparent group-hover:gap-2 transition-all`}>
                  Start <ChevronRight size={15} className="text-current opacity-80" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
