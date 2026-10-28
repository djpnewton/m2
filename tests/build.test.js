import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { BUILD, buildMismatch } from '../src/build.js';

const server = fs.readFileSync(new URL('../scripts/nocache-server.py', import.meta.url), 'utf8');

test('the stamp is a non-empty token', () => {
  assert.match(BUILD, /^[\w.-]+$/, `BUILD is "${BUILD}"`);
});

test('a missing stamp means the host does not inject one, so nothing to compare', () => {
  // GitHub Pages serves index.html as committed, with no meta tag.
  assert.equal(buildMismatch(undefined, BUILD), false);
  assert.equal(buildMismatch('', BUILD), false);
});

test('a matching stamp is fine and a different one is not', () => {
  assert.equal(buildMismatch(BUILD, BUILD), false);
  assert.equal(buildMismatch('2026-01-01.1', BUILD), true);
});

test('the dev server injects the stamp from the same module the page imports', () => {
  // The check only works if the server reads BUILD from src/build.js rather than
  // carrying its own copy.
  assert.match(server, /src', 'build\.js/);
  assert.match(server, /BUILD = '\(\[\^'\]\+\)'/);
  assert.match(server, /name="build"/);
});
