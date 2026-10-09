"use client";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/* The spreadsheet grid the landing sits on, with a little light moving
   through it. Drawn on one canvas per placement, read from the theme tokens,
   paused while offscreen, and a still grid under reduced motion.

   Variants (compared at /lab/backgrounds):
   - beams:  short comets of violet run along random grid lines
   - drift:  a soft spotlight wanders and lights up only the lines it crosses
   - cells:  random cells fill with a faint violet and fade, like cleaned cells
   - ripple: dots at the intersections, brightened by slow expanding rings */

export type BackdropVariant = "beams" | "drift" | "cells" | "ripple";
export const BACKDROP_VARIANTS: BackdropVariant[] = ["beams", "drift", "cells", "ripple"];

type Tokens = { line: string; accent: string };

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const border = cs.getPropertyValue("--border").trim() || "240 6% 90%";
  const primary = cs.getPropertyValue("--primary").trim() || "251 70% 57%";
  return { line: border, accent: primary };
}

const hsl = (v: string, a: number) => `hsl(${v} / ${a})`;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export default function GridBackdrop({
  variant = "beams",
  cell = 40,
  className,
}: {
  variant?: BackdropVariant;
  cell?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tokens = readTokens();
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = false;
    let last = performance.now();

    // Offscreen copy of the grid lines, used as a mask by "drift"
    const gridLayer = document.createElement("canvas");
    const lightLayer = document.createElement("canvas");

    type Beam = { horiz: boolean; line: number; pos: number; dir: 1 | -1; speed: number; len: number };
    type Fill = { cx: number; cy: number; age: number; life: number };
    type Ring = { x: number; y: number; r: number; speed: number };
    let beams: Beam[] = [];
    let fills: Fill[] = [];
    let rings: Ring[] = [];
    let spawnIn = 0;
    let t = 0;

    const cols = () => Math.ceil(w / cell) + 1;
    const rows = () => Math.ceil(h / cell) + 1;

    function drawGrid(c: CanvasRenderingContext2D, alpha: number) {
      c.strokeStyle = hsl(tokens.line, alpha);
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x <= w; x += cell) {
        c.moveTo(Math.round(x) + 0.5, 0);
        c.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = 0; y <= h; y += cell) {
        c.moveTo(0, Math.round(y) + 0.5);
        c.lineTo(w, Math.round(y) + 0.5);
      }
      c.stroke();
    }

    function resize() {
      const r = canvas!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      for (const c of [canvas!, gridLayer, lightLayer]) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = gridLayer.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      drawGrid(g, 1);
      frame(0);
    }

    function spawnBeam(): Beam {
      const horiz = Math.random() < 0.5;
      const lines = horiz ? rows() : cols();
      const dir = Math.random() < 0.5 ? 1 : -1;
      const span = horiz ? w : h;
      const len = rand(110, 200);
      return {
        horiz,
        line: Math.floor(rand(1, Math.max(2, lines - 1))) * cell,
        pos: dir === 1 ? -len : span + len,
        dir,
        speed: rand(110, 190),
        len,
      };
    }

    function frame(dt: number) {
      ctx!.clearRect(0, 0, w, h);
      t += dt;

      if (variant === "ripple") {
        // Dots at intersections; rings brighten the dots they pass
        if (!reduced) {
          spawnIn -= dt;
          if (spawnIn <= 0 && rings.length < 2) {
            rings.push({ x: Math.round(rand(0.2, 0.8) * cols()) * cell, y: Math.round(rand(0.2, 0.8) * rows()) * cell, r: 0, speed: rand(60, 90) });
            spawnIn = rand(2.2, 3.6);
          }
          rings.forEach((r) => (r.r += r.speed * dt));
          rings = rings.filter((r) => r.r < Math.max(w, h));
        }
        for (let x = 0; x <= w; x += cell) {
          for (let y = 0; y <= h; y += cell) {
            let glow = 0;
            for (const r of rings) {
              const d = Math.abs(Math.hypot(x - r.x, y - r.y) - r.r);
              const fade = 1 - r.r / Math.max(w, h);
              if (d < 28) glow = Math.max(glow, (1 - d / 28) * fade);
            }
            ctx!.fillStyle = glow > 0.02 ? hsl(tokens.accent, 0.25 + glow * 0.6) : hsl(tokens.line, 1);
            const s = 1.6 + glow * 1.4;
            ctx!.beginPath();
            ctx!.arc(x + 0.5, y + 0.5, s, 0, Math.PI * 2);
            ctx!.fill();
          }
        }
        return;
      }

      if (variant === "drift" && !reduced) {
        // Faint grid everywhere, then the same lines lit inside a wandering light
        drawGrid(ctx!, 0.45);
        const l = lightLayer.getContext("2d")!;
        l.setTransform(dpr, 0, 0, dpr, 0, 0);
        l.globalCompositeOperation = "source-over";
        l.clearRect(0, 0, w, h);
        const cx = w * (0.5 + 0.32 * Math.sin(t * 0.21) + 0.08 * Math.sin(t * 0.67));
        const cy = h * (0.5 + 0.3 * Math.cos(t * 0.17) + 0.08 * Math.sin(t * 0.53));
        const rad = Math.max(220, Math.min(w, h) * 0.45);
        const grad = l.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grad.addColorStop(0, hsl(tokens.accent, 0.95));
        grad.addColorStop(0.5, hsl(tokens.accent, 0.35));
        grad.addColorStop(1, hsl(tokens.accent, 0));
        l.fillStyle = grad;
        l.fillRect(0, 0, w, h);
        l.globalCompositeOperation = "destination-in";
        l.setTransform(1, 0, 0, 1, 0, 0);
        l.drawImage(gridLayer, 0, 0);
        ctx!.setTransform(1, 0, 0, 1, 0, 0);
        ctx!.drawImage(lightLayer, 0, 0);
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        return;
      }

      if (variant === "cells" && !reduced) {
        spawnIn -= dt;
        if (spawnIn <= 0) {
          fills.push({ cx: Math.floor(rand(0, cols())), cy: Math.floor(rand(0, rows())), age: 0, life: rand(1.8, 3) });
          spawnIn = rand(0.12, 0.3);
        }
        fills.forEach((f) => (f.age += dt));
        fills = fills.filter((f) => f.age < f.life);
        for (const f of fills) {
          const p = f.age / f.life;
          const a = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
          ctx!.fillStyle = hsl(tokens.accent, 0.2 * a);
          ctx!.fillRect(f.cx * cell + 1, f.cy * cell + 1, cell - 1, cell - 1);
        }
      }

      drawGrid(ctx!, 0.75);

      if (variant === "beams" && !reduced) {
        spawnIn -= dt;
        if (spawnIn <= 0 && beams.length < 7) {
          beams.push(spawnBeam());
          spawnIn = rand(0.3, 0.9);
        }
        beams.forEach((b) => (b.pos += b.dir * b.speed * dt));
        beams = beams.filter((b) => {
          const span = b.horiz ? w : h;
          return b.dir === 1 ? b.pos - b.len < span : b.pos + b.len > 0;
        });
        ctx!.lineWidth = 2;
        for (const b of beams) {
          const tail = b.pos - b.dir * b.len;
          const [x1, y1, x2, y2] = b.horiz
            ? [tail, b.line + 0.5, b.pos, b.line + 0.5]
            : [b.line + 0.5, tail, b.line + 0.5, b.pos];
          const g = ctx!.createLinearGradient(x1, y1, x2, y2);
          g.addColorStop(0, hsl(tokens.accent, 0));
          g.addColorStop(0.7, hsl(tokens.accent, 0.55));
          g.addColorStop(1, hsl(tokens.accent, 1));
          ctx!.strokeStyle = g;
          ctx!.beginPath();
          ctx!.moveTo(x1, y1);
          ctx!.lineTo(x2, y2);
          ctx!.stroke();
        }
      }
    }

    function loop(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      frame(dt);
      if (visible && !reduced) raf = requestAnimationFrame(loop);
    }

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !reduced) start();
      else cancelAnimationFrame(raf);
    });
    io.observe(canvas);
    // Theme flips change the tokens; redraw with the new ones
    const mo = new MutationObserver(() => {
      tokens = readTokens();
      resize();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    resize();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
    };
  }, [variant, cell]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute", className)} />;
}
