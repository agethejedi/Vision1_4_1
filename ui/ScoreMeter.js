// vision/ui/ScoreMeter.js
// Score Meter with SafeSend badge, numeric label even when blocked, and reasons+weights.

export function ScoreMeter(root) {
  const el = (typeof root === 'string') ? document.querySelector(root) : root;
  if (!el) return noopPanel();

  // Ensure structure (inject if missing)
  ensureSkeleton(el);

  const badgeEl   = el.querySelector('.badge');
  const labelEl   = el.querySelector('.score-text');
  const subEl     = el.querySelector('.score-sub');
  const ringSvg   = el.querySelector('svg.ring');
  const ringArc   = ringSvg ? ringSvg.querySelector('.arc') : null;
  const reasonsEl = el.querySelector('.reasons');

  let _score = 0;
  let _blocked = false;

  function clamp(n){ n = Number(n)||0; return n < 0 ? 0 : (n > 100 ? 100 : n); }
  function bandLabel(score){
    if (_blocked || score >= 80) return 'High';
    if (score >= 60) return 'Elevated';
    return 'Moderate';
  }
  function ringColor(score){
    if (_blocked || score >= 80) return '#ef4444';
    if (score >= 60) return '#f59e0b';
    return '#10b981';
  }

  function apply(){
    // IMPORTANT: keep numeric even when blocked
    if (labelEl) labelEl.textContent = String(_score);
    if (subEl)   subEl.textContent   = bandLabel(_score);

    el.classList.add('score-meter');
    el.classList.toggle('blocked', _blocked);

    const color = ringColor(_score);
    if (ringArc){
      const pct = _score / 100;
      const dash = 283 * pct; // ~2πr for r≈45
      ringArc.setAttribute('stroke', color);
      ringArc.setAttribute('stroke-dasharray', `${dash} 999`);
    }
  }

  function setScore(score, opts = {}) {
    _score = clamp(score);
    if (typeof opts.blocked === 'boolean') _blocked = !!opts.blocked;
    apply();
  }

  function setBlocked(flag){
    _blocked = !!flag;
    // keep numeric display; do NOT force 100 anymore
    apply();
  }

  function setBadge(text){
    if (!badgeEl) return;
    if (!text) { badgeEl.hidden = true; return; }
    badgeEl.textContent = text;
    badgeEl.hidden = false;
  }

  function setReasonsList(list){
    if (!reasonsEl) return;
    const rows = (Array.isArray(list) ? list : []).map(rowToHTML).join('') ||
      `<div class="reason muted">No elevated factors detected</div>`;
    reasonsEl.innerHTML = rows;
  }

  function setSummary(result = {}){
    const blocked  = !!(result.block || result.risk_score === 100 || result.sanctionHits);
    const scoreNum = typeof result.risk_score === 'number'
      ? result.risk_score
      : (typeof result.score === 'number' ? result.score : 0);

    // badge: show if parity flag/text provided; default to "SafeSend parity"
    const badgeText = result.parity === false ? null : (typeof result.parity === 'string' ? result.parity : 'SafeSend parity');
    setBadge(badgeText);

    // reasons/breakdown → render with weights when available
    const breakdown = normalizeBreakdown(result);
    setReasonsList(breakdown);

    setScore(scoreNum, { blocked });
  }

  function getScore(){ return _score; }

  // initial paint
  apply();

  return { setScore, setBlocked, setReasons: setReasonsList, setSummary, getScore };
}

/* ---------- helpers ---------- */

function ensureSkeleton(el){
  // If user kept our HTML, great; otherwise create what we need.
  if (!el.querySelector('.badge')) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'SafeSend parity';
    el.prepend(badge);
  }
  if (!el.querySelector('.meter')){
    el.insertAdjacentHTML('afterbegin', `
      <div class="meter">
        <svg viewBox="0 0 100 100" class="ring">
          <circle cx="50" cy="50" r="45" class="track" fill="none" stroke-width="8"></circle>
          <circle cx="50" cy="50" r="45" class="arc"   fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 999"></circle>
        </svg>
        <div class="label">
          <div class="score-text">0</div>
          <div class="score-sub">Moderate</div>
        </div>
      </div>
    `);
  }
  if (!el.querySelector('.reasons')){
    el.insertAdjacentHTML('beforeend', `<div class="reasons"></div>`);
  }
}

function rowToHTML(item){
  if (!item || typeof item !== 'object') {
    const text = String(item || '');
    return `<div class="reason"><span>${escapeHtml(text)}</span><span class="val">+0</span></div>`;
  }
  const label = escapeHtml(item.label ?? item.reason ?? '');
  const val   = Number(item.delta ?? item.points ?? item.scoreDelta ?? 0);
  const sign  = val > 0 ? '+' : '';
  return `<div class="reason"><span>${label}</span><span class="val">${sign}${val}</span></div>`;
}

function normalizeBreakdown(result){
  // Prefer explicit breakdown array if provided
  if (Array.isArray(result.breakdown) && result.breakdown.length) return result.breakdown;

  // Otherwise map reason strings → display rows with suggested weights (optional)
  const weights = {
    'OFAC': 40,
    'OFAC/sanctions list match': 40,
    'sanctioned Counterparty': 40,
    'fan In High': 9,
    'shortest Path To Sanctioned': 6,
  };
  const reasons = result.reasons || result.risk_factors || [];
  return reasons.map(r => ({
    label: r,
    delta: weights[r] ?? 0
  }));
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function noopPanel(){
  return { setScore(){}, setBlocked(){}, setReasons(){}, setSummary(){}, getScore(){ return 0; } };
}

// Default export & global
const api = { ScoreMeter };
export default api;
try { if (typeof window !== 'undefined') window.ScoreMeter = ScoreMeter; } catch {}
