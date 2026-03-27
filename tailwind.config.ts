import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#000917",
          container: "#0d2137",
          light: "#1a3a5c",
          dark: "#060f1a",
        },
        accent: {
          DEFAULT: "#b80f19",
          container: "#dd2f2e",
          light: "#e05555",
          dark: "#93000e",
        },
        bg: "#f8f9fb",
        surface: {
          DEFAULT: "#ffffff",
          low: "#f2f4f6",
          container: "#eceef0",
          high: "#e6e8ea",
        },
        outline: {
          DEFAULT: "#74777d",
          variant: "#c4c6cd",
        }
      },
      fontFamily: {
        sans: ["Inter", "Manrope", "system-ui", "sans-serif"],
        heading: ["Manrope", "Inter", "system-ui", "sans-serif"],
      },
      width: {
        sidebar: "240px",
      },
      height: {
        navbar: "64px",
      },
    },
  },
  plugins: [],
};
export default config;
