import { useMemo } from 'react';
import { describeScene } from '../services/heapInterpreter';
import CityCanvas from '../city/CityCanvas';
import { preloadCity } from '../city/models';
import CityWorld from './city/CityWorld';
import MemoryStreet from './city/MemoryStreet';
import { HOME_VIEW, streetLabels } from './city/layout';

/**
 * Memory City, 3D condition of the Gate 0 comparison: List Avenue (the frame's
 * heap, laid out by address) inside a living city. The list information is
 * exactly what HeapView2D shows (both read describeScene); the city around it
 * is decoration (eng review R2).
 */
preloadCity();

const NO_LABELS = [];

export default function CityView3D({ frame, selectable = false, selected = [], onSelect, onFail, home = HOME_VIEW, labels: extraLabels = NO_LABELS }) {
  const scene = useMemo(() => (frame ? describeScene(frame) : null), [frame]);
  const picked = new Set(selected);
  const specs = useMemo(() => [...(scene ? streetLabels(scene) : []), ...extraLabels], [scene, extraLabels]);
  return (
    <CityCanvas home={home} labels={specs} onFail={onFail}>
      {(quality) => (
        <>
          <CityWorld traffic={quality === 'high'} />
          {scene && <MemoryStreet scene={scene} selectable={selectable} picked={picked} onSelect={onSelect} />}
        </>
      )}
    </CityCanvas>
  );
}
