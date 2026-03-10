import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main:     'index.html',
        composer: 'composer/index.html',
      },
      output: {
        manualChunks: {
          'pdf-vendor': ['pdfmake'],
          'ajv-vendor': ['ajv'],
        },
      },
    },
  },
  assetsInclude: ['**/*.ttf'],
});
