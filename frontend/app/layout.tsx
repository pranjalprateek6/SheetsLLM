import "@/styles/globals.css";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AuthProvider } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// Geist Sans for every word of interface and prose, Geist Mono only where a
// string is data: SQL, cell values in code views, file names in tables.
// Self-hosted by the geist package (next/font/local), so no layout shift.

export const metadata = {
  metadataBase: new URL("https://sheets-llm.vercel.app"),
  title: "SheetsLLM: Clean the same spreadsheet once, never again",
  description:
    "Describe your data cleanup in plain English, save it as a recipe, and re-run it on every new export. By default the AI sees column names and types, never your values.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <AuthProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Skip to content
            </a>
            <Header />
            <main id="main" tabIndex={-1}>{children}</main>
            <Toaster position="bottom-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
