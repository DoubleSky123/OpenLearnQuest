import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `vite build --mode prototype` builds ONLY the Memory City prototype
// (prototype.html -> dist-prototype/) so a static host never serves the
// backend-dependent app at "/". The default build is unchanged.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  ...(mode === 'prototype' && {
    build: {
      outDir: 'dist-prototype',
      rollupOptions: { input: fileURLToPath(new URL('./prototype.html', import.meta.url)) },
    },
  }),
  test: {
    environment: 'node',   // the interpreter is pure; nothing here needs a DOM
    include: ['src/**/*.test.js'],
  },
}))
