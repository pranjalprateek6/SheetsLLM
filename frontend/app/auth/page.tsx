"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, Check, CheckCircle2, MailCheck, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup" | "forgot";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29A7.16 7.16 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

/** Route by what the account actually contains: no files yet means the
 *  workspace onboarding is the right first screen; files mean this is a
 *  returning user who wants the dashboard. */
async function destinationAfterAuth(): Promise<string> {
  try {
    const r = await fetchWithAuth("/api/files?page=1&page_size=1");
    const d = await r.json();
    const total = d.total ?? (d.files?.length || d.items?.length || 0);
    return total > 0 ? "/dashboard" : "/workspace";
  } catch {
    return "/workspace";
  }
}

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
  const { user, signIn, signInWithGoogle, signUp, resetPassword } = useAuth();
  const router = useRouter();
  const routedRef = useRef(false);

  // OAuth failures come back as URL params (query or hash)
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const desc =
      searchParams.get("error_description") || hash.get("error_description");
    if (desc) {
      setError(
        /provider is not enabled/i.test(desc)
          ? "Google sign-in isn't available yet — use email and password for now."
          : desc.replace(/\+/g, " ")
      );
    }
  }, [searchParams]);

  // Covers every way a session can appear: password sign-in, the OAuth
  // redirect back to this page, or visiting /auth while already signed in.
  useEffect(() => {
    if (!user || routedRef.current) return;
    routedRef.current = true;
    destinationAfterAuth().then((dest) => router.replace(dest));
  }, [user, router]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSuccess(null);
    setConfirmationSent(false);
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    const { error: err } = await signInWithGoogle();
    if (err) {
      setError(
        /provider is not enabled/i.test(err)
          ? "Google sign-in isn't available yet — use email and password for now."
          : err
      );
      setLoading(false);
    }
    // On success the browser navigates away — no state to reset.
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
        }
        // Success: the user effect above routes by account contents.
      }
    } finally {
      setLoading(false);
    }
  };

  const heading =
    mode === "signin"
      ? "Welcome back"
      : mode === "signup"
        ? "Your first clean file is 2 minutes away"
        : "Reset your password";

  const passwordLongEnough = password.length >= 6;

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
                    Describe a cleanup once, keep it forever.{" "}
                    <button onClick={() => switchMode("signin")} className="font-medium text-primary hover:underline">
                      I have an account
                    </button>
                  </>
                ) : (
                  <>We&apos;ll email you a link to set a new password.</>
                )}
              </p>

              {mode !== "forgot" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-6 w-full gap-2"
                    onClick={handleGoogle}
                    disabled={loading}
                  >
                    <GoogleIcon />
                    Continue with Google
                  </Button>
                  <div className="relative my-5">
                    <div className="absolute inset-0 flex items-center" aria-hidden>
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">
                        or
                      </span>
                    </div>
                  </div>
                </>
              )}

              <form onSubmit={handleSubmit} className={cn("space-y-4", mode === "forgot" && "mt-6")}>
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
                    {/* Requirements that check themselves off remove a reason
                        to get stuck at the very first form. */}
                    {mode === "signup" && password.length > 0 && (
                      <p
                        className={cn(
                          "flex items-center gap-1.5 text-xs transition-colors",
                          passwordLongEnough ? "text-success" : "text-muted-foreground"
                        )}
                        aria-live="polite"
                      >
                        <Check className={cn("h-3 w-3", !passwordLongEnough && "opacity-40")} />
                        At least 6 characters
                      </p>
                    )}
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
