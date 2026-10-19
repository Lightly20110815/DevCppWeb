import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// SharedArrayBuffer (used to let a running console program block on keyboard input)
// requires a cross-origin isolated page.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// When the toolchain is served from a CDN, do not ship the local copy in dist/.
function dropRemoteCompiler(remote: string): Plugin {
  return {
    name: 'drop-remote-compiler',
    apply: 'build',
    closeBundle() {
      if (!remote) return;
      fs.rmSync(path.resolve('dist/compiler'), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  const remote = process.env.VITE_COMPILER_BASE ?? loadEnv(mode, process.cwd(), '').VITE_COMPILER_BASE ?? '';

  return {
    base: './',
    plugins: [react(), dropRemoteCompiler(remote)],
    // The WASI shim is first imported by the runner worker. Discover it at startup
    // so starting the first program cannot cause a dependency-optimizer page reload.
    optimizeDeps: { include: ['@bjorn3/browser_wasi_shim'] },
    server: { headers: isolation },
    preview: { headers: isolation },
    worker: { format: 'es' },
    build: { target: 'es2022', chunkSizeWarningLimit: 4096 },
  };
});
