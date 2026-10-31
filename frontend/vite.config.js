import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default {
  server: { proxy: { '/api': 'http://localhost:8000' } },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        cinemaPreview: resolve(root, 'cinema-preview.html'),
      },
    },
  },
};
