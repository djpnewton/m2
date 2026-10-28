import { boot } from './ui.js?cache-tag=1';

/**
 * If boot throws, the page would otherwise be a blank shell and a stack trace in
 * the console. Put the message on the page instead.
 */
function reportFatal(error) {
  console.error(error);
  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText = [
    'position:fixed',
    'inset:auto 0 0 0',
    'z-index:9999',
    'padding:14px 18px',
    'background:#b91c1c',
    'color:#fff',
    'font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif',
    'box-shadow:0 -2px 12px rgba(0,0,0,.25)',
  ].join(';');
  banner.innerHTML =
    '<b>This page failed to start.</b> ' +
    '<span style="opacity:.75">' +
    String(error && error.message ? error.message : error).replace(/</g, '&lt;') +
    '</span>';
  document.body.appendChild(banner);
}

try {
  boot();
} catch (error) {
  reportFatal(error);
}
