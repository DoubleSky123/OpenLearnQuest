import React, { useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import HelpModal from './HelpModal';

const XP_PER_LEVEL = 500;
const LEVEL_NAMES  = ['Novice','Explorer','Learner','Practitioner','Skilled','Advanced','Expert','Master'];

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ QUESTIONS
// ─────────────────────────────────────────────────────────────────────────────

const QUIZ_QUESTIONS = [
  {
    id: 'dq1',
    question: 'How many pointers does each node in a doubly linked list contain?',
    options: [
      'One — only next',
      'Two — next and prev',
      'Three — next, prev, and value',
      'Zero — nodes store data only',
    ],
    correct: 1,
    explanation: 'Each DLL node has a next pointer (to the following node) and a prev pointer (to the preceding node). The value field stores data but is not a pointer.',
  },
  {
    id: 'dq2',
    question: 'What is the value of the prev pointer of the HEAD node?',
    options: [
      'HEAD itself',
      'The tail node',
      'NULL',
      'The second node',
    ],
    correct: 2,
    explanation: 'The head node has no predecessor, so its prev pointer is always NULL. This marks the start of the list.',
  },
  {
    id: 'dq3',
    question: 'You just inserted a new head node. Which pointer of the OLD head must you update?',
    options: [
      'old_head.next',
      'old_head.prev',
      'old_head.value',
      'No update needed',
    ],
    correct: 1,
    explanation: 'After inserting a new head, the old head now has a predecessor. You must set old_head.prev = newNode so the backward link is correct.',
  },
  {
    id: 'dq4',
    question: 'What key advantage does a doubly linked list have over a singly linked list?',
    options: [
      'It uses less memory',
      'It is faster to search',
      'You can traverse it in both directions',
      'It can store more values per node',
    ],
    correct: 2,
    explanation: 'Because each node knows its predecessor, you can walk forward OR backward through a DLL. A singly linked list only lets you go forward.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SVG DIAGRAMS
// ─────────────────────────────────────────────────────────────────────────────

function DLLChainDiagram() {
  const nodes = [{ x: 10, val: '5' }, { x: 158, val: '12' }, { x: 306, val: '8' }];
  return (
    <svg viewBox="0 0 430 90" className="w-full mx-auto" aria-label="DLL chain">
      <defs>
        <marker id="dll-fwd" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#ec4899"/>
        </marker>
        <marker id="dll-bwd" markerWidth="7" markerHeight="7" refX="1" refY="3.5" orient="auto">
          <path d="M7,0 L7,7 L0,3.5 z" fill="#a855f7"/>
        </marker>
      </defs>
      {/* NULL left */}
      <text x="2" y="44" fill="#9CA3AF" fontSize="12" fontFamily="monospace">NULL</text>

      {nodes.map(({ x, val }, i) => (
        <g key={i} transform={`translate(${x}, 8)`}>
          {/* prev box */}
          <rect x="0"  y="0" width="34" height="34" rx="6" fill="#F5F3FF" stroke="#a855f7" strokeWidth="1.8"/>
          <text x="17" y="22" textAnchor="middle" fill="#7C3AED" fontSize="10" fontFamily="monospace">prev</text>
          {/* value box */}
          <rect x="34" y="0" width="40" height="34" rx="6" fill="#FDF2F8" stroke="#ec4899" strokeWidth="1.8"/>
          <text x="54" y="23" textAnchor="middle" fill="#9D174D" fontSize="18" fontFamily="monospace" fontWeight="700">{val}</text>
          {/* next box */}
          <rect x="74" y="0" width="34" height="34" rx="6" fill="#F5F3FF" stroke="#a855f7" strokeWidth="1.8"/>
          <text x="91" y="22" textAnchor="middle" fill="#7C3AED" fontSize="10" fontFamily="monospace">next</text>

          {/* forward arrow */}
          {i < 2 && <line x1="108" y1="12" x2="148" y2="12" stroke="#ec4899" strokeWidth="1.8" markerEnd="url(#dll-fwd)"/>}
          {/* backward arrow */}
          {i > 0 && <line x1="0" y1="22" x2="-40" y2="22" stroke="#a855f7" strokeWidth="1.8" markerEnd="url(#dll-bwd)"/>}

          {/* label */}
          <text x="54" y="52" textAnchor="middle" fill="#9CA3AF" fontSize="11" fontFamily="monospace">node {i}</text>

          {/* NULL right for last */}
          {i === 2 && <text x="110" y="22" fill="#9CA3AF" fontSize="12" fontFamily="monospace">NULL</text>}
        </g>
      ))}
    </svg>
  );
}

function DLLNodeAnatomyDiagram() {
  return (
    <svg viewBox="0 0 440 140" className="w-full mx-auto" aria-label="DLL node anatomy">
      <defs>
        <marker id="dna-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#9CA3AF"/>
        </marker>
      </defs>
      {/* prev box */}
      <rect x="30"  y="40" width="80" height="50" rx="10" fill="#F5F3FF" stroke="#a855f7" strokeWidth="2.2"/>
      <text x="70"  y="70" textAnchor="middle" fill="#7C3AED" fontSize="14" fontFamily="monospace">prev</text>
      {/* value box */}
      <rect x="110" y="40" width="80" height="50" rx="10" fill="#FDF2F8" stroke="#ec4899" strokeWidth="2.2"/>
      <text x="150" y="72" textAnchor="middle" fill="#9D174D" fontSize="28" fontFamily="monospace" fontWeight="800">42</text>
      {/* next box */}
      <rect x="190" y="40" width="80" height="50" rx="10" fill="#F5F3FF" stroke="#a855f7" strokeWidth="2.2"/>
      <text x="230" y="70" textAnchor="middle" fill="#7C3AED" fontSize="14" fontFamily="monospace">next</text>

      {/* Labels */}
      <text x="70"  y="30" textAnchor="middle" fill="#374151" fontSize="12" fontFamily="sans-serif" fontWeight="700" letterSpacing="1">BACKWARD</text>
      <text x="150" y="30" textAnchor="middle" fill="#374151" fontSize="12" fontFamily="sans-serif" fontWeight="700" letterSpacing="1">VALUE</text>
      <text x="230" y="30" textAnchor="middle" fill="#374151" fontSize="12" fontFamily="sans-serif" fontWeight="700" letterSpacing="1">FORWARD</text>

      {/* prev arrow left */}
      <line x1="30" y1="65" x2="4"  y2="65" stroke="#9CA3AF" strokeWidth="1.8" strokeDasharray="4 3" markerEnd="url(#dna-arr)"/>
      <text x="2"  y="82" fill="#9CA3AF" fontSize="11" fontFamily="monospace" transform="rotate(-90,2,82)">null</text>

      {/* next arrow right */}
      <line x1="270" y1="65" x2="300" y2="65" stroke="#9CA3AF" strokeWidth="1.8" strokeDasharray="4 3" markerEnd="url(#dna-arr)"/>
      <text x="304" y="70" fill="#9CA3AF" fontSize="11" fontFamily="monospace">null</text>

      {/* bottom annotations */}
      <text x="70"  y="112" textAnchor="middle" fill="#a855f7" fontSize="12" fontFamily="sans-serif">← previous node</text>
      <text x="150" y="112" textAnchor="middle" fill="#ec4899" fontSize="12" fontFamily="sans-serif">stores data</text>
      <text x="230" y="112" textAnchor="middle" fill="#a855f7" fontSize="12" fontFamily="sans-serif">next node →</text>
      <line x1="70"  y1="92" x2="70"  y2="100" stroke="#a855f7" strokeWidth="1.5"/>
      <line x1="150" y1="92" x2="150" y2="100" stroke="#ec4899" strokeWidth="1.5"/>
      <line x1="230" y1="92" x2="230" y2="100" stroke="#a855f7" strokeWidth="1.5"/>
    </svg>
  );
}

function DLLHeadTailDiagram() {
  return (
    <svg viewBox="0 0 500 120" className="w-full mx-auto" aria-label="DLL HEAD and TAIL">
      <defs>
        <marker id="ht-pk" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#ec4899"/>
        </marker>
        <marker id="ht-pu" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#a855f7"/>
        </marker>
        <marker id="ht-bk" markerWidth="7" markerHeight="7" refX="1" refY="3.5" orient="auto">
          <path d="M7,0 L7,7 L0,3.5 z" fill="#a855f7"/>
        </marker>
      </defs>

      {/* HEAD label */}
      <text x="28" y="18" textAnchor="middle" fill="#ec4899" fontSize="13" fontFamily="monospace" fontWeight="800">HEAD</text>
      <line x1="28" y1="22" x2="28" y2="46" stroke="#ec4899" strokeWidth="2" markerEnd="url(#ht-pk)"/>

      {/* TAIL label */}
      <text x="388" y="18" textAnchor="middle" fill="#a855f7" fontSize="13" fontFamily="monospace" fontWeight="800">TAIL</text>
      <line x1="388" y1="22" x2="388" y2="46" stroke="#a855f7" strokeWidth="2" markerEnd="url(#ht-pu)"/>

      {/* 3 nodes */}
      {[{x:0,val:'1'},{x:148,val:'2'},{x:296,val:'3'}].map(({x,val},i) => (
        <g key={i} transform={`translate(${x}, 48)`}>
          <rect x="0"  y="0" width="30" height="32" rx="5" fill="#F5F3FF" stroke="#a855f7" strokeWidth="1.8"/>
          <text x="15" y="21" textAnchor="middle" fill="#7C3AED" fontSize="10" fontFamily="monospace">prev</text>
          <rect x="30" y="0" width="42" height="32" rx="5" fill="#FDF2F8" stroke="#ec4899" strokeWidth="1.8"/>
          <text x="51" y="22" textAnchor="middle" fill="#9D174D" fontSize="16" fontFamily="monospace" fontWeight="700">{val}</text>
          <rect x="72" y="0" width="30" height="32" rx="5" fill="#F5F3FF" stroke="#a855f7" strokeWidth="1.8"/>
          <text x="87" y="21" textAnchor="middle" fill="#7C3AED" fontSize="10" fontFamily="monospace">next</text>

          {/* forward arrow */}
          {i < 2 && <line x1="102" y1="10" x2="146" y2="10" stroke="#ec4899" strokeWidth="1.8" markerEnd="url(#ht-pk)"/>}
          {/* backward arrow */}
          {i > 0 && <line x1="0" y1="22" x2="-44" y2="22" stroke="#a855f7" strokeWidth="1.8" markerEnd="url(#ht-bk)"/>}

          {/* NULL markers */}
          {i === 0 && <text x="-36" y="21" fill="#EF4444" fontSize="12" fontFamily="monospace" fontWeight="700">NULL</text>}
          {i === 2 && <text x="106" y="18" fill="#EF4444" fontSize="12" fontFamily="monospace" fontWeight="700">NULL</text>}
        </g>
      ))}

      {/* annotations */}
      <text x="28"  y="100" textAnchor="middle" fill="#9CA3AF" fontSize="11" fontFamily="sans-serif">prev = NULL</text>
      <text x="388" y="100" textAnchor="middle" fill="#9CA3AF" fontSize="11" fontFamily="sans-serif">next = NULL</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP BAR
// ─────────────────────────────────────────────────────────────────────────────

function TopBar({ onBack, xp, pageLabel }) {
  const level     = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelName = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)];
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex items-center">

        <div className="flex-1 flex items-center gap-2">
          <button onClick={onBack} className="border border-gray-300 rounded-lg px-4 py-1.5 text-gray-600 font-semibold text-lg hover:bg-gray-50 transition-colors">
            ← Back
          </button>
          <button onClick={() => setShowHelp(true)} className="w-8 h-8 rounded-full border border-gray-300 text-gray-500 font-bold text-base hover:bg-gray-50 transition-colors flex items-center justify-center" title="Game Guide">
            ?
          </button>
        </div>

        <div className="flex-1 flex justify-center">
          <span className="text-pink-600 text-2xl font-bold whitespace-nowrap">
            DLL Introduction · {pageLabel}
          </span>
        </div>

        <div className="flex-1 flex justify-end items-center gap-4">
          <span className="text-gray-700 text-lg font-semibold whitespace-nowrap">
            Level {level} · {levelName}
          </span>
          <div className="w-32 shrink-0">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>XP</span><span>{xpInLevel}/{XP_PER_LEVEL}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-pink-500 rounded-full transition-all duration-500" style={{ width: `${xpPct}%` }} />
            </div>
          </div>
        </div>

      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP DOTS
// ─────────────────────────────────────────────────────────────────────────────

function StepDots({ total, current, color = 'pink' }) {
  const active = color === 'pink' ? 'bg-pink-500' : 'bg-emerald-500';
  const done   = color === 'pink' ? 'bg-pink-300' : 'bg-emerald-300';
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`rounded-full transition-all duration-300 ${
          i === current ? `w-6 h-3 ${active}` : i < current ? `w-3 h-3 ${done}` : 'w-3 h-3 bg-gray-200'
        }`} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCEPT PAGES
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT_COLORS = {
  pink:   { card: 'bg-pink-50 border-pink-200',   icon: 'bg-pink-100 border-pink-300 text-pink-700',   term: 'text-pink-700'   },
  purple: { card: 'bg-purple-50 border-purple-200', icon: 'bg-purple-100 border-purple-300 text-purple-700', term: 'text-purple-700' },
  rose:   { card: 'bg-rose-50 border-rose-200',   icon: 'bg-rose-100 border-rose-300 text-rose-700',   term: 'text-rose-700'   },
  amber:  { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 border-amber-300 text-amber-700', term: 'text-amber-700'  },
};

const KEY_TERMS = [
  { term: 'prev',    def: "A pointer to the preceding node (NULL at head)"     },
  { term: 'next',    def: "A pointer to the following node (NULL at tail)"     },
  { term: 'HEAD',    def: 'Entry point — first node, prev is always NULL'      },
  { term: 'TAIL',    def: 'Last node — next is always NULL'                    },
  { term: '⇄',       def: 'Bidirectional — can walk forward AND backward'      },
  { term: 'free()',  def: 'Release memory of a removed node to prevent leaks'  },
];

const CONCEPT_PAGES = [
  {
    icon:   '⇄',
    accent: 'pink',
    title:  'What is a Doubly Linked List?',
    body:   "A doubly linked list is like a singly linked list — but every node can also look backward. Instead of following a one-way chain, you can navigate in both directions. This makes insertions and deletions faster when you already have a reference to a node.",
    diagram: <DLLChainDiagram />,
  },
  {
    icon:   '📦',
    accent: 'purple',
    title:  'The Node — Three Parts',
    body:   "Every DLL node has three fields: a value that stores the data, a next pointer that points to the following node, and a prev pointer that points to the preceding node. When you modify the list, you must keep ALL three consistent.",
    diagram: <DLLNodeAnatomyDiagram />,
  },
  {
    icon:   '🚩',
    accent: 'rose',
    title:  'HEAD, TAIL & NULL',
    body:   "HEAD points to the first node — its prev is NULL because it has no predecessor. TAIL is the last node — its next is NULL because it has no successor. Both ends are important in a DLL. A common bug is forgetting to update prev after changing the head.",
    diagram: <DLLHeadTailDiagram />,
  },
  {
    icon:   '📖',
    accent: 'amber',
    title:  'Key Terms',
    body:   null,
    diagram: null,
  },
];

function ConceptPageView({ page, pageIdx, totalConceptPages, onContinue, onBack }) {
  const c          = ACCENT_COLORS[page.accent];
  const isKeyTerms = page.icon === '📖';

  return (
    <div className="max-w-2xl mx-auto">
      <StepDots total={totalConceptPages} current={pageIdx} color="pink" />

      <div className={`bg-white rounded-3xl border-2 ${c.card} p-8 shadow-sm mb-8`}>
        <div className="flex items-center gap-4 mb-5">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl border-2 ${c.icon}`}>
            {page.icon}
          </div>
          <h2 className="text-3xl font-black text-gray-900 leading-tight">{page.title}</h2>
        </div>

        {page.body && (
          <p className="text-gray-600 text-xl leading-relaxed mb-6">{page.body}</p>
        )}

        {page.diagram && (
          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6">
            {page.diagram}
          </div>
        )}

        {isKeyTerms && (
          <div className="grid grid-cols-2 gap-3">
            {KEY_TERMS.map(({ term, def }) => (
              <div key={term} className="bg-gray-50 rounded-2xl border border-gray-100 px-5 py-4">
                <span className={`text-xl font-black font-mono ${c.term}`}>{term}</span>
                <p className="text-lg text-gray-500 mt-1 leading-snug">{def}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-4">
        {pageIdx > 0 && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-6 py-4 rounded-2xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all text-xl border border-gray-200"
          >
            <ChevronLeft size={22} /> Back
          </button>
        )}
        <button
          onClick={onContinue}
          className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white text-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:opacity-90 active:scale-95 transition-all shadow-md"
        >
          {pageIdx < totalConceptPages - 1 ? 'Continue' : "I'm ready — Take the Quiz"}
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ
// ─────────────────────────────────────────────────────────────────────────────

function QuizSection({ onComplete, onReviewConcepts }) {
  const [qIdx, setQIdx]         = useState(0);
  const [selected, setSelected] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);

  const q = QUIZ_QUESTIONS[qIdx];

  const handleSelect = (optIdx) => {
    if (isCorrect) return;
    setSelected(optIdx);
    setIsCorrect(optIdx === q.correct);
  };

  const handleNext = () => {
    if (qIdx < QUIZ_QUESTIONS.length - 1) {
      setQIdx(p => p + 1);
      setSelected(null);
      setIsCorrect(null);
    } else {
      onComplete();
    }
  };

  const optionStyle = (optIdx) => {
    if (selected === null) return 'bg-white border-gray-200 text-gray-700 hover:bg-pink-50 hover:border-pink-300 cursor-pointer';
    if (optIdx === q.correct) return 'bg-emerald-50 border-emerald-400 text-emerald-800';
    if (optIdx === selected && !isCorrect) return 'bg-red-50 border-red-400 text-red-800';
    return 'bg-white border-gray-200 text-gray-400 opacity-60 cursor-not-allowed';
  };

  return (
    <div className="max-w-2xl mx-auto">
      <StepDots total={QUIZ_QUESTIONS.length} current={qIdx} color="pink" />

      <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm mb-5">
        <div className="flex items-start gap-4 mb-6">
          <span className="w-10 h-10 rounded-full bg-pink-100 text-pink-700 border border-pink-200 text-lg font-black flex items-center justify-center shrink-0 mt-0.5">
            {qIdx + 1}
          </span>
          <h3 className="text-2xl font-bold text-gray-900 leading-snug">{q.question}</h3>
        </div>

        <div className="flex flex-col gap-3">
          {q.options.map((opt, optIdx) => (
            <button
              key={optIdx}
              onClick={() => handleSelect(optIdx)}
              disabled={isCorrect && optIdx !== q.correct}
              className={`w-full text-left px-5 py-4 rounded-2xl border-2 text-xl font-medium transition-all ${optionStyle(optIdx)}`}
            >
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-current mr-3 text-base font-bold shrink-0">
                {String.fromCharCode(65 + optIdx)}
              </span>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {selected !== null && (
        <div className={`rounded-2xl px-6 py-4 mb-5 border-2 text-xl ${
          isCorrect ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-red-50 border-red-300 text-red-800'
        }`}>
          <span className="font-black mr-2">{isCorrect ? '✅ Correct!' : '❌ Not quite.'}</span>
          {isCorrect ? q.explanation : 'Have another look at the options above.'}
        </div>
      )}

      {isCorrect && (
        <button
          onClick={handleNext}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white text-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:opacity-90 active:scale-95 transition-all shadow-md"
        >
          {qIdx < QUIZ_QUESTIONS.length - 1 ? 'Next Question' : 'Finish Quiz'}
          <ChevronRight size={22} />
        </button>
      )}

      <button
        onClick={onReviewConcepts}
        className="mt-4 w-full py-3 rounded-2xl text-gray-400 hover:text-gray-600 text-lg transition-colors"
      >
        ← Review the concepts
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function DLLIntroPage({ onBack, onComplete, xp = 0 }) {
  const [phase, setPhase]           = useState('concept');
  const [conceptPage, setConceptPage] = useState(0);

  const totalConceptPages = CONCEPT_PAGES.length;

  const pageLabel =
    phase === 'concept' ? `Concept ${conceptPage + 1} of ${totalConceptPages}` :
    phase === 'quiz'    ? 'Quick Check' : 'All Done!';

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar onBack={onBack} xp={xp} pageLabel={pageLabel} />

      <div className="px-4 py-10">

        {phase === 'concept' && (
          <ConceptPageView
            page={CONCEPT_PAGES[conceptPage]}
            pageIdx={conceptPage}
            totalConceptPages={totalConceptPages}
            onContinue={() => {
              if (conceptPage < totalConceptPages - 1) setConceptPage(p => p + 1);
              else setPhase('quiz');
            }}
            onBack={() => setConceptPage(p => p - 1)}
          />
        )}

        {phase === 'quiz' && (
          <>
            <div className="text-center mb-10 max-w-2xl mx-auto">
              <h2 className="text-4xl font-black text-gray-900 mb-2">Quick Check</h2>
              <p className="text-gray-500 text-xl">
                Answer all {QUIZ_QUESTIONS.length} questions correctly to unlock DLL Tutorial.
              </p>
            </div>
            <QuizSection
              onComplete={() => setPhase('done')}
              onReviewConcepts={() => { setPhase('concept'); setConceptPage(0); }}
            />
          </>
        )}

        {phase === 'done' && (
          <div className="flex flex-col items-center text-center pt-12 max-w-xl mx-auto">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center mb-6 shadow-lg">
              <span className="text-5xl">🎉</span>
            </div>
            <h2 className="text-4xl font-black text-gray-900 mb-3">You're ready for DLL!</h2>
            <p className="text-gray-500 text-xl mb-10">
              You understand prev pointers, bidirectional traversal, and why both ends matter.
              Time to write some code!
            </p>

            <div className="w-full bg-white rounded-3xl border border-gray-200 p-7 mb-10 text-left shadow-sm">
              <p className="text-pink-600 font-bold text-xl mb-4">What you'll do next:</p>
              <ul className="space-y-3">
                {[
                  '✏️  Fill in pseudocode blanks for DLL operations',
                  '👀  Watch bidirectional pointers update live',
                  '💡  Hints guide you through each blank',
                  '⇄  Master both next AND prev pointers',
                ].map(t => (
                  <li key={t} className="text-gray-600 text-xl">{t}</li>
                ))}
              </ul>
            </div>

            <button
              onClick={onComplete}
              className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-bold text-white text-2xl bg-gradient-to-r from-pink-500 to-rose-500 hover:opacity-90 active:scale-95 transition-all shadow-md"
            >
              Begin DLL Tutorial <ChevronRight size={26} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
