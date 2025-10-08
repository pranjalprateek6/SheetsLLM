"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

export default function Header(){
  const pathname = usePathname();
  const link = (href:string,label:string)=> (
    <Link href={href} className={cn(
      "px-3 py-1 rounded-full text-sm transition-colors",
      pathname===href
        ?"bg-zinc-200 dark:bg-white/15 text-zinc-900 dark:text-white"
        :"hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300"
    )}>{label}</Link>
  );
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mt-4 rounded-2xl border-2 border-zinc-300 dark:border-white/10 bg-white/90 dark:bg-white/5 backdrop-blur-xl shadow-lg">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight text-zinc-900 dark:text-white">SheetsLLM</Link>
            <nav className="flex items-center gap-2">
              {link("/","Home")}
              {link("/features","Features")}
              {link("/workspace","Workspace")}
              {link("/history","History")}
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
