"use client";
import { useRouter } from "next/navigation";
import {
  Upload,
  Undo2,
  Download,
  RotateCcw,
  MessageSquare,
  History,
  ArrowRight,
  BookMarked,
  Command as CommandIcon,
  FileSpreadsheet,
  Pencil,
  Sparkles,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useModKey } from "@/lib/platform";

export default function CommandPalette({
  open,
  onClose,
  onUpload,
  onUndo,
  onDownload,
  onDownloadXlsx,
  onReset,
  onChat,
  onHistory,
  onSaveRecipe,
  onRename,
  fileId,
}: {
  open: boolean;
  onClose: () => void;
  onUpload: () => void;
  onUndo: () => void;
  onDownload: () => void;
  onDownloadXlsx?: () => void;
  onReset: () => void;
  onChat: () => void;
  onHistory: () => void;
  onSaveRecipe?: () => void;
  onRename?: () => void;
  fileId?: string;
}) {
  const router = useRouter();
  const modKey = useModKey();

  const runCommand = (action: () => void) => {
    onClose();
    setTimeout(() => action(), 50);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No matching commands</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem
            keywords={["upload", "open", "import"]}
            onSelect={() => runCommand(onUpload)}
          >
            <Upload />
            <span>Upload file</span>
          </CommandItem>
          <CommandItem
            keywords={["undo", "revert", "back"]}
            onSelect={() => runCommand(onUndo)}
          >
            <Undo2 />
            <span>Undo last step</span>
          </CommandItem>
          <CommandItem
            keywords={["download", "export", "save", "csv"]}
            onSelect={() => runCommand(onDownload)}
          >
            <Download />
            <span>Export as CSV</span>
          </CommandItem>
          {fileId && onDownloadXlsx && (
            <CommandItem
              keywords={["download", "export", "excel", "xlsx"]}
              onSelect={() => runCommand(onDownloadXlsx)}
            >
              <FileSpreadsheet />
              <span>Export as Excel</span>
            </CommandItem>
          )}
          {fileId && onSaveRecipe && (
            <CommandItem
              keywords={["recipe", "save", "automate", "reuse"]}
              onSelect={() => runCommand(onSaveRecipe)}
            >
              <BookMarked />
              <span>Save as recipe</span>
            </CommandItem>
          )}
          {fileId && onRename && (
            <CommandItem
              keywords={["rename", "name", "file"]}
              onSelect={() => runCommand(onRename)}
            >
              <Pencil />
              <span>Rename file</span>
            </CommandItem>
          )}
          <CommandItem
            keywords={["reset", "clear", "start over"]}
            onSelect={() => runCommand(onReset)}
          >
            <RotateCcw />
            <span>Reset file</span>
          </CommandItem>
          <CommandItem
            keywords={["chat", "talk", "ask", "chef"]}
            onSelect={() => runCommand(onChat)}
          >
            <MessageSquare />
            <span>Toggle Chef</span>
          </CommandItem>
          {fileId && (
            <CommandItem
              keywords={["history", "timeline", "steps"]}
              onSelect={() => runCommand(onHistory)}
            >
              <History />
              <span>View history</span>
            </CommandItem>
          )}
        </CommandGroup>
        <CommandGroup heading="Navigate">
          <CommandItem
            keywords={["dashboard", "files", "list"]}
            onSelect={() => runCommand(() => router.push("/dashboard"))}
          >
            <ArrowRight />
            <span>Go to Dashboard</span>
          </CommandItem>
          <CommandItem
            keywords={["workspace", "editor"]}
            onSelect={() => runCommand(() => router.push("/workspace"))}
          >
            <ArrowRight />
            <span>Go to Workspace</span>
          </CommandItem>
          <CommandItem
            keywords={["account", "billing", "settings", "privacy"]}
            onSelect={() => runCommand(() => router.push("/account"))}
          >
            <Sparkles />
            <span>Account &amp; billing</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {modKey === "⌘" ? (
            <><CommandIcon className="h-3 w-3" />K to toggle</>
          ) : (
            <>Ctrl+K to toggle</>
          )}
        </span>
        <span>&uarr;&darr; navigate</span>
        <span>enter to select</span>
      </div>
    </CommandDialog>
  );
}
