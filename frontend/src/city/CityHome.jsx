import { useEffect, useMemo, useState } from 'react';
import { cityApi } from '../services/api';
import CityCanvas from './CityCanvas';
import HomeScene from './HomeScene';
import { preloadModels } from './models';
import { NATURE_MODELS } from './countryside';
import { VEHICLES } from './traffic';
import { BUILDING_LOOK, HOME_DISTANCE, HOME_FOG, HOME_VIEW, LOTS, SCHOOL, homeLabels } from './homeLayout';

/**
 * Home screen: the student's 3D city. It starts as the school and empty land;
 * learning in the school (the unchanged lesson flow) earns buildings, which
 * wait in the backpack until the student places them on a lot.
 */
preloadModels([...new Set([
  SCHOOL.model, ...Object.values(BUILDING_LOOK).map(l => l.model), ...NATURE_MODELS, ...VEHICLES,
  'roads/road-straight', 'roads/road-crossroad-line', 'roads/light-square', 'roads/traffic-light', 'suburban/planter',
  'nature/canoe', 'nature/lily_large', 'nature/lily_small', 'nature/tent_detailedOpen', 'nature/campfire_stones',
])]);

const NONE = [];

function Backpack({ city, error, placing, saving, onRetry, onPlace, onCancel }) {
  if (error && !city)
    return (
      <div className="text-sm text-slate-600">
        Couldn&apos;t load your city.{' '}
        <button onClick={onRetry} className="font-semibold text-indigo-600 hover:underline">Retry</button>
      </div>
    );
  if (!city) return <div className="text-sm text-slate-500">Loading your city…</div>;
  return (
    <ul className="space-y-3">
      {Object.entries(city.progress).map(([key, p]) => {
        const where = city.placed.find(b => b.building_key === key);
        const ready = city.inventory.some(b => b.building_key === key);
        const pct = Math.round((100 * p.mastered) / Math.max(1, p.total));
        return (
          <li key={key} className={`rounded-xl border p-3 ${ready ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl ${p.earned ? 'bg-amber-200' : 'bg-slate-100 grayscale'}`}>
                🏙️
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                  {p.title}
                  {!p.earned && <span className="text-xs" title="Locked">🔒</span>}
                  {ready && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold uppercase text-amber-950">New</span>}
                </div>
                <div className="text-xs text-slate-500">
                  {!p.earned && `Master all ${p.total} linked-list operations in the school`}
                  {ready && 'Earned! Place it on an empty lot'}
                  {where && `Built on lot ${where.lot + 1}`}
                </div>
              </div>
            </div>
            {!p.earned && (
              <div className="mt-2.5">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 text-right text-[11px] font-medium text-slate-500">{p.mastered} / {p.total} mastered</div>
              </div>
            )}
            {p.earned && (
              <div className="mt-2.5">
                {placing === key ? (
                  <button onClick={onCancel} className="w-full rounded-lg border border-slate-300 bg-white py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Cancel
                  </button>
                ) : (
                  <button onClick={() => onPlace(key)} disabled={saving || (!!where && city.placed.length >= LOTS.length)}
                    className={`w-full rounded-lg py-1.5 text-sm font-semibold disabled:opacity-50 ${ready ? 'bg-amber-500 text-white hover:bg-amber-600' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                    {ready ? 'Place it' : 'Move'}
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function CityHome({ username, xp, onEnterSchool, onMistakeBook, onLogout, onFail }) {
  const [city, setCity] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [placing, setPlacing] = useState(null);       // building_key being placed
  const [saving, setSaving] = useState(false);
  const [justPlaced, setJustPlaced] = useState(null); // "key:lot", rises from the ground once
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let live = true;
    cityApi.get()
      .then((s) => { if (live) setCity(s); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [reload]);

  useEffect(() => {
    if (!placing) return;
    const onKey = (e) => { if (e.key === 'Escape') setPlacing(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const placed = city?.placed ?? NONE;
  const freeLots = useMemo(() => {
    const taken = new Set(placed.map(b => b.lot));
    return LOTS.map((_, i) => i).filter(i => !taken.has(i));
  }, [placed]);
  const labels = useMemo(() => homeLabels({ placed, targets: placing ? freeLots : NONE }), [placed, placing, freeLots]);
  const placingTitle = placing && city?.progress[placing]?.title;

  const pickLot = async (lot) => {
    if (!placing || saving) return;
    setSaving(true);
    try {
      const next = await cityApi.place(placing, lot);
      setCity(next);
      setError(null);
      setJustPlaced(`${placing}:${lot}`);
      setToast(`${placingTitle} built on lot ${lot + 1}!`);
      setPlacing(null);
    } catch (e) {
      setToast(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-sky-100">
      <CityCanvas home={HOME_VIEW} labels={labels} onFail={onFail} distance={HOME_DISTANCE} fog={HOME_FOG}>
        {(quality) => (
          <HomeScene quality={quality} placed={placed} placing={placing} justPlaced={justPlaced}
            onPickLot={pickLot} onEnterSchool={onEnterSchool} />
        )}
      </CityCanvas>

      {/* who / where */}
      <div className="absolute left-4 top-4 z-20 rounded-2xl bg-white/90 px-4 py-3 shadow-lg backdrop-blur">
        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">NodeForge</div>
        <div className="flex items-baseline gap-3">
          <div className="text-lg font-bold text-slate-900">{username ? `${username}'s city` : 'Your city'}</div>
          <div className="text-sm font-semibold text-amber-600">⭐ {xp ?? 0} XP</div>
        </div>
        <div className="mt-2 flex gap-2">
          {onMistakeBook && (
            <button onClick={onMistakeBook} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
              📖 Mistakes
            </button>
          )}
          {onLogout && (
            <button onClick={onLogout} className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-800">
              Logout
            </button>
          )}
        </div>
      </div>

      {placing && (
        <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          Click a glowing lot for the {placingTitle}
          <button onClick={() => setPlacing(null)} className="rounded-full bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30">Cancel (Esc)</button>
        </div>
      )}
      {toast && !placing && (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-slate-900/85 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* backpack */}
      <div className="absolute bottom-4 left-4 z-20 w-72 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="text-sm font-bold text-slate-800">🎒 Backpack</div>
          <div className="text-[11px] text-slate-400">earn buildings in the school</div>
        </div>
        <Backpack city={city} error={error} placing={placing} saving={saving}
          onRetry={() => { setError(null); setReload(n => n + 1); }}
          onPlace={setPlacing} onCancel={() => setPlacing(null)} />
      </div>

      <button onClick={onEnterSchool}
        className="absolute bottom-6 right-6 z-20 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-7 py-4 text-lg font-bold text-white shadow-xl transition hover:scale-[1.03] hover:shadow-2xl">
        🏫 Enter the school →
      </button>
    </div>
  );
}
