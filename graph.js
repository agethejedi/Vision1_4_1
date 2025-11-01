// vision/graph.js
// Unified Graph API with legacy methods used by app.js
// Adds setHalo / clearHalos to drive the pulsing halo state.

///////////////////////
// Internal state
///////////////////////
const state = {
  container: null,
  data: { nodes: [], edges: [] },
  listeners: new Map(), // event -> Set<fn>
};

///////////////////////
// Event bus
///////////////////////
function on(evt, fn) {
  if (!state.listeners.has(evt)) state.listeners.set(evt, new Set());
  state.listeners.get(evt).add(fn);
}
function off(evt, fn) {
  const set = state.listeners.get(evt);
  if (set) set.delete(fn);
}
function emit(evt, payload) {
  const set = state.listeners.get(evt);
  if (set) for (const fn of set) { try { fn(payload); } catch {} }
}

///////////////////////
// Utilities
///////////////////////
function ensureContainer(el) {
  if (el) state.container = el;
  if (!state.container && typeof document !== 'undefined') {
    state.container =
      document.getElementById('graph') ||
      document.querySelector('[data-role="graph"]') ||
      document.querySelector('.graph'); // best-effort
  }
  return state.container;
}

// Try a few common attribute patterns to find a node by address
function findNodeEl(address, container) {
  if (!address) return null;
  const a = String(address).toLowerCase();
  const c = ensureContainer(container);
  if (!c) return null;
  return (
    c.querySelector(`[data-address-i="${a}"]`) ||
    c.querySelector(`[data-address="${a}"]`)  ||
    c.querySelector(`[data-id="${a}"]`)       ||
    c.querySelector(`.node[data-address-i="${a}"]`) ||
    c.querySelector(`.node[data-address="${a}"]`)    ||
    c.querySelector(`.node[data-id="${a}"]`)
  );
}

///////////////////////
// Public helpers (bands/halo decision)
///////////////////////
export function nodeClassesFor(result, nodeAddress) {
  const addr  = String(nodeAddress || '').toLowerCase();
  const focus = String(result?.address || '').toLowerCase();
  const base  = ['node'];

  const blocked = !!(result?.block || result?.risk_score === 100 || result?.sanctionHits);

  if (addr && focus && addr === focus) {
    base.push('halo');
    if (blocked) base.push('halo-red');
  }

  const score = typeof result?.risk_score === 'number'
    ? result.risk_score
    : (typeof result?.score === 'number' ? result.score : 0);

  base.push(bandClass(score, blocked));
  return base.join(' ');
}

export function bandClass(score, blocked) {
  if (blocked || score >= 80) return 'band-high';
  if (score >= 60) return 'band-elevated';
  return 'band-moderate';
}

///////////////////////
// Rendering stubs (no-op but hookable)
///////////////////////
function render(container, data, opts = {}) {
  emit('render', { container: ensureContainer(container), data, opts });
}
function updateStyles(container, result) {
  emit('restyle', { container: ensureContainer(container), result });
}

///////////////////////
// Legacy API expected by app.js
///////////////////////
function setContainer(el) {
  return ensureContainer(el);
}
function setData(data) {
  state.data = data || state.data;
  render(state.container, state.data);
  emit('data', state.data);
}
function getData() { return state.data; }

/**
 * setHalo(target, opts?)
 * - target can be: result object with {address, block, risk_score}, OR a plain address string
 * - opts: { blocked?: boolean, container?: HTMLElement }
 */
function setHalo(target, opts = {}) {
  const isResult = target && typeof target === 'object' && ('address' in target || 'risk_score' in target || 'block' in target);
  const address = isResult ? target.address : target;
  const blocked =
    (isResult ? (!!target.block || target.risk_score === 100 || target.sanctionHits) : !!opts.blocked);

  const el = findNodeEl(address, opts.container || state.container);
  if (!el) return false;

  el.classList.add('halo');
  if (blocked) el.classList.add('halo-red'); else el.classList.remove('halo-red');
  return true;
}

function clearHalos(container) {
  const c = ensureContainer(container);
  if (!c) return;
  c.querySelectorAll('.halo, .halo-red').forEach(n => {
    n.classList.remove('halo', 'halo-red');
  });
}

///////////////////////
// Export API
///////////////////////
const api = {
  // legacy/evented
  on, off, setData, getData, setContainer,
  // halo control
  setHalo, clearHalos,
  // rendering hooks
  render, updateStyles,
  // helpers
  nodeClassesFor, bandClass,
};

export default api;

// Global for existing code using `graph.*`
try { if (typeof window !== 'undefined') window.graph = api; } catch {}
