import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import Model from './Model';
import { CAR_SCALE } from './models';
import { carPose, makeTraffic, stepTraffic } from './traffic';
import { BACK_Z, CROSS_X, FRONT_Z } from './homeLayout';

/**
 * Cars on the home city's roads, driven by the traffic simulation (traffic.js);
 * moved through refs, so traffic never re-renders React. Low quality renders on
 * demand, so the cars stand still there.
 */
const MAX_STEP = 1 / 20;   // after a stalled frame (tab in background), catch up in small steps

export default function HomeTraffic({ running }) {
  const initial = useMemo(() => makeTraffic(99), []);
  const sim = useRef(null);
  const groups = useRef([]);
  const clock = useRef(0);

  useFrame((_, delta) => {
    if (!running) return;
    if (!sim.current) sim.current = initial.map((c) => ({ ...c }));
    let left = Math.min(delta, 0.5);
    while (left > 1e-6) {
      const dt = Math.min(MAX_STEP, left);
      clock.current += dt;
      stepTraffic(sim.current, dt, clock.current);
      left -= dt;
    }
    sim.current.forEach((c, i) => {
      const g = groups.current[i];
      if (!g) return;
      const p = carPose(c);
      g.position.set(p.x, 0.05, p.z);
      g.rotation.y = p.heading;
      g.scale.setScalar(p.fade);
    });
  });

  return (
    <>
      {initial.map((c, i) => {
        const p = carPose(c);
        return (
          <group key={c.id} ref={(el) => { groups.current[i] = el; }} position={[p.x, 0.05, p.z]} rotation={[0, p.heading, 0]} scale={p.fade}>
            <Model name={c.name} scale={CAR_SCALE} shadows={false} position={[0, 0.05, 0]} />
          </group>
        );
      })}
      <TrafficLights />
    </>
  );
}

// a signal on two opposite corners of every crossroads: the corner on the
// campus side and its diagonal (the other corners sit against lots)
function TrafficLights() {
  const poles = [];
  for (const x of CROSS_X)
    for (const z of [FRONT_Z, BACK_Z]) {
      const sx = -Math.sign(x), sz = -Math.sign(z);
      for (const k of [1, -1]) {
        const px = x + sx * k * 0.62, pz = z + sz * k * 0.62;
        poles.push([px, pz, Math.atan2(x - px, z - pz)]);
      }
    }
  return poles.map(([x, z, ry], i) => <Model key={i} name="roads/traffic-light" position={[x, 0, z]} rotation={[0, ry, 0]} scale={1.5} />);
}
