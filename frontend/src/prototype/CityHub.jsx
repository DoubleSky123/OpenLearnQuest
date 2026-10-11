import CityView3D from './CityView3D';
import { SCHOOL_POS } from './city/layout';

/**
 * The student's city before class: the school at the centre, List Avenue (where
 * their code builds), and the districts later data structures unlock. A
 * city-builder HUD frames it; nothing here is recorded.
 */
const EMPTY_FRAME = { heap: [], vars: {}, leaked: [], events: [] };
const OVERVIEW = { position: [15, 16, 21], target: [0, 0.5, 1.5] };

const tag = 'rounded-lg px-2 py-1 text-[12px] font-bold shadow-lg';
const LABELS = [
  { key: 'school', at: [SCHOOL_POS[0], 3.4, SCHOOL_POS[2]], cls: `${tag} bg-indigo-600 text-white text-[14px]`, text: '🏫 School — classes start here' },
  { key: 'avenue', at: [0, 0.4, 0.2], cls: `${tag} bg-white text-slate-800`, text: '🏗 List Avenue — your code builds here' },
  { key: 'stack', at: [-12.8, 3.2, -2.6], cls: `${tag} bg-slate-800/80 text-white`, text: '🔒 Stack Tower' },
  { key: 'hash', at: [12.8, 3.2, -2.6], cls: `${tag} bg-slate-800/80 text-white`, text: '🔒 Hash Market' },
  { key: 'tree', at: [12.8, 2.2, 4.6], cls: `${tag} bg-slate-800/80 text-white`, text: '🔒 Tree Park' },
  { key: 'graph', at: [-12.8, 2.2, 4.6], cls: `${tag} bg-slate-800/80 text-white`, text: '🔒 Graph Highway' },
];

function Stat({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-slate-900/70 py-1 pl-1 pr-3 text-white shadow-lg backdrop-blur">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-base">{icon}</span>
      <span className="text-xs text-white/70">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

export default function CityHub({ participant, onEnter, onWebglFail }) {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-sky-200">
      <CityView3D frame={EMPTY_FRAME} home={OVERVIEW} labels={LABELS} onFail={onWebglFail} />

      {/* HUD */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-gradient-to-b from-emerald-400 to-emerald-600 text-lg font-black text-white shadow-xl">1</div>
        <Stat icon="🧱" label="Blueprints" value="0 / 12" />
        <Stat icon="🏙" label="Districts" value="1 / 5" />
        <Stat icon="👤" label="Mayor" value={participant} />
      </div>

      <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 text-center">
        <p className="mb-3 rounded-full bg-slate-900/70 px-4 py-1.5 text-sm text-white shadow-lg backdrop-blur">
          Welcome to Memory City. Every building on List Avenue is a node in memory — and you&rsquo;re about to watch some code build (and break) it.
        </p>
        <button onClick={onEnter}
          className="rounded-2xl border-4 border-white bg-gradient-to-b from-amber-400 to-orange-500 px-8 py-3 text-lg font-black text-white shadow-2xl transition hover:scale-105">
          Enter the school →
        </button>
      </div>
    </div>
  );
}
