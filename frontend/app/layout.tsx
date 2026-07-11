import "@/styles/globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import Header from "@/components/Header";

export const metadata = {
  title: "SheetsLLM - AI-Powered Spreadsheet Transformation",
  description: "Transform your spreadsheets using natural language. No formulas, no code, just plain English."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased bg-[#0B0B0B]">
        <AuthProvider>
          <Header />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
