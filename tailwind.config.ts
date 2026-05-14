import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#F5F0E6",
          50: "#FBF8F2",
          100: "#F5F0E6",
          200: "#EDE5D3",
          300: "#DDD0B4",
        },
        burgundy: {
          DEFAULT: "#7A2E2E",
          50: "#F4E6E6",
          100: "#E5C9C9",
          400: "#9A3D3D",
          500: "#7A2E2E",
          600: "#5E2222",
          700: "#421818",
        },
        ink: {
          DEFAULT: "#1F1A14",
          muted: "#6B6357",
          faint: "#A29A8A",
        },
        hairline: "#D8CFBF",
      },
      fontFamily: {
        serif: ["var(--font-cormorant)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        editorial: "0.22em",
      },
    },
  },
  plugins: [],
};

export default config;
