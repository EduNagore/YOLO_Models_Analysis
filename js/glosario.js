/* ============================================================================
 * glosario.js — Fichas de bloques y tabla comparativa entre versiones
 * ========================================================================== */

/* Cada ficha se puede abrir en el visor interno con una "spec" de ejemplo,
   para ver el bloque dibujado con canales concretos. */

const GLOSARIO = [
  {
    id: "Conv", nombre: "Conv", familia: "conv",
    desde: "YOLOv1", en: "todas",
    lema: "Conv2d → BatchNorm2d → SiLU",
    texto: "La unidad atomica. Convolucion sin bias (BatchNorm ya aporta el " +
      "desplazamiento), normalizacion por lotes y activacion SiLU (x·sigmoid(x)). " +
      "Con <code>stride=2</code> es ademas el mecanismo de submuestreo por defecto " +
      "en v3, v5, v8, v11, v12 y v26.",
    demo: { tipo: "Conv", c1: 64, c2: 128, k: 3, s: 2 }
  },
  {
    id: "Bottleneck", nombre: "Bottleneck", familia: "conv",
    desde: "YOLOv3", en: "v3 (suelto) · dentro de C3/C2f/C3k2",
    lema: "dos Conv en serie + residual opcional",
    texto: "Reduce a <code>int(c2·e)</code> canales, procesa y vuelve a expandir. " +
      "El atajo residual solo existe si <code>shortcut=True</code> <b>y</b> c1 == c2. " +
      "En YOLOv3 se apilan sueltos (Darknet-53); a partir de v5 viven siempre dentro " +
      "de un bloque CSP.",
    demo: { tipo: "Bottleneck", c1: 256, c2: 256, shortcut: true, k: [[3, 3], [3, 3]], e: 0.5 }
  },
  {
    id: "C3", nombre: "C3", familia: "csp",
    desde: "YOLOv5", en: "v5",
    lema: "CSP con 3 convoluciones · concatena 2 tensores",
    texto: "Parte la entrada en dos ramas 1×1. La rama activa atraviesa N Bottleneck " +
      "en serie; la otra hace bypass. <b>Solo la salida final</b> de la cadena llega " +
      "a la fusion — las intermedias se pierden. Esa es la limitacion que C2f corrige.",
    demo: { tipo: "C3", c1: 256, c2: 256, n: 3, shortcut: true, e: 0.5 }
  },
  {
    id: "C2f", nombre: "C2f", familia: "csp",
    desde: "YOLOv8", en: "v8 · v10",
    lema: "CSP con 2 convoluciones · concatena n+2 tensores",
    texto: "Una sola conv 1×1 produce 2·c canales y un <code>chunk</code> los parte. " +
      "Los N Bottleneck se encadenan y <b>todas</b> las salidas intermedias se " +
      "conservan: la concatenacion final recibe <b>n+2</b> tensores. Mismo coste que " +
      "C3, muchos mas caminos de gradiente.",
    demo: { tipo: "C2f", c1: 256, c2: 256, n: 3, shortcut: true, e: 0.5 }
  },
  {
    id: "C3k2", nombre: "C3k2", familia: "csp",
    desde: "YOLO11", en: "v11 · v12 (parcial) · v26",
    lema: "C2f con unidad interna intercambiable",
    texto: "Hereda literalmente de C2f: mismo esqueleto. Lo unico que cambia es el " +
      "contenido de cada unidad repetible, que puede ser un <b>Bottleneck</b> (escalas " +
      "n/s), un bloque <b>C3k</b> (escalas m/l/x, lo activa <code>parse_model</code> " +
      "solo) o <b>Bottleneck + PSABlock</b> si <code>attn=True</code>.",
    demo: { tipo: "C3k2", c1: 256, c2: 256, n: 2, c3k: false, e: 0.25, attn: false, shortcut: true }
  },
  {
    id: "C3k", nombre: "C3k", familia: "csp",
    desde: "YOLO11", en: "dentro de C3k2 y A2C2f",
    lema: "C3 con kernel configurable",
    texto: "Un C3 normal en el que el kernel de los Bottleneck internos es un " +
      "parametro (por defecto 3×3 en ambas convoluciones, en vez del 1×1 + 3×3 de C3).",
    demo: { tipo: "C3k", c1: 128, c2: 128, n: 2, shortcut: true, e: 0.5, k: 3 }
  },
  {
    id: "SPPF", nombre: "SPPF", familia: "pool",
    desde: "YOLOv5", en: "v5 · v8 · v10 · v11 · v26",
    lema: "3 MaxPool 5×5 en cascada",
    texto: "Agranda el campo receptivo sin tocar la resolucion. Tres MaxPool 5×5 " +
      "<b>encadenados</b> equivalen matematicamente a los kernels 5, 9 y 13 del SPP " +
      "original, pero cuestan mucho menos. YOLO26 le anade un atajo residual.",
    demo: { tipo: "SPPF", c1: 512, c2: 512, k: 5, n: 3, shortcut: false }
  },
  {
    id: "C2PSA", nombre: "C2PSA", familia: "attn",
    desde: "YOLO11", en: "v11 · v26",
    lema: "CSP + N bloques de atencion posicional",
    texto: "Se coloca justo despues del SPPF, al final del backbone. Solo la mitad de " +
      "los canales atraviesa los PSABlock; la otra mitad viaja intacta. Atencion global " +
      "en P5, donde el mapa ya es de 20×20 y sale barata.",
    demo: { tipo: "C2PSA", c1: 512, c2: 512, n: 2, e: 0.5 }
  },
  {
    id: "PSABlock", nombre: "PSABlock", familia: "attn",
    desde: "YOLOv10", en: "dentro de PSA / C2PSA / C3k2(attn)",
    lema: "atencion + residual, FFN + residual",
    texto: "Un bloque transformer sin LayerNorm: el BatchNorm de cada Conv hace ese " +
      "trabajo. La FFN expande ×2 con SiLU y vuelve sin activacion.",
    demo: { tipo: "PSABlock", c: 256, heads: 4, attn_ratio: 0.5 }
  },
  {
    id: "Attention", nombre: "Attention", familia: "attn",
    desde: "YOLOv10", en: "dentro de PSABlock / PSA",
    lema: "qkv en una sola conv 1×1 + pe depthwise",
    texto: "Auto-atencion multi-cabeza implementada con convoluciones. Las claves se " +
      "estrechan por <code>attn_ratio</code> para abaratar el producto q·k. El termino " +
      "<code>pe</code> (DWConv 3×3 sobre v) aporta el sesgo posicional local.",
    demo: { tipo: "Attention", dim: 256, heads: 4, attn_ratio: 0.5 }
  },
  {
    id: "A2C2f", nombre: "A2C2f", familia: "attn",
    desde: "YOLO12", en: "v12",
    lema: "atencion por areas dentro de un esqueleto tipo C2f",
    texto: "El bloque estrella de YOLO12. Sin <code>chunk</code>: cv1 produce c_ canales " +
      "y esa salida es el primer tensor de la concatenacion (n+1 en total). Cada unidad " +
      "son <b>dos ABlock</b>. Con <code>a2=False</code> la atencion desaparece y las " +
      "unidades pasan a ser bloques C3k convolucionales.",
    demo: { tipo: "A2C2f", c1: 256, c2: 256, n: 2, a2: true, area: 4, residual: false, mlp_ratio: 2.0, e: 0.5 }
  },
  {
    id: "AAttn", nombre: "AAttn", familia: "attn",
    desde: "YOLO12", en: "dentro de ABlock",
    lema: "atencion restringida a areas",
    texto: "En vez de atencion global O(N²), el mapa se divide en <code>area</code> " +
      "regiones y la atencion solo ocurre dentro de cada una. Sin ventanas deslizantes " +
      "ni mascaras: un simple reshape. La codificacion posicional sube a DWConv 7×7.",
    demo: { tipo: "AAttn", dim: 256, heads: 8, area: 4 }
  },
  {
    id: "SCDown", nombre: "SCDown", familia: "down",
    desde: "YOLOv10", en: "v10",
    lema: "Conv 1×1 (canales) + DWConv k,s (espacio)",
    texto: "Desacopla las dos funciones que una Conv 3×3 stride-2 mezcla: primero " +
      "ajusta canales sin tocar la resolucion, luego reduce la resolucion sin mezclar " +
      "canales. Mismo efecto, una fraccion del coste.",
    demo: { tipo: "SCDown", c1: 256, c2: 512, k: 3, s: 2 }
  },
  {
    id: "CIB", nombre: "CIB", familia: "csp",
    desde: "YOLOv10", en: "dentro de C2fCIB",
    lema: "DW → PW → DW → PW → DW",
    texto: "Bloque invertido al estilo MobileNet: alterna convoluciones depthwise " +
      "(espaciales, baratas) y pointwise 1×1 (mezcla de canales). Sustituye al " +
      "Bottleneck en las etapas de muchos canales, donde una 3×3 densa seria carisima.",
    demo: { tipo: "CIB", c1: 256, c2: 256, shortcut: true, e: 1.0, lk: false }
  },
  {
    id: "RepNCSPELAN4", nombre: "RepNCSPELAN4", familia: "csp",
    desde: "YOLOv9", en: "v9",
    lema: "GELAN · concatena siempre 4 tensores",
    texto: "El bloque de YOLOv9. Como C2f guarda las salidas intermedias, pero cada " +
      "unidad es un <b>RepCSP + Conv 3×3</b> entero en lugar de un Bottleneck. Los " +
      "anchos c3 y c4 vienen del YAML y no se escalan con width.",
    demo: { tipo: "RepNCSPELAN4", c1: 256, c2: 512, c3: 256, c4: 128, n: 1 }
  },
  {
    id: "ADown", nombre: "ADown", familia: "down",
    desde: "YOLOv9", en: "v9",
    lema: "mitad avg-pool + conv 3×3, mitad max-pool + conv 1×1",
    texto: "Submuestreo hibrido: la mitad de los canales baja conservando la textura " +
      "media y la otra mitad conservando los picos. Se pierde menos informacion que " +
      "con una Conv stride-2 sola.",
    demo: { tipo: "ADown", c1: 256, c2: 512 }
  },
  {
    id: "SPPELAN", nombre: "SPPELAN", familia: "pool",
    desde: "YOLOv9", en: "v9",
    lema: "SPPF con anchos al estilo ELAN",
    texto: "Funcionalmente identico al SPPF (3 MaxPool en cascada, concat de 4). " +
      "La diferencia esta en que el ancho intermedio viene del YAML en vez de " +
      "calcularse como <code>c1 // 2</code>.",
    demo: { tipo: "SPPELAN", c1: 512, c2: 512, c3: 256, k: 5 }
  },
  {
    id: "Detect", nombre: "Detect", familia: "head",
    desde: "YOLOv8", en: "v3u · v5u · v8 · v9 · v11 · v12 · v26",
    lema: "cabeza desacoplada anchor-free + DFL",
    texto: "Tres cabezas gemelas, una por nivel. Cada una se divide en rama de caja " +
      "(4·reg_max canales) y rama de clase (nc canales), <b>independientes</b>. " +
      "A partir de v11 la rama de clase usa DWConv + Conv 1×1 en vez de dos Conv 3×3.",
    demo: { tipo: "Detect", nc: 80, regMax: 16, end2end: false, legacy: false, ch: [64, 128, 256] }
  },
  {
    id: "DFL", nombre: "DFL", familia: "head",
    desde: "YOLOv8", en: "v8 · v9 · v10 · v11 · v12  (eliminado en v26)",
    lema: "la caja como distribucion, no como escalar",
    texto: "Cada lado de la caja se predice como una distribucion sobre <code>reg_max</code> " +
      "bins y se toma la esperanza. La conv 1×1 tiene pesos congelados a [0,1,…,15]: " +
      "literalmente calcula la media ponderada. YOLO26 pone <code>reg_max=1</code> y el " +
      "modulo se convierte en la identidad.",
    demo: { tipo: "DFL", regMax: 16 }
  }
];

/* --------------------------------------------------------------------------
 * Tabla comparativa (resumen del articulo de Ultralytics + los YAML)
 * ------------------------------------------------------------------------ */

const COMPARATIVA = {
  columnas: ["Version", "Año", "Bloque del backbone", "Pooling", "Atencion",
             "Submuestreo", "Cabeza", "DFL", "NMS"],
  filas: [
    ["YOLOv3",  "2018", "Bottleneck (Darknet-53)", "—",            "—",     "Conv s=2",  "anchor-based · (u: anchor-free)", "no · (u: si)", "si"],
    ["YOLOv5",  "2020", "C3",                      "SPPF",         "—",     "Conv s=2",  "anchor-based · (u: anchor-free)", "no · (u: si)", "si"],
    ["YOLOv8",  "2023", "C2f",                     "SPPF",         "—",     "Conv s=2",  "anchor-free desacoplada",         "si (16)",      "si"],
    ["YOLOv9",  "2024", "RepNCSPELAN4 (GELAN)",    "SPPELAN",      "—",     "ADown",     "anchor-free desacoplada",         "si (16)",      "si"],
    ["YOLOv10", "2024", "C2f + C2fCIB",            "SPPF",         "PSA",   "SCDown",    "v10Detect (doble asignacion)",    "si (16)",      "NO"],
    ["YOLO11",  "2024", "C3k2",                    "SPPF",         "C2PSA", "Conv s=2",  "anchor-free · clase con DWConv",  "si (16)",      "si"],
    ["YOLO12",  "2025", "C3k2 + A2C2f",            "—",            "AAttn (por areas)", "Conv s=2", "anchor-free · clase con DWConv", "si (16)", "si"],
    ["YOLO26",  "2025", "C3k2",                    "SPPF + atajo", "C2PSA", "Conv s=2",  "end2end · one-to-one",            "NO (reg_max=1)", "NO"]
  ],
  resaltar: { 4: [8], 7: [7, 8] }   // celdas que merecen enfasis
};

/* --------------------------------------------------------------------------
 * Notas de lectura para la pestana de conceptos
 * ------------------------------------------------------------------------ */

const CONCEPTOS = [
  {
    titulo: "Las tres etapas",
    cuerpo: "Todo YOLO se lee de arriba abajo en tres tramos. El <b>backbone</b> " +
      "reduce la resolucion progresivamente (stride 2 → 4 → 8 → 16 → 32) mientras " +
      "aumenta los canales: extrae caracteristicas cada vez mas abstractas. El " +
      "<b>neck</b> vuelve a subir (FPN, top-down) y luego a bajar (PAN, bottom-up), " +
      "mezclando en cada cruce lo que trae el backbone. La <b>head</b> lee los tres " +
      "niveles resultantes (P3, P4, P5) y predice cajas y clases."
  },
  {
    titulo: "Por que tres escalas",
    cuerpo: "P3 tiene stride 8 (80×80 con entrada 640): mucha resolucion, poca " +
      "semantica — detecta objetos pequenos. P5 tiene stride 32 (20×20): poca " +
      "resolucion, mucha semantica y un campo receptivo enorme — detecta objetos " +
      "grandes. P4 esta en medio. Sin la fusion del neck, P5 no sabria donde estan " +
      "los bordes exactos y P3 no sabria que esta mirando."
  },
  {
    titulo: "Que hace realmente el CSP",
    cuerpo: "Cross-Stage Partial: en vez de que el 100% de los canales atraviese la " +
      "parte cara del bloque, se parte el tensor y solo una fraccion pasa. La otra " +
      "salta directamente a la concatenacion final. Se ahorra computo y, sobre todo, " +
      "se evita que el gradiente recorra siempre el mismo camino largo. Todos los " +
      "bloques desde C3 hasta A2C2f son variaciones de esta misma idea."
  },
  {
    titulo: "depth, width y max_channels",
    cuerpo: "Las escalas n/s/m/l/x no cambian el grafo (salvo en YOLOv10): cambian " +
      "tres numeros. <b>depth</b> multiplica las repeticiones: " +
      "<code>n = max(round(n·depth), 1)</code>. <b>width</b> multiplica los canales: " +
      "<code>c2 = make_divisible(min(c2, max_channels)·width, 8)</code>. " +
      "<b>max_channels</b> pone un techo antes de multiplicar, para que las escalas " +
      "grandes no exploten en las capas profundas. Cambia la escala en el selector y " +
      "mira como se mueven los numeros de cada tarjeta."
  },
  {
    titulo: "Anchor-based frente a anchor-free",
    cuerpo: "Los YOLO clasicos predecian correcciones sobre cajas plantilla (anchors) " +
      "de tamanos predefinidos. Desde v8 la prediccion es directa sobre cada punto de " +
      "la rejilla: cuatro distancias al borde (izquierda, arriba, derecha, abajo). " +
      "Menos hiperparametros que ajustar y menos sesgo hacia el dataset de origen. " +
      "Ultralytics reempaqueto v3 y v5 con esta cabeza moderna y los llama v3u y v5u."
  },
  {
    titulo: "El camino hacia eliminar la NMS",
    cuerpo: "La supresion de no maximos es un post-proceso que no esta en la red: " +
      "cuesta tiempo, tiene umbrales que ajustar y complica la exportacion. YOLOv10 " +
      "fue el primero en atacarlo con doble asignacion (entrena dos cabezas, una " +
      "one-to-many para tener senal densa y una one-to-one para inferir). YOLO26 lo " +
      "consolida con <code>end2end=True</code> y ademas elimina el DFL poniendo " +
      "<code>reg_max=1</code>: el modelo exportado sale mas limpio."
  }
];
