import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Color } from 'three';
import { modelUrl } from './models';

const GREY = new Color('#9aa0a6');

/**
 * One Kenney model, cloned so it can be placed many times.
 *   tint      'leaked' -> washed-out grey (an abandoned building), or any CSS
 *             colour, multiplied into the kit's light palette texture
 *   leafTint  recolours foliage materials only (autumn trees)
 *   shadows   cast + receive (off for far filler, to keep the shadow pass cheap)
 */
export default function Model({ name, tint = null, leafTint = null, shadows = true, ...props }) {
  const { scene } = useGLTF(modelUrl(name));
  const object = useMemo(() => {
    const clone = scene.clone(true);
    const color = tint && tint !== 'leaked' ? new Color(tint) : null;
    const leaf = leafTint ? new Color(leafTint) : null;
    clone.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = shadows;
      o.receiveShadow = true;
      if (!tint && !leaf) return;
      o.material = o.material.clone();
      if (tint === 'leaked') {
        o.material.color = o.material.color.clone().lerp(GREY, 0.75);
        o.material.transparent = true;
        o.material.opacity = 0.85;
      } else if (color) {
        o.material.color = o.material.color.clone().multiply(color);
      }
      if (leaf && /leaf/i.test(o.material.name)) o.material.color = leaf.clone();
    });
    return clone;
  }, [scene, tint, leafTint, shadows]);
  return <primitive object={object} {...props} />;
}
