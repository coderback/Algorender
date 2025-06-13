/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
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
