import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins:[react(),tsconfigPaths({projects:['./tsconfig.base.json']})],
  test:{environment:'jsdom',include:['apps/frontend/src/components/new-launch/providers/local-cn/*.test.tsx'],maxWorkers:1},
});
