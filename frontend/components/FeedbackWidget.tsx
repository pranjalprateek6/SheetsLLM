"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function FeedbackWidget({
  variant = "ghost",
}: {
  variant?: "ghost" | "outline";
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetchWithAuth("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          email: email.trim() || undefined,
          path: pathname,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Couldn't send feedback — please try again.");
      } else {
        setOpen(false);
        setMessage("");
        toast.success("Thanks — feedback received!");
      }
    } catch {
      toast.error("Couldn't send feedback — check your connection.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          className="gap-1.5 text-muted-foreground"
          aria-label="Send feedback"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Found a bug, missing a feature, or something felt off? It goes
            straight to the founder.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="feedback-message">What&apos;s on your mind?</Label>
            <Textarea
              id="feedback-message"
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. The XLSX export gave me an error on my 300k-row file…"
              maxLength={2000}
              rows={4}
            />
          </div>
          {!user && (
            <div className="space-y-1.5">
              <Label htmlFor="feedback-email">
                Email <span className="text-muted-foreground">(optional, for a reply)</span>
              </Label>
              <Input
                id="feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                maxLength={200}
              />
            </div>
          )}
          {user && (
            <p className="text-xs text-muted-foreground">
              We&apos;ll reply to {user.email}.
            </p>
          )}
          <Button
            className="w-full"
            onClick={submit}
            disabled={sending || !message.trim()}
          >
            {sending ? "Sending…" : "Send feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
