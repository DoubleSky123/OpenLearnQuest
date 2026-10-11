import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { modelUrl } from './models';

/**
 * Many copies of one Kenney model as instanced meshes (one draw call per part
 * of the model instead of one per copy), so forests and road grids stay cheap.
 *   items  [{ position, ry, scale, shade, phase, tint }]; shade darkens or
 *          brightens a copy a little, tint ([r, g, b] multiplier) recolours its
 *          foliage only, so a forest isn't a carbon copy of one tree
 *   sway   trees bend gently in the wind (every frame; High quality only)
 */
const base = new Matrix4(), world = new Matrix4(), local = new Matrix4();
const q = new Quaternion(), e = new Euler(0, 0, 0, 'ZXY'), p = new Vector3(), s = new Vector3(), c = new Color(), tintColor = new Color();

// the model's meshes with their transforms relative to the model root (read-only walk)
function meshParts(root) {
  const out = [];
  const walk = (node, parent) => {
    local.compose(node.position, node.quaternion, node.scale);
    const m = new Matrix4().multiplyMatrices(parent, local);
    if (node.isMesh) out.push({ geometry: node.geometry, material: node.material, matrix: m, leafy: /leaf|grass/i.test(node.material.name) });
    node.children.forEach((child) => walk(child, m));
  };
  walk(root, new Matrix4());
  return out;
}

function itemMatrix(it, t, sway) {
  const ph = it.phase ?? 0;
  e.set(sway ? 0.03 * Math.sin(t * 1.3 + ph) : 0, it.ry ?? 0, sway ? 0.03 * Math.cos(t * 1.1 + ph * 1.7) : 0, 'ZXY');
  q.setFromEuler(e);
  p.set(it.position[0], it.position[1] ?? 0, it.position[2]);
  s.setScalar(it.scale ?? 1);
  return base.compose(p, q, s);
}

export default function InstancedModel({ name, items, sway = false, castShadow = true, receiveShadow = true }) {
  const { scene } = useGLTF(modelUrl(name));
  const parts = useMemo(() => meshParts(scene), [scene]);
  const meshes = useRef([]);

  const apply = (t) => {
    meshes.current.forEach((mesh, k) => {
      if (!mesh) return;
      items.forEach((it, i) => mesh.setMatrixAt(i, world.multiplyMatrices(itemMatrix(it, t, sway), parts[k].matrix)));
      mesh.instanceMatrix.needsUpdate = true;
    });
  };

  useLayoutEffect(() => {
    apply(0);
    meshes.current.forEach((mesh, k) => {
      if (!mesh) return;
      items.forEach((it, i) => {
        c.setScalar(it.shade ?? 1);
        if (parts[k].leafy && it.tint) c.multiply(tintColor.setRGB(...it.tint));
        mesh.setColorAt(i, c);
      });
      mesh.instanceColor.needsUpdate = true;
    });
  });   // every commit: cheap, and keeps matrices right when sway is switched off

  useFrame(({ clock }) => { if (sway) apply(clock.getElapsedTime()); });

  return parts.map((part, k) => (
    <instancedMesh key={k} ref={(el) => { meshes.current[k] = el; }} args={[part.geometry, part.material, items.length]}
      castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled={false} />
  ));
}
