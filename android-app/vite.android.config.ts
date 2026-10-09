import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Vite config for Android build — root is android-app/ so node_modules resolves correctly
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, '../src/renderer/src'),
      '@shared': resolve(__dirname, '../src/shared')
    }
  },
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
      input: { index: resolve(__dirname, 'index.html') }
    }
  }
})
