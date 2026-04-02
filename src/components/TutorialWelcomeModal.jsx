import React, { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';

export default function TutorialWelcomeModal({ onStart, onClose }) {
  const [step, setStep] = useState(1);

  // ── Step 1: Linked-list diagram (light theme) ──────────────────────────────
  const LinkedListDiagram = () => (
    <svg viewBox="0 0 420 90" xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-sm mx-auto"
      aria-label="Linked list diagram">
      <text x="14" y="30" fill="#6B7280" fontSize="11" fontFamily="monospace" fontWeight="bold">HEAD</text>
      <line x1="14" y1="38" x2="14" y2="52" stroke="#6B7280" strokeWidth="1.5" markerEnd="url(#arr0)" />
      {[{ x: 0, val: '12' }, { x: 120, val: '5' }, { x: 240, val: '8' }].map(({ x, val }, i) => (
        <g key={i} transform={`translate(${x}, 55)`}>
          <rect x="0" y="0" width="48" height="28" rx="5" fill="#ECFDF5" stroke="#6EE7B7" strokeWidth="1.5" />
          <text x="24" y="18" textAnchor="middle" fill="#065F46" fontSize="12" fontFamily="monospace" fontWeight="bold">{val}</text>
          <rect x="48" y="0" width="30" height="28" rx="5" fill="#F0FDF4" stroke="#6EE7B7" strokeWidth="1.5" />
          <text x="63" y="18" textAnchor="middle" fill="#059669" fontSize="9" fontFamily="monospace">next</text>
          {i < 2
            ? <line x1="78" y1="14" x2="118" y2="14" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arr0)" />
            : <><line x1="78" y1="14" x2="108" y2="14" stroke="#D1D5DB" strokeWidth="1.5" markerEnd="url(#arr0n)" />
               <text x="112" y="18" fill="#9CA3AF" fontSize="11" fontFamily="monospace">null</text></>}
          <text x="24" y="46" textAnchor="middle" fill="#9CA3AF" fontSize="9" fontFamily="monospace">node {i}</text>
        </g>
      ))}
      <defs>
        <marker id="arr0" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#10b981" />
        </marker>
        <marker id="arr0n" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#D1D5DB" />
        </marker>
      </defs>
    </svg>
  );

  // ── Step 2 panel SVGs (light theme) ───────────────────────────────────────

  /** Panel 1: Goal state */
  const PanelGoal = () => (
    <svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <defs>
        <marker id="ag" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L0,5 L5,2.5 z" fill="#10b981"/>
        </marker>
      </defs>
      <rect x="2" y="2" width="276" height="96" rx="8" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1.5"/>
      {/* GOAL label bar */}
      <rect x="10" y="10" width="260" height="18" rx="4" fill="#ECFDF5" stroke="#6EE7B7" strokeWidth="1"/>
      <text x="140" y="23" textAnchor="middle" fill="#059669" fontSize="9" fontFamily="monospace" fontWeight="bold" letterSpacing="2">GOAL</text>
      {/* Nodes */}
      {[{x:14,v:'0',hi:true},{x:72,v:'1'},{x:130,v:'2'},{x:188,v:'3'}].map(({x,v,hi},i)=>(
        <g key={i} transform={`translate(${x},38)`}>
          <circle cx="18" cy="18" r="17"
            fill={hi?'#ECFDF5':'#F0FDF4'} stroke={hi?'#34d399':'#6EE7B7'} strokeWidth={hi?2:1.5}/>
          <text x="18" y="23" textAnchor="middle" fill={hi?'#059669':'#065F46'}
            fontSize="13" fontFamily="monospace" fontWeight="bold">{v}</text>
          {i<3&&<line x1="35" y1="18" x2="53" y2="18" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#ag)"/>}
        </g>
      ))}
      <text x="246" y="60" fill="#9CA3AF" fontSize="10" fontFamily="monospace">null</text>
      <text x="140" y="92" textAnchor="middle" fill="#9CA3AF" fontSize="8" fontFamily="sans-serif">Node 0 (green) is the new node to insert</text>
    </svg>
  );

  /** Panel 2: Code Pool */
  const PanelCodePool = () => (
    <svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect x="2" y="2" width="276" height="96" rx="8" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1.5"/>
      <text x="12" y="18" fill="#6B7280" fontSize="9" fontFamily="monospace" fontWeight="bold" letterSpacing="1">CODE POOL</text>
      {/* Block 1 — highlighted / being picked */}
      <rect x="10" y="24" width="260" height="20" rx="5" fill="#ECFDF5" stroke="#34d399" strokeWidth="1.5"/>
      <text x="22" y="38" fill="#059669" fontSize="10" fontFamily="monospace">⠿  create newNode</text>
      <text x="256" y="38" fill="#059669" fontSize="12">✋</text>
      {/* Block 2 */}
      <rect x="10" y="50" width="260" height="20" rx="5" fill="#F3F4F6" stroke="#E5E7EB" strokeWidth="1"/>
      <text x="22" y="64" fill="#6B7280" fontSize="10" fontFamily="monospace">⠿  newNode.next = head</text>
      {/* Block 3 */}
      <rect x="10" y="76" width="260" height="18" rx="5" fill="#F3F4F6" stroke="#E5E7EB" strokeWidth="1"/>
      <text x="22" y="89" fill="#6B7280" fontSize="10" fontFamily="monospace">⠿  head = newNode</text>
    </svg>
  );

  /** Panel 3: Assembly Area */
  const PanelAssembly = () => (
    <svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect x="2" y="2" width="276" height="96" rx="8" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="1.5" strokeDasharray="6 3"/>
      <text x="12" y="18" fill="#6B7280" fontSize="9" fontFamily="monospace" fontWeight="bold" letterSpacing="1">ASSEMBLY AREA</text>
      {/* Placed block 1 */}
      <rect x="10" y="24" width="260" height="20" rx="5" fill="#ECFDF5" stroke="#6EE7B7" strokeWidth="1.5"/>
      <text x="22" y="38" fill="#059669" fontSize="9" fontFamily="monospace" fontWeight="bold">1.</text>
      <text x="38" y="38" fill="#065F46" fontSize="10" fontFamily="monospace">create newNode</text>
      <text x="258" y="38" fill="#10b981" fontSize="11">✓</text>
      {/* Slot 2 — dashed */}
      <rect x="10" y="50" width="260" height="20" rx="5" fill="none" stroke="#6EE7B7" strokeWidth="1" strokeDasharray="4 2"/>
      <text x="22" y="64" fill="#6EE7B7" fontSize="9" fontFamily="monospace" fontWeight="bold">2.</text>
      <text x="38" y="64" fill="#9CA3AF" fontSize="10" fontFamily="monospace" fontStyle="italic">drop next block here…</text>
      {/* Slot 3 — faint */}
      <rect x="10" y="76" width="260" height="18" rx="4" fill="none" stroke="#D1FAE5" strokeWidth="1" strokeDasharray="3 2"/>
      <text x="22" y="89" fill="#D1FAE5" fontSize="9" fontFamily="monospace" fontWeight="bold">3.</text>
    </svg>
  );

  // ── Step 1 ─────────────────────────────────────────────────────────────────
  const StepOne = () => (
    <>
      <div className="mb-5">
        <span className="text-3xl mb-3 block">🔗</span>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-1">What is a Linked List?</h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          A <span className="text-emerald-600 font-semibold">linked list</span> is a sequence of{' '}
          <span className="text-emerald-600 font-semibold">nodes</span>. Each node holds a{' '}
          <span className="text-emerald-600 font-semibold">value</span> and a{' '}
          <span className="text-emerald-600 font-semibold">next pointer</span> to the following node.
          The last node points to <code className="text-gray-400 bg-gray-100 px-1 rounded text-xs">null</code>.
        </p>
      </div>

      {/* Diagram in a light container */}
      <div className="bg-gray-50 rounded-xl p-5 mb-5 border border-gray-200">
        <LinkedListDiagram />
        <p className="text-gray-400 text-xs text-center mt-3">HEAD → node 0 → node 1 → node 2 → null</p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-7">
        {[
          { icon: '📦', label: 'Node',    desc: 'Stores a value' },
          { icon: '➡️', label: 'Pointer', desc: 'Links to next'  },
          { icon: '🚩', label: 'HEAD',    desc: 'Entry point'    },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
            <div className="text-lg mb-0.5">{icon}</div>
            <div className="text-gray-800 text-xs font-semibold">{label}</div>
            <div className="text-gray-400 text-xs">{desc}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setStep(2)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 active:scale-95 transition-all shadow-md text-base"
      >
        How to Play <ChevronRight size={18} />
      </button>
    </>
  );

  // ── Step 2 ─────────────────────────────────────────────────────────────────
  const StepTwo = () => (
    <>
      <div className="mb-5">
        <span className="text-3xl mb-3 block">🎮</span>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-1">How to Play</h2>
      </div>

      <div className="flex flex-col gap-3 mb-7">
        {[
          {
            n: '1',
            panel: <PanelGoal />,
            title: 'Read the Goal',
            desc: 'The Goal section shows the target state your linked list must reach after the operation.',
          },
          {
            n: '2',
            panel: <PanelCodePool />,
            title: 'Pick a code block',
            desc: 'Drag — or click — a block from the Code Pool to pick it up.',
          },
          {
            n: '3',
            panel: <PanelAssembly />,
            title: 'Build in the Assembly Area',
            desc: 'Drop blocks into the Assembly Area in the correct order. The list updates as you go!',
          },
        ].map(({ n, panel, title, desc }) => (
          <div key={n} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
            <div className="w-[58%] shrink-0 bg-white rounded-lg overflow-hidden border border-gray-100">
              {panel}
            </div>
            <div className="flex flex-col gap-1">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center justify-center mb-1">
                {n}
              </span>
              <p className="text-gray-800 text-sm font-semibold leading-snug">{title}</p>
              <p className="text-gray-500 text-xs leading-snug">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep(1)}
          className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all text-sm border border-gray-200"
        >
          ← Back
        </button>
        <button
          onClick={onStart}
          className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 active:scale-95 transition-all shadow-md text-base"
        >
          Start Tutorial <ChevronRight size={18} />
        </button>
      </div>
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">

        {/* Top accent bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />

        {/* Step indicator dots */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {[1, 2].map(s => (
            <div key={s} className={`h-2 rounded-full transition-all duration-300 ${
              s === step ? 'bg-emerald-400 w-5' : 'bg-gray-200 w-2'
            }`} />
          ))}
        </div>

        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-gray-400 hover:text-gray-700 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="p-8 pt-10 overflow-y-auto max-h-[90vh]">
          {step === 1 ? <StepOne /> : <StepTwo />}
        </div>
      </div>
    </div>
  );
}
