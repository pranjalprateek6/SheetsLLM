"use client";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  items?: string[];
}

export default function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  items = []
}: ConfirmDialogProps) {
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
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card rounded-3xl max-w-md w-full overflow-hidden pointer-events-auto"
            >
              <div className="p-8">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="h-7 w-7 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold text-black dark:text-white mb-2">
                      {title}
                    </h3>
                    <p className="text-black/70 dark:text-white/70 leading-relaxed">
                      {message}
                    </p>
                  </div>
                </div>
                
                {items.length > 0 && (
                  <ul className="mt-6 ml-[72px] space-y-2">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-black/70 dark:text-white/70">
                        <span className="text-orange-600 dark:text-orange-400 mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 px-8 py-6 bg-black/5 dark:bg-white/5 border-t border-black/10 dark:border-white/10">
                <button
                  onClick={onCancel}
                  className="px-6 py-2.5 rounded-lg font-medium text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition"
                >
                  {cancelText}
                </button>
                <button
                  onClick={onConfirm}
                  className="px-6 py-2.5 rounded-lg font-medium bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition"
                >
                  {confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
