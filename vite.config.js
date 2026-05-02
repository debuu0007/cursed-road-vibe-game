import { defineConfig } from 'vite';

/** Local: dev pinned to ** http://127.0.0.1:5173/ ** · preview http://127.0.0.1:4174/ */
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true
  }
});
