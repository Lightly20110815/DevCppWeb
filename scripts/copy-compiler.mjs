// Copies the in-browser Clang/LLD toolchain (@yowasp/clang) into public/compiler so the
// compiler worker can load it at runtime without going through the bundler.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'node_modules', '@yowasp', 'clang', 'gen');
const dst = path.join(root, 'public', 'compiler');

// When the toolchain is served from a CDN, do not copy ~100 MiB into the build.
if (process.env.VITE_COMPILER_BASE) {
  console.log('[copy-compiler] VITE_COMPILER_BASE is set, using the remote toolchain');
  process.exit(0);
}

if (!fs.existsSync(src)) {
  console.warn('[copy-compiler] @yowasp/clang not installed yet, skipping');
  process.exit(0);
}
fs.mkdirSync(dst, { recursive: true });

// YoWASP's generated loader awaits each core module in sequence. Keep this local
// adaptation reproducible on install: independent modules can load in parallel.
function parallelModuleLoader(bundle) {
  return bundle.replace(/var modules = async \((\w+)\) => \(\{([\s\S]*?)\n\}\);/, (original, fetchName, body) => {
    const entries = [...body.matchAll(/"([^"]+\.wasm)": await \w+\(new URL\("\.\/([^"]+)", import\.meta\.url\)\)\.then\(compileWasmModule\)/g)];
    if (!entries.length || entries.length !== (body.match(/"[^"]+":/g) ?? []).length || entries.some((entry) => entry[1] !== entry[2])) return original;
    const names = entries.map((entry) => entry[1]);
    return `var modules = async (${fetchName}) => Object.fromEntries(await Promise.all(\n  ${JSON.stringify(names)}.map(async (name) => [name, await ${fetchName}(new URL('./' + name, import.meta.url)).then(compileWasmModule)])\n));`;
  });
}

for (const name of fs.readdirSync(src)) {
  const from = path.join(src, name);
  const to = path.join(dst, name);
  const st = fs.statSync(from);
  if (name === 'bundle.js') {
    const bundle = parallelModuleLoader(fs.readFileSync(from, 'utf8'));
    if (!fs.existsSync(to) || fs.readFileSync(to, 'utf8') !== bundle) {
      fs.writeFileSync(to, bundle);
      console.log('[copy-compiler]', name, '(parallel module loader)');
    }
    continue;
  }
  if (fs.existsSync(to) && fs.statSync(to).size === st.size) continue;
  fs.copyFileSync(from, to);
  console.log('[copy-compiler]', name, (st.size / 1048576).toFixed(1) + ' MiB');
}
