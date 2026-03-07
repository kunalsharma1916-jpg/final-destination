/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        shell: "#0b111f",
        panel: "#111a2e",
        accent: "#0ea5e9",
        danger: "#ef4444",
        success: "#22c55e",
      },
    },
  },
  plugins: [],
};
