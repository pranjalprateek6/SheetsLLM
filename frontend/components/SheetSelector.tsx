"use client";
import { motion, AnimatePresence } from "framer-motion";
import { FileSpreadsheet } from "lucide-react";

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
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          
          {/* Dialog */}
          <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl border-2 border-zinc-300 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden pointer-events-auto"
            >
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-700">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">
                      Select Sheet
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      This file contains multiple sheets. Choose which one to import:
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 max-h-96 overflow-y-auto">
                <div className="space-y-2">
                  {sheets.map((sheet, i) => (
                    <button
                      key={i}
                      onClick={() => onSelect(sheet)}
                      className="w-full text-left px-4 py-3 rounded-lg border-2 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-white dark:bg-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-600 transition">
                          <FileSpreadsheet className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                        </div>
                        <span className="font-medium text-zinc-900 dark:text-white">
                          {sheet}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 p-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  onClick={onCancel}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
