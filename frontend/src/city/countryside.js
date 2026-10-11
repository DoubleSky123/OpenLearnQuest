/**
 * Where the home city's countryside grows: forests in clusters (pines toward
 * the mountains, mixed and autumn woods nearer town), wildflowers in the
 * meadows, mushrooms, logs and rocks on the forest floor. Seeded, so every
 * student gets the same land; nothing grows on roads, lots, the campus, the
 * river, the lake or the campsite.
 */
import { pick, rng } from './random';
import {
  BACK_Z, CAMPSITE, CAMPUS, CROSS_X, FRONT_Z, HILLS, HILL_SPREAD, LOTS, LOT_SIZE, RIVER, inLake,
} from './homeLayout';

const S = 0.62;   // Kenney nature-kit trees are ~1.5-1.7 tall at scale 1
const PALETTE = {
  mixed: ['nature/tree_oak', 'nature/tree_default', 'nature/tree_detailed', 'nature/tree_fat', 'nature/tree_tall',
    'nature/tree_plateau', 'nature/tree_pineRoundA', 'nature/tree_default_fall', 'nature/tree_oak'],
  autumn: ['nature/tree_default_fall', 'nature/tree_oak_fall', 'nature/tree_tall', 'nature/tree_default_fall', 'nature/tree_fat'],
  pine: ['nature/tree_pineTallA', 'nature/tree_pineTallB', 'nature/tree_pineDefaultA', 'nature/tree_pineRoundA',
    'nature/tree_pineRoundB', 'nature/tree_cone', 'nature/tree_pineSmallA', 'nature/tree_pineTallA'],
  lake: ['nature/tree_pineTallA', 'nature/tree_thin', 'nature/tree_oak', 'nature/tree_pineRoundB', 'nature/tree_default', 'nature/tree_cone'],
};
// foliage tints (multipliers on the kit's mint-teal leaves), so the woods
// match the grass and vary from tree to tree; autumn trees keep their colour
const LEAF_TINTS = [[1.7, 1.0, 0.5], [1.25, 0.86, 0.55], [2.4, 1.0, 0.42], [1.4, 0.95, 0.62], [1.9, 1.05, 0.48]];
const PINE_TINTS = [[1.15, 0.9, 0.58], [1.35, 0.95, 0.55], [1.0, 0.85, 0.62]];
const GRASS_TINTS = [[1.6, 0.95, 0.5], [1.9, 0.98, 0.45], [1.35, 0.9, 0.55]];
function tintFor(r, name) {
  if (name.includes('_fall')) return null;
  if (name.includes('pine') || name.includes('cone')) return pick(r, PINE_TINTS);
  if (name.includes('tree_')) return pick(r, LEAF_TINTS);
  return pick(r, GRASS_TINTS);
}

const FLOOR = ['nature/plant_bushDetailed', 'nature/plant_bushLarge', 'nature/mushroom_redGroup', 'nature/mushroom_tanGroup',
  'nature/log', 'nature/stump_round', 'nature/rock_largeA', 'nature/rock_largeC', 'nature/grass_large', 'nature/plant_bushDetailed'];
const MEADOW = ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA', 'nature/grass_large',
  'nature/flower_yellowA', 'nature/plant_bushLarge', 'nature/grass_large', 'nature/flower_redA', 'nature/plant_bushDetailed'];

// [x, z, radius, count, palette]
const FORESTS = [
  [12.5, -11, 6.5, 95, 'mixed'],           // north-east woods
  [-11.5, -10.2, 7.8, 80, 'lake'],         // around the lake
  [0, -12, 5.5, 55, 'mixed'],              // behind the school
  [-7, -18, 6, 70, 'mixed'], [8, -17.5, 6.5, 75, 'mixed'], [-19, -10, 4.5, 40, 'mixed'],   // the woods' far edge
  [-13, -0.3, 4, 16, 'mixed'], [13, -0.3, 4, 18, 'autumn'],   // copses beside town
  [-12, 6, 3.5, 12, 'mixed'], [12, 6, 3.5, 12, 'autumn'],
  [0, 18, 10, 95, 'mixed'],                // across the river
  [-22, 0, 5.5, 34, 'pine'], [22, 0, 5.5, 34, 'pine'],
  [-20, -21, 7.5, 70, 'pine'], [20, -21, 7.5, 70, 'pine'], [0, -22, 6.5, 55, 'pine'],   // up toward the mountains
  [-21, 18, 6.5, 45, 'pine'], [21, 18, 6.5, 45, 'pine'],
];

export function blocked(x, z, pad = 0) {
  return [FRONT_Z, BACK_Z].some(az => Math.abs(z - az) < 0.8 + pad)
    || CROSS_X.some(cx => Math.abs(x - cx) < 0.8 + pad)
    || (z > RIVER[0] - 0.35 && z < RIVER[1] + 0.35)
    || (x > CAMPUS.x[0] - 0.3 && x < CAMPUS.x[1] + 0.3 && z > CAMPUS.z[0] - 0.3 && z < CAMPUS.z[1] + 0.3)
    || LOTS.some(([lx, lz]) => Math.abs(x - lx) < LOT_SIZE / 2 + 0.45 && Math.abs(z - lz) < LOT_SIZE / 2 + 0.45)
    || inLake(x, z, 0.32)
    || Math.hypot(x - CAMPSITE[0], z - CAMPSITE[1]) < 1.5
    || HILLS.some(([hx, hz, h]) => Math.hypot(x - hx, z - hz) < h * HILL_SPREAD * 0.85);
}

function grow(r, out, name, x, z, scale) {
  const rock = name.includes('rock');
  out.push({
    name, position: [x, 0, z], ry: r() * Math.PI * 2, scale: rock ? 0.35 + r() * 0.25 : scale,
    shade: 0.86 + r() * 0.2, phase: r() * 6.28, tint: tintFor(r, name),
  });
}

/** Trees and ground cover: [{ name, position, ry, scale, shade, phase }]. */
export function natureItems() {
  const r = rng(20261010);
  const trees = [];
  const props = [];
  for (const [cx, cz, radius, count, kind] of FORESTS)
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = radius * Math.pow(r(), 0.65);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (blocked(x, z)) continue;
      const big = kind === 'pine' && Math.hypot(x, z) > 18 ? 1.35 : 1;
      grow(r, trees, pick(r, PALETTE[kind]), x, z, S * big * (0.8 + r() * 0.5));
      if (r() < 0.3) {   // something on the forest floor nearby
        const fx = x + (r() - 0.5) * 1.2, fz = z + (r() - 0.5) * 1.2;
        if (!blocked(fx, fz)) grow(r, props, pick(r, FLOOR), fx, fz, 0.8 + r() * 0.5);
      }
    }
  for (let x = -26; x <= 26; x += 0.85)   // riverbanks
    for (const [z, k] of [[RIVER[0] - 0.25, 0.9], [RIVER[1] + 0.3, 0.9]]) {
      if (CROSS_X.some(cx => Math.abs(cx - x) < 0.8) || r() < 0.25) continue;
      grow(r, trees, pick(r, r() < 0.5 ? PALETTE.mixed : PALETTE.lake), x + r() * 0.3, z, S * k * (0.85 + r() * 0.3));
    }
  for (let i = 0; i < 46; i++) {   // lone trees in the meadows near town
    const x = -16 + r() * 32, z = -8 + r() * 16;
    if (blocked(x, z, 0.1) || Math.hypot(x, z) < 6.5) continue;
    grow(r, trees, pick(r, PALETTE.mixed), x, z, S * (0.9 + r() * 0.4));
  }
  for (let i = 0; i < 700; i++) {   // wildflowers, grass tufts, bushes
    const x = -17 + r() * 34, z = -9 + r() * 18;
    if (blocked(x, z, 0.08)) continue;
    grow(r, props, pick(r, MEADOW), x, z, 0.75 + r() * 0.5);
  }
  return { trees, props };
}

export function byModel(items) {
  const groups = new Map();
  for (const it of items) {
    if (!groups.has(it.name)) groups.set(it.name, []);
    groups.get(it.name).push(it);
  }
  return [...groups.entries()];
}

export const NATURE_MODELS = [...new Set([...Object.values(PALETTE).flat(), ...FLOOR, ...MEADOW])];
