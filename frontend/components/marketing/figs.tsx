"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/* Three isometric line drawings for the home page's figure row. Hairline
   strokes in the text colour, one violet accent each, and a small physical
   response to the pointer: FIG 0.1 opens its stack, FIG 0.2 replays its
   steps, and FIG 0.3's plates rise to follow the cursor. Decorative, so
   aria-hidden; reduced motion keeps them still. */

const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
/** Isometric projection: x to the right-down, y to the left-down, z up. */
const iso = (x: number, y: number, z = 0): [number, number] => [(x - y) * C30, (x + y) * S30 - z];
// Rounded so the server's and the browser's floats print the same string
const r2 = (n: number) => Math.round(n * 100) / 100;
const pts = (list: [number, number, number][]) =>
  list.map(([x, y, z]) => iso(x, y, z).map(r2).join(",")).join(" ");

const LINE = "hsl(var(--foreground) / 0.32)";
const LINE_HI = "hsl(var(--foreground) / 0.7)";
const FILL = "hsl(var(--background))";
const VIOLET = "hsl(var(--primary-accent))";

/** A box from its near corner (x, y, z) with size w × d × h. */
function Box({ x, y, z, w, d, h, stroke, top }: { x: number; y: number; z: number; w: number; d: number; h: number; stroke: string; top?: React.ReactNode }) {
  const topFace = pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]);
  const right = pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]);
  const left = pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]);
  return (
    <g stroke={stroke} strokeWidth={1} strokeLinejoin="round" style={{ transition: "stroke 300ms ease" }}>
      <polygon points={right} fill={FILL} />
      <polygon points={left} fill={FILL} />
      <polygon points={topFace} fill={FILL} />
      {top}
    </g>
  );
}

/* ---------------------------------------------------------- FIG 0.1 */

/** A stack of sheets; the top one carries a cell grid. Hover opens the stack. */
export function FigLayers({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const open = active && !reduced;
  const W = 150;
  const layers = 6;
  return (
    <svg viewBox="-150 -150 300 300" className="h-full w-full" aria-hidden>
      <g transform="translate(0 40)">
        {Array.from({ length: layers }, (_, i) => {
          const isTop = i === layers - 1;
          const lift = i * (open ? 22 : 12);
          const grid = isTop
            ? Array.from({ length: 5 }, (_, k) => {
                const t = ((k + 1) / 6) * W;
                return (
                  <g key={k} stroke={open ? VIOLET : LINE} style={{ transition: "stroke 300ms ease" }}>
                    <polyline points={pts([[t - W / 2, -W / 2, 8], [t - W / 2, W / 2, 8]])} fill="none" />
                    <polyline points={pts([[-W / 2, t - W / 2, 8], [W / 2, t - W / 2, 8]])} fill="none" />
                  </g>
                );
              })
            : null;
          return (
            <g
              key={i}
              style={{
                translate: `0 ${-lift}px`,
                transition: `translate 600ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 30}ms`,
              }}
            >
              <Box x={-W / 2} y={-W / 2} z={0} w={W} d={W} h={8} stroke={isTop || open ? LINE_HI : LINE} top={grid} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------- FIG 0.2 */

/** Steps as blocks; hover lights them in order, a recipe replaying. */
export function FigSteps({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (!active || reduced) {
      setLit(0);
      return;
    }
    const timers = [1, 2, 3, 4].map((n) => setTimeout(() => setLit(n), n * 220));
    return () => timers.forEach(clearTimeout);
  }, [active, reduced]);

  // Back to front so nearer blocks overlap farther ones
  const blocks = [
    { x: -20, y: -110, h: 64, n: 1 },
    { x: -100, y: -40, h: 80, n: 2 },
    { x: 50, y: -30, h: 46, n: 3 },
    { x: -30, y: 40, h: 56, n: 4 },
  ];
  return (
    <svg viewBox="-160 -170 320 320" className="h-full w-full" aria-hidden>
      {blocks.map((b) => {
        const on = lit >= b.n;
        const s = 70;
        const glyph = (
          <g stroke={on ? VIOLET : LINE} style={{ transition: "stroke 250ms ease" }}>
            {[0, 1, 2].map((k) => (
              <polyline
                key={k}
                fill="none"
                points={pts([
                  [b.x + 18, b.y + 22 + k * 9, b.h],
                  [b.x + s - 18, b.y + 22 + k * 9, b.h],
                ])}
              />
            ))}
          </g>
        );
        return (
          <g key={b.n} style={{ translate: `0 ${on ? -6 : 0}px`, transition: "translate 400ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
            <Box x={b.x} y={b.y} z={0} w={s} d={s} h={b.h} stroke={on ? LINE_HI : LINE} top={glyph} />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------- FIG 0.3 */

const PLATES = 15;
const REST = Array.from({ length: PLATES }, (_, i) => {
  // A resting skyline: tallest a third of the way in, falling away
  const t = i / (PLATES - 1);
  return 18 + 120 * Math.exp(-Math.pow((t - 0.62) / 0.28, 2));
});

/** Column plates whose heights follow the cursor across the drawing. */
export function FigPlates({ pointer }: { pointer: number | null }) {
  const reduced = useReducedMotion();
  const [heights, setHeights] = useState(REST);
  const target = useRef(REST);
  const raf = useRef(0);

  useEffect(() => {
    target.current =
      pointer === null || reduced
        ? REST
        : REST.map((_, i) => {
            const t = i / (PLATES - 1);
            return 14 + 132 * Math.exp(-Math.pow((t - pointer) / 0.16, 2));
          });
    cancelAnimationFrame(raf.current);
    const step = () => {
      let moving = false;
      setHeights((h) =>
        h.map((v, i) => {
          const d = target.current[i] - v;
          if (Math.abs(d) > 0.4) moving = true;
          return v + d * 0.16;
        }),
      );
      if (moving) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [pointer, reduced]);

  const peak = heights.indexOf(Math.max(...heights));
  return (
    <svg viewBox="-170 -150 340 300" className="h-full w-full" aria-hidden>
      <g transform="translate(0 70)">
        {heights.map((h, i) => {
          // Plates run along x, each thin in x and deep in y
          const x = -130 + i * 15;
          return (
            <Box
              key={i}
              x={x}
              y={-40 + i * -2}
              z={0}
              w={5}
              d={90}
              h={h}
              stroke={pointer !== null && i === peak ? VIOLET : h > 60 ? LINE_HI : LINE}
            />
          );
        })}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------- row */

const FIGS = [
  {
    n: "FIG 0.1",
    title: "Built for the monthly mess",
    body: "Shaped around the exports people clean every month: the same duplicates, the same gaps, the same dates.",
    kind: "layers" as const,
  },
  {
    n: "FIG 0.2",
    title: "Steps that replay",
    body: "Every cleanup is a list of steps you can save, inspect and run again on the next file.",
    kind: "steps" as const,
  },
  {
    n: "FIG 0.3",
    title: "Made for big files",
    body: "Up to a million rows a file, cleaned by a columnar SQL engine instead of a formula grid.",
    kind: "plates" as const,
  },
];

export function FigRow() {
  const [hover, setHover] = useState<number | null>(null);
  const [pointer, setPointer] = useState<number | null>(null);
  return (
    <div className="grid border-y md:grid-cols-3 md:divide-x">
      {FIGS.map((f, i) => (
        <div
          key={f.n}
          className="relative px-6 pb-10 pt-6 md:px-8"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => {
            setHover(null);
            if (f.kind === "plates") setPointer(null);
          }}
          onMouseMove={(e) => {
            if (f.kind !== "plates") return;
            const r = e.currentTarget.getBoundingClientRect();
            setPointer(Math.min(1, Math.max(0, (e.clientX - r.left - 32) / (r.width - 64))));
          }}
        >
          <p className="font-mono text-[11px] text-faint">{f.n}</p>
          <div className={cn("mx-auto mt-4 aspect-square w-full max-w-[300px]")}>
            {f.kind === "layers" && <FigLayers active={hover === i} />}
            {f.kind === "steps" && <FigSteps active={hover === i} />}
            {f.kind === "plates" && <FigPlates pointer={pointer} />}
          </div>
          <h3 className="mt-6 text-[15px] font-medium">{f.title}</h3>
          <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted-foreground">{f.body}</p>
        </div>
      ))}
    </div>
  );
}
