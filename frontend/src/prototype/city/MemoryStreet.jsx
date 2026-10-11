import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CubicBezierLine, QuadraticBezierLine } from '@react-three/drei';
import { QuadraticBezierCurve3, Vector3 } from 'three';
import Model from '../../city/Model';
import { CAR_SCALE } from '../../city/models';
import { LOT_PAD as PAD, SLOTS, VEHICLE, buildingFor, parking, roofY, tintFor, xOfPlot } from './layout';

/**
 * List Avenue: the memory lots of one interpreter frame, laid out by plot
 * (address), never by list order (eng review R2). Reads describeScene() only.
 *   live    a real building; leaked -> greyed and fenced off (C has no GC, R3)
 *   freed   rubble on an empty lot (only free() demolishes)
 *   new     under construction: crane, fence, the building rising
 *   next    a glowing cable between rooftops; pulses travel in its direction;
 *           red dashed when it points into a freed lot
 *   vars    each pointer variable is a vehicle parked at the lot it points to;
 *           head is the highway sign at the start of the avenue
 */
function Lot({ x, picked }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, PAD / 2, 0]} receiveShadow>
        <boxGeometry args={[1.42, PAD, 1.42]} />
        <meshStandardMaterial color="#cfd5dc" />
      </mesh>
      <mesh position={[0, PAD + 0.004, 0.62]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.42, 0.18]} />
        <meshStandardMaterial color="#7cc35a" />
      </mesh>
      {/* memory plots glow faintly — this street is the heap */}
      {[[0, 0.71, 1.46, 0.035], [0, -0.71, 1.46, 0.035], [0.71, 0, 0.035, 1.46], [-0.71, 0, 0.035, 1.46]].map(([dx, dz, w, d], i) => (
        <mesh key={i} position={[dx, PAD + 0.006, dz]}>
          <boxGeometry args={[w, 0.012, d]} />
          <meshBasicMaterial color="#38bdf8" toneMapped={false} />
        </mesh>
      ))}
      {picked && (
        <mesh position={[0, PAD + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.72, 0.84, 48]} />
          <meshBasicMaterial color="#6366f1" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function Fence({ size = 1.3, kind = 'roads/construction-fence' }) {
  const posts = [];
  const n = 3;
  for (let i = 0; i < n; i++) {
    const t = -size / 2 + (i + 0.5) * (size / n);
    posts.push([t, -size / 2, Math.PI / 2], [t, size / 2, Math.PI / 2], [-size / 2, t, 0], [size / 2, t, 0]);
  }
  return posts.map(([x, z, ry], i) => <Model key={i} name={kind} position={[x, PAD, z]} rotation={[0, ry, 0]} scale={1.15} />);
}

function Crane({ height }) {
  return (
    <group position={[-0.55, PAD, -0.5]}>
      <mesh position={[0, height / 2 + 0.6, 0]} castShadow>
        <boxGeometry args={[0.07, height + 1.2, 0.07]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={[0.45, height + 1.2, 0]} castShadow>
        <boxGeometry args={[1.5, 0.06, 0.06]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={[1.1, height + 0.85, 0]}>
        <boxGeometry args={[0.01, 0.7, 0.01]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
    </group>
  );
}

// New buildings grow out of the lot.
function Rising({ rise, children }) {
  const ref = useRef();
  const started = useRef(false);
  useFrame(({ invalidate }) => {
    const g = ref.current;
    if (!g) return;
    if (rise && !started.current) { g.scale.y = 0.04; started.current = true; }
    if (g.scale.y < 1) {
      g.scale.y = Math.min(1, g.scale.y + (1 - g.scale.y) * 0.06 + 0.002);
      invalidate();   // keep going in the on-demand (low quality) loop
    }
  });
  return <group ref={ref}>{children}</group>;
}

function NodeBuilding({ b, x, picked, clickable, onSelect }) {
  const spec = buildingFor(b.addr);
  const handlers = clickable ? {
    onClick: (e) => { e.stopPropagation(); onSelect?.(b.addr); },
    onPointerOver: () => { document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { document.body.style.cursor = 'default'; },
  } : {};
  if (b.state === 'freed') {
    return (
      <group position={[x, 0, 0]}>
        <Lot x={0} picked={false} />
        <Model name="cars/debris-plate-a" position={[-0.2, PAD, 0.05]} rotation={[0, 0.6, 0]} scale={0.55} />
        <Model name="cars/debris-door" position={[0.25, PAD, -0.2]} rotation={[0.2, 2.1, 0.4]} scale={0.5} />
        <Model name="cars/debris-tire" position={[0.1, PAD + 0.1, 0.3]} rotation={[1.2, 0, 0]} scale={0.4} />
        <Model name="roads/construction-barrier" position={[-0.55, PAD, 0.55]} scale={1.3} />
        <Model name="roads/construction-barrier" position={[0.55, PAD, 0.55]} scale={1.3} />
        <Model name="roads/construction-cone" position={[0, PAD, 0.6]} scale={1.6} />
      </group>
    );
  }
  return (
    <group position={[x, 0, 0]}>
      <Lot x={0} picked={picked} />
      <group position={[0, PAD, 0]} {...handlers}>
        <Rising rise={b.isNew}>
          <Model name={spec.name} tint={b.state === 'leaked' ? 'leaked' : tintFor(b.addr)} />
        </Rising>
      </group>
      {b.state === 'leaked' && <Fence />}
      {b.isNew && (
        <>
          <Crane height={spec.height} />
          <Model name="roads/construction-light" position={[0.6, PAD, 0.62]} scale={1.4} />
          <Model name="roads/construction-cone" position={[0.4, PAD, 0.66]} scale={1.6} />
          <Model name="roads/construction-cone" position={[-0.4, PAD, 0.66]} scale={1.6} />
        </>
      )}
    </group>
  );
}

const CABLE = '#22d3ee';
const CABLE_FREED = '#f43f5e';

function Pulse({ curve, color, speed = 0.55, phase = 0 }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.getElapsedTime() * speed + phase) % 1;
    ref.current.position.copy(curve.getPoint(t));
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.07, 12, 12]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

function Cable({ from, to, freed }) {
  const back = to.x < from.x;
  const start = [from.x + (back ? -0.25 : 0.25), from.y + 0.05, back ? 0.18 : -0.18];
  const end = [to.x + (back ? 0.25 : -0.25), to.y + 0.05, back ? 0.18 : -0.18];
  const lift = Math.max(start[1], end[1]) + 0.7 + Math.abs(to.x - from.x) * 0.16 + (back ? 0.4 : 0);
  const mid = [(start[0] + end[0]) / 2, lift, back ? 0.35 : -0.35];
  const curve = new QuadraticBezierCurve3(new Vector3(...start), new Vector3(...mid), new Vector3(...end));
  const color = freed ? CABLE_FREED : CABLE;
  return (
    <>
      <QuadraticBezierLine start={start} end={end} mid={mid} color={color} lineWidth={3.2} dashed={freed}
        dashSize={0.18} gapSize={0.1} toneMapped={false} />
      <Pulse curve={curve} color={color} />
      <Pulse curve={curve} color={color} phase={0.5} />
    </>
  );
}

function SelfLoop({ x, y }) {
  const start = [x + 0.25, y + 0.05, 0];
  const end = [x - 0.25, y + 0.05, 0];
  return <CubicBezierLine start={start} end={end} midA={[x + 1, y + 1.4, 0]} midB={[x - 1, y + 1.4, 0]} color={CABLE} lineWidth={3.2} toneMapped={false} />;
}

// A pointer variable's vehicle; drives to its new lot instead of teleporting.
function Vehicle({ name, target }) {
  const ref = useRef();
  // placed once; afterwards only the frame loop moves it (a position prop would teleport)
  const [start] = useState(target);
  const goal = new Vector3(...target);
  useFrame(({ invalidate }, dt) => {
    const g = ref.current;
    if (!g || g.position.distanceTo(goal) < 0.002) return;
    g.position.lerp(goal, Math.min(1, dt * 3.2));
    invalidate();   // keep going in the on-demand (low quality) loop
  });
  return (
    <group ref={ref} position={start} rotation={[0, Math.PI / 2, 0]}>
      <Model name={VEHICLE[name] ?? 'cars/sedan'} scale={CAR_SCALE * 1.15} />
    </group>
  );
}

export default function MemoryStreet({ scene, selectable, picked, onSelect }) {
  const byAddr = new Map(scene.buildings.map(b => [b.addr, b]));
  const spots = parking(scene);
  const occupied = new Set(scene.buildings.map(b => b.plot));
  const headAddr = Object.entries(scene.signs).find(([, names]) => names.includes('head'))?.[0];
  const headX = headAddr ? xOfPlot(byAddr.get(headAddr).plot) : xOfPlot(0);
  return (
    <group>
      {/* empty lots waiting for createNode */}
      {Array.from({ length: SLOTS }, (_, p) => p).filter(p => !occupied.has(p)).map(p => <Lot key={`e${p}`} x={xOfPlot(p)} picked={false} />)}
      {scene.buildings.map(b => (
        <NodeBuilding key={b.addr} b={b} x={xOfPlot(b.plot)} picked={picked.has(b.addr)}
          clickable={selectable && b.state !== 'freed'} onSelect={onSelect} />
      ))}
      {scene.buildings.map(b => {
        const x = xOfPlot(b.plot);
        if (b.nextKind === 'self') return <SelfLoop key={`c${b.addr}`} x={x} y={roofY(b.addr)} />;
        if (b.nextKind !== 'node' && b.nextKind !== 'freed') return null;
        const t = byAddr.get(b.next);
        return <Cable key={`c${b.addr}`} from={{ x, y: roofY(b.addr) }} to={{ x: xOfPlot(t.plot), y: t.state === 'freed' ? PAD + 0.2 : roofY(t.addr) }} freed={b.nextKind === 'freed'} />;
      })}
      {Object.entries(spots).map(([name, target]) => <Vehicle key={name} name={name} target={target} />)}
      <group position={[headX - 0.78, 0, 0.72]}>
        <Model name="roads/sign-highway" rotation={[0, Math.PI / 2, 0]} scale={1.25} />
      </group>
    </group>
  );
}
