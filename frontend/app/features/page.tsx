"use client";
import Link from "next/link";
import { 
  ArrowRight, CheckCircle2, Sparkles, Upload, FileText, Filter, Table, Download, Undo2, Zap, Shield, Database, Users, GitBranch, BarChart3, Eye, History, Columns, MessageSquare, TrendingUp, Clock, GitMerge 
} from "lucide-react";
import { motion } from "framer-motion";

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
    description: "Download your transformed spreadsheet in CSV or XLSX format. Keep your original file safe - all changes are non-destructive.",
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
    <div className="space-y-8 pt-8">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-black dark:text-white">
          Powerful Features
        </h1>
        <p className="mt-2 text-lg text-black/70 dark:text-white/70">
          Everything you need to transform spreadsheets with natural language. 
          No coding required.
        </p>
      </div>

      {/* Current Features */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          <h2 className="text-2xl font-semibold text-black dark:text-white">
            Available Now
          </h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {currentFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="glass-card rounded-3xl p-5 cursor-pointer"
              >
                <motion.div 
                  className="w-12 h-12 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center mb-4"
                  whileHover={{ rotate: 360, scale: 1.1 }}
                  transition={{ duration: 0.5 }}
                >
                  <Icon className="h-6 w-6 text-black dark:text-white" />
                </motion.div>
                <h3 className="font-semibold text-black dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-black/70 dark:text-white/70 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Upcoming Features */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-2xl font-semibold text-black dark:text-white">
            Coming Soon
          </h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {upcomingFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div 
                key={i} 
                className="glass-card rounded-3xl p-5 relative overflow-hidden opacity-60"
              >
                <div className="absolute top-3 right-3">
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-black/10 dark:bg-white/10 text-black dark:text-white">
                    Soon
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-black/50 dark:text-white/50" />
                </div>
                <h3 className="font-semibold text-black dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-black/70 dark:text-white/70 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center py-8 glass-card rounded-3xl">
        <h3 className="text-2xl font-semibold text-black dark:text-white mb-2">
          Ready to get started?
        </h3>
        <p className="text-black/70 dark:text-white/70 mb-4">
          Try it now - no signup required. Upload a file and start transforming.
        </p>
        <Link 
          href="/workspace" 
          className="inline-flex items-center gap-2 rounded-lg px-6 py-3 bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition font-medium"
        >
          Go to Workspace <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
}
