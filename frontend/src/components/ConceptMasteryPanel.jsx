const CONCEPTS = [
  { key: "pointer_assignment", label: "Pointers" },
  { key: "traversal",          label: "Traversal" },
  { key: "node_creation",      label: "Node Creation" },
  { key: "memory_management",  label: "Memory" },
  { key: "list_structure",     label: "List Structure" },
];

function barColor(score) {
  if (score >= 0.7) return "bg-emerald-500";
  if (score >= 0.4) return "bg-amber-400";
  return "bg-red-400";
}

function labelColor(score) {
  if (score >= 0.7) return "text-emerald-600";
  if (score >= 0.4) return "text-amber-600";
  return "text-red-500";
}

export default function ConceptMasteryPanel({ conceptMastery = {} }) {
  const hasData = Object.keys(conceptMastery).length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <p className="text-xs font-semibold text-gray-500 mb-2.5 uppercase tracking-wide">
        Concept Mastery
      </p>

      {!hasData ? (
        <p className="text-xs text-gray-400 text-center py-2">
          Complete a question to track progress
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {CONCEPTS.map(({ key, label }) => {
            const score = conceptMastery[key] ?? 0;
            const pct   = Math.round(score * 100);
            return (
              <div key={key}>
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-xs text-gray-600">{label}</span>
                  <span className={`text-xs font-semibold tabular-nums ${labelColor(score)}`}>
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor(score)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
