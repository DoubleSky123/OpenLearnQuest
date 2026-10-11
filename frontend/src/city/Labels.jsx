import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

/**
 * DOM labels over the canvas (crisp text, no extra React roots — drei <Html>
 * throws removeChild errors when a Canvas unmounts under React 19). React owns
 * the elements; the frame loop only writes their transforms, so orbiting the
 * camera never re-renders React. The owner keeps `specsRef` (anchors) and
 * `elsRef` (key -> element, filled through LabelLayer's onElement).
 */
const v = new Vector3();

// inside <Canvas>
export function LabelSync({ specsRef, elsRef }) {
  useFrame(({ camera, size }) => {
    for (const spec of specsRef.current) {
      const el = elsRef.current.get(spec.key);
      if (!el) continue;
      v.set(spec.at[0], spec.at[1], spec.at[2]).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.visibility = visible ? 'visible' : 'hidden';
      if (visible)
        el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

// next to <Canvas>, in the same positioned container
export function LabelLayer({ specs, onElement }) {
  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      {specs.map(l => (
        <span key={l.key} ref={(el) => onElement(l.key, el)}
          className={`absolute left-0 top-0 whitespace-nowrap ${l.cls}`} style={{ visibility: 'hidden' }}>
          {l.text}
        </span>
      ))}
    </div>
  );
}
