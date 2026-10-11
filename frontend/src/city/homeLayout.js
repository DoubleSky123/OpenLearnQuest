/**
 * The student's home city: the school in the middle of a road grid, and empty
 * lots around it waiting for the buildings learning earns. Shared by the 3D
 * scene and its DOM labels. LOTS must stay in step with the backend's
 * services/city.py LOT_COUNT (lot i here is lot i there).
 */
export const FRONT_Z = 3.2;             // avenue in front of the school
export const BACK_Z = -3.8;             // avenue behind it
export const CROSS_X = [-4.4, 4.4];     // cross streets either side
export const SPAN = 26;                 // roads (and traffic) run from -SPAN to +SPAN
export const RIVER = [8.7, 12.9];       // z range of the river

// the lake in the empty north-west quarter: a wobbly ellipse, so the water,
// its sandy shore and the tree exclusion all use the same edge
export const LAKE = { x: -11.5, z: -10.2, rx: 3.8, rz: 2.7 };
export const lakeEdge = (a) => 1 + 0.12 * Math.sin(2 * a + 0.7) + 0.08 * Math.sin(3 * a + 2.1) + 0.04 * Math.sin(5 * a + 1);
export function inLake(x, z, pad = 0) {
  const u = (x - LAKE.x) / LAKE.rx, w = (z - LAKE.z) / LAKE.rz;
  return Math.hypot(u, w) < lakeEdge(Math.atan2(w, u)) + pad;
}
export const lakePoint = (a, k = 1) => [LAKE.x + Math.cos(a) * LAKE.rx * lakeEdge(a) * k, LAKE.z + Math.sin(a) * LAKE.rz * lakeEdge(a) * k];
export const CAMPSITE = lakePoint(-Math.PI / 2 - 0.35, 1.55);   // tent and campfire on the north shore

// [x, z, height]: snowy ranges far out (beyond where the camera can orbit),
// green foothills nearer, kept off the road lines
export const MOUNTAINS = [
  [-36, -44, 14], [-21, -50, 18], [-7, -46, 13], [7, -52, 20], [21, -46, 15], [35, -50, 16], [48, -36, 12], [-50, -34, 13],
  [-30, -66, 24], [0, -70, 28], [30, -66, 23],
  [-54, -12, 13], [-52, 8, 11], [54, -12, 14], [52, 9, 11],
  [-38, 46, 11], [-12, 52, 13], [15, 50, 12], [40, 44, 11],
];
export const HILLS = [
  [-24, -29, 2.6], [-12, -32, 2.2], [12, -32, 2.4], [25, -28, 3], [-33, -15, 2.4], [34, -15, 2.7],
  [-31, 23, 2.2], [31, 23, 2.2], [-14, 32, 2], [15, 33, 2.1],
];
export const HILL_SPREAD = 2.4;         // hill base radius / height
export const MOUNTAIN_SPREAD = 0.8;

// campus block between the four roads (inner kerbs)
export const CAMPUS = { x: [-3.9, 3.9], z: [-3.3, 2.7] };
export const SCHOOL = { model: 'commercial/building-n', position: [0, 0, -1.2], scale: 1.3, height: 2.48 * 1.3 };

export const LOT_SIZE = 1.5;
export const LOTS = [
  [-2.475, 4.55], [-0.825, 4.55], [0.825, 4.55], [2.475, 4.55],   // across the front avenue
  [-5.75, 1.75], [-5.75, 0],                                       // west of the school
  [5.75, 1.75], [5.75, 0],                                         // east of the school
];

// how each earned building looks
export const BUILDING_LOOK = {
  linked_list: { model: 'commercial/building-skyscraper-d', tint: '#ffd56b' },
};
const DEFAULT_LOOK = { model: 'commercial/building-skyscraper-a', tint: null };
export const lookFor = (key) => BUILDING_LOOK[key] ?? DEFAULT_LOOK;

export const HOME_VIEW = { position: [6.0, 7.9, 15.4], target: [0, 0.6, -0.3] };   // over the lots, across town to the lake
export const HOME_DISTANCE = [4.5, 24];  // orbit limits: the camera never reaches the mountains
export const HOME_FOG = [26, 125];

/** DOM labels: the school, every building's name, and a "+" on each lot it can go to. */
export function homeLabels({ placed, targets }) {
  const [sx, , sz] = SCHOOL.position;
  const out = [{
    key: 'school', at: [sx, SCHOOL.height + 0.55, sz],
    cls: 'rounded-full bg-white/95 px-3 py-1 text-sm font-bold text-slate-800 shadow-md', text: '🏫 School',
  }];
  for (const b of placed) {   // a nameplate at the kerb: a roof label leaves the screen on tall towers
    const [x, z] = LOTS[b.lot];
    out.push({
      key: `b-${b.building_key}`, at: [x, 0.3, z + LOT_SIZE / 2],
      cls: 'rounded-md bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950 shadow', text: b.title,
    });
  }
  for (const lot of targets) {
    const [x, z] = LOTS[lot];
    out.push({
      key: `t-${lot}`, at: [x, 0.5, z],
      cls: 'flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-lg font-bold leading-none text-white shadow-lg ring-2 ring-white',
      text: '+',
    });
  }
  return out;
}
