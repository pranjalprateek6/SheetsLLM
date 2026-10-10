import "@/styles/globals.css";
import { Inter } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { AuthProvider } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// Inter (variable, so the in-between 510 and 590 weights exist) for every
// word of interface and prose; Geist Mono only for code: SQL and column types.
// next/font self-hosts both, so there is no layout shift.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata = {
  metadataBase: new URL("https://sheets-llm.vercel.app"),
  title: "SheetsLLM: Clean the same spreadsheet once, never again",
  description:
    "Describe your data cleanup in plain English, save it as a recipe, and re-run it on every new export. By default the AI sees column names and types, never your values.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <AuthProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Skip to content
            </a>
            <Header />
            <main id="main" tabIndex={-1}>{children}</main>
            {/* Bottom-left: the right edge of the workspace is Chef's composer,
                and a toast there sat on the input people type into */}
            <Toaster position="bottom-left" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
