/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'fv-orange': '#FF6B00',
        'fv-orange-2': '#FF8A3D',
        'fv-bg': '#FFF8F2',
        'fv-white': '#FFFFFF',
        'fv-text': '#202020',
        'fv-muted': '#707070',
        'fv-border': '#E8E1DB',
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: 0, transform: 'scale(0.97)' }, to: { opacity: 1, transform: 'scale(1)' } },
        scanLine: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100%)' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.6s ease-out both',
        slideUp: 'slideUp 0.6s ease-out both',
        scaleIn: 'scaleIn 0.4s ease-out both',
        scanLine: 'scanLine 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
