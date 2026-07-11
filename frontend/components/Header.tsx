"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { User, LogOut, ChevronDown, ArrowRight, Menu, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  // Hide header on auth page
  if (pathname === "/auth") return null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<boolean | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load the privacy setting when the dropdown first opens
  useEffect(() => {
    if (menuOpen && privacyMode === null && user) {
      fetchWithAuth("/api/settings")
        .then((r) => r.json())
        .then((d) => setPrivacyMode(!!d.privacy_mode))
        .catch(() => setPrivacyMode(false));
    }
  }, [menuOpen, privacyMode, user]);

  const togglePrivacy = async () => {
    const next = !privacyMode;
    setPrivacyMode(next); // optimistic
    try {
      const r = await fetchWithAuth("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacy_mode: next }),
      });
      if (!r.ok) setPrivacyMode(!next); // revert on failure
    } catch {
      setPrivacyMode(!next);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={cn(
        "text-xs font-mono tracking-wider transition-colors",
        pathname === href
          ? "text-white"
          : "text-white/50 hover:text-cyan-400"
      )}
    >
      {label}
    </Link>
  );

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.push("/");
  };

  // Signed out: logo centered, no nav
  if (!loading && !user) {
    return (
      <header className="sticky top-0 z-50 w-full bg-transparent pt-4">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo.png" alt="SheetsLLM" width={36} height={36} className="w-9 h-9" />
              <span className="font-mono text-xl font-bold text-white">SheetsLLM</span>
            </Link>
          </div>
        </div>
      </header>
    );
  }

  // Loading state
  if (loading) {
    return (
      <header className="sticky top-0 z-50 w-full bg-transparent pt-4">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo.png" alt="SheetsLLM" width={36} height={36} className="w-9 h-9" />
              <span className="font-mono text-xl font-bold text-white">SheetsLLM</span>
            </Link>
          </div>
        </div>
      </header>
    );
  }

  // Signed in: full navbar
  return (
    <header className="sticky top-0 z-50 w-full bg-[#0A0A0A]/80 backdrop-blur-sm border-b border-white/5">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="SheetsLLM" width={28} height={28} className="w-7 h-7" />
            <span className="font-mono text-lg font-bold text-white">SheetsLLM</span>
          </Link>

          {/* Desktop nav — center */}
          <nav className="hidden md:flex items-center gap-8">
            {navLink("/", "HOME")}
            {navLink("/dashboard", "FILES")}
            {navLink("/workspace", "WORKSPACE")}
          </nav>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-4">
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-white hover:text-cyan-400 transition-colors"
              >
                <User className="h-4 w-4" />
                <span className="max-w-[100px] truncate">
                  {user?.email?.split("@")[0]?.toUpperCase()}
                </span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", menuOpen && "rotate-180")} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-neutral-900 border border-white/10 py-1 shadow-lg">
                  <div className="px-4 py-2 border-b border-white/5">
                    <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Signed in as</p>
                    <p className="text-sm font-mono font-medium text-white truncate mt-0.5">
                      {user?.email}
                    </p>
                  </div>
                  <button
                    onClick={togglePrivacy}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-mono text-white/80 hover:bg-white/5 transition-colors"
                    title="When on, prompts sent to the AI contain column names and types only — never sample values or rows from your data."
                  >
                    <ShieldCheck className={cn("h-4 w-4", privacyMode ? "text-cyan-400" : "text-white/40")} />
                    <span className="flex-1 text-left">PRIVACY MODE</span>
                    <span
                      className={cn(
                        "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
                        privacyMode ? "bg-cyan-500" : "bg-white/15"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-3 w-3 rounded-full bg-white transition-transform",
                          privacyMode ? "translate-x-3.5" : "translate-x-0.5"
                        )}
                      />
                    </span>
                  </button>
                  <p className="px-4 pb-2 text-[10px] font-mono leading-relaxed text-white/35">
                    Schema-only prompts: the AI never sees sample values or rows.
                  </p>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-mono text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/5"
                  >
                    <LogOut className="h-4 w-4" />
                    SIGN OUT
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-white"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden py-4 border-t border-white/5 space-y-4">
            <nav className="flex flex-col gap-4">
              {navLink("/", "HOME")}
              {navLink("/dashboard", "FILES")}
              {navLink("/workspace", "WORKSPACE")}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
