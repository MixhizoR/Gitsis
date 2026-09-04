// ============================================================================
//  sanitize.test.js — XSS sanitization regression (Issue #69 / BP boelugu).
//  cleanRichText icin pure birim testler; HTML guvenlik vektorleri.
// ============================================================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanRichText } from '../src/sanitize.js';

test('cleanRichText: falsy girdi bos string doner', () => {
  assert.equal(cleanRichText(''), '');
  assert.equal(cleanRichText(null), '');
  assert.equal(cleanRichText(undefined), '');
});

test('cleanRichText: <script> etiketi tamamen kaldirilir', () => {
  const out = cleanRichText('Merhaba <script>alert("xss")</script>dunya');
  assert.equal(out.includes('<script'), false, 'script etiketi kalmamali');
  assert.equal(out.includes('alert('), false, 'script govdesi kalmamali');
  assert.ok(out.includes('Merhaba') && out.includes('dunya'));
});

test('cleanRichText: olay ozellikleri (onerror, onclick) kaldirilir', () => {
  const out = cleanRichText('<img src="x" onerror="alert(1)">');
  assert.equal(out.includes('onerror'), false);
  assert.equal(out.includes('alert('), false);
});

test("cleanRichText: javascript: sema URL'lerden temizlenir", () => {
  // allowedSchemes=[] + img yalniz data sema; javascript: img src olarak
  // verilirse exclusiveFilter img'i komple disc atar.
  const out = cleanRichText('<img src="javascript:alert(1)">');
  assert.equal(out.includes('javascript:'), false);
  assert.equal(out.includes('alert('), false);
});

test('cleanRichText: <a href="javascript:..."> temizlenir', () => {
  // <a> zaten allowed listesinde degil; tamamen kaldirilir.
  const out = cleanRichText('<a href="javascript:alert(1)">tikla</a>tiklanmaz');
  assert.equal(out.includes('href'), false);
  assert.equal(out.includes('javascript:'), false);
  assert.equal(out.includes('alert('), false);
});

test('cleanRichText: iframe tamamen kaldirilir', () => {
  const out = cleanRichText('text <iframe src="evil.com"></iframe> more');
  assert.equal(out.includes('<iframe'), false);
  assert.equal(out.includes('evil.com'), false);
});

test('cleanRichText: izinli etiketler (<b>, <i>, <u>, <strong>) korunur', () => {
  assert.equal(cleanRichText('<b>kalin</b>'), '<b>kalin</b>');
  assert.equal(cleanRichText('<i>italik</i>'), '<i>italik</i>');
  assert.equal(cleanRichText('<u>cizili</u>'), '<u>cizili</u>');
  assert.equal(cleanRichText('<strong>guclu</strong>'), '<strong>guclu</strong>');
});

test('cleanRichText: <br> void elementi korunur (self-closing olabilir)', () => {
  // sanitize-html void elementleri <br /> (XHTML) veya <br> uretebilir.
  const out = cleanRichText('sat1<br>sat2');
  assert.ok(out.includes('br'), `br korunmali, gelen: ${out}`);
  assert.ok(out.includes('sat1') && out.includes('sat2'));
});

test('cleanRichText: <ul>/<ol>/<li> liste korunur', () => {
  const out = cleanRichText('<ul><li>bir</li><li>iki</li></ul>');
  assert.ok(out.includes('<ul>'));
  assert.ok(out.includes('<li>bir</li>'));
  assert.ok(out.includes('<li>iki</li>'));
});

test('cleanRichText: <font color="red"> izinli (renk etiketi)', () => {
  const out = cleanRichText('<font color="red">kirmizi</font>');
  assert.ok(out.includes('color='));
  assert.ok(out.includes('kirmizi'));
});

test('cleanRichText: gomulu base64 PNG <img> korunur', () => {
  const b64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const out = cleanRichText(`<img src="${b64}" alt="dot">`);
  assert.ok(out.includes('data:image/png'), 'data URL korunmali');
  assert.ok(out.includes('alt="dot"'));
});

test("cleanRichText: harici URL'li <img> komple kaldirilir (exclusiveFilter)", () => {
  const out = cleanRichText('<img src="https://evil.com/x.png" alt="bad">');
  assert.equal(out.includes('evil.com'), false);
  assert.equal(out.includes('alt="bad"'), false);
});

test("cleanRichText: not-safe text input (string disi) String()'e cevrilir", () => {
  // null/undefined yukarida test edildi; sayi 0 "" doner.
  assert.equal(cleanRichText(0), '');
  // Duz metin guvenli sekilde korunur.
  assert.equal(cleanRichText(123), '123');
});
