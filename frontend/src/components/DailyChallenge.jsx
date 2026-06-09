import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { addMistake } from '../utils/storage';

// ── Debug question bank ────────────────────────────────────────────────────────
const DEBUG_QUESTIONS = [
  {
    title: 'Insert at Head',
    description: 'Find the bug in Insert at Head:',
    lines: [
      'create newNode with value',
      'newNode.next = newNode',
      'head = newNode',
    ],
    bugLine: 1,
    bugType: 'Self-Loop',
    explanation:
      'Line 2 sets newNode.next to itself, creating an infinite self-loop. ' +
      'The new node should point to the current head so the existing list is preserved.',
    fix: 'newNode.next = head',
  },
  {
    title: 'Remove at Head',
    description: 'Find the bug in Remove at Head:',
    lines: [
      'if (head == NULL): return',
      'temp = head',
      'head = head.next',
      'head = NULL',
    ],
    bugLine: 3,
    bugType: 'Wrong NULL Check',
    explanation:
      'Line 4 sets head to NULL unconditionally, erasing the rest of the list. ' +
      'The intent is to free the removed node — only temp should be freed/nulled, not head.',
    fix: 'free(temp)  // or temp = NULL',
  },
  {
    title: 'Insert at Tail',
    description: 'Find the bug in Insert at Tail:',
    lines: [
      'node = head',
      'while (node != NULL): node = node.next',
      'create newNode with value',
      'node.next = newNode',
      'newNode.next = NULL',
    ],
    bugLine: 1,
    bugType: 'Lost Reference',
    explanation:
      'Line 2 advances node until it equals NULL, so by the time the loop ends node is NULL. ' +
      'Dereferencing node.next on line 4 then causes a null pointer crash. ' +
      'The loop condition should stop one step early, at the last real node.',
    fix: 'while (node.next != NULL): node = node.next',
  },
  {
    title: 'Remove at Tail',
    description: 'Find the bug in Remove at Tail:',
    lines: [
      'if (head == NULL): return',
      'node = head',
      'while (node.next.next != NULL): node = node.next',
      'node.next = node.next',
      'free(node.next)',
    ],
    bugLine: 3,
    bugType: 'Lost Reference',
    explanation:
      'Line 4 assigns node.next to itself — it does nothing. ' +
      'The tail is never unlinked. The assignment should set node.next to NULL to detach the last node.',
    fix: 'node.next = NULL',
  },
  {
    title: 'Insert at Position',
    description: 'Find the bug in Insert at Position:',
    exampleList: [1, 2, 3, 4, 5],
    lines: [
      'node = head',
      'for i in range(pos): node = node.next',
      'create newNode with value',
      'newNode.next = node.next',
      'node.next = newNode',
    ],
    bugLine: 1,
    bugType: 'Off-by-One',
    explanation:
      'Line 2 iterates pos times, which moves node to the node AT position pos rather than the node BEFORE it. ' +
      'To insert before position pos, the loop should stop at pos - 1 so node points to the predecessor.',
    fix: 'for i in range(pos - 1): node = node.next',
  },
  {
    title: 'Insert at Position (Boundary)',
    description: 'Find the bug in Insert at Position with a NULL guard:',
    lines: [
      'node = head',
      'for i in range(pos - 1): node = node.next',
      'create newNode with value',
      'newNode.next = node',
      'node.next = newNode',
    ],
    bugLine: 3,
    bugType: 'Wrong Pointer Assignment',
    explanation:
      'Line 4 sets newNode.next to node (the predecessor) instead of node.next (the successor). ' +
      'This severs the link to the rest of the list and causes a cycle back to the predecessor. ' +
      'newNode should point forward to what node currently points to.',
    fix: 'newNode.next = node.next',
  },
  {
    title: 'Remove at Position',
    description: 'Find the bug in Remove at Position:',
    exampleList: [1, 2, 3, 4, 5],
    lines: [
      'node = head',
      'for i in range(pos - 1): node = node.next',
      'temp = node.next',
      'node.next = node.next',
      'free(temp)',
    ],
    bugLine: 3,
    bugType: 'Self-Assignment',
    explanation:
      'Line 4 sets node.next to itself — it is a no-op that leaves the target node still in the list. ' +
      'To skip over the node being removed, node.next should be set to node.next.next.',
    fix: 'node.next = node.next.next',
  },
];

// ── Day-of-week label ──────────────────────────────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Indexed linked-list visual ─────────────────────────────────────────────────
function IndexedMiniList({ values }) {
  return (
    <div className="inline-flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        {values.map((v, i) => (
          <React.Fragment key={i}>
            <span className="w-8 h-8 rounded-full border-2 border-gray-300 bg-gray-50
                             flex items-center justify-center text-sm font-semibold text-gray-700">
              {v}
            </span>
            {i < values.length - 1 && (
              <span className="w-5 text-center text-gray-400 text-sm">→</span>
            )}
          </React.Fragment>
        ))}
        <span className="text-gray-400 text-xs ml-1">→ NULL</span>
      </div>
      <div className="flex items-center gap-1">
        {values.map((_, i) => (
          <React.Fragment key={i}>
            <span className="w-8 flex items-center justify-center text-xs text-sky-500 font-bold font-mono">
              {i}
            </span>
            {i < values.length - 1 && <span className="w-5 invisible text-sm">→</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DailyChallenge({ onBack }) {
  const today        = new Date();
  const dayIndex     = today.getDay();
  const dayName      = DAY_NAMES[dayIndex];
  const question     = DEBUG_QUESTIONS[dayIndex % DEBUG_QUESTIONS.length];

  const [selected,   setSelected]   = useState(null);   // 0-indexed line clicked
  const [submitted,  setSubmitted]   = useState(false);
  const [isCorrect,  setIsCorrect]   = useState(false);

  function handleSubmit() {
    if (selected === null) return;
    const correct = selected === question.bugLine;
    setIsCorrect(correct);
    setSubmitted(true);
    if (!correct) {
      addMistake({
        source:        'daily',
        title:         question.title,
        yourAnswer:    `Line ${selected + 1}: ${question.lines[selected]}`,
        correctAnswer: `Line ${question.bugLine + 1}: ${question.lines[question.bugLine]}`,
        explanation:   question.explanation,
      });
    }
  }

  function handleReset() {
    setSelected(null);
    setSubmitted(false);
    setIsCorrect(false);
  }

  // ── Border colour per line ─────────────────────────────────────────────────
  function lineBorderColor(idx) {
    if (!submitted) {
      return selected === idx ? '#8B5CF6' : '#D1D5DB'; // violet when selected
    }
    if (idx === question.bugLine) return '#EF4444';     // red = actual bug
    if (idx === selected && selected !== question.bugLine) return '#6B7280'; // grey = wrong guess
    return '#D1D5DB';
  }

  function lineBgColor(idx) {
    if (!submitted) {
      return selected === idx ? 'rgba(139,92,246,0.07)' : 'transparent';
    }
    if (idx === question.bugLine) return 'rgba(239,68,68,0.07)';
    return 'transparent';
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-50 bg-indigo-950 shadow-lg">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center">

          {/* Left: back button */}
          <div className="flex-1">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-white font-semibold text-base
                         bg-white/10 hover:bg-white/20 border border-white/20
                         rounded-xl px-4 py-2 transition-colors"
            >
              <ChevronLeft size={18} />
              Back
            </button>
          </div>

          {/* Center: title */}
          <div className="flex-1 flex justify-center items-center gap-2">
            <span className="text-2xl">🐛</span>
            <span className="text-white text-xl font-bold tracking-tight whitespace-nowrap">
              Daily Debug Challenge
            </span>
          </div>

          {/* Right: day indicator — plain label, not interactive */}
          <div className="flex-1 flex justify-end items-center gap-2">
            <span className="text-white/40 text-sm">📅</span>
            <span className="text-white/60 text-sm font-medium">{dayName}</span>
          </div>

        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6">

        {/* Intro card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-500 mb-1">
            {question.title}
          </p>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">
            {question.description}
          </h2>
          {question.exampleList && (
            <div className="mt-3 mb-2">
              <IndexedMiniList values={question.exampleList} />
            </div>
          )}
          <p className="text-gray-500 text-sm">
            Click the line you think contains the bug, then hit <strong>Submit</strong>.
          </p>
        </div>

        {/* Code block */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Dark header */}
          <div className="bg-gray-800 px-5 py-3 flex items-center gap-2">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">
              pseudocode
            </span>
            <div className="flex gap-1.5 ml-auto">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-amber-400/60" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
            </div>
          </div>

          {/* Lines */}
          <div className="divide-y divide-gray-100">
            {question.lines.map((line, idx) => (
              <button
                key={idx}
                disabled={submitted}
                onClick={() => !submitted && setSelected(idx)}
                className="w-full text-left flex items-stretch group transition-all duration-150
                           disabled:cursor-default"
                style={{ background: lineBgColor(idx) }}
              >
                {/* Coloured left border strip */}
                <div
                  className="w-1 flex-shrink-0 transition-colors duration-150"
                  style={{ background: lineBorderColor(idx) }}
                />

                {/* Line number */}
                <div className="w-10 flex-shrink-0 flex items-center justify-center
                                text-gray-400 text-xs font-mono select-none">
                  {idx + 1}
                </div>

                {/* Code text */}
                <div
                  className="flex-1 py-3 pr-4 font-mono text-sm text-gray-800
                             group-hover:text-red-600 transition-colors duration-100"
                  style={submitted ? {} : { cursor: 'pointer' }}
                >
                  {line}
                </div>

                {/* Hint icon on hover (pre-submit only) */}
                {!submitted && (
                  <div className="flex items-center pr-3 opacity-0 group-hover:opacity-100
                                  transition-opacity duration-150 text-red-400 text-xs font-semibold">
                    flag?
                  </div>
                )}

                {/* Post-submit badge */}
                {submitted && idx === question.bugLine && (
                  <div className="flex items-center pr-4">
                    <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-lg">
                      BUG
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Submit / action button */}
        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={selected === null}
            className="w-full py-4 rounded-2xl font-bold text-white text-lg
                       bg-gradient-to-r from-violet-500 to-violet-700
                       hover:from-violet-600 hover:to-violet-800
                       disabled:opacity-40 disabled:cursor-not-allowed
                       shadow-md transition-all duration-150"
          >
            Submit Answer
          </button>
        ) : null}

        {/* Result card */}
        {submitted && (
          <div
            className={`rounded-2xl border shadow-sm p-6 flex flex-col gap-4
              ${isCorrect
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-red-50 border-red-200'}`}
          >
            {/* Result header */}
            <div className="flex items-center gap-3">
              <span className="text-3xl">{isCorrect ? '✅' : '❌'}</span>
              <div>
                <p className={`text-xl font-bold ${isCorrect ? 'text-emerald-700' : 'text-red-700'}`}>
                  {isCorrect ? 'Correct!' : 'Not quite.'}
                </p>
                {!isCorrect && (
                  <p className="text-sm text-red-600 mt-0.5">
                    The bug was on <strong>line {question.bugLine + 1}</strong>.
                  </p>
                )}
              </div>

              {/* Bug type pill */}
              <span className="ml-auto bg-amber-100 text-amber-700 border border-amber-300
                               text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-xl">
                {question.bugType}
              </span>
            </div>

            {/* Explanation */}
            <div className="bg-white/70 rounded-xl border border-gray-200 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">
                Explanation
              </p>
              <p className="text-gray-700 text-sm leading-relaxed">
                {question.explanation}
              </p>
            </div>

            {/* Fix */}
            <div className="bg-gray-900 rounded-xl px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
                Corrected line
              </p>
              <code className="font-mono text-emerald-400 text-sm">
                {question.fix}
              </code>
            </div>
          </div>
        )}

        {/* Bottom action row */}
        {submitted && (
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-4 rounded-2xl font-bold text-white text-base
                         bg-gradient-to-r from-slate-500 to-slate-700
                         hover:from-slate-600 hover:to-slate-800
                         shadow-md transition-all duration-150"
            >
              Try Again
            </button>
            <button
              onClick={onBack}
              className="flex-1 py-4 rounded-2xl font-bold text-white text-base
                         bg-gradient-to-r from-violet-500 to-violet-700
                         hover:from-violet-600 hover:to-violet-800
                         shadow-md transition-all duration-150"
            >
              Back to Menu
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
