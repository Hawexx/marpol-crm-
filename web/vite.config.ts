import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Marpol PPM 5173/4000'i kullaniyor; CRM catismamak icin 5174/4100'de calisir.
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4100',
        changeOrigin: true,
      },
    },
  },
  // pdfmake CJS olarak dagitildigi icin gelistirme sunucusunda on-paketlenir.
  optimizeDeps: {
    include: ['pdfmake/build/pdfmake', 'pdfmake/build/vfs_fonts'],
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
