import React, { useState, useEffect, useRef } from 'react';

/**
 * JeopardyChallenge
 *
 * Bonus round modal shown after a question completion when emotion = Bored.
 * Presents a single harder conceptual question with a 15-second countdown.
 * Awards BONUS_XP on correct answer; 0 on timeout or wrong answer.
 *
 * Props:
 *   onComplete(bonusXp: number) — called when the round ends
 */

export const JEOPARDY_BONUS_XP = 50;
const TIMER_SECS = 15;

const BANK = [
  {
    category: 'Time Complexity',
    question: 'What is the time complexity of inserting at the HEAD of a singly linked list?',
    options: ['O(n)', 'O(log n)', 'O(1)', 'O(n²)'],
    correct: 2,
    explanation: 'Only 2 pointer updates needed — head always takes constant time regardless of list length.',
  },
  {
    category: 'Pointer Order',
    question: 'When inserting at head, you MUST do one thing before `head = newNode`. What is it?',
    options: [
      'free(head)',
      'newNode.next = head',
      'head = NULL',
      'traverse to the last node',
    ],
    correct: 1,
    explanation: 'Link newNode to the old head first. If you overwrite head first, the entire list is lost forever.',
  },
  {
    category: 'Edge Cases',
    question: 'When removing the tail from a list, what loop condition finds the second-to-last node?',
    options: [
      'while (node == NULL)',
      'while (node.next == NULL)',
      'while (node.next.next != NULL)',
      'while (node.value != 0)',
    ],
    correct: 2,
    explanation: 'Stop when node.next.next is NULL — that means node.next is the tail you want to remove.',
  },
  {
    category: 'Memory Safety',
    question: 'In C, what goes wrong if you do `head = head.next` WITHOUT saving the old head first?',
    options: [
      'Nothing — garbage collector handles it',
      'The program crashes immediately',
      'Memory leak — old node is unreachable but never freed',
      'head becomes NULL',
    ],
    correct: 2,
    explanation: 'Without temp = head first, you lose the reference and cannot call free() — classic memory leak.',
  },
  {
    category: 'Traversal',
    question: 'To insert at position k, how many times do you advance the pointer from head?',
    options: ['k times', 'k-1 times', 'k+1 times', 'Until node == NULL'],
    correct: 0,
    explanation: 'Advance k times to reach the node AT index k, then link newNode between it and its predecessor.',
  },
  {
    category: 'Big-O',
    question: 'What is the time complexity of finding the kth element in a singly linked list?',
    options: ['O(1)', 'O(log n)', 'O(k)', 'O(n²)'],
    correct: 2,
    explanation: 'You traverse exactly k steps from head, so the cost scales linearly with k — O(k).',
  },
  {
    category: 'Null Checks',
    question: 'When should you check if `head == NULL` before an operation?',
    options: [
      'Never — the list is always initialised',
      'Only for remove operations on a potentially empty list',
      'Only for insert operations',
      'Always for both insert and remove to handle edge cases',
    ],
    correct: 3,
    explanation: 'Both insert-into-empty and remove-from-empty are valid edge cases that require a null check.',
  },
  {
    category: 'Cycle Detection',
    question: 'Floyd\'s cycle detection (fast/slow pointers) runs in what time and space complexity?',
    options: ['O(n) time, O(n) space', 'O(n) time, O(1) space', 'O(n²) time, O(1) space', 'O(log n) time, O(1) space'],
    correct: 1,
    explanation: 'Two pointers — slow moves 1 step, fast moves 2. They meet in O(n) time and need no extra space.',
  },
];

export default function JeopardyChallenge({ onComplete }) {
  const [question] = useState(() => BANK[Math.floor(Math.random() * BANK.length)]);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECS);
  const [selected, setSelected] = useState(null);  // index or null
  const [timedOut, setTimedOut] = useState(false);
  const intervalRef = useRef(null);
  const doneRef = useRef(false);  // prevent double-fire

  // Countdown
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setTimedOut(true);
          if (!doneRef.current) {
            doneRef.current = true;
            setTimeout(() => onComplete(0), 2400);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []); // eslint-disable-line

  const handleSelect = (idx) => {
    if (selected !== null || timedOut) return;
    clearInterval(intervalRef.current);
    setSelected(idx);
    if (!doneRef.current) {
      doneRef.current = true;
      const bonus = idx === question.correct ? JEOPARDY_BONUS_XP : 0;
      setTimeout(() => onComplete(bonus), 2400);
    }
  };

  const isAnswered  = selected !== null || timedOut;
  const isCorrect   = selected !== null && selected === question.correct;
  const timerPct    = (timeLeft / TIMER_SECS) * 100;
  const timerColor  = timeLeft > 8 ? '#10B981' : timeLeft > 4 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 560,
        background: 'linear-gradient(160deg, #1E1B4B 0%, #312E81 100%)',
        borderRadius: 24,
        border: '2px solid rgba(245,158,11,0.5)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
        overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #F59E0B, #D97706)',
          padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ color: '#1E1B4B', fontSize: 11, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', margin: 0 }}>
              ⚡ Bonus Round
            </p>
            <p style={{ color: '#1E1B4B', fontSize: 15, fontWeight: 700, margin: '3px 0 0' }}>
              {question.category}
            </p>
          </div>
          <div style={{
            background: 'rgba(0,0,0,0.18)',
            borderRadius: 12, padding: '6px 18px', textAlign: 'center',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, margin: 0 }}>CORRECT ANSWER</p>
            <p style={{ color: 'white', fontSize: 22, fontWeight: 900, margin: 0 }}>
              +{JEOPARDY_BONUS_XP} XP
            </p>
          </div>
        </div>

        {/* ── Timer bar ── */}
        <div style={{ height: 5, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{
            height: '100%', width: `${timerPct}%`,
            background: timerColor,
            transition: 'width 1s linear, background 0.3s',
          }} />
        </div>

        <div style={{ padding: '22px 26px 28px' }}>

          {/* Timer counter */}
          {!isAnswered && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Time remaining</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: timerColor, minWidth: 36 }}>{timeLeft}s</span>
            </div>
          )}

          {/* Question */}
          <p style={{ color: 'white', fontSize: 18, fontWeight: 700, lineHeight: 1.5, marginBottom: 22 }}>
            {question.question}
          </p>

          {/* Options */}
          {!timedOut ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {question.options.map((opt, i) => {
                const label = String.fromCharCode(65 + i);
                const isSel = selected === i;
                const isRightAnswer = i === question.correct;

                let bg     = 'rgba(255,255,255,0.07)';
                let border = 'rgba(255,255,255,0.14)';
                let color  = 'rgba(255,255,255,0.9)';

                if (isAnswered) {
                  if (isRightAnswer)       { bg = 'rgba(16,185,129,0.22)';  border = '#10B981'; }
                  else if (isSel)          { bg = 'rgba(239,68,68,0.18)';   border = '#EF4444'; color = 'rgba(255,255,255,0.65)'; }
                  else                     { bg = 'rgba(255,255,255,0.03)'; border = 'rgba(255,255,255,0.07)'; color = 'rgba(255,255,255,0.35)'; }
                }

                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(i)}
                    disabled={isAnswered}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: bg, border: `1.5px solid ${border}`,
                      borderRadius: 12, padding: '11px 16px',
                      cursor: isAnswered ? 'default' : 'pointer',
                      color, fontSize: 14.5, display: 'flex', gap: 12, alignItems: 'center',
                      transition: 'all 0.14s', outline: 'none',
                    }}
                    onMouseEnter={e => { if (!isAnswered) e.currentTarget.style.background = 'rgba(255,255,255,0.13)'; }}
                    onMouseLeave={e => { if (!isAnswered) e.currentTarget.style.background = bg; }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: isAnswered && isRightAnswer ? '#10B981'
                                : isAnswered && isSel && !isRightAnswer ? '#EF4444'
                                : 'rgba(255,255,255,0.14)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: 'white',
                    }}>
                      {isAnswered && isRightAnswer ? '✓'
                        : isAnswered && isSel && !isRightAnswer ? '✗'
                        : label}
                    </span>
                    <span style={{ fontWeight: isAnswered && isRightAnswer ? 700 : 500 }}>{opt}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: 42, marginBottom: 10 }}>⏰</p>
              <p style={{ color: '#EF4444', fontSize: 22, fontWeight: 800 }}>Time's up!</p>
            </div>
          )}

          {/* Result explanation */}
          {isAnswered && (
            <div style={{
              marginTop: 18,
              background: isCorrect ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.1)',
              border: `1.5px solid ${isCorrect ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 12, padding: '14px 16px',
            }}>
              <p style={{ color: isCorrect ? '#10B981' : '#F87171', fontWeight: 800, fontSize: 15, margin: '0 0 6px' }}>
                {timedOut ? "⏰ Out of time — no bonus"
                  : isCorrect ? `✅ Correct! +${JEOPARDY_BONUS_XP} Bonus XP awarded`
                  : '❌ Incorrect — no bonus XP'}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                {question.explanation}
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
