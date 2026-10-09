"use client";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/* The ground the landing's product visuals stand on: a dot at every
   intersection of a spreadsheet-sized grid, with slow rings spreading out
   from random points and brightening the dots they pass, like a change
   rippling through a sheet. One canvas per placement, colours read from the
   theme tokens, paused while offscreen, and still dots under reduced motion. */

type Tokens = { dot: string; accent: string };

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  return {
    dot: cs.getPropertyValue("--muted-foreground").trim() || "240 4% 42%",
    accent: cs.getPropertyValue("--primary").trim() || "251 70% 57%",
  };
}

const hsl = (v: string, a: number) => `hsl(${v} / ${a})`;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// How wide a ring's bright band is, in px, and how far it travels
const BAND = 46;
const REACH = 0.85;

export default function GridBackdrop({ cell = 32, className }: { cell?: number; className?: string }) {
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
    let raf = 0;
    let visible = false;
    let last = performance.now();
    type Ring = { x: number; y: number; r: number; speed: number };
    let rings: Ring[] = [];
    let spawnIn = 0.2;

    function resize() {
      const r = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      frame(0);
    }

    function frame(dt: number) {
      const max = Math.max(w, h) * REACH;
      if (!reduced) {
        spawnIn -= dt;
        if (spawnIn <= 0 && rings.length < 3) {
          rings.push({
            x: Math.round(rand(0.15, 0.85) * (w / cell)) * cell,
            y: Math.round(rand(0.15, 0.85) * (h / cell)) * cell,
            r: 0,
            speed: rand(70, 105),
          });
          spawnIn = rand(1.1, 2.1);
        }
        rings.forEach((r) => (r.r += r.speed * dt));
        rings = rings.filter((r) => r.r < max);
      }

      ctx!.clearRect(0, 0, w, h);
      for (let x = 0; x <= w; x += cell) {
        for (let y = 0; y <= h; y += cell) {
          let glow = 0;
          for (const r of rings) {
            const d = Math.abs(Math.hypot(x - r.x, y - r.y) - r.r);
            if (d < BAND) {
              const fade = Math.pow(1 - r.r / max, 0.6);
              glow = Math.max(glow, (1 - d / BAND) * fade);
            }
          }
          ctx!.beginPath();
          if (glow > 0.03) {
            ctx!.fillStyle = hsl(tokens.accent, 0.35 + glow * 0.65);
            ctx!.arc(x + 0.5, y + 0.5, 1.6 + glow * 2.2, 0, Math.PI * 2);
          } else {
            ctx!.fillStyle = hsl(tokens.dot, 0.38);
            ctx!.arc(x + 0.5, y + 0.5, 1.5, 0, Math.PI * 2);
          }
          ctx!.fill();
        }
      }
    }

    function loop(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      frame(dt);
      if (visible) raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(canvas);
    // Theme flips change the tokens; redraw with the new ones
    const mo = new MutationObserver(() => {
      tokens = readTokens();
      frame(0);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    resize();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
    };
  }, [cell]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute", className)} />;
}
