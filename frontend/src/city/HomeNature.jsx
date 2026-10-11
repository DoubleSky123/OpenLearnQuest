import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import Model from './Model';
import InstancedModel from './Instanced';
import { byModel, natureItems } from './countryside';
import { peakGeometry, lakeGeometry } from './terrain';
import { CAMPSITE, HILLS, HILL_SPREAD, LAKE, MOUNTAINS, MOUNTAIN_SPREAD, lakePoint } from './homeLayout';

/**
 * The countryside around the home city: snowy mountains on the horizon, green
 * foothills, a lake with a dock, a canoe and a campsite, swaying forests,
 * meadows of wildflowers and a flock of birds. Decoration only.
 * `animate` (High quality): trees sway, birds fly, the canoe bobs, the fire flickers.
 */
const flat = [-Math.PI / 2, 0, 0];

// every mountain is a main peak with two lower shoulders, so the ranges read
// as massifs rather than a row of cones
function Peaks() {
  const peaks = useMemo(() => [
    ...MOUNTAINS.flatMap(([x, z, h], i) => [[0, 0, 1], [0.62, 0.55, 0.62], [0.58, 3.4, 0.7]].map(([d, a, k], j) => {
      const ang = a + i * 1.37;
      return { x: x + Math.cos(ang) * d * h, z: z + Math.sin(ang) * d * h * 0.5, geometry: peakGeometry({ radius: h * k * MOUNTAIN_SPREAD, height: h * k, seed: 101 + i * 7 + j }) };
    })),
    ...HILLS.map(([x, z, h], i) => ({ x, z, geometry: peakGeometry({ radius: h * HILL_SPREAD, height: h, seed: 707 + i, kind: 'hill' }) })),
  ], []);
  return peaks.map((p, i) => (
    <mesh key={i} geometry={p.geometry} position={[p.x, -0.25, p.z]} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={1} />
    </mesh>
  ));
}

function Lake({ animate }) {
  const water = useMemo(() => lakeGeometry(0), []);
  const shore = useMemo(() => lakeGeometry(0.16), []);
  const canoe = useRef();
  const flame = useRef();
  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    if (canoe.current) {
      canoe.current.rotation.z = Math.sin(t * 1.2) * 0.06;
      canoe.current.position.y = 0.01 + Math.sin(t * 1.6) * 0.012;
    }
    if (flame.current) flame.current.scale.set(1, 0.8 + 0.35 * Math.abs(Math.sin(t * 9) + Math.sin(t * 13.7) * 0.5), 1);
  });

  // dock: from the south-east shore (the side facing town) out over the water
  const a = Math.PI * 0.2;
  const [sx, sz] = lakePoint(a, 1.05);
  const [ix, iz] = lakePoint(a, 0.62);
  const dockAngle = Math.atan2(ix - sx, iz - sz);
  const dockLen = Math.hypot(ix - sx, iz - sz);
  const [cx, cz] = CAMPSITE;
  const lilies = [[0.95, 0.55], [1.6, 0.42], [2.3, 0.6], [3.4, 0.5], [3.7, 0.38], [4.4, 0.58], [5.2, 0.47], [5.5, 0.62]];
  const reeds = Array.from({ length: 26 }, (_, i) => (i / 26) * Math.PI * 2 + 0.11).filter((r) => Math.abs(r - a) > 0.3);

  return (
    <group>
      <mesh geometry={shore} rotation={flat} position={[LAKE.x, -0.012, LAKE.z]} receiveShadow>
        <meshStandardMaterial color="#e6d6a3" roughness={1} />
      </mesh>
      <mesh geometry={water} rotation={flat} position={[LAKE.x, -0.004, LAKE.z]}>
        <meshStandardMaterial color="#38a9e0" roughness={0.08} metalness={0.15} />
      </mesh>
      {/* dock */}
      <group position={[sx, 0, sz]} rotation={[0, dockAngle, 0]}>
        <mesh position={[0, 0.06, dockLen / 2]} castShadow receiveShadow>
          <boxGeometry args={[0.42, 0.04, dockLen]} />
          <meshStandardMaterial color="#a8733f" roughness={0.9} />
        </mesh>
        {[0.15, dockLen / 2, dockLen - 0.08].flatMap((z) => [-0.19, 0.19].map((x) => (
          <mesh key={`${x}${z}`} position={[x, 0.03, z]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.14, 6]} />
            <meshStandardMaterial color="#7a5230" />
          </mesh>
        )))}
      </group>
      <group ref={canoe} position={[ix + 0.45, 0.01, iz - 0.15]} rotation={[0, dockAngle + 1.2, 0]}>
        <Model name="nature/canoe" scale={1.1} />
      </group>
      {lilies.map(([ang, k], i) => {
        const [x, z] = lakePoint(ang, k + 0.25);
        return <Model key={i} name={i % 3 ? 'nature/lily_small' : 'nature/lily_large'} position={[x, 0, z]} rotation={[0, i * 2.1, 0]} scale={1.3} shadows={false} />;
      })}
      {reeds.map((ang, i) => {
        const [x, z] = lakePoint(ang, 1.0 + (i % 3) * 0.04);
        return <Model key={i} name="nature/grass_large" position={[x, 0, z]} rotation={[0, i, 0]} scale={1.2 + (i % 4) * 0.15} shadows={false} />;
      })}
      {/* campsite on the north shore */}
      <Model name="nature/tent_detailedOpen" position={[cx - 0.55, 0, cz - 0.3]} rotation={[0, 0.5, 0]} scale={1.5} />
      <group position={[cx + 0.5, 0, cz + 0.35]}>
        <Model name="nature/campfire_stones" scale={1.4} />
        <mesh ref={flame} position={[0, 0.12, 0]}>
          <coneGeometry args={[0.09, 0.26, 7]} />
          <meshBasicMaterial color="#ff8a2a" toneMapped={false} />
        </mesh>
        <Model name="nature/log" position={[0.5, 0, -0.1]} rotation={[0, 0.3, 0]} scale={1.2} />
        <Model name="nature/log" position={[-0.25, 0, 0.5]} rotation={[0, 1.7, 0]} scale={1.2} />
      </group>
    </group>
  );
}

function Forest({ animate }) {
  const { trees, props } = useMemo(() => natureItems(), []);
  const treeSets = useMemo(() => byModel(trees), [trees]);
  const propSets = useMemo(() => byModel(props), [props]);
  return (
    <>
      {treeSets.map(([name, items]) => <InstancedModel key={name} name={name} items={items} sway={animate} />)}
      {propSets.map(([name, items]) => <InstancedModel key={name} name={name} items={items} castShadow={false} />)}
    </>
  );
}

// A small flock wheeling over the lake and the woods north of town.
const BIRDS = Array.from({ length: 9 }, (_, i) => ({ lag: i * 0.11 + (i % 3) * 0.03, lift: ((i * 37) % 7) * 0.08, side: ((i * 53) % 5 - 2) * 0.22, flap: i * 1.3 }));
function Birds({ animate }) {
  const refs = useRef([]);
  useFrame(({ clock }) => {
    const t = animate ? clock.getElapsedTime() : 3;
    BIRDS.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = (t - b.lag * 6) * 0.22;
      const rx = 7 + b.side, rz = 4.5 + b.side * 0.6;
      g.position.set(-6 + Math.cos(a) * rx, 5.2 + b.lift + Math.sin(t * 0.7 + i) * 0.15, -9 + Math.sin(a) * rz);
      g.rotation.y = Math.atan2(-Math.sin(a) * rx, Math.cos(a) * rz) + Math.PI;
      const w = Math.sin(t * 8 + b.flap) * 0.55;
      g.children[0].rotation.z = w;
      g.children[1].rotation.z = -w;
    });
  });
  return BIRDS.map((_, i) => (
    <group key={i} ref={(el) => { refs.current[i] = el; }}>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.11, 0, 0]}>
            <boxGeometry args={[0.22, 0.012, 0.07]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        </group>
      ))}
    </group>
  ));
}

export default function HomeNature({ animate }) {
  return (
    <>
      <Peaks />
      <Lake animate={animate} />
      <Forest animate={animate} />
      <Birds animate={animate} />
    </>
  );
}
