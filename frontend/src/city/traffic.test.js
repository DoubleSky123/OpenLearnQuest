import { describe, expect, it } from 'vitest';
import { BOX, MIN_GAP, STOP_LINE, carPose, green, makeTraffic, stepTraffic } from './traffic';
import { BACK_Z, CROSS_X, FRONT_Z, SPAN } from './homeLayout';

const LOOP = 2 * SPAN;
const DT = 1 / 30;

function run(seconds, seed, each) {
  const cars = makeTraffic(seed);
  for (let i = 0, t = 0; t < seconds; i++, t = i * DT) {
    stepTraffic(cars, DT, t);
    each?.(cars, t);
  }
  return cars;
}

const crossings = CROSS_X.flatMap(x => [FRONT_Z, BACK_Z].map(z => [x, z]));

describe('home traffic', () => {
  it.each([99, 7, 2026])('never rear-ends the car ahead (seed %i)', (seed) => {
    let worst = Infinity;
    run(180, seed, (cars) => {
      const lanes = Map.groupBy(cars, c => c.lane);
      for (const list of lanes.values()) {
        if (list.length < 2) continue;
        const s = list.map(c => c.s).sort((a, b) => a - b);
        s.forEach((v, i) => { worst = Math.min(worst, ((s[(i + 1) % s.length] - v) % LOOP + LOOP) % LOOP); });
      }
    });
    expect(worst).toBeGreaterThanOrEqual(MIN_GAP - 1e-6);
  });

  it.each([99, 7, 2026])('never has crossing traffic in the same crossroads at once (seed %i)', (seed) => {
    const clashes = [];
    run(180, seed, (cars, t) => {
      for (const [x, z] of crossings) {
        const inside = cars.filter(c => {
          const p = carPose(c);
          return c.axis === 'x' ? Math.abs(p.z - z) < 0.5 && Math.abs(p.x - x) < BOX : Math.abs(p.x - x) < 0.5 && Math.abs(p.z - z) < BOX;
        });
        if (new Set(inside.map(c => c.axis)).size > 1) clashes.push([t.toFixed(2), x, z]);
      }
    });
    expect(clashes).toEqual([]);
  });

  it('keeps every car moving overall: lights cycle, nobody gets stuck', () => {
    const start = makeTraffic(99).map(c => c.s);
    const travelled = new Array(start.length).fill(0);
    let prev = [...start];
    run(180, 99, (cars) => {
      cars.forEach((c, i) => { travelled[i] += ((c.s - prev[i]) % LOOP + LOOP) % LOOP; prev[i] = c.s; });
    });
    expect(Math.min(...travelled)).toBeGreaterThan(40);
  });

  it('cars wait at the stop line while their light is red', () => {
    let waiting = 0;
    run(120, 99, (cars, t) => {
      for (const c of cars)
        if (!green(c.axis, t) && c.v === 0 && c.stops.some(st => Math.abs(st - c.s) < 1e-6)) waiting++;
    });
    expect(waiting).toBeGreaterThan(0);
  });

  it('starts nobody inside a crossing', () => {
    for (const c of makeTraffic(99))
      for (const stop of c.stops) expect(c.s > stop && c.s < stop + STOP_LINE + BOX).toBe(false);
  });
});
