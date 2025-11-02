// vision/graph.js  (hardened against bad/empty node data)

const state = {
  container: null,
  svg: null,
  gLinks: null,
  gNodes: null,
  data: { nodes: [], links: [] },
  listeners: new Map(),
};

function on(evt, fn){ if(!state.listeners.has(evt)) state.listeners.set(evt,new Set()); state.listeners.get(evt).add(fn); }
function off(evt, fn){ const s=state.listeners.get(evt); if(s) s.delete(fn); }
function emit(evt, payload){ const s=state.listeners.get(evt); if(s) for(const fn of s){ try{ fn(payload); }catch{} } }

function ensureContainer(el){
  if(el) state.container = el;
  if(!state.container && typeof document !== 'undefined'){
    state.container = document.getElementById('graph') ||
                      document.querySelector('[data-role="graph"]') ||
                      document.querySelector('.graph');
  }
  return state.container;
}

function ensureSvg(){
  const c = ensureContainer(state.container);
  if(!c) return null;
  if(!state.svg){
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','vision-graph');
    svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
    const gLinks = document.createElementNS(svg.namespaceURI,'g'); gLinks.setAttribute('class','links');
    const gNodes = document.createElementNS(svg.namespaceURI,'g'); gNodes.setAttribute('class','nodes');
    svg.appendChild(gLinks); svg.appendChild(gNodes);
    c.innerHTML=''; c.appendChild(svg);
    state.svg=svg; state.gLinks=gLinks; state.gNodes=gNodes;
  }
  return state.svg;
}

function getId(n){
  // Returns a **string id** or null if not present
  if(!n) return null;
  const raw = n.id ?? n.address ?? null;
  return raw != null ? String(raw) : null;
}
function nodeKey(id){ return String(id).toLowerCase(); }

function circleLayout(nodes){
  const list = (nodes || []).filter(n => !!getId(n));
  const pos = new Map();
  if(list.length === 0 || !state.container) return pos;

  const rect = state.container.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  const r = Math.max(60, Math.min(cx, cy) - 40);

  // center = first valid node
  const centerId = getId(list[0]);
  pos.set(centerId, { x: cx, y: cy });

  // ring
  const ring = list.slice(1);
  ring.forEach((node, i) => {
    const id = getId(node); if(!id) return;
    const a = (2 * Math.PI * i) / (ring.length || 1);
    pos.set(id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  });

  return pos;
}

export function nodeClassesFor(result, nodeAddress){
  const addr  = String(nodeAddress || '').toLowerCase();
  const focus = String(result?.address || '').toLowerCase();
  const base  = ['node'];
  const blocked = !!(result?.block || result?.risk_score === 100 || result?.sanctionHits);
  if (addr && focus && addr === focus){ base.push('halo'); if(blocked) base.push('halo-red'); }
  const score = typeof result?.risk_score === 'number' ? result.risk_score
              : (typeof result?.score === 'number' ? result.score : 0);
  base.push(bandClass(score, blocked));
  return base.join(' ');
}
export function bandClass(score, blocked){
  if (blocked || score >= 80) return 'band-high';
  if (score >= 60) return 'band-elevated';
  return 'band-moderate';
}

function render(container, data, opts = {}){
  try{
    ensureContainer(container);
    if(!ensureSvg()) return;

    const nodesAll = Array.isArray(data?.nodes) ? data.nodes : [];
    const linksAll = Array.isArray(data?.links) ? data.links : [];

    // **Filter invalid nodes/links** defensively
    const nodes = nodesAll.filter(n => !!getId(n));
    const links = linksAll.filter(l => l && getId({id:l.a}) && getId({id:l.b}));

    const pos = circleLayout(nodes);
    state.gLinks.innerHTML=''; state.gNodes.innerHTML='';

    if(pos.size === 0) { return; }

    // links
    for(const l of links){
      const aId = getId({id:l.a}); const bId = getId({id:l.b});
      const a = pos.get(aId); const b = pos.get(bId);
      if(!a || !b) continue;
      const line = document.createElementNS(state.svg.namespaceURI,'line');
      line.setAttribute('x1',a.x); line.setAttribute('y1',a.y);
      line.setAttribute('x2',b.x); line.setAttribute('y2',b.y);
      line.setAttribute('class','edge');
      state.gLinks.appendChild(line);
    }

    // nodes
    for(const n of nodes){
      const id = getId(n); const p = pos.get(id);
      if(!id || !p) continue;
      const g = document.createElementNS(state.svg.namespaceURI,'g');
      g.setAttribute('class','node');
      g.setAttribute('transform',`translate(${p.x},${p.y})`);
      g.setAttribute('data-address', id);
      g.setAttribute('data-address-i', nodeKey(id));
      g.setAttribute('data-id', nodeKey(id));

      const outer = document.createElementNS(state.svg.namespaceURI,'circle');
      outer.setAttribute('r','14'); outer.setAttribute('class','node-outer');
      const inner = document.createElementNS(state.svg.namespaceURI,'circle');
      inner.setAttribute('r','4'); inner.setAttribute('class','node-inner');

      g.appendChild(outer); g.appendChild(inner);
      g.addEventListener('click', () => emit('selectNode', { id, address:id }));
      state.gNodes.appendChild(g);
    }

    emit('render',{ container: state.container, data: {nodes,links}, opts });
  }catch(err){
    // Never crash UI due to malformed data; log for debugging.
    console.warn('graph.render skipped due to error:', err);
  }
}

function updateStyles(container, result){
  if (!result?.id && !result?.address) return;
  setHalo(result);
  emit('restyle', { container: state.container, result });
}

function setContainer(el){ ensureContainer(el); ensureSvg(); return state.container; }
function setData(data){
  // Always coerce into arrays; guard against nulls
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const links = Array.isArray(data?.links) ? data.links : [];
  state.data = { nodes, links };
  render(state.container, state.data);
  emit('data', state.data);
}
function getData(){ return state.data; }

function setHalo(target, opts = {}){
  const isObj = target && typeof target === 'object';
  const idOrAddr = isObj ? (target.address || target.id) : target;
  const blocked = isObj ? (!!target.block || target.risk_score === 100 || target.sanctionHits)
                        : !!opts.blocked;
  const el = findNodeEl(idOrAddr);
  if(!el) return false;
  el.classList.add('halo');
  if (blocked) el.classList.add('halo-red'); else el.classList.remove('halo-red');
  return true;
}
function clearHalos(){
  if(!state.gNodes) return;
  state.gNodes.querySelectorAll('.halo,.halo-red').forEach(n => n.classList.remove('halo','halo-red'));
}

function findNodeEl(address){
  if(!address || !state.gNodes) return null;
  const key = nodeKey(address);
  return state.gNodes.querySelector(`g[data-address-i="${key}"]`);
}

const api = { on, off, setData, getData, setContainer, setHalo, clearHalos, render, updateStyles, nodeClassesFor, bandClass };
export default api;
try{ if(typeof window!=='undefined') window.graph = api; }catch{}
