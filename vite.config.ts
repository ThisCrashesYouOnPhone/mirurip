/// <reference types="vitest" />
import { defineConfig, loadEnv, ConfigEnv, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default ({ mode }: ConfigEnv): UserConfig => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

  return defineConfig({
    plugins: [react()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: false,
    },
    build: {
      chunkSizeWarningLimit: 1000,
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@vidstack')) {
                return 'vidstack-player';
              }
              if (id.includes('@apollo/client') || id.includes('graphql')) {
                return 'apollo-graphql';
              }
              if (id.includes('swiper')) {
                return 'swiper';
              }
              if (id.includes('react-icons') || id.includes('@fortawesome')) {
                return 'icons';
              }
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'react-vendor';
              }
            }
          },
        },
      },
    },
    server: {
      port: parseInt(process.env.VITE_PORT || '5173', 10),
      open: true,
    },
  });
};
