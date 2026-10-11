import { useGLTF } from '@react-three/drei';

/**
 * Kenney city/car/nature kits (CC0, see models/LICENSE-Kenney-CC0.txt). Textures
 * were inlined into each .glb so the files are self-contained once Vite hashes
 * them. The main app reaches them only through the lazily loaded home city, so
 * the login and learning screens never download three.js or a model.
 */
const urls = import.meta.glob('./models/**/*.glb', { eager: true, query: '?url', import: 'default' });

export const MODEL = Object.fromEntries(
  Object.entries(urls).map(([path, url]) => [path.replace('./models/', '').replace('.glb', ''), url]));

export function modelUrl(name) {
  const url = MODEL[name];
  if (!url) throw new Error(`unknown model ${name}`);
  return url;
}

export function preloadCity() {
  Object.values(MODEL).forEach((url) => useGLTF.preload(url));
}

export function preloadModels(names) {
  names.forEach((name) => useGLTF.preload(modelUrl(name)));
}

// Heights measured from the GLB accessors (footprint is ~1 tile for all of them),
// so labels can sit on the roof without waiting for a model to load.
export const NODE_BUILDINGS = [
  ['commercial/building-a', 1.29], ['commercial/building-f', 1.69], ['commercial/building-d', 1.29],
  ['commercial/building-g', 1.69], ['commercial/building-h', 1.29], ['commercial/building-i', 1.68],
  ['commercial/building-b', 1.29], ['commercial/building-l', 2.27], ['commercial/building-skyscraper-a', 2.88],
].map(([name, height]) => ({ name, height }));

export const FILLER_BUILDINGS = [
  'commercial/building-c', 'commercial/building-e', 'commercial/building-j', 'commercial/building-k',
  'commercial/building-m', 'commercial/building-n', 'commercial/building-skyscraper-b',
  'commercial/building-skyscraper-c', 'commercial/building-skyscraper-d', 'commercial/building-skyscraper-e',
];
export const FAR_BUILDINGS = [
  'commercial/low-detail-building-a', 'commercial/low-detail-building-b', 'commercial/low-detail-building-c',
  'commercial/low-detail-building-d', 'commercial/low-detail-building-e', 'commercial/low-detail-building-f',
  'commercial/low-detail-building-g', 'commercial/low-detail-building-h',
  'commercial/low-detail-building-wide-a', 'commercial/low-detail-building-wide-b',
];
export const HOUSES = [
  'suburban/building-type-a', 'suburban/building-type-c', 'suburban/building-type-f', 'suburban/building-type-h',
  'suburban/building-type-k', 'suburban/building-type-q', 'suburban/building-type-t',
];
export const TREES = ['nature/tree_oak', 'nature/tree_default', 'nature/tree_detailed', 'nature/tree_fat', 'nature/tree_pineRoundA'];
export const TRAFFIC = ['cars/sedan', 'cars/taxi', 'cars/van', 'cars/suv', 'cars/truck', 'cars/hatchback-sports', 'cars/delivery', 'cars/police'];

// Car kit models are ~1.5 wide; a 1-tile road carries two lanes.
export const CAR_SCALE = 0.17;
export const TREE_SCALE = 0.62;
