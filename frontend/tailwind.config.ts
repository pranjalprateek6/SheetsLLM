import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "gray-900": "var(--ds-gray-900)",
        "gray-alpha-400": "var(--ds-gray-alpha-400)",
        "background-100": "var(--ds-background-100)",
        "background-200": "var(--ds-background-200)",
        glass: {
          light: "rgba(255, 255, 255, 0.7)",
          dark: "rgba(0, 0, 0, 0.3)",
        },
        border: {
          light: "rgba(0, 0, 0, 0.1)",
          dark: "rgba(255, 255, 255, 0.2)",
        }
      },
      backdropBlur: {
        glass: "10px",
      },
      boxShadow: {
        glass: "0 4px 8px rgba(0, 0, 0, 0.15)",
        "glass-hover": "0 8px 16px rgba(0, 0, 0, 0.25)",
      },
      borderRadius: {
        "3xl": "1.5rem",
        "4xl": "2rem"
      }
    }
  },
  plugins: []
};
export default config;
