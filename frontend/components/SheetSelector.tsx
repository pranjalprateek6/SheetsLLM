"use client";
import { motion, AnimatePresence } from "framer-motion";
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
              className="glass-card rounded-3xl max-w-lg w-full overflow-hidden pointer-events-auto"
            >
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">Select a Sheet</h2>
                <p className="text-black/70 dark:text-white/70 mb-6">This workbook contains multiple sheets. Choose one to continue:</p>
                
                <div className="space-y-3">
                  {sheets.map((sheet, i) => (
                    <button
                      key={i}
                      onClick={() => onSelect(sheet)}
                      className="w-full text-left px-6 py-4 rounded-xl glass-card hover:bg-black/5 dark:hover:bg-white/5 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-black dark:text-white">{sheet}</span>
                        <ArrowRight className="h-5 w-5 text-black/50 dark:text-white/50 group-hover:text-black dark:group-hover:text-white group-hover:translate-x-1 transition-all" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-8 py-6 bg-black/5 dark:bg-white/5 border-t border-black/10 dark:border-white/10">
                <button
                  onClick={onCancel}
                  className="px-6 py-2.5 rounded-lg font-medium text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition"
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
