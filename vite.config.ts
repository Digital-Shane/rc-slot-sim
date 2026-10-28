import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const baseOverride = (process.env.VITE_BASE || process.env.BASE_URL || '').replace(
    /^\/|\/$/g,
    '',
  );
  // The custom domain serves the app at /, not under the GitHub repository name.
  const base = mode === 'production' && baseOverride ? `/${baseOverride}/` : '/';

  return {
    base,
    plugins: [react()],
  };
});
