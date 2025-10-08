import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { light: "#F8F9FA", dark: "#0E1117" },
        card: { light: "#FFFFFF", dark: "#151517" },
        text: { light: "#0F1115", dark: "#E7E7E8" },
        border: { light: "#E5E7EB", dark: "#2A2A2E" },
        accent: "#4F46E5" // indigo-600
      },
      boxShadow: { soft: "0 6px 24px rgba(0,0,0,0.08)" },
      borderRadius: { xl2: "1rem" }
    }
  },
  plugins: []
};
export default config;

