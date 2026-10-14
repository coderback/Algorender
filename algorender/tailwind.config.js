const colors = require('tailwindcss/colors');
const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      // Geist fonts loaded in app/layout.jsx via next/font CSS variables
      fontFamily: {
        sans: ['var(--font-geist-sans)', ...defaultTheme.fontFamily.sans],
        mono: ['var(--font-geist-mono)', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        // shadcn/ui tokens used by components/ui (card, tabs). Fixed light
        // values from the app's palette: the UI has no dark theme.
        background: colors.white,
        foreground: colors.gray[900],
        card: {
          DEFAULT: colors.white,
          foreground: colors.gray[900],
        },
        muted: {
          DEFAULT: colors.gray[100],
          foreground: colors.gray[500],
        },
        ring: colors.blue[500],
        forest: {
          50: '#f1f8f4',
          100: '#daf0e4',
          200: '#b4e2c8',
          300: '#82cea4',
          400: '#55b67e',
          500: '#339b61', // PRIMARY
          600: '#277b4d',
          700: '#20613e',
          800: '#1a4d32',
          900: '#153f29',
        },
      },
    },
  },
  plugins: [],
}
