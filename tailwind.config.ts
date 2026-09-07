import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        brand: {
          red: "#E31E25",
          redDark: "#B01820",
          charcoal: "#2B2A28"
        }
      },
      boxShadow: {
        soft: "0 8px 24px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
