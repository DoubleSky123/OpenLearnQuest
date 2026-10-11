import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, useProgress } from '@react-three/drei';
import { Bloom, EffectComposer, HueSaturation, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { LabelLayer, LabelSync } from './Labels';

/**
 * Shared 3D city canvas: daylight sky + sun shadows, orbit camera within
 * limits (with "Reset view"), DOM labels, and a per-viewer quality switch.
 *   High: shadows, ambient occlusion, bloom, every-frame rendering (traffic,
 *         pulses, construction). Low: none of it, rendered on demand.
 * `children` is a function of the quality ('high' | 'low').
 * A lost WebGL context while on screen calls onFail (R3F force-loses the
 * context itself on unmount, which is not a failure).
 */
const QUALITY_KEY = 'memoryCity.quality';

function loadQuality() {
  try { return localStorage.getItem(QUALITY_KEY) === 'low' ? 'low' : 'high'; } catch { return 'high'; }
}
function saveQuality(q) {
  try { localStorage.setItem(QUALITY_KEY, q); } catch { /* per-viewer convenience only */ }
}

class GLBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Loading() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-sky-100/80 text-sm font-medium text-sky-900">
      Building the city… {Math.round(progress)}%
    </div>
  );
}

function Lighting({ shadows, fog }) {
  return (
    <>
      <Sky sunPosition={[60, 45, 40]} turbidity={3} rayleigh={0.6} mieCoefficient={0.004} />
      <fog attach="fog" args={['#d6e9f7', fog[0], fog[1]]} />
      <hemisphereLight args={['#dff1ff', '#6f9c4f', 0.85]} />
      <directionalLight
        position={[12, 18, 9]} intensity={2.4} castShadow={shadows}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14}
        shadow-camera-near={1} shadow-camera-far={60}
      />
      {/* soft sky fill from the far side, so woods seen against the sun aren't black */}
      <directionalLight position={[-14, 10, -12]} intensity={0.75} color="#d4e6ff" />
    </>
  );
}

const NO_LABELS = [];
const DEFAULT_BOUNDS = { x: [-9, 9], y: [0, 3], z: [-7, 9] };
const DEFAULT_FOG = [26, 70];   // near, far

export default function CityCanvas({
  home, labels = NO_LABELS, onFail, bounds = DEFAULT_BOUNDS, distance = [4.5, 30], fog = DEFAULT_FOG, children,
}) {
  const [quality, setQuality] = useState(loadQuality);
  const high = quality === 'high';
  const controls = useRef();

  const specsRef = useRef(labels);
  const elsRef = useRef(new Map());
  useLayoutEffect(() => { specsRef.current = labels; }, [labels]);
  const onLabelElement = useCallback((key, el) => {
    if (el) elsRef.current.set(key, el); else elsRef.current.delete(key);
  }, []);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const clamp = () => {
    const t = controls.current?.target;
    if (!t) return;
    t.x = Math.max(bounds.x[0], Math.min(bounds.x[1], t.x));
    t.y = Math.max(bounds.y[0], Math.min(bounds.y[1], t.y));
    t.z = Math.max(bounds.z[0], Math.min(bounds.z[1], t.z));
  };
  const resetView = () => {
    const c = controls.current;
    if (!c) return;
    c.object.position.set(...home.position);
    c.target.set(...home.target);
    c.update();
  };
  const toggleQuality = () => {
    const q = high ? 'low' : 'high';
    saveQuality(q);
    setQuality(q);
  };

  return (
    <GLBoundary onFail={onFail}>
      <div className="relative h-full w-full overflow-hidden bg-sky-100">
        <Canvas
          shadows={high}
          dpr={[1, 1.75]}
          frameloop={high ? 'always' : 'demand'}
          camera={{ position: home.position, fov: 38, near: 0.1, far: 200 }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              setTimeout(() => { if (mounted.current && gl.domElement.isConnected) onFail?.(); }, 0);
            });
          }}
        >
          <Suspense fallback={null}>
            <Lighting shadows={high} fog={fog} />
            {children(quality)}
            {high && (
              <EffectComposer multisampling={0}>
                <N8AO halfRes aoRadius={1.2} intensity={2.2} distanceFalloff={0.8} />
                <Bloom mipmapBlur luminanceThreshold={0.95} intensity={0.9} />
                <HueSaturation saturation={0.18} />
                <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
                <Vignette offset={0.3} darkness={0.4} />
              </EffectComposer>
            )}
          </Suspense>
          <OrbitControls ref={controls} makeDefault target={home.target} enableDamping dampingFactor={0.08}
            minDistance={distance[0]} maxDistance={distance[1]} minPolarAngle={0.42} maxPolarAngle={1.22}
            onChange={clamp} />
          <LabelSync specsRef={specsRef} elsRef={elsRef} />
        </Canvas>
        <LabelLayer specs={labels} onElement={onLabelElement} />
        <Loading />
        <div className="absolute right-2 top-2 z-10 flex gap-1.5">
          <button onClick={resetView} className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow hover:bg-white">Reset view</button>
          <button onClick={toggleQuality} className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow hover:bg-white">
            Quality: {high ? 'High' : 'Low'}
          </button>
        </div>
      </div>
    </GLBoundary>
  );
}
