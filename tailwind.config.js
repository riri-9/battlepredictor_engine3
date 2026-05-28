/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        arena: {
          50: '#fdf8d7',
          100: '#f8e897',
          200: '#f1d453',
          300: '#e8be22',
          400: '#ffd700',
          500: '#d9b200',
          600: '#8f7400',
          700: '#5a4900',
          800: '#2b2300',
          900: '#121006',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255, 215, 0, 0.22), 0 0 30px rgba(255, 215, 0, 0.12)',
        soft: '0 18px 50px rgba(0, 0, 0, 0.35)',
      },
      backgroundImage: {
        'arena-grid':
          'linear-gradient(rgba(255,215,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.05) 1px, transparent 1px), radial-gradient(circle at top, rgba(255,215,0,0.15), transparent 44%)',
      },
      animation: {
        float: 'float 8s ease-in-out infinite',
        pulseGlow: 'pulseGlow 2.8s ease-in-out infinite',
        drift: 'drift 18s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.75' },
          '50%': { opacity: '1' },
        },
        drift: {
          '0%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(2%, -1%, 0)' },
          '100%': { transform: 'translate3d(0, 0, 0)' },
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
