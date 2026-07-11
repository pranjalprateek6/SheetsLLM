"use client";
import { FileSpreadsheet, ArrowRight } from "lucide-react";

interface SheetSelectorProps {
  isOpen: boolean;
  sheets: string[];
  onSelect: (sheetName: string) => void;
  onCancel: () => void;
}

export default function SheetSelector({
  isOpen,
  sheets,
  onSelect,
  onCancel
}: SheetSelectorProps) {
  if (!isOpen) return null;

  return (
    <>
      <div onClick={onCancel} className="fixed inset-0 bg-black/50 z-50" />
      <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 pointer-events-none">
        <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-2xl max-w-lg w-full overflow-hidden pointer-events-auto shadow-xl animate-fadeIn">
          <div className="p-8">
            <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">Select a Sheet</h2>
            <p className="text-black/70 dark:text-white/70 mb-6">This workbook contains multiple sheets. Choose one to continue:</p>
            <div className="space-y-3">
              {sheets.map((sheet, i) => (
                <button
                  key={i}
                  onClick={() => onSelect(sheet)}
                  className="w-full text-left px-6 py-4 rounded-xl border border-black/5 dark:border-white/5 hover:bg-cyan-50 dark:hover:bg-cyan-900/10 hover:border-cyan-200 dark:hover:border-cyan-800/30 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-black dark:text-white">{sheet}</span>
                    <ArrowRight className="h-5 w-5 text-black/50 dark:text-white/50 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-8 py-6 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/10 dark:border-white/10">
            <button
              onClick={onCancel}
              className="px-6 py-2.5 rounded-lg font-medium text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
