import { BufferAttribute, Color, ConeGeometry, Shape, ShapeGeometry, Vector3 } from 'three';
import { rng } from './random';
import { LAKE, lakeEdge } from './homeLayout';

/**
 * Procedural low-poly terrain in the Kenney style: faceted cones with one
 * flat colour per face (grass at the foot, rock above, snow on tall peaks),
 * and the lake outline.
 */
const SNOW = new Color('#f3f5f7');
const ROCK = [new Color('#8f8b84'), new Color('#a29c92'), new Color('#7d7a75')];
const FOREST = [new Color('#5f9f47'), new Color('#6aa84f'), new Color('#568f41')];
const GRASS = [new Color('#86c55c'), new Color('#7cbf55'), new Color('#8fcf63')];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A jagged cone, base on y = 0. Vertices that coincide (seam, apex) move together, so there are no cracks. */
export function peakGeometry({ radius, height, seed, kind = 'mountain' }) {
  const hill = kind === 'hill';
  const g = new ConeGeometry(radius, height, hill ? 18 : 14, hill ? 4 : 7, true);
  g.translate(0, height / 2, 0);
  const pos = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = rng(seed ^ hash(`${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`));
    const t = v.y / height;
    if (t > 0.999) {   // apex: lean a little off-centre
      v.x += (r() - 0.5) * 0.18 * radius;
      v.z += (r() - 0.5) * 0.18 * radius;
    } else {
      const k = 1 + (r() - 0.5) * (hill ? 0.2 : 0.34);
      v.x *= k;
      v.z *= k;
      if (t > 0.01) v.y += (r() - 0.5) * (hill ? 0.14 : 0.09) * height;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  const p = flat.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const r = rng(seed);
  const snowLine = height >= 12 ? 0.68 : height >= 9 ? 0.8 : 2;
  for (let f = 0; f < p.count; f += 3) {
    const t = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3 / height;
    const pick = (list) => list[Math.floor(r() * list.length)];
    let c;
    if (hill) c = t < 0.6 ? pick(GRASS) : pick(FOREST);
    else if (t >= snowLine) c = SNOW;
    else if (t < 0.18) c = pick(GRASS);
    else if (t < 0.36) c = r() < 0.6 ? pick(FOREST) : pick(ROCK);
    else c = pick(ROCK);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  flat.setAttribute('color', new BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  return flat;
}

/** The lake (or its shore, with `grow`) as a flat shape in the XZ plane, centred on LAKE. */
export function lakeGeometry(grow = 0) {
  const shape = new Shape();
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const e = lakeEdge(a) + grow;
    // shape y becomes world -z once the geometry is laid flat (rotation -PI/2 about x)
    const x = Math.cos(a) * LAKE.rx * e, y = -Math.sin(a) * LAKE.rz * e;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  return new ShapeGeometry(shape, 1);
}
