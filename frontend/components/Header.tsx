"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { ArrowRight, ChevronDown, FileSpreadsheet, LogOut, Menu, Moon, ShieldCheck, Sun, X } from "lucide-react";
import { onOpenFile, type OpenFile } from "@/lib/open-file";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import FeedbackWidget from "@/components/FeedbackWidget";
import { isMarketingPath } from "@/components/theme-provider";
import { PRODUCT_PAGES } from "@/components/marketing/product-pages";

// Signed in, the nav is where your work lives. Pricing stays one step away
// (usage card, account, the cap messages), not a tab beside your files.
const APP_LINKS = [
  { href: "/dashboard", label: "Files" },
  { href: "/recipes", label: "Recipes" },
];

const MARKETING_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/tools", label: "Free tools" },
];

// A pill-shaped nav item: 13px muted text that brightens on a faint fill
const navItem =
  "inline-flex h-8 items-center rounded-full px-3 text-[13px] transition-colors duration-100 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]";

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
      className="h-8 w-8 rounded-full text-muted-foreground"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <IconSwap state={dark ? "a" : "b"} a={<Sun className="h-4 w-4" />} b={<Moon className="h-4 w-4" />} />
    </Button>
  );
}

/** The mark and the name, used in the header and the footer. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
      <img src="/logo.svg" alt="" width={20} height={20} className="h-5 w-5" />
      <span className="text-[15px] font-semibold tracking-[-0.01em]">SheetsLLM</span>
    </span>
  );
}

/** Product, opening a wide panel of the product pages, the way the reference does. */
function ProductMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const enter = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };
  const active = pathname.startsWith("/product");

  return (
    <div ref={wrap} className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="product-menu"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          navItem,
          open || active ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
        )}
      >
        Product
      </button>
      <div
        id="product-menu"
        className={cn(
          "absolute right-0 top-full z-50 w-[min(820px,calc(100vw-48px))] pt-2 transition duration-150 ease-out",
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
        )}
      >
        <div className="overflow-hidden rounded-2xl border bg-popover shadow-[0_24px_48px_-12px_rgb(0_0_0/0.6)] backdrop-blur-xl">
          <div className="m-2 grid grid-cols-[1fr_1fr_0.8fr] rounded-xl border bg-card/80">
            {[PRODUCT_PAGES.slice(0, 2), PRODUCT_PAGES.slice(2, 4)].map((col, i) => (
              <ul key={i} className="space-y-1 border-r p-3">
                {col.map((p) => (
                  <li key={p.href}>
                    <Link
                      href={p.href}
                      className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
                    >
                      <span className="block text-[13px] font-medium text-foreground">{p.name}</span>
                      <span className="mt-0.5 block max-w-[210px] text-[13px] leading-snug text-muted-foreground">{p.menu}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
            <ul className="space-y-0.5 p-3">
              {[
                ["/tools", "Free CSV tools"],
                ["/pricing", "Pricing"],
                ["/product/privacy", "Privacy"],
                ["/auth", "Sign in"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="block rounded-lg px-3 py-2 text-[13px] text-foreground transition-colors hover:bg-white/[0.04]">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Link
            href="/product/recipes"
            className="group flex items-center justify-between px-5 py-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>
              <span className="font-medium text-foreground">Recipes</span> Next month&apos;s export, cleaned in one drop
            </span>
            <span className="inline-flex items-center gap-1">
              Learn more <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // The file the workspace has open, so "where am I" stays answered
  const [openFile, setOpenFile] = useState<OpenFile>(null);
  useEffect(() => onOpenFile(setOpenFile), []);

  // Load the privacy setting when the dropdown (or the mobile menu) opens
  useEffect(() => {
    if ((menuOpen || mobileOpen) && privacyMode === null && user) {
      fetchWithAuth("/api/settings")
        .then((r) => r.json())
        .then((d) => setPrivacyMode(!!d.privacy_mode))
        .catch(() => setPrivacyMode(null)); // unknown, not "off"
    }
  }, [menuOpen, mobileOpen, privacyMode, user]);

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
  const marketing = !user && isMarketingPath(pathname);
  // The workspace is a full-bleed working surface; a centered max-width nav
  // above it reads as a misaligned island. Marketing/app pages keep the
  // centered container.
  const fullBleed = pathname.startsWith("/workspace");

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/75 backdrop-blur-xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(0))]:bg-background">
      <div
        className={cn(
          "relative flex items-center justify-between px-4",
          marketing ? "h-[72px]" : "h-14",
          // The public header shares the page's 1280px measure, so the mark and
          // the nav line up with the content edges below
          fullBleed ? "w-full" : marketing ? "mx-auto max-w-[1344px] px-5 sm:px-8" : "mx-auto max-w-6xl sm:px-6",
        )}
      >
        {/* Logo: home for prospects, dashboard for signed-in users */}
        <div className="flex min-w-0 items-center">
          <Link href={user ? "/dashboard" : "/"} className="rounded-md">
            <Wordmark />
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
                      navItem,
                      pathname === l.href
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                    )}
                  >
                    {l.label}
                  </Link>
                ))}
                {openFile && pathname.startsWith("/workspace") && (
                  <>
                    <span className="mx-1 text-faint" aria-hidden>/</span>
                    <Link
                      href={`/workspace?file_id=${openFile.id}`}
                      aria-current="page"
                      title={openFile.name}
                      className={cn(navItem, "max-w-[260px] gap-1.5 bg-accent font-medium text-foreground")}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 flex-shrink-0 text-primary-accent" aria-hidden />
                      <span className="truncate">{openFile.name}</span>
                    </Link>
                  </>
                )}
              </nav>
            </>
          )}
        </div>

        {/* Right side */}
        <div className="hidden items-center gap-1 md:flex">
          {!user && (
            <nav className="flex items-center gap-0.5">
              <ProductMenu pathname={pathname} />
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={pathname === l.href ? "page" : undefined}
                  className={cn(
                    navItem,
                    pathname === l.href ? "text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
          {!user && <span className="mx-2 h-4 w-px bg-border" aria-hidden />}
          {user && <FeedbackWidget />}
          {!marketing && <ThemeToggle />}
          {loading ? null : user ? (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 rounded-full pl-1.5 text-muted-foreground">
                  <span
                    aria-hidden
                    className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold uppercase text-primary-accent"
                  >
                    {(user.email ?? "?").charAt(0)}
                  </span>
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
                    className={cn("mt-0.5 h-4 w-4", privacyMode === false ? "text-warning-text" : "text-muted-foreground")}
                  />
                  <div className="flex-1">
                    <p className="text-sm">Strict privacy mode</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      On: Chef sees column names and types only. Off: also a few sample rows.
                    </p>
                  </div>
                  <Switch checked={!!privacyMode} aria-hidden tabIndex={-1} className="pointer-events-none mt-0.5" />
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account">Account &amp; billing</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive-text focus:text-destructive-text">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link href="/auth" className={cn(navItem, "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground")}>
                Sign in
              </Link>
              <Button variant="inverse" size="sm" className="ml-1 h-8 px-3.5" asChild>
                <Link href="/auth?mode=signup">Get started</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile: theme + menu */}
        <div className="flex items-center gap-1 md:hidden">
          {!marketing && <ThemeToggle />}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-full p-2 text-muted-foreground hover:bg-accent"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            <IconSwap state={mobileOpen ? "a" : "b"} a={<X className="h-5 w-5" />} b={<Menu className="h-5 w-5" />} />
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div id="mobile-nav" className="border-t border-border bg-background px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {!user &&
              PRODUCT_PAGES.map((p) => (
                <Link key={p.href} href={p.href} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                  {p.name}
                </Link>
              ))}
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            {!loading && user && (
              <>
                <button
                  type="button"
                  role="switch"
                  aria-checked={privacyMode === null ? false : privacyMode}
                  disabled={privacyMode === null}
                  onClick={togglePrivacy}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  <ShieldCheck className={cn("h-4 w-4", privacyMode === false && "text-warning-text")} aria-hidden />
                  <span className="flex-1">
                    Strict privacy mode
                    <span className="block text-xs">
                      {privacyMode ? "On: Chef sees names and types only" : "Off: Chef also sees a few sample rows"}
                    </span>
                  </span>
                  <Switch checked={!!privacyMode} aria-hidden tabIndex={-1} className="pointer-events-none" />
                </button>
                <Link href="/account" className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                  Account &amp; billing
                </Link>
              </>
            )}
            {user && (
              <div className="px-1 pt-1">
                <FeedbackWidget variant="outline" />
              </div>
            )}
            {!loading && !user && (
              <div className="mt-2 flex gap-2 border-t border-border pt-3">
                <Button variant="glass" size="sm" className="flex-1" asChild>
                  <Link href="/auth">Sign in</Link>
                </Button>
                <Button variant="inverse" size="sm" className="flex-1" asChild>
                  <Link href="/auth?mode=signup">Get started</Link>
                </Button>
              </div>
            )}
            {!loading && user && (
              <button
                onClick={handleSignOut}
                className="mt-2 flex items-center gap-2 rounded-lg border-t border-border px-3 pb-1 pt-3 text-sm text-destructive-text"
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
