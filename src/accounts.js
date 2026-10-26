import { balanceSheets } from './model.js';

const fmt = (v) => v.toFixed(1);

/** Rows that make up M2 are flagged so the money stock is visible in the plumbing. */
const M2_ROWS = new Set(['Transaction deposits', 'Savings deposits', 'Currency']);

function sectorCard(sector, scale) {
  const total = sector.assets.reduce((a, r) => a + Math.max(0, r.value), 0);
  const rows = (list, side) =>
    list
      .filter((r) => Math.abs(r.value) > 0.05)
      .map((r) => {
        const width = Math.max(0, Math.min(100, (Math.abs(r.value) / scale) * 100));
        const inM2 = M2_ROWS.has(r.label);
        return `<li class="acct-row${inM2 ? ' in-m2' : ''}">
            <span class="acct-label">${r.label}${inM2 ? '<em class="m2-tag">M2</em>' : ''}</span>
            <span class="acct-bar ${side}"><i style="width:${width.toFixed(1)}%"></i></span>
            <span class="acct-value">${fmt(r.value)}</span>
          </li>`;
      })
      .join('');

  return `<div class="acct-card">
      <header>
        <h4>${sector.title}</h4>
        <span class="acct-total">${fmt(total)}</span>
      </header>
      <div class="acct-side">
        <p class="acct-side-label">Assets</p>
        <ul>${rows(sector.assets, 'asset')}</ul>
      </div>
      <div class="acct-side">
        <p class="acct-side-label">Liabilities${sector.netWorth !== null && sector.netWorth !== undefined ? ' &amp; equity' : ''}</p>
        <ul>${rows(sector.liabilities, 'liability')}</ul>
      </div>
      ${
        sector.netWorth !== null && sector.netWorth !== undefined
          ? `<p class="acct-net">Net worth <b>${fmt(sector.netWorth)}</b></p>`
          : ''
      }
    </div>`;
}

export function renderAccounts(container, state) {
  const sheets = balanceSheets(state);
  const all = [...sheets.rbnz.assets, ...sheets.banks.assets, ...sheets.private.assets];
  const scale = Math.max(...all.map((r) => Math.abs(r.value)), 1);

  container.innerHTML = `
    <div class="acct-grid">
      ${sectorCard(sheets.banks, scale)}
      ${sectorCard(sheets.rbnz, scale)}
      ${sectorCard(sheets.private, scale)}
    </div>
    <p class="acct-footnote">
      All figures NZ$ billions. Rows tagged <em class="m2-tag">M2</em> are the components of the money
      stock. The Reserve Bank's equity line is the residual that makes its balance sheet balance.
    </p>`;
}
