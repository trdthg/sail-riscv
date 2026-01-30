/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', '"Helvetica Neue"', 'sans-serif'],
        serif: ['"Fraunces"', '"Times New Roman"', 'serif'],
      },
    },
  },
  plugins: [],
};
