import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Keep independently loaded routes below Vite's 500 kB warning limit.
        codeSplitting: {
          groups: [
            {
              name: 'notes-editor-vendor',
              test: /node_modules[\\/](?:@tiptap|prosemirror-|lowlight|highlight\.js|katex|yjs|y-protocols|lib0)/,
              maxSize: 450 * 1024,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
})
