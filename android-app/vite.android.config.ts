import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Vite config for Android build — outputs to dist/ for Capacitor
export default defineConfig({
  root: resolve(__dirname, '../src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, '../src/renderer/src'),
      '@shared': resolve(__dirname, '../src/shared')
    }
  },
  // Use postcss.config.js from android-app/ dir, not repo root
  css: {
    postcss: {
      plugins: [
        require('tailwindcss')(resolve(__dirname, 'tailwind.config.ts')),
        require('autoprefixer'),
      ],
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(__dirname, '../src/renderer/index.html') }
    }
  }
})
