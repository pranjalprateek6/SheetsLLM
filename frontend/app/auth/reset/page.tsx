"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* Landing page for Supabase password-recovery links. The link carries a
   recovery token that supabase-js exchanges for a session on load; once
   that session exists the user can set a new password. */

export default function ResetPasswordPage() {
  const router = useRouter();
  const { updatePassword } = useAuth();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // The recovery link signs the user in via the URL hash. Give supabase-js
    // a moment to consume it, then check whether we actually have a session.
    let cancelled = false;
    const check = async () => {
      for (let i = 0; i < 10; i++) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setReady(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!cancelled) setInvalid(true);
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const { error: err } = await updatePassword(password);
      if (err) setError(err);
      else router.replace("/workspace");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>

          {invalid ? (
            <div className="mt-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                This reset link is invalid or has expired. Request a fresh one and try again.
              </p>
              <Button variant="outline" className="mt-5 w-full" asChild>
                <Link href="/auth">Back to sign in</Link>
              </Button>
            </div>
          ) : !ready ? (
            <p className="mt-4 text-sm text-muted-foreground">Verifying your reset link…</p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : "Set new password"}
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
