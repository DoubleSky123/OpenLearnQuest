import React from 'react';

export default function FeedbackMessage({ feedback }) {
  if (!feedback) return null;
  const isSuccess = feedback.type === 'complete' || feedback.type === 'success';

  return (
    <div className={`mb-5 rounded-xl p-5 border-l-4 ${
      isSuccess
        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
        : 'bg-red-50 border-red-400 text-red-800'
    }`}>
      <p className="font-semibold text-base mb-1">{feedback.message}</p>

      {isSuccess && feedback.successMessage && (
        <p className="text-emerald-700 text-sm">{feedback.successMessage}</p>
      )}

      {!isSuccess && feedback.errors && (
        <div className="mt-3 space-y-3">
          {feedback.errors.category && (
            <span className="inline-block px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
              {feedback.errors.category}
            </span>
          )}

          {feedback.errors.explanation && (
            <div className="bg-red-100 rounded-lg p-3">
              <p className="font-semibold text-sm mb-1">What went wrong</p>
              <p className="text-sm text-red-700">{feedback.errors.explanation}</p>
            </div>
          )}

          {feedback.errors.reasoning && (
            <div className="bg-red-100 rounded-lg p-3">
              <p className="font-semibold text-sm mb-1">Why this matters</p>
              <p className="text-sm text-red-700">{feedback.errors.reasoning}</p>
            </div>
          )}

          {feedback.errors.keyPoint && (
            <div className="bg-amber-50 border-l-2 border-amber-400 rounded-lg p-3">
              <p className="font-semibold text-sm text-amber-800 mb-1">Key concept</p>
              <p className="text-sm text-amber-700">{feedback.errors.keyPoint}</p>
            </div>
          )}

          {feedback.errors.correctApproach && (
            <div className="bg-emerald-50 border-l-2 border-emerald-400 rounded-lg p-3">
              <p className="font-semibold text-sm text-emerald-800 mb-1">Correct approach</p>
              <p className="text-sm text-emerald-700">{feedback.errors.correctApproach}</p>
            </div>
          )}

          {feedback.errors.correctSequence && (
            <div className="bg-emerald-50 border-l-2 border-emerald-400 rounded-lg p-3">
              <p className="font-semibold text-sm text-emerald-800 mb-1">Correct sequence</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-emerald-700">
                {feedback.errors.correctSequence.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {feedback.errors.analogy && (
            <div className="bg-violet-50 border-l-2 border-violet-400 rounded-lg p-3">
              <p className="font-semibold text-sm text-violet-800 mb-1">Think of it this way</p>
              <p className="text-sm text-violet-700 italic">{feedback.errors.analogy}</p>
            </div>
          )}

          {feedback.errors.hint && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mt-2">
              <p className="font-semibold text-sm text-violet-700 mb-1">Hint</p>
              <p className="text-sm text-violet-600">{feedback.errors.hint}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
