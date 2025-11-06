// graph.js — Vision graph renderer (vanilla SVG, radial layout + zoom/pan)
(function(){
  const api = {};
  const listeners = {};
  function emit(evt, payload){ (listeners[evt]||[]).forEach(fn => { try{fn(payload);}catch{} }); }
  api.on = (evt, fn) => { (listeners[evt] ||= []).push(fn); return api; };

  const host = document.getElementById('graph');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'vision-graph');
  svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
  host.appendChild(svg);

  const gRoot  = document.createElementNS(svgNS, 'g'); svg.appendChild(gRoot);
  const gEdges = document.createElementNS(svgNS, 'g'); gRoot.appendChild(gEdges);
  const gNodes = document.createElementNS(svgNS, 'g'); gRoot.appendChild(gNodes);

  let data = { nodes:[], links:[] };
  let nodeIndex = new Map();
  let halos = new Map();
  let showLabels = true;

  /* ===== Zoom/Pan ===== */
  let scale = 1, tx = 0, ty = 0;
  let dragging = false, lastX=0, lastY=0;
  function applyTransform(){ gRoot.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`); }
  host.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const cx = (e.clientX - rect.left - tx)/scale;
    const cy = (e.clientY - rect.top  - ty)/scale;
    const k  = (e.deltaY < 0 ? 1.1 : 0.9);
    scale *= k;
    tx = e.clientX - rect.left - cx*scale;
    ty = e.clientY - rect.top  - cy*scale;
    applyTransform();
  }, { passive:false });
  host.addEventListener('mousedown', (e)=>{ dragging=true; lastX=e.clientX; lastY=e.clientY; });
  window.addEventListener('mouseup', ()=> dragging=false);
  window.addEventListener('mousemove', (e)=>{
    if (!dragging) return;
    tx += (e.clientX - lastX);
    ty += (e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
    applyTransform();
  });

  api.zoomFit = function(){
    const rect = svg.getBoundingClientRect();
    const bbox = gRoot.getBBox ? gRoot.getBBox() : { x:0, y:0, width:1, height:1 };
    if (!bbox.width || !bbox.height) return;
    const pad = 40;
    const sx = (rect.width - pad) / bbox.width;
    const sy = (rect.height - pad) / bbox.height;
    scale = Math.max(0.1, Math.min(4, Math.min(sx, sy)));
    tx = (rect.width - bbox.width*scale)/2 - bbox.x*scale;
    ty = (rect.height - bbox.height*scale)/2 - bbox.y*scale;
    applyTransform();
  };
  api.resetView = function(){ scale = 1; tx = ty = 0; applyTransform(); };

  /* ===== Data/Render ===== */
  api.setData = function(newData){
    const nodes = Array.isArray(newData?.nodes) ? newData.nodes : [];
    const links = Array.isArray(newData?.links) ? newData.links : [];
    data = { nodes, links };
    nodeIndex = new Map(nodes.map(n => [String(n.id).toLowerCase(), n]));
    render();
    emit('dataChanged');
  };
  api.getData = () => data;

  function render(){
    // layout: center = first node; others around circle
    const rect = svg.getBoundingClientRect();
    const cx = rect.width/2, cy = rect.height/2;
    const center = data.nodes[0];
    const N = Math.max(0, data.nodes.length - 1);
    const R = Math.min(rect.width, rect.height) * 0.28;

    // node coordinates
    const pos = new Map();
    if (center) { pos.set(center.id, { x: cx, y: cy }); }
    for (let i=1; i<data.nodes.length; i++){
      const n = data.nodes[i];
      const theta = (i-1) / Math.max(1, N) * Math.PI*2;
      const x = cx + R * Math.cos(theta);
      const y = cy + R * Math.sin(theta);
      pos.set(n.id, { x, y });
    }

    // edges
    gEdges.innerHTML = '';
    for (const L of data.links){
      const a = pos.get(L.a); const b = pos.get(L.b);
      if (!a || !b) continue;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('class', 'edge');
      const w = Number(L.weight || 1);
      line.setAttribute('stroke-width', String( Math.max(1, Math.log2(1+w)+0.5) ));
      gEdges.appendChild(line);
    }

    // nodes
    gNodes.innerHTML = '';
    for (const n of data.nodes){
      const p = pos.get(n.id) || { x:cx, y:cy };
      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('transform', `translate(${p.x},${p.y})`);
      g.setAttribute('data-id', n.id);

      const outer = document.createElementNS(svgNS, 'circle');
      outer.setAttribute('r', 11);
      outer.setAttribute('class', 'node-outer');
      g.appendChild(outer);

      const inner = document.createElementNS(svgNS, 'circle');
      inner.setAttribute('r', 5.5);
      inner.setAttribute('class', 'node-inner');
      g.appendChild(inner);

      if (showLabels && data.nodes.length <= (window.__SHOW_LABELS_BELOW__||150)) {
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('y', -16);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('style', 'fill:#8aa3a0; font-size:10px;');
        const id = String(n.id);
        text.textContent = id.slice(0,6)+'…'+id.slice(-4);
        g.appendChild(text);
      }

      // events
      g.addEventListener('click', () => emit('selectNode', { id:n.id }));
      g.addEventListener('mouseenter', (evt) => {
        const pt = svg.createSVGPoint(); pt.x = p.x; pt.y = p.y;
        const screen = svg.getBoundingClientRect();
        emit('hoverNode', { id:n.id, __px: p.x*scale + tx, __py: p.y*scale + ty, screen });
      });
      g.addEventListener('mouseleave', () => emit('hoverNode', null));

      gNodes.appendChild(g);
    }

    // re-apply halos
    halos.forEach((v, id) => applyHaloVisual(id, v));
  }

  /* ===== Halos ===== */
  function applyHaloVisual(id, opts){
    const g = gNodes.querySelector(`g[data-id="${CSS.escape(id)}"]`);
    if (!g) return;
    // toggle halo/red classes; color via inline stroke on .node-outer
    g.classList.toggle('halo', true);
    g.classList.toggle('halo-red', !!opts.blocked);
    const outer = g.querySelector('.node-outer');
    if (outer && opts.color) outer.style.stroke = opts.color;
  }

  api.setHalo = function(info){
    if (!info || !info.id) return;
    halos.set(info.id, info);
    applyHaloVisual(info.id, info);
  };

  api.flashHalo = function(id){
    const g = gNodes.querySelector(`g[data-id="${CSS.escape(id)}"]`);
    if (!g) return;
    g.classList.add('halo');
    g.classList.add('halo-flash');
    setTimeout(()=> g.classList.remove('halo-flash'), 450);
  };

  /* ===== Center / Fit ===== */
  api.centerOn = function(id, { animate=false } = {}){
    if (!data.nodes.length) return;
    const idx = data.nodes.findIndex(n => String(n.id).toLowerCase() === String(id).toLowerCase());
    if (idx <= 0) return; // already center or not found
    const [node] = data.nodes.splice(idx, 1);
    data.nodes.unshift(node);
    if (animate){
      // small fade to hide jump
      svg.style.transition = 'opacity .18s ease';
      svg.style.opacity = '0.4';
      requestAnimationFrame(()=>{ render(); api.zoomFit(); svg.style.opacity = '1'; setTimeout(()=> svg.style.transition=''; }, 200); });
    } else { render(); }
    emit('dataChanged');
  };

  api.setLabelVisibility = function(visible){
    showLabels = !!visible;
    render();
  };

  api.getNodeCenterPx = function(id){
    const rect = svg.getBoundingClientRect();
    const node = gNodes.querySelector(`g[data-id="${CSS.escape(id)}"]`);
    if (!node) return null;
    const m = node.getCTM();
    const px = m.e*scale + tx;
    const py = m.f*scale + ty;
    return { x:px, y:py, rect };
  };

  // expose
  window.graph = api;

})();
