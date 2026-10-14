"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Activity, BookMarked, BookOpen, Files, Keyboard, Moon, Sparkle, Upload, UserRound } from "lucide-react";

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { openShortcuts } from "@/components/ShortcutsDialog";
import { useAuth } from "@/contexts/AuthContext";

/* Ctrl+K on every page. The workspace mounts its own, fuller palette and
   marks the body, so the two never open together. */

export const WORKSPACE_PALETTE_ATTR = "workspacePalette";

/** The places every palette offers, in the nav's own words. */
export function NavigateItems({ run }: { run: (action: () => void) => void }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <>
      <CommandGroup heading="Go to">
        <CommandItem keywords={["files", "list", "home"]} onSelect={() => run(() => router.push("/dashboard"))}>
          <Files /> <span>Files</span>
        </CommandItem>
        <CommandItem keywords={["recipes", "saved", "steps"]} onSelect={() => run(() => router.push("/recipes"))}>
          <BookMarked /> <span>Recipes</span>
        </CommandItem>
        <CommandItem keywords={["account", "plan", "privacy", "settings", "email"]} onSelect={() => run(() => router.push("/account"))}>
          <UserRound /> <span>Account</span>
        </CommandItem>
        <CommandItem keywords={["help", "docs", "how"]} onSelect={() => run(() => router.push("/help"))}>
          <BookOpen /> <span>Help</span>
        </CommandItem>
        <CommandItem keywords={["new", "changelog", "updates"]} onSelect={() => run(() => router.push("/changelog"))}>
          <Sparkle /> <span>What&apos;s new</span>
        </CommandItem>
        <CommandItem keywords={["status", "outage", "down"]} onSelect={() => run(() => router.push("/status"))}>
          <Activity /> <span>Status</span>
        </CommandItem>
      </CommandGroup>
      <CommandGroup heading="Preferences">
        <CommandItem keywords={["theme", "dark", "light", "mode"]} onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
          <Moon /> <span>{resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}</span>
        </CommandItem>
        <CommandItem keywords={["keyboard", "shortcuts", "keys"]} onSelect={() => run(openShortcuts)}>
          <Keyboard /> <span>Keyboard shortcuts</span>
        </CommandItem>
      </CommandGroup>
    </>
  );
}

export default function GlobalCommandPalette() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !document.body.dataset[WORKSPACE_PALETTE_ATTR]) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!user) return null;
  const run = (action: () => void) => {
    setOpen(false);
    setTimeout(action, 50);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or a page…" />
      <CommandList>
        <CommandEmpty>No matching commands</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem keywords={["upload", "open", "import", "new file"]} onSelect={() => run(() => router.push("/workspace"))}>
            <Upload /> <span>Open a file</span>
          </CommandItem>
        </CommandGroup>
        <NavigateItems run={run} />
      </CommandList>
    </CommandDialog>
  );
}
