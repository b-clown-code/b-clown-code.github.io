import { defineConfig } from 'astro/config';
import { rehypeSitePlugins } from './scripts/rehype-site.mjs';

// Deployment target comes from the environment so the same source builds for
// https://b-clown-code.github.io/ (BASE_PATH=/) or a project-page subpath.
const site = process.env.SITE_URL || 'https://b-clown-code.github.io';
let base = process.env.BASE_PATH || '/';
if (!base.startsWith('/')) base = '/' + base;
if (!base.endsWith('/')) base += '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  markdown: {
    rehypePlugins: [[rehypeSitePlugins, { base }]],
  },
});
