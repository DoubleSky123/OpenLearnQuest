const TYPE_INFO = {
  1: { name: 'Fill in the Blank', desc: 'Complete the missing pieces of the pseudocode.' },
  2: { name: 'Find the Bug',      desc: 'Spot the incorrect line and fix it.' },
  3: { name: 'Code Ordering',     desc: 'Assemble the steps in the correct order from scratch.' },
};

/**
 * Shown when a higher question type is unlocked. The student decides whether to
 * advance to the new type now or keep practising the current one.
 * Does NOT auto-dismiss — it requires an explicit choice.
 */
export default function UnlockPopup({ currentLevel, unlockedLevel, onAdvance, onStay }) {
  const next = TYPE_INFO[unlockedLevel] ?? { name: `Level ${unlockedLevel}`, desc: '' };
  const cur  = TYPE_INFO[currentLevel]  ?? { name: `Level ${currentLevel}`, desc: '' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 max-w-md text-center border-2 border-violet-300">
        <div className="text-5xl mb-2">🔓</div>
        <p className="text-xs font-semibold tracking-widest text-violet-500 uppercase mb-1">New question type unlocked</p>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{next.name}</h2>
        <p className="text-sm text-gray-500 mb-6">{next.desc}</p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onAdvance}
            className="px-6 py-2.5 bg-violet-600 text-white rounded-full font-semibold hover:bg-violet-700 transition-colors"
          >
            Try {next.name} now →
          </button>
          <button
            onClick={onStay}
            className="px-6 py-2 text-gray-500 rounded-full font-medium hover:bg-gray-100 transition-colors"
          >
            Keep practicing {cur.name}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-4">You can level up any time from the 🔓 button.</p>
      </div>
    </div>
  );
}
