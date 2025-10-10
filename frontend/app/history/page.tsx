import Link from "next/link";
import { Clock, ArrowRight, Info } from "lucide-react";

export default function HistoryPage(){
  return (
    <div className="space-y-6 pt-8">
      <div>
        <h1 className="text-3xl font-semibold text-black dark:text-white">History</h1>
        <p className="mt-2 text-black/70 dark:text-white/70">View your transformation timeline and revert changes</p>
      </div>

      {/* Info banner */}
      <div className="glass-card rounded-3xl p-5">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-black dark:text-white mb-1">History tracking coming soon</h3>
            <p className="text-sm text-black/70 dark:text-white/70">
              Timeline UI is under development. For now, you can use the <strong>Undo</strong> feature in the workspace to revert recent changes.
            </p>
            <Link 
              href="/workspace" 
              className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-black dark:text-white hover:text-black/70 dark:hover:text-white/70"
            >
              Go to Workspace <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Placeholder history items (to show future UI) */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">Recent Activity</h2>
        
        <div className="glass-card rounded-3xl p-5 opacity-50">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-black/10 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-black/50 dark:text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black dark:text-white">No history yet</p>
              <p className="text-sm text-black/70 dark:text-white/70 mt-1">Upload a file and run transformations to see your activity here</p>
            </div>
          </div>
        </div>
      </div>

      {/* Future feature preview */}
      <div className="glass-card rounded-3xl p-6">
        <h3 className="text-sm font-medium text-black/70 dark:text-white/70 mb-3">Coming features:</h3>
        <ul className="space-y-2 text-sm text-black/70 dark:text-white/70">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40"></span>
            Full transformation timeline with timestamps
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40"></span>
            Restore to any previous state
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40"></span>
            Compare changes between versions
          </li>
        </ul>
      </div>
    </div>
  );
}
