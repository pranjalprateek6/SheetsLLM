"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Says so when the browser loses its connection, and goes when it is back. */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    const down = () => setOffline(true);
    const up = () => setOffline(false);
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-[13px] font-medium text-warning-foreground">
      <WifiOff className="h-4 w-4" aria-hidden />
      You&apos;re offline. Nothing is lost; changes go through once the connection is back.
    </div>
  );
}
