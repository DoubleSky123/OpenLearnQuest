import React, { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';

/**
 * TutorialWelcomeModal  –  Two-step intro
 * Step 1 – What is a linked list? (SVG diagram + concept cards)
 * Step 2 – How to play (3 rows: large panel left + description right)
 */
export default function TutorialWelcomeModal({ onStart, onClose }) {
  const [step, setStep] = useState(1);

  // ── Step 1: Linked-list diagram ───────────────────────────────────────
  const LinkedListDiagram = () => (
    <svg viewBox="0 0 420 90" xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-sm mx-auto"
      aria-label="Linked list diagram">
      <text x="14" y="30" fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="bold">HEAD</text>
      <line x1="14" y1="38" x2="14" y2="52" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr0)" />
      {[{ x: 0, val: '12' }, { x: 120, val: '5' }, { x: 240, val: '8' }].map(({ x, val }, i) => (
        <g key={i} transform={`translate(${x}, 55)`}>
          <rect x="0" y="0" width="48" height="28" rx="5" fill="#1e3a2e" stroke="#10b981" strokeWidth="1.5" />
          <text x="24" y="18" textAnchor="middle" fill="#6ee7b7" fontSize="12" fontFamily="monospace" fontWeight="bold">{val}</text>
          <rect x="48" y="0" width="30" height="28" rx="5" fill="#162d22" stroke="#10b981" strokeWidth="1.5" />
          <text x="63" y="18" textAnchor="middle" fill="#6ee7b7" fontSize="9" fontFamily="monospace">next</text>
          {i < 2
            ? <line x1="78" y1="14" x2="118" y2="14" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arr0)" />
            : <><line x1="78" y1="14" x2="108" y2="14" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arr0)" />
               <text x="112" y="18" fill="#64748b" fontSize="11" fontFamily="monospace">null</text></>}
          <text x="24" y="46" textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">node {i}</text>
        </g>
      ))}
      <defs>
        <marker id="arr0" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#10b981" />
        </marker>
      </defs>
    </svg>
  );

  // ── Step 2: Panel SVGs (wide landscape format) ────────────────────────

  /** Panel 1: Goal state */
  const PanelGoal = () => (
    <svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <defs>
        <marker id="ag" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L0,5 L5,2.5 z" fill="#10b981"/>
        </marker>
      </defs>
      <rect x="2" y="2" width="276" height="96" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1.5"/>
      {/* GOAL label bar */}
      <rect x="10" y="10" width="260" height="18" rx="4" fill="#162d22" stroke="#10b981" strokeWidth="1"/>
      <text x="140" y="23" textAnchor="middle" fill="#6ee7b7" fontSize="9" fontFamily="monospace" fontWeight="bold" letterSpacing="2">GOAL</text>
      {/* Nodes: 0(highlight) → 1 → 2 → 3 → null */}
      {[{x:14,v:'0',hi:true},{x:72,v:'1'},{x:130,v:'2'},{x:188,v:'3'}].map(({x,v,hi},i)=>(
        <g key={i} transform={`translate(${x},38)`}>
          <circle cx="18" cy="18" r="17"
            fill={hi?'#065f46':'#1e3a2e'} stroke={hi?'#34d399':'#10b981'} strokeWidth={hi?2:1.5}/>
          <text x="18" y="23" textAnchor="middle" fill={hi?'#34d399':'#6ee7b7'}
            fontSize="13" fontFamily="monospace" fontWeight="bold">{v}</text>
          {i<3&&<line x1="35" y1="18" x2="53" y2="18" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#ag)"/>}
        </g>
      ))}
      <text x="244" y="60" fill="#475569" fontSize="10" fontFamily="monospace">null</text>
      <text x="140" y="92" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="sans-serif">Node 0 (green) is the new node to insert</text>
    </svg>
  );

  /** Panel 2: Code Pool */
  const PanelCodePool = () => (
    <svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect x="2" y="2" width="276" height="96" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1.5"/>
      <text x="12" y="18" fill="#94a3b8" fontSize="9" fontFamily="monospace" fontWeight="bold" letterSpacing="1">CODE POOL</text>
      {/* Block 1 — highlighted / being picked */}
      <rect x="10" y="24" width="260" height="20" rx="5" fill="#065f46" stroke="#34d399" strokeWidth="1.5"/>
      <text x="22" y="38" fill="#34d399" fontSize="10" fontFamily="monospace">⠿  create newNode</text>
      <text x="256" y="38" fill="#34d399" fontSize="12">✋</text>
      {/* Block 2 */}
      <rect x="10" y="50" width="260" height="20" rx="5" fill="#334155" stroke="#475569" strokeWidth="1"/>
      <text x="22" y="64" fill="#94a3b8" fontSize="10" fontFamily="monospace">⠿  newNode.next = head</text>
      {/* Block 3 */}
      <rect x="10" y="76" width="260" height="18" rx="5" fill="#334155" stroke="#475569" strokeWidth="1"/>
      <text x="22" y="89" fill="#94a3b8" fontSize="10" fontFamily="monospace">⠿  head = newNode</text>
    </svg>
  );

  /** Panel 3: Assembly Area */
  const PanelAssembly = () => (
    <svg viewBox="0 0 280 100" xmlns="http://www.w3.org/2000/svg" className="w-full">
      <rect x="2" y="2" width="276" height="96" rx="8" fill="#1e293b" stroke="#334155" strokeWidth="1.5" strokeDasharray="6 3"/>
      <text x="12" y="18" fill="#94a3b8" fontSize="9" fontFamily="monospace" fontWeight="bold" letterSpacing="1">ASSEMBLY AREA</text>
      {/* Placed block 1 */}
      <rect x="10" y="24" width="260" height="20" rx="5" fill="#065f46" stroke="#10b981" strokeWidth="1.5"/>
      <text x="22" y="38" fill="#6ee7b7" fontSize="9" fontFamily="monospace" fontWeight="bold">1.</text>
      <text x="38" y="38" fill="#fff" fontSize="10" fontFamily="monospace">create newNode</text>
      <text x="258" y="38" fill="#34d399" fontSize="11">✓</text>
      {/* Slot 2 — dashed */}
      <rect x="10" y="50" width="260" height="20" rx="5" fill="none" stroke="#065f46" strokeWidth="1" strokeDasharray="4 2"/>
      <text x="22" y="64" fill="#065f46" fontSize="9" fontFamily="monospace" fontWeight="bold">2.</text>
      <text x="38" y="64" fill="#475569" fontSize="10" fontFamily="monospace" fontStyle="italic">drop next block here…</text>
      {/* Slot 3 — faint */}
      <rect x="10" y="76" width="260" height="18" rx="4" fill="none" stroke="#1e3a2e" strokeWidth="1" strokeDasharray="3 2"/>
      <text x="22" y="89" fill="#1e3a2e" fontSize="9" fontFamily="monospace" fontWeight="bold">3.</text>
    </svg>
  );

  // ── Step 1 ────────────────────────────────────────────────────────────
  const StepOne = () => (
    <>
      <div className="mb-5">
        <span className="text-3xl mb-3 block">🔗</span>
        <h2 className="text-2xl font-extrabold text-white mb-1">What is a Linked List?</h2>
        <p className="text-slate-300 text-sm leading-relaxed">
          A <span className="text-emerald-400 font-semibold">linked list</span> is a sequence of{' '}
          <span className="text-emerald-400 font-semibold">nodes</span>. Each node holds a{' '}
          <span className="text-emerald-400 font-semibold">value</span> and a{' '}
          <span className="text-emerald-400 font-semibold">next pointer</span> to the following node.
          The last node points to <code className="text-slate-400">null</code>.
        </p>
      </div>
      <div className="bg-slate-700/50 rounded-xl p-5 mb-5 border border-slate-600">
        <LinkedListDiagram />
        <p className="text-slate-500 text-xs text-center mt-3">HEAD → node 0 → node 1 → node 2 → null</p>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-7">
        {[
          { icon: '📦', label: 'Node', desc: 'Stores a value' },
          { icon: '➡️', label: 'Pointer', desc: 'Links to next' },
          { icon: '🚩', label: 'HEAD', desc: 'Entry point' },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="bg-slate-700/40 rounded-lg p-2 text-center border border-slate-600">
            <div className="text-lg mb-0.5">{icon}</div>
            <div className="text-white text-xs font-semibold">{label}</div>
            <div className="text-slate-400 text-xs">{desc}</div>
          </div>
        ))}
      </div>
      <button
        onClick={() => setStep(2)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 active:scale-95 transition-all shadow-lg text-base"
      >
        How to Play <ChevronRight size={18} />
      </button>
    </>
  );

  // ── Step 2 ────────────────────────────────────────────────────────────
  const StepTwo = () => (
    <>
      <div className="mb-5">
        <span className="text-3xl mb-3 block">🎮</span>
        <h2 className="text-2xl font-extrabold text-white mb-1">How to Play</h2>
      </div>

      {/* 3 rows: panel (left, ~60%) + description (right, ~40%) */}
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
          <div key={n} className="flex items-center gap-3 bg-slate-700/40 rounded-xl p-3 border border-slate-600/50">
            {/* Panel — takes ~60% width */}
            <div className="w-[58%] shrink-0 bg-slate-800 rounded-lg overflow-hidden">
              {panel}
            </div>
            {/* Text — takes remaining width */}
            <div className="flex flex-col gap-1">
              <span className="w-6 h-6 rounded-full bg-emerald-700 text-emerald-100 text-xs font-bold flex items-center justify-center mb-1">
                {n}
              </span>
              <p className="text-white text-sm font-semibold leading-snug">{title}</p>
              <p className="text-slate-400 text-xs leading-snug">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep(1)}
          className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-sm"
        >
          ← Back
        </button>
        <button
          onClick={onStart}
          className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 active:scale-95 transition-all shadow-lg text-base"
        >
          Start Tutorial <ChevronRight size={18} />
        </button>
      </div>
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />

        {/* Step indicator dots */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {[1, 2].map(s => (
            <div key={s} className={`h-2 rounded-full transition-all duration-300 ${s === step ? 'bg-emerald-400 w-5' : 'bg-slate-600 w-2'}`} />
          ))}
        </div>

        <button onClick={onClose} className="absolute top-3 right-4 text-slate-400 hover:text-white transition-colors" aria-label="Close">
          <X size={20} />
        </button>

        <div className="p-8 pt-10">
          {step === 1 ? <StepOne /> : <StepTwo />}
        </div>
      </div>
    </div>
  );
}
