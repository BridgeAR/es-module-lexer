const assert = require('node:assert/strict');

let parse;
const commonjs = !!process.env.CJS;
const minimal = !!process.env.MINIMAL;

suite('No string code generation', () => {
  suiteSetup(async () => {
    const lexer = commonjs
      ? require('../../dist/lexer.cjs')
      : await import(minimal ? '../../dist/lexer.minimal.js' : '../../dist/lexer.js');
    await lexer.init;
    parse = lexer.parse;
  });

  test('decodes module strings', () => {
    const cases = [
      [`import 'plain-specifier'`, 'plain-specifier'],
      [String.raw`import 'escaped\u002dspecifier'`, 'escaped-specifier'],
      [String.raw`import 'escaped\x2dspecifier'`, 'escaped-specifier'],
      [String.raw`import 'unicode\u{20204}'`, 'unicode𠈄'],
      ["import 'line\\\ncontinuation'", 'linecontinuation'],
      [String.raw`import 'nul\0character'`, 'nul\0character'],
      [String.raw`import 'quote\''`, "quote'"],
    ];

    for (const [source, expected] of cases) {
      const [imports] = parse(source);
      assert.strictEqual(minimal ? imports[0].n : imports[0].specifier, expected);
    }
  });

  test('rejects invalid module strings', () => {
    for (const source of [
      String.raw`import 'invalid\uZZ'`,
      String.raw`import 'invalid\u{}'`,
      String.raw`import 'invalid\u{110000}'`,
      String.raw`import 'invalid\01'`,
      String.raw`import 'invalid\8'`,
    ]) {
      assert.throws(() => parse(source), { message: /^Parse error / });
    }
  });
});
