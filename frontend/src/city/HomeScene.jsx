import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useCursor } from '@react-three/drei';
import Model from './Model';
import InstancedModel from './Instanced';
import HomeNature from './HomeNature';
import HomeTraffic from './HomeTraffic';
import { TREES, TREE_SCALE } from './models';
import { BACK_Z, CAMPUS, CROSS_X, FRONT_Z, LOT_SIZE, LOTS, RIVER, SCHOOL, SPAN, lookFor } from './homeLayout';

/**
 * The home city: the school on its campus, roads with traffic, empty lots, and
 * the countryside (HomeNature). Earned buildings stand on the lots the student
 * chose; while placing, the free lots glow and a click picks one. Layout is
 * seeded, so every student starts from the same land.
 */
const AVENUES = [FRONT_Z, BACK_Z];
const RISE_SECONDS = 1.6;
const CLICK_SLOP = 6;   // px of pointer travel still counted as a click, not an orbit drag

const flat = [-Math.PI / 2, 0, 0];
const CAMPUS_LEAVES = ['#45c957', '#2fab5c', '#66c94f'];   // same greens as the countryside's tinted woods

function Ground() {
  const [cx0, cx1] = CAMPUS.x;
  const [cz0, cz1] = CAMPUS.z;
  const w = cx1 - cx0, d = cz1 - cz0, mx = (cx0 + cx1) / 2, mz = (cz0 + cz1) / 2;
  return (
    <>
      <mesh rotation={flat} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[260, 260]} />
        <meshStandardMaterial color="#8fcf63" />
      </mesh>
      {/* campus: pavement edge, lawn, plaza in front of the school */}
      <mesh rotation={flat} position={[mx, -0.01, mz]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#d8dde3" />
      </mesh>
      <mesh rotation={flat} position={[mx, -0.005, mz]} receiveShadow>
        <planeGeometry args={[w - 0.4, d - 0.4]} />
        <meshStandardMaterial color="#7cc257" />
      </mesh>
      <mesh rotation={flat} position={[0, 0.002, 1.35]} receiveShadow>
        <planeGeometry args={[4.2, 2.5]} />
        <meshStandardMaterial color="#ebe3d3" />
      </mesh>
      <mesh rotation={flat} position={[0, 0.002, 2.6]} receiveShadow>
        <planeGeometry args={[1.2, 0.3]} />
        <meshStandardMaterial color="#ebe3d3" />
      </mesh>
      {/* river */}
      <mesh rotation={flat} position={[0, -0.005, (RIVER[0] + RIVER[1]) / 2]}>
        <planeGeometry args={[260, RIVER[1] - RIVER[0]]} />
        <meshStandardMaterial color="#2fa6e0" roughness={0.12} metalness={0.1} />
      </mesh>
    </>
  );
}

function Roads() {
  const { straight, crossings } = useMemo(() => {
    const straight = [];
    for (const z of AVENUES)
      for (let x = -SPAN; x <= SPAN; x += 1)
        if (!CROSS_X.some(cx => Math.abs(cx - x) < 1)) straight.push({ position: [x, 0.01, z], ry: Math.PI / 2 });
    for (const x of CROSS_X)
      for (let z = -SPAN; z <= SPAN; z += 1)
        if (!AVENUES.some(az => Math.abs(az - z) < 1)) straight.push({ position: [x, 0.012, z], ry: 0 });
    const crossings = CROSS_X.flatMap(x => AVENUES.map(z => ({ position: [x, 0.014, z], ry: 0 })));
    return { straight, crossings };
  }, []);
  return (
    <>
      <InstancedModel name="roads/road-straight" items={straight} castShadow={false} />
      <InstancedModel name="roads/road-crossroad-line" items={crossings} castShadow={false} />
      {CROSS_X.flatMap(x => [-0.55, 0.55].map(dx => (   // bridge rails over the river
        <mesh key={`${x}${dx}`} position={[x + dx, 0.12, (RIVER[0] + RIVER[1]) / 2]} castShadow>
          <boxGeometry args={[0.08, 0.2, RIVER[1] - RIVER[0] + 0.4]} />
          <meshStandardMaterial color="#e7e5e4" />
        </mesh>
      )))}
    </>
  );
}

function StreetLights() {
  const lights = [];
  for (const x of [-3.3, -1.1, 1.1, 3.3]) lights.push([x, FRONT_Z - 0.62, 0]);
  for (const z of [-2.4, -0.2]) {
    lights.push([CROSS_X[0] + 0.62, z, -Math.PI / 2]);
    lights.push([CROSS_X[1] - 0.62, z, Math.PI / 2]);
  }
  return lights.map(([x, z, ry], i) => <Model key={i} name="roads/light-square" position={[x, 0, z]} rotation={[0, ry, 0]} scale={1.2} />);
}

function Fountain({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.54, 0.16, 28]} />
        <meshStandardMaterial color="#cfd4da" />
      </mesh>
      <mesh position={[0, 0.165, 0]}>
        <cylinderGeometry args={[0.43, 0.43, 0.02, 28]} />
        <meshStandardMaterial color="#5ec8f2" roughness={0.1} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 0.4, 12]} />
        <meshStandardMaterial color="#cfd4da" />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.08, 0.08, 20]} />
        <meshStandardMaterial color="#cfd4da" />
      </mesh>
    </group>
  );
}

function School({ onEnter }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const [x, , z] = SCHOOL.position;
  return (
    <group>
      <group
        onClick={(e) => { e.stopPropagation(); if (e.delta <= CLICK_SLOP) onEnter(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <Model name={SCHOOL.model} position={SCHOOL.position} scale={SCHOOL.scale} tint={hovered ? '#fff6dc' : '#ffe7b0'} />
      </group>
      <Fountain position={[0, 0, 1.4]} />
      {/* flag */}
      <mesh position={[x - 2.6, 1.1, z + 3.0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 2.2, 8]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[x - 2.35, 2.0, z + 3.0]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.02]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      {[[-1.9, 0.35], [1.9, 0.35], [-1.9, 2.35], [1.9, 2.35]].map(([px, pz]) => (
        <Model key={`${px}${pz}`} name="suburban/planter" position={[px, 0, pz]} scale={1.3} />
      ))}
      {[[-3.25, -2.75], [3.25, -2.75], [-3.25, -0.9], [3.25, -0.9], [-3.25, 1.2], [3.25, 1.2]].map(([tx, tz], i) => (
        <Model key={i} name={TREES[i % TREES.length]} position={[tx, 0, tz]} rotation={[0, i * 1.7, 0]} scale={TREE_SCALE * 1.1} leafTint={CAMPUS_LEAVES[i % CAMPUS_LEAVES.length]} />
      ))}
    </group>
  );
}

function EmptyLot({ at, target, pulse, onPick }) {
  const [hovered, setHovered] = useState(false);
  useCursor(target && hovered);
  const frame = useRef([]);
  useFrame(({ clock }) => {
    if (!target || !pulse) return;
    const o = 0.55 + 0.4 * Math.sin(clock.getElapsedTime() * 4);
    frame.current.forEach((m) => { if (m) m.material.opacity = hovered ? 1 : o; });
  });
  const [x, z] = at;
  const half = LOT_SIZE / 2;
  const edges = [[0, -half, LOT_SIZE, 0.07], [0, half, LOT_SIZE, 0.07], [-half, 0, 0.07, LOT_SIZE], [half, 0, 0.07, LOT_SIZE]];
  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 0.02, 0]} receiveShadow
        onClick={(e) => { if (!target) return; e.stopPropagation(); if (e.delta <= CLICK_SLOP) onPick(); }}
        onPointerOver={(e) => { if (!target) return; e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[LOT_SIZE, 0.04, LOT_SIZE]} />
        <meshStandardMaterial color={target && hovered ? '#b7e4a8' : '#c49a6c'} roughness={1} />
      </mesh>
      {[-0.42, 0, 0.42].map(fz => (   // furrows
        <mesh key={fz} rotation={flat} position={[0, 0.042, fz]}>
          <planeGeometry args={[LOT_SIZE - 0.25, 0.08]} />
          <meshStandardMaterial color="#a97f55" roughness={1} />
        </mesh>
      ))}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (   // survey stakes
        <group key={`${sx}${sz}`} position={[sx * (half - 0.08), 0, sz * (half - 0.08)]}>
          <mesh position={[0, 0.13, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.26, 6]} />
            <meshStandardMaterial color="#f5f5f4" />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[0.06, 0.05, 0.06]} />
            <meshStandardMaterial color="#f97316" />
          </mesh>
        </group>
      ))}
      {target && edges.map(([ex, ez, w, d], i) => (
        <mesh key={i} position={[ex, 0.07, ez]} ref={(el) => { frame.current[i] = el; }}>
          <boxGeometry args={[w, 0.04, d]} />
          <meshBasicMaterial color="#4ade80" toneMapped={false} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function BuiltLot({ at, buildingKey, rise }) {
  const look = lookFor(buildingKey);
  const group = useRef();
  const dust = useRef();
  const progress = useRef(rise ? 0 : 1);
  const [initialScale] = useState(() => [1, rise ? 0.001 : 1, 1]);
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, dt) => {
    if (progress.current >= 1 || !group.current) return;
    progress.current = Math.min(1, progress.current + dt / RISE_SECONDS);
    const p = progress.current;
    group.current.scale.y = Math.max(0.001, 1 - (1 - p) ** 3);
    if (dust.current) {
      dust.current.visible = p < 1;
      dust.current.scale.setScalar(0.7 + p * 1.5);
      dust.current.children.forEach((m) => { m.material.opacity = 0.75 * (1 - p); });
    }
    invalidate();   // keep animating in on-demand (Low quality) mode too
  });
  const [x, z] = at;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[LOT_SIZE, 0.04, LOT_SIZE]} />
        <meshStandardMaterial color="#d4d8dd" />
      </mesh>
      <group ref={group} position={[0, 0.04, 0]} scale={initialScale}>
        <Model name={look.model} tint={look.tint} />
      </group>
      {rise && (
        <group ref={dust}>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55]}>
                <sphereGeometry args={[0.16, 10, 8]} />
                <meshStandardMaterial color="#f5efe6" transparent opacity={0.75} depthWrite={false} />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
}

export default function HomeScene({ quality, placed, placing, justPlaced, onPickLot, onEnterSchool }) {
  const builtOn = new Map(placed.map(b => [b.lot, b]));
  return (
    <>
      <Ground />
      <Roads />
      <StreetLights />
      <HomeNature animate={quality === 'high'} />
      <HomeTraffic running={quality === 'high'} />
      <School onEnter={onEnterSchool} />
      {LOTS.map((at, lot) => {
        const b = builtOn.get(lot);
        return b
          ? <BuiltLot key={`${lot}-${b.building_key}`} at={at} buildingKey={b.building_key} rise={justPlaced === `${b.building_key}:${lot}`} />
          : <EmptyLot key={`${lot}-empty`} at={at} target={!!placing} pulse={quality === 'high'} onPick={() => onPickLot(lot)} />;
      })}
    </>
  );
}
