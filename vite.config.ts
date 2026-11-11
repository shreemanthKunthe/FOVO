import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tmdbServerPlugin } from './src/server/tmdbProxy';

export default defineConfig({
  plugins: [react(), tmdbServerPlugin()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('@react-three')) return 'r3f';
        },
      },
    },
  },
});
