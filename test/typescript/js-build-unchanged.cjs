const assert = require('assert');
const { init, parse } = require('./_harness.cjs');

// The TS build must be a strict superset of the JS build: every plain-JS input
// produces the same imports/exports it always did, with tp === false. This is
// also the drift guard for the reader duplicated between src/lexer.ts and
// src/lexer-ts.ts.
suite('TS build is a superset of the JS build', () => {
  setup(async () => await init);

  test('plain imports report tp false', () => {
    const [imports] = parse(`import a from 'x';\nimport { b } from 'y';\nimport * as c from 'z';`);
    assert.deepStrictEqual(imports.map(i => i.n), ['x', 'y', 'z']);
    assert.deepStrictEqual(imports.map(i => i.tp), [false, false, false]);
  });

  test('dynamic import and import.meta report tp false', () => {
    const [imports] = parse(`import('a'); import.meta.url;`);
    assert.deepStrictEqual(imports.map(i => i.tp), [false, false]);
  });

  test('plain exports report tp false', () => {
    const [, exports] = parse(`export const a = 1, b = 2;\nexport { c } from 'm';\nexport default 1;`);
    assert.ok(exports.length >= 3);
    assert.ok(exports.every(e => e.tp === false));
  });

  test('import attributes still parse with tp false', () => {
    const [imports] = parse(`import x from 'm' with { type: 'json' };`);
    assert.strictEqual(imports[0].n, 'm');
    assert.deepStrictEqual(imports[0].at, [['type', 'json']]);
    assert.strictEqual(imports[0].tp, false);
  });

  test('facade and hasModuleSyntax are unchanged', () => {
    const [, , facade, hasModuleSyntax] = parse(`export * from 'a';`);
    assert.strictEqual(facade, true);
    assert.strictEqual(hasModuleSyntax, true);

    const [, , facade2] = parse(`console.log('side effect');`);
    assert.strictEqual(facade2, false);
  });

  test('every specifier exposes a boolean tp field', () => {
    const [imports, exports] = parse(`import { a } from 'm';\nexport const b = 1;`);
    assert.strictEqual(typeof imports[0].tp, 'boolean');
    assert.strictEqual(typeof exports[0].tp, 'boolean');
  });
});
