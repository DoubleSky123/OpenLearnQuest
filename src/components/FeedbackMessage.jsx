import React from 'react';

/**
 * Enhanced feedback message component with educational details
 * Hint is placed at the bottom for better visibility
 */
export default function FeedbackMessage({ feedback }) {
  if (!feedback) return null;
  
  const isSuccess = feedback.type === 'complete' || feedback.type === 'success';
  const isError = !isSuccess;
  
  return (
    <div className={`mb-6 rounded-lg p-6 border-l-4 ${
      isSuccess
        ? 'bg-green-900 border-green-500 text-green-100'
        : 'bg-red-900 border-red-500 text-red-100'
    }`}>
      {/* Main message */}
      <p className="font-bold text-lg mb-2">{feedback.message}</p>
      
      {/* Success message */}
      {isSuccess && feedback.successMessage && (
        <p className="text-green-200">{feedback.successMessage}</p>
      )}
      
      {/* Error details */}
      {isError && feedback.errors && (
        <div className="mt-4 space-y-4">
          {/* Category tag */}
          {feedback.errors.category && (
            <div className="inline-block px-3 py-1 bg-red-800 rounded-full text-sm font-semibold">
              {feedback.errors.category}
            </div>
          )}
          
          {/* Explanation */}
          {feedback.errors.explanation && (
            <div className="bg-red-800 bg-opacity-50 p-4 rounded-lg">
              <p className="font-semibold mb-2">🔍 What went wrong:</p>
              <p className="text-red-100">{feedback.errors.explanation}</p>
            </div>
          )}
          
          {/* Reasoning */}
          {feedback.errors.reasoning && (
            <div className="bg-red-800 bg-opacity-50 p-4 rounded-lg">
              <p className="font-semibold mb-2">💡 Why this matters:</p>
              <p className="text-red-100">{feedback.errors.reasoning}</p>
            </div>
          )}
          
          {/* Analogy */}
          {feedback.errors.analogy && (
            <div className="bg-purple-900 bg-opacity-30 p-4 rounded-lg border-l-2 border-purple-400">
              <p className="font-semibold mb-2">🌟 Think of it this way:</p>
              <p className="text-purple-100 italic">{feedback.errors.analogy}</p>
            </div>
          )}
          
          {/* Key point */}
          {feedback.errors.keyPoint && (
            <div className="bg-yellow-900 bg-opacity-30 p-4 rounded-lg border-l-2 border-yellow-400">
              <p className="font-semibold mb-2">🎯 Key Concept:</p>
              <p className="text-yellow-100 font-semibold">{feedback.errors.keyPoint}</p>
            </div>
          )}
          
          {/* Correct approach */}
          {feedback.errors.correctApproach && (
            <div className="bg-green-900 bg-opacity-30 p-4 rounded-lg border-l-2 border-green-400">
              <p className="font-semibold mb-2">✅ Correct Approach:</p>
              <p className="text-green-100">{feedback.errors.correctApproach}</p>
            </div>
          )}
          
          {/* Correct sequence (for temp variable errors) */}
          {feedback.errors.correctSequence && (
            <div className="bg-green-900 bg-opacity-30 p-4 rounded-lg border-l-2 border-green-400">
              <p className="font-semibold mb-2">✅ Correct Sequence:</p>
              <ol className="list-decimal list-inside space-y-1 text-green-100">
                {feedback.errors.correctSequence.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          
          {/* Comparison table (for semantic errors) */}
          {feedback.errors.comparison && (
            <div className="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
              <p className="font-semibold mb-3">📊 Operation Comparison:</p>
              <div className="space-y-2">
                {Object.entries(feedback.errors.comparison).map(([operation, pattern]) => (
                  <div key={operation} className="text-sm">
                    <span className="font-semibold text-blue-200">{operation}:</span>
                    <span className="text-blue-100 ml-2 font-mono">{pattern}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Wrong lines detail */}
          {feedback.errors.wrongLines && Array.isArray(feedback.errors.wrongLines) && (
            <div className="bg-red-800 bg-opacity-50 p-4 rounded-lg">
              <p className="font-semibold mb-2">❌ Incorrect Lines:</p>
              <ul className="space-y-2">
                {feedback.errors.wrongLines.map((line, idx) => (
                  <li key={idx} className="text-sm">
                    <span className="font-semibold">Line {line.position}:</span>
                    <br />
                    <span className="text-red-200">Your code: {line.yourCode}</span>
                    <br />
                    <span className="text-green-200">Should be: {line.shouldBe}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Wrong blocks (for distractor errors) */}
          {feedback.errors.wrongBlocks && (
            <div className="bg-red-800 bg-opacity-50 p-4 rounded-lg">
              <p className="font-semibold mb-2">❌ These blocks don't belong:</p>
              <ul className="list-disc list-inside space-y-1">
                {feedback.errors.wrongBlocks.map((block, idx) => (
                  <li key={idx} className="text-red-200">
                    Line {block.position}: <code className="bg-red-950 px-2 py-1 rounded">{block.code}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Complexity errors with educational feedback */}
          {feedback.errors.type === 'complexity' && feedback.errors.educationalFeedback && (
            <div className="space-y-4">
              <div className="bg-red-800 bg-opacity-50 p-4 rounded-lg">
                <p className="font-semibold mb-2">⏱️ Time Complexity Errors:</p>
                <ul className="space-y-2">
                  {feedback.errors.errors.map((error, idx) => (
                    <li key={idx} className="text-sm">
                      <span className="font-semibold">Line {error.line}:</span> <code className="bg-red-950 px-2 py-1 rounded text-xs">{error.code}</code>
                      <br />
                      <span className="text-red-200">You selected: {error.actual}</span>
                      <span className="text-green-200 ml-4">Correct: {error.expected}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Educational feedback for complexity errors */}
              {feedback.errors.educationalFeedback.map((fb, idx) => (
                <div key={idx} className="space-y-3">
                  <div className="inline-block px-3 py-1 bg-blue-800 rounded-full text-sm font-semibold">
                    {fb.category}
                  </div>
                  
                  <div className="bg-blue-900 bg-opacity-30 p-4 rounded-lg">
                    <p className="font-semibold mb-2">{fb.message}</p>
                    <p className="text-blue-100 mb-3">{fb.explanation}</p>
                    {fb.reasoning && (
                      <>
                        <p className="font-semibold mb-1">Why:</p>
                        <p className="text-blue-100 mb-3">{fb.reasoning}</p>
                      </>
                    )}
                    {fb.keyPoint && (
                      <div className="bg-yellow-900 bg-opacity-30 p-3 rounded border-l-2 border-yellow-400">
                        <p className="font-semibold text-yellow-100">{fb.keyPoint}</p>
                      </div>
                    )}
                    {fb.analogy && (
                      <div className="bg-purple-900 bg-opacity-30 p-3 rounded border-l-2 border-purple-400 mt-2">
                        <p className="text-purple-100 italic">{fb.analogy}</p>
                      </div>
                    )}
                    {fb.examples && (
                      <div className="mt-3 text-sm">
                        {Object.entries(fb.examples).map(([key, values]) => (
                          <div key={key} className="mb-2">
                            <span className="font-semibold text-blue-200">{key}:</span>
                            <ul className="list-disc list-inside ml-4 text-blue-100">
                              {values.map((val, i) => (
                                <li key={i} className="font-mono text-xs">{val}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                    {fb.comparison && (
                      <div className="mt-3 p-2 bg-blue-950 rounded text-sm font-mono">
                        {fb.comparison}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Suggested fix */}
          {feedback.errors.suggestedFix && (
            <div className="bg-green-900 bg-opacity-30 p-4 rounded-lg border-l-2 border-green-400">
              <p className="font-semibold mb-2">💡 Suggested Fix:</p>
              <p className="text-green-100">{feedback.errors.suggestedFix}</p>
            </div>
          )}
          
          {/* Count information (for too many blocks) */}
          {feedback.errors.count && (
            <div className="bg-red-800 bg-opacity-50 p-3 rounded-lg">
              <p className="text-sm text-red-200">
                Needed: {feedback.errors.count.needed} blocks | Current: {feedback.errors.count.current} blocks
              </p>
            </div>
          )}
          
          {/* 👇 Hint moved to the BOTTOM for better visibility */}
          {feedback.errors.hint && (
            <div className="bg-blue-900 bg-opacity-50 p-4 rounded-lg border-2 border-blue-400 mt-6">
              <p className="font-semibold mb-2 text-blue-200">💭 Hint:</p>
              <p className="text-blue-100 text-base">{feedback.errors.hint}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
