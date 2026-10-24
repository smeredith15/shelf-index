import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

/** 1,284 · 12.9K · 4.2M */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}K`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

export function full(n: number): string {
  return Math.round(n).toLocaleString();
}

function useWidth<T extends HTMLElement>(): [preact.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Clean axis ticks from 0 to just above max. */
function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

export interface Point {
  label: string;
  /** Longer label for tooltips and tables, e.g. "Oct 2026". */
  fullLabel?: string;
  value: number;
}

interface TooltipState {
  x: number;
  y: number;
  label: string;
  value: string;
}

function Tooltip({ tip, kind }: { tip: TooltipState | null; kind: 'bar' | 'line' }) {
  if (!tip) return null;
  return (
    <div class="viz-tooltip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }} role="status">
      <span class={`viz-key viz-key-${kind}`} />
      <strong>{tip.value}</strong>
      <span class="viz-tooltip-label">{tip.label}</span>
    </div>
  );
}

const PAD = { top: 12, right: 8, bottom: 26, left: 40 };
const HEIGHT = 200;

/** Single-series columns: magnitude per period. */
export function ColumnChart({ data, format = compact, unit }: { data: Point[]; format?: (n: number) => string; unit: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  const yTicks = ticks(max);
  const top = yTicks[yTicks.length - 1] || 1;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  // Thin out x labels so they never collide (~36px each).
  const every = Math.max(1, Math.ceil((data.length * 36) / Math.max(plotW, 1)));

  return (
    <div class="viz" ref={ref} onPointerLeave={() => (setTip(null), setHover(null))}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={`${unit} by period`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line class="viz-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text class="viz-axis" x={PAD.left - 6} y={y(t)} dy="0.32em" text-anchor="end">
                {compact(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const h = Math.max(0, (d.value / top) * plotH);
            const r = Math.min(4, h, barW / 2);
            const x0 = cx - barW / 2;
            const yTop = y(d.value);
            const base = PAD.top + plotH;
            // Rounded data end, square at the baseline.
            const path =
              h > 0
                ? `M${x0},${base} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${base} Z`
                : '';
            const show = () => {
              setHover(i);
              setTip({ x: cx, y: Math.min(yTop, base - 8), label: d.fullLabel ?? d.label, value: `${format(d.value)} ${unit}` });
            };
            return (
              <g key={i}>
                {path && <path d={path} class={`viz-bar${hover === i ? ' is-hover' : ''}`} />}
                {i % every === 0 && (
                  <text class="viz-axis" x={cx} y={HEIGHT - 8} text-anchor="middle">
                    {d.label}
                  </text>
                )}
                <rect
                  class="viz-hit"
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  tabIndex={0}
                  aria-label={`${d.fullLabel ?? d.label}: ${format(d.value)} ${unit}`}
                  onPointerMove={show}
                  onFocus={show}
                  onBlur={() => (setTip(null), setHover(null))}
                />
              </g>
            );
          })}
          <line class="viz-baseline" x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} />
        </svg>
      )}
      <Tooltip tip={tip} kind="bar" />
    </div>
  );
}

/** Single-series line with a crosshair that snaps to the nearest point. */
export function LineChart({ data, format = compact, unit }: { data: Point[]; format?: (n: number) => string; unit: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  const yTicks = ticks(max);
  const top = yTicks[yTicks.length - 1] || 1;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length > 1 ? (plotW * i) / (data.length - 1) : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const every = Math.max(1, Math.ceil((data.length * 36) / Math.max(plotW, 1)));
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ');
  const area = data.length ? `${line} L${x(data.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z` : '';
  const last = data.length - 1;

  const nearest = (clientX: number, el: Element) => {
    const rel = clientX - el.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - rel) < Math.abs(x(best) - rel)) best = i;
    return best;
  };

  return (
    <div class="viz" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${unit} over time`}
          tabIndex={0}
          onPointerMove={(e) => data.length && setActive(nearest(e.clientX, e.currentTarget))}
          onPointerLeave={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setActive((a) => Math.min(last, (a ?? -1) + 1));
            if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? last + 1) - 1));
          }}
          onBlur={() => setActive(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line class="viz-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text class="viz-axis" x={PAD.left - 6} y={y(t)} dy="0.32em" text-anchor="end">
                {compact(t)}
              </text>
            </g>
          ))}
          {data.map(
            (d, i) =>
              i % every === 0 && (
                <text key={i} class="viz-axis" x={x(i)} y={HEIGHT - 8} text-anchor="middle">
                  {d.label}
                </text>
              ),
          )}
          <path d={area} class="viz-area" />
          <path d={line} class="viz-line" />
          {active !== null && <line class="viz-crosshair" x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} />}
          {data.length > 0 && <circle class="viz-dot" cx={x(active ?? last)} cy={y(data[active ?? last].value)} r={4} />}
        </svg>
      )}
      {active !== null && data[active] && (
        <Tooltip
          kind="line"
          tip={{ x: x(active), y: y(data[active].value), label: data[active].fullLabel ?? data[active].label, value: `${format(data[active].value)} ${unit}` }}
        />
      )}
    </div>
  );
}

/** Ranked horizontal bars with every value labeled; for short categorical lists. */
export function BarList({ data, format = full }: { data: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul class="viz-barlist">
      {data.map((d) => (
        <li key={d.label} title={`${d.label}: ${format(d.value)}`}>
          <span class="viz-barlist-label">{d.label}</span>
          <span class="viz-barlist-track">
            {d.value > 0 && <span class="viz-barlist-bar" style={{ width: `${(100 * d.value) / max}%` }} />}
          </span>
          <span class="viz-barlist-value">{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Parts of a whole as one bar, with a legend that carries every value. */
export function SplitBar({
  parts,
  format = compact,
}: {
  parts: { label: string; value: number; slot: 1 | 2 | 3 }[];
  format?: (n: number) => string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div class="viz-split">
      <div class="viz-split-bar" role="img" aria-label={parts.map((p) => `${p.label} ${format(p.value)}`).join(', ')}>
        {total > 0 ? (
          shown.map((p) => (
            <span
              key={p.label}
              class={`viz-split-seg viz-fill-${p.slot}`}
              style={{ flexGrow: p.value }}
              title={`${p.label}: ${format(p.value)} (${Math.round((100 * p.value) / total)}%)`}
            />
          ))
        ) : (
          <span class="viz-split-empty" />
        )}
      </div>
      <ul class="viz-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <span class={`viz-swatch viz-fill-${p.slot}`} />
            <span>{p.label}</span>
            <strong>{format(p.value)}</strong>
            {total > 0 && <span class="muted">{Math.round((100 * p.value) / total)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: ComponentChildren }) {
  return (
    <div class="stat-tile">
      <div class="stat-label">{label}</div>
      <div class="stat-value">{value}</div>
      {sub && <div class="stat-sub">{sub}</div>}
    </div>
  );
}

/** A chart card with a title and a Table toggle, so no value is reachable only by hovering. */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
}: {
  title: string;
  subtitle?: ComponentChildren;
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ComponentChildren;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section class="chart-card">
      <header class="chart-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p class="tiny muted">{subtitle}</p>}
        </div>
        {table && (
          <button class="link small" onClick={() => setAsTable(!asTable)}>
            {asTable ? 'Chart' : 'Table'}
          </button>
        )}
      </header>
      {asTable && table ? (
        <div class="chart-table-wrap">
          <table class="chart-table">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
