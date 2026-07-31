/* ============================================================================
 * bloques.js — Expansion interna de cada modulo
 * ----------------------------------------------------------------------------
 * Cada expansor recibe una "spec" {tipo, ...parametros} y devuelve un subgrafo
 *      { titulo, firma, formula, descripcion, nodos, aristas, notas }
 * Los nodos con `hijo` son a su vez expandibles (drill-down infinito).
 *
 * Toda la estructura esta transcrita de ultralytics/nn/modules/block.py,
 * conv.py y head.py. Los canales ocultos usan las mismas formulas que el
 * codigo fuente (int(c2*e), c1//2, etc.).
 * ========================================================================== */

const ent = Math.trunc;   // equivalente a int() de Python para positivos

/* --- helpers de construccion de nodos ------------------------------------- */

function nodo(id, etiqueta, detalle, tipo, col, fila, extra) {
  return Object.assign({ id, etiqueta, detalle, tipo, col, fila }, extra || {});
}
function arista(de, a, etiqueta, tipo) {
  return { de, a, etiqueta: etiqueta || "", tipo: tipo || "normal" };
}

/** Encadena una lista de ids con aristas normales. */
function cadena(ids, etiquetas) {
  const out = [];
  for (let i = 0; i < ids.length - 1; i++) {
    out.push(arista(ids[i], ids[i + 1], etiquetas && etiquetas[i]));
  }
  return out;
}

/** Etiqueta compacta de canales. */
function ch(n) { return n + " ch"; }

/** Reparte n unidades repetidas; colapsa si son demasiadas. */
function unidadesVisibles(n, max) {
  max = max || 6;
  if (n <= max) return { indices: Array.from({ length: n }, (_, i) => i), colapsado: false };
  return { indices: [0, 1, -1, n - 1], colapsado: true };
}

/* ==========================================================================
 * Registro de expansores
 * ========================================================================== */

const EXPANSORES = {};

/* ------------------------------- Conv ------------------------------------- */
EXPANSORES.Conv = (s) => {
  const k = s.k != null ? s.k : 1, st = s.s != null ? s.s : 1;
  const g = s.g || 1, act = s.act !== false;
  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 0),
    nodo("c", "Conv2d", `${k}×${k} · stride ${st}` + (g > 1 ? ` · groups=${g}` : "") + " · bias=False", "conv", 1, 0),
    nodo("bn", "BatchNorm2d", ch(s.c2), "norm", 2, 0)
  ];
  let ids = ["in", "c", "bn"];
  if (act) { nodos.push(nodo("a", "SiLU", "x · σ(x)", "act", 3, 0)); ids.push("a"); }
  else nodos.push(nodo("noact", "Identity", "act=False", "act", 3, 0)), ids.push("noact");
  nodos.push(nodo("out", "salida", ch(s.c2), "io", 4, 0));
  ids.push("out");
  return {
    titulo: g > 1 && g === s.c1 ? "DWConv (Conv depthwise)" : "Conv",
    firma: `Conv(c1=${s.c1}, c2=${s.c2}, k=${k}, s=${st}${g > 1 ? ", g=" + g : ""}${act ? "" : ", act=False"})`,
    formula: "y = SiLU(BatchNorm2d(Conv2d(x)))",
    descripcion: "La unidad atomica de todo YOLO: convolucion sin bias, " +
      "normalizacion por lotes y activacion SiLU. El bias sobra porque BatchNorm " +
      "ya aporta un termino de desplazamiento aprendible." +
      (g > 1 && g === s.c1 ? " Aqui <b>groups = canales de entrada</b>, asi que es una convolucion <b>depthwise</b>: cada canal se filtra por separado." : ""),
    nodos, aristas: cadena(ids),
    notas: st > 1 ? ["stride " + st + " ⇒ la resolucion espacial se divide entre " + st] : []
  };
};
EXPANSORES.DWConv = (s) => EXPANSORES.Conv(Object.assign({}, s, { g: s.c1 }));

/* ---------------------------- Bottleneck ---------------------------------- */
EXPANSORES.Bottleneck = (s) => {
  const e = s.e != null ? s.e : 0.5;
  const k = s.k || [3, 3];
  const c_ = ent(s.c2 * e);
  const add = s.shortcut !== false && s.c1 === s.c2;
  const kTxt = (kk) => Array.isArray(kk) ? `${kk[0]}×${kk[1]}` : `${kk}×${kk}`;

  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 1),
    nodo("cv1", "cv1 · Conv", `${kTxt(k[0])} · ${s.c1} → ${c_}`, "conv", 1, 1,
      { hijo: { tipo: "Conv", c1: s.c1, c2: c_, k: Array.isArray(k[0]) ? k[0][0] : k[0], s: 1 } }),
    nodo("cv2", "cv2 · Conv", `${kTxt(k[1])} · ${c_} → ${s.c2}`, "conv", 2, 1,
      { hijo: { tipo: "Conv", c1: c_, c2: s.c2, k: Array.isArray(k[1]) ? k[1][0] : k[1], s: 1 } }),
    nodo("out", "salida", ch(s.c2), "io", 4, 1)
  ];
  const aristas = [arista("in", "cv1"), arista("cv1", "cv2", ch(c_))];

  if (add) {
    nodos.push(nodo("add", "⊕", "suma residual", "op", 3, 1));
    aristas.push(arista("cv2", "add"), arista("in", "add", "identidad", "residual"), arista("add", "out"));
  } else {
    aristas.push(arista("cv2", "out"));
  }

  return {
    titulo: "Bottleneck",
    firma: `Bottleneck(c1=${s.c1}, c2=${s.c2}, shortcut=${s.shortcut !== false}, k=(${kTxt(k[0])}, ${kTxt(k[1])}), e=${e})`,
    formula: add ? "y = x + cv2(cv1(x))" : "y = cv2(cv1(x))",
    descripcion: "Dos convoluciones en serie con un cuello de botella intermedio de " +
      `<code>int(c2 · e) = int(${s.c2} · ${e}) = ${c_}</code> canales. ` +
      (add
        ? "Como <code>shortcut=True</code> <b>y</b> c1 == c2, se anade la conexion residual."
        : "<b>No</b> hay residual: " + (s.shortcut === false ? "<code>shortcut=False</code>." : `c1 (${s.c1}) ≠ c2 (${s.c2}).`)),
    nodos, aristas,
    notas: [
      "El atajo solo existe si <code>shortcut and c1 == c2</code>. En el cuello (neck) los " +
      "canales cambian tras cada Concat, asi que muchas veces se desactiva solo."
    ]
  };
};

/* -------------------------------- C3 -------------------------------------- */
EXPANSORES.C3 = (s) => {
  const e = s.e != null ? s.e : 0.5;
  const c_ = ent(s.c2 * e);
  const n = s.n || 1;
  const kInt = s.kInterno || [[1, 1], [3, 3]];
  const vis = unidadesVisibles(n);

  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 1),
    nodo("cv1", "cv1 · Conv 1×1", `${s.c1} → ${c_} · rama activa`, "conv", 1, 0,
      { hijo: { tipo: "Conv", c1: s.c1, c2: c_, k: 1, s: 1 } }),
    nodo("cv2", "cv2 · Conv 1×1", `${s.c1} → ${c_} · bypass`, "conv", 1, 2,
      { hijo: { tipo: "Conv", c1: s.c1, c2: c_, k: 1, s: 1 } })
  ];
  const aristas = [arista("in", "cv1"), arista("in", "cv2", "", "split")];

  let prev = "cv1", col = 2;
  vis.indices.forEach((idx) => {
    const id = idx === -1 ? "gap" : "m" + idx;
    if (idx === -1) {
      nodos.push(nodo(id, "⋯", `${n - 3} bloques mas`, "gap", col, 0));
    } else {
      nodos.push(nodo(id, `m[${idx}] · ${s.repNombre || "Bottleneck"}`, `${c_} → ${c_}`, "csp", col, 0,
        { hijo: { tipo: s.repNombre || "Bottleneck", c1: c_, c2: c_, shortcut: s.shortcut !== false, k: kInt, e: 1.0 } }));
    }
    aristas.push(arista(prev, id));
    prev = id; col++;
  });

  nodos.push(nodo("cat", "Concat", `${c_} + ${c_} = ${2 * c_} ch`, "op", col, 1));
  nodos.push(nodo("cv3", "cv3 · Conv 1×1", `${2 * c_} → ${s.c2} · fusion`, "conv", col + 1, 1,
    { hijo: { tipo: "Conv", c1: 2 * c_, c2: s.c2, k: 1, s: 1 } }));
  nodos.push(nodo("out", "salida", ch(s.c2), "io", col + 2, 1));
  aristas.push(arista(prev, "cat"), arista("cv2", "cat", "bypass", "concat"),
               arista("cat", "cv3"), arista("cv3", "out"));

  return {
    titulo: s.titulo || "C3 — CSP Bottleneck con 3 convoluciones",
    firma: `${s.titulo ? "C3k" : "C3"}(c1=${s.c1}, c2=${s.c2}, n=${n}, shortcut=${s.shortcut !== false}, e=${e})`,
    formula: "y = cv3( cat( m(cv1(x)), cv2(x) ) )",
    descripcion: "La entrada se duplica en dos ramas 1×1 de " + c_ + " canales. Una atraviesa " +
      `los ${n} Bottleneck en <b>serie</b>; la otra hace bypass. Solo llega a la fusion la ` +
      "<b>salida final</b> de la cadena — las intermedias se descartan. Esa es exactamente la " +
      "diferencia con C2f.",
    nodos, aristas,
    notas: [
      "Los Bottleneck internos usan <code>e=1.0</code>, asi que no reducen canales dentro del bloque.",
      s.titulo ? "En C3k el kernel de los Bottleneck es configurable (aqui 3×3 en ambas convoluciones)."
               : "En C3 los Bottleneck usan kernels <code>((1,1), (3,3))</code>: primero 1×1, luego 3×3."
    ]
  };
};

EXPANSORES.C3k = (s) => EXPANSORES.C3(Object.assign({}, s, {
  titulo: "C3k — C3 con kernel configurable",
  kInterno: [[s.k || 3, s.k || 3], [s.k || 3, s.k || 3]]
}));

EXPANSORES.RepCSP = (s) => EXPANSORES.C3(Object.assign({}, s, {
  titulo: "RepCSP — C3 con RepBottleneck",
  repNombre: "RepBottleneck",
  kInterno: [[3, 3], [3, 3]]
}));

EXPANSORES.RepBottleneck = (s) => {
  const r = EXPANSORES.Bottleneck(s);
  r.titulo = "RepBottleneck";
  r.descripcion += " En RepBottleneck la primera convolucion es un <b>RepConv</b>: " +
    "durante el entrenamiento son dos ramas paralelas (3×3 y 1×1) que se fusionan " +
    "en una unica 3×3 al desplegar el modelo.";
  const cv1 = r.nodos.find(n => n.id === "cv1");
  if (cv1) { cv1.etiqueta = "cv1 · RepConv"; cv1.tipo = "conv"; delete cv1.hijo; }
  return r;
};

/* ------------------------------- C2f -------------------------------------- */
function esqueletoC2f(s, fabricarUnidad, meta) {
  const e = s.e != null ? s.e : 0.5;
  const c = ent(s.c2 * e);
  const n = s.n || 1;
  const vis = unidadesVisibles(n);

  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 1),
    nodo("cv1", "cv1 · Conv 1×1", `${s.c1} → ${2 * c}`, "conv", 1, 1,
      { hijo: { tipo: "Conv", c1: s.c1, c2: 2 * c, k: 1, s: 1 } }),
    nodo("chunk", "chunk(2, dim=1)", `${2 * c} → 2 × ${c}`, "op", 2, 1),
    nodo("y0", "y[0]", ch(c) + " · bypass directo", "tensor", 3, 0),
    nodo("y1", "y[1]", ch(c) + " · entra a la cadena", "tensor", 3, 1)
  ];
  const aristas = [arista("in", "cv1"), arista("cv1", "chunk"),
                   arista("chunk", "y0", "", "split"), arista("chunk", "y1", "", "split")];

  let prev = "y1", col = 4;
  const idsAConcat = ["y0", "y1"];
  vis.indices.forEach((idx) => {
    if (idx === -1) {
      nodos.push(nodo("gap", "⋯", `${n - 3} unidades mas`, "gap", col, 1));
      aristas.push(arista(prev, "gap"));
      prev = "gap"; col++;
      return;
    }
    const id = "m" + idx;
    const u = fabricarUnidad(idx, c);
    nodos.push(nodo(id, u.etiqueta, u.detalle, u.tipo || "csp", col, 1, { hijo: u.hijo }));
    aristas.push(arista(prev, id));
    idsAConcat.push(id);
    prev = id; col++;
  });

  const totalCat = (2 + n) * c;
  nodos.push(nodo("cat", "Concat", `${n + 2} tensores × ${c} = ${totalCat} ch`, "op", col, 1));
  nodos.push(nodo("cv2", "cv2 · Conv 1×1", `${totalCat} → ${s.c2} · fusion`, "conv", col + 1, 1,
    { hijo: { tipo: "Conv", c1: totalCat, c2: s.c2, k: 1, s: 1 } }));
  nodos.push(nodo("out", "salida", ch(s.c2), "io", col + 2, 1));

  idsAConcat.forEach(id => {
    if (nodos.find(nn => nn.id === id)) aristas.push(arista(id, "cat", "", "concat"));
  });
  if (vis.colapsado) aristas.push(arista("gap", "cat", "", "concat"));
  aristas.push(arista("cat", "cv2"), arista("cv2", "out"));

  return Object.assign({
    nodos, aristas,
    formula: "y = [chunk(cv1(x))];  y += [m(y[-1]) for m in self.m];  out = cv2(cat(y))"
  }, meta);
}

EXPANSORES.C2f = (s) => {
  const c = ent(s.c2 * (s.e != null ? s.e : 0.5));
  return esqueletoC2f(s,
    (idx) => ({
      etiqueta: `m[${idx}] · Bottleneck`,
      detalle: `${c} → ${c} · k=3×3, e=1.0`,
      hijo: { tipo: "Bottleneck", c1: c, c2: c, shortcut: s.shortcut === true, k: [[3, 3], [3, 3]], e: 1.0 }
    }),
    {
      titulo: "C2f — CSP Bottleneck con 2 convoluciones, mas rapido",
      firma: `C2f(c1=${s.c1}, c2=${s.c2}, n=${s.n}, shortcut=${s.shortcut === true}, e=${s.e != null ? s.e : 0.5})`,
      descripcion: "Una <b>unica</b> conv 1×1 produce 2·c canales que se parten en dos mitades. " +
        `Los ${s.n} Bottleneck se encadenan sobre la segunda mitad y <b>todas</b> las salidas ` +
        `intermedias se guardan: al final se concatenan <b>n+2 = ${s.n + 2}</b> tensores. ` +
        "Comparado con C3: mismo coste aproximado pero muchos mas caminos de gradiente.",
      notas: [
        "C3 concatena 2 tensores; C2f concatena n+2. Ahi esta toda la mejora.",
        "Los Bottleneck internos usan <code>k=((3,3),(3,3))</code> y <code>e=1.0</code>.",
        s.shortcut === true
          ? "<code>shortcut=True</code>: los Bottleneck internos si llevan residual (c1==c2 dentro)."
          : "<code>shortcut=False</code> (valor por defecto de C2f, tipico en el cuello): sin residual interno."
      ]
    });
};

EXPANSORES.C3k2 = (s) => {
  const e = s.e != null ? s.e : 0.5;
  const c = ent(s.c2 * e);
  const c3k = !!s.c3k, attn = !!s.attn;
  const shortcut = s.shortcut !== false;

  const fabricar = (idx) => {
    if (attn) return {
      etiqueta: `m[${idx}] · Bottleneck + PSABlock`,
      detalle: `${c} → ${c} · con atencion`,
      tipo: "attn",
      hijo: { tipo: "SecuenciaAttn", c }
    };
    if (c3k) return {
      etiqueta: `m[${idx}] · C3k`,
      detalle: `${c} → ${c} · n=2, k=3`,
      hijo: { tipo: "C3k", c1: c, c2: c, n: 2, shortcut, e: 0.5, k: 3 }
    };
    return {
      etiqueta: `m[${idx}] · Bottleneck`,
      detalle: `${c} → ${c} · k=3×3, e=0.5`,
      hijo: { tipo: "Bottleneck", c1: c, c2: c, shortcut, k: [[3, 3], [3, 3]], e: 0.5 }
    };
  };

  const modo = attn ? "Bottleneck + PSABlock (atencion)"
             : c3k ? "bloque C3k"
             : "Bottleneck simple";

  return esqueletoC2f(Object.assign({}, s, { e }), fabricar, {
    titulo: "C3k2 — C2f con unidad interna configurable",
    firma: `C3k2(c1=${s.c1}, c2=${s.c2}, n=${s.n}, c3k=${c3k}, e=${e}, attn=${attn}, shortcut=${shortcut})`,
    descripcion: "C3k2 <b>hereda de C2f</b>: el esqueleto (cv1 → chunk → cadena → concat → cv2) es " +
      `identico. Lo unico que cambia es <b>que</b> hay dentro de cada unidad repetible. Aqui: <b>${modo}</b>.`,
    notas: [
      "Las tres variantes posibles: <code>attn=True</code> → Bottleneck + PSABlock; " +
      "<code>c3k=True</code> → bloque C3k; en otro caso → Bottleneck simple.",
      "<code>parse_model</code> fuerza <code>c3k=True</code> automaticamente en las escalas " +
      "<b>m / l / x</b>. En n y s son Bottleneck sueltos.",
      "Ojo al matiz: aqui el Bottleneck usa <code>e=0.5</code> (por defecto), mientras que en C2f " +
      "se instancia con <code>e=1.0</code>. C3k2 estrecha mas el cuello interno."
    ]
  });
};

EXPANSORES.SecuenciaAttn = (s) => ({
  titulo: "nn.Sequential(Bottleneck, PSABlock)",
  firma: `Bottleneck(${s.c}, ${s.c}) → PSABlock(${s.c}, attn_ratio=0.5, num_heads=max(${s.c}//64, 1)=${Math.max(ent(s.c / 64), 1)})`,
  formula: "y = PSABlock(Bottleneck(x))",
  descripcion: "La unidad que usa C3k2 cuando <code>attn=True</code>: primero extraccion " +
    "convolucional local, despues atencion posicional global.",
  nodos: [
    nodo("in", "entrada", ch(s.c), "io", 0, 0),
    nodo("b", "Bottleneck", `${s.c} → ${s.c}`, "csp", 1, 0,
      { hijo: { tipo: "Bottleneck", c1: s.c, c2: s.c, shortcut: true, k: [[3, 3], [3, 3]], e: 0.5 } }),
    nodo("p", "PSABlock", `${s.c} ch · ${Math.max(ent(s.c / 64), 1)} cabezas`, "attn", 2, 0,
      { hijo: { tipo: "PSABlock", c: s.c, heads: Math.max(ent(s.c / 64), 1), attn_ratio: 0.5 } }),
    nodo("out", "salida", ch(s.c), "io", 3, 0)
  ],
  aristas: cadena(["in", "b", "p", "out"]),
  notas: []
});

/* ------------------------------- SPPF -------------------------------------- */
EXPANSORES.SPPF = (s) => {
  const k = s.k || 5, n = s.n != null ? s.n : 3;
  const c_ = ent(s.c1 / 2);
  const add = !!s.shortcut && s.c1 === s.c2;

  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 1),
    nodo("cv1", "cv1 · Conv 1×1", `${s.c1} → ${c_} · act=False`, "conv", 1, 1,
      { hijo: { tipo: "Conv", c1: s.c1, c2: c_, k: 1, s: 1, act: false } })
  ];
  const aristas = [arista("in", "cv1")];
  let prev = "cv1", col = 2;
  const aCat = ["cv1"];
  for (let j = 0; j < n; j++) {
    const id = "mp" + j;
    nodos.push(nodo(id, `MaxPool2d`, `${k}×${k} · stride 1 · pad ${ent(k / 2)}`, "pool", col, 1));
    aristas.push(arista(prev, id));
    aCat.push(id); prev = id; col++;
  }
  const total = c_ * (n + 1);
  nodos.push(nodo("cat", "Concat", `${n + 1} × ${c_} = ${total} ch`, "op", col, 1));
  nodos.push(nodo("cv2", "cv2 · Conv 1×1", `${total} → ${s.c2}`, "conv", col + 1, 1,
    { hijo: { tipo: "Conv", c1: total, c2: s.c2, k: 1, s: 1 } }));
  aCat.forEach(id => aristas.push(arista(id, "cat", "", "concat")));
  aristas.push(arista("cat", "cv2"));

  if (add) {
    nodos.push(nodo("add", "⊕", "atajo residual", "op", col + 2, 1));
    nodos.push(nodo("out", "salida", ch(s.c2), "io", col + 3, 1));
    aristas.push(arista("cv2", "add"), arista("in", "add", "identidad", "residual"), arista("add", "out"));
  } else {
    nodos.push(nodo("out", "salida", ch(s.c2), "io", col + 2, 1));
    aristas.push(arista("cv2", "out"));
  }

  return {
    titulo: "SPPF — Spatial Pyramid Pooling, Fast",
    firma: `SPPF(c1=${s.c1}, c2=${s.c2}, k=${k}, n=${n}, shortcut=${!!s.shortcut})`,
    formula: "y = [cv1(x)];  y += [m(y[-1])] × n;  out = cv2(cat(y))" + (add ? " + x" : ""),
    descripcion: "El truco: en vez de tres MaxPool <b>paralelos</b> de 5, 9 y 13 (eso era el SPP " +
      "original), aplica <b>el mismo</b> MaxPool 5×5 tres veces <b>en cascada</b>. Dos pools 5×5 " +
      "encadenados tienen el mismo campo receptivo que uno de 9×9, y tres el de uno de 13×13: " +
      "resultado matematicamente equivalente, bastante mas barato.",
    nodos, aristas,
    notas: [
      "<code>stride=1</code> y <code>padding=k//2</code>: la resolucion <b>no</b> cambia, solo se agranda el campo receptivo.",
      "Los canales ocultos son <code>c1 // 2</code>, no dependen de e.",
      "<code>cv1</code> va con <code>act=False</code> (sin SiLU).",
      add ? "YOLO26 activa el atajo residual (<code>shortcut=True</code> y c1 == c2)."
          : "Sin atajo residual (lo introduce YOLO26)."
    ]
  };
};

/* ------------------------------ Attention ---------------------------------- */
EXPANSORES.Attention = (s) => {
  const dim = s.dim, heads = s.heads || 8, ratio = s.attn_ratio != null ? s.attn_ratio : 0.5;
  const headDim = ent(dim / heads);
  const keyDim = ent(headDim * ratio);
  const h = dim + keyDim * heads * 2;

  const nodos = [
    nodo("in", "entrada", ch(dim), "io", 0, 1),
    nodo("qkv", "qkv · Conv 1×1", `${dim} → ${h} · act=False`, "conv", 1, 1,
      { hijo: { tipo: "Conv", c1: dim, c2: h, k: 1, s: 1, act: false } }),
    nodo("split", "split", `q:${keyDim * heads} · k:${keyDim * heads} · v:${headDim * heads}`, "op", 2, 1),
    nodo("q", "q", `${heads}×${keyDim}`, "tensor", 3, 0),
    nodo("k", "k", `${heads}×${keyDim}`, "tensor", 3, 1),
    nodo("v", "v", `${heads}×${headDim}`, "tensor", 3, 2),
    nodo("mm1", "qᵀ · k × escala", `escala = ${keyDim}^-0.5`, "attn", 4, 0),
    nodo("sm", "softmax(dim=-1)", "matriz de atencion N×N", "attn", 5, 0),
    nodo("mm2", "v · attnᵀ", "agregacion ponderada", "attn", 6, 1),
    nodo("pe", "pe · DWConv 3×3", `groups=${dim} · act=False`, "conv", 5, 2),
    nodo("add", "⊕", "atencion + codificacion posicional", "op", 7, 1),
    nodo("proj", "proj · Conv 1×1", `${dim} → ${dim} · act=False`, "conv", 8, 1,
      { hijo: { tipo: "Conv", c1: dim, c2: dim, k: 1, s: 1, act: false } }),
    nodo("out", "salida", ch(dim), "io", 9, 1)
  ];
  const aristas = [
    arista("in", "qkv"), arista("qkv", "split"),
    arista("split", "q", "", "split"), arista("split", "k", "", "split"), arista("split", "v", "", "split"),
    arista("q", "mm1"), arista("k", "mm1"), arista("mm1", "sm"),
    arista("sm", "mm2"), arista("v", "mm2"),
    arista("v", "pe"), arista("mm2", "add"), arista("pe", "add", "", "residual"),
    arista("add", "proj"), arista("proj", "out")
  ];
  return {
    titulo: "Attention — auto-atencion multi-cabeza posicional",
    firma: `Attention(dim=${dim}, num_heads=${heads}, attn_ratio=${ratio})`,
    formula: "x = (v @ softmax(qᵀk·s)ᵀ) + pe(v);  y = proj(x)",
    descripcion: `Una sola conv 1×1 produce q, k y v de golpe (${h} canales). ` +
      `Cada cabeza tiene <code>head_dim = ${dim}/${heads} = ${headDim}</code> y las claves se ` +
      `estrechan a <code>int(${headDim} · ${ratio}) = ${keyDim}</code> para abaratar el producto. ` +
      "El termino <code>pe</code> es una convolucion <b>depthwise 3×3 sobre v</b>: aporta el sesgo " +
      "posicional local que la atencion pura no tiene.",
    nodos, aristas,
    notas: ["Ninguna de las tres convoluciones (qkv, proj, pe) lleva activacion."]
  };
};

/* ------------------------------ PSABlock ----------------------------------- */
EXPANSORES.PSABlock = (s) => {
  const c = s.c, heads = s.heads || 4;
  const nodos = [
    nodo("in", "entrada", ch(c), "io", 0, 1),
    nodo("attn", "attn · Attention", `${heads} cabezas · attn_ratio 0.5`, "attn", 1, 1,
      { hijo: { tipo: "Attention", dim: c, heads, attn_ratio: 0.5 } }),
    nodo("add1", "⊕", "residual", "op", 2, 1),
    nodo("ffn1", "ffn[0] · Conv 1×1", `${c} → ${2 * c} · SiLU`, "conv", 3, 1,
      { hijo: { tipo: "Conv", c1: c, c2: 2 * c, k: 1, s: 1 } }),
    nodo("ffn2", "ffn[1] · Conv 1×1", `${2 * c} → ${c} · act=False`, "conv", 4, 1,
      { hijo: { tipo: "Conv", c1: 2 * c, c2: c, k: 1, s: 1, act: false } }),
    nodo("add2", "⊕", "residual", "op", 5, 1),
    nodo("out", "salida", ch(c), "io", 6, 1)
  ];
  const aristas = [
    arista("in", "attn"), arista("attn", "add1"), arista("in", "add1", "identidad", "residual"),
    arista("add1", "ffn1"), arista("ffn1", "ffn2"), arista("ffn2", "add2"),
    arista("add1", "add2", "identidad", "residual"), arista("add2", "out")
  ];
  return {
    titulo: "PSABlock — Position-Sensitive Attention block",
    firma: `PSABlock(c=${c}, attn_ratio=0.5, num_heads=${heads}, shortcut=True)`,
    formula: "x = x + attn(x);  x = x + ffn(x)",
    descripcion: "Un bloque transformer clasico traducido a convoluciones: atencion + residual, " +
      "despues red feed-forward (expande ×2 y vuelve) + residual. Sin LayerNorm: el BatchNorm que " +
      "lleva dentro cada Conv hace ese trabajo.",
    nodos, aristas, notas: []
  };
};

/* -------------------------------- C2PSA ------------------------------------ */
EXPANSORES.C2PSA = (s) => {
  const e = s.e != null ? s.e : 0.5;
  const c = ent(s.c1 * e);
  const n = s.n || 1;
  const heads = Math.max(ent(c / 64), 1);
  const vis = unidadesVisibles(n);

  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 1),
    nodo("cv1", "cv1 · Conv 1×1", `${s.c1} → ${2 * c}`, "conv", 1, 1,
      { hijo: { tipo: "Conv", c1: s.c1, c2: 2 * c, k: 1, s: 1 } }),
    nodo("split", "split(c, c)", `${2 * c} → 2 × ${c}`, "op", 2, 1),
    nodo("a", "a", ch(c) + " · sin tocar", "tensor", 3, 0),
    nodo("b", "b", ch(c) + " · rama de atencion", "tensor", 3, 1)
  ];
  const aristas = [arista("in", "cv1"), arista("cv1", "split"),
                   arista("split", "a", "", "split"), arista("split", "b", "", "split")];

  let prev = "b", col = 4;
  vis.indices.forEach(idx => {
    const id = idx === -1 ? "gap" : "p" + idx;
    if (idx === -1) nodos.push(nodo(id, "⋯", `${n - 3} bloques mas`, "gap", col, 1));
    else nodos.push(nodo(id, `m[${idx}] · PSABlock`, `${c} ch · ${heads} cabezas`, "attn", col, 1,
      { hijo: { tipo: "PSABlock", c, heads, attn_ratio: 0.5 } }));
    aristas.push(arista(prev, id));
    prev = id; col++;
  });

  nodos.push(nodo("cat", "Concat", `${c} + ${c} = ${2 * c} ch`, "op", col, 1));
  nodos.push(nodo("cv2", "cv2 · Conv 1×1", `${2 * c} → ${s.c1}`, "conv", col + 1, 1,
    { hijo: { tipo: "Conv", c1: 2 * c, c2: s.c1, k: 1, s: 1 } }));
  nodos.push(nodo("out", "salida", ch(s.c1), "io", col + 2, 1));
  aristas.push(arista(prev, "cat"), arista("a", "cat", "", "concat"),
               arista("cat", "cv2"), arista("cv2", "out"));

  return {
    titulo: "C2PSA — CSP con bloques de atencion posicional",
    firma: `C2PSA(c1=${s.c1}, c2=${s.c2}, n=${n}, e=${e})`,
    formula: "a, b = split(cv1(x));  b = m(b);  y = cv2(cat(a, b))",
    descripcion: `Estructura CSP pura: <b>solo la mitad</b> de los canales (${c} de ${2 * c}) pasa por ` +
      `los ${n} PSABlock. La otra mitad viaja intacta hasta la fusion. Asi se consigue atencion global ` +
      "a un coste asumible, justo en el nivel P5 donde el mapa ya es pequeno (20×20 a 640px).",
    nodos, aristas,
    notas: [
      "Se coloca <b>despues del SPPF</b>, al final del backbone, en YOLO11 y YOLO26.",
      `Numero de cabezas = <code>c // 64 = ${c} // 64 = ${ent(c / 64)}</code>.`,
      "C2PSA exige <code>c1 == c2</code>: no cambia el numero de canales."
    ]
  };
};

/* --------------------------------- PSA ------------------------------------- */
EXPANSORES.PSA = (s) => {
  const e = s.e != null ? s.e : 0.5;
  const c = ent(s.c1 * e);
  const heads = Math.max(ent(c / 64), 1);
  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 1),
    nodo("cv1", "cv1 · Conv 1×1", `${s.c1} → ${2 * c}`, "conv", 1, 1,
      { hijo: { tipo: "Conv", c1: s.c1, c2: 2 * c, k: 1, s: 1 } }),
    nodo("split", "split(c, c)", `${2 * c} → 2 × ${c}`, "op", 2, 1),
    nodo("a", "a", ch(c) + " · bypass", "tensor", 3, 0),
    nodo("b", "b", ch(c), "tensor", 3, 1),
    nodo("attn", "attn · Attention", `${heads} cabezas`, "attn", 4, 1,
      { hijo: { tipo: "Attention", dim: c, heads, attn_ratio: 0.5 } }),
    nodo("add1", "⊕", "residual", "op", 5, 1),
    nodo("ffn", "ffn · Conv 1×1 ×2", `${c} → ${2 * c} → ${c}`, "conv", 6, 1),
    nodo("add2", "⊕", "residual", "op", 7, 1),
    nodo("cat", "Concat", `${2 * c} ch`, "op", 8, 1),
    nodo("cv2", "cv2 · Conv 1×1", `${2 * c} → ${s.c1}`, "conv", 9, 1,
      { hijo: { tipo: "Conv", c1: 2 * c, c2: s.c1, k: 1, s: 1 } }),
    nodo("out", "salida", ch(s.c1), "io", 10, 1)
  ];
  const aristas = [
    arista("in", "cv1"), arista("cv1", "split"),
    arista("split", "a", "", "split"), arista("split", "b", "", "split"),
    arista("b", "attn"), arista("attn", "add1"), arista("b", "add1", "", "residual"),
    arista("add1", "ffn"), arista("ffn", "add2"), arista("add1", "add2", "", "residual"),
    arista("add2", "cat"), arista("a", "cat", "", "concat"),
    arista("cat", "cv2"), arista("cv2", "out")
  ];
  return {
    titulo: "PSA — Partial Self-Attention (YOLOv10)",
    firma: `PSA(c1=${s.c1}, c2=${s.c2}, e=${e})`,
    formula: "a, b = split(cv1(x));  b = b + attn(b);  b = b + ffn(b);  y = cv2(cat(a, b))",
    descripcion: "El antecesor directo de C2PSA: identico, pero con un unico bloque de " +
      "atencion + FFN escrito a mano en vez de una lista de PSABlock apilables.",
    nodos, aristas,
    notas: ["C2PSA (YOLO11) es este mismo modulo refactorizado para poder apilar N bloques."]
  };
};

/* -------------------------------- AAttn ------------------------------------ */
EXPANSORES.AAttn = (s) => {
  const dim = s.dim, heads = s.heads || 1, area = s.area || 1;
  const headDim = ent(dim / heads);
  const all = headDim * heads;
  const nodos = [
    nodo("in", "entrada", ch(dim), "io", 0, 1),
    nodo("qkv", "qkv · Conv 1×1", `${dim} → ${all * 3} · act=False`, "conv", 1, 1,
      { hijo: { tipo: "Conv", c1: dim, c2: all * 3, k: 1, s: 1, act: false } }),
    nodo("area", "reparto en areas", area > 1 ? `el mapa se divide en ${area} areas` : "area = 1 → atencion global", "op", 2, 1),
    nodo("split", "split(q, k, v)", `3 × ${all}`, "op", 3, 1),
    nodo("attn", "atencion dentro de cada area", `${heads} cabezas × ${headDim}`, "attn", 4, 1),
    nodo("pe", "pe · DWConv 7×7", `groups=${all} · act=False`, "conv", 4, 2),
    nodo("add", "⊕", "atencion + posicion", "op", 5, 1),
    nodo("proj", "proj · Conv 1×1", `${all} → ${dim} · act=False`, "conv", 6, 1,
      { hijo: { tipo: "Conv", c1: all, c2: dim, k: 1, s: 1, act: false } }),
    nodo("out", "salida", ch(dim), "io", 7, 1)
  ];
  const aristas = [
    arista("in", "qkv"), arista("qkv", "area"), arista("area", "split"),
    arista("split", "attn"), arista("split", "pe", "sobre v"),
    arista("attn", "add"), arista("pe", "add", "", "residual"),
    arista("add", "proj"), arista("proj", "out")
  ];
  return {
    titulo: "AAttn — Area Attention (YOLO12)",
    firma: `AAttn(dim=${dim}, num_heads=${heads}, area=${area})`,
    formula: "y = proj( attn_por_areas(q, k, v) + pe(v) )",
    descripcion: area > 1
      ? `La idea central de YOLO12: en vez de que cada pixel atienda a los ${"N"} pixeles del mapa ` +
        `(coste O(N²)), el mapa se parte en <b>${area} areas</b> y la atencion solo ocurre dentro de ` +
        `cada una. El coste baja a O(N²/${area}) sin necesidad de ventanas deslizantes ni mascaras.`
      : "Con <code>area = 1</code> no hay division: es atencion global sobre todo el mapa. Se usa en " +
        "P5, donde el mapa ya es lo bastante pequeno (20×20) para permitirselo.",
    nodos, aristas,
    notas: ["La codificacion posicional es una DWConv <b>7×7</b> (en Attention normal es 3×3): " +
            "campo receptivo mas amplio para compensar la division en areas."]
  };
};

/* -------------------------------- ABlock ----------------------------------- */
EXPANSORES.ABlock = (s) => {
  const dim = s.dim, heads = s.heads, ratio = s.mlp_ratio != null ? s.mlp_ratio : 1.2;
  const oculto = ent(dim * ratio);
  const nodos = [
    nodo("in", "entrada", ch(dim), "io", 0, 0),
    nodo("attn", "attn · AAttn", `area=${s.area} · ${heads} cabezas`, "attn", 1, 0,
      { hijo: { tipo: "AAttn", dim, heads, area: s.area } }),
    nodo("add1", "⊕", "residual", "op", 2, 0),
    nodo("mlp1", "mlp[0] · Conv 1×1", `${dim} → ${oculto} · SiLU`, "conv", 3, 0,
      { hijo: { tipo: "Conv", c1: dim, c2: oculto, k: 1, s: 1 } }),
    nodo("mlp2", "mlp[1] · Conv 1×1", `${oculto} → ${dim} · act=False`, "conv", 4, 0,
      { hijo: { tipo: "Conv", c1: oculto, c2: dim, k: 1, s: 1, act: false } }),
    nodo("add2", "⊕", "residual", "op", 5, 0),
    nodo("out", "salida", ch(dim), "io", 6, 0)
  ];
  const aristas = [
    arista("in", "attn"), arista("attn", "add1"), arista("in", "add1", "", "residual"),
    arista("add1", "mlp1"), arista("mlp1", "mlp2"), arista("mlp2", "add2"),
    arista("add1", "add2", "", "residual"), arista("add2", "out")
  ];
  return {
    titulo: "ABlock — Area-attention block",
    firma: `ABlock(dim=${dim}, num_heads=${heads}, mlp_ratio=${ratio}, area=${s.area})`,
    formula: "x = x + attn(x);  x = x + mlp(x)",
    descripcion: `Mismo patron que PSABlock (atencion + MLP, ambos con residual) pero con ` +
      `atencion por areas. El MLP expande a <code>int(${dim} · ${ratio}) = ${oculto}</code> canales.`,
    nodos, aristas, notas: []
  };
};

/* -------------------------------- A2C2f ------------------------------------ */
EXPANSORES.A2C2f = (s) => {
  const e = s.e != null ? s.e : 0.5;
  const c_ = ent(s.c2 * e);
  const n = s.n || 1;
  const a2 = s.a2 !== false;
  const ratio = s.mlp_ratio != null ? s.mlp_ratio : 2.0;
  const heads = ent(c_ / 32);
  const vis = unidadesVisibles(n);

  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 1),
    nodo("cv1", "cv1 · Conv 1×1", `${s.c1} → ${c_}`, "conv", 1, 1,
      { hijo: { tipo: "Conv", c1: s.c1, c2: c_, k: 1, s: 1 } })
  ];
  const aristas = [arista("in", "cv1")];
  const aCat = ["cv1"];
  let prev = "cv1", col = 2;

  vis.indices.forEach(idx => {
    if (idx === -1) {
      nodos.push(nodo("gap", "⋯", `${n - 3} unidades mas`, "gap", col, 1));
      aristas.push(arista(prev, "gap")); aCat.push("gap"); prev = "gap"; col++; return;
    }
    const id = "m" + idx;
    if (a2) {
      nodos.push(nodo(id, `m[${idx}] · 2 × ABlock`, `${c_} ch · area=${s.area} · ${heads} cabezas`, "attn", col, 1,
        { hijo: { tipo: "DobleABlock", dim: c_, heads, area: s.area, mlp_ratio: ratio } }));
    } else {
      nodos.push(nodo(id, `m[${idx}] · C3k`, `${c_} → ${c_} · n=2`, "csp", col, 1,
        { hijo: { tipo: "C3k", c1: c_, c2: c_, n: 2, shortcut: true, e: 0.5, k: 3 } }));
    }
    aristas.push(arista(prev, id)); aCat.push(id); prev = id; col++;
  });

  const total = (1 + n) * c_;
  nodos.push(nodo("cat", "Concat", `${n + 1} × ${c_} = ${total} ch`, "op", col, 1));
  nodos.push(nodo("cv2", "cv2 · Conv 1×1", `${total} → ${s.c2}`, "conv", col + 1, 1,
    { hijo: { tipo: "Conv", c1: total, c2: s.c2, k: 1, s: 1 } }));
  aCat.forEach(id => aristas.push(arista(id, "cat", "", "concat")));
  aristas.push(arista("cat", "cv2"));

  if (s.residual) {
    nodos.push(nodo("g", "γ ⊙", "escala aprendible (init 0.01)", "op", col + 2, 1));
    nodos.push(nodo("add", "⊕", "residual de bloque", "op", col + 3, 1));
    nodos.push(nodo("out", "salida", ch(s.c2), "io", col + 4, 1));
    aristas.push(arista("cv2", "g"), arista("g", "add"),
                 arista("in", "add", "identidad", "residual"), arista("add", "out"));
  } else {
    nodos.push(nodo("out", "salida", ch(s.c2), "io", col + 2, 1));
    aristas.push(arista("cv2", "out"));
  }

  return {
    titulo: "A2C2f — Area-Attention C2f",
    firma: `A2C2f(c1=${s.c1}, c2=${s.c2}, n=${n}, a2=${a2}, area=${s.area}, residual=${!!s.residual}, mlp_ratio=${ratio}, e=${e})`,
    formula: "y = [cv1(x)];  y += [m(y[-1]) for m in self.m];  out = cv2(cat(y))" +
             (s.residual ? ";  return x + γ·out" : ""),
    descripcion: a2
      ? `Esqueleto parecido a C2f pero <b>sin chunk</b>: cv1 no duplica canales, produce ${c_} y ` +
        `esa salida es el primer tensor de la concatenacion. Cada unidad son <b>dos ABlock</b> ` +
        `seguidos, o sea ${2 * n} bloques de atencion por areas en total.`
      : `Con <code>a2=False</code> la atencion desaparece: cada unidad es un bloque <b>C3k</b> ` +
        "convolucional normal. Asi es como YOLO12 usa A2C2f en el cuello, donde la resolucion " +
        "es alta y la atencion saldria cara.",
    nodos, aristas,
    notas: [
      `Se concatenan <b>n+1 = ${n + 1}</b> tensores (C2f concatena n+2, porque parte cv1 en dos).`,
      "<code>assert c_ % 32 == 0</code>: la dimension debe ser multiplo de 32 porque las cabezas son <code>c_ // 32</code>.",
      s.residual ? "En escalas l/x <code>parse_model</code> activa <code>residual=True</code> con gamma aprendible y baja mlp_ratio a 1.2."
                 : "En escalas n/s/m no hay residual de bloque ni gamma."
    ]
  };
};

EXPANSORES.DobleABlock = (s) => ({
  titulo: "nn.Sequential(ABlock, ABlock)",
  firma: `2 × ABlock(dim=${s.dim}, num_heads=${s.heads}, mlp_ratio=${s.mlp_ratio}, area=${s.area})`,
  formula: "y = ABlock(ABlock(x))",
  descripcion: "Cada unidad repetible de A2C2f contiene <b>dos</b> ABlock encadenados, no uno.",
  nodos: [
    nodo("in", "entrada", ch(s.dim), "io", 0, 0),
    nodo("a1", "ABlock #0", `area=${s.area}`, "attn", 1, 0, { hijo: Object.assign({ tipo: "ABlock" }, s) }),
    nodo("a2", "ABlock #1", `area=${s.area}`, "attn", 2, 0, { hijo: Object.assign({ tipo: "ABlock" }, s) }),
    nodo("out", "salida", ch(s.dim), "io", 3, 0)
  ],
  aristas: cadena(["in", "a1", "a2", "out"]),
  notas: []
});

/* -------------------------------- SCDown ----------------------------------- */
EXPANSORES.SCDown = (s) => ({
  titulo: "SCDown — Spatial-Channel Decoupled Downsampling",
  firma: `SCDown(c1=${s.c1}, c2=${s.c2}, k=${s.k}, s=${s.s})`,
  formula: "y = cv2(cv1(x))",
  descripcion: "Separa las dos cosas que una Conv 3×3 stride-2 hace a la vez: primero una " +
    "<b>conv 1×1</b> ajusta los canales sin tocar la resolucion, y luego una <b>depthwise</b> " +
    `${s.k}×${s.k} stride ${s.s} reduce la resolucion sin mezclar canales. Mismo efecto, ` +
    "muchisimos menos parametros.",
  nodos: [
    nodo("in", "entrada", ch(s.c1), "io", 0, 0),
    nodo("cv1", "cv1 · Conv 1×1", `${s.c1} → ${s.c2} · solo canales`, "conv", 1, 0,
      { hijo: { tipo: "Conv", c1: s.c1, c2: s.c2, k: 1, s: 1 } }),
    nodo("cv2", "cv2 · DWConv", `${s.k}×${s.k} · stride ${s.s} · groups=${s.c2} · act=False`, "conv", 2, 0,
      { hijo: { tipo: "Conv", c1: s.c2, c2: s.c2, k: s.k, s: s.s, g: s.c2, act: false } }),
    nodo("out", "salida", ch(s.c2) + ` · resolucion ÷${s.s}`, "io", 3, 0)
  ],
  aristas: cadena(["in", "cv1", "cv2", "out"]),
  notas: ["Coste aproximado frente a una Conv 3×3 s=2 normal: del orden de 1/9 de las multiplicaciones espaciales."]
});

/* --------------------------------- CIB ------------------------------------- */
EXPANSORES.CIB = (s) => {
  const e = s.e != null ? s.e : 0.5;
  const c_ = ent(s.c2 * e);
  const add = s.shortcut !== false && s.c1 === s.c2;
  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 0),
    nodo("d1", "DWConv 3×3", `${s.c1} → ${s.c1} · groups=${s.c1}`, "conv", 1, 0,
      { hijo: { tipo: "Conv", c1: s.c1, c2: s.c1, k: 3, s: 1, g: s.c1 } }),
    nodo("p1", "Conv 1×1", `${s.c1} → ${2 * c_}`, "conv", 2, 0,
      { hijo: { tipo: "Conv", c1: s.c1, c2: 2 * c_, k: 1, s: 1 } }),
    nodo("d2", s.lk ? "RepVGGDW" : "DWConv 3×3",
      s.lk ? `${2 * c_} ch · kernel grande 7×7 + 3×3` : `${2 * c_} → ${2 * c_} · groups=${2 * c_}`, "conv", 3, 0),
    nodo("p2", "Conv 1×1", `${2 * c_} → ${s.c2}`, "conv", 4, 0,
      { hijo: { tipo: "Conv", c1: 2 * c_, c2: s.c2, k: 1, s: 1 } }),
    nodo("d3", "DWConv 3×3", `${s.c2} → ${s.c2} · groups=${s.c2}`, "conv", 5, 0,
      { hijo: { tipo: "Conv", c1: s.c2, c2: s.c2, k: 3, s: 1, g: s.c2 } })
  ];
  const aristas = cadena(["in", "d1", "p1", "d2", "p2", "d3"]);
  if (add) {
    nodos.push(nodo("add", "⊕", "residual", "op", 6, 0), nodo("out", "salida", ch(s.c2), "io", 7, 0));
    aristas.push(arista("d3", "add"), arista("in", "add", "identidad", "residual"), arista("add", "out"));
  } else {
    nodos.push(nodo("out", "salida", ch(s.c2), "io", 6, 0));
    aristas.push(arista("d3", "out"));
  }
  return {
    titulo: "CIB — Compact Inverted Block",
    firma: `CIB(c1=${s.c1}, c2=${s.c2}, shortcut=${s.shortcut !== false}, e=${e}, lk=${!!s.lk})`,
    formula: "y = x + cv1(x)   (cv1 = DW → PW → DW → PW → DW)",
    descripcion: "Cinco convoluciones alternando <b>depthwise</b> (espacial, barata) y " +
      "<b>pointwise 1×1</b> (mezcla de canales). Es el patron \"bloque invertido\" de MobileNet " +
      "llevado a YOLO: sustituye al Bottleneck en las etapas profundas de YOLOv10, donde los " +
      "canales son muchos y una conv 3×3 densa seria carisima.",
    nodos, aristas,
    notas: s.lk ? ["<code>lk=True</code>: la conv central es un <b>RepVGGDW</b> (rama 7×7 + rama 3×3 " +
                   "que se fusionan al desplegar). Solo se activa en las escalas pequenas, donde el " +
                   "kernel grande compensa."] : []
  };
};

EXPANSORES.C2fCIB = (s) => {
  const c = ent(s.c2 * (s.e != null ? s.e : 0.5));
  return esqueletoC2f(s,
    (idx) => ({
      etiqueta: `m[${idx}] · CIB`,
      detalle: `${c} → ${c} · lk=${!!s.lk}`,
      hijo: { tipo: "CIB", c1: c, c2: c, shortcut: s.shortcut !== false, e: 1.0, lk: !!s.lk }
    }),
    {
      titulo: "C2fCIB — C2f con bloques CIB",
      firma: `C2fCIB(c1=${s.c1}, c2=${s.c2}, n=${s.n}, shortcut=${s.shortcut !== false}, lk=${!!s.lk})`,
      descripcion: "Exactamente el esqueleto de C2f, pero cada Bottleneck se reemplaza por un " +
        "<b>CIB</b> (bloque invertido con convoluciones depthwise). YOLOv10 lo coloca solo en las " +
        "etapas de mas canales, que es donde el ahorro compensa.",
      notas: ["Los CIB internos se instancian con <code>e=1.0</code>: no estrechan mas el cuello."]
    });
};

/* ---------------------------- RepNCSPELAN4 --------------------------------- */
EXPANSORES.RepNCSPELAN4 = (s) => {
  const c3 = s.c3, c4 = s.c4, n = s.n || 1;
  const mitad = ent(c3 / 2);
  const total = c3 + 2 * c4;
  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 1),
    nodo("cv1", "cv1 · Conv 1×1", `${s.c1} → ${c3}`, "conv", 1, 1,
      { hijo: { tipo: "Conv", c1: s.c1, c2: c3, k: 1, s: 1 } }),
    nodo("chunk", "chunk(2)", `${c3} → 2 × ${mitad}`, "op", 2, 1),
    nodo("y0", "y[0]", ch(mitad) + " · bypass", "tensor", 3, 0),
    nodo("y1", "y[1]", ch(mitad), "tensor", 3, 1),
    nodo("cv2a", "cv2[0] · RepCSP", `${mitad} → ${c4} · n=${n}`, "csp", 4, 1,
      { hijo: { tipo: "RepCSP", c1: mitad, c2: c4, n, shortcut: true, e: 0.5 } }),
    nodo("cv2b", "cv2[1] · Conv 3×3", `${c4} → ${c4}`, "conv", 5, 1,
      { hijo: { tipo: "Conv", c1: c4, c2: c4, k: 3, s: 1 } }),
    nodo("cv3a", "cv3[0] · RepCSP", `${c4} → ${c4} · n=${n}`, "csp", 6, 1,
      { hijo: { tipo: "RepCSP", c1: c4, c2: c4, n, shortcut: true, e: 0.5 } }),
    nodo("cv3b", "cv3[1] · Conv 3×3", `${c4} → ${c4}`, "conv", 7, 1,
      { hijo: { tipo: "Conv", c1: c4, c2: c4, k: 3, s: 1 } }),
    nodo("cat", "Concat", `${mitad}+${mitad}+${c4}+${c4} = ${total} ch`, "op", 8, 1),
    nodo("cv4", "cv4 · Conv 1×1", `${total} → ${s.c2}`, "conv", 9, 1,
      { hijo: { tipo: "Conv", c1: total, c2: s.c2, k: 1, s: 1 } }),
    nodo("out", "salida", ch(s.c2), "io", 10, 1)
  ];
  const aristas = [
    arista("in", "cv1"), arista("cv1", "chunk"),
    arista("chunk", "y0", "", "split"), arista("chunk", "y1", "", "split"),
    arista("y1", "cv2a"), arista("cv2a", "cv2b"), arista("cv2b", "cv3a"),
    arista("cv3a", "cv3b"),
    arista("y0", "cat", "", "concat"), arista("y1", "cat", "", "concat"),
    arista("cv2b", "cat", "", "concat"), arista("cv3b", "cat", "", "concat"),
    arista("cat", "cv4"), arista("cv4", "out")
  ];
  return {
    titulo: "RepNCSPELAN4 — CSP-ELAN (GELAN)",
    firma: `RepNCSPELAN4(c1=${s.c1}, c2=${s.c2}, c3=${c3}, c4=${c4}, n=${n})`,
    formula: "y = chunk(cv1(x));  y += [cv2(y[-1]), cv3(y[-1])];  out = cv4(cat(y))",
    descripcion: "El bloque de YOLOv9. Igual que C2f guarda todas las salidas intermedias, pero " +
      "cada \"unidad\" es un <b>RepCSP + Conv 3×3</b> completo en lugar de un Bottleneck. " +
      `Se concatenan siempre <b>4</b> tensores: las dos mitades del chunk y las salidas de cv2 y cv3.`,
    nodos, aristas,
    notas: [
      "<code>c3</code> y <code>c4</code> vienen del YAML y <b>no</b> se escalan con width: solo args[0] (c2) se escala.",
      "ELAN = Efficient Layer Aggregation Network. GELAN generaliza la idea a cualquier bloque interno."
    ]
  };
};

/* ------------------------------- SPPELAN ----------------------------------- */
EXPANSORES.SPPELAN = (s) => {
  const c3 = s.c3, k = s.k || 5;
  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 0),
    nodo("cv1", "cv1 · Conv 1×1", `${s.c1} → ${c3}`, "conv", 1, 0,
      { hijo: { tipo: "Conv", c1: s.c1, c2: c3, k: 1, s: 1 } }),
    nodo("m1", "cv2 · MaxPool2d", `${k}×${k} · stride 1`, "pool", 2, 0),
    nodo("m2", "cv3 · MaxPool2d", `${k}×${k} · stride 1`, "pool", 3, 0),
    nodo("m3", "cv4 · MaxPool2d", `${k}×${k} · stride 1`, "pool", 4, 0),
    nodo("cat", "Concat", `4 × ${c3} = ${4 * c3} ch`, "op", 5, 0),
    nodo("cv5", "cv5 · Conv 1×1", `${4 * c3} → ${s.c2}`, "conv", 6, 0,
      { hijo: { tipo: "Conv", c1: 4 * c3, c2: s.c2, k: 1, s: 1 } }),
    nodo("out", "salida", ch(s.c2), "io", 7, 0)
  ];
  const aristas = [
    arista("in", "cv1"), arista("cv1", "m1"), arista("m1", "m2"), arista("m2", "m3"),
    arista("cv1", "cat", "", "concat"), arista("m1", "cat", "", "concat"),
    arista("m2", "cat", "", "concat"), arista("m3", "cat", "", "concat"),
    arista("cat", "cv5"), arista("cv5", "out")
  ];
  return {
    titulo: "SPPELAN — SPP en version ELAN",
    firma: `SPPELAN(c1=${s.c1}, c2=${s.c2}, c3=${c3}, k=${k})`,
    formula: "y = [cv1(x), cv2(y0), cv3(y1), cv4(y2)];  out = cv5(cat(y))",
    descripcion: "Funcionalmente es un SPPF: tres MaxPool 5×5 en cascada y concatenacion de los " +
      "cuatro tensores. La diferencia con SPPF esta en los canales — aqui el ancho intermedio " +
      `<code>c3 = ${c3}</code> viene del YAML en vez de calcularse como <code>c1 // 2</code>.`,
    nodos, aristas, notas: []
  };
};

/* -------------------------------- ADown ------------------------------------ */
EXPANSORES.ADown = (s) => {
  const mitadIn = ent(s.c1 / 2), mitadOut = ent(s.c2 / 2);
  const nodos = [
    nodo("in", "entrada", ch(s.c1), "io", 0, 1),
    nodo("avg", "AvgPool2d", "kernel 2 · stride 1", "pool", 1, 1),
    nodo("chunk", "chunk(2)", `${s.c1} → 2 × ${mitadIn}`, "op", 2, 1),
    nodo("x1", "x1", ch(mitadIn), "tensor", 3, 0),
    nodo("x2", "x2", ch(mitadIn), "tensor", 3, 2),
    nodo("cv1", "cv1 · Conv 3×3", `stride 2 · ${mitadIn} → ${mitadOut}`, "conv", 4, 0,
      { hijo: { tipo: "Conv", c1: mitadIn, c2: mitadOut, k: 3, s: 2 } }),
    nodo("mp", "MaxPool2d", "3×3 · stride 2", "pool", 4, 2),
    nodo("cv2", "cv2 · Conv 1×1", `${mitadIn} → ${mitadOut}`, "conv", 5, 2,
      { hijo: { tipo: "Conv", c1: mitadIn, c2: mitadOut, k: 1, s: 1 } }),
    nodo("cat", "Concat", `${mitadOut} + ${mitadOut} = ${s.c2} ch`, "op", 6, 1),
    nodo("out", "salida", ch(s.c2) + " · resolucion ÷2", "io", 7, 1)
  ];
  const aristas = [
    arista("in", "avg"), arista("avg", "chunk"),
    arista("chunk", "x1", "", "split"), arista("chunk", "x2", "", "split"),
    arista("x1", "cv1"), arista("x2", "mp"), arista("mp", "cv2"),
    arista("cv1", "cat", "", "concat"), arista("cv2", "cat", "", "concat"),
    arista("cat", "out")
  ];
  return {
    titulo: "ADown — submuestreo hibrido",
    firma: `ADown(c1=${s.c1}, c2=${s.c2})`,
    formula: "x1, x2 = chunk(avgpool(x));  y = cat(conv3x3_s2(x1), conv1x1(maxpool_s2(x2)))",
    descripcion: "Sustituye a la Conv 3×3 stride-2 de siempre. Reduce la resolucion por dos " +
      "caminos distintos y luego los concatena: media mitad de canales baja con <b>average " +
      "pooling + conv 3×3 stride 2</b> (conserva la textura media) y la otra media con <b>max " +
      "pooling + conv 1×1</b> (conserva los picos). Menos informacion perdida al submuestrear.",
    nodos, aristas, notas: []
  };
};

/* -------------------------------- Concat ----------------------------------- */
EXPANSORES.Concat = (s) => {
  const nodos = [];
  const aristas = [];
  const total = s.chs.reduce((a, b) => a + b, 0);
  s.chs.forEach((c, i) => {
    nodos.push(nodo("i" + i, `capa ${s.desde[i]}`, ch(c), "io", 0, i));
    aristas.push(arista("i" + i, "cat", "", "concat"));
  });
  nodos.push(nodo("cat", "torch.cat", `dim=${s.dim != null ? s.dim : 1} (canales)`, "op", 1, (s.chs.length - 1) / 2));
  nodos.push(nodo("out", "salida", ch(total), "io", 2, (s.chs.length - 1) / 2));
  aristas.push(arista("cat", "out"));
  return {
    titulo: "Concat",
    firma: `Concat(dimension=${s.dim != null ? s.dim : 1})`,
    formula: "y = torch.cat(x, dim=1)",
    descripcion: "Apila tensores <b>por canales</b>. Es lo que materializa las conexiones de la " +
      "FPN/PAN: la resolucion de todas las entradas debe coincidir, y los canales se suman: " +
      s.chs.join(" + ") + " = " + total + ".",
    nodos, aristas, notas: []
  };
};

/* ------------------------------- Upsample ---------------------------------- */
EXPANSORES.Upsample = (s) => ({
  titulo: "nn.Upsample",
  firma: `nn.Upsample(size=None, scale_factor=${s.factor}, mode="${s.modo}")`,
  formula: "y = interpolate(x, scale_factor=" + s.factor + ", mode=\"" + s.modo + "\")",
  descripcion: "Duplica el alto y el ancho por interpolacion del vecino mas cercano. " +
    "<b>Cero parametros</b> y cero convoluciones: los canales no cambian. Es el paso " +
    "top-down de la FPN, que lleva la semantica de P5 hacia resoluciones mas finas.",
  nodos: [
    nodo("in", "entrada", ch(s.c) + " · H×W", "io", 0, 0),
    nodo("up", "interpolate", `×${s.factor} · ${s.modo}`, "up", 1, 0),
    nodo("out", "salida", ch(s.c) + ` · ${s.factor}H×${s.factor}W`, "io", 2, 0)
  ],
  aristas: cadena(["in", "up", "out"]),
  notas: ["Sin parametros aprendibles: por eso en el resumen del modelo no suma ninguno."]
});

/* -------------------------------- Detect ----------------------------------- */
EXPANSORES.Detect = (s) => {
  const chs = s.ch, nc = s.nc, regMax = s.regMax, legacy = s.legacy, end2end = s.end2end;
  const c2 = Math.max(16, ent(chs[0] / 4), regMax * 4);
  const c3 = Math.max(chs[0], Math.min(nc, 100));
  const noOut = nc + regMax * 4;
  const nombresP = ["P3/8", "P4/16", "P5/32"];

  const nodos = [], aristas = [];
  chs.forEach((cIn, i) => {
    const base = i * 3;
    const p = "L" + i;
    nodos.push(nodo(p + "in", `entrada ${nombresP[i] || "P" + i}`, ch(cIn), "io", 0, base + 0.5));

    // rama de caja
    nodos.push(nodo(p + "b1", "cv2[0] · Conv 3×3", `${cIn} → ${c2}`, "conv", 1, base,
      { hijo: { tipo: "Conv", c1: cIn, c2: c2, k: 3, s: 1 } }));
    nodos.push(nodo(p + "b2", "cv2[1] · Conv 3×3", `${c2} → ${c2}`, "conv", 2, base,
      { hijo: { tipo: "Conv", c1: c2, c2: c2, k: 3, s: 1 } }));
    nodos.push(nodo(p + "b3", "cv2[2] · Conv2d 1×1", `${c2} → ${4 * regMax} · caja`, "salida", 3, base));

    // rama de clase
    if (legacy) {
      nodos.push(nodo(p + "c1", "cv3[0] · Conv 3×3", `${cIn} → ${c3}`, "conv", 1, base + 1,
        { hijo: { tipo: "Conv", c1: cIn, c2: c3, k: 3, s: 1 } }));
      nodos.push(nodo(p + "c2", "cv3[1] · Conv 3×3", `${c3} → ${c3}`, "conv", 2, base + 1,
        { hijo: { tipo: "Conv", c1: c3, c2: c3, k: 3, s: 1 } }));
    } else {
      nodos.push(nodo(p + "c1", "cv3[0] · DWConv 3×3 + Conv 1×1", `${cIn} → ${cIn} → ${c3}`, "conv", 1, base + 1,
        { hijo: { tipo: "Conv", c1: cIn, c2: cIn, k: 3, s: 1, g: cIn } }));
      nodos.push(nodo(p + "c2", "cv3[1] · DWConv 3×3 + Conv 1×1", `${c3} → ${c3}`, "conv", 2, base + 1,
        { hijo: { tipo: "Conv", c1: c3, c2: c3, k: 3, s: 1, g: c3 } }));
    }
    nodos.push(nodo(p + "c3", "cv3[2] · Conv2d 1×1", `${c3} → ${nc} · clases`, "salida", 3, base + 1));

    nodos.push(nodo(p + "cat", "Concat", `${4 * regMax} + ${nc} = ${noOut} ch`, "op", 4, base + 0.5));

    aristas.push(
      arista(p + "in", p + "b1", "rama caja", "split"),
      arista(p + "in", p + "c1", "rama clase", "split"),
      arista(p + "b1", p + "b2"), arista(p + "b2", p + "b3"),
      arista(p + "c1", p + "c2"), arista(p + "c2", p + "c3"),
      arista(p + "b3", p + "cat", "", "concat"),
      arista(p + "c3", p + "cat", "", "concat"),
      arista(p + "cat", "dfl")
    );
  });

  const filaMedia = (chs.length * 3 - 1) / 2;
  nodos.push(nodo("dfl", regMax > 1 ? "DFL" : "Identity",
    regMax > 1 ? `Conv2d(${regMax} → 1) congelada + softmax` : "reg_max = 1 ⇒ el DFL desaparece",
    regMax > 1 ? "attn" : "op", 5, filaMedia,
    regMax > 1 ? { hijo: { tipo: "DFL", regMax } } : null));
  nodos.push(nodo("dec", "decodificacion", "distancias ltrb → xyxy sobre la rejilla", "op", 6, filaMedia));
  nodos.push(nodo("fin", end2end ? "salida directa (sin NMS)" : "NMS",
    end2end ? "one-to-one: 1 caja por objeto" : "supresion de no maximos", "salida", 7, filaMedia));
  aristas.push(arista("dfl", "dec"), arista("dec", "fin"));

  return {
    titulo: (s.v10 ? "v10Detect" : "Detect") + " — cabeza desacoplada anchor-free",
    firma: `Detect(nc=${nc}, reg_max=${regMax}, end2end=${end2end}, ch=(${chs.join(", ")}))`,
    formula: "por nivel:  y = cat( cv2(x)  [4·reg_max],  cv3(x)  [nc] )",
    descripcion: `Tres cabezas identicas, una por nivel de la piramide. Cada una se parte en dos ` +
      `ramas <b>independientes</b> (desacoplada): la de <b>caja</b> saca ${4 * regMax} canales y la de ` +
      `<b>clase</b> saca ${nc}. Los anchos internos se derivan del nivel mas fino: ` +
      `<code>c2 = max(16, ${chs[0]}//4, ${regMax}·4) = ${c2}</code> y ` +
      `<code>c3 = max(${chs[0]}, min(${nc}, 100)) = ${c3}</code>.`,
    nodos, aristas,
    notas: [
      legacy
        ? "<b>legacy=True</b> (v3 / v5 / v8 / v9): la rama de clase son dos Conv 3×3 densas."
        : "<b>legacy=False</b> (v11 / v12 / v26): la rama de clase usa DWConv 3×3 + Conv 1×1, " +
          "bastante mas barata. <code>parse_model</code> lo decide solo al detectar C3k2 / A2C2f / C2fCIB.",
      regMax > 1
        ? `<b>DFL activo</b>: cada lado de la caja se predice como una distribucion sobre ${regMax} bins ` +
          "y se toma la esperanza. Por eso la rama de caja saca 4·" + regMax + " = " + (4 * regMax) + " canales."
        : "<b>reg_max = 1</b>: el DFL se convierte en la identidad y ni siquiera aparece en el modelo " +
          "exportado. La caja son 4 escalares directos.",
      end2end
        ? "<b>end2end</b>: existe una copia completa de las cabezas (<code>one2one_cv2/cv3</code>). " +
          "En inferencia solo se usa la rama one-to-one, que da una caja por objeto — <b>sin NMS</b>."
        : "Salida one-to-many: hacen falta NMS para eliminar duplicados."
    ]
  };
};
EXPANSORES.v10Detect = (s) => {
  const r = EXPANSORES.Detect(Object.assign({}, s, { legacy: false, end2end: true, v10: true }));
  r.titulo = "v10Detect — cabeza NMS-free de YOLOv10";
  r.notas.unshift("La rama de clase de v10Detect es aun mas ligera: <code>Conv 3×3 depthwise + " +
    "Conv 1×1</code> repetido dos veces, definido explicitamente en la subclase.");
  return r;
};

EXPANSORES.DFL = (s) => ({
  titulo: "DFL — Distribution Focal Loss (modulo integral)",
  firma: `DFL(c1=${s.regMax})`,
  formula: "y = conv( softmax( x.view(b, 4, reg_max, a).transpose(2,1) ) ).view(b, 4, a)",
  descripcion: `En vez de predecir "el borde esta a 7.3 celdas", la red predice una <b>distribucion ` +
    `de probabilidad sobre ${s.regMax} bins</b> (0, 1, 2 … ${s.regMax - 1}) para cada uno de los 4 lados. ` +
    "El DFL aplica softmax y calcula la <b>esperanza</b> de esa distribucion. La convolucion 1×1 " +
    `tiene los pesos <b>congelados</b> a [0, 1, 2, …, ${s.regMax - 1}], asi que literalmente hace la media ponderada.`,
  nodos: [
    nodo("in", "entrada", `4 × ${s.regMax} canales por ancla`, "io", 0, 0),
    nodo("rs", "reshape", `(b, 4, ${s.regMax}, anclas)`, "op", 1, 0),
    nodo("sm", "softmax(dim=1)", `distribucion sobre los ${s.regMax} bins`, "attn", 2, 0),
    nodo("cv", "Conv2d 1×1", `pesos fijos [0…${s.regMax - 1}] · requires_grad=False`, "conv", 3, 0),
    nodo("out", "salida", "4 distancias (l, t, r, b)", "io", 4, 0)
  ],
  aristas: cadena(["in", "rs", "sm", "cv", "out"]),
  notas: ["Aprender una distribucion en vez de un escalar hace la regresion mucho mas estable " +
          "cuando el borde real es ambiguo (objetos borrosos, ocluidos o mal etiquetados)."]
});

/* ==========================================================================
 * De una capa parseada a la spec de su expansor
 * ========================================================================== */

function specDeCapa(capa) {
  const a = capa.argsRes;
  const y = capa.argsYaml;
  const def = (v, d) => (v === undefined ? d : v);

  switch (capa.modulo) {
    case "Conv":   return { tipo: "Conv", c1: a[0], c2: a[1], k: def(a[2], 1), s: def(a[3], 1), g: 1 };
    case "DWConv": return { tipo: "Conv", c1: a[0], c2: a[1], k: def(a[2], 1), s: def(a[3], 1), g: a[0] };
    case "Bottleneck":
      return { tipo: "Bottleneck", c1: a[0], c2: a[1], shortcut: def(a[2], true), k: [[3, 3], [3, 3]], e: 0.5 };
    case "C3":
      return { tipo: "C3", c1: a[0], c2: a[1], n: a[2], shortcut: def(a[3], true), e: def(a[5], 0.5) };
    case "C2f":
      return { tipo: "C2f", c1: a[0], c2: a[1], n: a[2], shortcut: def(a[3], false), e: def(a[5], 0.5) };
    case "C3k2":
      return { tipo: "C3k2", c1: a[0], c2: a[1], n: a[2], c3k: def(a[3], false), e: def(a[4], 0.5),
               attn: def(a[5], false), shortcut: def(a[7], true) };
    case "SPPF":
      return { tipo: "SPPF", c1: a[0], c2: a[1], k: def(a[2], 5), n: def(a[3], 3), shortcut: def(a[4], false) };
    case "SPPELAN":
      return { tipo: "SPPELAN", c1: a[0], c2: a[1], c3: a[2], k: def(a[3], 5) };
    case "C2PSA":
      return { tipo: "C2PSA", c1: a[0], c2: a[1], n: a[2], e: def(a[3], 0.5) };
    case "PSA":
      return { tipo: "PSA", c1: a[0], c2: a[1], e: def(a[2], 0.5) };
    case "A2C2f":
      return { tipo: "A2C2f", c1: a[0], c2: a[1], n: a[2], a2: def(a[3], true), area: def(a[4], 1),
               residual: def(a[5], false), mlp_ratio: def(a[6], 2.0), e: def(a[7], 0.5) };
    case "SCDown":
      return { tipo: "SCDown", c1: a[0], c2: a[1], k: a[2], s: a[3] };
    case "C2fCIB":
      return { tipo: "C2fCIB", c1: a[0], c2: a[1], n: a[2], shortcut: def(a[3], false),
               lk: def(a[4], false), e: def(a[6], 0.5) };
    case "RepNCSPELAN4":
      return { tipo: "RepNCSPELAN4", c1: a[0], c2: a[1], c3: a[2], c4: a[3], n: def(a[4], 1) };
    case "ADown":
      return { tipo: "ADown", c1: a[0], c2: a[1] };
    case "Concat":
      return { tipo: "Concat", chs: capa.c1, desde: capa.f, dim: y[0] };
    case "nn.Upsample":
      return { tipo: "Upsample", c: capa.c2, factor: y[1], modo: y[2] };
    case "Detect":
      return { tipo: "Detect", nc: capa.nc, regMax: capa.regMax, end2end: capa.end2end,
               legacy: capa.legacy, ch: capa.c1 };
    case "v10Detect":
      return { tipo: "v10Detect", nc: capa.nc, regMax: capa.regMax, end2end: true,
               legacy: false, ch: capa.c1 };
    default:
      return null;
  }
}

function expandir(spec) {
  if (!spec) return null;
  const fn = EXPANSORES[spec.tipo];
  if (!fn) return null;
  const g = fn(spec);
  g.spec = spec;
  return g;
}
