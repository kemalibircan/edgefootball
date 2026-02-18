/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#FFFFFF',
        ink: '#102318',
        muted: '#5B6B61',
        field: '#F4F7F5',
        line: '#D8E1DB',
        success: '#0F8A4B',
        warn: '#E3C94B',
      },
      boxShadow: {
        soft: '0 8px 18px rgba(10, 32, 20, 0.12)',
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
};
