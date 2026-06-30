export default function SessionSummaryOverlay({ questionsCompleted, perfectCount, totalXp, onContinue }) {
  const stars = perfectCount === questionsCompleted && questionsCompleted > 0 ? 3
              : perfectCount >= Math.ceil(questionsCompleted / 2) ? 2
              : 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 text-center shadow-2xl max-w-sm w-full mx-4 animate-[fadeInUp_0.3s_ease-out]">

        <div className="text-4xl mb-3 tracking-wide">
          {'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}
        </div>

        <h2 className="text-2xl font-black text-gray-800 mb-1">Session Complete!</h2>
        <p className="text-gray-400 text-sm mb-6">
          {perfectCount === questionsCompleted
            ? 'Flawless — you nailed every question!'
            : perfectCount === 0
            ? 'Keep practising — you\'ll get there!'
            : 'Good work! A few more reps and you\'ll have it.'}
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-indigo-50 rounded-xl p-4">
            <div className="text-2xl font-black text-indigo-700">
              {perfectCount}<span className="text-indigo-400 text-lg font-semibold">/{questionsCompleted}</span>
            </div>
            <div className="text-xs text-indigo-500 font-medium mt-0.5">Perfect</div>
          </div>
          <div className="bg-violet-50 rounded-xl p-4">
            <div className="text-2xl font-black text-violet-700">+{totalXp}</div>
            <div className="text-xs text-violet-500 font-medium mt-0.5">XP Earned</div>
          </div>
        </div>

        <button
          onClick={onContinue}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-xl text-lg hover:opacity-90 transition-opacity"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
