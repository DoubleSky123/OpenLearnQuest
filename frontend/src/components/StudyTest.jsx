import React, { useCallback, useEffect, useRef, useState } from 'react';
import { studyApi } from '../services/api';
import { answeredCount, elapsedMs, firstUnanswered, TEST_TEXT } from '../services/studyTest';

// A study test (pre / post / delayed): one question at a time, no tutor, no
// hints, no right/wrong shown. Every pick is saved on the server at once, so a
// closed tab resumes where it stopped. The server judges the answers.
export default function StudyTest({ kind, onDone, onLogout }) {
  const text = TEST_TEXT[kind] || TEST_TEXT.pre;
  const [phase, setPhase] = useState('intro');        // intro | question | review | done
  const [test, setTest] = useState(null);             // {items, answers, n_items}
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(0);

  const items = test?.items || [];
  const item = items[index];

  useEffect(() => { shownAt.current = performance.now(); }, [index, phase]);

  const begin = async () => {
    setBusy(true);
    setError('');
    try {
      const t = await studyApi.startTest(kind);
      setTest(t);
      setAnswers(t.answers || {});
      const at = firstUnanswered(t.items, t.answers || {});
      setIndex(Math.min(at, t.items.length - 1));
      setPhase(at >= t.items.length ? 'review' : 'question');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pick = useCallback(async (optionId) => {
    if (!item || answers[item.id] === optionId) return;
    const prev = answers[item.id];
    const spent = elapsedMs(shownAt.current, performance.now());
    shownAt.current = performance.now();
    setAnswers((a) => ({ ...a, [item.id]: optionId }));
    setError('');
    try {
      await studyApi.answer(kind, item.id, optionId, spent);
    } catch (e) {
      setAnswers((a) => ({ ...a, [item.id]: prev }));  // not saved: show it unselected again
      setError(`Your answer was not saved: ${e.message}`);
    }
  }, [answers, item, kind]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await studyApi.submit(kind);
      setPhase('done');
      setTest((t) => ({ ...t, next: res.step }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const shell = (children) => (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-5 sm:p-8 text-slate-800">
        {children}
        {error && <p className="mt-4 text-red-700" role="alert">{error}</p>}
      </div>
    </div>
  );

  if (phase === 'intro') {
    return shell(
      <>
        <h1 className="text-2xl font-bold text-indigo-950 mb-3">{text.title}</h1>
        <p className="text-base leading-relaxed mb-3">{text.intro}</p>
        <ul className="list-disc pl-5 space-y-1 text-base text-slate-700 mb-6">
          <li>Each question shows a few short programs. Pick the one that does the job correctly.</li>
          <li>There is no tutor, no hint and no score during the test. It takes about 20 minutes.</li>
          <li>You can go back and change an answer until you press Submit.</li>
        </ul>
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" disabled={busy} onClick={begin}
            className="rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white font-semibold py-3 px-6">
            {busy ? 'Loading…' : 'Start'}
          </button>
          <button type="button" onClick={onLogout} className="text-sm text-slate-500 underline self-center">
            Log out (you can finish later)
          </button>
        </div>
      </>,
    );
  }

  if (phase === 'done') {
    return shell(
      <>
        <h1 className="text-2xl font-bold text-indigo-950 mb-3">Thank you!</h1>
        <p className="text-base mb-6">Your answers are saved.</p>
        <button type="button" onClick={() => onDone(test?.next ?? null)}
          className="rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-semibold py-3 px-6">
          Continue
        </button>
      </>,
    );
  }

  const done = answeredCount(items, answers);

  if (phase === 'review') {
    const missing = items.map((it, i) => (answers[it.id] ? null : i)).filter((i) => i !== null);
    return shell(
      <>
        <h1 className="text-2xl font-bold text-indigo-950 mb-3">Ready to submit?</h1>
        <p className="text-base mb-4">You answered {done} of {items.length} questions.</p>
        {missing.length > 0 && (
          <p className="text-base mb-4 text-amber-800">
            Not answered yet: {missing.map((i) => (
              <button key={i} type="button" className="underline mr-2"
                onClick={() => { setIndex(i); setPhase('question'); }}>
                question {i + 1}
              </button>
            ))}
            (unanswered questions count as wrong)
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => { setIndex(items.length - 1); setPhase('question'); }}
            className="rounded-xl border-2 border-slate-300 hover:bg-slate-50 font-semibold py-3 px-6">
            Back to the questions
          </button>
          <button type="button" disabled={busy} onClick={submit}
            className="rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white font-semibold py-3 px-6">
            {busy ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </>,
    );
  }

  if (!item) return shell(<p>Loading…</p>);
  const last = index === items.length - 1;
  return shell(
    <>
      <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
        <span>Question {index + 1} of {items.length}</span>
        <span>{done} answered</span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full mb-5" aria-hidden="true">
        <div className="h-2 bg-indigo-600 rounded-full" style={{ width: `${(100 * done) / items.length}%` }} />
      </div>

      <h2 className="text-lg font-semibold text-indigo-950 mb-2">{item.prompt}</h2>
      <div className="bg-slate-100 rounded-lg px-4 py-3 font-mono text-[15px] mb-4 space-y-1">
        {item.setup.map((line, i) => <div key={i}>{line}</div>)}
      </div>
      <p className="text-base font-medium mb-3">{item.question}</p>

      <div role="radiogroup" aria-label={item.question} className="space-y-3">
        {item.options.map((o, k) => {
          const chosen = answers[item.id] === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => pick(o.id)}
              className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-colors ${
                chosen ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-400 bg-white'}`}
            >
              <span className="block text-sm font-semibold text-slate-600 mb-1">
                Program {String.fromCharCode(65 + k)}{chosen ? ' — your answer' : ''}
              </span>
              <pre className="font-mono text-[14px] leading-relaxed whitespace-pre-wrap break-words text-slate-900">
                {o.lines.join('\n')}
              </pre>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex justify-between gap-3">
        <button type="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}
          className="rounded-xl border-2 border-slate-300 hover:bg-slate-50 disabled:opacity-40 font-semibold py-2.5 px-5">
          Back
        </button>
        <button type="button"
          onClick={() => (last ? setPhase('review') : setIndex((i) => i + 1))}
          className="rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-semibold py-2.5 px-5">
          {last ? 'Finish' : answers[item.id] ? 'Next' : 'Skip for now'}
        </button>
      </div>
    </>,
  );
}
