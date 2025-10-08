"use client";
import * as React from "react";
import Link from "next/link";
import { Upload, Table2, History as HistoryIcon, FileDown } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { cn } from "./ui/cn";
import { ScrollArea } from "./ui/ScrollArea";
import Tooltip from "./ui/Tooltip";

export default function Sidebar() {
  const uploads = useAppStore((s) => s.uploads);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const [expanded, setExpanded] = React.useState(false);

  return (
    <aside
      className={cn(
        "fixed top-14 bottom-6 left-0 z-30 transition-[width] duration-300",
        expanded ? "w-[280px]" : "w-16"
      )}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="h-full border-r border-border-light dark:border-border-dark bg-white/60 dark:bg-zinc-900/60 backdrop-blur p-2">
        <nav className="space-y-2">
          <NavItem expanded={expanded} href="/workspace" icon={<Table2 size={18} />}>Workspace</NavItem>
          <SectionLabel expanded={expanded}>Uploads</SectionLabel>
          <div className={cn("rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800", expanded ? "p-2" : "p-1")}
               id="uploads">
            {uploads.length === 0 ? (
              <div className="text-xs opacity-60 px-2 py-3">No uploads</div>
            ) : (
              <ScrollArea className="max-h-[40vh]">
                <ul className="space-y-1">
                  {uploads.map((u) => (
                    <li key={u.id}>
                      <button
                        className="w-full text-left px-2 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        onClick={() => setActiveFile({ id: u.id, name: u.name })}
                        title={u.name}
                      >
                        <div className="text-xs truncate">{u.name}</div>
                        {expanded && (
                          <div className="text-[10px] opacity-60">
                            {u.size ? `${(u.size / 1024).toFixed(1)}KB` : ""} {u.uploadedAt ? `• ${u.uploadedAt}` : ""}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>
          <NavItem expanded={expanded} href="#history" icon={<HistoryIcon size={18} />}>History</NavItem>
          <NavItem expanded={expanded} href="#docs" icon={<FileDown size={18} />}>Docs</NavItem>
        </nav>
      </div>
    </aside>
  );
}

function NavItem({ expanded, icon, href, children }: { expanded: boolean; icon: React.ReactNode; href: string; children: React.ReactNode }) {
  const content = (
    <Link href={href} className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800",
      expanded ? "justify-start" : "justify-center"
    )}>
      {icon}
      {expanded && <span className="text-sm">{children}</span>}
    </Link>
  );
  if (expanded) return content;
  return <Tooltip label={String(children)}>{content}</Tooltip>;
}

function SectionLabel({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("text-[11px] uppercase tracking-wide opacity-60 px-2", expanded ? "block" : "hidden")}>{children}</div>
  );
}
