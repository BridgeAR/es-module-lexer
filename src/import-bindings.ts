import type { ImportBinding } from './lexer.bindings.js';

const bindingTypes = ['named', 'default', 'namespace', 'source'] as const;

export function readImportBindings (
  source: string,
  view: DataView,
  pointer: number,
  decode: (start: number, end: number) => string
): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  while (pointer !== 0) {
    const importStart = view.getInt32(pointer, true);
    const importEnd = view.getInt32(pointer + 4, true);
    const localStart = view.getUint32(pointer + 8, true);
    const localEnd = view.getUint32(pointer + 12, true);
    const flags = view.getUint32(pointer + 16, true);
    const kind = flags & 3;
    let importName: string | null;
    if (kind === 0) {
      const firstChar = source.charCodeAt(importStart);
      importName = firstChar === 34 || firstChar === 39
        ? decode(importStart + 1, importEnd - 1)
        : decode(importStart, importEnd);
    }
    else {
      importName = kind === 1 ? 'default' : null;
    }
    bindings.push({
      type: bindingTypes[kind], importName, localName: decode(localStart, localEnd),
      importNameStart: importStart, importNameEnd: importEnd, localStart, localEnd,
      typeOnly: !!(flags & 4)
    });
    pointer = view.getUint32(pointer + 20, true);
  }
  return bindings;
}
