/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['"IBM Plex Sans"', 'sans-serif'],
      },
      colors: {
        ink:    'rgb(var(--ink)    / <alpha-value>)',
        panel:  'rgb(var(--panel)  / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        muted:  'rgb(var(--muted)  / <alpha-value>)',
        dim:    'rgb(var(--dim)    / <alpha-value>)',
        text:   'rgb(var(--text)   / <alpha-value>)',
        bright: 'rgb(var(--bright) / <alpha-value>)',
        blue:   'rgb(var(--blue)   / <alpha-value>)',
        green:  'rgb(var(--green)  / <alpha-value>)',
        amber:  'rgb(var(--amber)  / <alpha-value>)',
        red:    'rgb(var(--red)    / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
