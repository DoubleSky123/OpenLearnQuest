import { useState, useEffect } from 'react';
import { adminApi } from '../services/api';

const EMOTION_META = {
  engaged:   { label: 'Engaged',    color: '#059669', bg: '#D1FAE5', dot: 'bg-emerald-500' },
  confused:  { label: 'Confused',   color: '#D97706', bg: '#FEF3C7', dot: 'bg-amber-500'   },
  frustrated:{ label: 'Frustrated', color: '#DC2626', bg: '#FEE2E2', dot: 'bg-red-500'     },
  bored:     { label: 'Bored',      color: '#6B7280', bg: '#F3F4F6', dot: 'bg-gray-400'    },
};

const SOURCE_LABEL = {
  self_report: 'Self-report',
  behavioral:  'Behavioral',
  tutor_chat:  'Tutor chat',
};

function EmotionBadge({ emotion }) {
  const m = EMOTION_META[emotion] ?? EMOTION_META.engaged;
  return (
    <span style={{ background: m.bg, color: m.color }}
      className="text-xs font-semibold px-2 py-0.5 rounded-full">
      {m.label}
    </span>
  );
}

function EmotionBar({ distribution }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return <span className="text-xs text-gray-400">No data</span>;
  return (
    <div className="flex gap-1 items-center flex-wrap">
      {Object.entries(distribution).map(([emotion, count]) => {
        const m = EMOTION_META[emotion];
        if (!m) return null;
        return (
          <span key={emotion} className={`w-2 h-2 rounded-full ${m.dot}`} title={`${m.label}: ${count}`} />
        );
      })}
      <span className="text-xs text-gray-400 ml-1">{total} events</span>
    </div>
  );
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatConfidence(c) {
  return `${Math.round(c * 100)}%`;
}

export default function AdminDashboard({ onBack }) {
  const [overview, setOverview] = useState(null);
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.getOverview(), adminApi.getStudents()])
      .then(([ov, st]) => { setOverview(ov); setStudents(st); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectStudent = (student) => {
    setSelected(student);
    adminApi.getEmotionTimeline(student.id)
      .then(setTimeline)
      .catch(() => setTimeline([]));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-slate-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8 py-3 flex items-center gap-4">
          <span className="text-white font-bold text-lg">Admin Dashboard</span>
          <button onClick={onBack}
            className="ml-auto border border-slate-600 rounded-lg px-3 py-1.5 text-slate-300 text-sm font-semibold hover:bg-slate-800">
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6 flex gap-6">

        {/* Left: overview + student list */}
        <div className="w-80 shrink-0 flex flex-col gap-4">

          {/* Overview stats */}
          {overview && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Platform Overview</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Students', value: overview.total_students },
                  { label: 'Sessions', value: overview.total_sessions },
                  { label: 'Questions', value: overview.total_attempts },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>
              {/* Emotion distribution bar */}
              <p className="text-xs text-gray-400 mb-2">Emotion distribution (all time)</p>
              <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-gray-100">
                {Object.entries(overview.emotion_distribution ?? {}).map(([emotion, count]) => {
                  const total = Object.values(overview.emotion_distribution).reduce((a,b)=>a+b,0);
                  const m = EMOTION_META[emotion];
                  if (!m || total === 0) return null;
                  return (
                    <div key={emotion} style={{ width: `${(count/total)*100}%`, background: m.color }}
                      title={`${m.label}: ${count}`} />
                  );
                })}
              </div>
              <div className="flex gap-3 mt-2 flex-wrap">
                {Object.entries(overview.emotion_distribution ?? {}).map(([emotion, count]) => {
                  const m = EMOTION_META[emotion];
                  if (!m) return null;
                  return (
                    <span key={emotion} className="flex items-center gap-1 text-xs text-gray-500">
                      <span className={`w-2 h-2 rounded-full ${m.dot}`} />{m.label} {count}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Student list */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase">Students ({students.length})</p>
            </div>
            {loading && <p className="p-4 text-sm text-gray-400">Loading...</p>}
            {students.map(s => (
              <button key={s.id} onClick={() => selectStudent(s)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selected?.id === s.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-gray-800">{s.username}</span>
                  <span className="text-xs text-gray-400">{s.xp} XP</span>
                </div>
                <div className="flex items-center justify-between">
                  <EmotionBar distribution={s.emotion_distribution} />
                  <span className="text-xs text-gray-300">{s.total_questions}q</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: emotion timeline */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-64">
              <p className="text-gray-400">Select a student to view their emotion timeline</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                <div>
                  <p className="font-bold text-gray-900">{selected.username}</p>
                  <p className="text-xs text-gray-400">{selected.email} · {selected.total_sessions} sessions · {selected.total_questions} questions</p>
                </div>
                <div className="ml-auto flex gap-2 flex-wrap justify-end">
                  {Object.entries(selected.emotion_distribution).map(([emotion, count]) => {
                    const m = EMOTION_META[emotion];
                    if (!m) return null;
                    return (
                      <span key={emotion} style={{ background: m.bg, color: m.color }}
                        className="text-xs font-semibold px-2 py-0.5 rounded-full">
                        {m.label} ×{count}
                      </span>
                    );
                  })}
                </div>
              </div>

              {timeline.length === 0 ? (
                <p className="p-6 text-gray-400 text-sm">No emotion data recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Time</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Source</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Emotion</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Confidence</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Action</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Signals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.map((log, i) => (
                        <tr key={log.id} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {SOURCE_LABEL[log.source] ?? log.source}
                            </span>
                          </td>
                          <td className="px-4 py-2.5"><EmotionBadge emotion={log.emotion} /></td>
                          <td className="px-4 py-2.5 text-gray-500">{formatConfidence(log.confidence)}</td>
                          <td className="px-4 py-2.5">
                            {log.action_taken && log.action_taken !== 'none' ? (
                              <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                                {log.action_taken.replace(/_/g, ' ')}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 max-w-xs truncate">
                            {log.signals ? Object.entries(log.signals).map(([k,v]) => `${k}:${v}`).join(', ') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
