// Custom PostCSS config overrides Next's default, so autoprefixer must be
// listed here explicitly alongside Tailwind.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
