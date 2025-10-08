import "@/styles/globals.css";
import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import Header from "@/components/Header";
import ScrollToTop from "@/components/ScrollToTop";

export const metadata = { title: "SheetsLLM", description: "Your data, conversationally alive." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-grid antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ScrollToTop />
          <Header />
          <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 pb-16">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}

