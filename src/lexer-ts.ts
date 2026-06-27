import type { ExportSpecifier, ImportSpecifier } from './lexer';

// Type-only re-exports: erased by the compiler, so this entry never pulls the
// JavaScript build's wasm into a TypeScript consumer's bundle.
export type { ImportType, ImportSpecifier, ExportSpecifier, ParseError } from './lexer';

const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/**
 * Like `parse`, but understands erasable TypeScript syntax (the subset Node.js
 * type stripping accepts). Type-only imports and exports are reported with
 * `tp: true` rather than elided.
 *
 * The reader below mirrors `parse` in ./lexer.ts: the single-file build pipeline
 * inlines a different wasm per entry, so the two cannot share a runtime import
 * without pulling both wasm builds into every consumer. The cross-build
 * agreement test (test/typescript/js-build-unchanged.cjs) guards against drift.
 *
 * @param source TypeScript source code to lex.
 * @param name Optional source name used in the thrown `ParseError` message.
 * @returns Tuple of imports list, exports list, facade and hasModuleSyntax.
 */
export function parseTs (source: string, name = '@'): readonly [
  imports: ReadonlyArray<ImportSpecifier>,
  exports: ReadonlyArray<ExportSpecifier>,
  facade: boolean,
  hasModuleSyntax: boolean
] {
  if (!wasm)
    return initTs.then(() => parseTs(source)) as unknown as ReturnType<typeof parseTs>;

  const len = source.length + 1;

  const extraMem = (wasm.__heap_base.value || wasm.__heap_base) as number + len * 4 - wasm.memory.buffer.byteLength;
  if (extraMem > 0)
    wasm.memory.grow(Math.ceil(extraMem / 65536));

  const addr = wasm.sa(len - 1);
  (isLE ? copyLE : copyBE)(source, new Uint16Array(wasm.memory.buffer, addr, len));

  if (!wasm.parse())
    throw Object.assign(new Error(`Parse error ${name}:${source.slice(0, wasm.e()).split('\n').length}:${wasm.e() - source.lastIndexOf('\n', wasm.e() - 1)}`), { idx: wasm.e() });

  const imports: ImportSpecifier[] = [], exports: ExportSpecifier[] = [];
  while (wasm.ri()) {
    const s = wasm.is(), e = wasm.ie(), t = wasm.it(), a = wasm.ai(), d = wasm.id(), ss = wasm.ss(), se = wasm.se(), tp = !!wasm.itp();
    let n;
    if (wasm.ip())
      n = decode(source.slice(d === -1 ? s - 1 : s, d === -1 ? e + 1 : e));
    const at: Array<[string, string]> = [];
    wasm.rsa();
    while (wasm.ra()) {
      const aks = wasm.aks(), ake = wasm.ake(), avs = wasm.avs(), ave = wasm.ave();
      at.push([decodeIfQuoted(source.slice(aks, ake)), decodeIfQuoted(source.slice(avs, ave))]);
    }
    imports.push({ n, t, s, e, ss, se, d, a, at: at.length > 0 ? at : null, tp });
  }
  while (wasm.re()) {
    const s = wasm.es(), e = wasm.ee(), ls = wasm.els(), le = wasm.ele(), tp = !!wasm.etp();
    const n = decodeIfQuoted(source.slice(s, e));
    const ln = ls < 0 ? undefined : decodeIfQuoted(source.slice(ls, le));
    exports.push({
      s, e, ls, le,
      n, ln, tp,
    });
  }

  function decode (str: string) {
    try {
      return (0, eval)(str)
    }
    catch (e) {}
  }

  function decodeIfQuoted (str: string): string {
    if (!str) return str;
    const firstChar = str[0];
    if (firstChar === '"' || firstChar === "'")
      return decode(str) || str;
    return str;
  }

  return [imports, exports, !!wasm.f(), !!wasm.ms()];
}

function copyBE (src: string, outBuf16: Uint16Array) {
  const len = src.length;
  let i = 0;
  while (i < len) {
    const ch = src.charCodeAt(i);
    outBuf16[i++] = (ch & 0xff) << 8 | ch >>> 8;
  }
}

function copyLE (src: string, outBuf16: Uint16Array) {
  const len = src.length;
  let i = 0;
  while (i < len)
    outBuf16[i] = src.charCodeAt(i++);
}

let wasm: {
  __heap_base: {value: number} | number & {value: undefined};
  memory: WebAssembly.Memory;
  parse(): boolean;
  it(): number;
  ai(): number;
  e(): number;
  ee(): number;
  ele(): number;
  els(): number;
  es(): number;
  etp(): number;
  f(): boolean;
  ms(): boolean;
  id(): number;
  ie(): number;
  ip(): number;
  itp(): number;
  is(): number;
  re(): boolean;
  ri(): boolean;
  sa(utf16Len: number): number;
  se(): number;
  ss(): number;
  ra(): boolean;
  rsa(): void;
  aks(): number;
  ake(): number;
  avs(): number;
  ave(): number;
};

const getWasmBytes = () => (
  binary => typeof Buffer !== 'undefined'
    ? Buffer.from(binary, 'base64')
    : Uint8Array.from(atob(binary), x => x.charCodeAt(0))
)('WASM_BINARY_TS');

/**
 * Wait for initTs to resolve before calling `parseTs`.
 */
export const initTs = WebAssembly.compile(getWasmBytes())
.then(WebAssembly.instantiate)
.then(({ exports }) => { wasm = exports as typeof wasm; });

export const initTsSync = () => {
  if (wasm) {
    return;
  }
  const compiled = new WebAssembly.Module(getWasmBytes());
  wasm = new WebAssembly.Instance(compiled).exports as typeof wasm;
  return;
};
