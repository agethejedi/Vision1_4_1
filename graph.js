// graph.js — minimal SVG graph renderer for Vision
// Exposes window.graph: { setData, getData, setHalo, on }
// CSS hooks used: .vision-graph, .edge, .node-outer, .node-inner,
//                 g.halo, g.halo.halo-red (your CSS already defines pulses)

(function(){
  const state = {
    nodes: [],
    links: [],
    byId: new Map(),
    listeners: new Map(),
    selectedId: null
  };

  const root = document.getElementById('graph');
  if (!root) {
    console.warn('[graph.js] #graph not found; graph module inert.');
    window.graph = stub();
    return;
  }

  // Build SVG skeleton
  root.classList.add('vision-graph');
  const svg = el('svg', { width:'100%', height:'100%' });
  const edgesG = el('g', { class:'edges' });
  const nodesG = el('g', { class:'nodes' });
  svg.appendChild(edgesG);
  svg.appendChild(nodesG);
  root.innerHTML = '';
  root.appendChild(svg);

  // Resize handling → emit viewportChanged
  let resizeT = null;
  new ResizeObserver(() => {
    clearTimeout(resizeT);
    resizeT = setTimeout(()=>emit('viewportChanged'), 150);
    layoutAndRender(); // keep it simple: relayout on resize
  }).observe(root);

  // API
  const api = {
    setData,
    getData: () => ({ nodes: [...state.nodes], links: [...state.links] }),
    setHalo,
    on
  };
  window.graph = api;

  /* --------------------- impl ----------------------------------- */

  function on(evt, fn){
    if (!state.listeners.has(evt)) state.listeners.set(evt, []);
    state.listeners.get(evt).push(fn);
  }
  function emit(evt, payload){
    const arr = state.listeners.get(evt) || [];
    for (const fn of arr) try { fn(payload); } catch(e){ console.error(e); }
  }

  function setData({nodes, links}){
    state.nodes = Array.isArray(nodes) ? nodes.map(n => ({...n})) : [];
    state.links = Array.isArray(links) ? links.map(L => ({...L})) : [];
    state.byId = new Map(state.nodes.map(n => [n.id, n]));
    layoutAndRender();
  }

  function layoutAndRender(){
    // Basic radial layout: choose a center (max degree), ring neighbors around it,
    // then place remaining nodes on an outer ring.
    const { width, height } = root.getBoundingClientRect();
    const cx = width/2, cy = height/2;
    const R1 = Math.min(width, height) * 0.22;
    const R2 = Math.min(width, height) * 0.38;

    const deg = degreeMap(state.links);
    const center = pickCenter(state.nodes, deg);
    const neighbors = oneHop(center?.id, state.links);
    const rest = state.nodes.filter(n => n.id !== center?.id && !neighbors.has(n.id));

    const pos = new Map();
    if (center) pos.set(center.id, { x: cx, y: cy });

    placeRing([...neighbors], R1, cx, cy, pos);
    placeRing(rest, R2, cx, cy, pos);

    // Render edges
    edgesG.innerHTML = '';
    for (const L of state.links) {
      const a = pos.get(L.a) || pos.get(L.source) || pos.get(L.idA) || {x:cx,y:cy};
      const b = pos.get(L.b) || pos.get(L.target) || pos.get(L.idB) || {x:cx,y:cy};
      edgesG.appendChild(el('line', {
        class: 'edge',
        x1: a.x, y1: a.y, x2: b.x, y2: b.y
      }));
    }

    // Render nodes
    nodesG.innerHTML = '';
    for (const n of state.nodes) {
      const p = pos.get(n.id) || { x: cx, y: cy };
      const g = el('g', { transform: `translate(${p.x},${p.y})` });
      g.dataset.id = n.id;

      const outer = el('circle', { r: 10, class: 'node-outer' });
      const inner = el('circle', { r: 5,  class: 'node-inner' });
      g.appendChild(outer);
      g.appendChild(inner);

      // selection styles
      if (n.id === state.selectedId) {
        outer.setAttribute('stroke-width', '3');
      }

      g.addEventListener('click', () => {
        state.selectedId = n.id;
        emit('selectNode', { id: n.id, data: n });
        // lightweight visual feedback
        refreshSelection(nodesG, n.id);
      });

      nodesG.appendChild(g);
    }
  }

  function setHalo(opts){
    // Accept either res object or explicit halo opts
    const id = opts?.id || opts?.address;
    if (!id) return;

    const g = nodesG.querySelector(`g[data-id="${cssEscape(id)}"]`);
    if (!g) return;
    const outer = g.querySelector('.node-outer');

    // Ensure halo class
    g.classList.add('halo');
    // Red pulse for blocked
    if (opts.blocked) g.classList.add('halo-red'); else g.classList.remove('halo-red');

    // Color override
    if (opts.color) outer.style.stroke = opts.color;
    else outer.style.stroke = '';

    // Intensity → stroke width hint (cap in CSS anim)
    if (typeof opts.intensity === 'number') {
      const sw = 2 + Math.min(14, Math.max(2, Math.round(opts.intensity*10)));
      outer.style.strokeWidth = String(sw);
    } else {
      outer.style.strokeWidth = '';
    }

    // Tooltip
    if (opts.tooltip) g.setAttribute('title', String(opts.tooltip));
  }

  /* --------------------- helpers -------------------------------- */

  function el(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (const [k,v] of Object.entries(attrs)) {
      if (v != null) e.setAttribute(k, String(v));
    }
    return e;
  }

  function degreeMap(links){
    const m = new Map();
    for (const L of (links||[])) {
      const a = L.a ?? L.source ?? L.idA;
      const b = L.b ?? L.target ?? L.idB;
      if (!a || !b) continue;
      m.set(a, (m.get(a)||0)+1);
      m.set(b, (m.get(b)||0)+1);
    }
    return m;
  }

  function pickCenter(nodes, deg){
    if (!nodes?.length) return null;
    let best = nodes[0], bd = -1;
    for (const n of nodes) {
      const d = deg.get(n.id) || 0;
      if (d > bd) { bd = d; best = n; }
    }
    return best;
  }

  function oneHop(centerId, links){
    const s = new Set();
    if (!centerId) return s;
    for (const L of (links||[])) {
      const a = L.a ?? L.source ?? L.idA;
      const b = L.b ?? L.target ?? L.idB;
      if (a === centerId && b) s.add(b);
      if (b === centerId && a) s.add(a);
    }
    return s;
    }

  function placeRing(arr, R, cx, cy, pos){
    const n = arr.length;
    if (!n) return;
    for (let i=0;i<n;i++){
      const id = typeof arr[i] === 'string' ? arr[i] : arr[i].id;
      const angle = (i / n) * Math.PI * 2 - Math.PI/2;
      const x = cx + R * Math.cos(angle);
      const y = cy + R * Math.sin(angle);
      pos.set(id, { x, y });
    }
  }

  function refreshSelection(nodesG, id){
    nodesG.querySelectorAll('g').forEach(g => {
      const outer = g.querySelector('.node-outer');
      if (g.dataset.id === id) outer?.setAttribute('stroke-width','3');
      else outer?.setAttribute('stroke-width','2');
    });
  }

  // CSS.escape polyfill-ish for attribute selectors
  function cssEscape(s){
    return String(s).replace(/"/g,'\\"');
  }

  function stub(){
    const noop = ()=>{};
    const obj = { setData:noop, getData:()=>({nodes:[],links:[]}), setHalo:noop, on:noop };
    return obj;
  }
})();
