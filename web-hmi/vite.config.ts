import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // VITE_BASE_PATH is set in Railway dashboard (e.g. /hmi/). Defaults to / for local dev.
  base: process.env.VITE_BASE_PATH || '/',

  optimizeDeps: {
    include: ['@pds/pipeline'],
  },

  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: false,
    open: true,
    cors: true,
    // Development proxy to route different apps to their respective backends
    // Mirrors production nginx/web-gateway routing pattern
    proxy: {
      // Main HMI API endpoint (WEB-HMI/api)
      '/v1': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Marketplace frontend assets (served from WEB-Marketplace/frontend dist)
      '/marketplace': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/marketplace/, ''),
      },
      // Board editor (single-file HTML)
      '/board-editor': {
        target: 'http://localhost:5175',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/board-editor/, ''),
      },
    },
  },

  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console logs in production
      },
    },
    // Allow @rollup/plugin-commonjs to convert @pds/pipeline (CJS) for the browser bundle
    commonjsOptions: {
      include: [/node_modules/, /pds-pipeline/],
    },
    // Code splitting for better performance
    rollupOptions: {
      output: {
        manualChunks: {
          // Split large dependencies into separate chunks
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
    // Limit chunk size warnings
    chunkSizeWarningLimit: 500,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@types': path.resolve(__dirname, './src/types'),
      '@network': path.resolve(__dirname, './src/network'),
      '@automation': path.resolve(__dirname, './src/automation'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@styles': path.resolve(__dirname, './src/styles'),
    },
  },

  // Environment variables
  define: {
    __APP_VERSION__: JSON.stringify('1.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },

  // CSS configuration
  css: {
    postcss: './postcss.config.js',
  },
});
