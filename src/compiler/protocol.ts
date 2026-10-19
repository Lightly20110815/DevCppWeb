// Shared layout of the SharedArrayBuffer used between the console window and a running program.

export const CTL = {
  FLAG: 0, // set to 1 by the console when a response is ready
  RESULT: 1, // response value / byte count
  KEYS: 2, // number of pending key presses (for kbhit)
  SLEEP: 3, // never written: used as a sleep target for Atomics.wait
} as const;

export const CTL_INTS = 32;
export const KEYSTATE_OFFSET = CTL_INTS * 4;
export const DATA_OFFSET = KEYSTATE_OFFSET + 256;
export const DATA_SIZE = 64 * 1024;
export const SAB_SIZE = DATA_OFFSET + DATA_SIZE;

export interface RunRequest {
  type: 'run';
  wasm?: Uint8Array;
  module?: WebAssembly.Module;
  args: string[];
  env: string[];
  files: Record<string, Uint8Array>;
  sab: SharedArrayBuffer;
  exePath: string;
  title: string;
}

/** Windows NTSTATUS codes reported by ConsolePauser for crashed programs */
export const STATUS_ACCESS_VIOLATION = 0xc0000005;
export const STATUS_INTEGER_DIVIDE_BY_ZERO = 0xc0000094;
export const STATUS_INTEGER_OVERFLOW = 0xc0000095;
export const STATUS_STACK_OVERFLOW = 0xc00000fd;
export const STATUS_CONTROL_C_EXIT = 0xc000013a;
export const STATUS_ILLEGAL_INSTRUCTION = 0xc000001d;

export function trapToExitCode(e: unknown): number {
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  if (e instanceof RangeError || msg.includes('call stack') || msg.includes('stack overflow')) return STATUS_STACK_OVERFLOW;
  if (msg.includes('divide by zero') || msg.includes('remainder by zero')) return STATUS_INTEGER_DIVIDE_BY_ZERO;
  if (msg.includes('integer overflow')) return STATUS_INTEGER_OVERFLOW;
  if (msg.includes('out of bounds') || msg.includes('null function') || msg.includes('signature mismatch') || msg.includes('table index')) return STATUS_ACCESS_VIOLATION;
  if (msg.includes('unreachable')) return STATUS_ILLEGAL_INSTRUCTION;
  if (msg.includes('out of memory') || msg.includes('could not allocate')) return 3;
  return STATUS_ACCESS_VIOLATION;
}
