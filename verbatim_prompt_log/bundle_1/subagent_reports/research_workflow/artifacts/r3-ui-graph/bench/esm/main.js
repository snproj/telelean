import { v } from './dep.js';
const r = { staticImport: v === 42 };
try { const m = await import('./lazy.js'); r.dynamicImport = m.lazy === 7; } catch (e) { r.dynamicImport = 'blocked: ' + e.message.slice(0, 60); }
await fetch('/result', { method: 'POST', body: JSON.stringify({ label: document.title, ...r }) });
