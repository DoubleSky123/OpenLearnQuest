/**
 * Home-city traffic: cars drive the avenues and cross streets (right-hand
 * traffic), keep their distance from the car ahead, and wait at the four
 * crossroads when the signal is red, so two cars never share a crossing.
 * Pure state + step function (no React, no three.js), so it is unit-tested.
 *
 * A car's road coordinate s runs in its direction of travel over [-SPAN, SPAN);
 * the world coordinate along the road is dir * s. Past SPAN it wraps round.
 */
import { pick, rng } from './random';
import { BACK_Z, CROSS_X, FRONT_Z, SPAN } from './homeLayout';

export const VEHICLES = [
  'cars/sedan', 'cars/sedan-sports', 'cars/taxi', 'cars/van', 'cars/suv', 'cars/suv-luxury', 'cars/hatchback-sports',
  'cars/truck', 'cars/truck-flat', 'cars/delivery', 'cars/delivery-flat', 'cars/police', 'cars/ambulance',
  'cars/firetruck', 'cars/garbage-truck', 'cars/tractor', 'cars/taxi', 'cars/sedan',
];
export const LANE_OFFSET = 0.22;
export const MIN_GAP = 0.62;           // centre to centre; the longest truck is ~0.55 long at CAR_SCALE
export const STOP_LINE = 0.85;         // where cars wait, before the crossing centre
export const BOX = 0.5;                // half-width of a crossing tile
export const CYCLE = 15;               // s: avenues green 0-5, all red 5-7.5, cross streets green 7.5-12.5, all red 12.5-15
const ACCEL = 1.4, BRAKE = 4, COMFORT = 2;   // comfortable braking, well inside what the car can do
const LOOP = 2 * SPAN;

export function green(axis, t) {
  const p = ((t % CYCLE) + CYCLE) % CYCLE;
  return axis === 'x' ? p < 5 : p >= 7.5 && p < 12.5;
}

const wrap = (s) => ((s + SPAN) % LOOP + LOOP) % LOOP - SPAN;

export function makeTraffic(seed = 99) {
  const r = rng(seed);
  const lanes = [];
  for (const z of [FRONT_Z, BACK_Z])
    for (const dir of [1, -1]) lanes.push({ axis: 'x', at: z + dir * LANE_OFFSET, dir, cars: 3, crossings: CROSS_X });
  for (const x of CROSS_X)
    for (const dir of [1, -1]) lanes.push({ axis: 'z', at: x - dir * LANE_OFFSET, dir, cars: 2, crossings: [FRONT_Z, BACK_Z] });
  const cars = [];
  lanes.forEach((lane, li) => {
    const start = r() * LOOP;
    const stops = lane.crossings.map(c => lane.dir * c - STOP_LINE).sort((a, b) => a - b);
    for (let k = 0; k < lane.cars; k++) {
      let s = wrap(start + k * (LOOP / lane.cars) + (r() - 0.5) * 2);
      // never start inside (or committed to) a crossing
      for (const stop of stops) if (s > stop - 0.2 && s < stop + STOP_LINE + BOX + 0.6) s = stop - 0.3 - r() * 2;
      cars.push({ id: cars.length, lane: li, axis: lane.axis, at: lane.at, dir: lane.dir, stops, s, v: 0, plan: null, vmax: 0.8 + r() * 0.6, name: pick(r, VEHICLES) });
    }
  });
  return cars;
}

/** Advance every car by dt seconds at time t (mutates the car objects). */
export function stepTraffic(cars, dt, t) {
  const lanes = new Map();
  for (const c of cars) {
    if (!lanes.has(c.lane)) lanes.set(c.lane, []);
    lanes.get(c.lane).push(c);
  }
  for (const list of lanes.values()) {
    list.sort((a, b) => a.s - b.s);
    const n = list.length;
    // front to back, so each follower sees where its leader ends up
    for (let idx = n - 1; idx >= 0; idx--) {
      const c = list[idx];
      const leader = n > 1 ? list[(idx + 1) % n] : null;
      const gap = leader ? ((leader.s - c.s) % LOOP + LOOP) % LOOP : Infinity;
      let target = Math.min(c.vmax, Math.max(0, (gap - MIN_GAP) * 2.5));

      // red light ahead: decide once, the first moment the car sees it red,
      // whether it can still stop at the line. If it is already too fast and too
      // close it goes on (the all-red phase is long enough to clear the
      // crossing); otherwise it stops, and never changes its mind mid-braking.
      let mustStopAt = null;
      const stop = c.stops.find(st => st >= c.s - 1e-6);
      if (stop === undefined || green(c.axis, t)) c.plan = null;
      else {
        const d = Math.max(0, stop - c.s);
        if (c.plan?.stop !== stop) c.plan = { stop, go: c.v > 0.5 && c.v * c.v > 2 * BRAKE * d };
        if (!c.plan.go) {
          mustStopAt = stop;
          target = Math.min(target, Math.sqrt(2 * COMFORT * d));
        }
      }

      c.v = Math.max(0, c.v + Math.max(-BRAKE * dt, Math.min(ACCEL * dt, target - c.v)));
      let next = c.s + c.v * dt;
      if (leader) next = Math.min(next, c.s + Math.max(0, gap - MIN_GAP));
      if (mustStopAt !== null) next = Math.min(next, Math.max(c.s, mustStopAt));
      c.v = Math.min(c.v, (next - c.s) / Math.max(dt, 1e-6));
      c.s = wrap(next);
    }
  }
}

/** World placement of a car: [x, z], heading (rotation about y), and a 0-1 fade at the road ends. */
export function carPose(c) {
  const along = c.dir * c.s;
  const fade = Math.max(0, Math.min(1, (SPAN - Math.abs(c.s)) / 2));
  if (c.axis === 'x') return { x: along, z: c.at, heading: c.dir > 0 ? Math.PI / 2 : -Math.PI / 2, fade };
  return { x: c.at, z: along, heading: c.dir > 0 ? 0 : Math.PI, fade };
}
