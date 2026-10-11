import process from 'node:process';

// The Memory City prototype (src/prototype, built by `npm run build:prototype`)
// must not add classes to the main app's CSS, so `npm run build` skips it.
// Dev serves both pages and scans everything.
const mainBuild = process.env.npm_lifecycle_event === 'build';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    ...(mainBuild ? ["!./src/prototype/**"] : []),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
