"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookMarked, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { fetchSharedRecipe, importRecipe, LoopFailure, type SharedRecipe } from "@/lib/loops";

/* A recipe someone shared: its steps and the columns it needs, never any
   data. "Use this recipe" copies it into your account. */

export default function SharedRecipePage({ params }: { params: { token: string } }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [recipe, setRecipe] = useState<SharedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchSharedRecipe(params.token)
      .then(setRecipe)
      .catch((e) => setError(e instanceof LoopFailure ? e.message : "This link has expired or never existed."));
  }, [params.token]);

  const use = async () => {
    if (!user) {
      router.push(`/auth?mode=signup&next=${encodeURIComponent(`/r/${params.token}`)}`);
      return;
    }
    setBusy(true);
    try {
      const added = await importRecipe(params.token);
      router.push(`/workspace?recipe_id=${encodeURIComponent(added.recipe_id)}`);
    } catch (e) {
      setError(e instanceof LoopFailure ? e.message : "Couldn't add the recipe. Try again.");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      {error && !recipe ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">This link doesn&apos;t work any more</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">{error}</p>
          <Button asChild className="mt-6">
            <Link href="/">See what SheetsLLM does</Link>
          </Button>
        </div>
      ) : !recipe ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <BookMarked className="h-4 w-4 text-primary-accent" aria-hidden /> A shared recipe
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{recipe.name}</h1>
          {recipe.description && <p className="mt-2 text-[15px] text-muted-foreground">{recipe.description}</p>}
          <p className="mt-2 text-[14px] text-muted-foreground">
            {recipe.steps.length === 1 ? "One step that runs" : `${recipe.steps.length} steps that run`} on any file
            with these columns, with no AI call. Only the steps are shared, never anyone&apos;s data.
          </p>

          <ol className="mt-6 divide-y rounded-xl border bg-card">
            {recipe.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3 text-[14px]">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary-accent">
                  {i + 1}
                </span>
                <span>{s.instruction}</span>
              </li>
            ))}
          </ol>

          {recipe.required_columns.length > 0 && (
            <div className="mt-6">
              <h2 className="text-[13px] font-medium">Columns it needs</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {recipe.required_columns.map((c) => (
                  <li key={c} className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[12px]">
                    {c}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-muted-foreground">
                A column with another name is matched when you run it, and remembered.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 text-[13px] text-destructive-text">
              {error}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button onClick={use} disabled={busy || authLoading}>
              <Check className="mr-1.5 h-4 w-4" /> {busy ? "Adding…" : user ? "Use this recipe" : "Sign up to use this recipe"}
            </Button>
            <Link href="/product/recipes" className="text-[13px] text-muted-foreground underline-offset-2 hover:underline">
              How recipes work
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
