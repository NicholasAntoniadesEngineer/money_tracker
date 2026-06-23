/**
 * H-5 (CSP): redirect helper extracted from an inline <script> so index.html can
 * drop `script-src 'unsafe-inline'`. A <meta http-equiv="refresh"> is also present
 * as the no-JS fallback, so the redirect works either way.
 */
window.location.href = 'landing/index.html';
