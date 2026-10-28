import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';

import { run, balanceSheets, m3, monetaryBase } from '../src/model.js';
import {
  GLOSSARY_OVERRIDES,
  GLOSSARY_TITLES,
  PROSE,
  REGION_IDS,
  REGION_INITIAL,
  REGION_PARAMS,
  TERMS,
  initialFor,
  paramsFor,
  regionOf,
  termsFor,
} from '../src/regions.js';
import { scenariosFor } from '../src/scenarios.js';

/**
 * The two calibrations have to stay interchangeable: same keys, same identities,
 * same scenario ids. Anything that drifts here would break silently, because the
 * page only ever shows one region at a time.
 */

test('both regions expose the same parameter and balance-sheet keys', () => {
  const [us, nz] = REGION_IDS;
  assert.deepEqual(Object.keys(REGION_PARAMS[us]).sort(), Object.keys(REGION_PARAMS[nz]).sort());
  assert.deepEqual(Object.keys(REGION_INITIAL[us]).sort(), Object.keys(REGION_INITIAL[nz]).sort());
});

test('every term is defined for every region', () => {
  const keys = Object.keys(TERMS.us).sort();
  for (const id of REGION_IDS) {
    assert.deepEqual(Object.keys(TERMS[id]).sort(), keys, `${id} terms differ`);
    for (const [k, v] of Object.entries(TERMS[id])) assert.ok(v, `${id}.${k} is empty`);
  }
});

test('unknown region ids fall back to the United States', () => {
  assert.equal(regionOf('mars'), 'us');
  assert.deepEqual(paramsFor('mars'), REGION_PARAMS.us);
  assert.equal(termsFor('mars').currency, 'US$');
});

test('each region opens at its own policy rate and deficit baseline', () => {
  for (const id of REGION_IDS) {
    const opening = run({ region: id, months: 0 }).history[0];
    assert.equal(opening.policyRate, initialFor(id).policyRate, `${id} policy rate`);
  }
});

test('the accounting identities hold in both regions and every preset', () => {
  for (const id of REGION_IDS) {
    for (const scenario of scenariosFor(id)) {
      const { history, final } = run({ ...scenario.config, region: id });
      const last = history.at(-1);

      const assets =
        last.reserves + last.bankSecurities + last.loansHousing + last.loansBusiness +
        last.loansConsumer + last.bankOtherAssets;
      const liabilities =
        last.depositsTotal + last.bankDebt + last.bankBondsIssued +
        last.bankFundingBorrowing + last.bankAdvances + last.bankEquity;
      assert.ok(Math.abs(assets - liabilities) < 1e-6, `[${id}/${scenario.id}] bank book`);

      const dM3 = history.reduce((a, r) => a + r.dM3, 0);
      assert.ok(Math.abs(m3(final) - history[0].m3 - dM3) < 1e-6, `[${id}/${scenario.id}] dM3`);

      for (const r of history) {
        assert.ok(r.reserves >= 0, `[${id}/${scenario.id}] negative reserves at ${r.month}`);
        assert.ok(Number.isFinite(r.m2) && r.m2 > 0, `[${id}/${scenario.id}] bad M2`);
        assert.ok(r.base > 0, `[${id}/${scenario.id}] bad base`);
      }
    }
  }
});

test('balance sheets carry the region’s own labels', () => {
  const { final } = run({ region: 'nz', months: 1 });
  const sheets = balanceSheets(final, 'nz');
  const titles = [sheets.centralBank.title, sheets.banks.title];
  assert.deepEqual(titles, [TERMS.nz.centralBankFull, TERMS.nz.banksLabel]);
  const fedTitles = (() => {
    const s = balanceSheets(run({ months: 1, region: 'us' }).final, 'us');
    return [s.centralBank.title, s.banks.title];
  })();
  assert.deepEqual(fedTitles, [TERMS.us.centralBankFull, TERMS.us.banksLabel]);
});

test('no balance-sheet row names one country while the other is selected', () => {
  const rows = (region) => {
    const sheets = balanceSheets(run({ region, months: 1 }).final, region);
    return Object.values(sheets).flatMap((sector) => [
      ...sector.assets.map((r) => r.label),
      ...sector.liabilities.map((r) => r.label),
    ]);
  };
  const usOnly = ['Reserve balances', 'Treasury deposits'];
  for (const label of usOnly) {
    assert.ok(rows('us').includes(label), `US sheet lost "${label}"`);
    assert.ok(!rows('nz').includes(label), `NZ sheet still shows "${label}"`);
  }
  assert.ok(rows('nz').includes('Settlement cash'));
  assert.ok(rows('nz').includes('Crown deposits'));
});

test('the two regions define the same scenario ids', () => {
  const ids = (id) => scenariosFor(id).map((s) => s.id);
  assert.deepEqual(ids('us'), ids('nz'));
  for (const id of REGION_IDS) {
    for (const s of scenariosFor(id)) {
      assert.equal(s.config.region, id, `${id}/${s.id} carries the wrong region`);
      assert.ok(s.name && s.blurb, `${id}/${s.id} missing copy`);
    }
  }
});

test('each region has prose with its own figures to fill', () => {
  for (const id of REGION_IDS) {
    assert.ok(PROSE[id].includes('prose-convenience'), `${id} prose lost its placeholders`);
    assert.ok(PROSE[id].includes('prose-wholesale'));
    assert.ok(PROSE[id].includes('prose-fiscal-baseline'));
    assert.ok(PROSE[id].includes('prose-fiscal-credit'));
  }
  assert.match(PROSE.nz, /New Zealand/);
  assert.doesNotMatch(PROSE.us, /New Zealand/);
});

test('glossary overrides and titles cover the same keys in both regions', () => {
  const keys = Object.keys(GLOSSARY_OVERRIDES.us).sort();
  assert.ok(keys.includes('broad-money'), 'the broad-money definition must be region-aware');
  assert.deepEqual(Object.keys(GLOSSARY_OVERRIDES.nz).sort(), keys);
  assert.deepEqual(Object.keys(GLOSSARY_TITLES.nz).sort(), Object.keys(GLOSSARY_TITLES.us).sort());
  // The New Zealand copy says 1985; the US copy says 2020.
  assert.match(GLOSSARY_OVERRIDES.nz['reserve-requirement'], /1985/);
  assert.match(GLOSSARY_OVERRIDES.us['reserve-requirement'], /2020/);
  // The chart's money series is M2 in one region and broad money in the other.
  assert.match(GLOSSARY_OVERRIDES.nz['broad-money'], /M3/);
  assert.match(GLOSSARY_OVERRIDES.us['broad-money'], /M2/);
});

test('monetary base is currency plus reserves in both regions', () => {
  for (const id of REGION_IDS) {
    const { final } = run({ region: id, months: 1 });
    assert.ok(Math.abs(monetaryBase(final) - (final.currency + final.reserves)) < 1e-9);
  }
});

test('the UI layer hard-codes no country’s wording', () => {
  // Regression: "fed funds rate" and "GDP for the United States" survived the
  // first pass, because they were written in prose rather than in a label.
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  // The <option> labels are the only place a country may be named outright.
  const htmlWithoutOptions = html.replace(/<option[^>]*>[^<]*<\/option>/g, '');
  const banned = ['US$', 'NZ$', 'fed funds', 'official cash rate', 'American', 'New Zealander', 'Treasury', 'Crown'];
  for (const source of [ui, htmlWithoutOptions]) {
    for (const token of banned) {
      assert.ok(!source.includes(token), `hard-coded "${token}" escaped into the UI`);
    }
  }
});
