"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IconSwap } from "@/components/ui/icon-swap";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, Menu, Moon, ShieldCheck, Sun, User, X } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import FeedbackWidget from "@/components/FeedbackWidget";

const APP_LINKS = [
  { href: "/dashboard", label: "Files" },
  { href: "/workspace", label: "Workspace" },
  { href: "/pricing", label: "Pricing" },
];

const MARKETING_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/pricing", label: "Pricing" },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="h-8 w-8" aria-hidden />; // avoid hydration mismatch
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <IconSwap
        state={dark ? "a" : "b"}
        a={<Sun className="h-4 w-4" />}
        b={<Moon className="h-4 w-4" />}
      />
    </Button>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Load the privacy setting when the dropdown first opens
  useEffect(() => {
    if (menuOpen && privacyMode === null && user) {
      fetchWithAuth("/api/settings")
        .then((r) => r.json())
        .then((d) => setPrivacyMode(!!d.privacy_mode))
        .catch(() => setPrivacyMode(null)); // unknown, not "off"
    }
  }, [menuOpen, privacyMode, user]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (pathname.startsWith("/auth")) return null;

  const togglePrivacy = async () => {
    if (privacyMode === null) return; // still loading the authoritative value
    const next = !privacyMode;
    setPrivacyMode(next); // optimistic
    try {
      const r = await fetchWithAuth("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacy_mode: next }),
      });
      // On failure, reset to unknown so the next open refetches the truth.
      if (!r.ok) {
        setPrivacyMode(null);
        toast.error("Couldn't save that. Strict privacy mode is unchanged.");
      }
    } catch {
      setPrivacyMode(null);
      toast.error("Couldn't save that. Check your connection and try again.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      toast.error("Couldn't sign you out. Check your connection and try again.");
      return;
    }
    router.replace("/");
  };

  const links = user ? APP_LINKS : MARKETING_LINKS;
  // The workspace is a full-bleed working surface; a centered max-width nav
  // above it reads as a misaligned island. Marketing/app pages keep the
  // centered container.
  const fullBleed = pathname.startsWith("/workspace");

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/85 backdrop-blur-md">
      <div
        className={cn(
          "relative flex h-14 items-center justify-between px-4",
          fullBleed ? "w-full" : "mx-auto max-w-6xl sm:px-6"
        )}
      >
        {/* Logo — home for prospects, dashboard for signed-in users */}
        <div className="flex min-w-0 items-center">
          <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimizer needed */}
            <img src="/logo.svg" alt="" width={26} height={26} className="h-[26px] w-[26px]" />
            <span className="text-[15px] font-semibold tracking-tight">SheetsLLM</span>
          </Link>

          {/* Signed in, the nav is a location rather than a menu, so it sits
              beside the mark and marks the current place with a surface. */}
          {user && (
            <>
              <span className="mx-3 hidden h-4 w-px bg-border md:block" aria-hidden />
              <nav className="hidden items-center gap-0.5 md:flex">
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={pathname === l.href ? "page" : undefined}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-sm transition-colors",
                      pathname === l.href
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )}
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
            </>
          )}
        </div>

        {/* Signed out, the nav is a menu: centered on the page's axis regardless
            of the logo and account widths on either side */}
        {!user && (
          <nav className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex [&>a]:pointer-events-auto">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={pathname === l.href ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  pathname === l.href
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}

        {/* Right side */}
        <div className="hidden items-center gap-2 md:flex">
          <FeedbackWidget />
          <ThemeToggle />
          {loading ? null : user ? (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span className="max-w-[120px] truncate">{user.email?.split("@")[0]}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-xs text-muted-foreground">Signed in as</p>
                  <p className="mt-0.5 truncate text-sm font-medium">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="items-start gap-2.5"
                  role="menuitemcheckbox"
                  aria-checked={privacyMode === null ? "mixed" : privacyMode}
                  onSelect={(e) => {
                    e.preventDefault(); // keep the menu open while toggling
                    togglePrivacy();
                  }}
                >
                  <ShieldCheck
                    className={cn("mt-0.5 h-4 w-4", privacyMode ? "text-success-text" : "text-muted-foreground")}
                  />
                  <div className="flex-1">
                    <p className="text-sm">Strict privacy mode</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      The AI sees column names and types only, never your data.
                    </p>
                  </div>
                  <Switch checked={!!privacyMode} aria-hidden tabIndex={-1} className="pointer-events-none mt-0.5" />
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account">Account &amp; billing</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive-text focus:text-destructive-text"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/auth">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/auth?mode=signup">Get started</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile: theme + menu */}
        <div className="flex items-center gap-1 md:hidden">
        <ThemeToggle />
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent"
          aria-label="Toggle menu"
        >
          <IconSwap
            state={mobileOpen ? "a" : "b"}
            a={<X className="h-5 w-5" />}
            b={<Menu className="h-5 w-5" />}
          />
        </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="border-t border-border bg-background px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            <div className="px-1 pt-1">
              <FeedbackWidget variant="outline" />
            </div>
            {!loading && !user && (
              <div className="mt-2 flex gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href="/auth">Sign in</Link>
                </Button>
                <Button size="sm" className="flex-1" asChild>
                  <Link href="/auth?mode=signup">Get started</Link>
                </Button>
              </div>
            )}
            {!loading && user && (
              <button
                onClick={handleSignOut}
                className="mt-2 flex items-center gap-2 rounded-md border-t border-border px-3 pb-1 pt-3 text-sm text-destructive-text"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
