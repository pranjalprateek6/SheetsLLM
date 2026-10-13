"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* The one action on the account page that cannot be taken back. It asks for
   the sign-in address typed out, says exactly what goes, and reports a
   failure in the dialog rather than closing on it. */

export default function DeleteAccount({ email }: { email: string }) {
  const { signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = typed.trim().toLowerCase() === email.trim().toLowerCase();

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  };

  const deleteAccount = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithAuth("/api/account", { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof d?.message === "string" && d.message ? d.message : "Couldn't delete your account. Try again in a moment.");
        return;
      }
      toast.success("Your account and data were deleted.");
      await signOut();
      router.push("/");
    } catch {
      setError("Couldn't delete your account. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">Delete account</p>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive-text hover:bg-destructive/5 hover:text-destructive-text"
          onClick={() => setOpen(true)}
        >
          Delete account
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={reset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything goes right away: your files, steps, recipes, history and your sign-in.
              A Pro subscription is cancelled with no further charge. There is no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void deleteAccount();
            }}
          >
            <Label htmlFor="delete-account-email" className="text-[13px] text-muted-foreground">
              Type your email to confirm
            </Label>
            <Input
              id="delete-account-email"
              type="email"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email}
              disabled={busy}
            />
            {error && (
              <p role="alert" className="text-[13px] text-destructive-text">
                {error}
              </p>
            )}
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep my account</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Stays open on failure, so the message can be read
                e.preventDefault();
                void deleteAccount();
              }}
              disabled={!confirmed || busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Deleting…" : "Delete everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
