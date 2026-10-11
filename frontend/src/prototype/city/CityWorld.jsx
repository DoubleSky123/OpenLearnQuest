import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import Model from '../../city/Model';
import { pick, rng } from '../../city/random';
import { CAR_SCALE, FAR_BUILDINGS, FILLER_BUILDINGS, HOUSES, TRAFFIC, TREES, TREE_SCALE } from '../../city/models';
import { AVENUE_Z, FIELD_POS, SCHOOL_POS } from './layout';

/**
 * The city around List Avenue (the memory street, which sits on z = 0 and is
 * drawn by MemoryStreet). Everything here is decoration: it carries no list
 * information, so the 2D and 3D views still show the same facts (eng review R2).
 * Layout is deterministic (seeded), so every participant sees the same city.
 */
const BACK_Z = -6.5;                   // avenue behind the downtown block
const FRONT_Z = 7.5;                   // avenue between the school and the river
const CROSS_X = [-7.5, 7.5];           // cross streets
const SPAN = 18;                       // roads run from -SPAN to +SPAN

// pastel facades, multiplied into the kit's light palette texture
const FACADES = ['#f8d9b0', '#f5b48f', '#a8d8ea', '#cde8a8', '#f3e5c8', '#c3cff5', '#f9c9c9', '#ffe39f', null];
const AUTUMN = ['#f2c94c', '#f2994a', '#e86f4f'];

const AVENUES = [AVENUE_Z, BACK_Z, FRONT_Z];
const RIVER = [8.7, 12.9];   // z range of the river

function Roads() {
  const tiles = useMemo(() => {
    const out = [];
    // east-west avenues: straight tiles, leaving room for the crossings
    for (const z of AVENUES)
      for (let x = -SPAN; x <= SPAN; x += 1)
        if (!CROSS_X.some(cx => Math.abs(cx - x) < 1))
          out.push({ key: `x${x}_${z}`, name: 'roads/road-straight', position: [x, 0.01, z], rotation: [0, Math.PI / 2, 0] });
    // north-south cross streets (they also cross the river as flat bridges)
    for (const x of CROSS_X)
      for (let z = -SPAN; z <= SPAN; z += 1)
        if (!AVENUES.some(az => Math.abs(az - z) < 1))
          out.push({ key: `z${x}_${z}`, name: 'roads/road-straight', position: [x, 0.012, z], rotation: [0, 0, 0] });
    for (const x of CROSS_X)
      for (const z of AVENUES)
        out.push({ key: `c${x}_${z}`, name: 'roads/road-crossroad-line', position: [x, 0.014, z], rotation: [0, 0, 0] });
    return out;
  }, []);
  return (
    <>
      {tiles.map(t => <Model key={t.key} name={t.name} position={t.position} rotation={t.rotation} shadows={false} />)}
      {CROSS_X.flatMap(x => [-0.55, 0.55].map(dx => (   // bridge rails
        <mesh key={`${x}${dx}`} position={[x + dx, 0.12, (RIVER[0] + RIVER[1]) / 2]} castShadow>
          <boxGeometry args={[0.08, 0.2, RIVER[1] - RIVER[0] + 0.4]} />
          <meshStandardMaterial color="#e7e5e4" />
        </mesh>
      )))}
    </>
  );
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#8fcf63" />
      </mesh>
      {/* downtown pads */}
      {[[0, -2.6, 14.6, 7.2], [-12.8, -2.6, 9.6, 7.2], [12.8, -2.6, 9.6, 7.2], [0, -11, 34, 8], [-12.8, 4.4, 9.6, 5.6], [12.8, 4.4, 9.6, 5.6]].map(([x, z, w, d], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.01, z]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color="#d8dde3" />
        </mesh>
      ))}
      {/* river */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, (RIVER[0] + RIVER[1]) / 2]}>
        <planeGeometry args={[120, RIVER[1] - RIVER[0]]} />
        <meshStandardMaterial color="#2fa6e0" roughness={0.12} metalness={0.1} />
      </mesh>
    </>
  );
}

function School() {
  const [x, , z] = SCHOOL_POS;
  const [fx, , fz] = FIELD_POS;
  return (
    <group>
      {/* sports field */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[fx, 0.005, fz]} receiveShadow>
        <planeGeometry args={[4.2, 2.6]} />
        <meshStandardMaterial color="#e2733a" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[fx, 0.01, fz]} receiveShadow>
        <planeGeometry args={[3.5, 1.9]} />
        <meshStandardMaterial color="#5fb84a" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[fx, 0.012, fz]}>
        <planeGeometry args={[0.04, 1.9]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <Model name="commercial/building-n" position={[x, 0, z]} rotation={[0, -Math.PI / 2, 0]} scale={1.15} tint="#ffe7b0" />
      {/* flag */}
      <mesh position={[x - 1.6, 1.1, z + 1.2]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 2.2, 8]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[x - 1.35, 2.0, z + 1.2]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.02]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
    </group>
  );
}

function Filler() {
  const items = useMemo(() => {
    const r = rng(20261010);
    const out = [];
    const near = (x, z) => Math.abs(x) < 9 && Math.abs(z) < 9;
    const row = (z, x0, x1, step, list, opts = {}) => {
      for (let x = x0; x <= x1 + 1e-6; x += step) {
        if (opts.skip?.(x)) continue;
        out.push({ name: pick(r, list), tint: pick(r, FACADES), position: [x + (r() - 0.5) * 0.15, 0, z], rotation: [0, opts.face ?? 0, 0], shadows: near(x, z), scale: opts.scale ?? 1 });
      }
    };
    // downtown block behind List Avenue
    row(-1.85, -6.4, 6.4, 1.6, HOUSES, { face: Math.PI });   // low row right behind the memory lots
    row(-3.6, -6.4, 6.4, 1.6, FILLER_BUILDINGS, { face: 0 });
    row(-5.2, -6.4, 6.4, 1.4, FILLER_BUILDINGS, { face: Math.PI });
    // memory row ends
    row(0, -6.6, -5.4, 1.2, HOUSES, { face: 0 });
    row(0, 5.4, 6.6, 1.2, HOUSES, { face: 0 });
    // side districts (east / west of the cross streets)
    for (const side of [-1, 1]) {
      for (const z of [-0.2, -1.8, -3.4, -5.0]) row(z, side < 0 ? -16.5 : 9.2, side < 0 ? -9.2 : 16.5, 1.5, FILLER_BUILDINGS, {});
      for (const z of [2.6, 4.2, 5.8]) row(z, side < 0 ? -16.5 : 9.2, side < 0 ? -9.2 : 16.5, 1.4, HOUSES, {});
    }
    // skyline behind the back avenue
    for (const z of [-8.2, -9.8, -11.4, -13])
      row(z, -17, 17, 1.25, z > -10 ? FILLER_BUILDINGS : FAR_BUILDINGS,
        { scale: z > -10 ? 1 : 1.6, skip: (x) => CROSS_X.some(cx => Math.abs(cx - x) < 0.9) });
    // across the river
    for (const z of [14.3, 16]) row(z, -17, 17, 1.4, FAR_BUILDINGS, { scale: 1.4, skip: (x) => CROSS_X.some(cx => Math.abs(cx - x) < 0.8) });
    return out;
  }, []);
  return items.map((it, i) => <Model key={i} {...it} />);
}

function Greenery() {
  const items = useMemo(() => {
    const r = rng(7);
    const out = [];
    const tree = (x, z, s = 1) => out.push({ name: pick(r, TREES), leafTint: r() < 0.3 ? pick(r, AUTUMN) : null, position: [x, 0, z], rotation: [0, r() * 6.28, 0], scale: TREE_SCALE * s * (0.85 + r() * 0.3) });
    for (let x = -6.6; x <= 6.6; x += 1.1) {   // avenue + park edges; none in front of the memory lots (they would hide the labels)
      if (Math.abs(x) > 5.2) tree(x, 2.15);
      if (Math.abs(x) > 2.4) tree(x, 6.7);
    }
    for (let i = 0; i < 26; i++) {   // the park around the school and the field
      const x = -6.5 + r() * 13, z = 2.8 + r() * 3.6;
      if (Math.abs(x - SCHOOL_POS[0]) < 1.9 && Math.abs(z - SCHOOL_POS[2]) < 1.7) continue;
      if (Math.abs(x - FIELD_POS[0]) < 2.4 && Math.abs(z - FIELD_POS[2]) < 1.6) continue;
      tree(x, z, 1.1);
    }
    for (let x = -17; x <= 17; x += 0.9)   // riverbanks, clear of the bridges
      if (!CROSS_X.some(cx => Math.abs(cx - x) < 0.8)) { tree(x + r() * 0.3, RIVER[0] - 0.2, 0.9); tree(x + r() * 0.3, RIVER[1] + 0.3, 0.9); }
    return out;
  }, []);
  return items.map((it, i) => <Model key={i} {...it} shadows={Math.abs(it.position[0]) < 9 && it.position[2] < 9} />);
}

function StreetLights() {
  const lights = [];
  for (let x = -6; x <= 6; x += 2.4) lights.push([x, AVENUE_Z + 0.62, Math.PI]);
  for (let x = -6; x <= 6; x += 2.4) lights.push([x + 1.2, AVENUE_Z - 0.62, 0]);
  return lights.map(([x, z, ry], i) => <Model key={i} name="roads/light-square" position={[x, 0, z]} rotation={[0, ry, 0]} scale={1.2} />);
}

// Cars driving the avenues, looping. Moved through refs so traffic never
// re-renders React.
function Traffic({ running }) {
  const cars = useMemo(() => {
    const r = rng(99);
    const out = [];
    for (const z of [AVENUE_Z, BACK_Z, FRONT_Z])
      for (const dir of [1, -1])
        for (let k = 0; k < 2; k++)
          out.push({ name: pick(r, TRAFFIC), axis: 'x', lane: z + dir * 0.22, dir, offset: r() * 2 * SPAN, speed: 0.9 + r() * 0.8 });
    for (const x of CROSS_X)
      for (const dir of [1, -1])
        out.push({ name: pick(r, TRAFFIC), axis: 'z', lane: x - dir * 0.22, dir, offset: r() * 2 * SPAN, speed: 0.8 + r() * 0.6 });
    return out;
  }, []);
  const refs = useRef([]);
  useFrame(({ clock }) => {
    if (!running) return;
    const t = clock.getElapsedTime();
    cars.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      const s = ((c.offset + t * c.speed) % (2 * SPAN)) - SPAN;
      const along = c.dir * s;
      if (c.axis === 'x') g.position.set(along, 0.05, c.lane);
      else g.position.set(c.lane, 0.05, along);
    });
  });
  return cars.map((c, i) => (
    <group key={i} ref={(el) => { refs.current[i] = el; }}
      position={c.axis === 'x' ? [c.offset - SPAN, 0.05, c.lane] : [c.lane, 0.05, c.offset - SPAN]}
      rotation={[0, c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI), 0]}>
      <Model name={c.name} scale={CAR_SCALE} shadows={false} position={[0, 0.05, 0]} />
    </group>
  ));
}

// sky and lights come from city/CityCanvas
export default function CityWorld({ traffic = true }) {
  return (
    <>
      <Ground />
      <Roads />
      <StreetLights />
      <Filler />
      <Greenery />
      <School />
      <Traffic running={traffic} />
    </>
  );
}
