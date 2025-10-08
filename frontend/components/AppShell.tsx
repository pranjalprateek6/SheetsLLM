"use client";
import * as React from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import ToastProvider from "./ToastProvider";
import { useAppStore } from "../store/useAppStore";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const status = useAppStore((s) => s.status);
  const rows = useAppStore((s) => s.preview.length);

  return (
    <ToastProvider>
      <Header />
      <div className="pt-14">
        <Sidebar />
        <main className="pl-16 md:pl-[280px] pr-0">
          <div className="px-4 md:px-6 py-6 min-h-[calc(100vh-3.5rem-32px)]">
            {children}
          </div>
        </main>
        <footer className="fixed left-0 right-0 bottom-0 h-6 text-[11px] flex items-center justify-between px-4 md:px-6 border-t border-border-light dark:border-border-dark bg-white/60 dark:bg-zinc-900/60 backdrop-blur">
          <div>Status: <span className="font-medium capitalize">{status}</span></div>
          <div>{rows} rows</div>
        </footer>
      </div>
    </ToastProvider>
  );
}
