import { useState, useEffect, useMemo } from 'react';
import { LinkedListVisualiser } from './GoalPattern';
import { getCurrentPattern } from '../utils/helpers';
import { executeLinkedListOperation } from '../services/linkedListOperations';
import { computeStepStates } from '../services/fillBlankSteps';
import { AnimNode, Arrow } from './LinkedListHintAnimation';

/**
 * Fill-in-the-blank game board.
 * As the student fills each step, the linked list animates that step's effect
 * (per-step states from computeStepStates). For operations we don't model, it
 * falls back to executing the whole operation once at the end.
 *
 * Props:
 *   question       – question object with pseudocode, blanks, initialNodes, goalPattern
 *   onComplete(errorCount) – called when all blanks are correctly filled
 *   onError()      – called each time a wrong option is chosen
 */
export default function FillBlankBoard({ question, onComplete, onError }) {
  const [filled,   setFilled]   = useState(() => question.blanks.map(() => null));
  const [errorIdx, setErrorIdx] = useState(null);   // line index with current error
  const [nodes,    setNodes]    = useState(question.initialNodes ?? []);   // fallback path only
  const [executed, setExecuted] = useState(false);
  const [errors,   setErrors]   = useState(0);

  // Reset when question changes
  useEffect(() => {
    setFilled(question.blanks.map(() => null));
    setErrorIdx(null);
    setNodes(question.initialNodes ?? []);
    setExecuted(false);
    setErrors(0);
  }, [question.id]); // eslint-disable-line

  // blanks may cover only a subset of pseudocode lines (easier difficulty).
  const blankByLine = useMemo(() => {
    const m = {};
    question.blanks.forEach((b, idx) => { m[b.line ?? idx] = { ...b, idx }; });
    return m;
  }, [question.blanks]);

  const initialValues = getCurrentPattern(question.initialNodes ?? []);
  // Per-step list states (null ⇒ operation not modelled ⇒ fall back to end-execution)
  const stepStates = computeStepStates(
    question.operation, initialValues, question.operationValue, question.operationPosition,
  );

  const activeIdx = filled.findIndex(f => f === null);
  const allFilled = activeIdx === -1;

  // How many pseudocode lines are fully resolved (pre-given lines + filled blanks), in order.
  let completedSteps = 0;
  for (let i = 0; i < question.pseudocode.length; i++) {
    const b = blankByLine[i];
    if (b && filled[b.idx] === null) break;
    completedSteps++;
  }

  // When all blanks filled → (fallback) execute; then signal completion.
  useEffect(() => {
    if (!allFilled || executed) return;
    setExecuted(true);
    setTimeout(() => {
      if (!stepStates) {
        try {
          const r = executeLinkedListOperation(
            question.operation,
            question.initialNodes ?? [],
            question.operationValue,
            question.operationPosition,
          );
          setNodes(r.nodes);
        } catch { /* visual-only; ignore */ }
      }
      setTimeout(() => onComplete(errors), 700);
    }, 400);
  }, [allFilled, executed]); // eslint-disable-line

  const handleOption = (lineIdx, word) => {
    const blank = blankByLine[lineIdx];
    if (!blank) return;
    if (word === blank.answer) {
      setErrorIdx(null);
      setFilled(prev => {
        const next = [...prev];
        next[blank.idx] = word;
        return next;
      });
    } else {
      setErrorIdx(lineIdx);
      setErrors(errors + 1);
      onError();
    }
  };

  const isCorrect = allFilled && executed;

  // ── Current animated state (step-states path) ──────────────────────────────
  const curState = stepStates
    ? (completedSteps > 0
        ? stepStates[Math.min(completedSteps - 1, stepStates.length - 1)]
        : { values: initialValues, cursor: null, hi: null, note: 'Initial list' })
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Pseudocode lines */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">
          Fill in each blank
        </p>
        <div className="flex flex-col gap-2">
          {question.pseudocode.map((step, lineIdx) => {
            const blank      = blankByLine[lineIdx];
            const filledWord = blank ? filled[blank.idx] : null;
            const isActive   = blank ? blank.idx === activeIdx : false;
            const isDone     = filledWord !== null;
            const hasError   = errorIdx === lineIdx;
            const parts      = step.split('___');

            return (
              <div key={lineIdx}>
                <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-sm transition-all border ${
                  isDone    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  isActive  ? 'bg-violet-50 border-violet-300 text-gray-800' :
                  hasError  ? 'bg-red-50 border-red-200 text-gray-500' :
                              'bg-gray-50 border-gray-100 text-gray-400'
                }`}>
                  <span className="text-gray-300 text-xs w-4 shrink-0">{lineIdx + 1}</span>
                  {parts.length === 2 ? (
                    <>
                      <span>{parts[0]}</span>
                      {filledWord ? (
                        <span className="bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-semibold">
                          {filledWord}
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded border-b-2 min-w-[3rem] text-center ${
                          isActive ? 'border-violet-400 animate-pulse bg-violet-100' : 'border-gray-300 bg-gray-100'
                        }`}>
                          ___
                        </span>
                      )}
                      <span>{parts[1]}</span>
                    </>
                  ) : (
                    <span>{step}</span>
                  )}
                </div>

                {isActive && !isDone && (
                  <div className="flex flex-wrap gap-2 mt-1.5 ml-6">
                    {blank.options.map(opt => (
                      <button
                        key={opt}
                        onClick={() => handleOption(lineIdx, opt)}
                        className="px-3 py-1 bg-white border-2 border-violet-300 text-violet-700 rounded-lg text-sm font-mono font-semibold hover:bg-violet-50 hover:border-violet-500 transition-all"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {hasError && (
                  <p className="text-red-500 text-xs ml-6 mt-1">
                    Not quite — think about what variable belongs here.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* List state */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-gray-400 text-xs font-medium mb-1">
          {isCorrect ? 'Result' : 'Current state'}
        </p>

        {curState ? (
          <>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 min-h-[88px] flex items-center overflow-x-auto">
              {curState.values.length === 0 ? (
                <div className="flex items-center gap-2 text-gray-400 italic text-sm">
                  <span className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-xs">∅</span>
                  Empty list
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-nowrap">
                  {curState.values.map((val, i) => (
                    <span key={val} className="flex items-center gap-1">
                      <AnimNode
                        v={val}
                        show
                        color={curState.hi && curState.hi.value === val ? curState.hi.kind : 'normal'}
                        isCursor={curState.cursor === i}
                        isHead={i === 0}
                      />
                      {i < curState.values.length - 1 && <Arrow />}
                    </span>
                  ))}
                  <span className="text-gray-400 text-xs ml-1">→ null</span>
                </div>
              )}
            </div>
            <p className="text-sm text-indigo-600 font-medium text-center mt-2 min-h-[20px]">{curState.note}</p>
          </>
        ) : (
          <LinkedListVisualiser
            values={getCurrentPattern(nodes)}
            emptyLabel="Empty list"
            highlight={isCorrect}
            goalValues={question.goalPattern}
          />
        )}
      </div>
    </div>
  );
}
