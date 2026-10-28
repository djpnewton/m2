/**
 * Inline glossary.
 *
 * Jargon in the page is rendered as a `<button class="term" data-term="...">`
 * which opens a small popover with a plain-language definition and, where a
 * canonical article exists, a link to Wikipedia.
 *
 * Everything here is local: the page still works with no network. The Wikipedia
 * link is only fetched if the reader chooses to follow it.
 */

import { glossaryOverridesFor, glossaryTitlesFor } from './regions.js?cache-tag=1';

export const GLOSSARY = {
  'taylor-rule': {
    title: 'Taylor rule',
    body: 'A formula for setting the policy rate from the state of the economy. It raises the rate when inflation is above target or demand is above potential, and cuts it when the reverse holds. Proposed by John Taylor in 1993; this model uses a minimal version with equal weights on the inflation gap and the output gap.',
    wikipedia: 'https://en.wikipedia.org/wiki/Taylor_rule',
  },
  qt: {
    title: 'Quantitative tightening',
    body: 'The reverse of asset purchases. Bonds are sold back into the market, or allowed to mature without reinvestment, which drains reserve balances out of the banking system.',
    wikipedia: 'https://en.wikipedia.org/wiki/Quantitative_tightening',
  },
  'reserve-balances': {
    title: 'Reserve balances',
    body: 'Balances banks hold in their accounts at the Fed to settle payments with each other, with the Treasury and with the Fed itself. Reserve requirements have been zero since March 2020 and the Fed pays interest on these balances, so they are supplied on demand: an outcome of policy operations, not a limit on lending.',
    wikipedia: 'https://en.wikipedia.org/wiki/Bank_reserves',
  },
  'broad-money': {
    title: 'Broad money',
    body: 'A money aggregate wider than M2: currency and deposits plus the near-money claims that banks and money-market funds owe — term deposits, certificates of deposit, repos, and in some definitions money-market fund units. Countries publish it under different names (M3, M4, "broad money"), so where the boundary sits is a statistical convention rather than an economic one.',
    wikipedia: 'https://en.wikipedia.org/wiki/Money_supply',
  },
  'money-multiplier': {
    title: 'Money multiplier',
    body: 'M2 divided by the monetary base. An arithmetic ratio rather than a causal one: it falls whenever reserves are created faster than the money stock, which is what happens during asset purchases.',
    wikipedia: 'https://en.wikipedia.org/wiki/Money_multiplier',
  },
  'liquidity-coverage-ratio': {
    title: 'Liquidity coverage ratio',
    body: 'A post-2008 rule requiring large banks to hold enough high-quality liquid assets — reserves and Treasuries — to survive thirty days of stressed outflows. It makes liquid assets worth holding, which is why a bank competes for stable deposits rather than treating them as a pile of money waiting to be lent.',
    wikipedia: 'https://en.wikipedia.org/wiki/Liquidity_coverage_ratio',
  },
  'funding-facility': {
    title: 'Central bank funding facility',
    body: 'The Fed lending cheaply to banks against collateral — the discount window, and the Bank Term Funding Program in 2023. It creates reserves at once but deposits only later: cheaper funding lets banks cut lending rates, which raises credit demand, and lending is what creates deposits. The chain works, but weakly — a large facility moves M2 far less than an equivalent bond purchase.',
    wikipedia: 'https://en.wikipedia.org/wiki/Discount_window',
  },
  lvr: {
    title: 'Loan-to-value ratio',
    body: 'How much a bank will lend relative to the value of the property securing it. Caps on high-LTV lending, and the qualified-mortgage rules that cap debt-to-income, are macroprudential tools: they slow credit without moving the policy rate.',
    wikipedia: 'https://en.wikipedia.org/wiki/Loan-to-value_ratio',
  },
  dti: {
    title: 'Debt-to-income limit',
    body: 'A cap on how much a borrower may owe relative to their income. Like LVR limits, it constrains credit demand directly rather than through the price of credit.',
    wikipedia: 'https://en.wikipedia.org/wiki/Debt-to-income_ratio',
  },
  'term-premium': {
    title: 'Term premium',
    body: 'The extra yield investors demand for holding a longer-dated bond rather than repeatedly rolling over short-term debt. Central bank purchases of bonds compress it, which lowers wholesale funding costs without any change to the policy rate.',
    wikipedia: 'https://en.wikipedia.org/wiki/Term_premium',
  },
  'risk-weighted-capital': {
    title: 'Risk-weighted capital',
    body: 'A bank equity measured against its assets weighted by how risky they are. It is the binding constraint on how much a bank can lend in this model, which is why a capital shortfall throttles credit.',
    wikipedia: 'https://en.wikipedia.org/wiki/Capital_adequacy_ratio',
  },
  'wholesale-funding': {
    title: 'Wholesale funding',
    body: 'Money banks borrow from markets and other financial institutions rather than from depositors. Usually dearer than retail deposits, and quicker to disappear when confidence falls.',
    wikipedia: 'https://en.wikipedia.org/wiki/Wholesale_funding',
  },
  'reserve-requirement': {
    title: 'Reserve requirement',
    body: 'A rule requiring banks to hold a minimum share of their deposits as reserves. US requirements went to zero in March 2020, which is why reserves here are an outcome of central bank operations rather than a limit on lending.',
    wikipedia: 'https://en.wikipedia.org/wiki/Reserve_requirement',
  },
};

/**
 * Swap in the country-specific wording. Both regions define every override, so
 * switching back and forth is lossless.
 */
export function setGlossaryRegion(id = 'us') {
  const bodies = glossaryOverridesFor(id);
  const titles = glossaryTitlesFor(id);
  for (const [key, body] of Object.entries(bodies)) {
    if (GLOSSARY[key] && body) GLOSSARY[key] = { ...GLOSSARY[key], body };
  }
  for (const [key, title] of Object.entries(titles)) {
    if (GLOSSARY[key] && title) GLOSSARY[key] = { ...GLOSSARY[key], title };
  }
}

/**
 * Render a glossary term as a button, for use inside template strings.
 * Falls back to plain text rather than throwing, so a typo cannot blank the page.
 */
export function defineTerm(key, label) {
  const entry = GLOSSARY[key];
  if (!entry) {
    console.warn(`[glossary] unknown term: ${key}`);
    return label ?? key;
  }
  return `<button type="button" class="term" data-term="${key}" aria-expanded="false">${
    label ?? entry.title
  }</button>`;
}

/**
 * Wire up the popover. Delegated on the document, so it keeps working for the
 * controls panel, which is re-rendered on every scenario change.
 */
export function mountGlossary(doc = document) {
  let popover = null;
  let active = null;

  const ensurePopover = () => {
    if (popover) return popover;
    popover = doc.createElement('div');
    popover.className = 'term-pop';
    popover.hidden = true;
    popover.setAttribute('role', 'dialog');
    doc.body.appendChild(popover);
    return popover;
  };

  const close = (refocus = true) => {
    if (!popover || popover.hidden) return;
    popover.hidden = true;
    popover.innerHTML = '';
    if (active) {
      active.setAttribute('aria-expanded', 'false');
      if (refocus) active.focus();
    }
    active = null;
  };

  const place = (trigger) => {
    const anchor = trigger.getBoundingClientRect();
    const box = popover.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - box.width - margin));
    let top = anchor.bottom + 6;
    if (top + box.height > window.innerHeight - margin) {
      top = Math.max(margin, anchor.top - box.height - 6);
    }
    // Never let the panel run off the bottom on a short viewport.
    top = Math.max(margin, Math.min(top, window.innerHeight - box.height - margin));
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  };

  const open = (trigger) => {
    const entry = GLOSSARY[trigger.dataset.term];
    if (!entry) return;
    ensurePopover();

    if (active === trigger && !popover.hidden) {
      close();
      return;
    }
    if (active) active.setAttribute('aria-expanded', 'false');

    active = trigger;
    trigger.setAttribute('aria-expanded', 'true');

    popover.innerHTML = `
      <p class="term-pop-title">${entry.title}</p>
      <p class="term-pop-body">${entry.body}</p>
      <div class="term-pop-foot">
        ${
          entry.wikipedia
            ? `<a href="${entry.wikipedia}" target="_blank" rel="noopener noreferrer">Wikipedia<span aria-hidden="true"> ↗</span></a>`
            : '<span></span>'
        }
        <button type="button" class="term-pop-close" data-term-close>Close</button>
      </div>`;
    popover.hidden = false;
    place(trigger);
    popover.querySelector('[data-term-close]').focus();
  };

  doc.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-term]');
    if (trigger) {
      // Keep the click away from any enclosing <label>, which would otherwise
      // focus or toggle the control the term is annotating.
      event.preventDefault();
      event.stopPropagation();
      open(trigger);
      return;
    }
    if (event.target.closest?.('[data-term-close]')) {
      close();
      return;
    }
    if (popover && !popover.hidden && !event.target.closest?.('.term-pop')) close(false);
  });

  // Capture phase: Escape must close the popover even if focus sits somewhere
  // that stops the event before it bubbles back up to the document.
  doc.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && popover && !popover.hidden) {
        event.preventDefault();
        close();
      }
    },
    true,
  );

  // Dismiss on page scroll, but not when the reader scrolls inside the popover
  // itself (which can be taller than a short viewport).
  window.addEventListener(
    'scroll',
    (event) => {
      if (!popover || popover.hidden) return;
      if (event.target === doc || !popover.contains(event.target)) close(false);
    },
    true,
  );
  window.addEventListener('resize', () => close(false));

  return { close };
}
