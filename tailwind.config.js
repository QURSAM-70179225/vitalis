/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        space: { 950: '#03060f', 900: '#060b1a', 850: '#0a1124', 800: '#0e1730', 700: '#16223f', 600: '#22315a' },
        accent: { DEFAULT: '#22d3ee', soft: '#67e8f9', deep: '#0891b2', teal: '#2dd4bf' },
        nominal: '#34d399',
        monitor: '#facc15',
        act: '#fb923c',
        critical: '#f87171',
      },
      boxShadow: { glow: '0 0 24px rgba(34,211,238,.25)' },
    },
  },
  plugins: [],
};
