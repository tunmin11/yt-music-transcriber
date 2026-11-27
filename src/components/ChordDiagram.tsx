import { guitarShape } from "@/lib/guitar";

const STRINGS = 6;
const FRETS = 5;

/** SVG guitar chord box (low E on the left). */
export function ChordDiagram({ name, size = 72, active = false }: { name: string; size?: number; active?: boolean }) {
  const shape = guitarShape(name);
  const w = size;
  const h = size * 1.25;
  const padX = w * 0.24;
  const top = h * 0.3;
  const gridW = w - padX * 2;
  const gridH = h - top - h * 0.06;
  const sx = gridW / (STRINGS - 1);
  const fy = gridH / FRETS;
  const color = active ? "var(--accent)" : "var(--foreground)";
  const xOf = (s: number) => padX + s * sx;
  const yOf = (fret: number) => top + (fret - 0.5) * fy;

  return (
    <figure className="flex flex-col items-center">
      <figcaption className={`font-mono text-sm font-semibold ${active ? "text-accent" : ""}`}>{name}</figcaption>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${name} chord diagram`}>
        {!shape ? (
          <text x={w / 2} y={h / 2} textAnchor="middle" fontSize={10} fill="var(--muted)">
            no shape
          </text>
        ) : (
          <>
            {/* nut or fret label */}
            {shape.baseFret === 1 ? (
              <rect x={padX} y={top - 3} width={gridW} height={3} fill={color} />
            ) : (
              <text x={padX - 3} y={top + fy * 0.7} textAnchor="end" fontSize={size * 0.14} fill="var(--muted)">
                {shape.baseFret}fr
              </text>
            )}
            {Array.from({ length: FRETS + 1 }, (_, i) => (
              <line key={`f${i}`} x1={padX} x2={padX + gridW} y1={top + i * fy} y2={top + i * fy} stroke="var(--line)" strokeWidth={1} />
            ))}
            {Array.from({ length: STRINGS }, (_, i) => (
              <line key={`s${i}`} x1={xOf(i)} x2={xOf(i)} y1={top} y2={top + gridH} stroke="#4b4f59" strokeWidth={1} />
            ))}
            {/* open / muted markers */}
            {shape.frets.map((f, i) =>
              f === -1 ? (
                <text key={`m${i}`} x={xOf(i)} y={top - 7} textAnchor="middle" fontSize={size * 0.14} fill="var(--muted)">
                  ×
                </text>
              ) : f === 0 ? (
                <circle key={`o${i}`} cx={xOf(i)} cy={top - 10} r={size * 0.045} fill="none" stroke="var(--muted)" strokeWidth={1.2} />
              ) : null,
            )}
            {shape.barre && (
              <rect
                x={xOf(shape.barre.from) - sx * 0.3}
                y={yOf(shape.barre.fret - shape.baseFret + 1) - fy * 0.28}
                width={xOf(shape.barre.to) - xOf(shape.barre.from) + sx * 0.6}
                height={fy * 0.56}
                rx={fy * 0.28}
                fill={color}
              />
            )}
            {shape.frets.map((f, i) =>
              f > 0 && !(shape.barre && f === shape.barre.fret && i >= shape.barre.from && i <= shape.barre.to) ? (
                <circle key={`d${i}`} cx={xOf(i)} cy={yOf(f - shape.baseFret + 1)} r={Math.min(sx, fy) * 0.32} fill={color} />
              ) : null,
            )}
          </>
        )}
      </svg>
    </figure>
  );
}
