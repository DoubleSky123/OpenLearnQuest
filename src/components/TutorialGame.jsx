import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lightbulb, ChevronRight } from 'lucide-react';
import { LinkedListVisualiser } from './GoalPattern';
import { getCurrentPattern } from '../utils/helpers';
import { addMistake } from '../utils/storage';
import TutorialCompleteModal from './TutorialCompleteModal';
import GameTopBar from './shared/GameTopBar';
import GamePetCard from './shared/GamePetCard';

// ─────────────────────────────────────────────────────────────────────────────
// TUTORIAL QUESTION DEFINITIONS  — fill-in-the-blank format
//
// Each line has:
//   template  — the pseudocode with '___' marking the blank
//   answer    — the correct word to fill in
//   options   — array of 3 choices (1 correct + 2 distractors)
//   hint      — shown while this blank is active
// ─────────────────────────────────────────────────────────────────────────────

const TUTORIAL_QUESTIONS = [
  {
    id: 'tut-insert-head',
    title: 'Insert at Head',
    description: 'Insert the value 0 at the beginning of the list [1 → 2 → 3].',
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: null },
    ],
    goalPattern: [0, 1, 2, 3],
    lines: [
      {
        template: 'create ___',
        answer:   'newNode',
        options:  ['newNode', 'temp', 'head'],
        hint:     'You need a brand-new node to hold the value 0 — create one and give it a name.',
      },
      {
        template: '___.next = head',
        answer:   'newNode',
        options:  ['newNode', 'head', 'temp'],
        hint:     'Before moving head, link the new node to the current head so the rest of the list is not lost.',
      },
      {
        template: 'head = ___',
        answer:   'newNode',
        options:  ['newNode', 'temp', 'head'],
        hint:     'Now point head at the new node — it becomes the new first node in the list.',
      },
    ],
  },
  {
    id: 'tut-remove-head',
    title: 'Remove at Head',
    description: 'Remove the first node from the list [1 → 2 → 3].',
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: null },
    ],
    goalPattern: [2, 3],
    lines: [
      {
        template: '___ = head',
        answer:   'temp',
        options:  ['temp', 'newNode', 'head'],
        hint:     'Save the current head in a temporary variable before moving anything — you will need it to free the memory.',
      },
      {
        template: 'head = head.___',
        answer:   'next',
        options:  ['next', 'value', 'prev'],
        hint:     'Advance head to the second node by following its next pointer.',
      },
      {
        template: 'free(___)',
        answer:   'temp',
        options:  ['temp', 'newNode', 'head'],
        hint:     'Release the old head node using the reference you saved earlier.',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const applyInsertAtHead = (nodes, value) => {
  const newId      = Math.max(...nodes.map(n => n.id), 0) + 1;
  const allIds     = new Set(nodes.map(n => n.id));
  const pointedIds = new Set(nodes.map(n => n.next).filter(Boolean));
  const headId     = [...allIds].find(id => !pointedIds.has(id)) ?? null;
  return [{ id: newId, value, next: headId }, ...nodes];
};

const applyRemoveAtHead = (nodes) => {
  const allIds     = new Set(nodes.map(n => n.id));
  const pointedIds = new Set(nodes.map(n => n.next).filter(Boolean));
  const headId     = [...allIds].find(id => !pointedIds.has(id)) ?? null;
  return nodes.filter(n => n.id !== headId);
};

// ─────────────────────────────────────────────────────────────────────────────
// QUEST NAV
// ─────────────────────────────────────────────────────────────────────────────

function QuestNav({ questions, currentIndex, completedSet }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="border-b border-gray-100 px-4 py-2.5">
        <p className="text-lg font-semibold text-gray-500 uppercase tracking-wide">Exercises</p>
      </div>
      <div className="p-2 flex flex-col gap-1">
        {questions.map((q, i) => {
          const isDone   = completedSet.has(i);
          const isActive = i === currentIndex;
          return (
            <div key={q.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
              isActive ? 'bg-emerald-50 border-emerald-200' :
              isDone   ? 'bg-emerald-50 border-emerald-100' :
                         'bg-transparent border-transparent'
            }`}>
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                isDone   ? 'bg-emerald-100 border border-emerald-300' :
                isActive ? 'bg-emerald-100 border border-emerald-300' :
                           'bg-gray-100 border border-gray-200'
              }`}>
                <div className={`w-2 h-2 rounded-sm ${
                  isDone ? 'bg-emerald-500' : isActive ? 'bg-emerald-500' : 'bg-gray-300'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-lg font-medium truncate ${
                  isActive ? 'text-emerald-800' : isDone ? 'text-emerald-700' : 'text-gray-400'
                }`}>{q.title}</p>
                <p className="text-lg text-gray-400 mt-0.5">
                  {isDone ? 'Completed' : isActive ? 'In progress' : 'Not started'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// (ErrorModal removed — errors shown inline below word options)

// ─────────────────────────────────────────────────────────────────────────────
// CODE LINE  — renders a template with a blank or filled word inline
// ─────────────────────────────────────────────────────────────────────────────

function CodeLine({ line, filledWord, isActive, isComplete }) {
  const parts = line.template.split('___');

  const containerClass = [
    'flex-1 flex items-center px-3 py-2 rounded-lg border font-mono text-xl transition-all',
    isComplete ? 'bg-emerald-50 border-emerald-200' :
    isActive   ? 'bg-violet-50 border-violet-300 ring-1 ring-violet-200' :
    filledWord  ? 'bg-emerald-50 border-emerald-200' :
                 'bg-gray-50 border-gray-200 opacity-50',
  ].join(' ');

  return (
    <div className={containerClass}>
      <span className={isComplete || filledWord ? 'text-gray-700' : isActive ? 'text-gray-700' : 'text-gray-400'}>
        {parts[0]}
      </span>

      {filledWord ? (
        <span className="mx-0.5 px-1.5 py-0 rounded bg-emerald-200 text-emerald-900 font-bold">
          {filledWord}
        </span>
      ) : (
        <span className={[
          'mx-0.5 px-2 py-0.5 rounded border-b-2 font-bold tracking-widest text-xs',
          isActive
            ? 'border-violet-400 text-violet-400 animate-pulse bg-violet-50'
            : 'border-gray-300 text-gray-300 bg-transparent',
        ].join(' ')}>
          {isActive ? '___' : '___'}
        </span>
      )}

      <span className={isComplete || filledWord ? 'text-gray-700' : isActive ? 'text-gray-700' : 'text-gray-400'}>
        {parts[1]}
      </span>

      {filledWord && (
        <span className="ml-auto text-emerald-500 text-xs">✓</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TUTORIAL GAME
// ─────────────────────────────────────────────────────────────────────────────

export default function TutorialGame({ onBack, onGoRegular, startAt = 0, xp = 0 }) {
  const [showComplete, setShowComplete] = useState(false);
  const [qIndex, setQIndex]             = useState(startAt);
  const [completedSet, setCompletedSet] = useState(new Set());

  const q = TUTORIAL_QUESTIONS[qIndex];

  // fill-in-the-blank state
  const [filledAnswers, setFilledAnswers] = useState(() => q.lines.map(() => null));
  const [nodes, setNodes]                 = useState(() => JSON.parse(JSON.stringify(q.initialNodes)));
  const [executed, setExecuted]           = useState(false);
  const [success, setSuccess]             = useState(false);
  const [inlineError, setInlineError]     = useState(null); // { wrongWord, hint }
  const [petMessage, setPetMessage]       = useState('');

  const timerRef     = useRef(null);
  const advancingRef = useRef(false);
  const petMsgTimer  = useRef(null);

  const PET_WRONG_MSGS = [
    'Almost! Check the hint on the left.',
    'Not that one — think again!',
    'Keep going, you\'re close!',
    'Read the hint carefully 💡',
  ];
  const PET_SUCCESS_MSGS = [
    'Nailed it! 🎉',
    'Perfect fill! 🌟',
    'Great work! Keep going!',
    'Yes! That\'s the one! 🔥',
  ];

  const showPetMsg = useCallback((msg) => {
    if (petMsgTimer.current) clearTimeout(petMsgTimer.current);
    setPetMessage(msg);
    petMsgTimer.current = setTimeout(() => setPetMessage(''), 3000);
  }, []);

  // active blank = first unfilled index
  const activeBlankIdx = filledAnswers.findIndex(a => a === null);
  // all blanks filled
  const allFilled = activeBlankIdx === -1;

  // ── Init ───────────────────────────────────────────────────────────────────
  const initQuestion = useCallback((index) => {
    const question = TUTORIAL_QUESTIONS[index];
    setNodes(JSON.parse(JSON.stringify(question.initialNodes)));
    setFilledAnswers(question.lines.map(() => null));
    setExecuted(false);
    setSuccess(false);
    setInlineError(null);
    setPetMessage('');
    advancingRef.current = false;
  }, []);

  useEffect(() => { initQuestion(qIndex); }, [qIndex, initQuestion]);

  // ── Completion effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!allFilled || executed || advancingRef.current) return;
    advancingRef.current = true;
    setExecuted(true);

    setTimeout(() => {
      const newNodes = q.id === 'tut-insert-head'
        ? applyInsertAtHead(nodes, 0)
        : applyRemoveAtHead(nodes);
      setNodes(newNodes);
      setSuccess(true);
      setCompletedSet(prev => new Set([...prev, qIndex]));
      showPetMsg(PET_SUCCESS_MSGS[Math.floor(Math.random() * PET_SUCCESS_MSGS.length)]);

      setTimeout(() => {
        if (qIndex < TUTORIAL_QUESTIONS.length - 1) {
          setQIndex(prev => prev + 1);
        } else {
          timerRef.current?.stop();
          setShowComplete(true);
        }
      }, 1800);
    }, 600);
  }, [allFilled]); // eslint-disable-line

  // ── Option click handler ───────────────────────────────────────────────────
  const handleOptionClick = (word) => {
    if (executed || activeBlankIdx < 0) return;
    const line = q.lines[activeBlankIdx];

    if (word === line.answer) {
      // Correct — fill and advance
      setFilledAnswers(prev => {
        const next = [...prev];
        next[activeBlankIdx] = word;
        return next;
      });
      setInlineError(null);
    } else {
      // Wrong — show inline error
      setInlineError({ wrongWord: word, hint: line.hint });
      showPetMsg(PET_WRONG_MSGS[Math.floor(Math.random() * PET_WRONG_MSGS.length)]);
      addMistake({
        source:        'tutorial',
        title:         `${q.title} — ${line.template}`,
        yourAnswer:    word,
        correctAnswer: line.answer,
        explanation:   line.hint,
      });
    }
  };

  const currentValues = getCurrentPattern(nodes);
  const activeHint    = activeBlankIdx >= 0 ? q.lines[activeBlankIdx].hint : null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <GameTopBar
        onBack={onBack} timerRef={timerRef} xp={xp}
        title="Tutorial · Guided" titleColor="text-emerald-600" barColor="bg-violet-500"
      />

      <div className="max-w-7xl mx-auto p-5">

        {/* Success banner */}
        {success && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-lg">🎉</span>
            <p className="text-emerald-700 font-semibold text-xl">
              {qIndex < TUTORIAL_QUESTIONS.length - 1
                ? 'Great job! Loading next exercise…'
                : 'Excellent! Tutorial complete!'}
            </p>
          </div>
        )}

        {/* 3-column layout */}
        <div className="grid grid-cols-[1fr_1fr_240px] gap-4 items-start">

          {/* ── Col 1: Nav + Quest info ── */}
          <div className="flex flex-col gap-4">

            <QuestNav
              questions={TUTORIAL_QUESTIONS}
              currentIndex={qIndex}
              completedSet={completedSet}
            />

            {/* Quest info card */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-xl font-semibold text-gray-900">{q.title}</h2>
                <span className="text-lg px-3 py-1 rounded-full font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
                  Guided
                </span>
              </div>
              <p className="text-gray-500 text-lg mb-3">{q.description}</p>

              {/* Current state */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5 mb-2">
                <p className="text-gray-400 text-lg font-medium mb-1.5">Current state</p>
                <LinkedListVisualiser
                  values={currentValues}
                  emptyLabel="Empty list"
                  highlight={success}
                  goalValues={success ? currentValues : []}
                />
              </div>

              {/* Goal state */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5 mb-2">
                <p className="text-gray-400 text-lg font-medium mb-1.5">Goal state</p>
                <LinkedListVisualiser
                  values={q.goalPattern}
                  nodeColor="bg-amber-50 border-amber-300 text-amber-800"
                />
              </div>

              {/* Hint for current blank */}
              {activeHint && !executed && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-start gap-2">
                  <Lightbulb size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-emerald-700 text-lg leading-relaxed">{activeHint}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Col 2: Code frame + word options ── */}
          <div className="flex flex-col gap-4">

            {/* Code frame */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Mac-style title bar */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-2 text-gray-400 text-lg font-mono">pseudocode — fill in the blanks</span>
              </div>

              <div className="p-4 flex flex-col gap-2">
                {q.lines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-gray-300 font-mono text-lg w-6 shrink-0 text-right">
                      {idx + 1}
                    </span>
                    <CodeLine
                      line={line}
                      filledWord={filledAnswers[idx]}
                      isActive={!executed && idx === activeBlankIdx}
                      isComplete={success}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Word options for current blank */}
            {!executed && activeBlankIdx >= 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-gray-400 text-lg font-semibold mb-3 uppercase tracking-wide">
                  Fill in blank {activeBlankIdx + 1} — choose the correct word:
                </p>
                <div className="flex flex-wrap gap-2">
                  {q.lines[activeBlankIdx].options.map(opt => (
                    <button
                      key={opt}
                      onClick={() => handleOptionClick(opt)}
                      className="px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-mono text-xl text-gray-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-800 active:scale-95 transition-all font-semibold"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Inline error */}
            {inlineError && !executed && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span>❌</span>
                  <p className="font-bold text-red-700 text-lg">Not quite!</p>
                </div>
                <div className="bg-white border border-red-100 rounded-lg p-2.5 mb-2">
                  <p className="text-gray-400 text-xs mb-1">You chose:</p>
                  <p className="font-mono text-red-600 font-semibold text-lg">"{inlineError.wrongWord}"</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                  <p className="text-gray-400 text-xs mb-1">Hint:</p>
                  <p className="text-emerald-800 text-lg">{inlineError.hint}</p>
                </div>
              </div>
            )}

            {/* All done message */}
            {executed && !success && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center">
                <p className="text-violet-700 text-xl font-medium">Executing operation…</p>
              </div>
            )}
          </div>

          {/* ── Col 3: Pet ── */}
          <GamePetCard mood={success ? 'happy' : inlineError ? 'sad' : 'idle'} xp={xp} theme="emerald" hideable message={petMessage} />

        </div>
      </div>

      {/* ── Modals ── */}
      <TutorialCompleteModal
        isOpen={showComplete}
        onRegular={onGoRegular}
        onReplay={() => { setShowComplete(false); setQIndex(0); setCompletedSet(new Set()); }}
        onBack={onBack}
      />
    </div>
  );
}
