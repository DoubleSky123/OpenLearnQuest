/**
 * Memory City world layout, shared by the 3D components and their DOM labels.
 * List Avenue's lots sit on z = 0, one per plot (address), never in list order.
 */
import { NODE_BUILDINGS } from '../../city/models';

export const AVENUE_Z = 1.35;          // List Avenue, in front of the memory lots
export const SCHOOL_POS = [4.7, 0, 4.6];   // beside the park, out of the home view's line of sight
export const FIELD_POS = [-1.3, 0, 4.5];   // the low sports field the home view looks across
// home view: from the park side, over the field, straight onto List Avenue
export const HOME_VIEW = { position: [-1.0, 5.6, 9.6], target: [0, 0.75, 0] };

export const LOT = 1.6;
export const SLOTS = 6;
export const xOfPlot = (plot) => (plot - (SLOTS - 1) / 2) * LOT;
export const LOT_PAD = 0.06;
const PAD = LOT_PAD;

export function buildingFor(addr) {
  let h = 0;
  for (const ch of addr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NODE_BUILDINGS[h % NODE_BUILDINGS.length];
}
export const roofY = (addr) => PAD + buildingFor(addr).height;

// memory buildings get saturated colours so List Avenue pops out of the city
const NODE_TINTS = ['#ffb37a', '#7fd3ff', '#ffd56b', '#9fe3a0', '#ff9eb5', '#c3a6ff'];
export function tintFor(addr) {
  let h = 7;
  for (const ch of addr) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
  return NODE_TINTS[h % NODE_TINTS.length];
}

export const VEHICLE = { curr: 'cars/taxi', temp: 'cars/garbage-truck', newNode: 'cars/delivery', prev: 'cars/police', dummy: 'cars/van', slow: 'cars/hatchback-sports', fast: 'cars/sedan', mid: 'cars/suv' };
const CURB_Z = 0.86;

// where each pointer variable parks: in front of its lot, side by side
export function parking(scene) {
  const spots = {};
  for (const [addr, names] of Object.entries(scene.signs)) {
    const b = scene.buildings.find(x => x.addr === addr);
    const cars = names.filter(n => n !== 'head');
    cars.forEach((name, i) => {
      spots[name] = [xOfPlot(b.plot) + (i - (cars.length - 1) / 2) * 0.62, 0.05, CURB_Z];
    });
  }
  return spots;
}


/** Every label the 2D view also shows, anchored in world space. */
export function streetLabels(scene) {
  const out = [];
  const byAddr = new Map(scene.buildings.map(b => [b.addr, b]));
  for (const b of scene.buildings) {
    const x = xOfPlot(b.plot);
    out.push({ key: `a-${b.addr}`, at: [x, PAD, 0.78], cls: 'text-[11px] font-semibold text-slate-600 bg-white/80 rounded px-1', text: b.addr });
    if (b.state === 'freed') {
      out.push({ key: `f-${b.addr}`, at: [x, 0.5, 0], cls: 'text-[11px] font-semibold text-slate-500 bg-white/80 rounded px-1', text: 'freed' });
      continue;
    }
    const roof = roofY(b.addr);
    out.push({ key: `v-${b.addr}`, at: [x, roof + 0.32, 0], cls: `text-[15px] font-bold rounded-md px-1.5 shadow ${b.state === 'leaked' ? 'bg-gray-200 text-gray-500' : 'bg-white text-slate-900'}`, text: String(b.value) });
    if (b.state === 'leaked')
      out.push({ key: `l-${b.addr}`, at: [x - 0.38, 1.0, 0.66], cls: 'rounded border border-amber-600 bg-amber-100 px-1 text-[10px] font-bold text-amber-700', text: 'LEAK' });
    if (b.nextKind === 'null')
      out.push({ key: `n-${b.addr}`, at: [x + 0.62, roof, 0], cls: 'text-[10px] font-semibold text-slate-600 bg-white/80 rounded px-1', text: '→NULL' });
  }
  const spots = parking(scene);
  for (const [addr, names] of Object.entries(scene.signs)) {
    const b = byAddr.get(addr);
    const freed = b.state === 'freed';
    for (const name of names) {
      const at = name === 'head' ? [xOfPlot(b.plot) - 0.78, 1.05, 0.72] : [spots[name][0], 0.55, spots[name][2]];
      out.push({
        key: `s-${name}`, at,
        cls: `text-[12px] font-bold rounded px-1.5 shadow ${freed ? 'bg-rose-600 text-white' : name === 'head' ? 'bg-indigo-600 text-white' : 'bg-amber-400 text-slate-900'}`,
        text: `${name} ↓`,
      });
    }
  }
  return out.map(l => ({ ...l, cls: `font-mono ${l.cls}` }));   // the street reads as code
}
