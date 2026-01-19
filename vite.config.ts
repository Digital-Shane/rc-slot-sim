import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const baseOverride = (process.env.VITE_BASE || process.env.BASE_URL || '').replace(
    /^\/|\/$/g,
    '',
  );
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const base = mode === 'production' ? `/${baseOverride || repoName || 'casino-sim'}/` : '/';

  return {
    base,
    plugins: [react()],
  };
});
