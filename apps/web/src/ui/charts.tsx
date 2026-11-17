/** Small SVG charts with meaningful motion (bars grow from the baseline, lines draw in). */
import { motion } from 'motion/react';
import { useId, useState } from 'react';

const ease = [0.2, 0.8, 0.2, 1] as const;

/** Paired bars per period: a light "billed" bar with a strong "collected" bar inside it. */
export function PairBars({ data, labels, format, height = 180 }: { data: Array<{ a: number; b: number }>; labels: string[]; format(v: number): string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const w = 100 / data.length;
  return (
    <div className="chart" style={{ height }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height - 22} role="img" aria-label="bar chart">
        {data.map((d, i) => {
          const ha = ((height - 30) * d.a) / max;
          const hb = ((height - 30) * d.b) / max;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * w} y={0} width={w} height={height} fill="transparent" />
              <motion.rect x={i * w + w * 0.18} width={w * 0.64} rx={1.5} fill="var(--data-soft)" initial={{ height: 0, y: height - 22 }} animate={{ height: ha, y: height - 22 - ha }} transition={{ duration: 0.7, delay: i * 0.05, ease }} />
              <motion.rect x={i * w + w * 0.3} width={w * 0.4} rx={1.5} fill={i === data.length - 1 ? 'var(--accent)' : 'var(--data)'} initial={{ height: 0, y: height - 22 }} animate={{ height: hb, y: height - 22 - hb }} transition={{ duration: 0.8, delay: 0.1 + i * 0.05, ease }} />
            </g>
          );
        })}
      </svg>
      <div className="chart-x">{labels.map((l, i) => <span key={i} className={hover === i ? 'on' : ''}>{l}</span>)}</div>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${(hover + 0.5) * w}%` }}>
          <b>{format(data[hover]!.b)}</b>
          <span>/ {format(data[hover]!.a)}</span>
        </div>
      )}
    </div>
  );
}

/** Line of 0–100 scores with dots. */
export function ScoreLine({ points, height = 140, color = 'var(--data)' }: { points: Array<{ label: string; v: number }>; height?: number; color?: string }) {
  const id = useId();
  if (points.length < 2) return <div className="chart-empty">—</div>;
  const W = 300;
  const xy = points.map((p, i) => [8 + (i * (W - 16)) / (points.length - 1), 8 + ((100 - p.v) * (height - 16)) / 100] as const);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label="score chart">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((g) => <line key={g} x1={0} x2={W} y1={8 + ((100 - g) * (height - 16)) / 100} y2={8 + ((100 - g) * (height - 16)) / 100} stroke="var(--line)" strokeDasharray="3 4" />)}
      <motion.path d={`${d} L${xy.at(-1)![0]},${height} L${xy[0]![0]},${height} Z`} fill={`url(#${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease }} />
      {xy.map(([x, y], i) => <motion.circle key={i} cx={x} cy={y} r={3.5} fill="var(--surface)" stroke={color} strokeWidth={2} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 + i * 0.04 }} />)}
    </svg>
  );
}

/** Ring gauge for a 0–1 rate. */
export function Ring({ value, size = 64, color = 'var(--ok)', label }: { value: number | null; size?: number; color?: string; label?: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(v * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={6} />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={c} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v) }} transition={{ duration: 1, ease }} />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fontSize={size * 0.24} fontWeight={700} fill="var(--ink)">{value === null ? '—' : `${Math.round(v * 100)}%`}</text>
    </svg>
  );
}

/** Horizontal bars (teacher load, funnel). */
export function HBars({ rows, format }: { rows: Array<{ label: string; v: number; color?: string; note?: string }>; format?(v: number): string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <div key={r.label + i} className="hbar">
          <div className="spread"><span className="ellipsis">{r.label}</span><span className="num muted">{format ? format(r.v) : r.v}{r.note ? ` · ${r.note}` : ''}</span></div>
          <div className="hbar-track">
            <motion.div className="hbar-fill" style={{ background: r.color ?? 'var(--data)' }} initial={{ width: 0 }} animate={{ width: `${(100 * r.v) / max}%` }} transition={{ duration: 0.8, delay: i * 0.04, ease }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stacked monthly attendance bars (present / late / absent). */
export function StackBars({ rows }: { rows: Array<{ label: string; parts: Array<{ v: number; color: string }> }> }) {
  return (
    <div className="stackbars">
      {rows.map((r, i) => {
        const total = Math.max(1, r.parts.reduce((s, p) => s + p.v, 0));
        return (
          <div key={r.label} className="stackbar">
            <div className="stackbar-col">
              {r.parts.map((p, k) => <motion.span key={k} style={{ background: p.color }} initial={{ height: 0 }} animate={{ height: `${(100 * p.v) / total}%` }} transition={{ duration: 0.7, delay: i * 0.06 + k * 0.05, ease }} />)}
            </div>
            <small>{r.label}</small>
          </div>
        );
      })}
    </div>
  );
}
