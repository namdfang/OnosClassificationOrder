/** @type {import('tailwindcss').Config} */
/* eslint-disable import/no-extraneous-dependencies, global-require */

const plugin = require('tailwindcss/plugin');

module.exports = {
  content: [
    './components/**/*.{astro,ts,tsx,svelte}',
    './src/**/*.{astro,ts,tsx,svelte}',
    './../../packages/ui/**/*.{astro,ts,tsx,svelte}',
  ],
  daisyui: {
    themes: ['light', 'dark'],
    logs: false,
    prefix: 'd-',
  },
  plugins: [
    require('@tailwindcss/aspect-ratio'),
    require('@tailwindcss/typography'),
    require('tailwindcss-animate'),
    require('daisyui'),
    plugin(({ addUtilities }) => {
      addUtilities({
        '.drag-none': {
          '-webkit-user-drag': 'none',
          '-khtml-user-drag': 'none',
          '-moz-user-drag': 'none',
          '-o-user-drag': 'none',
          'user-drag': 'none',
        },
      });
    }),
  ],
};
