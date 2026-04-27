/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['"IBM Plex Sans"', 'sans-serif'],
      },
      colors: {
        ink:    '#0c0e14',
        panel:  '#11131b',
        border: '#1e2130',
        muted:  '#444b63',
        dim:    '#7a8199',
        text:   '#dde1ee',
        bright: '#eef0f8',
        blue:   '#6ba3e8',
        green:  '#36c97a',
        amber:  '#f0a532',
        red:    '#e85050',
      },
    },
  },
  plugins: [],
};
