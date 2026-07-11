"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";

export default function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { user, signIn, signUp } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace("/workspace");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { error: err } = await signUp(email, password);
        if (err) {
          setError(err);
        } else {
          setSuccess("Account created! You can now sign in.");
          setMode("signin");
        }
      } else {
        const { error: err } = await signIn(email, password);
        if (err) {
          setError(err);
        } else {
          router.push("/workspace");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      {/* Background grid decoration */}
      <div
        className="absolute right-0 top-0 z-0 w-[50vw] h-[50vw]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke-width='2' stroke='rgb(6 182 212 / 0.15)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e")`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(100% 100% at 100% 0%, rgba(11,11,11,0), rgba(11,11,11,1))",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <Image src="/logo.png" alt="SheetsLLM" width={36} height={36} className="w-9 h-9" />
          <span className="font-mono text-xl font-bold text-white">SheetsLLM</span>
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-mono font-bold text-white tracking-wide">
            {mode === "signin" ? "SIGN IN TO YOUR ACCOUNT" : "CREATE YOUR ACCOUNT"}
          </h1>
          <p className="mt-3 text-white/40 font-mono text-sm">
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => { setMode("signup"); setError(null); setSuccess(null); }}
                  className="text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Create one.
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("signin"); setError(null); setSuccess(null); }}
                  className="text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Sign in.
                </button>
              </>
            )}
          </p>
        </div>

        {/* Divider */}
        <div className="mb-6 flex items-center gap-3">
          <div className="h-px w-full bg-white/10" />
          <span className="text-white/30 font-mono text-xs tracking-widest">EMAIL</span>
          <div className="h-px w-full bg-white/10" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="email-input" className="mb-1.5 block text-white/40 font-mono text-xs tracking-wider">
              EMAIL
            </label>
            <input
              id="email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-white/10 bg-white/[0.03] rounded-md px-3 py-2.5 text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 font-mono text-sm transition-shadow"
              autoComplete="email"
            />
          </div>

          <div className="mb-6">
            <div className="mb-1.5 flex items-end justify-between">
              <label htmlFor="password-input" className="block text-white/40 font-mono text-xs tracking-wider">
                PASSWORD
              </label>
              {mode === "signin" && (
                <a href="#" className="text-xs font-mono text-cyan-400/70 hover:text-cyan-400 transition-colors">
                  Forgot?
                </a>
              )}
            </div>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 6 characters" : "••••••••••••"}
              className="w-full border border-white/10 bg-white/[0.03] rounded-md px-3 py-2.5 text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 font-mono text-sm transition-shadow"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-md px-4 py-3 text-sm text-red-400 font-mono"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-md px-4 py-3 text-sm text-green-400 font-mono"
            >
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              {success}
            </motion.div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex-1 border border-white/20 bg-transparent px-4 py-2.5 text-sm font-mono font-medium text-white tracking-wider
                transition-colors hover:bg-white/5 active:bg-white/10
                flex items-center justify-center gap-2"
            >
              GO BACK
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-cyan-500 px-4 py-2.5 text-sm font-mono font-medium text-white tracking-wider
                transition-colors hover:bg-cyan-400 active:bg-cyan-600
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="animate-pulse">Processing...</span>
              ) : (
                <>
                  {mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Terms */}
        <p className="mt-8 text-center text-xs text-white/30 font-mono">
          By {mode === "signin" ? "signing in" : "creating an account"}, you agree to our{" "}
          <a href="#" className="text-cyan-400/70 hover:text-cyan-400">Terms</a>{" "}and{" "}
          <a href="#" className="text-cyan-400/70 hover:text-cyan-400">Privacy Policy</a>.
        </p>
      </motion.div>
    </div>
  );
}
