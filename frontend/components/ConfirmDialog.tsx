"use client";
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
  if (!isOpen) return null;

  return (
    <>
      <div onClick={onCancel} className="fixed inset-0 bg-black/50 z-50" />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
        <div className="bg-neutral-900 border border-white/10 max-w-md w-full overflow-hidden pointer-events-auto shadow-xl animate-fadeIn">
          <div className="p-8">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-7 w-7 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-mono font-semibold text-white mb-2">
                  {title}
                </h3>
                <p className="text-white/60 font-mono text-sm leading-relaxed">
                  {message}
                </p>
              </div>
            </div>
            {items.length > 0 && (
              <ul className="mt-6 ml-[72px] space-y-2">
                {items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm font-mono text-white/60">
                    <span className="text-cyan-400 mt-0.5">&bull;</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-8 py-6 bg-white/[0.02] border-t border-white/10">
            <button
              onClick={onCancel}
              className="px-6 py-2.5 font-mono font-medium text-white/60 hover:bg-white/5 transition text-sm tracking-wider"
            >
              {cancelText.toUpperCase()}
            </button>
            <button
              onClick={onConfirm}
              className="px-6 py-2.5 font-medium btn-accent text-sm"
            >
              {confirmText.toUpperCase()}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
