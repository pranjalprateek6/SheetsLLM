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
    // The opened stack spans y -113 to 135 in this box: the top sheet's corner
    // sits at -83, lowered 60, lifted at most 5 × 18; nothing reaches the edge
    <svg viewBox="-150 -150 300 300" overflow="visible" className="h-full w-full" aria-hidden>
      <g transform="translate(0 60)">
        {Array.from({ length: layers }, (_, i) => {
          const isTop = i === layers - 1;
          const lift = i * (open ? 18 : 12);
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
    <svg viewBox="-160 -170 320 320" overflow="visible" className="h-full w-full" aria-hidden>
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

// Column plates standing side by side along x, each thin in x and deep in y.
// Their geometry lives in the drawing's own units, so the cursor is converted
// into the same units and every plate answers to its true distance from it.
const PLATES = 16;
const PITCH = 15;
const THICK = 5;
const DEPTH = 88;
const X0 = -((PLATES - 1) * PITCH) / 2 - THICK / 2;
const plateX = (i: number) => X0 + i * PITCH;
/** Where a plate's centre falls across the drawing, in viewBox units */
const plateScreenX = (i: number) => (plateX(i) + THICK / 2) * C30;

const LOW = 12; // what the plates settle to beside the cursor
const PEAK = 128; // the tallest a plate rises under it
const REACH = 34; // how far the bump spreads, in viewBox units

/** The resting skyline: a soft hill a little behind the middle */
const REST = Array.from({ length: PLATES }, (_, i) => {
  const t = i / (PLATES - 1);
  return 22 + 70 * Math.exp(-Math.pow((t - 0.4) / 0.32, 2));
});

/** Column plates that rise under the cursor and settle back when it leaves. */
export function FigPlates({ pointer }: { pointer: { x: number; y: number } | null }) {
  const reduced = useReducedMotion();
  const svg = useRef<SVGSVGElement>(null);
  const [heights, setHeights] = useState(REST);
  const h = useRef(REST.slice());
  const v = useRef(REST.map(() => 0));
  const target = useRef(REST.slice());
  const raf = useRef(0);
  const [cursorX, setCursorX] = useState<number | null>(null);

  useEffect(() => {
    // The cursor, in the drawing's units
    let cx: number | null = null;
    const el = svg.current;
    if (pointer && el && !reduced) {
      const m = el.getScreenCTM();
      if (m) {
        const pt = new DOMPoint(pointer.x, pointer.y).matrixTransform(m.inverse());
        cx = pt.x;
      }
    }
    setCursorX(cx);
    target.current =
      cx === null
        ? REST
        : REST.map((_, i) => {
            const d = plateScreenX(i) - cx!;
            return LOW + (PEAK - LOW) * Math.exp(-(d * d) / (2 * REACH * REACH));
          });

    if (reduced) {
      h.current = target.current.slice();
      setHeights(h.current);
      return;
    }
    // A light spring per plate: quick to answer, a touch of give, then still
    cancelAnimationFrame(raf.current);
    const step = () => {
      let moving = false;
      for (let i = 0; i < PLATES; i++) {
        v.current[i] = (v.current[i] + (target.current[i] - h.current[i]) * 0.16) * 0.7;
        h.current[i] += v.current[i];
        if (Math.abs(v.current[i]) > 0.05 || Math.abs(target.current[i] - h.current[i]) > 0.3) moving = true;
      }
      setHeights(h.current.slice());
      if (moving) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [pointer, reduced]);

  // The plate nearest the cursor is the one marked in violet
  let nearest = -1;
  if (cursorX !== null) {
    let best = Infinity;
    for (let i = 0; i < PLATES; i++) {
      const d = Math.abs(plateScreenX(i) - cursorX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
  }

  // Tallest point: a back corner at full height. viewBox leaves room for it.
  return (
    <svg ref={svg} viewBox="-160 -170 320 320" overflow="visible" className="h-full w-full" aria-hidden>
      <g transform="translate(0 40)">
        {heights.map((ht, i) => {
          const lit = Math.min(1, Math.max(0, (ht - LOW) / (PEAK - LOW)));
          const stroke =
            i === nearest && ht > 60
              ? VIOLET
              : `hsl(var(--foreground) / ${(0.26 + lit * 0.5).toFixed(3)})`;
          return <Box key={i} x={plateX(i)} y={-DEPTH / 2} z={0} w={THICK} d={DEPTH} h={ht} stroke={stroke} />;
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
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="grid md:grid-cols-3 md:divide-x">
      {FIGS.map((f, i) => (
        <div
          key={f.n}
          className="relative px-6 pb-10 pt-6 md:px-8 md:first:pl-0"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => {
            setHover(null);
            if (f.kind === "plates") setPointer(null);
          }}
          onMouseMove={(e) => {
            if (f.kind === "plates") setPointer({ x: e.clientX, y: e.clientY });
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
