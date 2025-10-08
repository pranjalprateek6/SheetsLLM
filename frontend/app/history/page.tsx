import Link from "next/link";
import { Clock, ArrowRight, Info } from "lucide-react";

export default function HistoryPage(){
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-white">History</h1>
        <p className="mt-2 text-zinc-600 dark:text-white/70">View your transformation timeline and revert changes</p>
      </div>

      {/* Info banner */}
      <div className="rounded-2xl border-2 border-blue-300 dark:border-blue-500/20 bg-blue-50/90 dark:bg-blue-500/10 backdrop-blur-xl p-5 shadow-lg">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-300 mb-1">History tracking coming soon</h3>
            <p className="text-sm text-blue-700 dark:text-blue-400/90">
              Timeline UI is under development. For now, you can use the <strong>Undo</strong> feature in the workspace to revert recent changes.
            </p>
            <Link 
              href="/workspace" 
              className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              Go to Workspace <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Placeholder history items (to show future UI) */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-white/50">Recent Activity</h2>
        
        <div className="rounded-2xl border-2 border-zinc-300 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-xl p-5 opacity-50 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-zinc-200 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-zinc-500 dark:text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">No history yet</p>
              <p className="text-sm text-zinc-600 dark:text-white/60 mt-1">Upload a file and run transformations to see your activity here</p>
            </div>
          </div>
        </div>
      </div>

      {/* Future feature preview */}
      <div className="rounded-2xl border-2 border-zinc-300/60 dark:border-white/5 bg-zinc-50/80 dark:bg-white/[0.02] backdrop-blur-xl p-6 shadow-md">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-white/70 mb-3">Coming features:</h3>
        <ul className="space-y-2 text-sm text-zinc-600 dark:text-white/60">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-white/30"></span>
            Full transformation timeline with timestamps
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-white/30"></span>
            Restore to any previous state
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-white/30"></span>
            Compare changes between versions
          </li>
        </ul>
      </div>
    </div>
  );
}
