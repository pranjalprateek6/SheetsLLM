import Link from "next/link";
import { ArrowUpRight, Upload, MessageSquare, Eye, Zap, Shield, Users } from "lucide-react";

const topFeatures = [
  {
    icon: Upload,
    title: "Upload & infer schema",
    description: "Drop your CSV or XLSX file and instantly see your data structure. Schema detection happens automatically with type inference."
  },
  {
    icon: MessageSquare,
    title: "Natural-language transforms",
    description: "Type commands in plain English. Filter rows, rename columns, calculate fields—no formulas or code required."
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
    <div className="relative space-y-20">
      {/* Hero Section */}
      <section className="text-center py-16 sm:py-20">
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-zinc-900 dark:text-white">
          LLM-powered spreadsheets.
        </h1>
        <p className="mt-6 text-xl text-zinc-600 dark:text-white/70 max-w-3xl mx-auto leading-relaxed">
          Upload a sheet, type what you want, watch it transform—fast and transparent.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/workspace" className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 transition font-medium text-lg shadow-lg">
            Try it yourself <ArrowUpRight className="h-5 w-5"/>
          </Link>
          <Link 
            href="/features"
            className="rounded-full px-7 py-3.5 border border-zinc-300 dark:border-white/20 hover:bg-zinc-50 dark:hover:bg-white/5 transition font-medium text-lg text-zinc-900 dark:text-white"
          >
            See all features
          </Link>
        </div>
      </section>

      {/* What is it */}
      <section className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-zinc-900 dark:text-white mb-6">
          What is SheetsLLM?
        </h2>
        <p className="text-lg text-zinc-600 dark:text-white/70 leading-relaxed text-center">
          SheetsLLM is an AI-powered spreadsheet transformation tool that lets you manipulate data using natural language. 
          No more wrestling with complex formulas or learning programming languages. Just describe what you want in plain English, 
          and our AI translates it into precise data operations—instantly.
        </p>
      </section>

      {/* Why & For Whom */}
      <section className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Why we built it</h2>
          <p className="text-zinc-600 dark:text-white/70 leading-relaxed">
            Spreadsheet operations shouldn't require expert knowledge. We built SheetsLLM because data professionals 
            waste hours writing formulas, debugging expressions, and translating business logic into technical syntax. 
            LLMs understand intent—why not use them to bridge the gap between "what you want" and "how to do it"?
          </p>
        </div>
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Who it's for</h2>
          <ul className="space-y-3 text-zinc-600 dark:text-white/70">
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-white/40 mt-2 flex-shrink-0"></span>
              <span><strong className="text-zinc-900 dark:text-white">Analysts & Data Scientists</strong> who want to clean data faster</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-white/40 mt-2 flex-shrink-0"></span>
              <span><strong className="text-zinc-900 dark:text-white">Business Users</strong> who need quick insights without coding</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-white/40 mt-2 flex-shrink-0"></span>
              <span><strong className="text-zinc-900 dark:text-white">Anyone</strong> tired of complex Excel formulas and VBA macros</span>
            </li>
          </ul>
        </div>
      </section>

      {/* How it helps */}
      <section className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-zinc-900 dark:text-white mb-10">
          How it helps you
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {benefits.map((benefit, i) => {
            const Icon = benefit.icon;
            return (
              <div key={i} className="text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-black/10 dark:bg-white/10 flex items-center justify-center mx-auto">
                  <Icon className="h-7 w-7 text-zinc-900 dark:text-white" />
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white">{benefit.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-white/70">{benefit.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top Features */}
      <section className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-zinc-900 dark:text-white mb-10">
          Top Features
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {topFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div key={i} className="rounded-2xl border-2 border-zinc-300 dark:border-white/10 bg-white/90 dark:bg-white/5 backdrop-blur-xl p-6 transition hover:border-zinc-400 dark:hover:border-white/20 shadow-lg hover:shadow-xl">
                <div className="w-12 h-12 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-zinc-900 dark:text-white" />
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-white/70 leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
        <div className="text-center mt-8">
          <Link 
            href="/features" 
            className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white font-medium"
          >
            View all features <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-16 rounded-3xl border-2 border-zinc-300 dark:border-white/10 bg-gradient-to-br from-white/95 to-zinc-100/95 dark:from-white/5 dark:to-white/[0.02] backdrop-blur-xl shadow-lg">
        <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-4">
          Ready to transform your spreadsheets?
        </h2>
        <p className="text-zinc-600 dark:text-white/70 mb-8 text-lg">
          No signup required. Start transforming in seconds.
        </p>
        <Link 
          href="/workspace" 
          className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 transition font-medium text-lg shadow-lg"
        >
          Get Started <ArrowUpRight className="h-5 w-5"/>
        </Link>
      </section>
    </div>
  );
}

