// scripts/build-ha.mjs
// Runs after `vite build` (see package.json). It:
//  1. compiles the Tailwind stylesheet (homedash.css) for the website → dist/ha/homedash.css,
//     and links it from dist/index.html
//  2. builds dist/ha/homedash-panel.js: Homedash packaged as a Home Assistant card
// It uses esbuild (installed with Vite) and Tailwind, both already in the project.

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { compile } from 'tailwindcss';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.resolve(root, process.env.DIST_DIR || 'dist');
const outDir = path.join(distDir, 'ha');
const require = createRequire(import.meta.url);
const tailwindDir = path.dirname(require.resolve('tailwindcss/package.json'));

// --- 1. Collect class names from the source (Tailwind's own scanner isn't needed for this size) ---
const sourceFiles = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'api', 'scripts', 'public'].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(name)) sourceFiles.push(full);
  }
};
walk(root);
const candidates = new Set();
for (const file of sourceFiles) {
  for (const token of readFileSync(file, 'utf8').match(/[!a-zA-Z0-9_\-:./[\],%#()@]+/g) || []) {
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
const shared = readFileSync(path.join(root, 'homedash.css'), 'utf8');
const buildCss = async extraFile => {
  const input = `${shared}\n${readFileSync(path.join(root, extraFile), 'utf8')}`;
  const compiler = await compile(input, { base: root, loadStylesheet });
  return compiler.build([...candidates]);
};
const minify = async css => (await esbuild.transform(css, { loader: 'css', minify: true })).code;

mkdirSync(outDir, { recursive: true });

// Website stylesheet
const siteCss = await minify(await buildCss('site.css'));
writeFileSync(path.join(outDir, 'homedash.css'), siteCss);
const indexHtml = path.join(distDir, 'index.html');
if (existsSync(indexHtml)) {
  const html = readFileSync(indexHtml, 'utf8');
  if (!html.includes('/ha/homedash.css')) {
    writeFileSync(indexHtml, html.replace('</head>', '  <link rel="stylesheet" href="/ha/homedash.css">\n</head>'));
  }
}

// Panel stylesheet: @property rules are ignored inside a shadow root, so they're registered on the page instead.
let panelCss = await buildCss('ha-panel.css');
const properties = (panelCss.match(/@property\s+--[\w-]+\s*\{[^}]*\}/g) || []).join('\n');
panelCss = await minify(panelCss.replace(/@property\s+--[\w-]+\s*\{[^}]*\}/g, ''));

// --- 3. Bundle the panel ---
await esbuild.build({
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
    __PANEL_CSS__: JSON.stringify(panelCss),
    __PANEL_PROPERTIES__: JSON.stringify(properties),
  },
  logLevel: 'warning',
});

const size = statSync(path.join(outDir, 'homedash-panel.js')).size;
writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ built: new Date().toISOString(), bytes: size }));
console.log(`Homedash: panel ${Math.round(size / 1024)} KB, panel CSS ${Math.round(panelCss.length / 1024)} KB, site CSS ${Math.round(siteCss.length / 1024)} KB`);
