"use client";
import { useState, useEffect } from "react";
import { Upload, MessageSquare, Download, ArrowRight, X, Sparkles } from "lucide-react";

const STEPS = [
  {
    icon: Upload,
    title: "Upload Your Data",
    description: "Drop any CSV, XLSX, JSON, TSV, or Parquet file. We'll detect the schema and show you a preview instantly.",
  },
  {
    icon: MessageSquare,
    title: "Transform with Natural Language",
    description: "Type what you want in plain English: filter rows, rename columns, calculate new fields, group and aggregate. No formulas needed.",
  },
  {
    icon: Download,
    title: "Download Results",
    description: "Preview your transformed data in real-time. When you're happy, download as CSV. Undo anytime.",
  },
];

const SAMPLE_DATASETS = [
  {
    name: "Sales Data",
    description: "1,000 rows of product sales with revenue, dates, and regions",
    suggestion: "Show total revenue by region",
  },
  {
    name: "Employee Data",
    description: "500 employees with departments, salaries, and hire dates",
    suggestion: "Average salary by department",
  },
  {
    name: "Survey Results",
    description: "200 survey responses with ratings and demographics",
    suggestion: "Show average rating by age group",
  },
];

export default function OnboardingOverlay({
  onClose,
  onTrySample,
}: {
  onClose: () => void;
  onTrySample?: (name: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Check if user has seen onboarding
  useEffect(() => {
    const seen = localStorage.getItem("sheetsllm_onboarding_seen");
    if (seen === "true") setDismissed(true);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("sheetsllm_onboarding_seen", "true");
    setDismissed(true);
    onClose();
  };

  if (dismissed) return null;

  const currentStep = STEPS[step];
  const Icon = currentStep.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[480px] bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl overflow-hidden">
        {/* Close */}
        <div className="flex justify-end px-4 pt-3">
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition text-black/40 dark:text-white/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step content */}
        <div className="px-8 pb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-black/5 dark:bg-white/10 flex items-center justify-center mx-auto mb-4">
            <Icon className="h-8 w-8 text-black dark:text-white" />
          </div>
          <h2 className="text-xl font-bold text-black dark:text-white mb-2">
            {currentStep.title}
          </h2>
          <p className="text-sm text-black/60 dark:text-white/60 leading-relaxed">
            {currentStep.description}
          </p>

          {/* Step dots */}
          <div className="flex justify-center gap-2 mt-5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === step
                    ? "bg-black dark:bg-white w-6"
                    : "bg-black/20 dark:bg-white/20"
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="mt-5 flex justify-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 rounded-lg text-sm text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Back
              </button>
            )}
            {!isLast ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-5 py-2 rounded-lg bg-black dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-black/80 dark:hover:bg-white/80 transition inline-flex items-center gap-1.5"
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={handleDismiss}
                className="px-5 py-2 rounded-lg bg-black dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-black/80 dark:hover:bg-white/80 transition inline-flex items-center gap-1.5"
              >
                Get Started <Sparkles className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sample datasets (shown on last step) */}
        {isLast && onTrySample && (
          <div className="px-6 pb-6">
            <p className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wider mb-3 text-center">
              Or try a sample dataset
            </p>
            <div className="space-y-2">
              {SAMPLE_DATASETS.map((sample) => (
                <button
                  key={sample.name}
                  onClick={() => {
                    handleDismiss();
                    onTrySample(sample.name);
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition"
                >
                  <p className="text-sm font-medium text-black dark:text-white">
                    {sample.name}
                  </p>
                  <p className="text-xs text-black/50 dark:text-white/50 mt-0.5">
                    {sample.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
