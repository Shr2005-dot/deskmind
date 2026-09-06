import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/widget.ts',
      name: 'DeskMindWidget',
      fileName: 'widget',
      formats: ['iife', 'es'],
    },
    rollupOptions: {
      output: {
        assetFileNames: 'widget.[ext]',
      },
    },
  },
})
