import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    open: false
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          engine: ['./src/engine.js'],
          canvas: ['./src/canvas.js']
        }
      }
    }
  }
});
