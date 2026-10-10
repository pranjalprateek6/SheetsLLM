"use client";

import { MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// The public site is always dark, like the product it shows; inside the app
// the reader's own choice applies.
const MARKETING = ["/pricing", "/tools", "/product", "/auth"];
export const isMarketingPath = (path: string) => path === "/" || MARKETING.some((p) => path.startsWith(p));

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname() ?? "/";
  return (
    <NextThemesProvider {...props} forcedTheme={isMarketingPath(pathname) ? "dark" : undefined}>
      {/* Honor the OS reduce-motion setting for all framer-motion
          animations (CSS animations are handled in globals.css). */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </NextThemesProvider>
  );
}
