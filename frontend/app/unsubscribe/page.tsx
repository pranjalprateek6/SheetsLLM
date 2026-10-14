"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/* The landing for the "Stop these emails" link in a recipe reminder.
   One request, one sentence, and the way back on. */

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeContent />
    </Suspense>
  );
}

function UnsubscribeContent() {
  const token = useSearchParams().get("t") ?? "";
  const [state, setState] = useState<"working" | "done" | "bad" | "failed">("working");

  useEffect(() => {
    if (!token) {
      setState("bad");
      return;
    }
    fetch(`/api/reminders/unsubscribe?t=${encodeURIComponent(token)}`, { method: "POST" })
      .then((r) => setState(r.ok ? "done" : r.status === 400 ? "bad" : "failed"))
      .catch(() => setState("failed"));
  }, [token]);

  const copy = {
    working: ["One moment", "Switching recipe reminders off."],
    done: ["Reminders are off", "You won't get an email when a recipe is due. Everything else about your account is unchanged. Turn them back on from your account page whenever you like."],
    bad: ["This link isn't valid", "It may have been cut short by your mail app. You can switch reminders off from your account page instead."],
    failed: ["Couldn't save that", "Try the link again in a minute, or switch reminders off from your account page."],
  }[state];

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{copy[0]}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{copy[1]}</p>
      <div className="mt-6">
        <Button asChild variant="outline">
          <Link href="/account">Go to your account</Link>
        </Button>
      </div>
    </main>
  );
}
