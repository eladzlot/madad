import { defineConfig } from 'vite';

export default defineConfig({
  base: '/madad/',
  build: {
    rollupOptions: {
      input: {
        main:     'index.html',
        composer: 'composer/index.html',
      },
      output: {
        manualChunks: {
          'pdf-vendor': ['pdfmake']
        },
      },
    },
  },
  assetsInclude: ['**/*.ttf'],
});
