"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Email a one-time sign-in link; creates the account if there is none */
  signInWithLink: (email: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    // The confirmation link signs the person in and lands on /auth, which
    // routes on from there: no second trip through the sign-in form
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    if (error) return { error: error.message };
    // A session means auto-confirm is on; no session means Supabase sent a
    // confirmation email and sign-in will fail until it's clicked.
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signInWithLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth`, shouldCreateUser: true },
    });
    return { error: error ? error.message : null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // Full-page redirect to Google via Supabase; the session lands back on
    // /auth (detectSessionInUrl) and the page routes from there.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth`,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { error: error.message };
    if (!data?.url) return { error: "Could not start Google sign-in." };

    // Pre-flight: a not-yet-enabled provider answers this URL with a raw
    // 400 JSON page instead of redirecting — navigating would strand the
    // user on it. Probe first; only leave the page on a real redirect.
    try {
      const probe = await fetch(data.url, { redirect: "manual" });
      if (probe.status === 400) {
        const body = await probe.json().catch(() => null);
        return { error: body?.msg || "provider is not enabled" };
      }
    } catch {
      // Opaque redirect or network hiccup — proceed with the navigation.
    }
    window.location.assign(data.url);
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    return { error: error ? error.message : null };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? error.message : null };
  }, []);

  const getAccessToken = useCallback(() => {
    return session?.access_token ?? null;
  }, [session]);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signUp, signIn, signInWithLink, signInWithGoogle, signOut, resetPassword, updatePassword, getAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
