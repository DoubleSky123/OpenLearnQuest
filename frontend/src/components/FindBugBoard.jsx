import { useState, useEffect } from 'react';
import { LinkedListVisualiser } from './GoalPattern';
import { getCurrentPattern } from '../utils/helpers';
import { executeLinkedListOperation } from '../services/linkedListOperations';

/**
 * Find-the-bug game board.
 * Phase 1: Student clicks the buggy line.
 * Phase 2: Student selects the correct fix from options.
 * Props same as FillBlankBoard.
 */
export default function FindBugBoard({ question, onComplete, onError }) {
  const [phase,       setPhase]       = useState('identify');  // 'identify' | 'fix' | 'done'
  const [selectedLine, setSelectedLine] = useState(null);
  const [wrongLine,   setWrongLine]   = useState(null);
  const [wrongFix,    setWrongFix]    = useState(null);
  const [nodes,       setNodes]       = useState(question.initialNodes ?? []);
  const [errors,      setErrors]      = useState(0);

  useEffect(() => {
    setPhase('identify');
    setSelectedLine(null);
    setWrongLine(null);
    setWrongFix(null);
    setNodes(question.initialNodes ?? []);
    setErrors(0);
  }, [question.id]); // eslint-disable-line

  const handleLineClick = (lineIdx) => {
    if (phase !== 'identify') return;
    if (lineIdx === question.bug_line) {
      setSelectedLine(lineIdx);
      setWrongLine(null);
      setPhase('fix');
    } else {
      setWrongLine(lineIdx);
      const next = errors + 1;
      setErrors(next);
      onError();
    }
  };

  const handleFixChoice = (fix) => {
    if (phase !== 'fix') return;
    if (fix === question.fix) {
      setWrongFix(null);
      setPhase('done');
      // Execute correct operation to show result
      setTimeout(() => {
        try {
          const r = executeLinkedListOperation(
            question.operation,
            question.initialNodes ?? [],
            question.operationValue,
            question.operationPosition,
          );
          setNodes(r.nodes);
        } catch (_) {}
        setTimeout(() => onComplete(errors), 600);
      }, 400);
    } else {
      setWrongFix(fix);
      const next = errors + 1;
      setErrors(next);
      onError();
    }
  };

  const currentPattern = getCurrentPattern(nodes);
  const isDone         = phase === 'done';

  return (
    <div className="flex flex-col gap-4">
      {/* Phase instructions */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
        <p className="text-amber-800 text-sm font-semibold">
          {phase === 'identify' && '🐛 Click the line that contains the bug'}
          {phase === 'fix'      && '🔧 Now choose the correct fix for line ' + (selectedLine + 1)}
          {phase === 'done'     && '✅ Bug found and fixed!'}
        </p>
      </div>

      {/* Pseudocode */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col gap-1.5">
          {question.pseudocode.map((step, lineIdx) => {
            const isBugLine    = lineIdx === question.bug_line;
            const isSelected   = lineIdx === selectedLine;
            const isWrong      = lineIdx === wrongLine;
            const isClickable  = phase === 'identify';

            let lineClass = 'bg-gray-50 border-gray-100 text-gray-700';
            if (isDone && isBugLine) {
              lineClass = 'bg-emerald-50 border-emerald-300 text-emerald-800';
            } else if (isSelected) {
              lineClass = 'bg-violet-50 border-violet-300 text-violet-800';
            } else if (isWrong) {
              lineClass = 'bg-red-50 border-red-200 text-red-700';
            } else if (isClickable) {
              lineClass = 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-violet-50 hover:border-violet-300 cursor-pointer';
            }

            return (
              <div key={lineIdx}>
                <div
                  onClick={() => handleLineClick(lineIdx)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-sm border transition-all ${lineClass}`}
                >
                  <span className="text-gray-300 text-xs w-4 shrink-0">{lineIdx + 1}</span>
                  <span className="flex-1">{step}</span>
                  {isDone && isBugLine && <span className="text-emerald-600 text-xs font-sans">← fixed</span>}
                  {isWrong && <span className="text-red-500 text-xs font-sans">← not here</span>}
                </div>
                {isWrong && (
                  <p className="text-red-400 text-xs ml-6 mt-0.5">
                    Look more carefully — think about what result each step produces.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Fix options (phase 2) */}
      {phase === 'fix' && (
        <div className="bg-white rounded-xl border border-violet-200 p-4">
          <p className="text-xs font-semibold text-violet-600 mb-3">
            What should line {selectedLine + 1} say?
          </p>
          <div className="flex flex-col gap-2">
            {question.options.map(opt => (
              <button
                key={opt}
                onClick={() => handleFixChoice(opt)}
                className={`px-3 py-2 rounded-lg border font-mono text-sm text-left transition-all ${
                  wrongFix === opt
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-violet-400 hover:bg-violet-50'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {wrongFix && (
            <p className="text-red-400 text-xs mt-2">
              That's not right — think about what pointer gets lost with the buggy version.
            </p>
          )}
        </div>
      )}

      {/* Bug explanation (after done) */}
      {isDone && (
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <p className="text-xs font-semibold text-emerald-600 mb-1">Why was this a bug?</p>
          <p className="text-emerald-800 text-sm">{question.bug_explanation}</p>
        </div>
      )}

      {/* List state */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-gray-400 text-xs font-medium mb-1">
          {isDone ? 'Correct result' : 'Current state'}
        </p>
        <LinkedListVisualiser
          values={currentPattern}
          emptyLabel="Empty list"
          highlight={isDone}
          goalValues={question.goalPattern}
        />
      </div>
    </div>
  );
}
