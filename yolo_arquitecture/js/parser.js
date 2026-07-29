/* ============================================================================
 * parser.js — Replica fiel de ultralytics/nn/tasks.py :: parse_model()
 * ----------------------------------------------------------------------------
 * Calcula, para cada capa y para la escala elegida:
 *   - canales de entrada (c1) y de salida (c2) reales, ya escalados por width
 *   - numero de repeticiones efectivo (n) tras aplicar depth
 *   - los argumentos resueltos que recibiria el constructor de PyTorch
 *   - el stride acumulado y la resolucion espacial
 *
 * Reglas copiadas del codigo fuente:
 *   c2 = make_divisible(min(c2, max_channels) * width, 8)
 *   n  = max(round(n * depth), 1)  si n > 1
 *   make_divisible(x, d) = ceil(x / d) * d
 * ========================================================================== */

/* --- utilidades numericas ------------------------------------------------- */

function makeDivisible(x, divisor) {
  return Math.ceil(x / divisor) * divisor;
}

/** round() de Python: empates al par (banker's rounding). */
function roundPy(x) {
  const suelo = Math.floor(x);
  const resto = x - suelo;
  if (Math.abs(resto - 0.5) < 1e-9) return suelo % 2 === 0 ? suelo : suelo + 1;
  return Math.round(x);
}

/* --- conjuntos de modulos (identicos a parse_model) ----------------------- */

const MODULOS_BASE = new Set([
  "Classify", "Conv", "ConvTranspose", "GhostConv", "Bottleneck", "GhostBottleneck",
  "SPP", "SPPF", "C2fPSA", "C2PSA", "DWConv", "Focus", "BottleneckCSP", "C1", "C2",
  "C2f", "C3k2", "RepNCSPELAN4", "ELAN1", "ADown", "AConv", "SPPELAN", "C2fAttn",
  "C3", "C3TR", "C3Ghost", "C3x", "RepC3", "PSA", "SCDown", "C2fCIB", "A2C2f"
]);

const MODULOS_REPETIBLES = new Set([
  "BottleneckCSP", "C1", "C2", "C2f", "C3k2", "C2fAttn", "C3", "C3TR", "C3Ghost",
  "C3x", "RepC3", "C2fPSA", "C2fCIB", "C2PSA", "A2C2f"
]);

const MODULOS_CABEZA = new Set(["Detect", "v10Detect", "Segment", "Pose", "OBB"]);

/* Modulos que rompen la compatibilidad "legacy" de la cabeza Detect */
const MODULOS_NO_LEGACY = new Set(["C3k2", "A2C2f", "C2fCIB"]);

/* --- clasificacion visual ------------------------------------------------- */

const FAMILIA = {
  Conv: "conv", DWConv: "conv", GhostConv: "conv", Focus: "conv", ConvTranspose: "conv",
  Bottleneck: "conv",
  C3: "csp", C2f: "csp", C3k2: "csp", C2: "csp", C1: "csp", C3k: "csp",
  BottleneckCSP: "csp", C3x: "csp", C2fCIB: "csp", RepNCSPELAN4: "csp", ELAN1: "csp",
  SPPF: "pool", SPP: "pool", SPPELAN: "pool",
  C2PSA: "attn", PSA: "attn", A2C2f: "attn", C2fPSA: "attn",
  SCDown: "down", ADown: "down", AConv: "down",
  "nn.Upsample": "up",
  Concat: "concat",
  Detect: "head", v10Detect: "head", Segment: "head", Pose: "head", OBB: "head"
};

function familiaDe(m) { return FAMILIA[m] || "otro"; }

/* --- stride que introduce cada modulo ------------------------------------- */

function factorEspacial(modulo, argsYaml) {
  switch (modulo) {
    case "Conv":
    case "DWConv":
      return argsYaml.length >= 3 ? (argsYaml[2] || 1) : 1;
    case "SCDown":
      return argsYaml.length >= 3 ? (argsYaml[2] || 1) : 1;
    case "ADown":
    case "AConv":
      return 2;
    case "nn.Upsample":
      return 1 / (argsYaml[1] || 2);
    default:
      return 1;
  }
}

/* --- resolucion del campo `from` ------------------------------------------ */

function resolverFrom(f, i) {
  const uno = (x) => (x < 0 ? i + x : x);
  return Array.isArray(f) ? f.map(uno) : uno(f);
}

/* ==========================================================================
 * parsearModelo(modelo, escala, tamEntrada)
 * ========================================================================== */

function parsearModelo(modelo, escala, tamEntrada) {
  tamEntrada = tamEntrada || 640;

  // 1. grafo (YOLOv10 tiene un grafo distinto por escala)
  const grafo = modelo.variantes
    ? modelo.variantes[escala] || modelo.variantes[Object.keys(modelo.variantes)[0]]
    : modelo;

  const crudas = [...grafo.backbone, ...grafo.head];
  const nBackbone = grafo.backbone.length;

  // 2. constantes de escalado
  let depth = modelo.depth_multiple != null ? modelo.depth_multiple : 1.0;
  let width = modelo.width_multiple != null ? modelo.width_multiple : 1.0;
  let maxChannels = Infinity;
  if (modelo.scales && modelo.scales[escala]) {
    [depth, width, maxChannels] = modelo.scales[escala];
  }

  const regMax = modelo.reg_max != null ? modelo.reg_max : 16;
  const nc = modelo.nc != null ? modelo.nc : 80;
  const end2end = !!modelo.end2end;

  // 3. legacy: pasa a false en cuanto aparece C3k2 / A2C2f / C2fCIB
  let legacy = true;

  const ch = [];            // ch[j] = canales de salida de la capa j
  const strides = [];       // strides[j] = stride acumulado de la capa j
  const capas = [];

  for (let i = 0; i < crudas.length; i++) {
    const [fCrudo, nCrudo, modulo, argsYamlOrig, comentario] = crudas[i];
    const argsYaml = argsYamlOrig.slice();
    const f = resolverFrom(fCrudo, i);

    // canales de entrada
    const chDe = (j) => (j < 0 ? 3 : ch[j]);
    const c1 = Array.isArray(f) ? f.map(chDe) : chDe(f);

    // repeticiones tras depth
    const n = nCrudo > 1 ? Math.max(roundPy(nCrudo * depth), 1) : nCrudo;

    let c2, argsRes;
    const notas = [];

    if (MODULOS_BASE.has(modulo)) {
      c2 = makeDivisible(Math.min(argsYaml[0], maxChannels) * width, 8);
      argsRes = [c1, c2, ...argsYaml.slice(1)];

      if (MODULOS_REPETIBLES.has(modulo)) argsRes.splice(2, 0, n);

      if (modulo === "C3k2") {
        legacy = false;
        if ("mlx".includes(escala)) {
          argsRes[3] = true;
          notas.push("escala " + escala + " ⇒ <b>c3k = True</b>: cada unidad es un bloque C3k, no un Bottleneck");
        }
      }
      if (modulo === "A2C2f") {
        legacy = false;
        if ("lx".includes(escala)) {
          argsRes.push(true, 1.2);
          notas.push("escala " + escala + " ⇒ <b>residual = True</b> (gamma aprendible) y <b>mlp_ratio = 1.2</b>");
        }
      }
      if (modulo === "C2fCIB") legacy = false;

      if (argsYaml[0] > maxChannels) {
        notas.push("recortado por <code>max_channels = " + maxChannels + "</code>: " +
                   argsYaml[0] + " → " + maxChannels + " antes de multiplicar por width");
      }

    } else if (modulo === "Concat") {
      c2 = c1.reduce((a, b) => a + b, 0);
      argsRes = argsYaml.slice();

    } else if (MODULOS_CABEZA.has(modulo)) {
      c2 = null;
      argsRes = [nc, regMax, end2end || modulo === "v10Detect", c1];

    } else {
      // nn.Upsample y cualquier otro modulo transparente en canales
      c2 = c1;
      argsRes = argsYaml.slice();
    }

    // stride / resolucion
    const strideEntrada = Array.isArray(f)
      ? strides[f[0]]
      : (f < 0 ? 1 : strides[f]);
    const stride = strideEntrada * factorEspacial(modulo, argsYaml);

    capas.push({
      i,
      f,
      fCrudo,
      nYaml: nCrudo,
      n,
      modulo,
      argsYaml,
      argsRes,
      c1,
      c2,
      stride,
      res: Math.round(tamEntrada / stride),
      zona: i < nBackbone ? "backbone" : (modulo === "Detect" || modulo === "v10Detect" ? "cabeza" : "cuello"),
      comentario: comentario || "",
      familia: familiaDe(modulo),
      notas,
      nivelP: nivelPiramide(stride)
    });

    ch.push(c2 == null ? 0 : c2);
    strides.push(stride);
  }

  // el flag legacy solo se conoce al final: se aplica a la cabeza
  const cabeza = capas[capas.length - 1];
  if (MODULOS_CABEZA.has(cabeza.modulo)) {
    cabeza.legacy = legacy;
    cabeza.regMax = regMax;
    cabeza.end2end = end2end || cabeza.modulo === "v10Detect";
    cabeza.nc = nc;
  }

  return {
    modelo, escala, tamEntrada,
    depth, width, maxChannels, regMax, nc, end2end, legacy,
    nBackbone,
    capas,
    salidas: Array.isArray(cabeza.f) ? cabeza.f : [cabeza.f]
  };
}

function nivelPiramide(stride) {
  const mapa = { 1: "P0", 2: "P1", 4: "P2", 8: "P3", 16: "P4", 32: "P5", 64: "P6" };
  return mapa[stride] || ("/" + stride);
}

/* --- formato legible de los argumentos resueltos --------------------------- */

function formatearArgs(args) {
  return args.map(a => {
    if (Array.isArray(a)) return "[" + a.join(", ") + "]";
    if (a === null) return "None";
    if (a === true) return "True";
    if (a === false) return "False";
    if (typeof a === "string") return '"' + a + '"';
    return String(a);
  }).join(", ");
}
