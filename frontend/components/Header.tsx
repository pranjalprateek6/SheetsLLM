"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function Header(){
  const pathname = usePathname();
  const link = (href:string,label:string)=> (
    <Link href={href} className={cn(
      "text-sm font-medium transition-colors",
      pathname===href
        ? "text-black dark:text-white"
        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
    )}>{label}</Link>
  );
  
  return (
    <header className="sticky top-0 z-50 w-full glass-card no-hover">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="text-lg font-semibold text-black dark:text-white">
            SheetsLLM
          </Link>
          
          <nav className="flex items-center gap-8">
            {link("/","Home")}
            {link("/features","Features")}
            {link("/workspace","Workspace")}
            {link("/history","History")}
          </nav>
        </div>
      </div>
    </header>
  );
}
