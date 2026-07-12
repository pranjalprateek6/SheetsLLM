import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <EmptyState
          variant="lost"
          title="Page not found"
          description="This page doesn't exist. Maybe the link is old, or a typo snuck in."
          action={
            <div className="flex justify-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/">Home</Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard">Go to Files</Link>
              </Button>
            </div>
          }
        />
      </div>
    </div>
  );
}
