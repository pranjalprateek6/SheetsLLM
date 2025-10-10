import "@/styles/globals.css";
import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import Header from "@/components/Header";
import ScrollToTop from "@/components/ScrollToTop";
import BackgroundAnimation from "@/components/BackgroundAnimation";

export const metadata = { 
  title: "SheetsLLM - AI-Powered Spreadsheet Transformation", 
  description: "Transform your spreadsheets using natural language. No formulas, no code, just plain English." 
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <BackgroundAnimation />
          <ScrollToTop />
          <Header />
          <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-10">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}

