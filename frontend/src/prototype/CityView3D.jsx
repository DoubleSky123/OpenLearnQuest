import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CubicBezierLine, Line, OrthographicCamera, QuadraticBezierLine } from '@react-three/drei';
import { Quaternion, Vector3 } from 'three';
import { describeScene } from '../services/heapInterpreter';

/**
 * Isometric Memory City view of one interpreter frame — the 3D condition of
 * the Gate 0 comparison. Draws exactly what HeapView2D draws (both read
 * describeScene). Fixed orthographic camera, no orbit; frameloop="demand" so a
 * still city doesn't redraw 60 times a second (eng review R2, R11).
 *
 * Labels are plain DOM in an overlay, placed by projecting their 3D anchors
 * through the fixed camera. (drei's <Html> creates a React root per label and,
 * under React 19, throws removeChild errors when the Canvas unmounts.)
 */
const SPACING = 2.4;
const HEIGHT = 1.2;
const LOOK_AT = [0, 0.6, 0];
const Y_AXIS = new Vector3(0, 1, 0);

function Arrowhead({ from, to, color }) {
  const quaternion = useMemo(() => {
    const dir = new Vector3(...to).sub(new Vector3(...from)).normalize();
    return new Quaternion().setFromUnitVectors(Y_AXIS, dir);
  }, [from, to]);
  return (
    <mesh position={to} quaternion={quaternion}>
      <coneGeometry args={[0.1, 0.28, 12]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// New buildings rise out of their plot; invalidate() keeps the demand loop
// rendering only while something is moving.
function Rising({ children, rise }) {
  const ref = useRef();
  const invalidateFrame = useThree((s) => s.invalidate);
  // set once when the building appears — a scale prop would be re-applied on every render
  useLayoutEffect(() => {
    if (rise && ref.current) { ref.current.scale.y = 0.05; invalidateFrame(); }
  }, [rise, invalidateFrame]);
  useFrame(({ invalidate }) => {
    const g = ref.current;
    if (!g || g.scale.y >= 0.99) { if (g) g.scale.y = 1; return; }
    g.scale.y += (1 - g.scale.y) * 0.18;
    invalidate();
  });
  return <group ref={ref}>{children}</group>;
}

function Building({ b, x, picked, clickable, onSelect }) {
  if (b.state === 'freed') {
    const s = 0.55;
    return (
      <Line position={[x, 0.09, 0]} points={[[-s, 0, -s], [s, 0, -s], [s, 0, s], [-s, 0, s], [-s, 0, -s]]}
        color="#94a3b8" dashed dashSize={0.15} gapSize={0.1} lineWidth={1.5} />
    );
  }
  const color = b.state === 'leaked' ? '#c7c9cc' : b.isNew ? '#86efac' : '#f5cf96';
  return (
    <group position={[x, 0, 0]}>
      <Rising rise={b.isNew}>
        <mesh
          position={[0, HEIGHT / 2 + 0.08, 0]}
          onClick={clickable ? (e) => { e.stopPropagation(); onSelect?.(b.addr); } : undefined}
          onPointerOver={clickable ? () => { document.body.style.cursor = 'pointer'; } : undefined}
          onPointerOut={clickable ? () => { document.body.style.cursor = 'default'; } : undefined}
        >
          <boxGeometry args={[1, HEIGHT, 1]} />
          <meshStandardMaterial color={color} transparent={b.state === 'leaked'} opacity={b.state === 'leaked' ? 0.7 : 1}
            emissive={picked ? '#4f46e5' : '#000000'} emissiveIntensity={picked ? 0.45 : 0} />
        </mesh>
        <mesh position={[0, HEIGHT + 0.12, 0]}>
          <boxGeometry args={[1.08, 0.08, 1.08]} />
          <meshStandardMaterial color={b.state === 'leaked' ? '#9ca3af' : '#b45309'} />
        </mesh>
      </Rising>
      {b.state === 'leaked' && (
        <Line points={[[-0.75, 0.45, -0.75], [0.75, 0.45, -0.75], [0.75, 0.45, 0.75], [-0.75, 0.45, 0.75], [-0.75, 0.45, -0.75]]}
          color="#9ca3af" dashed dashSize={0.12} gapSize={0.08} lineWidth={1.5} />
      )}
    </group>
  );
}

function Cable({ fromX, toX, color, dashed }) {
  const lift = HEIGHT + 0.8 + Math.abs(toX - fromX) * 0.18;
  const z = toX < fromX ? 0.35 : -0.15;   // backward cables run on a separate lane
  const start = [fromX + 0.3, HEIGHT + 0.16, z];
  const end = [toX - 0.3, HEIGHT + 0.16, z];
  const mid = [(start[0] + end[0]) / 2, lift, z];
  return (
    <>
      <QuadraticBezierLine start={start} end={end} mid={mid} color={color} lineWidth={2.5} dashed={dashed} dashSize={0.2} gapSize={0.12} />
      <Arrowhead from={mid} to={end} color={color} />
    </>
  );
}

function SelfLoop({ x }) {
  const start = [x + 0.3, HEIGHT + 0.16, 0];
  const end = [x - 0.3, HEIGHT + 0.16, 0];
  const midB = [x - 1.0, HEIGHT + 1.4, 0];
  return (
    <>
      <CubicBezierLine start={start} end={end} midA={[x + 1.0, HEIGHT + 1.4, 0]} midB={midB} color="#475569" lineWidth={2.5} />
      <Arrowhead from={midB} to={end} color="#475569" />
    </>
  );
}

// The fixed isometric camera, zoomed to fit the container.
function FitCamera({ plots }) {
  const size = useThree((s) => s.size);
  const zoom = Math.min(80, size.width / (plots * SPACING * 1.15 + 3), size.height / 6.5);
  return <OrthographicCamera makeDefault position={[9, 9, 9]} zoom={zoom} near={-50} far={100}
    onUpdate={(c) => { c.lookAt(...LOOK_AT); c.updateProjectionMatrix(); }} />;
}

// Hands the overlay a world -> canvas-pixel projection for the current camera.
function Projector({ plots, onChange }) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    const cam = get().camera;
    cam.updateMatrixWorld();
    const view = cam.matrixWorldInverse.clone();
    const proj = cam.projectionMatrix.clone();
    onChange((pos) => {
      const v = new Vector3(...pos).applyMatrix4(view).applyMatrix4(proj);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    });
    get().invalidate();
  }, [get, camera, size, plots, onChange]);
  return null;
}

// Every label the 2D view also shows, anchored in world space.
function labelsFor(scene, xOf, byAddr) {
  const out = [];
  for (const b of scene.buildings) {
    const x = xOf(b.plot);
    out.push({ key: `a-${b.addr}`, at: [x, 0.05, 1.35], cls: 'text-[11px] text-slate-500', text: b.addr });
    if (b.state === 'freed') {
      out.push({ key: `f-${b.addr}`, at: [x, 0.3, 0], cls: 'text-[11px] text-slate-400', text: 'freed' });
      continue;
    }
    out.push({ key: `v-${b.addr}`, at: [x, HEIGHT + 0.75, 0], cls: `text-base font-bold ${b.state === 'leaked' ? 'text-gray-500' : 'text-gray-900'}`, text: String(b.value) });
    if (b.state === 'leaked')
      out.push({ key: `l-${b.addr}`, at: [x, HEIGHT * 0.45, 0.8], cls: 'rounded border border-amber-600 bg-amber-100 px-1 text-[10px] font-bold text-amber-700', text: 'LEAK' });
    if (b.nextKind === 'null')
      out.push({ key: `n-${b.addr}`, at: [x + 0.95, HEIGHT * 0.55, 0], cls: 'text-[10px] text-slate-500', text: '→NULL' });
  }
  for (const [addr, names] of Object.entries(scene.signs)) {
    const b = byAddr.get(addr);
    const top = b.nextKind === 'self' ? HEIGHT + 2.2 : HEIGHT + 1.45;
    const color = b.state === 'freed' ? 'text-red-600' : null;
    names.forEach((name, i) => out.push({
      key: `s-${addr}-${name}`, at: [xOf(b.plot), top + i * 0.42, 0],
      cls: `text-[13px] font-bold ${color ?? (name === 'head' ? 'text-indigo-700' : 'text-amber-700')}`, text: `${name} ↓`,
    }));
  }
  return out;
}

class GLBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function CityView3D({ frame, selectable = false, selected = [], onSelect, onFail }) {
  const scene = describeScene(frame);
  const n = Math.max(scene.buildings.length, 1);
  const xOf = (plot) => (plot - (n - 1) / 2) * SPACING;
  const byAddr = new Map(scene.buildings.map(b => [b.addr, b]));
  const picked = new Set(selected);

  const [project, setProject] = useState(null);
  const onProjector = useCallback((fn) => setProject(() => fn), []);

  // R3F force-loses the context itself when the Canvas unmounts (next program,
  // switching views); only a loss while we're still on screen is a real failure.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  return (
    <GLBoundary onFail={onFail}>
      <div className="relative h-full w-full overflow-hidden">
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              setTimeout(() => { if (mounted.current && gl.domElement.isConnected) onFail?.(); }, 0);
            });
          }}
        >
          <FitCamera plots={n} />
          <Projector plots={n} onChange={onProjector} />
          <ambientLight intensity={0.75} />
          <directionalLight position={[6, 12, 4]} intensity={1.1} />
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[n * SPACING + 6, 8]} />
            <meshStandardMaterial color="#e8eee5" />
          </mesh>
          {scene.buildings.map(b => {
            const x = xOf(b.plot);
            return (
              <group key={b.addr}>
                <mesh position={[x, 0.04, 0]}>
                  <boxGeometry args={[1.6, 0.08, 1.6]} />
                  <meshStandardMaterial color="#d6dbe1" />
                </mesh>
                <Building b={b} x={x} picked={picked.has(b.addr)} clickable={selectable && b.state !== 'freed'} onSelect={onSelect} />
                {b.nextKind === 'self' && <SelfLoop x={x} />}
                {(b.nextKind === 'node' || b.nextKind === 'freed') && (
                  <Cable fromX={x} toX={xOf(byAddr.get(b.next).plot)}
                    color={b.nextKind === 'freed' ? '#dc2626' : '#475569'} dashed={b.nextKind === 'freed'} />
                )}
              </group>
            );
          })}
        </Canvas>
        {project && (
          <div className="pointer-events-none absolute inset-0 select-none">
            {labelsFor(scene, xOf, byAddr).map(l => {
              const p = project(l.at);
              return (
                <span key={l.key} className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono ${l.cls}`}
                  style={{ left: p.x, top: p.y }}>{l.text}</span>
              );
            })}
          </div>
        )}
      </div>
    </GLBoundary>
  );
}
