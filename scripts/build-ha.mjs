// scripts/build-ha.mjs
// Builds dist/ha/homedash-panel.js: Homedash packaged as a Home Assistant card.
// Runs after `vite build` (see package.json), using esbuild (installed with Vite) and Tailwind.

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { compile } from 'tailwindcss';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, process.env.HA_OUT_DIR || 'dist/ha');
const require = createRequire(import.meta.url);
const tailwindDir = path.dirname(require.resolve('tailwindcss/package.json'));

// --- 1. Collect class names from the source (Tailwind's own scanner isn't needed for this size) ---
const sourceFiles = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'api', 'scripts'].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(name)) sourceFiles.push(full);
  }
};
walk(root);
const candidates = new Set();
for (const file of sourceFiles) {
  for (const token of readFileSync(file, 'utf8').match(/[!a-zA-Z0-9_\-:./[\]%#()@]+/g) || []) {
    candidates.add(token);
  }
}

// --- 2. Compile Tailwind ---
const loadStylesheet = async (id, base) => {
  if (id === 'tailwindcss') {
    const file = path.join(tailwindDir, 'index.css');
    return { path: file, base: tailwindDir, content: readFileSync(file, 'utf8') };
  }
  const file = path.resolve(base, id);
  return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') };
};
const cssInput = readFileSync(path.join(root, 'ha-panel.css'), 'utf8');
const compiler = await compile(cssInput, { base: root, loadStylesheet });
let css = compiler.build([...candidates]);

// @property rules are ignored inside a shadow root, so they're registered on the page instead.
const properties = (css.match(/@property\s+--[\w-]+\s*\{[^}]*\}/g) || []).join('\n');
css = css.replace(/@property\s+--[\w-]+\s*\{[^}]*\}/g, '');
const minCss = (await esbuild.transform(css, { loader: 'css', minify: true })).code;

// --- 3. Bundle the app ---
mkdirSync(outDir, { recursive: true });
const result = await esbuild.build({
  entryPoints: [path.join(root, 'ha-panel.tsx')],
  bundle: true,
  format: 'esm',
  target: ['es2020', 'safari15'],
  minify: true,
  jsx: 'automatic',
  legalComments: 'none',
  outfile: path.join(outDir, 'homedash-panel.js'),
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [],
  define: {
    'process.env.NODE_ENV': '"production"',
    __PANEL_CSS__: JSON.stringify(minCss),
    __PANEL_PROPERTIES__: JSON.stringify(properties),
  },
  metafile: true,
  logLevel: 'warning',
});

const size = statSync(path.join(outDir, 'homedash-panel.js')).size;
writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ built: new Date().toISOString(), bytes: size }));
console.log(`Homedash panel: ${path.relative(root, outDir)}/homedash-panel.js (${Math.round(size / 1024)} KB, ${Math.round(minCss.length / 1024)} KB CSS)`);
void result;
