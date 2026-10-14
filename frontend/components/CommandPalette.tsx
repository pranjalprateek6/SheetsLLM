"use client";
import {
  Upload,
  Undo2,
  Download,
  X,
  MessageSquare,
  History,
  BookMarked,
  Command as CommandIcon,
  FileSpreadsheet,
  Pencil,
  Redo2,
  BarChart3,
  Columns3,
  Link2,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { NavigateItems } from "@/components/GlobalCommandPalette";
import { useModKey } from "@/lib/platform";

export default function CommandPalette({
  open,
  onClose,
  onUpload,
  onUndo,
  onDownload,
  onDownloadXlsx,
  onCloseFile,
  onChat,
  onHistory,
  onSaveRecipe,
  onRename,
  onRedo,
  onChart,
  onSchema,
  onLookups,
  fileId,
}: {
  onRedo?: () => void;
  onChart?: () => void;
  onSchema?: () => void;
  onLookups?: () => void;
  open: boolean;
  onClose: () => void;
  onUpload: () => void;
  onUndo: () => void;
  onDownload: () => void;
  onDownloadXlsx?: () => void;
  /** Closes the open file (it stays in Files) and returns to upload. */
  onCloseFile: () => void;
  onChat: () => void;
  onHistory: () => void;
  onSaveRecipe?: () => void;
  onRename?: () => void;
  fileId?: string;
}) {
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
            keywords={["upload", "open", "import", "new file"]}
            onSelect={() => runCommand(onUpload)}
          >
            <Upload />
            <span>Open a new file</span>
          </CommandItem>
          <CommandItem
            keywords={["undo", "back", "step"]}
            onSelect={() => runCommand(onUndo)}
          >
            <Undo2 />
            <span>Undo the last step</span>
            <CommandShortcut>{modKey === "⌘" ? "⌘Z" : "Ctrl+Z"}</CommandShortcut>
          </CommandItem>
          {onRedo && (
            <CommandItem keywords={["redo", "again", "put back"]} onSelect={() => runCommand(onRedo)}>
              <Redo2 />
              <span>Redo</span>
              <CommandShortcut>{modKey === "⌘" ? "⌘⇧Z" : "Ctrl+Shift+Z"}</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem
            keywords={["export", "save", "csv", "file"]}
            onSelect={() => runCommand(onDownload)}
          >
            <Download />
            <span>Export as CSV</span>
            <CommandShortcut>{modKey === "⌘" ? "⌘S" : "Ctrl+S"}</CommandShortcut>
          </CommandItem>
          {fileId && onDownloadXlsx && (
            <CommandItem
              keywords={["export", "excel", "xlsx"]}
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
          {fileId && (
            <CommandItem
              keywords={["close", "new file", "start over", "reset", "clear"]}
              onSelect={() => runCommand(onCloseFile)}
            >
              <X />
              <span>Close file</span>
            </CommandItem>
          )}
          <CommandItem
            keywords={["chat", "talk", "ask", "chef"]}
            onSelect={() => runCommand(onChat)}
          >
            <MessageSquare />
            <span>Show or hide Chef</span>
            <CommandShortcut>/</CommandShortcut>
          </CommandItem>
          {fileId && onChart && (
            <CommandItem keywords={["chart", "graph", "plot"]} onSelect={() => runCommand(onChart)}>
              <BarChart3 />
              <span>Quick chart</span>
            </CommandItem>
          )}
          {fileId && onSchema && (
            <CommandItem keywords={["schema", "columns", "types"]} onSelect={() => runCommand(onSchema)}>
              <Columns3 />
              <span>Schema</span>
            </CommandItem>
          )}
          {fileId && onLookups && (
            <CommandItem keywords={["lookup", "join", "link a file"]} onSelect={() => runCommand(onLookups)}>
              <Link2 />
              <span>Lookup tables</span>
            </CommandItem>
          )}
          {fileId && (
            <CommandItem
              keywords={["history", "timeline", "steps"]}
              onSelect={() => runCommand(onHistory)}
            >
              <History />
              <span>History and SQL</span>
            </CommandItem>
          )}
        </CommandGroup>
        <NavigateItems run={runCommand} />
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
