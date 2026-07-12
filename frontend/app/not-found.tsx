import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
        <img src="/logo.svg" alt="" width={40} height={40} className="mx-auto mb-4 h-10 w-10 opacity-60" />
        <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn&apos;t exist — maybe the link is old, or a typo snuck in.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Go to Files</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
