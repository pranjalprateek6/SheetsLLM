"use client";
import Link from "next/link";
import { 
  Upload, MessageSquare, Eye, Filter, Table, Download, 
  Sparkles, Undo2, Clock, GitMerge, Users, Shield, 
  TrendingUp, Zap, CheckCircle2
} from "lucide-react";

interface Feature {
  icon: any;
  title: string;
  description: string;
  status: "available" | "coming-soon";
}

const currentFeatures: Feature[] = [
  {
    icon: Upload,
    title: "Smart File Upload",
    description: "Upload CSV or XLSX files up to 1M rows. Automatic schema detection with intelligent type inference for all your columns.",
    status: "available"
  },
  {
    icon: MessageSquare,
    title: "Natural Language Commands",
    description: "Type instructions in plain English. No formulas or code required. Just describe what you want and watch it happen.",
    status: "available"
  },
  {
    icon: Filter,
    title: "Advanced Filtering",
    description: "Complex filter expressions with multiple conditions. Supports numeric comparisons, string matching, and logical operators.",
    status: "available"
  },
  {
    icon: Table,
    title: "Column Operations",
    description: "Select, rename, reorder, or create computed columns with arithmetic expressions. Full control over your data structure.",
    status: "available"
  },
  {
    icon: TrendingUp,
    title: "Aggregations & Grouping",
    description: "Group by multiple columns and apply aggregations like sum, average, count, min, and max with ease.",
    status: "available"
  },
  {
    icon: Sparkles,
    title: "Computed Columns",
    description: "Create new columns using mathematical expressions. Combine existing columns with +, -, *, / and more.",
    status: "available"
  },
  {
    icon: Eye,
    title: "Live Preview",
    description: "See up to 500 rows of your transformed data instantly. Preview changes before downloading to verify results.",
    status: "available"
  },
  {
    icon: Undo2,
    title: "Undo Transformations",
    description: "Made a mistake? Quickly revert to previous states with our built-in undo functionality.",
    status: "available"
  },
  {
    icon: Download,
    title: "Export Results",
    description: "Download your transformed spreadsheet in CSV or XLSX format. Keep your original file safe—all changes are non-destructive.",
    status: "available"
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Powered by pandas and optimized backends. Most operations complete in under 2 seconds with detailed timing info.",
    status: "available"
  },
  {
    icon: Shield,
    title: "Privacy First",
    description: "Your data stays on the server only during active sessions. No permanent storage, no tracking. Completely ephemeral processing.",
    status: "available"
  }
];

const upcomingFeatures: Feature[] = [
  {
    icon: Clock,
    title: "Full History Timeline",
    description: "View complete transformation history with timestamps. Jump back to any previous state and compare versions side-by-side.",
    status: "coming-soon"
  },
  {
    icon: GitMerge,
    title: "Multi-Table Joins",
    description: "Join multiple datasets with left, right, inner, and outer joins. Merge data from different sources seamlessly.",
    status: "coming-soon"
  },
  {
    icon: Users,
    title: "Collaboration",
    description: "Share workspaces with your team. Real-time collaboration on spreadsheet transformations with shared history.",
    status: "coming-soon"
  },
  {
    icon: Table,
    title: "Multi-File Workspace",
    description: "Work with multiple files simultaneously. Switch between datasets and reference them in your transformations.",
    status: "coming-soon"
  },
  {
    icon: Shield,
    title: "Data Validation",
    description: "Define validation rules and constraints. Ensure data quality with automatic checks before transformations.",
    status: "coming-soon"
  },
  {
    icon: Sparkles,
    title: "AI Suggestions",
    description: "Get intelligent suggestions based on your data patterns. Discover insights and recommended transformations automatically.",
    status: "coming-soon"
  }
];

export default function FeaturesPage() {
  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Powerful Features
        </h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-white/70">
          Everything you need to transform spreadsheets with natural language. 
          No coding required.
        </p>
      </div>

      {/* Current Features */}
      <div>
        <div className="flex items-center gap-3 mb-8">
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">
            Available Now
          </h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div 
                key={i} 
                className="rounded-2xl border-2 border-zinc-300 dark:border-white/10 bg-white/90 dark:bg-white/5 backdrop-blur-xl p-6 hover:border-zinc-400 dark:hover:border-white/20 transition shadow-lg hover:shadow-xl"
              >
                <div className="w-12 h-12 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-zinc-900 dark:text-white" />
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-zinc-600 dark:text-white/70 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming Features */}
      <div>
        <div className="flex items-center gap-3 mb-8">
          <Sparkles className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">
            Coming Soon
          </h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {upcomingFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div 
                key={i} 
                className="rounded-2xl border-2 border-zinc-300/60 dark:border-white/5 bg-zinc-50/80 dark:bg-white/[0.02] backdrop-blur-xl p-6 relative overflow-hidden shadow-md"
              >
                <div className="absolute top-3 right-3">
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                    Soon
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-zinc-200 dark:bg-white/5 flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-zinc-500 dark:text-white/50" />
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-zinc-600 dark:text-white/60 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center py-12 rounded-2xl border-2 border-zinc-300 dark:border-white/10 bg-gradient-to-br from-white/95 to-zinc-100/95 dark:from-white/5 dark:to-white/[0.02] backdrop-blur-xl shadow-lg">
        <h3 className="text-2xl font-semibold text-zinc-900 dark:text-white mb-3">
          Ready to get started?
        </h3>
        <p className="text-zinc-600 dark:text-white/70 mb-6">
          Try it now—no signup required. Upload a file and start transforming.
        </p>
        <Link 
          href="/workspace" 
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 transition font-medium"
        >
          Go to Workspace
        </Link>
      </div>
    </div>
  );
}
