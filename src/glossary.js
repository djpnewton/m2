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

export const GLOSSARY = {
  'taylor-rule': {
    title: 'Taylor rule',
    body: 'A formula for setting the policy rate from the state of the economy. It raises the rate when inflation is above target or demand is above potential, and cuts it when the reverse holds. Proposed by John Taylor in 1993; this model uses a minimal version with equal weights on the inflation gap and the output gap.',
    wikipedia: 'https://en.wikipedia.org/wiki/Taylor_rule',
  },
  qt: {
    title: 'Quantitative tightening',
    body: 'The reverse of asset purchases. Bonds are sold back into the market, or allowed to mature without reinvestment, which drains settlement cash out of the banking system.',
    wikipedia: 'https://en.wikipedia.org/wiki/Quantitative_tightening',
  },
  'settlement-cash': {
    title: 'Settlement cash',
    body: 'Balances banks hold in their accounts at the Reserve Bank to settle payments with each other and with the Crown. New Zealand has had no reserve requirement since 1985, so the Reserve Bank supplies whatever is demanded.',
    wikipedia: 'https://en.wikipedia.org/wiki/Bank_reserves',
  },
  'money-multiplier': {
    title: 'Money multiplier',
    body: 'M2 divided by the monetary base. An arithmetic ratio rather than a causal one: it falls whenever reserves are created faster than the money stock, which is what happens during asset purchases.',
    wikipedia: 'https://en.wikipedia.org/wiki/Money_multiplier',
  },
  'core-funding-ratio': {
    title: 'Core funding ratio',
    body: 'A Reserve Bank liquidity requirement: a minimum share of a bank lending must be funded by core funding, meaning equity, long-dated wholesale funding, and retail term deposits with a year or more still to run.',
  },
  'funding-for-lending': {
    title: 'Funding for Lending Programme',
    body: 'The Reserve Bank lending cheaply to banks against collateral in order to lower their funding costs. It creates settlement cash at once but deposits only later: cheaper funding lets banks cut lending rates, which raises credit demand, and lending is what creates deposits. The chain works, but weakly — a large facility moves M2 far less than an equivalent bond purchase.',
  },
  lvr: {
    title: 'Loan-to-value ratio',
    body: 'How much a bank will lend relative to the value of the property securing it. Reserve Bank restrictions on high-LVR lending are a macroprudential tool: they slow credit without moving the policy rate.',
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
    body: 'A rule requiring banks to hold a minimum share of their deposits as reserves. New Zealand removed compulsory reserves in 1985, which is why reserves here are an outcome of central bank operations rather than a limit on lending.',
    wikipedia: 'https://en.wikipedia.org/wiki/Reserve_requirement',
  },
};

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
