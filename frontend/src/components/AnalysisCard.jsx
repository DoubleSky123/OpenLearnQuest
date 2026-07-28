/**
 * Post-question analysis panel — the unified feedback surface after a pass.
 *
 * NON-BLOCKING by design (LC-style): floats bottom-left so the student can
 * keep reviewing the board; opened via the 📊 Analysis button in the pass
 * strip, mirrored by the tutor panel bottom-right. Never a modal.
 *
 * Information architecture borrowed from LeetCode's AI Analysis:
 *   verdict banner → status chips → labeled sections (Concept / Speed) →
 *   one "Consider" extension question wired into the tutor.
 *
 * `analysis` (from gameMasterApi.recordResult) may arrive a beat after the
 * panel opens — sections render progressively; verdict/chips never wait.
 */
const CONCEPT_LABELS = {
  pointer_assignment: 'Pointer assignment',
  node_creation:      'Node creation',
  traversal:          'Traversal',
  memory_management:  'Memory management',
  list_structure:     'List structure',
};

function MasteryDelta({ concept, before, after }) {
  const up = after > before + 0.001;
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-gray-500">{CONCEPT_LABELS[concept] ?? concept}</span>
      <span className="font-mono text-gray-400">
        {before != null ? before.toFixed(2) : '—'} → <span className={up ? 'text-emerald-600 font-semibold' : 'text-gray-600'}>{after.toFixed(2)}</span>
        {up && <span className="text-emerald-500 ml-1">▲</span>}
      </span>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div className="px-6 py-3.5 border-t border-gray-100">
      <p className="text-[11px] font-bold tracking-widest uppercase text-gray-400 mb-1.5 flex items-center gap-1.5">
        <span className="text-sm">{icon}</span>{title}
      </p>
      {children}
    </div>
  );
}

export default function AnalysisCard({
  q,                     // current question (title, operation, consider)
  errorCount,
  timeMs,
  xpGained,
  questionNumber,
  plannedQuestions,
  analysis,              // { concepts_exercised, peer, concept_mastery } | null while loading
  masteryDelta,          // [{ concept, before, after }] | null
  isCompetitive = false,
  livesArr = [],
  onClose,
  onAskTutor,
}) {
  const perfect = errorCount === 0;
  const secs = Math.max(1, Math.round(timeMs / 1000));
  const peer = analysis?.peer;

  return (
    // full-width fixed strip + mirrored content container (max-w-7xl mx-auto px-5)
    // so the panel's left edge aligns with the question board at any viewport
    // width; pointer-events pass through the empty part of the strip
    <div className="fixed bottom-6 inset-x-0 z-40 pointer-events-none">
      <div className="max-w-7xl mx-auto px-5">
        <div className="w-96 max-h-[80vh] overflow-y-auto pointer-events-auto bg-white rounded-2xl shadow-2xl border border-gray-200">

        {/* Verdict banner */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-2xl font-black text-emerald-600">Passed ✓</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Question {questionNumber} / {plannedQuestions}</span>
              <button
                onClick={onClose}
                className="text-gray-300 hover:text-gray-500 text-xl leading-none w-6 h-6 flex items-center justify-center"
              >
                ×
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{q.title}</p>

          {/* Status chips */}
          <div className="flex gap-2 mt-3 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              perfect ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {perfect ? '✓ First try' : `${errorCount} ${errorCount === 1 ? 'retry' : 'retries'}`}
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
              🕐 {secs}s
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
              +{xpGained} XP
            </span>
          </div>
          {isCompetitive && livesArr.length > 0 && (
            <div className="flex gap-1 mt-2">
              {livesArr.map((alive, i) => (
                <span key={i} className={`text-sm ${alive ? '' : 'opacity-20'}`}>❤️</span>
              ))}
            </div>
          )}
        </div>

        {/* Concept */}
        {masteryDelta && masteryDelta.length > 0 && (
          <Section icon="🧠" title="Concept">
            {masteryDelta.map(d => <MasteryDelta key={d.concept} {...d} />)}
          </Section>
        )}

        {/* Speed (peer percentile — hidden until enough classmates have data) */}
        {peer && (
          <Section icon="⚡" title="Speed">
            <p className="text-sm text-gray-700">
              Beats <span className="font-bold text-emerald-600">{peer.beats_pct}%</span> of
              classmates on this operation
              <span className="text-xs text-gray-400 ml-1.5">({peer.sample} attempts)</span>
            </p>
          </Section>
        )}

        {/* Consider — extension question, seeds the tutor */}
        {q.consider && (
          <Section icon="💭" title="Consider">
            <div className="bg-violet-50 border border-violet-100 rounded-xl px-3.5 py-2.5">
              <p className="text-sm text-violet-900 leading-relaxed">{q.consider}</p>
              <button
                onClick={onAskTutor}
                className="mt-1.5 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
              >
                Ask the tutor →
              </button>
            </div>
          </Section>
        )}

          <div className="pb-2" />
        </div>
      </div>
    </div>
  );
}
