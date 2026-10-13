import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allow importing the shared library and mock data from
      // ../../lib and ../../api at the repo root.
      allow: [repoRoot],
    },
  },
});
