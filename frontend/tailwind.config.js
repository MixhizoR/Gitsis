/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      colors: {
        // Aerospace / defense industrial palette
        brand: {
          50: '#eef9ff',
          100: '#d9f0ff',
          200: '#bce6ff',
          300: '#8ed7ff',
          400: '#59bfff',
          500: '#32a1ff',
          600: '#1a82f5',
          700: '#1569e1',
          800: '#1856b6',
          900: '#1a4b8f',
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
      },
    },
  },
  plugins: [],
}
