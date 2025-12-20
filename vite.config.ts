// ==========================================
// Vite 构建配置文件
// ==========================================
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  optimizeDeps: {
    include: ['lucide-react']
  },
  server: {
    proxy: {
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  },
  build: {
    target: 'es2015',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-components': [
            'src/components/common/Button.tsx',
            'src/components/common/Dialog.tsx',
            'src/components/common/Input.tsx',
            'src/components/common/Switch.tsx',
            'src/components/common/Textarea.tsx'
          ],
          'utils': [
            'src/utils/formatRating.ts',
            'src/types/jobTitles.ts',
            'src/types/messages.ts',
            'src/utils/ratingHelpers.ts',
            'src/utils/rottenTomatoesLogos.ts',
            'src/utils/utils.ts'
          ]
        }
      }
    },
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
  },
  esbuild: {
    target: 'es2015',
    legalComments: 'none',
  }
});
