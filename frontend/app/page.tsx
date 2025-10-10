"use client";
import Link from "next/link";
import { ArrowRight, Upload, MessageSquare, Eye, Zap, Shield, Users } from "lucide-react";
import { motion } from "framer-motion";

const topFeatures = [
  {
    icon: Upload,
    title: "Upload & infer schema",
    description: "Drop your CSV or XLSX file and instantly see your data structure. Schema detection happens automatically with type inference."
  },
  {
    icon: MessageSquare,
    title: "Natural-language transforms",
    description: "Type commands in plain English. Filter rows, rename columns, calculate fields - no formulas or code required."
  },
  {
    icon: Eye,
    title: "Preview & export",
    description: "See changes in real-time with live preview. Review transformations before downloading your updated spreadsheet."
  }
];

const benefits = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Most operations complete in under 2 seconds"
  },
  {
    icon: Shield,
    title: "Private & Secure",
    description: "Your data never leaves the session"
  },
  {
    icon: Users,
    title: "No Expertise Needed",
    description: "No Excel formulas, no Python, just plain English"
  }
];

export default function Landing(){
  return (
    <div className="relative space-y-8 pt-0">
      {/* Hero Section */}
      <section className="text-center py-8 sm:py-12">
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-black dark:text-white">
          LLM-powered spreadsheets.
        </h1>
        <p className="mt-3 text-xl text-black/70 dark:text-white/70 max-w-3xl mx-auto leading-relaxed">
          Upload a sheet, type what you want, watch it transform - fast and transparent.
        </p>
        <motion.div 
          className="mt-6 flex items-center justify-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link href="/workspace" className="inline-flex items-center gap-2 rounded-lg px-7 py-3.5 bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition font-medium text-lg shadow-lg">
              Try it yourself <ArrowRight className="h-5 w-5"/>
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link 
              href="/features"
              className="glass-card rounded-lg px-7 py-3.5 hover:bg-black/5 dark:hover:bg-white/5 transition font-medium text-lg text-black dark:text-white"
            >
              See all features
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* What is it */}
      <section className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-black dark:text-white mb-3">
          What is SheetsLLM?
        </h2>
        <p className="text-lg text-black/70 dark:text-white/70 leading-relaxed text-center">
          SheetsLLM is an AI-powered spreadsheet transformation tool that lets you manipulate data using natural language. 
          No more wrestling with complex formulas or learning programming languages. Just describe what you want in plain English, 
          and our AI translates it into precise data operations - instantly.
        </p>
      </section>

      {/* Why & For Whom */}
      <section className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-black dark:text-white">Why we built it</h2>
          <p className="text-black/70 dark:text-white/70 leading-relaxed">
            Spreadsheet operations shouldn't require expert knowledge. We built SheetsLLM because data professionals 
            waste hours writing formulas, debugging expressions, and translating business logic into technical syntax. 
            LLMs understand intent - why not use them to bridge the gap between "what you want" and "how to do it"?
          </p>
        </div>
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-black dark:text-white">Who it's for</h2>
          <ul className="space-y-3 text-black/70 dark:text-white/70">
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40 mt-2 flex-shrink-0"></span>
              <span><strong className="text-black dark:text-white">Analysts & Data Scientists</strong> who want to clean data faster</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40 mt-2 flex-shrink-0"></span>
              <span><strong className="text-black dark:text-white">Business Users</strong> who need quick insights without coding</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/40 mt-2 flex-shrink-0"></span>
              <span><strong className="text-black dark:text-white">Anyone</strong> tired of complex Excel formulas and VBA macros</span>
            </li>
          </ul>
        </div>
      </section>

      {/* How it helps */}
      <section className="max-w-4xl mx-auto">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-3xl font-bold text-center text-black dark:text-white mb-4"
        >
          How it helps you
        </motion.h2>
        <div className="grid sm:grid-cols-3 gap-5">
          {benefits.map((benefit, i) => {
            const Icon = benefit.icon;
            return (
              <motion.div 
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.15 }}
                whileHover={{ y: -5 }}
                className="text-center space-y-3"
              >
                <motion.div 
                  className="w-14 h-14 rounded-2xl bg-black/10 dark:bg-white/10 flex items-center justify-center mx-auto"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Icon className="h-7 w-7 text-black dark:text-white" />
                </motion.div>
                <h3 className="font-semibold text-black dark:text-white">{benefit.title}</h3>
                <p className="text-sm text-black/70 dark:text-white/70">{benefit.description}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Top Features */}
      <section className="max-w-6xl mx-auto">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-3xl font-bold text-center text-black dark:text-white mb-4"
        >
          Top Features
        </motion.h2>
        <div className="grid md:grid-cols-3 gap-5">
          {topFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
                className="glass-card rounded-3xl p-5 cursor-pointer"
              >
                <motion.div 
                  className="w-12 h-12 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center mb-4"
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.6 }}
                >
                  <Icon className="h-6 w-6 text-black dark:text-white" />
                </motion.div>
                <h3 className="font-semibold text-black dark:text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-black/70 dark:text-white/70 leading-relaxed">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
        <div className="text-center mt-8">
          <Link 
            href="/features" 
            className="inline-flex items-center gap-2 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white font-medium"
          >
            View all features <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-8 glass-card rounded-3xl">
        <h2 className="text-3xl font-bold text-black dark:text-white mb-2">
          Ready to transform your spreadsheets?
        </h2>
        <p className="text-black/70 dark:text-white/70 mb-5 text-lg">
          No signup required. Start transforming in seconds.
        </p>
        <Link 
          href="/workspace" 
          className="inline-flex items-center gap-2 rounded-lg px-7 py-3.5 bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition font-medium text-lg"
        >
          Get Started <ArrowRight className="h-5 w-5"/>
        </Link>
      </section>
    </div>
  );
}

