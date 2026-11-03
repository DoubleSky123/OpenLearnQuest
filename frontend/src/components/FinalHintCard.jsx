/**
 * Final hint (scaffold level 4): after the animation and the tutor, a student
 * who is still stuck can ask to see the answer for the step they are on. Closed
 * until they ask — showing it is their choice — and it covers one step only.
 */
export default function FinalHintCard({ hint, open, onOpen }) {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none mt-0.5">💡</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900 text-sm">Final hint</p>
          {!open ? (
            <>
              <p className="text-amber-800 text-sm mt-0.5">
                This one is tough, and you have kept at it. Want to see the answer for this step?
              </p>
              <button
                onClick={onOpen}
                className="mt-2 text-sm font-semibold bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors"
              >
                Show me this step
              </button>
            </>
          ) : (
            <>
              <p className="text-amber-800 text-sm mt-0.5">{hint.label}:</p>
              <pre className="mt-1 font-mono text-sm bg-white border border-amber-200 rounded-lg px-3 py-2 text-gray-800 whitespace-pre-wrap">
                {hint.answer}
              </pre>
              {hint.why && (
                <p className="text-amber-800 text-sm mt-2"><span className="font-semibold">Why: </span>{hint.why}</p>
              )}
              <p className="text-amber-700 text-xs mt-2">Put it in and keep going: the steps after this one are yours.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
