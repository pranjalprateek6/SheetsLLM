'use client';
import React, { useMemo, type JSX } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TextShimmerProps {
  children: string;
  as?: React.ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

export function TextShimmer({
  children,
  as: Component = 'p',
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  // Memoized because motion.create() mints a new component type per call:
  // building it inline would remount the subtree (and restart the shimmer)
  // on every render.
  const MotionComponent = useMemo(
    () => motion.create(Component as keyof JSX.IntrinsicElements),
    [Component]
  );

  // MotionConfig reducedMotion="user" only suppresses transform and layout
  // properties, and the CSS guards only reach CSS animations, so neither one
  // stops an infinite backgroundPosition loop. An unstoppable indefinite
  // animation is exactly what WCAG 2.2.2 forbids, so opt out here.
  const reduce = useReducedMotion();

  const dynamicSpread = useMemo(() => {
    return children.length * spread;
  }, [children, spread]);

  if (reduce) {
    return <Component className={cn('inline-block text-muted-foreground', className)}>{children}</Component>;
  }

  return (
    <MotionComponent
      className={cn(
        'relative inline-block bg-[length:250%_100%,auto] bg-clip-text',
        'text-transparent [--base-color:hsl(var(--muted-foreground))] [--base-gradient-color:hsl(var(--foreground))]',
        // background-repeat has no `padding-box` keyword; including it made the
        // browser discard the whole declaration, so the gradient tiled.
        '[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat] [background-origin:padding-box]',
        // Windows High Contrast strips background images; without this the
        // transparent text would vanish entirely.
        '[@media(forced-colors:active)]:text-[CanvasText] [@media(forced-colors:active)]:[-webkit-text-fill-color:CanvasText]',
        className
      )}
      initial={{ backgroundPosition: '100% center' }}
      animate={{ backgroundPosition: '0% center' }}
      transition={{
        repeat: Infinity,
        duration,
        ease: 'linear',
      }}
      style={
        {
          '--spread': `${dynamicSpread}px`,
          backgroundImage: `var(--bg), linear-gradient(var(--base-color), var(--base-color))`,
        } as React.CSSProperties
      }
    >
      {children}
    </MotionComponent>
  );
}
