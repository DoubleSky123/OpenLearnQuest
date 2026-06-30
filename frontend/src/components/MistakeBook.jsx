import React, { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { progressApi } from '../services/api';

const SOURCE_META = {
  quiz:      { label: 'Quiz',     color: '#7C3AED', bg: 'rgba(124,58,237,0.1)',  border: 'rgba(124,58,237,0.3)'  },
  daily:     { label: 'Daily',    color: '#D97706', bg: 'rgba(217,119,6,0.1)',   border: 'rgba(217,119,6,0.3)'   },
  tutorial:  { label: 'Tutorial', color: '#059669', bg: 'rgba(5,150,105,0.1)',   border: 'rgba(5,150,105,0.3)'   },
  training:  { label: 'Training', color: '#B45309', bg: 'rgba(180,83,9,0.1)',    border: 'rgba(180,83,9,0.3)'    },
  challenge: { label: 'Challenge',color: '#6D28D9', bg: 'rgba(109,40,217,0.1)',  border: 'rgba(109,40,217,0.3)'  },
};

const FILTERS = ['all', 'quiz', 'daily', 'tutorial', 'training', 'challenge'];

function formatDate(ts) {
  const d = new Date(typeof ts === 'number' ? ts : ts + 'Z');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MistakeBook({ onBack }) {
  const [mistakes, setMistakes] = useState([]);
  const [filter,   setFilter]   = useState('all');

  useEffect(() => {
    progressApi.getMistakes().then(setMistakes).catch(() => {});
  }, []);

  const handleClear = async () => {
    if (!window.confirm('Clear all mistakes? This cannot be undone.')) return;
    await progressApi.clearMistakes().catch(() => {});
    setMistakes([]);
  };

  const visible = filter === 'all'
    ? mistakes
    : mistakes.filter(m => m.source === filter);

  const countFor = (src) => mistakes.filter(m => m.source === src).length;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F0F4F8 0%, #E8EEF5 100%)' }}>

      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: '#1E1B4B', boxShadow: '0 3px 14px rgba(0,0,0,0.28)',
      }}>
        <div style={{
          maxWidth: 860, margin: '0 auto', padding: '13px 28px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.14)', border: '1.5px solid rgba(255,255,255,0.22)',
              borderRadius: 10, color: 'white', fontSize: 18, fontWeight: 600,
              padding: '6px 16px', cursor: 'pointer',
            }}
          >
            <ChevronLeft size={18} /> Back
          </button>
          <span style={{ color: 'white', fontSize: 22, fontWeight: 800 }}>📖 Mistake Book</span>
          <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.55)', fontSize: 16 }}>
            {mistakes.length} mistake{mistakes.length !== 1 ? 's' : ''} recorded
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 28px' }}>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {FILTERS.map(f => {
            const meta    = f === 'all' ? null : SOURCE_META[f];
            const count   = f === 'all' ? mistakes.length : countFor(f);
            const active  = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding:      '6px 16px',
                  borderRadius: 20,
                  border:       active
                    ? `2px solid ${meta?.color ?? '#1E1B4B'}`
                    : '2px solid rgba(0,0,0,0.1)',
                  background:   active
                    ? (meta?.bg ?? 'rgba(30,27,75,0.1)')
                    : 'white',
                  color:        active ? (meta?.color ?? '#1E1B4B') : '#6B7280',
                  fontWeight:   active ? 700 : 500,
                  fontSize:     15,
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                }}
              >
                {f === 'all' ? 'All' : SOURCE_META[f].label}
                {count > 0 && (
                  <span style={{
                    marginLeft: 6,
                    background: active ? (meta?.color ?? '#1E1B4B') : '#E5E7EB',
                    color:      active ? 'white' : '#6B7280',
                    borderRadius: 99, padding: '1px 7px',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {mistakes.length > 0 && (
            <button
              onClick={handleClear}
              style={{
                marginLeft: 'auto', padding: '6px 16px', borderRadius: 20,
                border: '2px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)',
                color: '#EF4444', fontWeight: 600, fontSize: 15, cursor: 'pointer',
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Empty state */}
        {visible.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '80px 20px',
            background: 'white', borderRadius: 20, border: '1.5px solid #E5E7EB',
          }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#1E1B4B', marginBottom: 8 }}>
              {filter === 'all' ? 'No mistakes yet!' : `No ${SOURCE_META[filter]?.label} mistakes yet!`}
            </p>
            <p style={{ fontSize: 16, color: '#9CA3AF' }}>
              Mistakes from quizzes, daily challenges, and exercises will appear here.
            </p>
          </div>
        )}

        {/* Mistake cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visible.map(m => {
            const meta = SOURCE_META[m.source] ?? SOURCE_META.quiz;
            return (
              <div
                key={m.id}
                style={{
                  background: 'white', borderRadius: 16,
                  border: '1.5px solid #E5E7EB', overflow: 'hidden',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                {/* Card header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 18px', borderBottom: '1px solid #F3F4F6',
                }}>
                  <span style={{
                    background: meta.bg, border: `1.5px solid ${meta.border}`,
                    color: meta.color, fontWeight: 700, fontSize: 12,
                    padding: '2px 10px', borderRadius: 99, textTransform: 'uppercase',
                    letterSpacing: 0.5, whiteSpace: 'nowrap',
                  }}>
                    {meta.label}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 16, color: '#1E1B4B', flex: 1 }}>
                    {m.title}
                  </span>
                  <span style={{ color: '#9CA3AF', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {formatDate(m.created_at)}
                  </span>
                </div>

                {/* Your answer / Correct answer */}
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 10, padding: '10px 14px',
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>❌</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Your answer</p>
                      {Array.isArray(m.your_answer)
                        ? m.your_answer.map((step, i) => (
                            <p key={i} style={{ fontSize: 14, color: '#374151', fontFamily: 'monospace', marginBottom: 2 }}>
                              <span style={{ color: '#9CA3AF', marginRight: 6 }}>{i + 1}.</span>{step}
                            </p>
                          ))
                        : <p style={{ fontSize: 14, color: '#374151', fontFamily: 'monospace' }}>{m.your_answer}</p>
                      }
                    </div>
                  </div>

                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)',
                    borderRadius: 10, padding: '10px 14px',
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>✅</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Correct answer</p>
                      {Array.isArray(m.correct_answer)
                        ? m.correct_answer.map((step, i) => (
                            <p key={i} style={{ fontSize: 14, color: '#374151', fontFamily: 'monospace', marginBottom: 2 }}>
                              <span style={{ color: '#9CA3AF', marginRight: 6 }}>{i + 1}.</span>{step}
                            </p>
                          ))
                        : <p style={{ fontSize: 14, color: '#374151', fontFamily: 'monospace' }}>{m.correct_answer}</p>
                      }
                    </div>
                  </div>

                  {m.explanation && (
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)',
                      borderRadius: 10, padding: '10px 14px',
                    }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
                      <p style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.55 }}>{m.explanation}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
