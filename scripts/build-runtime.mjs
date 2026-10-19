// Builds the runtime pieces that get linked into every program compiled in the browser:
//   public/runtime/libdevcpp_eh.a   C++ exception support (libc++abi + libunwind for wasm EH)
//   public/runtime/devcpp_crt.o     Win32 console / conio / system() emulation
//   public/runtime/devcpp_cxxrt.o   MinGW style "terminate called after throwing..." handler
//   public/runtime/include/...      windows.h, conio.h, bits/stdc++.h, devcpp_compat.h
// It uses the same WebAssembly clang that runs in the browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClang, runLLVM } from '@yowasp/clang';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'public', 'runtime');
fs.mkdirSync(out, { recursive: true });

function tree(dir) {
  const t = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    t[e.name] = e.isDirectory() ? tree(p) : fs.readFileSync(p);
  }
  return t;
}

let stderr = '';
const opts = { stderr: (b) => { if (b) stderr += new TextDecoder().decode(b); } };
async function run(args, files) {
  stderr = '';
  try {
    return await runClang(args, files, opts);
  } catch (e) {
    console.error(stderr);
    throw e;
  }
}

// 1. exception runtime
const eh = { src: tree(path.join(root, 'vendor', 'llvm-eh')) };
const ehFlags = ['-O2', '-fwasm-exceptions', '-c', '-DNDEBUG', '-D_LIBCXXABI_BUILDING_LIBRARY', '-D_LIBCPP_BUILDING_LIBRARY',
  '-DLIBCXXABI_USE_LLVM_UNWINDER', '-D_LIBCXXABI_HAS_NO_THREADS', '-D_LIBCPP_HAS_NO_THREADS', '-D_LIBUNWIND_HIDE_SYMBOLS',
  '-Isrc/libcxxabi/include', '-Isrc/libcxxabi/src', '-Isrc/libcxx/src', '-Isrc/libunwind/include', '-Isrc/libunwind/src'];
const objs = {};
for (const [lang, std, file, obj] of [
  ['clang++', 'c++20', 'src/libcxxabi/src/cxa_exception.cpp', 'cxa_exception.o'],
  ['clang++', 'c++20', 'src/libcxxabi/src/cxa_personality.cpp', 'cxa_personality.o'],
  ['clang', 'c11', 'src/libunwind/src/Unwind-wasm.c', 'unwind_wasm.o'],
]) {
  const r = await run([lang, ...ehFlags, '-std=' + std, file, '-o', obj], eh);
  objs[obj] = r[obj];
  console.log('built', obj);
}
const ar = await runLLVM(['ar', 'rcs', 'libdevcpp_eh.a', ...Object.keys(objs)], objs, opts);
fs.writeFileSync(path.join(out, 'libdevcpp_eh.a'), ar['libdevcpp_eh.a']);

// 2. Win32 / conio emulation
const rt = { runtime: tree(path.join(root, 'runtime')) };
{
  const r = await run(['clang', '-O2', '-c', '-D_WASI_EMULATED_PROCESS_CLOCKS', '-Iruntime/include', 'runtime/src/devcpp_crt.c', '-o', 'devcpp_crt.o'], rt);
  fs.writeFileSync(path.join(out, 'devcpp_crt.o'), r['devcpp_crt.o']);
  console.log('built devcpp_crt.o');
}
{
  const r = await run(['clang++', '-O2', '-c', '-fwasm-exceptions', 'runtime/src/devcpp_cxxrt.cpp', '-o', 'devcpp_cxxrt.o'], rt);
  fs.writeFileSync(path.join(out, 'devcpp_cxxrt.o'), r['devcpp_cxxrt.o']);
  console.log('built devcpp_cxxrt.o');
}

// 3. headers
const incOut = path.join(out, 'include');
fs.rmSync(incOut, { recursive: true, force: true });
fs.cpSync(path.join(root, 'runtime', 'include'), incOut, { recursive: true });

// 4. manifest
const files = [];
const walk = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
    else if (e.name !== 'manifest.json') files.push(r);
  }
};
walk(out, '');
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ version: Date.now(), files }, null, 1));
console.log('runtime ready:', files.length, 'files');
