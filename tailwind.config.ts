import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'arklake-ink': '#17333A',
        'arklake-aqua': '#32C7C1',
        'arklake-gold': '#D7B45B',
        'aqua-mist': '#E6F7F5',
        'lake-canvas': '#F4F8F7',
        surface: '#FFFFFF',
        'lake-border': '#D8E4E1',
        slate: '#67747A',
        'deep-text': '#142127',
      },
    },
  },
  plugins: [],
} satisfies Config
