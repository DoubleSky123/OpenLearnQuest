import React, { useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import HelpModal from './HelpModal';
import EggRevealModal from './EggRevealModal';
import { addMistake } from '../utils/storage';

const XP_PER_LEVEL = 500;
const LEVEL_NAMES  = ['Novice','Explorer','Learner','Practitioner','Skilled','Advanced','Expert','Master'];

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ QUESTIONS
// ─────────────────────────────────────────────────────────────────────────────

const QUIZ_QUESTIONS = [
  {
    id: 'q1',
    question: 'What two things does every node in a singly linked list contain?',
    options: [
      'A value and an index',
      'A value and a next pointer',
      'Two values',
      'A previous pointer and a next pointer',
    ],
    correct: 1,
    slideRef: 1,
    slideLabel: 'Slide 2 · The Node — Value & Pointer',
    explanation: 'Each node stores a value (the data it holds) and a next pointer (the address of the following node).',
  },
  {
    id: 'q2',
    question: 'What does the HEAD pointer always point to?',
    options: [
      'The last node in the list',
      'NULL',
      'The first node in the list',
      'The node with the largest value',
    ],
    correct: 2,
    slideRef: 2,
    slideLabel: 'Slide 3 · HEAD & NULL — Start and End',
    explanation: "HEAD is your entry point — it always points to the first node. Without HEAD you can't reach any node.",
  },
  {
    id: 'q3',
    question: "What value does the last node's next pointer hold?",
    options: ['HEAD', 'The previous node', 'The first node', 'NULL'],
    correct: 3,
    slideRef: 2,
    slideLabel: 'Slide 3 · HEAD & NULL — Start and End',
    explanation: 'NULL signals the end of the list. When next = NULL, there is no further node.',
  },
  {
    id: 'q4',
    question: 'You want to visit every node in the list one by one. Where do you start?',
    options: ['At the last node', 'At a random node', 'At HEAD', 'At NULL'],
    correct: 2,
    slideRef: 4,
    slideLabel: 'Slide 5 · Traversal',
    explanation: 'Traversal always begins at HEAD. Follow each next pointer until you hit NULL — that is the end.',
  },
  {
    id: 'q5',
    question: 'To insert a new node at a specific position in a linked list, you first find that position, then do the insertion. What are the time complexities of each step?',
    options: [
      'Find position: O(1) — jump directly by index\nInsert: O(1) — update pointers',
      'Find position: O(n) — traverse from HEAD\nInsert: O(n) — shift nodes to make room',
      'Both steps are O(1) — just redirect one pointer',
      'Find position: O(n) — traverse from HEAD\nInsert: O(1) — update 2 pointers',
    ],
    correct: 3,
    slideRef: 3,
    slideLabel: 'Slide 4 · When to Use a Linked List',
    explanation: "There's no index in a linked list, so finding the right spot means walking from HEAD — O(n). Once you're there, inserting is just 2 pointer updates — O(1). The bottleneck is always the traversal.",
  },
  {
    id: 'q6',
    question: 'During traversal, which line of code moves the pointer to the next node?',
    options: ['node = head', 'node = node.value', 'node = node.next', 'node = NULL'],
    correct: 2,
    slideRef: 4,
    slideLabel: 'Slide 5 · Traversal',
    explanation: 'node.next holds the address of the following node. Assigning it to node advances the pointer one step forward.',
  },
  {
    id: 'q7',
    question: 'A search function reaches NULL without finding the target value. What should it return?',
    options: ['0', 'HEAD', '-1', 'NULL'],
    correct: 3,
    slideRef: 5,
    slideLabel: 'Slide 6 · Search',
    explanation: 'Returning NULL signals that the target was not found. NULL means “no node” — it is the standard sentinel for a failed linked list search.',
  },
];

// Part splits
const QUIZ_1 = QUIZ_QUESTIONS.slice(0, 3); // slides 1-3: node anatomy, HEAD & NULL
const QUIZ_2 = QUIZ_QUESTIONS.slice(3);    // slides 4-6: when to use, traversal, search

// ─────────────────────────────────────────────────────────────────────────────
// SVG DIAGRAMS  (larger font sizes)
// ─────────────────────────────────────────────────────────────────────────────

function ChainDiagram() {
  // Each node is a big box (memory block) with two inner cells: value + next pointer
  // Arrows go node-box → node-box (pointers point to the whole node)
  const nodeW = 96, nodeH = 52, gap = 32;
  const nodes = [{ val: '7' }, { val: '14' }, { val: '3' }];
  const startX = 10;
  const nodeTopY = 16;
  const midY = nodeTopY + nodeH / 2;
  return (
    <svg viewBox="0 0 430 95" className="w-full mx-auto" aria-label="Linked list chain">
      <defs>
        <marker id="c-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#10b981"/>
        </marker>
        <marker id="c-arrgray" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#9CA3AF"/>
        </marker>
      </defs>
      {nodes.map(({ val }, i) => {
        const nx = startX + i * (nodeW + gap);
        return (
          <g key={i}>
            {/* Big outer box = one memory block / node */}
            <rect x={nx} y={nodeTopY} width={nodeW} height={nodeH} rx="8"
              fill="#F0FDF4" stroke="#10b981" strokeWidth="2"/>
            {/* value inner cell */}
            <rect x={nx + 4} y={nodeTopY + 4} width="50" height={nodeH - 8} rx="5"
              fill="#ECFDF5" stroke="#6EE7B7" strokeWidth="1.5"/>
            <text x={nx + 29} y={nodeTopY + 30} textAnchor="middle" fill="#065F46"
              fontSize="17" fontFamily="monospace" fontWeight="700">{val}</text>
            <text x={nx + 29} y={nodeTopY + 42} textAnchor="middle" fill="#9CA3AF"
              fontSize="8" fontFamily="sans-serif">value</text>
            {/* pointer inner cell */}
            <rect x={nx + 58} y={nodeTopY + 4} width="34" height={nodeH - 8} rx="5"
              fill="#D1FAE5" stroke="#6EE7B7" strokeWidth="1.5"/>
            <text x={nx + 75} y={nodeTopY + 28} textAnchor="middle" fill="#059669"
              fontSize="10" fontFamily="monospace">next</text>
            <text x={nx + 75} y={nodeTopY + 40} textAnchor="middle" fill="#9CA3AF"
              fontSize="8" fontFamily="sans-serif">ptr</text>

            {/* node label */}
            <text x={nx + nodeW / 2} y="80" textAnchor="middle" fill="#9CA3AF"
              fontSize="11" fontFamily="monospace">node {i}</text>

            {/* arrow: right edge of box → left edge of next box */}
            {i < 2 && (
              <line
                x1={nx + nodeW} y1={midY}
                x2={nx + nodeW + gap - 2} y2={midY}
                stroke="#10b981" strokeWidth="2" markerEnd="url(#c-arr)"/>
            )}
            {i === 2 && (
              <>
                <line x1={nx + nodeW} y1={midY} x2={nx + nodeW + 22} y2={midY}
                  stroke="#9CA3AF" strokeWidth="2" markerEnd="url(#c-arrgray)"/>
                <text x={nx + nodeW + 26} y={midY + 5} fill="#9CA3AF"
                  fontSize="11" fontFamily="monospace">NULL</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function NodeAnatomyDiagram() {
  // One big outer box = a node (one memory block). Two inner cells: value + next pointer.
  // Arrow from pointer cell points to where the next node would be.
  return (
    <svg viewBox="0 0 420 160" className="w-full mx-auto" aria-label="Node anatomy">
      <defs>
        <marker id="na-arrg" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#9CA3AF"/>
        </marker>
      </defs>

      {/* "One Node (1 memory block)" label */}
      <text x="210" y="16" textAnchor="middle" fill="#374151" fontSize="13"
        fontFamily="sans-serif" fontWeight="700">One Node  (1 memory block)</text>

      {/* Big outer box */}
      <rect x="60" y="26" width="200" height="72" rx="12"
        fill="#F0FDF4" stroke="#10b981" strokeWidth="2.5"/>

      {/* value inner cell */}
      <rect x="68" y="34" width="86" height="56" rx="8"
        fill="#ECFDF5" stroke="#6EE7B7" strokeWidth="2"/>
      <text x="111" y="66" textAnchor="middle" fill="#065F46"
        fontSize="28" fontFamily="monospace" fontWeight="800">42</text>
      <text x="111" y="79" textAnchor="middle" fill="#9CA3AF"
        fontSize="9" fontFamily="sans-serif">value field</text>

      {/* pointer inner cell */}
      <rect x="162" y="34" width="90" height="56" rx="8"
        fill="#D1FAE5" stroke="#6EE7B7" strokeWidth="2"/>
      <text x="207" y="62" textAnchor="middle" fill="#059669"
        fontSize="14" fontFamily="monospace" fontWeight="700">next</text>
      <text x="207" y="78" textAnchor="middle" fill="#9CA3AF"
        fontSize="9" fontFamily="sans-serif">pointer field</text>

      {/* Column labels */}
      <text x="111" y="112" textAnchor="middle" fill="#374151"
        fontSize="12" fontFamily="sans-serif" fontWeight="700">VALUE</text>
      <text x="111" y="126" textAnchor="middle" fill="#059669"
        fontSize="11" fontFamily="sans-serif">stores data</text>

      <text x="207" y="112" textAnchor="middle" fill="#374151"
        fontSize="12" fontFamily="sans-serif" fontWeight="700">POINTER</text>
      <text x="207" y="126" textAnchor="middle" fill="#059669"
        fontSize="11" fontFamily="sans-serif">links to next node</text>

      <line x1="111" y1="100" x2="111" y2="107" stroke="#6EE7B7" strokeWidth="1.5"/>
      <line x1="207" y1="100" x2="207" y2="107" stroke="#6EE7B7" strokeWidth="1.5"/>

      {/* Arrow from pointer cell → next node (ghost box) */}
      <line x1="260" y1="62" x2="300" y2="62"
        stroke="#9CA3AF" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#na-arrg)"/>

      {/* Ghost next node */}
      <rect x="302" y="36" width="100" height="56" rx="12"
        fill="#F9FAFB" stroke="#D1D5DB" strokeWidth="2" strokeDasharray="6 3"/>
      <text x="352" y="65" textAnchor="middle" fill="#9CA3AF"
        fontSize="12" fontFamily="sans-serif">next node</text>
    </svg>
  );
}

function HeadNullDiagram() {
  // Nodes as big outer boxes with value + next inner cells
  // HEAD arrow points to the outer box of node 0; last next pointer → NULL
  const nodeW = 108, nodeH = 50, gap = 40, startX = 14, topY = 50;
  const nodes = [{ val: '1' }, { val: '2' }, { val: '3' }];
  const midY = topY + nodeH / 2;
  return (
    <svg viewBox="0 0 480 120" className="w-full mx-auto" aria-label="HEAD and NULL">
      <defs>
        <marker id="hn-grn"  markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#10b981"/>
        </marker>
        <marker id="hn-vlt"  markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#7C3AED"/>
        </marker>
        <marker id="hn-gray" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#9CA3AF"/>
        </marker>
      </defs>

      {/* HEAD label + arrow → outer box of node 0 */}
      <text x={startX + nodeW / 2} y="18" textAnchor="middle"
        fill="#7C3AED" fontSize="13" fontFamily="monospace" fontWeight="800">HEAD</text>
      <line x1={startX + nodeW / 2} y1="22" x2={startX + nodeW / 2} y2={topY - 2}
        stroke="#7C3AED" strokeWidth="2" markerEnd="url(#hn-vlt)"/>

      {nodes.map(({ val }, i) => {
        const nx = startX + i * (nodeW + gap);
        return (
          <g key={i}>
            {/* Outer node box */}
            <rect x={nx} y={topY} width={nodeW} height={nodeH} rx="8"
              fill="#F0FDF4" stroke="#10b981" strokeWidth="2"/>
            {/* value inner cell */}
            <rect x={nx + 4} y={topY + 4} width="56" height={nodeH - 8} rx="6"
              fill="#ECFDF5" stroke="#6EE7B7" strokeWidth="1.5"/>
            <text x={nx + 32} y={topY + 30} textAnchor="middle"
              fill="#065F46" fontSize="17" fontFamily="monospace" fontWeight="700">{val}</text>
            {/* pointer inner cell */}
            <rect x={nx + 64} y={topY + 4} width="40" height={nodeH - 8} rx="6"
              fill="#D1FAE5" stroke="#6EE7B7" strokeWidth="1.5"/>
            <text x={nx + 84} y={topY + 29} textAnchor="middle"
              fill="#059669" fontSize="10" fontFamily="monospace">next</text>

            {/* Arrow: next cell → next node outer box */}
            {i < 2 && (
              <line x1={nx + nodeW} y1={midY}
                x2={nx + nodeW + gap - 2} y2={midY}
                stroke="#10b981" strokeWidth="2" markerEnd="url(#hn-grn)"/>
            )}
            {/* Last node: next → NULL */}
            {i === 2 && (
              <>
                <line x1={nx + nodeW} y1={midY} x2={nx + nodeW + 18} y2={midY}
                  stroke="#9CA3AF" strokeWidth="2" markerEnd="url(#hn-gray)"/>
                <text x={nx + nodeW + 22} y={midY + 5}
                  fill="#EF4444" fontSize="13" fontFamily="monospace" fontWeight="700">NULL</text>
              </>
            )}
          </g>
        );
      })}

      {/* Annotation: prev=NULL under node0, next=NULL under last arrow */}
      <text x={startX + nodeW / 2} y="112" textAnchor="middle"
        fill="#9CA3AF" fontSize="11" fontFamily="sans-serif">first node (HEAD)</text>
      <text x={startX + 2 * (nodeW + gap) + nodeW / 2} y="112" textAnchor="middle"
        fill="#9CA3AF" fontSize="11" fontFamily="sans-serif">last node (next = NULL)</text>
    </svg>
  );
}

// ── SLIDE 4 ────────────────────────────────────────────────────────────────────

function QueueInsertDiagram() {
  // BEFORE: HEAD → [Ana] → [Ben] → [Cal] → NULL
  // AFTER:  HEAD → [Ana] → [Ben] → [Dan] → [Cal] → NULL
  // 2 pointer updates: Ben→Dan and Dan→Cal
  const nw = 36, nh = 26, gap = 18, startX = 52;
  const nx = (i) => startX + i * (nw + gap);
  const r1 = 28, r2 = 92;
  const my = (ry) => ry + nh / 2;

  return (
    <svg viewBox="0 0 300 148" className="w-full mx-auto" aria-label="Student queue: Dan joins after Ben">
      <defs>
        {[['q-gray','#9CA3AF'],['q-sky','#0EA5E9'],['q-v','#7C3AED']].map(([id, col]) => (
          <marker key={id} id={id} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L7,3.5 z" fill={col}/>
          </marker>
        ))}
      </defs>

      {/* ── ROW 1: BEFORE ── */}
      <text x="4" y="14" fill="#9CA3AF" fontSize="9" fontFamily="sans-serif" fontWeight="700">BEFORE</text>
      <text x="4" y={my(r1) + 5} fill="#7C3AED" fontSize="9" fontFamily="monospace" fontWeight="700">HEAD</text>
      <line x1="38" y1={my(r1)} x2={nx(0) - 2} y2={my(r1)} stroke="#7C3AED" strokeWidth="1.8" markerEnd="url(#q-v)"/>

      {['Ana','Ben','Cal'].map((v, i) => {
        const x = nx(i);
        return (
          <g key={i}>
            <rect x={x} y={r1} width={nw} height={nh} rx="6" fill="#F9FAFB" stroke="#D1D5DB" strokeWidth="1.5"/>
            <text x={x + nw/2} y={r1 + 17} textAnchor="middle" fill="#6B7280" fontSize="10" fontFamily="monospace" fontWeight="700">{v}</text>
            {i < 2 && <line x1={x+nw} y1={my(r1)} x2={nx(i+1)-2} y2={my(r1)} stroke="#9CA3AF" strokeWidth="1.5" markerEnd="url(#q-gray)"/>}
            {i === 2 && <text x={x+nw+4} y={my(r1)+4} fill="#9CA3AF" fontSize="9" fontFamily="monospace">NULL</text>}
          </g>
        );
      })}

      {/* ── TRANSFORM LABEL ── */}
      <text x="148" y="72" textAnchor="middle" fill="#0369A1" fontSize="9" fontFamily="sans-serif" fontWeight="700">→ Dan joins after Ben (2 pointer updates)</text>

      {/* ── ROW 2: AFTER ── */}
      <text x="4" y={r2 - 6} fill="#9CA3AF" fontSize="9" fontFamily="sans-serif" fontWeight="700">AFTER</text>
      <text x="4" y={my(r2) + 5} fill="#7C3AED" fontSize="9" fontFamily="monospace" fontWeight="700">HEAD</text>
      <line x1="38" y1={my(r2)} x2={nx(0)-2} y2={my(r2)} stroke="#7C3AED" strokeWidth="1.8" markerEnd="url(#q-v)"/>

      {['Ana','Ben','Dan','Cal'].map((v, i) => {
        const x = nx(i);
        const isDan = v === 'Dan';
        const arrowUpdated = i === 1 || i === 2; // Ben→Dan and Dan→Cal are new
        return (
          <g key={i}>
            <rect x={x} y={r2} width={nw} height={nh} rx="6"
              fill={isDan ? '#E0F2FE' : '#F9FAFB'}
              stroke={isDan ? '#0EA5E9' : '#D1D5DB'} strokeWidth={isDan ? 2 : 1.5}/>
            <text x={x + nw/2} y={r2 + 17} textAnchor="middle"
              fill={isDan ? '#0369A1' : '#6B7280'} fontSize="10" fontFamily="monospace" fontWeight="700">{v}</text>
            {isDan && (
              <text x={x + nw/2} y={r2 - 4} textAnchor="middle" fill="#0EA5E9" fontSize="8" fontFamily="sans-serif" fontWeight="700">new ↓</text>
            )}
            {i < 3 && (
              <line x1={x+nw} y1={my(r2)} x2={nx(i+1)-2} y2={my(r2)}
                stroke={arrowUpdated ? '#0EA5E9' : '#9CA3AF'} strokeWidth={arrowUpdated ? 2 : 1.5}
                markerEnd={arrowUpdated ? 'url(#q-sky)' : 'url(#q-gray)'}/>
            )}
            {i === 3 && <text x={x+nw+4} y={my(r2)+5} fill="#9CA3AF" fontSize="9" fontFamily="monospace">NULL</text>}
          </g>
        );
      })}

      {/* Updated arrow labels */}
      <text x={nx(1)+nw+gap/2} y="136" textAnchor="middle" fill="#0EA5E9" fontSize="8" fontFamily="sans-serif">updated</text>
      <text x={nx(2)+nw+gap/2} y="136" textAnchor="middle" fill="#0EA5E9" fontSize="8" fontFamily="sans-serif">updated</text>
    </svg>
  );
}

function UseCaseDiagram() {
  return (
    <div className="space-y-3">
      {/* Context card */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex gap-3 items-start">
        <span className="text-xl shrink-0 mt-0.5">🧑‍🤝‍🧑</span>
        <div>
          <p className="text-sky-800 font-bold text-sm">Example: Student Queue</p>
          <p className="text-gray-600 text-sm mt-0.5 leading-snug">
            Dan wants to stand after Ben. Finding Ben takes <strong>O(n)</strong> steps for both structures.
            The difference is what happens next: a linked list updates 2 pointers,
            while an array must push every student behind Dan back one spot to make room.
          </p>
        </div>
      </div>

      <QueueInsertDiagram />

      {/* Verdict row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-emerald-700 font-bold text-sm mb-1">Linked List</p>
          <p className="text-gray-400 font-mono text-xs">find: O(n)</p>
          <p className="text-emerald-600 font-mono font-bold text-xl">insert: O(1)</p>
          <p className="text-gray-400 text-xs mt-0.5">just 2 pointer updates</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-red-600 font-bold text-sm mb-1">Array</p>
          <p className="text-gray-400 font-mono text-xs">find: O(n)</p>
          <p className="text-red-500 font-mono font-bold text-xl">insert: O(n)</p>
          <p className="text-gray-400 text-xs mt-0.5">push every element after back one</p>
        </div>
      </div>
    </div>
  );
}

function TraversalDiagram() {
  // 3 rows, one per step. Nodes shifted right to leave room for HEAD label on the left.
  const nodeW = 80, nodeH = 38, gap = 30;
  const startX = 56; // shifted right from 10 to fit HEAD arrow
  const nodeXs = [startX, startX + nodeW + gap, startX + 2 * (nodeW + gap)];
  const rowH = 80;
  const nodeY = (si) => si * rowH + 28;
  const steps = [
    { nodeIdx: 0, code: 'node = HEAD',      code2: null },
    { nodeIdx: 1, code: 'node = node.next', code2: null },
    { nodeIdx: 2, code: 'node.next ≠ NULL', code2: '→ keep going' },
  ];
  const vals = ['1', '2', '3'];

  return (
    <svg viewBox="0 0 490 265" className="w-full mx-auto" aria-label="Traversal step by step">
      <defs>
        <marker id="trv-g" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#10b981"/>
        </marker>
        <marker id="trv-v" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#7C3AED"/>
        </marker>
        <marker id="trv-gray" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#9CA3AF"/>
        </marker>
      </defs>

      {steps.map((step, si) => {
        const ny = nodeY(si);
        const midY = ny + nodeH / 2;
        return (
          <g key={si}>
            {/* HEAD label + arrow → node 0 (static every row) */}
            <text x="2" y={midY + 4} fill="#7C3AED" fontSize="8"
              fontFamily="monospace" fontWeight="700">HEAD</text>
            <line x1="28" y1={midY} x2={nodeXs[0] - 2} y2={midY}
              stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#trv-v)"/>

            {vals.map((v, ni) => {
              const nx = nodeXs[ni];
              const active = ni === step.nodeIdx;
              const done   = ni < step.nodeIdx;
              return (
                <g key={ni}>
                  {/* "node" pointer arrow above active box */}
                  {active && (
                    <>
                      <line x1={nx + nodeW / 2} y1={ny - 12}
                        x2={nx + nodeW / 2} y2={ny - 2}
                        stroke="#7C3AED" strokeWidth="2" markerEnd="url(#trv-v)"/>
                      <text x={nx + nodeW / 2} y={ny - 15} textAnchor="middle"
                        fill="#7C3AED" fontSize="9" fontFamily="monospace" fontWeight="700">node</text>
                    </>
                  )}

                  {/* Outer node box */}
                  <rect x={nx} y={ny} width={nodeW} height={nodeH} rx="7"
                    fill={active ? '#EDE9FE' : done ? '#ECFDF5' : '#F9FAFB'}
                    stroke={active ? '#7C3AED' : done ? '#6EE7B7' : '#E5E7EB'}
                    strokeWidth={active ? 2.2 : 1.5}/>
                  {/* value inner cell */}
                  <rect x={nx + 3} y={ny + 3} width={44} height={nodeH - 6} rx="5"
                    fill={active ? '#DDD6FE' : done ? '#D1FAE5' : '#F3F4F6'}
                    stroke={active ? '#A78BFA' : done ? '#6EE7B7' : '#E5E7EB'} strokeWidth="1.2"/>
                  <text x={nx + 25} y={ny + 26} textAnchor="middle"
                    fill={active ? '#5B21B6' : done ? '#065F46' : '#9CA3AF'}
                    fontSize="15" fontFamily="monospace" fontWeight="700">{v}</text>
                  {/* pointer inner cell */}
                  <rect x={nx + 50} y={ny + 3} width={27} height={nodeH - 6} rx="5"
                    fill="#F0FDF4" stroke="#D1FAE5" strokeWidth="1"/>
                  <text x={nx + 63} y={ny + 24} textAnchor="middle"
                    fill="#059669" fontSize="8" fontFamily="monospace">next</text>

                  {/* Arrow between nodes */}
                  {ni < 2 && (
                    <line x1={nx + nodeW} y1={midY}
                      x2={nx + nodeW + gap - 2} y2={midY}
                      stroke={done || active ? '#10b981' : '#E5E7EB'}
                      strokeWidth="1.8" markerEnd="url(#trv-g)"/>
                  )}
                </g>
              );
            })}

            {/* Step + code pill on the right — node[2] right edge = 56+80+30+80+30+80 = 356 */}
            <rect x="362" y={ny + 2} width="124" height={step.code2 ? 36 : 28} rx="5"
              fill="#F5F3FF" stroke="#DDD6FE" strokeWidth="1"/>
            <text x="424" y={ny + 13} textAnchor="middle"
              fill="#9CA3AF" fontSize="8" fontFamily="sans-serif" fontWeight="700">STEP {si + 1}</text>
            <text x="424" y={ny + 23} textAnchor="middle"
              fill="#5B21B6" fontSize="8.5" fontFamily="monospace">{step.code}</text>
            {step.code2 && (
              <text x="424" y={ny + 33} textAnchor="middle"
                fill="#5B21B6" fontSize="8.5" fontFamily="monospace">{step.code2}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SearchDiagram() {
  // Searching for value 3 in [1, 2, 3, 4]
  const nodes = [
    { v: '1', state: 'miss' },
    { v: '2', state: 'miss' },
    { v: '3', state: 'found' },
    { v: '4', state: 'skip' },
  ];
  const stateColor = {
    miss:  { fill: '#FEF2F2', stroke: '#FCA5A5', text: '#DC2626' },
    found: { fill: '#D1FAE5', stroke: '#10b981',  text: '#065F46' },
    skip:  { fill: '#F9FAFB', stroke: '#E5E7EB',  text: '#9CA3AF' },
  };
  return (
    <svg viewBox="0 0 440 152" className="w-full mx-auto" aria-label="Search operation">
      <defs>
        <marker id="srch-g" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#10b981"/>
        </marker>
        <marker id="srch-v" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#7C3AED"/>
        </marker>
      </defs>

      {/* Target label */}
      <text x="6" y="16" fill="#374151" fontSize="13" fontFamily="sans-serif" fontWeight="700">target = </text>
      <rect x="74" y="3" width="26" height="18" rx="4" fill="#EDE9FE" stroke="#7C3AED" strokeWidth="1.5"/>
      <text x="87" y="16" textAnchor="middle" fill="#5B21B6" fontSize="13" fontFamily="monospace" fontWeight="800">3</text>

      {/* Nodes */}
      {nodes.map(({ v, state }, i) => {
        const c = stateColor[state];
        const x = 8 + i * 104;
        return (
          <g key={i}>
            <rect x={x} y="28" width="44" height="30" rx="6"
              fill={c.fill} stroke={c.stroke} strokeWidth={state === 'found' ? 2.5 : 1.5}/>
            <text x={x + 22} y="48" textAnchor="middle"
              fill={c.text} fontSize="16" fontFamily="monospace" fontWeight="800">{v}</text>
            {/* Arrow to next */}
            {i < 3 && (
              <line x1={x + 44} y1="43" x2={x + 60} y2="43"
                stroke={state === 'miss' ? '#FCA5A5' : '#10b981'}
                strokeWidth="1.5" markerEnd={state === 'miss' ? 'url(#srch-g)' : 'url(#srch-g)'}/>
            )}
            {i === 3 && (
              <><line x1={x + 44} y1="43" x2={x + 60} y2="43" stroke="#9CA3AF" strokeWidth="1"/>
                <text x={x + 62} y="47" fill="#9CA3AF" fontSize="11" fontFamily="monospace">NULL</text></>
            )}
            {/* Status label below */}
            {state === 'miss'  && <text x={x + 22} y="72" textAnchor="middle" fill="#EF4444" fontSize="10" fontFamily="sans-serif">{v} ≠ 3, skip</text>}
            {state === 'found' && (
              <>
                <text x={x + 22} y="72" textAnchor="middle" fill="#059669" fontSize="11" fontFamily="sans-serif" fontWeight="700">{v} = 3 ✓</text>
                <text x={x + 22} y="84" textAnchor="middle" fill="#059669" fontSize="10" fontFamily="sans-serif">return node</text>
              </>
            )}
            {state === 'skip'  && <text x={x + 22} y="72" textAnchor="middle" fill="#9CA3AF" fontSize="10" fontFamily="sans-serif">not reached</text>}
          </g>
        );
      })}

      {/* Pseudocode — 4 lines to avoid overflow */}
      <rect x="6" y="90" width="428" height="58" rx="6" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1"/>
      <text x="14" y="104" fill="#6B7280" fontSize="11" fontFamily="monospace">node = head</text>
      <text x="14" y="117" fill="#6B7280" fontSize="11" fontFamily="monospace">while (node != NULL):</text>
      <text x="26" y="130" fill="#6B7280" fontSize="11" fontFamily="monospace">  if (node.value == target): return node</text>
      <text x="26" y="143" fill="#6B7280" fontSize="11" fontFamily="monospace">  else: node = node.next</text>
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

        {/* Left */}
        <div className="flex-1 flex items-center gap-2">
          <button onClick={onBack} className="border border-gray-300 rounded-lg px-4 py-1.5 text-gray-600 font-semibold text-lg hover:bg-gray-50 transition-colors">
            ← Back
          </button>
          <button onClick={() => setShowHelp(true)} className="w-8 h-8 rounded-full border border-gray-300 text-gray-500 font-bold text-base hover:bg-gray-50 transition-colors flex items-center justify-center" title="Game Guide">
            ?
          </button>
        </div>

        {/* Center */}
        <div className="flex-1 flex justify-center">
          <span className="text-emerald-600 text-2xl font-bold whitespace-nowrap">
            Introduction · {pageLabel}
          </span>
        </div>

        {/* Right */}
        <div className="flex-1 flex justify-end items-center gap-4">
          <span className="text-gray-700 text-lg font-semibold whitespace-nowrap">
            Level {level} · {levelName}
          </span>
          <div className="w-32 shrink-0">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>XP</span><span>{xpInLevel}/{XP_PER_LEVEL}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${xpPct}%` }} />
            </div>
          </div>
        </div>

      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP DOTS  (page indicator)
// ─────────────────────────────────────────────────────────────────────────────

function StepDots({ total, current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`rounded-full transition-all duration-300 ${
          i === current ? 'w-6 h-3 bg-emerald-500' : i < current ? 'w-3 h-3 bg-emerald-300' : 'w-3 h-3 bg-gray-200'
        }`} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCEPT PAGES  (4 pages)
// ─────────────────────────────────────────────────────────────────────────────

const CONCEPT_PAGES = [
  {
    icon:    '🔗',
    accent:  'emerald',
    title:   'What is a Linked List?',
    body:    "A linked list is a sequence of nodes connected in a chain. Unlike an array, nodes don't have to sit next to each other in memory — each node knows where the next one is. You can insert or remove nodes without shifting everything else.",
    diagram: <ChainDiagram />,
  },
  {
    icon:    '📦',
    accent:  'violet',
    title:   'The Node — Value & Pointer',
    body:    "Every node has exactly two parts: a value that stores the data (like a number or a word), and a next pointer that holds the address of the following node. Think of it like a treasure chest with a map inside pointing to the next chest.",
    diagram: <NodeAnatomyDiagram />,
  },
  {
    icon:    '🚩',
    accent:  'rose',
    title:   'HEAD & NULL — Start and End',
    body:    "HEAD is a special pointer that always points to the first node — it's your entry point into the list. The last node has next = NULL, signalling that the chain ends here. To visit every node, start at HEAD and follow next pointers until you hit NULL.",
    diagram: <HeadNullDiagram />,
  },
  {
    icon:    '⚡',
    accent:  'sky',
    title:   'When to Use a Linked List',
    body:    'Imagine a student queue for lunch. Dan wants to stand after Ben. Finding Ben takes O(n) steps either way. But once found, a linked list needs only 2 pointer updates — Ben points to Dan, Dan points to Cal. An array must push every student behind Dan back one spot to make room.',
    diagram: <UseCaseDiagram />,
    insight: 'Linked lists win when you add or remove items often — just 2 pointer updates. They lose when you need to reach a specific item directly, like item[3]: a linked list has no index, so every lookup must walk from the first node.',
  },
  {
    icon:    '🔄',
    accent:  'teal',
    title:   'Traversal — Walking the List',
    body:    'Traversal means visiting every node one by one. Start at HEAD, process the current node, then follow its next pointer. Repeat until you reach NULL. Every operation — insert, remove, search — is built on this same walking pattern.',
    diagram: <TraversalDiagram />,
    insight: 'node = node.next is the single line that drives every linked list algorithm.',
  },
  {
    icon:    '🔍',
    accent:  'indigo',
    title:   'Search — Finding a Value',
    body:    'To find a node by value, traverse the list and check each node. If the value matches, return that node. If you reach NULL without a match, return NULL to signal “not found”. Worst case: you check every node — O(n).',
    diagram: <SearchDiagram />,
    insight: 'Always return NULL (not -1 or 0) when the target is not found — it matches the type of a node pointer.',
  },
  {
    icon:    '📖',
    accent:  'amber',
    title:   'Key Terms',
    body:    null,
    diagram: null,
  },
];

const PART1_PAGES = CONCEPT_PAGES.slice(0, 3); // What is LL, Node anatomy, HEAD & NULL
const PART2_PAGES = CONCEPT_PAGES.slice(3);    // When to use, Traversal, Search, Key Terms

const ACCENT_COLORS = {
  emerald: { card: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-100 border-emerald-300 text-emerald-700', term: 'text-emerald-700' },
  violet:  { card: 'bg-violet-50  border-violet-200',  icon: 'bg-violet-100  border-violet-300  text-violet-700',  term: 'text-violet-700'  },
  rose:    { card: 'bg-rose-50    border-rose-200',    icon: 'bg-rose-100    border-rose-300    text-rose-700',    term: 'text-rose-700'    },
  sky:     { card: 'bg-sky-50     border-sky-200',     icon: 'bg-sky-100     border-sky-300     text-sky-700',     term: 'text-sky-700'     },
  teal:    { card: 'bg-teal-50    border-teal-200',    icon: 'bg-teal-100    border-teal-300    text-teal-700',    term: 'text-teal-700'    },
  indigo:  { card: 'bg-indigo-50  border-indigo-200',  icon: 'bg-indigo-100  border-indigo-300  text-indigo-700',  term: 'text-indigo-700'  },
  amber:   { card: 'bg-amber-50   border-amber-200',   icon: 'bg-amber-100   border-amber-300   text-amber-700',   term: 'text-amber-700'   },
};

const KEY_TERMS = [
  { term: 'Node',    def: 'A single element containing a value and a next pointer' },
  { term: 'Value',   def: 'The data stored inside a node'                          },
  { term: 'Pointer', def: 'A reference (address) pointing to another node'         },
  { term: 'HEAD',    def: 'A pointer to the first node — the entry point'          },
  { term: 'next',    def: "A node's pointer to the following node"                 },
  { term: 'NULL',    def: 'Marks the end of the list (no next node)'               },
];

function ConceptPageView({ page, pageIdx, totalConceptPages, onContinue, onBack }) {
  const c = ACCENT_COLORS[page.accent];
  const isKeyTerms = page.icon === '📖';

  return (
    <div className="max-w-2xl mx-auto">
      <StepDots total={totalConceptPages} current={pageIdx} />

      <div className={`bg-white rounded-3xl border-2 ${c.card} p-8 shadow-sm mb-8`}>
        {/* Icon + title */}
        <div className="flex items-center gap-4 mb-5">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl border-2 ${c.icon}`}>
            {page.icon}
          </div>
          <h2 className="text-3xl font-black text-gray-900 leading-tight">{page.title}</h2>
        </div>

        {/* Body text */}
        {page.body && (
          <p className="text-gray-600 text-xl leading-relaxed mb-6">{page.body}</p>
        )}

        {/* Diagram */}
        {page.diagram && (
          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4">
            {page.diagram}
          </div>
        )}

        {/* Key insight callout */}
        {page.insight && (
          <div className="mt-4 flex items-start gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-3">
            <span className="text-lg mt-0.5">💡</span>
            <p className="text-gray-600 text-base leading-snug">
              <span className="font-bold text-gray-800">Key insight: </span>{page.insight}
            </p>
          </div>
        )}

        {/* Key terms grid */}
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

      {/* Nav buttons */}
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
          className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white text-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 active:scale-95 transition-all shadow-md"
        >
          {pageIdx < totalConceptPages - 1 ? 'Continue' : "I'm ready — Take the Quiz"}
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ COMPONENT  (one question per page)
// ─────────────────────────────────────────────────────────────────────────────

function QuizSection({ questions, onComplete, onReviewConcepts, completedQs, onMarkComplete }) {
  // Start at the first unanswered question
  const firstUncompleted = completedQs.findIndex(c => !c);
  const [qIdx, setQIdx]         = useState(firstUncompleted === -1 ? 0 : firstUncompleted);
  const [selected, setSelected] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);

  const q = questions[qIdx];

  const handleSelect = (optIdx) => {
    if (isCorrect) return;
    setSelected(optIdx);
    const correct = optIdx === q.correct;
    setIsCorrect(correct);
    if (correct) {
      onMarkComplete(qIdx);
    } else {
      addMistake({
        source:        'quiz',
        title:         q.question,
        yourAnswer:    q.options[optIdx],
        correctAnswer: q.options[q.correct],
        explanation:   q.explanation,
      });
    }
  };

  const handleNext = () => {
    let next = -1;
    for (let i = qIdx + 1; i < questions.length; i++) {
      if (!completedQs[i]) { next = i; break; }
    }
    if (next === -1) {
      for (let i = 0; i < qIdx; i++) {
        if (!completedQs[i]) { next = i; break; }
      }
    }
    if (next !== -1) {
      setQIdx(next);
      setSelected(null);
      setIsCorrect(null);
    } else {
      onComplete();
    }
  };

  const optionStyle = (optIdx) => {
    if (selected === null) return 'bg-white border-gray-200 text-gray-700 hover:bg-violet-50 hover:border-violet-300 cursor-pointer';
    if (isCorrect && optIdx === q.correct) return 'bg-emerald-50 border-emerald-400 text-emerald-800';
    if (optIdx === selected && !isCorrect) return 'bg-red-50 border-red-400 text-red-800';
    return 'bg-white border-gray-200 text-gray-400 opacity-60 cursor-not-allowed';
  };

  // How many questions remain (excluding current if not yet correct)
  const remaining = completedQs.filter(c => !c).length;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step dots — filled for completed questions */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {questions.map((_, i) => (
          <div key={i} className={`rounded-full transition-all duration-300 ${
            completedQs[i]  ? 'w-3 h-3 bg-emerald-400' :
            i === qIdx      ? 'w-6 h-3 bg-violet-500'  :
                              'w-3 h-3 bg-gray-200'
          }`} />
        ))}
      </div>

      {/* Progress label */}
      <p className="text-center text-gray-400 text-base mb-4">
        {completedQs.filter(Boolean).length} / {questions.length} correct
      </p>

      {/* Question card */}
      <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm mb-5">
        <div className="flex items-start gap-4 mb-6">
          <span className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 border border-violet-200 text-lg font-black flex items-center justify-center shrink-0 mt-0.5">
            {qIdx + 1}
          </span>
          <h3 className="text-2xl font-bold text-gray-900 leading-snug">{q.question}</h3>
        </div>

        <div className="flex flex-col gap-3">
          {q.options.map((opt, optIdx) => (
            <button
              key={optIdx}
              onClick={() => handleSelect(optIdx)}
              disabled={selected !== null}
              className={`w-full text-left px-5 py-4 rounded-2xl border-2 text-xl font-medium transition-all ${optionStyle(optIdx)}`}
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-current text-base font-bold shrink-0 mt-0.5">
                  {String.fromCharCode(65 + optIdx)}
                </span>
                <span className="flex-1" style={{ whiteSpace: 'pre-line' }}>{opt}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Feedback */}
      {selected !== null && (
        <div className={`rounded-2xl px-6 py-4 mb-5 border-2 ${
          isCorrect
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
            : 'bg-red-50 border-red-200'
        }`}>
          {isCorrect ? (
            <p className="text-xl">
              <span className="font-black mr-2">✅ Correct!</span>
              {q.explanation}
            </p>
          ) : (
            <>
              <p className="text-xl font-black text-red-700 mb-3">❌ Not quite.</p>
              <p className="text-sm text-gray-600 mb-3">{q.explanation}</p>
              <button
                onClick={() => onReviewConcepts(q.slideRef)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 font-semibold text-base hover:bg-violet-100 transition-colors"
              >
                📖 Review: {q.slideLabel} →
              </button>
            </>
          )}
        </div>
      )}

      {/* Buttons */}
      {selected !== null && !isCorrect && (
        <button
          onClick={() => { setSelected(null); setIsCorrect(null); }}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white text-xl bg-gradient-to-r from-violet-500 to-indigo-600 hover:opacity-90 active:scale-95 transition-all shadow-md mb-3"
        >
          Try Again
        </button>
      )}

      {isCorrect && (
        <button
          onClick={handleNext}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white text-xl bg-gradient-to-r from-violet-500 to-indigo-600 hover:opacity-90 active:scale-95 transition-all shadow-md"
        >
          {remaining === 0 ? 'Finish Quiz' : 'Next Question'}
          <ChevronRight size={22} />
        </button>
      )}

      {selected === null && (
        <button
          onClick={() => onReviewConcepts(q.slideRef)}
          className="mt-4 w-full py-3 rounded-2xl text-gray-400 hover:text-gray-600 text-lg transition-colors"
        >
          ← Review the concepts
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR NAV
// ─────────────────────────────────────────────────────────────────────────────

const SIDEBAR_ITEMS = [
  { type: 'header', label: 'Part 1' },
  { type: 'slide', globalIdx: 0, part: 1, cpIdx: 0, icon: '🔗', label: 'What is a Linked List?' },
  { type: 'slide', globalIdx: 1, part: 1, cpIdx: 1, icon: '📦', label: 'The Node' },
  { type: 'slide', globalIdx: 2, part: 1, cpIdx: 2, icon: '🚩', label: 'HEAD & NULL' },
  { type: 'quiz',  part: 1,                          icon: '📝', label: 'Quick Check' },
  { type: 'header', label: 'Part 2' },
  { type: 'slide', globalIdx: 3, part: 2, cpIdx: 0, icon: '⚡', label: 'When to Use' },
  { type: 'slide', globalIdx: 4, part: 2, cpIdx: 1, icon: '🔄', label: 'Traversal' },
  { type: 'slide', globalIdx: 5, part: 2, cpIdx: 2, icon: '🔍', label: 'Search' },
  { type: 'slide', globalIdx: 6, part: 2, cpIdx: 3, icon: '📖', label: 'Key Terms' },
  { type: 'quiz',  part: 2,                          icon: '📝', label: 'Quick Check' },
];

function SidebarNav({ currentPart, currentPhase, currentConceptPage, maxReachedSlide, quiz1Reached, quiz2Reached, onNavigateTo }) {
  const currentGlobal = currentPhase === 'concept'
    ? (currentPart === 1 ? currentConceptPage : currentConceptPage + PART1_PAGES.length)
    : -1;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-2 border-b border-gray-100">
        Contents
      </p>
      <div className="p-2">
        {SIDEBAR_ITEMS.map((item, idx) => {
            if (item.type === 'header') {
              return (
                <p key={idx} className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 pt-3 pb-1 first:pt-1">
                  {item.label}
                </p>
              );
            }

            const isCurrent = item.type === 'slide'
              ? currentGlobal === item.globalIdx
              : currentPhase === 'quiz' && currentPart === item.part;

            // TODO: restore progress-gating when ready
            const accessible = true;
            const isDone = !isCurrent;

            return (
              <button
                key={idx}
                onClick={() => {
                  if (!accessible) return;
                  if (item.type === 'slide') {
                    onNavigateTo({ part: item.part, phase: 'concept', cpIdx: item.cpIdx });
                  } else {
                    onNavigateTo({ part: item.part, phase: 'quiz' });
                  }
                }}
                disabled={!accessible}
                className={`w-full text-left px-2 py-1.5 rounded-xl flex items-center gap-2 transition-colors mb-0.5 ${
                  isCurrent
                    ? 'bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200'
                    : accessible
                      ? 'text-gray-600 hover:bg-gray-50 cursor-pointer'
                      : 'text-gray-300 cursor-default'
                }`}
              >
                <span className="text-sm shrink-0">{item.icon}</span>
                <span className="flex-1 text-xs leading-snug truncate">{item.label}</span>
                {isDone && <span className="text-emerald-400 text-xs shrink-0 font-bold">✓</span>}
              </button>
            );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function TutorialIntroPage({ onBack, onComplete, xp = 0 }) {
  // phase: 'concept' | 'quiz' | 'bridge' | 'done'
  const [phase, setPhase]             = useState('concept');
  const [part,  setPart]              = useState(1);
  const [conceptPage, setConceptPage] = useState(0);
  const [showGift, setShowGift]       = useState(false);
  const [completedQs1, setCompletedQs1] = useState(Array(QUIZ_1.length).fill(false));
  const [completedQs2, setCompletedQs2] = useState(Array(QUIZ_2.length).fill(false));
  const [maxReachedSlide, setMaxReachedSlide] = useState(0);
  const [quiz1Reached,    setQuiz1Reached]    = useState(false);
  const [quiz2Reached,    setQuiz2Reached]    = useState(false);

  const currentPages = part === 1 ? PART1_PAGES : PART2_PAGES;
  const currentQuiz  = part === 1 ? QUIZ_1 : QUIZ_2;
  const completedQs  = part === 1 ? completedQs1 : completedQs2;

  const handleMarkComplete = (qIdx) => {
    if (part === 1) setCompletedQs1(prev => prev.map((v, i) => i === qIdx ? true : v));
    else            setCompletedQs2(prev => prev.map((v, i) => i === qIdx ? true : v));
  };

  const handleNavigateTo = ({ part: toPart, phase: toPhase, cpIdx }) => {
    setPart(toPart);
    setPhase(toPhase);
    if (toPhase === 'concept') setConceptPage(cpIdx);
  };

  // slideRef is an absolute index into CONCEPT_PAGES; map to the current part's page index
  const handleReviewConcepts = (slideRef = 0) => {
    setConceptPage(part === 1 ? slideRef : slideRef - PART1_PAGES.length);
    setPhase('concept');
  };

  const pageLabel =
    phase === 'concept' ? `Part ${part} · Slide ${conceptPage + 1} / ${currentPages.length}` :
    phase === 'quiz'    ? `Part ${part} · Quick Check` :
    phase === 'bridge'  ? 'Part 1 Complete' :
                          'All Done!';

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar onBack={onBack} xp={xp} pageLabel={pageLabel} />

      <div className="px-6 py-10">
        <div className="max-w-7xl mx-auto flex items-start gap-8">
          <div className="w-52 shrink-0 sticky self-start" style={{ top: '72px' }}>
            <SidebarNav
              currentPart={part}
              currentPhase={phase}
              currentConceptPage={conceptPage}
              maxReachedSlide={maxReachedSlide}
              quiz1Reached={quiz1Reached}
              quiz2Reached={quiz2Reached}
              onNavigateTo={handleNavigateTo}
            />
          </div>
          <div className="flex-1 min-w-0 flex justify-center">
            <div className="w-full max-w-2xl">

        {/* ── CONCEPT PHASE ── */}
        {phase === 'concept' && (
          <ConceptPageView
            page={currentPages[conceptPage]}
            pageIdx={conceptPage}
            totalConceptPages={currentPages.length}
            onContinue={() => {
              if (conceptPage < currentPages.length - 1) {
                const next = conceptPage + 1;
                const nextGlobal = part === 1 ? next : next + PART1_PAGES.length;
                setMaxReachedSlide(prev => Math.max(prev, nextGlobal));
                setConceptPage(next);
              } else {
                if (part === 1) setQuiz1Reached(true);
                else setQuiz2Reached(true);
                setPhase('quiz');
              }
            }}
            onBack={() => setConceptPage(p => p - 1)}
          />
        )}

        {/* ── QUIZ PHASE ── */}
        {phase === 'quiz' && (
          <>
            <div className="text-center mb-10 max-w-2xl mx-auto">
              <h2 className="text-4xl font-black text-gray-900 mb-2">Quick Check — Part {part}</h2>
              <p className="text-gray-500 text-xl">
                Answer all {currentQuiz.length} questions correctly to continue.
              </p>
            </div>
            <QuizSection
              questions={currentQuiz}
              onComplete={() => part === 1 ? setPhase('bridge') : setPhase('done')}
              onReviewConcepts={handleReviewConcepts}
              completedQs={completedQs}
              onMarkComplete={handleMarkComplete}
            />
          </>
        )}

        {/* ── BRIDGE (between parts) ── */}
        {phase === 'bridge' && (
          <div className="flex flex-col items-center text-center pt-12 max-w-xl mx-auto">
            <div className="w-20 h-20 rounded-full bg-emerald-100 border-4 border-emerald-300 flex items-center justify-center text-4xl mb-6 shadow">
              ✅
            </div>
            <h2 className="text-4xl font-black text-gray-900 mb-3">Part 1 Done!</h2>
            <p className="text-gray-500 text-xl mb-10">
              You know what a linked list is and how nodes connect.
              Now let's see when to use one and how to walk through it.
            </p>
            <button
              onClick={() => {
                setPart(2);
                setConceptPage(0);
                setPhase('concept');
                setMaxReachedSlide(prev => Math.max(prev, PART1_PAGES.length));
              }}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white text-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 active:scale-95 transition-all shadow-md"
            >
              Continue to Part 2 <ChevronRight size={22} />
            </button>
          </div>
        )}

        {/* ── DONE PHASE ── */}
        {phase === 'done' && (
          <div className="flex flex-col items-center text-center pt-12 max-w-xl mx-auto">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-6 shadow-lg">
              <span className="text-5xl">🎉</span>
            </div>
            <h2 className="text-4xl font-black text-gray-900 mb-3">You're ready!</h2>
            <p className="text-gray-500 text-xl mb-10">
              You understand linked lists, when to use them, and how to traverse and search them.
              Time to write some code!
            </p>

            <div className="w-full bg-white rounded-3xl border border-gray-200 p-7 mb-10 text-left shadow-sm">
              <p className="text-emerald-600 font-bold text-xl mb-4">What you'll do next:</p>
              <ul className="space-y-3">
                {[
                  '✏️  Fill in pseudocode blanks step by step',
                  '👀  Watch the linked list update live',
                  '💡  Get a hint for each blank you need to fill',
                ].map(t => (
                  <li key={t} className="text-gray-600 text-xl">{t}</li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => setShowGift(true)}
              className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-bold text-white text-2xl bg-gradient-to-r from-violet-500 to-indigo-600 hover:opacity-90 active:scale-95 transition-all shadow-md"
            >
              🎁 Claim Your Companion
            </button>
          </div>
        )}
            </div>
          </div>
        </div>
      </div>

      {/* ── GIFT REVEAL OVERLAY ── */}
      {showGift && (
        <EggRevealModal onContinue={onComplete} />
      )}
    </div>
  );
}
