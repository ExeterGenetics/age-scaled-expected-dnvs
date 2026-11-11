import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// The rate tables live outside the app (../gene_rates.tsv, ../gene_sets/, ../data/),
// so the dev server must be allowed to read them. The build inlines everything
// into one dist/index.html that opens straight from disk.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  // build date, printed on exported reports with the commit (VITE_COMMIT, set by the deploy workflow)
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  server: { fs: { allow: ['..'] } },
})
