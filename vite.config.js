import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static React board. Deploys to Netlify as a static site; fetches board.json at runtime.
export default defineConfig({
  plugins: [react()],
});
