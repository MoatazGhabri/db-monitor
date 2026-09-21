/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef1',
          200: '#d5d9e0',
          300: '#b0b8c4',
          400: '#848f9e',
          500: '#65717f',
          600: '#515b67',
          700: '#424953',
          800: '#393f47',
          900: '#191b1f',
          950: '#0d0e11',
        },
      },
      boxShadow: {
        'soft': '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        'card': '0 1px 2px rgba(16,24,40,.04), 0 2px 8px rgba(16,24,40,.05)',
        'lift': '0 4px 12px rgba(16,24,40,.08), 0 1px 3px rgba(16,24,40,.06)',
        'pop': '0 8px 24px rgba(16,24,40,.10), 0 2px 6px rgba(16,24,40,.06)',
      },
      animation: {
        'fade-in': 'fadeIn .35s ease both',
        'slide-up': 'slideUp .35s ease both',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.4' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
};
