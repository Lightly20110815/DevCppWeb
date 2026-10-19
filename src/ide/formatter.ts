import { WASI } from '@bjorn3/browser_wasi_shim';
import { settings } from './config';
import type { FormatterOpts } from './config';
import { ide } from './ide';
import { MessageDlg } from '../os/messagebox';

interface AStyleExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  alloc_buffer: (size: number) => number;
  free_buffer: (ptr: number) => void;
  wastyle: (code: number, options: number, output: number) => number;
}
let ready: Promise<AStyleExports> | null = null;

function load() {
  return ready ??= (async () => {
    try {
      const response = await fetch(new URL('formatter/astyle.wasm', new URL(import.meta.env.BASE_URL, location.href)));
      if (!response.ok) throw new Error(`AStyle: HTTP ${response.status}`);
      const wasi = new WASI([], [], []);
      const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), { wasi_snapshot_preview1: wasi.wasiImport });
      wasi.initialize(instance as unknown as Parameters<WASI['initialize']>[0]);
      return instance.exports as AStyleExports;
    } catch (error) { ready = null; throw error; }
  })();
}

export function formatterCommand(options: FormatterOpts) {
  const styles = ['', 'allman', 'java', 'kr', 'stroustrup', 'whitesmith', 'banner', 'gnu', 'linux', 'horstmann', 'otbs', 'pico', 'lisp'];
  const indents = ['', 'spaces', 'tab', 'force-tab', 'force-tab-x'];
  const flags = [];
  if (styles[options.BracketStyle]) flags.push(`--style=${styles[options.BracketStyle]}`);
  if (indents[options.IndentStyle]) flags.push(`--indent=${indents[options.IndentStyle]}=${options.TabWidth}`);
  for (const [key, flag] of Object.entries({ IndentClasses: 'classes', IndentSwitches: 'switches', IndentCases: 'cases', IndentNamespaces: 'namespaces', IndentLabels: 'labels', IndentPreprocessor: 'preproc-block' })) if (options[key as keyof FormatterOpts]) flags.push(`--indent-${flag}`);
  if (options.ModifyMaxLineLength) flags.push(`--max-code-length=${options.MaxLineLength}`);
  return flags.join(' ');
}

export async function formatCode(code: string, command = settings.formatter.CustomCommand || formatterCommand(settings.formatter)) {
  const wasm = await load();
  const encoder = new TextEncoder();
  const source = encoder.encode(code), options = encoder.encode(command);
  const buffer = wasm.alloc_buffer(source.length + options.length + 6);
  if (!buffer) throw new Error('AStyle could not allocate its input buffer.');
  let output = 0;
  try {
    const input = buffer + 4, flags = input + source.length + 1;
    let memory = new Uint8Array(wasm.memory.buffer);
    memory.set(source, input); memory[input + source.length] = 0;
    memory.set(options, flags); memory[flags + options.length] = 0;
    const success = wasm.wastyle(input, flags, buffer);
    output = new DataView(wasm.memory.buffer).getUint32(buffer, true);
    memory = new Uint8Array(wasm.memory.buffer);
    let end = output;
    while (end < memory.length && memory[end]) end++;
    const result = output ? new TextDecoder().decode(memory.subarray(output, end)) : '';
    if (!success) throw new Error(result || 'AStyle could not format the source.');
    return result;
  } finally { if (output) wasm.free_buffer(output); wasm.free_buffer(buffer); }
}

export async function formatCurrentFile() {
  const editor = ide.getEditor();
  if (!editor || editor.readOnly) return;
  const document = editor.view.state.doc;
  const selection = editor.view.state.selection.main;
  const from = selection.empty ? 0 : selection.from, to = selection.empty ? document.length : selection.to;
  const source = editor.view.state.sliceDoc(from, to);
  try {
    const formatted = await formatCode(source);
    if (!ide.allEditors.includes(editor) || editor.readOnly || editor.view.state.doc !== document) return;
    const insert = editor.view.state.toText(formatted);
    editor.view.dispatch({ changes: { from, to, insert }, selection: { anchor: from, head: from + insert.length }, userEvent: 'input.format', scrollIntoView: true });
    ide.activate(editor);
  } catch (error) { await MessageDlg(String((error as Error).message ?? error), 'mtError', ['mbOK']); }
}
