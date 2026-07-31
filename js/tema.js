/* ============================================================================
 * tema.js — Selector de tema de color
 *
 * Cada tema es un bloque html[data-tema="..."] en estilo.css que solo redefine
 * variables CSS, asi que cambiarlo repinta todo (incluido el SVG) sin volver a
 * generar nada. Aqui solo estan el menu y la persistencia.
 * ========================================================================== */

const TEMAS = [
  { id: "noche",     nombre: "Noche",     pista: "azul oscuro (por defecto)",
    fondo: "#0c0f16", texto: "#e6ebf5", acento: "#ffb020" },
  { id: "carbon",    nombre: "Carbón",    pista: "gris neutro, sin azul",
    fondo: "#121212", texto: "#ececec", acento: "#f5a623" },
  { id: "contraste", nombre: "Contraste", pista: "negro y blanco puros",
    fondo: "#000000", texto: "#ffffff", acento: "#ffc53d" },
  { id: "papel",     nombre: "Papel",     pista: "claro y cálido",
    fondo: "#f8f5ef", texto: "#2a2621", acento: "#9c5f00" },
  { id: "claro",     nombre: "Claro",     pista: "blanco frío y nítido",
    fondo: "#ffffff", texto: "#0f1622", acento: "#a35a00" }
];

const CLAVE_TEMA = "yolo-tema";
const TEMA_POR_DEFECTO = "noche";

function temaGuardado() {
  try {
    const t = localStorage.getItem(CLAVE_TEMA);
    return TEMAS.some(x => x.id === t) ? t : TEMA_POR_DEFECTO;
  } catch (e) {
    return TEMA_POR_DEFECTO;
  }
}

function aplicarTema(id) {
  document.documentElement.dataset.tema = id;
  try { localStorage.setItem(CLAVE_TEMA, id); } catch (e) { /* modo privado */ }
  pintarMenuTema();
}

function pintarMenuTema() {
  const menu = document.getElementById("menuTema");
  const actual = document.documentElement.dataset.tema || TEMA_POR_DEFECTO;
  menu.innerHTML = "";

  TEMAS.forEach(t => {
    const b = document.createElement("button");
    b.className = t.id === actual ? "activa" : "";
    b.innerHTML =
      `<span class="muestra" style="background:${t.fondo};color:${t.texto};--m-acento:${t.acento}">Aa</span>` +
      `<span class="txt">${t.nombre}<small>${t.pista}</small></span>` +
      (t.id === actual ? `<span class="tic">✓</span>` : "");
    b.addEventListener("click", () => {
      aplicarTema(t.id);
      cerrarMenuTema();
    });
    menu.appendChild(b);
  });
}

function abrirMenuTema() {
  document.getElementById("menuTema").classList.remove("oculto");
  document.getElementById("btnTema").setAttribute("aria-expanded", "true");
}

function cerrarMenuTema() {
  document.getElementById("menuTema").classList.add("oculto");
  document.getElementById("btnTema").setAttribute("aria-expanded", "false");
}

function iniciarTema() {
  aplicarTema(temaGuardado());

  const btn = document.getElementById("btnTema");
  const menu = document.getElementById("menuTema");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.classList.contains("oculto")) abrirMenuTema();
    else cerrarMenuTema();
  });

  menu.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", cerrarMenuTema);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarMenuTema();
  });
}

document.addEventListener("DOMContentLoaded", iniciarTema);
