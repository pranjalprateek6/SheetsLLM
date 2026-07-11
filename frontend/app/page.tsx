"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useAnimation, useInView } from "framer-motion";
import {
  ArrowRight, Upload, MessageSquare, Eye, Zap, Shield, Filter,
  Table, Download, Undo2, Sparkles, TrendingUp, Clock, GitMerge, Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  { ssr: false }
);

/* ── Data ── */
const heroLabels = [
  { icon: Sparkles, label: "AI-Powered Transforms" },
  { icon: Zap, label: "Lightning Fast" },
  { icon: Shield, label: "Privacy First" },
];

const coreFeatures = [
  { icon: Upload, title: "Smart File Upload", description: "Upload CSV or XLSX up to 1M rows. Automatic schema detection with intelligent type inference." },
  { icon: MessageSquare, title: "Natural Language", description: "Type instructions in plain English. No formulas or code needed, just describe what you want." },
  { icon: Filter, title: "Advanced Filtering", description: "Complex filter expressions with multiple conditions, numeric comparisons, and string matching." },
  { icon: Table, title: "Column Operations", description: "Select, rename, reorder, or create computed columns. Full control over your data structure." },
  { icon: TrendingUp, title: "Aggregations", description: "Group by multiple columns and apply sum, average, count, min, max with ease." },
  { icon: Eye, title: "Live Preview", description: "See up to 500 rows of transformed data instantly. Preview before downloading." },
  { icon: Undo2, title: "Undo & Revert", description: "Made a mistake? Revert to any previous state with built-in undo functionality." },
  { icon: Download, title: "Export Results", description: "Download in CSV or XLSX format. All changes are non-destructive. Your original stays safe." },
  { icon: Zap, title: "DuckDB Engine", description: "Powered by DuckDB. Most operations complete in under 2 seconds." },
];

const upcomingFeatures = [
  { icon: Clock, title: "Full History Timeline", description: "Jump back to any previous state and compare versions." },
  { icon: GitMerge, title: "Multi-Table Joins", description: "Join datasets with left, right, inner, and outer joins." },
  { icon: Users, title: "Collaboration", description: "Share workspaces and transform data together in real-time." },
];

const titleWords = ["TRANSFORM", "SPREADSHEETS", "WITH", "PLAIN", "ENGLISH"];

/* ── Scroll-triggered section ── */
function AnimatedSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });
  const controls = useAnimation();

  React.useEffect(() => {
    if (isInView) controls.start("visible");
  }, [controls, isInView]);

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={controls}
      variants={{
        hidden: { opacity: 0, y: 40 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function Landing() {
  return (
    <div className="pb-16">
      {/* ═══════════════ HERO ═══════════════ */}
      <section className="py-24 lg:py-32">
        <div className="container mx-auto px-4 flex flex-col items-center text-center">
          {/* Cat Lottie */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="w-28 h-28 mb-6"
          >
            <DotLottieReact
              src="https://lottie.host/8cf4ba71-e5fb-44f3-8134-178c4d389417/0CCsdcgNIP.json"
              loop
              autoplay
            />
          </motion.div>

          {/* Word-by-word blur-in title */}
          <motion.h1
            initial={{ filter: "blur(10px)", opacity: 0, y: 50 }}
            animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="font-mono text-4xl font-bold sm:text-5xl md:text-6xl lg:text-7xl max-w-4xl mx-auto leading-tight"
          >
            {titleWords.map((word, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12, duration: 0.6 }}
                className="inline-block mx-1.5 md:mx-3 text-white"
              >
                {word}
              </motion.span>
            ))}
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.6 }}
            className="mx-auto mt-8 max-w-2xl text-lg md:text-xl font-mono text-white/50"
          >
            Upload a CSV or XLSX, tell the AI what you need, and download
            clean data. No formulas, no code, no waiting.
          </motion.p>

          {/* Labels row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.6 }}
            className="mt-12 flex flex-wrap justify-center gap-8"
          >
            {heroLabels.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 1.6 + i * 0.15,
                  duration: 0.6,
                  type: "spring",
                  stiffness: 100,
                  damping: 10,
                }}
                className="flex items-center gap-2"
              >
                <item.icon className="h-5 w-5 text-cyan-400" />
                <span className="text-sm font-mono text-white/50">{item.label}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.2, duration: 0.6, type: "spring", stiffness: 100, damping: 10 }}
            className="mt-12 flex gap-3"
          >
            <Button
              size="lg"
              variant="outline"
              className="font-mono"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
            >
              SEE FEATURES
            </Button>
            <Button size="lg" className="font-mono gap-2" asChild>
              <Link href="/auth">
                GET STARTED <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ FEATURES ═══════════════ */}
      <section id="features" className="py-20">
        <div className="container mx-auto px-4">
          <AnimatedSection className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-mono font-bold text-white mb-3">
              Everything You Need
            </h2>
            <p className="font-mono text-white/50 max-w-xl mx-auto text-sm">
              Powerful features to make spreadsheet transformation fast, intuitive, and reliable.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 max-w-6xl mx-auto">
            {coreFeatures.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <AnimatedSection key={feature.title} delay={i * 0.08}>
                  <div className="flex flex-col items-center text-center p-8 bg-neutral-900 border border-white/10 h-full">
                    <div className="mb-5 rounded-full bg-cyan-500/10 p-4">
                      <Icon className="h-7 w-7 text-cyan-500" />
                    </div>
                    <h3 className="mb-3 text-lg font-mono font-bold text-white">
                      {feature.title}
                    </h3>
                    <p className="font-mono text-sm text-white/50 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════ COMING SOON ═══════════════ */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <AnimatedSection className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-500 text-sm font-mono font-medium mb-4">
              <Sparkles className="h-3.5 w-3.5" /> COMING SOON
            </div>
            <h2 className="text-3xl md:text-4xl font-mono font-bold text-white">
              On The Roadmap
            </h2>
          </AnimatedSection>

          <div className="grid sm:grid-cols-3 max-w-4xl mx-auto">
            {upcomingFeatures.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <AnimatedSection key={feature.title} delay={i * 0.1}>
                  <div className="flex flex-col items-center text-center p-8 border border-white/10 bg-neutral-900 opacity-60 h-full">
                    <div className="mb-5 rounded-full bg-white/5 p-4">
                      <Icon className="h-7 w-7 text-white/40" />
                    </div>
                    <h3 className="mb-3 text-lg font-mono font-bold text-white">
                      {feature.title}
                    </h3>
                    <p className="font-mono text-sm text-white/50 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════ WHY & WHO ═══════════════ */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <div className="grid md:grid-cols-2 gap-12">
              <div>
                <h2 className="text-2xl font-mono font-bold text-white mb-4">WHY WE BUILT IT</h2>
                <p className="font-mono text-sm text-white/50 leading-relaxed">
                  Spreadsheet operations shouldn&apos;t require expert knowledge. Data professionals
                  waste hours writing formulas and debugging expressions.
                  LLMs understand intent. We use them to bridge the gap between what you want and how to do it.
                </p>
              </div>
              <div>
                <h2 className="text-2xl font-mono font-bold text-white mb-4">WHO IT&apos;S FOR</h2>
                <ul className="space-y-4 font-mono text-sm">
                  <li className="flex items-start gap-3 text-white/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-2 flex-shrink-0" />
                    <span><strong className="text-white">Analysts &amp; Data Scientists</strong> who clean data faster</span>
                  </li>
                  <li className="flex items-start gap-3 text-white/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-2 flex-shrink-0" />
                    <span><strong className="text-white">Business Users</strong> who need quick insights without coding</span>
                  </li>
                  <li className="flex items-start gap-3 text-white/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-2 flex-shrink-0" />
                    <span><strong className="text-white">Anyone</strong> tired of complex Excel formulas</span>
                  </li>
                </ul>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ═══════════════ CTA ═══════════════ */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4">
          <AnimatedSection>
            <div className="text-center py-16 px-8 bg-neutral-900 border border-white/10">
              <h2 className="text-3xl md:text-4xl font-mono font-bold text-white mb-4">
                READY TO START?
              </h2>
              <p className="font-mono text-white/50 mb-8 max-w-lg mx-auto">
                Create a free account and start transforming spreadsheets in seconds.
              </p>
              <Button size="lg" className="font-mono gap-2" asChild>
                <Link href="/auth">
                  GET STARTED <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </AnimatedSection>
        </div>
      </section>
    </div>
  );
}
