import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({  // 添加打包分析
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
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
    minify: 'terser',  // 使用terser进行更好的压缩
    terserOptions: {
      compress: {
        drop_console: true,  // 移除console
        drop_debugger: true  // 移除debugger
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // 将React相关库打包到一起
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // 将UI组件打包到一起
          'ui-components': [
            'src/components/ui/Button.tsx',
            'src/components/ui/Dialog.tsx',
            'src/components/ui/Input.tsx',
            'src/components/ui/Switch.tsx',
            'src/components/ui/Textarea.tsx'
          ],
          // 将工具函数打包到一起
          'utils': [
            'src/utils/formatRating.ts',
            'src/utils/jobTitles.ts',
            'src/utils/messages.ts',
            'src/utils/ratingHelpers.ts',
            'src/utils/rottenTomatoesLogos.ts',
            'src/utils/utils.ts'
          ]
        }
      }
    },
    sourcemap: false,  // 生产环境不生成sourcemap
    cssCodeSplit: true,  // CSS代码分割
    assetsInlineLimit: 4096,  // 小于4kb的资源内联为base64
  },
  esbuild: {
    target: 'es2015',
    legalComments: 'none',  // 移除注释
  }
});
