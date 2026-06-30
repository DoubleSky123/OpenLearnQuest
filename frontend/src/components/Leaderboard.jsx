import React, { useEffect, useState } from 'react';
import { progressApi } from '../services/api';

const MAX_LIVES = 5;

const MODE_META = {
  'practice-comp':  { label: 'Practice · Competitive', color: '#D97706', bg: 'rgba(217,119,6,0.1)',  border: 'rgba(217,119,6,0.3)'  },
  'challenge-comp': { label: 'Challenge · LeetCode',   color: '#7C3AED', bg: 'rgba(124,58,237,0.1)', border: 'rgba(124,58,237,0.3)' },
};

function HeartDisplay({ remaining }) {
  if (remaining == null) return <span style={{ color: '#9CA3AF', fontSize: 13 }}>—</span>;
  return (
    <span style={{ letterSpacing: 1 }}>
      {Array.from({ length: MAX_LIVES }, (_, i) => (
        <span key={i} style={{ opacity: i < remaining ? 1 : 0.2, fontSize: 13 }}>❤️</span>
      ))}
    </span>
  );
}

function formatSecs(s) {
  const total = Math.round(s);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function Leaderboard({ onBack }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    progressApi.getLeaderboard()
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all'
    ? records
    : records.filter(r => r.game_mode_detail === filter);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F0F4F8 0%, #E8EEF5 100%)' }}>

      {/* Header */}
      <div style={{ background: '#1E1B4B', boxShadow: '0 3px 14px rgba(0,0,0,0.28)', padding: '16px 36px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <button
          onClick={onBack}
          style={{ background: 'rgba(255,255,255,0.14)', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: 10, color: 'white', fontSize: 20, fontWeight: 600, padding: '6px 20px', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
        >
          ← Back
        </button>
        <div>
          <h1 style={{ color: 'white', fontSize: 24, fontWeight: 800, margin: 0 }}>🏆 My Records</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0 }}>Per-question competitive results</p>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {[
            { key: 'all',            label: 'All' },
            { key: 'practice-comp',  label: 'Practice Competitive' },
            { key: 'challenge-comp', label: 'Challenge LeetCode' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: '7px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                background: filter === tab.key ? '#1E1B4B' : 'white',
                color: filter === tab.key ? 'white' : '#6B7280',
                boxShadow: filter === tab.key ? '0 2px 8px rgba(30,27,75,0.25)' : '0 1px 4px rgba(0,0,0,0.08)',
              }}
            >
              {tab.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', color: '#9CA3AF', fontSize: 13, alignSelf: 'center' }}>
            {filtered.length} question{filtered.length !== 1 ? 's' : ''} completed
          </span>
        </div>

        {/* Table header */}
        {!loading && filtered.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 120px 110px 80px 80px',
            padding: '6px 20px', marginBottom: 6,
            color: '#9CA3AF', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
          }}>
            <span>Question</span>
            <span style={{ textAlign: 'center' }}>Mode</span>
            <span style={{ textAlign: 'center' }}>Time</span>
            <span style={{ textAlign: 'center' }}>Lives</span>
            <span style={{ textAlign: 'center' }}>Errors</span>
            <span style={{ textAlign: 'center' }}>XP</span>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', color: '#9CA3AF', padding: 60 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
            <p style={{ color: '#6B7280', fontSize: 17, fontWeight: 600 }}>No competitive records yet.</p>
            <p style={{ color: '#9CA3AF', fontSize: 14 }}>Complete a Practice or Challenge Competitive question to see your stats here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(r => {
              const meta = MODE_META[r.game_mode_detail] ?? MODE_META['challenge-comp'];
              const date = new Date(r.completed_at);
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={r.id} style={{
                  background: 'white', borderRadius: 14, padding: '14px 20px',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                  border: `1.5px solid ${meta.border}`,
                  display: 'grid',
                  gridTemplateColumns: '1fr 110px 120px 110px 80px 80px',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  {/* Question info */}
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{r.question_id}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF' }}>
                      {r.module_id === 'doubly' ? 'Doubly LL' : 'Singly LL'} · Lv {r.difficulty} · {dateStr} {timeStr}
                    </p>
                  </div>

                  {/* Mode badge */}
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>
                      {r.game_mode_detail === 'practice-comp' ? 'Practice' : 'Challenge'}
                    </span>
                  </div>

                  {/* Time */}
                  <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#374151', fontFamily: 'monospace' }}>
                    {formatSecs(r.time_seconds)}
                  </div>

                  {/* Lives */}
                  <div style={{ textAlign: 'center' }}>
                    <HeartDisplay remaining={r.lives_after} />
                  </div>

                  {/* Errors */}
                  <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: r.error_count === 0 ? '#059669' : r.error_count >= 3 ? '#DC2626' : '#D97706' }}>
                    {r.error_count === 0 ? '✓ 0' : r.error_count}
                  </div>

                  {/* XP */}
                  <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: '#7C3AED' }}>
                    +{r.xp_gained}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
