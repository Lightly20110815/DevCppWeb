# LLVM exception handling runtime sources

Taken from the LLVM project (tag `llvmorg-21.1.0`), licensed under the Apache License v2.0
with LLVM Exceptions (see the header of every file).

The libc++abi shipped with `@yowasp/clang` is built without exception support, so
`scripts/build-runtime.mjs` compiles these files with `-fwasm-exceptions` into
`public/runtime/libdevcpp_eh.a`.

Local change: `libunwind/src/Unwind-wasm.c` additionally defines the `__cpp_exception`
tag, which newer versions of wasm-ld no longer synthesize.
