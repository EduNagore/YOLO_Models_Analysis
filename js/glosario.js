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

/* --------------------------------------------------------------------------
 * Siglas: que significa cada acronimo que aparece en la app
 * ------------------------------------------------------------------------ */

const SIGLAS = [
  {
    grupo: "Estructura de la red",
    entradas: [
      { sigla: "FPN", de: "Feature Pyramid Network",
        texto: "La mitad <b>top-down</b> del neck: coge el mapa mas profundo (P5, mucha " +
          "semantica y poca resolucion), lo sube con <code>nn.Upsample</code> y lo concatena " +
          "con lo que viene del backbone. Asi P3 y P4 heredan el <i>que es</i> que solo tenia " +
          "P5. En el diagrama son las flechas que suben." },
      { sigla: "PAN", de: "Path Aggregation Network",
        texto: "La otra mitad del neck, <b>bottom-up</b>: despues de subir vuelve a bajar con " +
          "<code>Conv</code> de stride 2 y concatena otra vez. Devuelve a P4 y P5 la precision " +
          "de bordes que solo tenia P3. FPN + PAN es la \"N\" que dibuja el neck de todos los " +
          "YOLO modernos." },
      { sigla: "CSP", de: "Cross Stage Partial",
        texto: "Partir el tensor en dos: una mitad atraviesa los bloques caros y la otra salta " +
          "directa a la concatenacion final. Menos computo y, sobre todo, gradientes mas cortos. " +
          "Es la idea de la que salen <code>C3</code>, <code>C2f</code>, <code>C3k2</code>, " +
          "<code>C2fCIB</code> y <code>A2C2f</code>." },
      { sigla: "ELAN", de: "Efficient Layer Aggregation Network",
        texto: "Variante de la idea del CSP: en vez de dos ramas encadena varias y las concatena " +
          "todas, de modo que cada bloque intermedio aporta su salida al resultado final." },
      { sigla: "GELAN", de: "Generalized ELAN",
        texto: "El backbone de YOLOv9: un ELAN al que se le permite meter dentro cualquier " +
          "bloque, no solo convoluciones. Aqui aparece como <code>RepNCSPELAN4</code>, que " +
          "lleva <code>RepCSP</code> dentro." },
      { sigla: "PGI", de: "Programmable Gradient Information",
        texto: "Ramas auxiliares que YOLOv9 usa <b>solo durante el entrenamiento</b> para que el " +
          "gradiente llegue limpio a las capas profundas. Se quitan al desplegar, asi que no " +
          "aparecen en estos diagramas: el YAML de inferencia ya viene sin ellas." },
      { sigla: "SPP", de: "Spatial Pyramid Pooling",
        texto: "Aplica varios <code>MaxPool</code> de distinto tamano sobre el mismo tensor y " +
          "concatena los resultados: mezcla contexto de distinto alcance sin cambiar la " +
          "resolucion." },
      { sigla: "SPPF", de: "Spatial Pyramid Pooling, Fast",
        texto: "Lo mismo, pero encadenando tres <code>MaxPool</code> de 5x5 <b>en serie</b> en " +
          "vez de tres en paralelo de 5, 9 y 13. El campo receptivo resultante es equivalente y " +
          "es bastante mas rapido. Cierra el backbone de v5, v8, v10, v11 y v26." },
      { sigla: "SPPELAN", de: "SPP en version ELAN",
        texto: "El SPPF de YOLOv9: los mismos MaxPool encadenados, pero montados con la " +
          "estructura de agregacion de ELAN en vez de con dos convoluciones." }
    ]
  },
  {
    grupo: "Atencion",
    entradas: [
      { sigla: "PSA", de: "Partial Self-Attention",
        texto: "Atencion aplicada solo a <b>una parte</b> de los canales: se parte el tensor, " +
          "una mitad pasa por atencion + FFN y la otra salta directa. La misma idea del CSP, " +
          "aplicada a la atencion para que el coste no se dispare. Aparece suelta en YOLOv10." },
      { sigla: "C2PSA", de: "CSP de 2 convoluciones con PSABlock",
        texto: "El bloque que YOLO11 y YOLO26 colocan justo despues del SPPF: un CSP cuya rama " +
          "activa apila N <code>PSABlock</code>. Es el unico sitio del modelo donde hay " +
          "atencion, y esta al final del backbone, donde el mapa ya es de 20x20 y sale barata." },
      { sigla: "MHSA", de: "Multi-Head Self-Attention",
        texto: "Atencion con varias cabezas en paralelo, cada una mirando un subespacio distinto " +
          "de los canales. Es lo que hay dentro del modulo <code>Attention</code>: cada posicion " +
          "del mapa decide a que otras posiciones mirar." },
      { sigla: "QKV", de: "Query, Key, Value",
        texto: "Las tres proyecciones que la atencion genera del mismo tensor: la <i>query</i> " +
          "pregunta, la <i>key</i> indexa y el <i>value</i> es lo que se devuelve, ponderado por " +
          "el parecido entre las dos primeras. En el drill-down las produce una sola " +
          "<code>Conv</code> 1x1 que luego se parte en tres." },
      { sigla: "AAttn", de: "Area Attention",
        texto: "La atencion de YOLO12. En vez de que cada posicion mire a todas las demas (coste " +
          "cuadratico con la resolucion), el mapa se parte en areas y la atencion solo actua " +
          "dentro de cada una. Eso permite usarla tambien en P3 y P4, no solo en P5." },
      { sigla: "A2C2f", de: "Area-Attention C2f",
        texto: "El <code>C2f</code> de siempre pero con <code>AAttn</code> dentro. En las escalas " +
          "<b>l</b> y <b>x</b> activa ademas <code>residual=True</code> con " +
          "<code>mlp_ratio=1.2</code>: cambia el bloque, no solo su anchura." },
      { sigla: "FFN", de: "Feed-Forward Network",
        texto: "Las dos convoluciones 1x1 que van detras de cada bloque de atencion. Mismo papel " +
          "que en un Transformer: la atencion mezcla <b>posiciones</b>, la FFN mezcla " +
          "<b>canales</b>." },
      { sigla: "MLP", de: "Multi-Layer Perceptron",
        texto: "Otro nombre de lo mismo. <code>mlp_ratio</code> es cuanto se ensancha la capa " +
          "intermedia respecto a la entrada antes de volver a estrecharse." }
    ]
  },
  {
    grupo: "Convoluciones y bloques",
    entradas: [
      { sigla: "BN", de: "Batch Normalization",
        texto: "Normaliza cada canal con la media y la varianza del lote. Por eso todas las " +
          "<code>Conv</code> de YOLO van <b>sin bias</b>: la BN ya aporta su propio termino de " +
          "desplazamiento aprendible, y sumar dos seria redundante." },
      { sigla: "SiLU", de: "Sigmoid Linear Unit",
        texto: "La activacion por defecto: <code>x · sigmoid(x)</code>. A diferencia de la ReLU " +
          "no corta en seco por debajo de cero, lo que suaviza el gradiente. Tambien se la " +
          "conoce como <i>Swish</i>." },
      { sigla: "DWConv", de: "Depthwise Convolution",
        texto: "Una convolucion espacial <b>por canal</b>, sin mezclarlos " +
          "(<code>groups=c</code>). Cuesta del orden de c veces menos que una densa. Combinada " +
          "con una 1x1 detras (que si mezcla) se aproxima al mismo resultado mucho mas barato: " +
          "es lo que hace la rama de clase de YOLO11." },
      { sigla: "PW", de: "Pointwise Convolution",
        texto: "La convolucion 1x1: no mira vecinos, solo recombina canales. Es la pareja natural " +
          "de la depthwise y la pieza con la que casi todos los bloques ajustan su anchura." },
      { sigla: "RepConv", de: "Re-parameterized Convolution",
        texto: "Durante el entrenamiento son varias ramas en paralelo; al exportar se " +
          "<b>fusionan aritmeticamente</b> en una sola convolucion equivalente. Capacidad extra " +
          "mientras entrena, coste cero en inferencia. Es la R de <code>RepNCSPELAN4</code> y de " +
          "<code>RepVGGDW</code>." },
      { sigla: "CIB", de: "Compact Inverted Block",
        texto: "El bloque barato de YOLOv10: cinco convoluciones alternando depthwise (espacial) " +
          "y 1x1 (canales), en el patron de <i>bloque invertido</i> de MobileNet. Sustituye al " +
          "Bottleneck solo en las etapas profundas, donde hay tantos canales que una 3x3 densa " +
          "seria carisima. De ahi <code>C2fCIB</code>." },
      { sigla: "SCDown", de: "Spatial-Channel Decoupled Downsampling",
        texto: "El submuestreo de YOLOv10. Separa las dos cosas que una Conv 3x3 de stride 2 hace " +
          "a la vez: primero una 1x1 ajusta los canales sin tocar la resolucion, luego una " +
          "depthwise de stride 2 baja la resolucion sin mezclar canales." },
      { sigla: "ADown", de: "Average-pool Downsample",
        texto: "El submuestreo de YOLOv9: un AvgPool suave, se parte el tensor en dos y cada " +
          "mitad baja de forma distinta (una con Conv de stride 2, la otra con MaxPool seguido " +
          "de 1x1). Se concatenan al final, asi que conserva las dos lecturas." }
    ]
  },
  {
    grupo: "Cabeza y deteccion",
    entradas: [
      { sigla: "DFL", de: "Distribution Focal Loss",
        texto: "En vez de predecir \"el borde esta a 3.7 celdas\", la red predice una " +
          "<b>distribucion de probabilidad</b> sobre 0…15 y la distancia final es su media " +
          "ponderada. Sale mas preciso en bordes ambiguos, a costa de 16 numeros por lado en " +
          "vez de uno." },
      { sigla: "reg_max", de: "rango de la distribucion del DFL",
        texto: "Cuantos valores tiene esa distribucion: <b>16</b> desde v8. YOLO26 lo pone a " +
          "<b>1</b>, que equivale a quitar el DFL y volver a predecir el numero directamente. " +
          "El modelo exportado sale mas limpio." },
      { sigla: "NMS", de: "Non-Maximum Suppression",
        texto: "Supresion de no maximos: un post-proceso que <b>no esta en la red</b>. Ordena las " +
          "cajas por confianza y borra las que se solapan demasiado con una mejor. Cuesta tiempo, " +
          "tiene umbrales que ajustar a mano y complica la exportacion." },
      { sigla: "IoU", de: "Intersection over Union",
        texto: "Area de solape dividida entre area total de dos cajas: 0 si no se tocan, 1 si son " +
          "identicas. Es el criterio de \"se solapan demasiado\" de la NMS y la vara de medir con " +
          "la que se decide si una deteccion acierta." },
      { sigla: "o2m / o2o", de: "one-to-many / one-to-one",
        texto: "Cuantas predicciones se asignan a cada objeto real al entrenar. <b>One-to-many</b> " +
          "da senal densa y entrena bien, pero deja duplicados que hay que limpiar con NMS. " +
          "<b>One-to-one</b> asigna una sola y no deja duplicados. YOLOv10 entrena las dos a la " +
          "vez y en inferencia usa solo la one-to-one: por eso puede prescindir de la NMS." },
      { sigla: "end2end", de: "extremo a extremo",
        texto: "Que la red entrega las cajas finales sin ningun post-proceso. En la app lo veras " +
          "en <code>v10Detect</code> y en la cabeza de YOLO26." },
      { sigla: "TAL", de: "Task-Aligned Assigner",
        texto: "El criterio que decide que punto de la rejilla se hace responsable de cada objeto " +
          "durante el entrenamiento. Puntua a la vez lo bien que clasifica y lo bien que " +
          "localiza, en vez de mirar solo la distancia al centro." },
      { sigla: "mAP", de: "mean Average Precision",
        texto: "La metrica estandar de deteccion: precision media sobre todas las clases, " +
          "normalmente promediada ademas sobre varios umbrales de IoU (de ahi <i>mAP50-95</i>)." }
    ]
  },
  {
    grupo: "Como leer el diagrama",
    entradas: [
      { sigla: "P1 … P5", de: "niveles de la piramide",
        texto: "<b>Pn</b> es el mapa cuya resolucion se ha dividido entre 2 elevado a n. Con " +
          "entrada 640: P3 = 80x80, P4 = 40x40, P5 = 20x20. Son las <b>columnas</b> del " +
          "diagrama, y P3/P4/P5 son los tres niveles que salen hacia la cabeza." },
      { sigla: "stride", de: "paso, factor de reduccion",
        texto: "Cuanto se ha reducido la resolucion respecto a la entrada. P3 es stride 8, P5 es " +
          "stride 32. Cada <code>Conv</code> de stride 2 (o <code>ADown</code>, o " +
          "<code>SCDown</code>) lo duplica." },
      { sigla: "n/s/m/l/x", de: "nano, small, medium, large, extra-large",
        texto: "Las escalas. No cambian el grafo (salvo en YOLOv10, que usa YAML distintos): " +
          "cambian tres numeros. Cambia el selector de arriba y mira como se mueven los canales " +
          "de cada capa." },
      { sigla: "depth / width", de: "multiplicadores de escala",
        texto: "<code>depth</code> multiplica las repeticiones de cada bloque " +
          "(<code>max(round(n·depth), 1)</code>) y <code>width</code> multiplica los canales " +
          "(<code>make_divisible(min(c2, max_channels)·width, 8)</code>). " +
          "<code>max_channels</code> pone un techo antes de multiplicar." },
      { sigla: "c_in / c_out", de: "canales de entrada y de salida",
        texto: "Los canales reales de cada capa, ya con la escala aplicada. Son dos columnas de " +
          "la tabla y el <code>64 → 128</code> que aparece bajo cada nodo del diagrama." },
      { sigla: "GFLOPs", de: "miles de millones de operaciones en coma flotante",
        texto: "El coste de computar la red una vez, por imagen. Es una medida de trabajo, no de " +
          "velocidad: dos redes con los mismos GFLOPs pueden ir muy distinto segun lo bien que " +
          "aprovechen la GPU." },
      { sigla: "YAML", de: "el formato de los ficheros de modelo",
        texto: "El formato de texto en el que Ultralytics describe cada modelo. Cada linea es " +
          "<code>[from, repeats, module, args]</code>. Todo lo que ves en esta pagina sale de " +
          "esos ficheros." },
      { sigla: "v3u / v5u", de: "v3 y v5 actualizados",
        texto: "Las versiones de YOLOv3 y YOLOv5 reempaquetadas por Ultralytics con la cabeza " +
          "moderna: anchor-free y con DFL. Los YAML que trae el repo son estos, no los " +
          "originales, que eran anchor-based y con cabeza acoplada." }
    ]
  }
];
