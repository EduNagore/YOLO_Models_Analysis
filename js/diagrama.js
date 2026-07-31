/* ============================================================================
 * diagrama.js — Renderizador SVG (grafo principal y subgrafos de bloque)
 * ----------------------------------------------------------------------------
 * Grafo principal : diagrama capa a capa, de izquierda a derecha. columna =
 *                   indice de capa, fila = nivel de la piramide. Las conexiones
 *                   largas (skip) se enrutan por carriles bajo el grafo.
 * Subgrafo        : interior de un bloque. columna y fila explicitas.
 * ========================================================================== */

const SVGNS = "http://www.w3.org/2000/svg";

function svgEl(nombre, attrs) {
  const e = document.createElementNS(SVGNS, nombre);
  for (const k in (attrs || {})) e.setAttribute(k, attrs[k]);
  return e;
}

/* --- texto ---------------------------------------------------------------- */

function recortar(txt, max) {
  txt = String(txt == null ? "" : txt);
  return txt.length > max ? txt.slice(0, max - 1) + "…" : txt;
}

function partirEnLineas(txt, maxChars, maxLineas) {
  const palabras = String(txt || "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let act = "";
  for (const p of palabras) {
    if (!act.length) { act = p; continue; }
    if ((act + " " + p).length <= maxChars) act += " " + p;
    else { lineas.push(act); act = p; if (lineas.length === maxLineas) break; }
  }
  if (act && lineas.length < maxLineas) lineas.push(act);
  if (lineas.length === maxLineas && palabras.join(" ").length > lineas.join(" ").length) {
    lineas[maxLineas - 1] = recortar(lineas[maxLineas - 1] + " …", maxChars);
  }
  return lineas.length ? lineas : [""];
}

/* ==========================================================================
 * Camara: zoom y desplazamiento
 * ========================================================================== */

class Camara {
  constructor(svg, capa) {
    this.svg = svg; this.capa = capa;
    this.k = 1; this.tx = 0; this.ty = 0;
    this.arrastrando = false;
    this._instalar();
  }
  aplicar() {
    this.capa.setAttribute("transform", `translate(${this.tx},${this.ty}) scale(${this.k})`);
  }
  encuadrar(caja, margen) {
    margen = margen == null ? 40 : margen;
    const r = this.svg.getBoundingClientRect();
    if (!r.width || !caja.w || !caja.h) return;
    const k = Math.min((r.width - margen * 2) / caja.w, (r.height - margen * 2) / caja.h, 1.6);
    this.k = Math.max(0.08, k);
    this.tx = (r.width - caja.w * this.k) / 2 - caja.x * this.k;
    this.ty = margen - caja.y * this.k;
    if (caja.h * this.k < r.height - margen * 2) {
      this.ty = (r.height - caja.h * this.k) / 2 - caja.y * this.k;
    }
    this.aplicar();
  }
  /** Encuadre de arranque. El grafo principal es una cinta mucho mas ancha que
   *  alta: meterla entera en el lienzo la deja ilegible, asi que en ese caso se
   *  ajusta solo al alto y se empieza por la izquierda (por el principio de la
   *  red). El boton "Ajustar" sigue encuadrandolo todo. */
  encuadrarInicio(caja, margen, margenIzq) {
    margen = margen == null ? 40 : margen;
    margenIzq = margenIzq == null ? margen : margenIzq;   // hueco de la ficha del modelo
    const r = this.svg.getBoundingClientRect();
    if (!r.width || !caja.w || !caja.h) return;
    const kAlto = Math.min((r.height - margen * 2) / caja.h, 1.6);
    if (caja.w * kAlto <= r.width - margenIzq - margen) return this.encuadrar(caja, margen);
    this.k = Math.max(0.08, kAlto);
    this.tx = margenIzq - caja.x * this.k;
    this.ty = margen - caja.y * this.k;
    this.aplicar();
  }
  zoom(factor, cx, cy) {
    const r = this.svg.getBoundingClientRect();
    cx = cx == null ? r.width / 2 : cx;
    cy = cy == null ? r.height / 2 : cy;
    const nk = Math.min(4, Math.max(0.06, this.k * factor));
    this.tx = cx - (cx - this.tx) * (nk / this.k);
    this.ty = cy - (cy - this.ty) * (nk / this.k);
    this.k = nk;
    this.aplicar();
  }
  _instalar() {
    const svg = this.svg;
    svg.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      const r = svg.getBoundingClientRect();
      this.zoom(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });

    let px = 0, py = 0;
    svg.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".nodo")) return;
      this.arrastrando = true; px = ev.clientX; py = ev.clientY;
      svg.setPointerCapture(ev.pointerId); svg.classList.add("arrastrando");
    });
    svg.addEventListener("pointermove", (ev) => {
      if (!this.arrastrando) return;
      this.tx += ev.clientX - px; this.ty += ev.clientY - py;
      px = ev.clientX; py = ev.clientY; this.aplicar();
    });
    const soltar = (ev) => {
      if (!this.arrastrando) return;
      this.arrastrando = false;
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) {}
      svg.classList.remove("arrastrando");
    };
    svg.addEventListener("pointerup", soltar);
    svg.addEventListener("pointercancel", soltar);
  }
}

/* ==========================================================================
 * Definiciones comunes (marcadores de flecha)
 * ========================================================================== */

function defsFlechas() {
  const defs = svgEl("defs");
  const marcas = [
    ["flecha", "var(--linea)"],
    ["flecha-res", "var(--linea-res)"],
    ["flecha-cat", "var(--linea-cat)"],
    ["flecha-split", "var(--linea-split)"],
    ["flecha-act", "var(--acento)"]
  ];
  marcas.forEach(([id, color]) => {
    const m = svgEl("marker", {
      id, viewBox: "0 0 10 10", refX: "9", refY: "5",
      markerWidth: "6", markerHeight: "6", orient: "auto-start-reverse"
    });
    m.appendChild(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color }));
    defs.appendChild(m);
  });
  return defs;
}

const MARCADOR = {
  normal: "flecha", residual: "flecha-res", concat: "flecha-cat", split: "flecha-split"
};

/* ==========================================================================
 * Dibujo de un nodo
 * ========================================================================== */

function dibujarNodo(n, geo, opciones) {
  const g = svgEl("g", {
    class: "nodo n-" + (n.tipo || "otro") + (n.hijo ? " expandible" : "") +
           (n.destacado ? " destacado" : ""),
    transform: `translate(${geo.x},${geo.y})`
  });
  g.dataset.id = n.id;

  g.appendChild(svgEl("rect", {
    class: "caja", x: 0, y: 0, width: geo.w, height: geo.h, rx: 9
  }));
  g.appendChild(svgEl("rect", { class: "acento", x: 0, y: 0, width: 4, height: geo.h, rx: 2 }));

  const padX = 12;
  const t1 = svgEl("text", { class: "etiqueta", x: padX, y: 20 });
  t1.textContent = recortar(n.etiqueta, opciones.maxEtiqueta);
  g.appendChild(t1);

  const lineas = partirEnLineas(n.detalle, opciones.maxDetalle, 2);
  lineas.forEach((ln, i) => {
    const t = svgEl("text", { class: "detalle", x: padX, y: 36 + i * 12 });
    t.textContent = ln;
    g.appendChild(t);
  });

  if (n.insignia) {
    const bw = 10 + String(n.insignia).length * 6.6;
    const bg = svgEl("g", { transform: `translate(${geo.w - bw - 8},7)` });
    bg.appendChild(svgEl("rect", { class: "insignia-bg", x: 0, y: 0, width: bw, height: 16, rx: 8 }));
    const bt = svgEl("text", { class: "insignia", x: bw / 2, y: 11.5, "text-anchor": "middle" });
    bt.textContent = n.insignia;
    bg.appendChild(bt);
    g.appendChild(bg);
  }

  if (n.hijo) {
    const lupa = svgEl("g", { class: "lupa", transform: `translate(${geo.w - 17},${geo.h - 15})` });
    lupa.appendChild(svgEl("circle", { cx: 0, cy: 0, r: 8 }));
    const p = svgEl("text", { x: 0, y: 3.5, "text-anchor": "middle", class: "lupa-txt" });
    p.textContent = "+";
    lupa.appendChild(p);
    g.appendChild(lupa);
  }

  const tt = svgEl("title");
  tt.textContent = n.etiqueta + (n.detalle ? " — " + n.detalle : "") + (n.hijo ? "\n(click para ver el interior)" : "");
  g.appendChild(tt);
  return g;
}

/* ==========================================================================
 * Rutas
 * ========================================================================== */

function rutaVertical(a, b) {
  const d = Math.max(18, Math.min(70, Math.abs(b.y - a.y) * 0.45));
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + d}, ${b.x} ${b.y - d}, ${b.x} ${b.y}`;
}
/* Conexion larga: baja al hueco de debajo de su banda, recorre el carril y sale. */
function rutaCarril(a, b, carrilY) {
  return `M ${a.x} ${a.y} C ${a.x} ${carrilY}, ${b.x} ${carrilY}, ${b.x} ${b.y}`;
}

/* "Salto de linea": sale por la derecha de una banda, baja por el hueco y
 * vuelve a entrar por la izquierda de la siguiente, como el texto al envolver. */
function rutaRetorno(a, b, xFuera, yHueco, xEntra) {
  const r = 14;
  return `M ${a.x} ${a.y} L ${xFuera - r} ${a.y}` +
         ` Q ${xFuera} ${a.y}, ${xFuera} ${a.y + r} L ${xFuera} ${yHueco - r}` +
         ` Q ${xFuera} ${yHueco}, ${xFuera - r} ${yHueco} L ${xEntra + r} ${yHueco}` +
         ` Q ${xEntra} ${yHueco}, ${xEntra} ${yHueco + r} L ${xEntra} ${b.y - r}` +
         ` Q ${xEntra} ${b.y}, ${xEntra + r} ${b.y} L ${b.x} ${b.y}`;
}
function rutaHorizontal(a, b) {
  const d = Math.max(20, Math.abs(b.x - a.x) * 0.42);
  return `M ${a.x} ${a.y} C ${a.x + d} ${a.y}, ${b.x - d} ${b.y}, ${b.x} ${b.y}`;
}
function rutaArco(a, b, desvio) {
  return `M ${a.x} ${a.y} C ${a.x + 24} ${a.y + desvio}, ${b.x - 24} ${b.y + desvio}, ${b.x} ${b.y}`;
}

/* ==========================================================================
 * Render: subgrafo de un bloque (modo horizontal)
 * ========================================================================== */

function renderSubgrafo(svg, grafo, alExpandir) {
  svg.innerHTML = "";
  svg.appendChild(defsFlechas());
  const capa = svgEl("g", { class: "camara" });
  const gAristas = svgEl("g", { class: "aristas" });
  const gNodos = svgEl("g", { class: "nodos" });
  capa.appendChild(gAristas); capa.appendChild(gNodos);
  svg.appendChild(capa);

  const W = 178, H = 60, GX = 58, GY = 26;
  const pos = {};
  let maxX = 0, maxY = 0, minY = 1e9;

  grafo.nodos.forEach(n => {
    const x = n.col * (W + GX);
    const y = n.fila * (H + GY);
    pos[n.id] = { x, y, w: W, h: H };
    maxX = Math.max(maxX, x + W); maxY = Math.max(maxY, y + H); minY = Math.min(minY, y);
  });

  grafo.aristas.forEach(a => {
    const A = pos[a.de], B = pos[a.a];
    if (!A || !B) return;
    let d, p1, p2;
    const mismaFila = Math.abs((A.y + A.h / 2) - (B.y + B.h / 2)) < 1;
    const salto = Math.round((B.x - A.x) / (W + GX));

    if (mismaFila && salto > 1) {
      const desvio = a.tipo === "residual" ? -(H * 0.62 + salto * 4) : (H * 0.62 + salto * 4);
      p1 = { x: A.x + A.w / 2, y: a.tipo === "residual" ? A.y : A.y + A.h };
      p2 = { x: B.x + B.w / 2, y: a.tipo === "residual" ? B.y : B.y + B.h };
      const mx = (p1.x + p2.x) / 2;
      d = `M ${p1.x} ${p1.y} C ${p1.x + 20} ${p1.y + desvio}, ${p2.x - 20} ${p2.y + desvio}, ${p2.x} ${p2.y}`;
    } else if (B.x > A.x) {
      p1 = { x: A.x + A.w, y: A.y + A.h / 2 };
      p2 = { x: B.x, y: B.y + B.h / 2 };
      d = rutaHorizontal(p1, p2);
    } else {
      p1 = { x: A.x + A.w / 2, y: A.y + A.h };
      p2 = { x: B.x + B.w / 2, y: B.y };
      d = rutaVertical(p1, p2);
    }

    const path = svgEl("path", {
      class: "arista a-" + a.tipo, d,
      "marker-end": "url(#" + (MARCADOR[a.tipo] || "flecha") + ")"
    });
    path.dataset.de = a.de; path.dataset.a = a.a;
    gAristas.appendChild(path);

    if (a.etiqueta) {
      const t = svgEl("text", {
        class: "arista-txt", x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 5, "text-anchor": "middle"
      });
      t.textContent = a.etiqueta;
      gAristas.appendChild(t);
    }
  });

  grafo.nodos.forEach(n => {
    const g = dibujarNodo(n, Object.assign({ w: W, h: H }, pos[n.id]), { maxEtiqueta: 26, maxDetalle: 30 });
    if (n.hijo && alExpandir) {
      g.addEventListener("click", (ev) => { ev.stopPropagation(); alExpandir(n.hijo, n.etiqueta); });
    }
    g.addEventListener("mouseenter", () => resaltar(svg, n.id, true));
    g.addEventListener("mouseleave", () => resaltar(svg, n.id, false));
    gNodos.appendChild(g);
  });

  const caja = { x: -40, y: minY - 70, w: maxX + 80, h: (maxY - minY) + 150 };
  const cam = new Camara(svg, capa);
  requestAnimationFrame(() => cam.encuadrar(caja, 24));
  return cam;
}

/* ==========================================================================
 * Render: grafo principal (modo horizontal)
 *
 * Se lee como un texto: cada etapa (backbone / neck / head) es una banda que
 * fluye de izquierda a derecha y, al terminar, el hilo "salta de linea" a la
 * banda siguiente. Dentro de una banda, la columna es el orden de la capa y la
 * fila su nivel de piramide (P3 arriba … P5 abajo).
 *
 * Las conexiones largas de la FPN/PAN bajan al hueco que hay debajo de la banda
 * de origen, lo recorren por su carril y suben (o bajan) hasta su destino. Como
 * dentro de una banda cada capa tiene su propia columna, esos tramos verticales
 * nunca cruzan otro nodo.
 * ========================================================================== */

function renderModelo(svg, parsed, opciones) {
  opciones = opciones || {};
  svg.innerHTML = "";
  svg.appendChild(defsFlechas());
  const capa = svgEl("g", { class: "camara" });
  const gFondo = svgEl("g", { class: "fondo" });
  const gAristas = svgEl("g", { class: "aristas" });
  const gNodos = svgEl("g", { class: "nodos" });
  capa.appendChild(gFondo); capa.appendChild(gAristas); capa.appendChild(gNodos);
  svg.appendChild(capa);

  const W = 176, H = 80, GX = 32, GY = 24;
  const PITCH_X = W + GX, PITCH_Y = H + GY;
  const ANCHO_CAB = 132;          // cabeceras de fila (niveles de piramide)
  const HUECO_CAB = ANCHO_CAB + 34;
  const CARRIL = 26;              // separacion entre carriles de un hueco

  /* --- 1. una banda por etapa, en el orden en que aparecen --------------- */
  const bandas = [];
  parsed.capas.forEach(c => {
    const ult = bandas[bandas.length - 1];
    if (ult && ult.zona === c.zona) ult.capas.push(c);
    else bandas.push({ zona: c.zona, capas: [c] });
  });

  /* --- 2. sitio dentro de la banda: columna = orden, fila = nivel -------- */
  const pos = {};
  bandas.forEach((b, bi) => {
    b.strides = [...new Set(b.capas.map(c => c.stride))].sort((x, y) => x - y);
    const filaDe = {};
    b.strides.forEach((s, i) => (filaDe[s] = i));
    b.ancho = b.capas.length * PITCH_X - GX;
    b.alto = b.strides.length * PITCH_Y - GY;
    b.capas.forEach((c, k) => {
      // la cabeza lee P3, P4 y P5 a la vez: va abajo del todo, no en "su" nivel
      const fila = (c.modulo === "Detect" || c.modulo === "v10Detect")
        ? b.strides.length - 1
        : filaDe[c.stride];
      pos[c.i] = { x: k * PITCH_X, y: 0, w: W, h: H, banda: bi, fila };
    });
  });
  const anchoTotal = Math.max(...bandas.map(b => b.ancho));

  /* --- 3. clasificar las aristas ---------------------------------------- */
  const cortas = [], retornos = [], saltos = [];
  parsed.capas.forEach((c, i) => {
    const orig = Array.isArray(c.f) ? c.f : [c.f];
    orig.forEach(src => {
      if (src < 0) return;  // la entrada de la imagen
      if (i - src !== 1) {
        // el carril va en el hueco de debajo de la banda de origen
        saltos.push({ de: src, a: c.i, hueco: pos[src].banda });
      } else if (pos[src].banda === pos[c.i].banda) {
        cortas.push({ de: src, a: c.i });
      } else {
        retornos.push({ de: src, a: c.i });   // salto de linea entre etapas
      }
    });
  });

  // reparto de carriles: uno por hueco, sin solapar tramos horizontales
  const carrilesPorHueco = {};
  saltos.forEach(s => {
    const ax = pos[s.de].x + W / 2, bx = pos[s.a].x + W / 2;
    s.x0 = Math.min(ax, bx); s.x1 = Math.max(ax, bx);
  });
  saltos.sort((a, b) => (a.x1 - a.x0) - (b.x1 - b.x0));
  saltos.forEach(s => {
    const lista = carrilesPorHueco[s.hueco] = carrilesPorHueco[s.hueco] || [];
    let idx = 0;
    while ((lista[idx] || []).some(o => !(s.x1 <= o.x0 || s.x0 >= o.x1))) idx++;
    (lista[idx] = lista[idx] || []).push(s);
    s.carril = idx;
  });

  /* --- 4. apilar las bandas, dejando sitio a los carriles de cada hueco -- */
  let cursorY = 0;
  bandas.forEach((b, bi) => {
    b.y = cursorY;
    b.nCarriles = (carrilesPorHueco[bi] || []).length;
    b.yCarril = cursorY + b.alto + 40;                    // primer carril del hueco
    b.hueco = 40 + b.nCarriles * CARRIL + (bi === bandas.length - 1 ? 26 : 54);
    cursorY += b.alto + b.hueco;
    b.capas.forEach(c => (pos[c.i].y = b.y + pos[c.i].fila * PITCH_Y));
  });
  const altoTotal = cursorY;

  /* --- bandas de zona --------------------------------------------------- */
  const NOMBRE_ZONA = { backbone: "BACKBONE · extraccion de caracteristicas",
                        cuello: "NECK (FPN + PAN) · fusion multi-escala",
                        cabeza: "HEAD · prediccion" };
  bandas.forEach(b => {
    gFondo.appendChild(svgEl("rect", {
      class: "banda banda-" + b.zona, x: -14, y: b.y - 26,
      width: b.ancho + 28, height: b.alto + 52, rx: 14
    }));
    const t = svgEl("text", { class: "banda-txt", x: 0, y: b.y - 36 });
    t.textContent = NOMBRE_ZONA[b.zona] || b.zona;
    gFondo.appendChild(t);
  });

  /* --- cabeceras de fila (niveles de piramide) --------------------------- */
  bandas.forEach(b => {
    if (b.zona === "cabeza") return;   // la cabeza no vive en un solo nivel
    b.strides.forEach((s, i) => {
      const y = b.y + i * PITCH_Y + (H - 40) / 2;
      const g = svgEl("g", { class: "cabecera-fila", transform: `translate(${-HUECO_CAB},${y})` });
      g.appendChild(svgEl("rect", { x: 0, y: 0, width: ANCHO_CAB, height: 40, rx: 8, class: "cab-caja" }));
      const t1 = svgEl("text", { x: ANCHO_CAB / 2, y: 17, "text-anchor": "middle", class: "cab-t1" });
      t1.textContent = nivelPiramide(s) + " · stride " + s;
      const t2 = svgEl("text", { x: ANCHO_CAB / 2, y: 31, "text-anchor": "middle", class: "cab-t2" });
      const r = Math.round(parsed.tamEntrada / s);
      t2.textContent = r + "×" + r + " px";
      g.appendChild(t1); g.appendChild(t2);
      gFondo.appendChild(g);
    });
  });

  /* --- aristas ----------------------------------------------------------- */
  const arista = (clase, d, de, a, marcador) => {
    const p = svgEl("path", { class: "arista " + clase, d, "marker-end": `url(#${marcador})` });
    p.dataset.de = de; p.dataset.a = a;
    gAristas.appendChild(p);
  };

  cortas.forEach(s => {
    const A = pos[s.de], B = pos[s.a];
    arista("a-normal",
      rutaHorizontal({ x: A.x + A.w, y: A.y + A.h / 2 }, { x: B.x, y: B.y + B.h / 2 }),
      s.de, s.a, "flecha");
  });

  retornos.forEach(s => {
    const A = pos[s.de], B = pos[s.a];
    const b = bandas[A.banda];
    arista("a-normal a-retorno",
      rutaRetorno({ x: A.x + A.w, y: A.y + A.h / 2 }, { x: B.x, y: B.y + B.h / 2 },
                  anchoTotal + 26, b.yCarril + b.nCarriles * CARRIL + 14, -26),
      s.de, s.a, "flecha");
  });

  saltos.forEach(s => {
    const A = pos[s.de], B = pos[s.a];
    const carrilY = bandas[s.hueco].yCarril + s.carril * CARRIL;
    const p1 = { x: A.x + A.w / 2, y: A.y + A.h };                       // sale por abajo
    const p2 = A.banda === B.banda
      ? { x: B.x + B.w / 2, y: B.y + B.h }                               // vuelve por abajo
      : { x: B.x + B.w / 2, y: B.y };                                    // entra por arriba
    arista("a-salto", rutaCarril(p1, p2, carrilY), s.de, s.a, "flecha-cat");
  });

  /* --- nodos ------------------------------------------------------------- */
  parsed.capas.forEach(c => {
    const etiqueta = c.modulo + (c.n > 1 ? "  ×" + c.n : "");
    let detalle;
    if (c.modulo === "Detect" || c.modulo === "v10Detect") {
      detalle = "entradas " + c.c1.join(" / ") + " ch";
    } else if (c.modulo === "Concat") {
      detalle = c.c1.join(" + ") + " = " + c.c2 + " ch";
    } else {
      detalle = (Array.isArray(c.c1) ? c.c1.join("+") : c.c1) + " → " + c.c2 + " ch · " + c.res + "×" + c.res;
    }
    const n = {
      id: c.i, etiqueta, detalle, tipo: c.familia,
      insignia: "#" + c.i,
      hijo: true,
      destacado: opciones.destacar && opciones.destacar.includes(c.modulo)
    };
    const g = dibujarNodo(n, pos[c.i], { maxEtiqueta: 17, maxDetalle: 26 });
    g.addEventListener("click", (ev) => { ev.stopPropagation(); opciones.alSeleccionar && opciones.alSeleccionar(c); });
    g.addEventListener("mouseenter", () => resaltar(svg, String(c.i), true));
    g.addEventListener("mouseleave", () => resaltar(svg, String(c.i), false));
    gNodos.appendChild(g);
  });

  const caja = {
    x: -HUECO_CAB - 30, y: -62,
    w: anchoTotal + HUECO_CAB + 86,   // +56 para el carril de retorno de la derecha
    h: altoTotal + 92
  };
  const cam = new Camara(svg, capa);
  requestAnimationFrame(() => cam.encuadrarInicio(caja, 30, opciones.margenIzq));
  return { camara: cam, caja };
}

/* ==========================================================================
 * Resaltado por hover
 * ========================================================================== */

function resaltar(svg, id, activo) {
  svg.classList.toggle("con-foco", activo);
  svg.querySelectorAll(".arista").forEach(p => {
    const rel = p.dataset.de === id || p.dataset.a === id;
    p.classList.toggle("viva", activo && rel);
  });
  svg.querySelectorAll(".nodo").forEach(g => {
    const propio = g.dataset.id === id;
    let vecino = false;
    svg.querySelectorAll(".arista").forEach(p => {
      if (p.dataset.de === id && p.dataset.a === g.dataset.id) vecino = true;
      if (p.dataset.a === id && p.dataset.de === g.dataset.id) vecino = true;
    });
    g.classList.toggle("vivo", activo && (propio || vecino));
  });
}

/* ==========================================================================
 * Exportar SVG
 * ========================================================================== */

function descargarSVG(svg, nombre) {
  const clon = svg.cloneNode(true);
  const caja = svg.__caja || { x: 0, y: 0, w: 1200, h: 900 };
  clon.setAttribute("viewBox", `${caja.x} ${caja.y} ${caja.w} ${caja.h}`);
  clon.setAttribute("width", caja.w);
  clon.setAttribute("height", caja.h);
  const g = clon.querySelector(".camara");
  if (g) g.removeAttribute("transform");

  const estilos = [...document.styleSheets].map(s => {
    try { return [...s.cssRules].map(r => r.cssText).join("\n"); } catch (e) { return ""; }
  }).join("\n");
  const st = document.createElementNS(SVGNS, "style");
  st.textContent = estilos;
  clon.insertBefore(st, clon.firstChild);
  clon.setAttribute("xmlns", SVGNS);

  const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', new XMLSerializer().serializeToString(clon)],
                        { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre + ".svg";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
