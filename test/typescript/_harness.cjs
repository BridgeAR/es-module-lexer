// Shared loader for the TypeScript-aware build. The `test:ts` chomp task runs
// these suites with TS=1; the WASM build under test is dist/lexer.ts.js.
let parseTs;

const init = (async () => {
  if (parseTs) return;
  const m = await import('../../dist/lexer.ts.js');
  await m.initTs;
  parseTs = m.parseTs;
})();

module.exports = {
  init,
  parse: (...args) => parseTs(...args),
  names: (list) => list.map(entry => entry.n),
  typeFlags: (list) => list.map(entry => entry.tp),
};
