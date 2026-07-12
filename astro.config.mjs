// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://sreenivas-sadhu-prabhakara.github.io',
  base: '/sortscope',
  trailingSlash: 'ignore',
  build: {
    // Emit CSS/JS as external files so the strict CSP (script-src 'self')
    // is never violated by an inline runtime script.
    inlineStylesheets: 'never',
  },
});
