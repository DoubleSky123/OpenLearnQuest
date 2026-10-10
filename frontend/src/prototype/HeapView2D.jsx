import { describeScene } from '../services/heapInterpreter';

/**
 * Flat SVG view of one interpreter frame — the 2D condition of the Gate 0
 * comparison. It draws exactly what CityView3D draws (both read describeScene):
 * address-labelled plots in plot order, values, every pointer variable's
 * signpost, next cables (self-loops, red dashed into freed lots), NULL tags,
 * leak fences and empty freed lots. Only the dimension differs (eng review R2).
 */
const GAP = 130;          // px between plots
const BOX = 80;           // building box size
const TOP = 120;          // y of a building's top edge
const MARGIN = 40;

const xOf = (plot) => MARGIN + plot * GAP;

function cablePath(from, to) {
  const sx = xOf(from.plot), tx = xOf(to.plot);
  if (to.plot > from.plot) {   // forward: arc over the top
    const lift = 36 + (to.plot - from.plot) * 18;
    return `M ${sx + BOX - 14} ${TOP} Q ${(sx + tx + BOX) / 2} ${TOP - lift} ${tx + 14} ${TOP}`;
  }
  // backward: arc under the boxes so it never hides a forward cable
  const drop = 36 + (from.plot - to.plot) * 18;
  return `M ${sx + 14} ${TOP + BOX} Q ${(sx + tx + BOX) / 2} ${TOP + BOX + drop} ${tx + BOX - 14} ${TOP + BOX}`;
}

const selfLoopPath = (b) => {
  const x = xOf(b.plot);
  return `M ${x + BOX - 12} ${TOP} C ${x + BOX + 30} ${TOP - 70}, ${x - 30} ${TOP - 70}, ${x + 12} ${TOP}`;
};

export default function HeapView2D({ frame, selectable = false, selected = [], onSelect }) {
  const scene = describeScene(frame);
  const byAddr = new Map(scene.buildings.map(b => [b.addr, b]));
  const width = MARGIN * 2 + Math.max(scene.buildings.length, 1) * GAP - (GAP - BOX);
  const picked = new Set(selected);

  return (
    <svg viewBox={`0 0 ${width} 300`} className="w-full h-full select-none" role="img" aria-label="memory as a flat map">
      <defs>
        <marker id="arrow2d" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
        </marker>
        <marker id="arrow2dRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
        </marker>
      </defs>

      {/* plots + buildings */}
      {scene.buildings.map(b => {
        const x = xOf(b.plot);
        const isPicked = picked.has(b.addr);
        const clickable = selectable && b.state !== 'freed';
        return (
          <g key={b.addr}>
            <rect x={x - 10} y={TOP + BOX + 4} width={BOX + 20} height={10} rx={3} fill="#e2e8f0" />
            <text x={x + BOX / 2} y={TOP + BOX + 34} textAnchor="middle" fontSize="12" fill="#64748b" fontFamily="ui-monospace, monospace">{b.addr}</text>
            {b.state === 'freed' ? (
              <g>
                <rect x={x} y={TOP} width={BOX} height={BOX} rx={6} fill="none" stroke="#94a3b8" strokeDasharray="5 4" />
                <text x={x + BOX / 2} y={TOP + BOX / 2 + 4} textAnchor="middle" fontSize="12" fill="#94a3b8">freed</text>
              </g>
            ) : (
              <g onClick={clickable ? () => onSelect?.(b.addr) : undefined} style={{ cursor: clickable ? 'pointer' : 'default' }}>
                {b.state === 'leaked' && (
                  <>
                    <rect x={x - 8} y={TOP - 8} width={BOX + 16} height={BOX + 16} rx={8} fill="none" stroke="#9ca3af" strokeDasharray="3 3" />
                    <rect x={x + BOX / 2 - 26} y={TOP - 26} width={52} height={16} rx={3} fill="#fef3c7" stroke="#d97706" />
                    <text x={x + BOX / 2} y={TOP - 14} textAnchor="middle" fontSize="10" fontWeight="700" fill="#b45309">LEAK</text>
                  </>
                )}
                <rect x={x} y={TOP} width={BOX} height={BOX} rx={6}
                  fill={b.state === 'leaked' ? '#d1d5db' : b.isNew ? '#bbf7d0' : '#fde7c4'}
                  stroke={isPicked ? '#4f46e5' : b.isNew ? '#16a34a' : '#92400e'}
                  strokeWidth={isPicked ? 4 : 1.5} />
                <text x={x + BOX / 2} y={TOP + BOX / 2 + 7} textAnchor="middle" fontSize="22" fontWeight="600"
                  fill={b.state === 'leaked' ? '#6b7280' : '#1f2937'}>{b.value}</text>
              </g>
            )}
          </g>
        );
      })}

      {/* next cables */}
      {scene.buildings.map(b => {
        if (b.nextKind === 'none') return null;
        const x = xOf(b.plot);
        if (b.nextKind === 'null')
          return <text key={`n-${b.addr}`} x={x + BOX + 4} y={TOP + BOX / 2 + 4} fontSize="11" fill="#64748b" fontFamily="ui-monospace, monospace">→NULL</text>;
        if (b.nextKind === 'self')
          return <path key={`c-${b.addr}`} d={selfLoopPath(b)} fill="none" stroke="#475569" strokeWidth="2" markerEnd="url(#arrow2d)" />;
        const freed = b.nextKind === 'freed';
        return (
          <path key={`c-${b.addr}`} d={cablePath(b, byAddr.get(b.next))} fill="none"
            stroke={freed ? '#dc2626' : '#475569'} strokeWidth="2" strokeDasharray={freed ? '6 4' : undefined}
            markerEnd={freed ? 'url(#arrow2dRed)' : 'url(#arrow2d)'} />
        );
      })}

      {/* pointer-variable signposts */}
      {Object.entries(scene.signs).map(([addr, names]) => {
        const b = byAddr.get(addr);
        const x = xOf(b.plot) + BOX / 2;
        const onFreed = b.state === 'freed';
        return (
          <g key={`s-${addr}`}>
            {names.map((name, i) => (
              <text key={name} x={x} y={TOP - 34 - i * 16 - (b.nextKind === 'self' ? 46 : 0)} textAnchor="middle" fontSize="13"
                fontWeight="700" fontFamily="ui-monospace, monospace" fill={onFreed ? '#dc2626' : name === 'head' ? '#4338ca' : '#b45309'}>
                {name} ↓
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
