"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/* Looping product demos on the landing, played like a muted video: a ghost
   cursor moves to named targets ([data-ghost="…"]) inside a frame, presses,
   and the scene state changes underneath it. Plays only while on screen,
   restarts from the top when it comes back, and under reduced motion shows
   the last frame with no cursor. */

export type Frame<T> = Partial<T> & { at: number; cursor?: string | null; click?: boolean; carry?: boolean };
export type SceneState<T> = T & { cursor: string | null; click: boolean; carry: boolean };

export function useScene<T extends object>(
  frames: Frame<T>[],
  total: number,
  initial: T,
  ref: RefObject<HTMLElement | null>,
): SceneState<T> {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    if (reduced || !visible) {
      setIndex(0);
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setIndex(0);
      timers = frames.map((f, i) => setTimeout(() => setIndex(i), f.at));
      timers.push(setTimeout(run, total));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [frames, total, reduced, visible]);

  // Each frame overrides the one before; a press lasts exactly one frame
  const upto = reduced ? frames.length - 1 : index;
  let state = { ...initial, cursor: null, click: false, carry: false } as SceneState<T>;
  for (let i = 0; i <= upto; i++) {
    const { at: _at, click: _click, ...rest } = frames[i];
    void _at;
    void _click;
    state = { ...state, ...rest };
  }
  state.click = !reduced && !!frames[upto]?.click;
  if (reduced) state.cursor = null;
  return state;
}

/** The pointer. Positions itself on the target's centre, relative to `frame`. */
export function GhostCursor({
  frame,
  target,
  click,
  carry,
}: {
  frame: RefObject<HTMLElement | null>;
  target: string | null;
  click?: boolean;
  carry?: ReactNode;
}) {
  // The last place it pointed, kept while hidden so it fades where it stands
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [shown, setShown] = useState(false);
  const [clicks, setClicks] = useState(0);

  useLayoutEffect(() => {
    const place = () => {
      const f = frame.current;
      if (!f || !target) return setShown(false);
      const el = f.querySelector<HTMLElement>(`[data-ghost="${target}"]`);
      const r = el?.getBoundingClientRect();
      if (!el || !r || r.width === 0) return setShown(false);
      const fr = f.getBoundingClientRect();
      setPos({ x: r.left - fr.left + r.width * 0.55, y: r.top - fr.top + r.height * 0.6 });
      setShown(true);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [frame, target]);

  useEffect(() => {
    if (click) setClicks((n) => n + 1);
  }, [click]);

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-30 transition duration-700 ease-out-quint",
        pos && shown ? "opacity-100" : "opacity-0",
      )}
      style={{ transform: pos ? `translate(${pos.x}px, ${pos.y}px)` : undefined }}
    >
      {/* Press ring, restarted on every click */}
      {clicks > 0 && (
        <span key={clicks} className="absolute -left-3 -top-3 h-6 w-6 animate-ghost-press rounded-full border-2 border-primary/60" />
      )}
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        className={cn("drop-shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-transform duration-150", click && "scale-[0.85]")}
      >
        <path d="M2 1.5 L2 14.5 L5.6 11.2 L8 16.5 L10.4 15.4 L8.1 10.3 L13 10.3 Z" fill="black" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      {carry && <div className="absolute left-4 top-4">{carry}</div>}
    </div>
  );
}
