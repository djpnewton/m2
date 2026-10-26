import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { GLOSSARY, defineTerm } from '../src/glossary.js';

const sources = ['../index.html', '../src/ui.js'].map((path) => ({
  path,
  text: fs.readFileSync(new URL(path, import.meta.url), 'utf8'),
}));

/** Every term referenced by a page or a template. */
function referencedTerms() {
  const found = new Set();
  for (const { text } of sources) {
    for (const m of text.matchAll(/data-term="([^"]+)"/g)) found.add(m[1]);
    for (const m of text.matchAll(/defineTerm\(\s*'([^']+)'/g)) found.add(m[1]);
  }
  return found;
}

test('every referenced term has a definition', () => {
  const used = referencedTerms();
  assert.ok(used.size > 0, 'expected the page to reference glossary terms');
  for (const key of used) {
    assert.ok(GLOSSARY[key], `"${key}" is referenced but missing from GLOSSARY`);
  }
});

test('every definition is actually used, so none rot', () => {
  const used = referencedTerms();
  for (const key of Object.keys(GLOSSARY)) {
    assert.ok(used.has(key), `GLOSSARY entry "${key}" is never displayed`);
  }
});

test('definitions are present and concise', () => {
  for (const [key, entry] of Object.entries(GLOSSARY)) {
    assert.ok(entry.title && entry.title.length < 40, `${key}: title missing or too long`);
    assert.ok(entry.body, `${key}: body missing`);
    assert.ok(entry.body.length >= 60, `${key}: body too short to be useful (${entry.body.length})`);
    assert.ok(entry.body.length <= 420, `${key}: body too long for a popover (${entry.body.length})`);
    assert.ok(!/[<>]/.test(entry.body), `${key}: body must be plain text, not markup`);
  }
});

test('wikipedia links are https and point at wikipedia', () => {
  for (const [key, entry] of Object.entries(GLOSSARY)) {
    if (entry.wikipedia === undefined) continue;
    assert.match(entry.wikipedia, /^https:\/\/en\.wikipedia\.org\/wiki\/[A-Za-z0-9_()%-]+$/, `${key}: odd url ${entry.wikipedia}`);
  }
});

test('defineTerm marks the term up as a button', () => {
  const html = defineTerm('taylor-rule', 'Taylor rule');
  assert.match(html, /^<button /);
  assert.match(html, /class="term"/);
  assert.match(html, /data-term="taylor-rule"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, />Taylor rule<\/button>$/);
});

test('defineTerm falls back to plain text for an unknown key', () => {
  // A typo must degrade to readable text, not throw and blank the controls panel.
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.equal(defineTerm('not-a-term', 'whatever'), 'whatever');
  } finally {
    console.warn = original;
  }
});
