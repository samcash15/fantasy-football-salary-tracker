import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static React board, hosted on GitHub Pages at /<repo>/. Fetches board.json at runtime.
// Dev/preview stay at '/'; production build uses the Pages subpath so assets + board.json
// (fetched via import.meta.env.BASE_URL) resolve correctly.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/fantasy-football-salary-tracker/' : '/',
  plugins: [react()],
}));
