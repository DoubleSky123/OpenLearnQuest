export default function ModePickScreen({
  moduleId, xp, username, onSelectMode, onBack, onMistakeBook, onDailyChallenge, onLogout
}) {
  const moduleName = moduleId === 'doubly' ? 'Doubly Linked List' : 'Singly Linked List';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-6">

      {/* Header bar */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-10">
        <button onClick={onBack} className="text-white/50 hover:text-white transition-colors text-sm">
          ← Back
        </button>
        <div className="flex items-center gap-4">
          <span className="text-amber-400 font-bold text-sm">⭐ {xp} XP</span>
          <span className="text-white/60 text-sm">{username}</span>
          <button onClick={onLogout} className="text-white/30 hover:text-white/60 text-xs transition-colors">
            Logout
          </button>
        </div>
      </div>

      <h1 className="text-3xl font-black text-white mb-1">{moduleName}</h1>
      <p className="text-white/50 text-sm mb-10">Choose how you want to practice</p>

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl mb-8">
        {/* Regular Mode */}
        <button
          onClick={() => onSelectMode('regular')}
          className="group bg-white/10 hover:bg-indigo-500/30 border border-white/20 hover:border-indigo-400/60 rounded-2xl p-7 text-left transition-all duration-200 shadow-lg"
        >
          <div className="text-4xl mb-3">📚</div>
          <h2 className="text-xl font-bold text-white mb-1">Regular Mode</h2>
          <p className="text-white/60 text-sm leading-relaxed">
            All questions across 3 difficulty levels. Take your time, get AI hints, and build mastery.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {['No time pressure', '3 levels', 'AI hints'].map(tag => (
              <span key={tag} className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-400/30">
                {tag}
              </span>
            ))}
          </div>
        </button>

        {/* Challenge Mode */}
        <button
          onClick={() => onSelectMode('challenge')}
          className="group bg-white/10 hover:bg-violet-500/30 border border-white/20 hover:border-violet-400/60 rounded-2xl p-7 text-left transition-all duration-200 shadow-lg"
        >
          <div className="text-4xl mb-3">⚔️</div>
          <h2 className="text-xl font-bold text-white mb-1">Challenge Mode</h2>
          <p className="text-white/60 text-sm leading-relaxed">
            Timed with 5 lives. Each wrong step costs a life. Every second counts.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {['Timed', '5 lives', 'High XP'].map(tag => (
              <span key={tag} className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full border border-violet-400/30">
                {tag}
              </span>
            ))}
          </div>
        </button>
      </div>

      {/* Secondary actions */}
      <div className="flex gap-4 flex-wrap justify-center">
        <button
          onClick={onMistakeBook}
          className="text-white/50 hover:text-white text-sm border border-white/20 hover:border-white/40 rounded-xl px-5 py-2.5 transition-all"
        >
          📖 Mistake Book
        </button>
        {onDailyChallenge && (
          <button
            onClick={onDailyChallenge}
            className="text-white/50 hover:text-white text-sm border border-white/20 hover:border-white/40 rounded-xl px-5 py-2.5 transition-all"
          >
            🗓️ Daily Challenge
          </button>
        )}
      </div>
    </div>
  );
}
