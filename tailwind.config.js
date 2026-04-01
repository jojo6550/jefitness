/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/pages/*.html",
    "./public/pages/**/*.html",
    "./public/index.html",
    "./public/js/**/*.js",
    "./src/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg:       '#0a0a0b',
          card:     '#111113',
          border:   '#1e1e24',
          hover:    '#16161a',
          cyan:     '#22d3ee',
          'cyan-dim': '#0e7490',
          amber:    '#f59e0b',
          'amber-dim': '#92400e',
          text:     '#f1f5f9',
          muted:    '#64748b',
          danger:   '#ef4444',
          success:  '#22c55e',
          warning:  '#f59e0b',
        },
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan':  '0 0 20px rgba(34,211,238,0.25)',
        'glow-amber': '0 0 20px rgba(245,158,11,0.25)',
        'card':       '0 1px 3px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        'cyan-gradient':  'linear-gradient(135deg, #22d3ee, #0891b2)',
        'amber-gradient': 'linear-gradient(135deg, #f59e0b, #d97706)',
        'card-gradient':  'linear-gradient(160deg, #111113 0%, #0d0d0f 100%)',
      },
      borderRadius: {
        'xl2': '1rem',
        'xl3': '1.5rem',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0px rgba(34,211,238,0)' },
          '50%':      { boxShadow: '0 0 18px rgba(34,211,238,0.3)' },
        },
      },
      animation: {
        'fade-up':    'fade-up 0.5s ease-out both',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
    container: false,
  },
}
