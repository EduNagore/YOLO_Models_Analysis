/* ============================================================================
 * app.js — Estado de la aplicacion y cableado de la interfaz
 * ========================================================================== */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const estado = {
  modeloId: "yolo11",
  escala: "n",
  entrada: 640,
  vista: "diagrama",
  parsed: null,
  pila: [],          // pila de navegacion del panel (drill-down)
  camaraPrincipal: null,
  camaraSub: null,
  camaraModal: null
};

/* ==========================================================================
 * Selectores superiores
 * ========================================================================== */

function pintarSelectorVersiones() {
  const cont = $("#selectorVersiones");
  cont.innerHTML = "";
  MODELOS.forEach(m => {
    const b = document.createElement("button");
    b.className = "chip-version" + (m.id === estado.modeloId ? " activa" : "");
    b.innerHTML = `<span class="punto"></span>${m.nombre}`;
    if (m.id === estado.modeloId) b.style.background = m.color;
    else b.style.color = m.color;
    b.addEventListener("click", () => {
      estado.modeloId = m.id;
      const esc = escalasDisponibles(m);
      if (!esc.includes(estado.escala)) estado.escala = esc[0];
      estado.pila = [];
      refrescar();
    });
    cont.appendChild(b);
  });
}

function escalasDisponibles(m) {
  if (m.variantes) return Object.keys(m.variantes);
  if (m.scales) return Object.keys(m.scales);
  return ["-"];
}

function pintarSelectorEscala() {
  const m = MODELOS_POR_ID[estado.modeloId];
  const cont = $("#selectorEscala");
  const esc = escalasDisponibles(m);
  cont.innerHTML = "";
  cont.classList.toggle("deshabilitado", esc.length <= 1);
  esc.forEach(e => {
    const b = document.createElement("button");
    b.textContent = e === "-" ? "única" : e;
    b.className = e === estado.escala ? "activa" : "";
    b.addEventListener("click", () => { estado.escala = e; estado.pila = []; refrescar(); });
    cont.appendChild(b);
  });
}

/* ==========================================================================
 * Ficha del modelo
 * ========================================================================== */

function pintarFicha() {
  const m = MODELOS_POR_ID[estado.modeloId];
  const p = estado.parsed;
  const st = m.stats && (m.stats[estado.escala] || m.stats["-"]);

  const nParams = p.capas.length;
  const salidasTxt = p.salidas.map(i => "#" + i).join(" · ");

  let html = `
    <h2 style="color:${m.color}">${m.nombre}<span class="anio">${m.anio}</span></h2>
    <div class="sub">${m.subtitulo}</div>
    <div class="estadisticas">
      <div class="estadistica"><div class="v">${nParams}</div><div class="e">capas YAML</div></div>
      <div class="estadistica"><div class="v">${p.width}×</div><div class="e">width</div></div>
      <div class="estadistica"><div class="v">${p.depth}×</div><div class="e">depth</div></div>
    </div>`;

  if (st) {
    html += `<div class="estadisticas">
      <div class="estadistica"><div class="v">${(st[1] / 1e6).toFixed(2)} M</div><div class="e">parámetros</div></div>
      <div class="estadistica"><div class="v">${st[2]}</div><div class="e">GFLOPs</div></div>
      <div class="estadistica"><div class="v">${st[0]}</div><div class="e">módulos torch</div></div>
    </div>`;
  }

  html += `<p class="resumen">${m.resumen}</p>`;
  if (m.aviso) html += `<div class="aviso">${m.aviso}</div>`;

  html += `<div class="titulillo">Bloques característicos</div><div class="etiquetas">`;
  (m.destacados || []).forEach(d => html += `<span class="etiqueta-bloque destacada">${d}</span>`);
  (m.ausencias || []).forEach(d => html += `<span class="etiqueta-bloque ausente">${d}</span>`);
  html += `</div>`;

  html += `<div class="titulillo">Qué aporta esta versión</div>
           <ul class="lista-novedades">${(m.novedades || []).map(n => `<li>${n}</li>`).join("")}</ul>`;

  html += `<div class="titulillo">Salidas de detección</div>
           <div class="etiquetas">${p.salidas.map((i, k) => {
             const c = p.capas[i];
             return `<span class="etiqueta-bloque">#${i} · ${c.nivelP} · ${c.res}×${c.res} · ${c.c2} ch</span>`;
           }).join("")}</div>`;

  html += `<div class="yaml">${m.yaml}</div>`;

  $("#fichaModelo").innerHTML = html;
}

/* ==========================================================================
 * Leyenda
 * ========================================================================== */

const LEYENDA = [
  ["conv", "Conv / Bottleneck"], ["csp", "Bloque CSP"], ["pool", "Pooling piramidal"],
  ["attn", "Atención"], ["down", "Submuestreo"], ["up", "Upsample"],
  ["concat", "Concat"], ["head", "Cabeza"]
];
function pintarLeyenda() {
  $("#leyenda").innerHTML = LEYENDA.map(([c, t]) =>
    `<div class="it"><span class="sw" style="background:var(--c-${c})"></span>${t}</div>`).join("");
}

/* ==========================================================================
 * Diagrama principal
 * ========================================================================== */

function pintarDiagrama() {
  const m = MODELOS_POR_ID[estado.modeloId];
  const svg = $("#lienzo");
  const r = renderModelo(svg, estado.parsed, {
    destacar: m.destacados,
    alSeleccionar: (capa) => abrirCapa(capa)
  });
  estado.camaraPrincipal = r.camara;
  svg.__caja = r.caja;
}

/* ==========================================================================
 * Panel lateral: drill-down
 * ========================================================================== */

function abrirCapa(capa) {
  const spec = specDeCapa(capa);
  if (!spec) return;
  estado.pila = [{ spec, nombre: "#" + capa.i + " " + capa.modulo, capa }];
  pintarPanel();
}

function empujar(spec, nombre) {
  estado.pila.push({ spec, nombre });
  pintarPanel();
}

function retrocederA(idx) {
  estado.pila = estado.pila.slice(0, idx + 1);
  pintarPanel();
}

function pintarPanel() {
  const nivel = estado.pila[estado.pila.length - 1];
  if (!nivel) {
    $("#panelVacio").classList.remove("oculto");
    $("#panelCuerpo").classList.add("oculto");
    return;
  }
  $("#panelVacio").classList.add("oculto");
  $("#panelCuerpo").classList.remove("oculto");

  const g = expandir(nivel.spec);
  if (!g) return;

  // migas de pan
  const miga = $("#miga");
  miga.innerHTML = "";
  estado.pila.forEach((n, i) => {
    if (i > 0) { const s = document.createElement("span"); s.className = "sep"; s.textContent = "›"; miga.appendChild(s); }
    if (i === estado.pila.length - 1) {
      const s = document.createElement("span"); s.className = "actual"; s.textContent = n.nombre;
      miga.appendChild(s);
    } else {
      const b = document.createElement("button"); b.textContent = n.nombre;
      b.addEventListener("click", () => retrocederA(i));
      miga.appendChild(b);
    }
  });

  $("#panelTitulo").textContent = g.titulo;
  $("#panelFirma").textContent = g.firma || "";
  $("#panelDesc").innerHTML = g.descripcion || "";
  $("#panelFormula").innerHTML = g.formula ? "<code>" + g.formula + "</code>" : "";
  $("#panelNotas").innerHTML = (g.notas || []).map(n => `<li>${n}</li>`).join("");

  // metadatos de la capa (solo en el nivel raiz)
  const meta = $("#panelMeta");
  meta.innerHTML = "";
  if (estado.pila.length === 1 && nivel.capa) {
    const c = nivel.capa;
    const items = [
      ["índice", "#" + c.i],
      ["from", Array.isArray(c.fCrudo) ? "[" + c.fCrudo.join(", ") + "]" : String(c.fCrudo)],
      ["zona", c.zona],
      ["nivel", c.nivelP + " · stride " + c.stride],
      ["resolución", c.res + "×" + c.res],
      ["repeticiones", c.nYaml + (c.n !== c.nYaml ? " → " + c.n + " (×depth)" : "")],
      ["args YAML", "[" + formatearArgs(c.argsYaml) + "]"],
      ["args resueltos", "(" + formatearArgs(c.argsRes) + ")"]
    ];
    meta.innerHTML = items.map(([k, v]) => `<div class="m">${k}: <b>${v}</b></div>`).join("");
    if (c.notas && c.notas.length) {
      meta.innerHTML += c.notas.map(n => `<div class="m" style="border-color:var(--acento);color:var(--acento)">${n}</div>`).join("");
    }
  }

  estado.camaraSub = renderSubgrafo($("#subLienzo"), g, (hijo, nombre) => empujar(hijo, nombre));
  $("#subLienzo").__grafo = g;
}

/* ==========================================================================
 * Vista: tabla de capas
 * ========================================================================== */

function pintarTabla() {
  const p = estado.parsed;
  const m = MODELOS_POR_ID[estado.modeloId];
  $("#avisoTabla").innerHTML =
    `Réplica exacta de lo que imprime <code>parse_model()</code> para ` +
    `<b>${m.nombre}${estado.escala !== "-" ? estado.escala : ""}</b> con entrada ` +
    `${estado.entrada}×${estado.entrada}. Los canales ya llevan aplicado ` +
    `<code>make_divisible(min(c2, ${p.maxChannels === Infinity ? "∞" : p.maxChannels}) × ${p.width}, 8)</code> ` +
    `y las repeticiones <code>round(n × ${p.depth})</code>. Haz clic en una fila para abrir el bloque.`;

  const t = $("#tablaCapas");
  t.innerHTML = `<thead><tr>
    <th>#</th><th>from</th><th>n</th><th>módulo</th><th>args del YAML</th>
    <th>c_in</th><th>c_out</th><th>resolución</th><th>nivel</th><th>zona</th>
  </tr></thead><tbody></tbody>`;
  const tb = t.querySelector("tbody");

  p.capas.forEach(c => {
    const tr = document.createElement("tr");
    tr.className = "fila-capa zona-" + c.zona;
    const cin = Array.isArray(c.c1) ? c.c1.join(" + ") : c.c1;
    tr.innerHTML = `
      <td class="idx">${c.i}</td>
      <td class="idx">${Array.isArray(c.fCrudo) ? "[" + c.fCrudo.join(",") + "]" : c.fCrudo}</td>
      <td class="num">${c.n}${c.n !== c.nYaml ? `<span style="color:var(--texto-3)"> ←${c.nYaml}</span>` : ""}</td>
      <td class="mod" style="color:var(--c-${c.familia})">${c.modulo}</td>
      <td class="args">[${formatearArgs(c.argsYaml)}]</td>
      <td class="num">${cin}</td>
      <td class="num">${c.c2 == null ? "—" : c.c2}</td>
      <td class="num">${c.res}×${c.res}</td>
      <td>${c.nivelP}</td>
      <td style="color:var(--texto-3)">${c.comentario || c.zona}</td>`;
    tr.addEventListener("click", () => {
      cambiarVista("diagrama");
      abrirCapa(c);
    });
    tb.appendChild(tr);
  });
}

/* ==========================================================================
 * Vista: comparativa
 * ========================================================================== */

function pintarComparativa() {
  let html = `<h2 class="seccion">Comparativa entre versiones</h2>
    <p class="seccion-sub">Lo que cambia de verdad entre generaciones no es "más capas": es qué
    bloque compone el backbone, si hay atención, cómo se submuestrea y qué hace la cabeza al
    final. Esta tabla resume esas cuatro decisiones.</p>
    <table class="tabla-comparativa"><thead><tr>` +
    COMPARATIVA.columnas.map(c => `<th>${c}</th>`).join("") + `</tr></thead><tbody>`;

  COMPARATIVA.filas.forEach((f, i) => {
    const enf = COMPARATIVA.resaltar[i] || [];
    html += "<tr>" + f.map((celda, j) =>
      `<td class="${enf.includes(j) ? "enfasis" : ""}">${celda}</td>`).join("") + "</tr>";
  });
  html += `</tbody></table>`;

  html += `<h2 class="seccion">La misma capa, en cada versión</h2>
    <p class="seccion-sub">El bloque que ocupa la primera etapa profunda del backbone
    (la que trabaja a stride 8) con la escala <b>n</b> y entrada 640×640.</p>
    <table class="tabla-comparativa"><thead><tr>
      <th>Versión</th><th>Bloque en P3/8</th><th>c_in → c_out</th><th>repeticiones</th>
      <th>Bloque final del backbone</th><th>Cabeza</th></tr></thead><tbody>`;

  MODELOS.forEach(m => {
    const esc = escalasDisponibles(m);
    const e = esc.includes("n") ? "n" : esc[0];
    const p = parsearModelo(m, e, 640);
    // el primer bloque de procesamiento (no de submuestreo) que trabaja a stride 8
    const enP3 = p.capas.find(c => c.zona === "backbone" && c.stride === 8 &&
                                   !["Conv", "SCDown", "ADown", "AConv"].includes(c.modulo));
    const ultBackbone = p.capas.filter(c => c.zona === "backbone").slice(-1)[0];
    const cab = p.capas[p.capas.length - 1];
    html += `<tr>
      <td style="color:${m.color}">${m.nombre}${e !== "-" ? e : ""}</td>
      <td>${enP3 ? enP3.modulo : "—"}</td>
      <td class="mono">${enP3 ? enP3.c1 + " → " + enP3.c2 : "—"}</td>
      <td class="mono">${enP3 ? enP3.n : "—"}</td>
      <td>${ultBackbone.modulo}</td>
      <td>${cab.modulo} · reg_max ${cab.regMax}${cab.end2end ? " · sin NMS" : ""}</td>
    </tr>`;
  });
  html += `</tbody></table>`;

  $("#contenedorComparativa").innerHTML = html;
}

/* ==========================================================================
 * Vista: glosario
 * ========================================================================== */

function pintarGlosario() {
  const cont = $("#rejillaGlosario");
  cont.innerHTML = "";
  GLOSARIO.forEach(b => {
    const d = document.createElement("div");
    d.className = "tarjeta-bloque f-" + b.familia;
    d.innerHTML = `
      <span class="abrir">ver diagrama →</span>
      <h3>${b.nombre}</h3>
      <div class="lema">${b.lema}</div>
      <p>${b.texto}</p>
      <div class="pie"><span>desde ${b.desde}</span><span>en ${b.en}</span></div>`;
    d.addEventListener("click", () => abrirModal(b));
    cont.appendChild(d);
  });
}

function abrirModal(b) {
  const g = expandir(b.demo);
  if (!g) return;
  $("#modal").classList.remove("oculto");
  $("#modalMiga").innerHTML = `<span class="actual">Glosario › ${b.nombre}</span>`;
  $("#modalTitulo").textContent = g.titulo;
  $("#modalFirma").textContent = g.firma || "";
  $("#modalDesc").innerHTML = b.texto + (g.descripcion ? "<br><br>" + g.descripcion : "");
  $("#modalFormula").innerHTML = g.formula ? "<code>" + g.formula + "</code>" : "";
  $("#modalNotas").innerHTML = (g.notas || []).map(n => `<li>${n}</li>`).join("");
  estado.camaraModal = renderSubgrafo($("#modalLienzo"), g, (hijo, nombre) => {
    const sub = expandir(hijo);
    if (!sub) return;
    abrirModal({ nombre: nombre, texto: "", demo: hijo, familia: b.familia,
                 lema: "", desde: b.desde, en: b.en });
  });
}

/* ==========================================================================
 * Vista: conceptos
 * ========================================================================== */

function pintarConceptos() {
  $("#contenedorConceptos").innerHTML =
    `<h2 class="seccion">Cómo leer estos diagramas</h2>
     <p class="seccion-sub">Seis ideas que hacen que el resto encaje. Si algo del diagrama
     no te cuadra, probablemente la respuesta esté en una de estas tarjetas.</p>
     <div class="rejilla-conceptos">` +
    CONCEPTOS.map(c => `<div class="tarjeta-concepto"><h3>${c.titulo}</h3><p>${c.cuerpo}</p></div>`).join("") +
    `</div>`;
}

/* ==========================================================================
 * Vista: siglas
 * ========================================================================== */

function pintarSiglas() {
  const total = SIGLAS.reduce((n, g) => n + g.entradas.length, 0);

  $("#contenedorSiglas").innerHTML =
    `<h2 class="seccion">Siglas</h2>
     <p class="seccion-sub">Los ${total} acrónimos que aparecen en los diagramas, en las tablas
     y en los nombres de los módulos, con lo que significan y — más útil — lo que hacen
     realmente.</p>` +
    SIGLAS.map(g =>
      `<div class="titulo-grupo">${g.grupo}</div>
       <div class="rejilla-siglas">` +
      g.entradas.map(e =>
        `<div class="tarjeta-sigla">
           <h3>${e.sigla}</h3>
           <div class="de">${e.de}</div>
           <p>${e.texto}</p>
         </div>`).join("") +
      `</div>`).join("");
}

/* ==========================================================================
 * Navegacion entre vistas
 * ========================================================================== */

/** Coloca el area de contenido justo debajo de lo que haya visible arriba. */
function ajustarAltura() {
  const alto = $(".cabecera").getBoundingClientRect().height +
               $("#controles").getBoundingClientRect().height;
  $("#principal").style.top = Math.round(alto) + "px";
}

function cambiarVista(v) {
  estado.vista = v;
  $$(".pes").forEach(b => b.classList.toggle("activa", b.dataset.vista === v));
  $$(".vista").forEach(s => s.classList.toggle("activa", s.dataset.vista === v));
  $("#controles").style.display = (v === "diagrama" || v === "tabla") ? "" : "none";
  ajustarAltura();
  if (v === "diagrama" && estado.camaraPrincipal) {
    requestAnimationFrame(() => estado.camaraPrincipal.encuadrar($("#lienzo").__caja, 30));
  }
}

/* ==========================================================================
 * Refresco global
 * ========================================================================== */

function refrescar() {
  const m = MODELOS_POR_ID[estado.modeloId];
  estado.parsed = parsearModelo(m, estado.escala, estado.entrada);

  pintarSelectorVersiones();
  pintarSelectorEscala();
  pintarFicha();
  pintarLeyenda();
  pintarDiagrama();
  pintarTabla();
  pintarComparativa();
  pintarPanel();

  document.documentElement.style.setProperty("--acento-modelo", m.color);
}

/* ==========================================================================
 * Arranque
 * ========================================================================== */

function iniciar() {
  $$("#pestanas .pes").forEach(b =>
    b.addEventListener("click", () => cambiarVista(b.dataset.vista)));

  $("#selectorEntrada").addEventListener("change", (e) => {
    estado.entrada = parseInt(e.target.value, 10);
    refrescar();
  });

  $("#btnZoomIn").addEventListener("click", () => estado.camaraPrincipal && estado.camaraPrincipal.zoom(1.25));
  $("#btnZoomOut").addEventListener("click", () => estado.camaraPrincipal && estado.camaraPrincipal.zoom(1 / 1.25));
  $("#btnEncuadrar").addEventListener("click", () =>
    estado.camaraPrincipal && estado.camaraPrincipal.encuadrar($("#lienzo").__caja, 30));
  $("#btnSVG").addEventListener("click", () =>
    descargarSVG($("#lienzo"), "yolo-" + estado.modeloId + (estado.escala !== "-" ? estado.escala : "")));

  $$(".sub-herramientas .btn-icono").forEach(b => b.addEventListener("click", () => {
    if (!estado.camaraSub) return;
    const g = $("#subLienzo").__grafo;
    if (b.dataset.sub === "in") estado.camaraSub.zoom(1.25);
    else if (b.dataset.sub === "out") estado.camaraSub.zoom(1 / 1.25);
    else if (g) renderSubgrafoRecolocar();
  }));

  $("#modalCerrar").addEventListener("click", () => $("#modal").classList.add("oculto"));
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") $("#modal").classList.add("oculto");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("#modal").classList.add("oculto");
    if (e.key === "Backspace" && estado.pila.length > 1 &&
        !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      e.preventDefault();
      retrocederA(estado.pila.length - 2);
    }
  });

  window.addEventListener("resize", () => {
    ajustarAltura();
    if (estado.vista === "diagrama" && estado.camaraPrincipal) {
      estado.camaraPrincipal.encuadrar($("#lienzo").__caja, 30);
    }
  });

  pintarGlosario();
  pintarConceptos();
  pintarSiglas();
  refrescar();
  ajustarAltura();
}

function renderSubgrafoRecolocar() {
  const g = $("#subLienzo").__grafo;
  if (g) estado.camaraSub = renderSubgrafo($("#subLienzo"), g, (hijo, nombre) => empujar(hijo, nombre));
}

document.addEventListener("DOMContentLoaded", iniciar);
