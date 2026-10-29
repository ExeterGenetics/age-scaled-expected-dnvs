import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// The rate tables live outside the app (../gene_rates.tsv, ../gene_sets/, ../data/),
// so the dev server must be allowed to read them. The build inlines everything
// into one dist/index.html that opens straight from disk.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  server: { fs: { allow: ['..'] } },
})
