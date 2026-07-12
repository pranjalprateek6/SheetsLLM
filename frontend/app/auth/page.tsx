"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, MailCheck, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup" | "forgot";

function AuthContent() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("expired") ? "Your session expired — please sign in again." : null
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const { user, signIn, signUp, resetPassword } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/workspace");
  }, [user, router]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSuccess(null);
    setConfirmationSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email) {
      setError("Please enter your email.");
      return;
    }
    if (mode !== "forgot" && !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error: err } = await resetPassword(email);
        if (err) setError(err);
        else setSuccess("Reset link sent — check your email (and spam folder).");
      } else if (mode === "signup") {
        const { error: err, needsConfirmation } = await signUp(email, password);
        if (err) setError(err);
        else if (needsConfirmation) {
          setConfirmationSent(true);
        } else {
          setSuccess("Account created. You can sign in now.");
          setMode("signin");
        }
      } else {
        const { error: err } = await signIn(email, password);
        if (err) {
          setError(
            /confirm/i.test(err)
              ? "Your email isn't confirmed yet — click the link in the confirmation email first."
              : err
          );
        } else router.push("/workspace");
      }
    } finally {
      setLoading(false);
    }
  };

  const heading =
    mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimizer needed */}
          <img src="/logo.svg" alt="" width={32} height={32} className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight">SheetsLLM</span>
        </Link>

        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          {confirmationSent ? (
            <div className="text-center">
              <MailCheck className="mx-auto mb-3 h-8 w-8 text-success" />
              <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
                Click it, then sign in here.
              </p>
              <Button variant="outline" className="mt-5 w-full" onClick={() => switchMode("signin")}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === "signin" ? (
                  <>
                    New to SheetsLLM?{" "}
                    <button onClick={() => switchMode("signup")} className="font-medium text-primary hover:underline">
                      Create an account
                    </button>
                  </>
                ) : mode === "signup" ? (
                  <>
                    Already have an account?{" "}
                    <button onClick={() => switchMode("signin")} className="font-medium text-primary hover:underline">
                      Sign in
                    </button>
                  </>
                ) : (
                  <>We&apos;ll email you a link to set a new password.</>
                )}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                  />
                </div>

                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          onClick={() => switchMode("forgot")}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    />
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                {success && (
                  <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-success">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    {success}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading
                    ? "Please wait…"
                    : mode === "signin"
                    ? "Sign in"
                    : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
                </Button>

                {mode === "forgot" && (
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to sign in
                  </button>
                )}
              </form>
            </>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Your spreadsheet data is never used to train AI models.
        </p>
      </motion.div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthContent />
    </Suspense>
  );
}
