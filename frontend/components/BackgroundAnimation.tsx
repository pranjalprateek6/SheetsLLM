"use client";
import { useEffect, useRef } from "react";

export default function BackgroundAnimation() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    let w = 0, h = 0;
    const resize = () => {
      w = Math.floor(window.innerWidth);
      h = Math.floor(window.innerHeight);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // --- particles for the aurora layer (reduced for performance) ---
    const colors = ["#00FFF0", "#7D5FFF", "#E8E8E8"];
    const N = 12; // reduced from 30 for performance
    const parts = Array.from({ length: N }).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 120 + Math.random() * 180,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
      a: 0.08 + Math.random() * 0.05,
    }));

    const drawGradient = () => {
      const g = ctx.createRadialGradient(w * 0.35, h * 0.25, 0, w * 0.35, h * 0.25, Math.hypot(w, h));
      g.addColorStop(0, "#1A1A1A");
      g.addColorStop(1, "#0B0B0B");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };

    const drawGrid = () => {
      const spacing = 100;
      ctx.save();
      ctx.globalAlpha = 0.03; // reduced opacity
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1;

      // verticals (reduce iterations by skipping some)
      for (let x = 0; x <= w; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // horizontals
      for (let y = 0; y <= h; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawAurora = () => {
      ctx.save();
      ctx.filter = "blur(30px)"; // reduced blur for performance
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -200 || p.x > w + 200) p.vx *= -1;
        if (p.y < -200 || p.y > h + 200) p.vy *= -1;

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        const rgba = (a: number) => {
          const hex = p.c.replace("#", "");
          const r = parseInt(hex.slice(0, 2), 16);
          const g2 = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          return `rgba(${r},${g2},${b},${a})`;
        };
        g.addColorStop(0, rgba(p.a));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    // Cached noise pattern - only redraw on resize
    let noiseCanvas: HTMLCanvasElement | null = null;
    const createNoiseTexture = () => {
      noiseCanvas = document.createElement('canvas');
      noiseCanvas.width = 400;
      noiseCanvas.height = 400;
      const noiseCtx = noiseCanvas.getContext('2d')!;
      noiseCtx.globalAlpha = 0.03;
      for (let i = 0; i < 800; i++) { // reduced from 2500
        const x = Math.random() * 400;
        const y = Math.random() * 400;
        noiseCtx.fillStyle = '#fff';
        noiseCtx.fillRect(x, y, 1, 1);
      }
    };
    createNoiseTexture();
    
    const drawNoise = () => {
      if (noiseCanvas) {
        ctx.save();
        ctx.globalAlpha = 0.04;
        ctx.drawImage(noiseCanvas, 0, 0, w, h);
        ctx.restore();
      }
    };

    const tick = () => {
      drawGradient();
      drawGrid();
      drawAurora();
      drawNoise();
      raf.current = requestAnimationFrame(tick);
    };

    // Start animation loop
    raf.current = requestAnimationFrame(tick);

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ 
        background: "transparent",
        zIndex: -1,
        width: "100vw",
        height: "100vh"
      }}
    />
  );
}
