import React, { useState } from 'react';
import { studyApi } from '../services/api';

// The study's consent screen (STUDY_ENABLED). Agreeing leads to the pre-test;
// declining means the game as normal, with no tests and no research data.
export default function StudyConsent({ consent, onDone, onLogout }) {
  const [background, setBackground] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const answer = async (agreed) => {
    setBusy(true);
    setError('');
    try {
      const res = await studyApi.consent(agreed, agreed ? background : {});
      onDone(res.step);
    } catch (e) {
      setError(e.message || 'Something went wrong — please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6 sm:p-8 text-slate-800">
        <h1 className="text-2xl font-bold text-indigo-950 mb-4">{consent.title}</h1>
        <div className="space-y-3 text-base leading-relaxed">
          {consent.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        {consent.background?.length > 0 && (
          <div className="mt-6 space-y-4 border-t border-slate-200 pt-5">
            {consent.background.map((q) => (
              <label key={q.id} className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">{q.label}</span>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base bg-white"
                  value={background[q.id] || ''}
                  onChange={(e) => setBackground((b) => ({ ...b, [q.id]: e.target.value || undefined }))}
                >
                  <option value="">Prefer not to say</option>
                  {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-red-700" role="alert">{error}</p>}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(true)}
            className="flex-1 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white font-semibold py-3 px-4"
          >
            {consent.agree}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(false)}
            className="flex-1 rounded-xl border-2 border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-800 font-semibold py-3 px-4"
          >
            {consent.decline}
          </button>
        </div>
        <button type="button" onClick={onLogout} className="mt-4 text-sm text-slate-500 underline">
          Log out
        </button>
      </div>
    </div>
  );
}
