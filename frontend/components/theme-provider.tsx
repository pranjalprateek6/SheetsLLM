"use client";

import { MotionConfig } from "framer-motion";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// The public pages, which get the editorial header. Every page, public or
// not, follows the reader's own light or dark choice.
const MARKETING = ["/pricing", "/tools", "/product", "/auth", "/try"];
export const isMarketingPath = (path: string) => path === "/" || MARKETING.some((p) => path.startsWith(p));

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      {/* Honor the OS reduce-motion setting for all framer-motion
          animations (CSS animations are handled in globals.css). */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </NextThemesProvider>
  );
}
