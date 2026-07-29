/* ============================================================================
 * datos-modelos.js
 * ----------------------------------------------------------------------------
 * Grafos de arquitectura transcritos VERBATIM desde los .yaml oficiales de
 * Ultralytics (ultralytics/cfg/models/**). Cada capa es:
 *
 *      [ from, repeats, module, [args], "comentario" ]
 *
 * `from`  : -1 = capa anterior, -2 = dos atras, N = indice absoluto,
 *           [a, b] = multiples entradas (Concat / Detect)
 * `repeats`: numero de repeticiones ANTES de aplicar el depth_multiple
 * `args`  : argumentos tal cual aparecen en el YAML (args[0] = canales salida)
 * ========================================================================== */

const MODELOS = [

/* ─────────────────────────────── YOLOv3 ─────────────────────────────────── */
{
  id: "yolov3",
  nombre: "YOLOv3",
  subtitulo: "Darknet-53 · Bottleneck puro",
  anio: 2018,
  yaml: "ultralytics/cfg/models/v3/yolov3.yaml",
  color: "#8b8f9a",
  resumen: "El abuelo. Backbone Darknet-53 que apila <b>Bottleneck</b> residuales " +
           "sin ningun tipo de division CSP: todo el tensor atraviesa cada bloque. " +
           "No hay SPPF ni atencion. El cuello es un FPN puro (solo top-down, " +
           "sin la rama bottom-up de PAN).",
  destacados: ["Bottleneck", "Conv"],
  novedades: [
    "Primera deteccion multi-escala real: 3 cabezas en P3/P4/P5.",
    "Backbone Darknet-53: 53 convoluciones con conexiones residuales.",
    "Sin CSP: cada Bottleneck procesa el 100% de los canales (caro)."
  ],
  ausencias: ["SPPF", "CSP split", "Atencion", "PAN bottom-up"],
  nc: 80, reg_max: 16, end2end: false,
  depth_multiple: 1.0, width_multiple: 1.0,
  scales: null,
  aviso: "Ojo: en Ultralytics este YAML se ensambla con la cabeza <b>Detect</b> " +
         "moderna (anchor-free + DFL). Es lo que la documentacion llama " +
         "<b>YOLOv3u</b>. El YOLOv3 original de Darknet usaba anchors y una " +
         "cabeza acoplada de 1 sola convolucion 1x1.",
  backbone: [
    [-1, 1, "Conv",       [32, 3, 1],   "0"],
    [-1, 1, "Conv",       [64, 3, 2],   "1-P1/2"],
    [-1, 1, "Bottleneck", [64],         "2"],
    [-1, 1, "Conv",       [128, 3, 2],  "3-P2/4"],
    [-1, 2, "Bottleneck", [128],        "4"],
    [-1, 1, "Conv",       [256, 3, 2],  "5-P3/8"],
    [-1, 8, "Bottleneck", [256],        "6"],
    [-1, 1, "Conv",       [512, 3, 2],  "7-P4/16"],
    [-1, 8, "Bottleneck", [512],        "8"],
    [-1, 1, "Conv",       [1024, 3, 2], "9-P5/32"],
    [-1, 4, "Bottleneck", [1024],       "10"]
  ],
  head: [
    [-1, 1, "Bottleneck", [1024, false], "11"],
    [-1, 1, "Conv",       [512, 1, 1],   "12"],
    [-1, 1, "Conv",       [1024, 3, 1],  "13"],
    [-1, 1, "Conv",       [512, 1, 1],   "14"],
    [-1, 1, "Conv",       [1024, 3, 1],  "15 (P5/32-large)"],

    [-2, 1, "Conv",        [256, 1, 1],           "16"],
    [-1, 1, "nn.Upsample", [null, 2, "nearest"],  "17"],
    [[-1, 8], 1, "Concat", [1],                   "18 · cat backbone P4"],
    [-1, 1, "Bottleneck",  [512, false],          "19"],
    [-1, 1, "Bottleneck",  [512, false],          "20"],
    [-1, 1, "Conv",        [256, 1, 1],           "21"],
    [-1, 1, "Conv",        [512, 3, 1],           "22 (P4/16-medium)"],

    [-2, 1, "Conv",        [128, 1, 1],           "23"],
    [-1, 1, "nn.Upsample", [null, 2, "nearest"],  "24"],
    [[-1, 6], 1, "Concat", [1],                   "25 · cat backbone P3"],
    [-1, 1, "Bottleneck",  [256, false],          "26"],
    [-1, 2, "Bottleneck",  [256, false],          "27 (P3/8-small)"],

    [[27, 22, 15], 1, "Detect", ["nc"], "28 · Detect(P3, P4, P5)"]
  ]
},

/* ─────────────────────────────── YOLOv5 ─────────────────────────────────── */
{
  id: "yolov5",
  nombre: "YOLOv5",
  subtitulo: "C3 (CSP) · SPPF · PAN",
  anio: 2020,
  yaml: "ultralytics/cfg/models/v5/yolov5.yaml",
  color: "#4f9ae0",
  resumen: "Introduce el bloque <b>C3</b>: el tensor se parte en dos ramas 1x1; " +
           "una atraviesa N Bottleneck y la otra hace bypass. Solo la salida " +
           "<i>final</i> de la cadena llega a la fusion. Estrena el <b>SPPF</b> " +
           "y anade la rama bottom-up (PAN) al cuello.",
  destacados: ["C3", "SPPF"],
  novedades: [
    "C3: CSP con 3 convoluciones 1x1 (cv1 rama activa, cv2 bypass, cv3 fusion).",
    "SPPF: 3 MaxPool 5x5 encadenados = SPP(5,9,13) pero mucho mas barato.",
    "Cuello FPN + PAN completo (top-down y luego bottom-up).",
    "Escalado compuesto n/s/m/l/x mediante depth & width multiples."
  ],
  ausencias: ["Atencion", "Cabeza desacoplada (en el v5 original)"],
  nc: 80, reg_max: 16, end2end: false,
  scales: { n: [0.33, 0.25, 1024], s: [0.33, 0.50, 1024], m: [0.67, 0.75, 1024],
            l: [1.00, 1.00, 1024], x: [1.33, 1.25, 1024] },
  aviso: "Igual que v3: Ultralytics lo ensambla con la cabeza <b>Detect</b> " +
         "anchor-free + DFL (<b>YOLOv5u</b>). El v5 original era anchor-based " +
         "con cabeza acoplada.",
  backbone: [
    [-1, 1, "Conv", [64, 6, 2, 2], "0-P1/2"],
    [-1, 1, "Conv", [128, 3, 2],   "1-P2/4"],
    [-1, 3, "C3",   [128],         "2"],
    [-1, 1, "Conv", [256, 3, 2],   "3-P3/8"],
    [-1, 6, "C3",   [256],         "4"],
    [-1, 1, "Conv", [512, 3, 2],   "5-P4/16"],
    [-1, 9, "C3",   [512],         "6"],
    [-1, 1, "Conv", [1024, 3, 2],  "7-P5/32"],
    [-1, 3, "C3",   [1024],        "8"],
    [-1, 1, "SPPF", [1024, 5],     "9"]
  ],
  head: [
    [-1, 1, "Conv",        [512, 1, 1],          "10"],
    [-1, 1, "nn.Upsample", [null, 2, "nearest"], "11"],
    [[-1, 6], 1, "Concat", [1],                  "12 · cat backbone P4"],
    [-1, 3, "C3",          [512, false],         "13"],

    [-1, 1, "Conv",        [256, 1, 1],          "14"],
    [-1, 1, "nn.Upsample", [null, 2, "nearest"], "15"],
    [[-1, 4], 1, "Concat", [1],                  "16 · cat backbone P3"],
    [-1, 3, "C3",          [256, false],         "17 (P3/8-small)"],

    [-1, 1, "Conv",         [256, 3, 2],         "18"],
    [[-1, 14], 1, "Concat", [1],                 "19 · cat head P4"],
    [-1, 3, "C3",           [512, false],        "20 (P4/16-medium)"],

    [-1, 1, "Conv",         [512, 3, 2],         "21"],
    [[-1, 10], 1, "Concat", [1],                 "22 · cat head P5"],
    [-1, 3, "C3",           [1024, false],       "23 (P5/32-large)"],

    [[17, 20, 23], 1, "Detect", ["nc"], "24 · Detect(P3, P4, P5)"]
  ]
},

/* ─────────────────────────────── YOLOv8 ─────────────────────────────────── */
{
  id: "yolov8",
  nombre: "YOLOv8",
  subtitulo: "C2f · anchor-free · DFL",
  anio: 2023,
  yaml: "ultralytics/cfg/models/v8/yolov8.yaml",
  color: "#22c39a",
  resumen: "Sustituye C3 por <b>C2f</b>: una sola conv 1x1 parte el tensor en 2, " +
           "los N Bottleneck se encadenan y <b>todas</b> las salidas intermedias " +
           "(n+2 tensores) se concatenan antes de la fusion. Mas gradiente, mismo " +
           "coste. Cabeza <b>anchor-free desacoplada</b> con DFL (reg_max=16).",
  destacados: ["C2f", "SPPF", "Detect"],
  novedades: [
    "C2f: reutiliza cada salida intermedia (n+2 tensores concatenados).",
    "Cabeza anchor-free: predice directamente sobre puntos de la rejilla.",
    "Cabeza desacoplada: rama de caja y rama de clase separadas.",
    "DFL: cada lado de la caja se regresa como distribucion sobre 16 bins."
  ],
  ausencias: ["Atencion"],
  nc: 80, reg_max: 16, end2end: false,
  scales: { n: [0.33, 0.25, 1024], s: [0.33, 0.50, 1024], m: [0.67, 0.75, 768],
            l: [1.00, 1.00, 512], x: [1.00, 1.25, 512] },
  stats: { n: [129, 3157200, 8.9], s: [129, 11166560, 28.8], m: [169, 25902640, 79.3],
           l: [209, 43691520, 165.7], x: [209, 68229648, 258.5] },
  backbone: [
    [-1, 1, "Conv", [64, 3, 2],    "0-P1/2"],
    [-1, 1, "Conv", [128, 3, 2],   "1-P2/4"],
    [-1, 3, "C2f",  [128, true],   "2"],
    [-1, 1, "Conv", [256, 3, 2],   "3-P3/8"],
    [-1, 6, "C2f",  [256, true],   "4"],
    [-1, 1, "Conv", [512, 3, 2],   "5-P4/16"],
    [-1, 6, "C2f",  [512, true],   "6"],
    [-1, 1, "Conv", [1024, 3, 2],  "7-P5/32"],
    [-1, 3, "C2f",  [1024, true],  "8"],
    [-1, 1, "SPPF", [1024, 5],     "9"]
  ],
  head: [
    [-1, 1, "nn.Upsample", [null, 2, "nearest"], "10"],
    [[-1, 6], 1, "Concat", [1],                  "11 · cat backbone P4"],
    [-1, 3, "C2f",         [512],                "12"],

    [-1, 1, "nn.Upsample", [null, 2, "nearest"], "13"],
    [[-1, 4], 1, "Concat", [1],                  "14 · cat backbone P3"],
    [-1, 3, "C2f",         [256],                "15 (P3/8-small)"],

    [-1, 1, "Conv",         [256, 3, 2],         "16"],
    [[-1, 12], 1, "Concat", [1],                 "17 · cat head P4"],
    [-1, 3, "C2f",          [512],               "18 (P4/16-medium)"],

    [-1, 1, "Conv",        [512, 3, 2],          "19"],
    [[-1, 9], 1, "Concat", [1],                  "20 · cat head P5"],
    [-1, 3, "C2f",         [1024],               "21 (P5/32-large)"],

    [[15, 18, 21], 1, "Detect", ["nc"], "22 · Detect(P3, P4, P5)"]
  ]
},

/* ─────────────────────────────── YOLOv9 ─────────────────────────────────── */
{
  id: "yolov9c",
  nombre: "YOLOv9-c",
  subtitulo: "GELAN · RepNCSPELAN4 · ADown",
  anio: 2024,
  yaml: "ultralytics/cfg/models/v9/yolov9c.yaml",
  color: "#e0a23c",
  resumen: "Cambia de familia: el bloque es <b>RepNCSPELAN4</b> (GELAN = " +
           "CSP-ELAN), que encadena dos sub-bloques RepCSP y concatena 4 " +
           "tensores. El submuestreo deja de ser una Conv stride-2 y pasa a " +
           "<b>ADown</b> (mitad avg-pool + conv, mitad max-pool + conv). " +
           "El SPPF se sustituye por <b>SPPELAN</b>.",
  destacados: ["RepNCSPELAN4", "ADown", "SPPELAN"],
  novedades: [
    "GELAN: agregacion de capas eficiente y generalizada, sin cuellos de botella.",
    "RepNCSPELAN4: cv1 parte en 2, dos ramas RepCSP en cascada, concat de 4.",
    "ADown: downsample hibrido (avg-pool + max-pool) en vez de Conv s=2.",
    "SPPELAN: version ELAN del pooling piramidal.",
    "PGI (informacion de gradiente programable) — solo en entrenamiento, no en el grafo."
  ],
  ausencias: ["Atencion", "SPPF clasico"],
  nc: 80, reg_max: 16, end2end: false,
  depth_multiple: 1.0, width_multiple: 1.0,
  scales: null,
  stats: { "-": [358, 25590912, 104.0] },
  aviso: "Se muestra la variante <b>c</b> (compacta), que es la que Ultralytics " +
         "usa como referencia. La variante <b>e</b> anade una segunda rama " +
         "auxiliar con CBLinear/CBFuse que solo existe durante el entrenamiento.",
  backbone: [
    [-1, 1, "Conv",          [64, 3, 2],           "0-P1/2"],
    [-1, 1, "Conv",          [128, 3, 2],          "1-P2/4"],
    [-1, 1, "RepNCSPELAN4",  [256, 128, 64, 1],    "2"],
    [-1, 1, "ADown",         [256],                "3-P3/8"],
    [-1, 1, "RepNCSPELAN4",  [512, 256, 128, 1],   "4"],
    [-1, 1, "ADown",         [512],                "5-P4/16"],
    [-1, 1, "RepNCSPELAN4",  [512, 512, 256, 1],   "6"],
    [-1, 1, "ADown",         [512],                "7-P5/32"],
    [-1, 1, "RepNCSPELAN4",  [512, 512, 256, 1],   "8"],
    [-1, 1, "SPPELAN",       [512, 256],           "9"]
  ],
  head: [
    [-1, 1, "nn.Upsample",  [null, 2, "nearest"], "10"],
    [[-1, 6], 1, "Concat",  [1],                  "11 · cat backbone P4"],
    [-1, 1, "RepNCSPELAN4", [512, 512, 256, 1],   "12"],

    [-1, 1, "nn.Upsample",  [null, 2, "nearest"], "13"],
    [[-1, 4], 1, "Concat",  [1],                  "14 · cat backbone P3"],
    [-1, 1, "RepNCSPELAN4", [256, 256, 128, 1],   "15 (P3/8-small)"],

    [-1, 1, "ADown",         [256],               "16"],
    [[-1, 12], 1, "Concat",  [1],                 "17 · cat head P4"],
    [-1, 1, "RepNCSPELAN4",  [512, 512, 256, 1],  "18 (P4/16-medium)"],

    [-1, 1, "ADown",        [512],                "19"],
    [[-1, 9], 1, "Concat",  [1],                  "20 · cat head P5"],
    [-1, 1, "RepNCSPELAN4", [512, 512, 256, 1],   "21 (P5/32-large)"],

    [[15, 18, 21], 1, "Detect", ["nc"], "22 · Detect(P3, P4, P5)"]
  ]
},

/* ─────────────────────────────── YOLOv10 ────────────────────────────────── */
{
  id: "yolov10",
  nombre: "YOLOv10",
  subtitulo: "SCDown · PSA · C2fCIB · sin NMS",
  anio: 2024,
  yaml: "ultralytics/cfg/models/v10/yolov10{n,s,m,b,l,x}.yaml",
  color: "#c26be0",
  resumen: "Primer YOLO <b>end-to-end sin NMS</b>: la cabeza <code>v10Detect</code> " +
           "entrena con doble asignacion (one-to-many + one-to-one) y en " +
           "inferencia solo usa la rama one-to-one. Introduce <b>SCDown</b> " +
           "(downsample separable), <b>PSA</b> (atencion parcial) y <b>C2fCIB</b> " +
           "(bloque invertido compacto) en las etapas profundas.",
  destacados: ["SCDown", "PSA", "C2fCIB", "v10Detect"],
  novedades: [
    "NMS-free: doble asignacion consistente durante el entrenamiento.",
    "SCDown: Conv 1x1 (canales) + DWConv k,s (espacial) — desacopla ambas cosas.",
    "PSA: solo la mitad de los canales pasa por la atencion.",
    "C2fCIB: los Bottleneck se sustituyen por bloques invertidos con DWConv.",
    "Cabeza de clase ligera (depthwise-separable) para recortar latencia."
  ],
  ausencias: ["NMS", "SPPF en el cuello"],
  nc: 80, reg_max: 16, end2end: true,
  scales: { n: [0.33, 0.25, 1024], s: [0.33, 0.50, 1024], m: [0.67, 0.75, 768],
            b: [0.67, 1.00, 512], l: [1.00, 1.00, 512], x: [1.00, 1.25, 512] },
  aviso: "En YOLOv10 <b>el grafo cambia con la escala</b>, no solo los canales: " +
         "n/s/m/b/l/x tienen ficheros YAML distintos que colocan C2fCIB en " +
         "posiciones diferentes. Cambia la escala y observa las capas 8, 13, 19 y 22.",
  // El grafo depende de la escala -> variantes
  variantes: {
    n: { backbone: [
          [-1, 1, "Conv",   [64, 3, 2],   "0-P1/2"],
          [-1, 1, "Conv",   [128, 3, 2],  "1-P2/4"],
          [-1, 3, "C2f",    [128, true],  "2"],
          [-1, 1, "Conv",   [256, 3, 2],  "3-P3/8"],
          [-1, 6, "C2f",    [256, true],  "4"],
          [-1, 1, "SCDown", [512, 3, 2],  "5-P4/16"],
          [-1, 6, "C2f",    [512, true],  "6"],
          [-1, 1, "SCDown", [1024, 3, 2], "7-P5/32"],
          [-1, 3, "C2f",    [1024, true], "8"],
          [-1, 1, "SPPF",   [1024, 5],    "9"],
          [-1, 1, "PSA",    [1024],       "10"]],
        head: [
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "11"],
          [[-1, 6], 1, "Concat", [1],                  "12 · cat backbone P4"],
          [-1, 3, "C2f",         [512],                "13"],
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "14"],
          [[-1, 4], 1, "Concat", [1],                  "15 · cat backbone P3"],
          [-1, 3, "C2f",         [256],                "16 (P3/8-small)"],
          [-1, 1, "Conv",         [256, 3, 2],         "17"],
          [[-1, 13], 1, "Concat", [1],                 "18 · cat head P4"],
          [-1, 3, "C2f",          [512],               "19 (P4/16-medium)"],
          [-1, 1, "SCDown",       [512, 3, 2],         "20"],
          [[-1, 10], 1, "Concat", [1],                 "21 · cat head P5"],
          [-1, 3, "C2fCIB",       [1024, true, true],  "22 (P5/32-large)"],
          [[16, 19, 22], 1, "v10Detect", ["nc"], "23 · v10Detect(P3, P4, P5)"]] },

    s: { backbone: [
          [-1, 1, "Conv",   [64, 3, 2],   "0-P1/2"],
          [-1, 1, "Conv",   [128, 3, 2],  "1-P2/4"],
          [-1, 3, "C2f",    [128, true],  "2"],
          [-1, 1, "Conv",   [256, 3, 2],  "3-P3/8"],
          [-1, 6, "C2f",    [256, true],  "4"],
          [-1, 1, "SCDown", [512, 3, 2],  "5-P4/16"],
          [-1, 6, "C2f",    [512, true],  "6"],
          [-1, 1, "SCDown", [1024, 3, 2], "7-P5/32"],
          [-1, 3, "C2fCIB", [1024, true, true], "8"],
          [-1, 1, "SPPF",   [1024, 5],    "9"],
          [-1, 1, "PSA",    [1024],       "10"]],
        head: [
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "11"],
          [[-1, 6], 1, "Concat", [1],                  "12 · cat backbone P4"],
          [-1, 3, "C2f",         [512],                "13"],
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "14"],
          [[-1, 4], 1, "Concat", [1],                  "15 · cat backbone P3"],
          [-1, 3, "C2f",         [256],                "16 (P3/8-small)"],
          [-1, 1, "Conv",         [256, 3, 2],         "17"],
          [[-1, 13], 1, "Concat", [1],                 "18 · cat head P4"],
          [-1, 3, "C2f",          [512],               "19 (P4/16-medium)"],
          [-1, 1, "SCDown",       [512, 3, 2],         "20"],
          [[-1, 10], 1, "Concat", [1],                 "21 · cat head P5"],
          [-1, 3, "C2fCIB",       [1024, true, true],  "22 (P5/32-large)"],
          [[16, 19, 22], 1, "v10Detect", ["nc"], "23 · v10Detect(P3, P4, P5)"]] },

    m: { backbone: [
          [-1, 1, "Conv",   [64, 3, 2],   "0-P1/2"],
          [-1, 1, "Conv",   [128, 3, 2],  "1-P2/4"],
          [-1, 3, "C2f",    [128, true],  "2"],
          [-1, 1, "Conv",   [256, 3, 2],  "3-P3/8"],
          [-1, 6, "C2f",    [256, true],  "4"],
          [-1, 1, "SCDown", [512, 3, 2],  "5-P4/16"],
          [-1, 6, "C2f",    [512, true],  "6"],
          [-1, 1, "SCDown", [1024, 3, 2], "7-P5/32"],
          [-1, 3, "C2fCIB", [1024, true], "8"],
          [-1, 1, "SPPF",   [1024, 5],    "9"],
          [-1, 1, "PSA",    [1024],       "10"]],
        head: [
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "11"],
          [[-1, 6], 1, "Concat", [1],                  "12 · cat backbone P4"],
          [-1, 3, "C2f",         [512],                "13"],
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "14"],
          [[-1, 4], 1, "Concat", [1],                  "15 · cat backbone P3"],
          [-1, 3, "C2f",         [256],                "16 (P3/8-small)"],
          [-1, 1, "Conv",         [256, 3, 2],         "17"],
          [[-1, 13], 1, "Concat", [1],                 "18 · cat head P4"],
          [-1, 3, "C2fCIB",       [512, true],         "19 (P4/16-medium)"],
          [-1, 1, "SCDown",       [512, 3, 2],         "20"],
          [[-1, 10], 1, "Concat", [1],                 "21 · cat head P5"],
          [-1, 3, "C2fCIB",       [1024, true],        "22 (P5/32-large)"],
          [[16, 19, 22], 1, "v10Detect", ["nc"], "23 · v10Detect(P3, P4, P5)"]] },

    b: { backbone: [
          [-1, 1, "Conv",   [64, 3, 2],   "0-P1/2"],
          [-1, 1, "Conv",   [128, 3, 2],  "1-P2/4"],
          [-1, 3, "C2f",    [128, true],  "2"],
          [-1, 1, "Conv",   [256, 3, 2],  "3-P3/8"],
          [-1, 6, "C2f",    [256, true],  "4"],
          [-1, 1, "SCDown", [512, 3, 2],  "5-P4/16"],
          [-1, 6, "C2f",    [512, true],  "6"],
          [-1, 1, "SCDown", [1024, 3, 2], "7-P5/32"],
          [-1, 3, "C2fCIB", [1024, true], "8"],
          [-1, 1, "SPPF",   [1024, 5],    "9"],
          [-1, 1, "PSA",    [1024],       "10"]],
        head: [
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "11"],
          [[-1, 6], 1, "Concat", [1],                  "12 · cat backbone P4"],
          [-1, 3, "C2fCIB",      [512, true],          "13"],
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "14"],
          [[-1, 4], 1, "Concat", [1],                  "15 · cat backbone P3"],
          [-1, 3, "C2f",         [256],                "16 (P3/8-small)"],
          [-1, 1, "Conv",         [256, 3, 2],         "17"],
          [[-1, 13], 1, "Concat", [1],                 "18 · cat head P4"],
          [-1, 3, "C2fCIB",       [512, true],         "19 (P4/16-medium)"],
          [-1, 1, "SCDown",       [512, 3, 2],         "20"],
          [[-1, 10], 1, "Concat", [1],                 "21 · cat head P5"],
          [-1, 3, "C2fCIB",       [1024, true],        "22 (P5/32-large)"],
          [[16, 19, 22], 1, "v10Detect", ["nc"], "23 · v10Detect(P3, P4, P5)"]] },

    l: { backbone: [
          [-1, 1, "Conv",   [64, 3, 2],   "0-P1/2"],
          [-1, 1, "Conv",   [128, 3, 2],  "1-P2/4"],
          [-1, 3, "C2f",    [128, true],  "2"],
          [-1, 1, "Conv",   [256, 3, 2],  "3-P3/8"],
          [-1, 6, "C2f",    [256, true],  "4"],
          [-1, 1, "SCDown", [512, 3, 2],  "5-P4/16"],
          [-1, 6, "C2f",    [512, true],  "6"],
          [-1, 1, "SCDown", [1024, 3, 2], "7-P5/32"],
          [-1, 3, "C2fCIB", [1024, true], "8"],
          [-1, 1, "SPPF",   [1024, 5],    "9"],
          [-1, 1, "PSA",    [1024],       "10"]],
        head: [
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "11"],
          [[-1, 6], 1, "Concat", [1],                  "12 · cat backbone P4"],
          [-1, 3, "C2fCIB",      [512, true],          "13"],
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "14"],
          [[-1, 4], 1, "Concat", [1],                  "15 · cat backbone P3"],
          [-1, 3, "C2f",         [256],                "16 (P3/8-small)"],
          [-1, 1, "Conv",         [256, 3, 2],         "17"],
          [[-1, 13], 1, "Concat", [1],                 "18 · cat head P4"],
          [-1, 3, "C2fCIB",       [512, true],         "19 (P4/16-medium)"],
          [-1, 1, "SCDown",       [512, 3, 2],         "20"],
          [[-1, 10], 1, "Concat", [1],                 "21 · cat head P5"],
          [-1, 3, "C2fCIB",       [1024, true],        "22 (P5/32-large)"],
          [[16, 19, 22], 1, "v10Detect", ["nc"], "23 · v10Detect(P3, P4, P5)"]] },

    x: { backbone: [
          [-1, 1, "Conv",   [64, 3, 2],   "0-P1/2"],
          [-1, 1, "Conv",   [128, 3, 2],  "1-P2/4"],
          [-1, 3, "C2f",    [128, true],  "2"],
          [-1, 1, "Conv",   [256, 3, 2],  "3-P3/8"],
          [-1, 6, "C2f",    [256, true],  "4"],
          [-1, 1, "SCDown", [512, 3, 2],  "5-P4/16"],
          [-1, 6, "C2fCIB", [512, true],  "6"],
          [-1, 1, "SCDown", [1024, 3, 2], "7-P5/32"],
          [-1, 3, "C2fCIB", [1024, true], "8"],
          [-1, 1, "SPPF",   [1024, 5],    "9"],
          [-1, 1, "PSA",    [1024],       "10"]],
        head: [
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "11"],
          [[-1, 6], 1, "Concat", [1],                  "12 · cat backbone P4"],
          [-1, 3, "C2fCIB",      [512, true],          "13"],
          [-1, 1, "nn.Upsample", [null, 2, "nearest"], "14"],
          [[-1, 4], 1, "Concat", [1],                  "15 · cat backbone P3"],
          [-1, 3, "C2f",         [256],                "16 (P3/8-small)"],
          [-1, 1, "Conv",         [256, 3, 2],         "17"],
          [[-1, 13], 1, "Concat", [1],                 "18 · cat head P4"],
          [-1, 3, "C2fCIB",       [512, true],         "19 (P4/16-medium)"],
          [-1, 1, "SCDown",       [512, 3, 2],         "20"],
          [[-1, 10], 1, "Concat", [1],                 "21 · cat head P5"],
          [-1, 3, "C2fCIB",       [1024, true],        "22 (P5/32-large)"],
          [[16, 19, 22], 1, "v10Detect", ["nc"], "23 · v10Detect(P3, P4, P5)"]] }
  }
},

/* ─────────────────────────────── YOLO11 ─────────────────────────────────── */
{
  id: "yolo11",
  nombre: "YOLO11",
  subtitulo: "C3k2 · C2PSA · cabeza DW",
  anio: 2024,
  yaml: "ultralytics/cfg/models/11/yolo11.yaml",
  color: "#ff7a45",
  resumen: "<b>C3k2</b> es una subclase de C2f donde cada unidad repetible se " +
           "puede cambiar: Bottleneck simple (escalas n/s) o bloque <b>C3k</b> " +
           "(escalas m/l/x). Anade <b>C2PSA</b> tras el SPPF: atencion " +
           "posicional multi-cabeza sobre la mitad de los canales. La rama de " +
           "clase de la cabeza pasa a ser depthwise-separable.",
  destacados: ["C3k2", "C2PSA", "SPPF"],
  novedades: [
    "C3k2: esqueleto C2f con unidad interna configurable (Bottleneck / C3k / +PSA).",
    "El flag c3k se activa SOLO en m/l/x — cambia la escala y velo.",
    "C2PSA: bloque CSP cuya rama activa apila N PSABlock (atencion + FFN).",
    "Cabeza: rama de clase con DWConv + Conv 1x1 (mas barata que 2x Conv 3x3)."
  ],
  ausencias: ["NMS-free"],
  nc: 80, reg_max: 16, end2end: false,
  scales: { n: [0.50, 0.25, 1024], s: [0.50, 0.50, 1024], m: [0.50, 1.00, 512],
            l: [1.00, 1.00, 512], x: [1.00, 1.50, 512] },
  stats: { n: [181, 2624080, 6.6], s: [181, 9458752, 21.7], m: [231, 20114688, 68.5],
           l: [357, 25372160, 87.6], x: [357, 56966176, 196.0] },
  backbone: [
    [-1, 1, "Conv",  [64, 3, 2],           "0-P1/2"],
    [-1, 1, "Conv",  [128, 3, 2],          "1-P2/4"],
    [-1, 2, "C3k2",  [256, false, 0.25],   "2"],
    [-1, 1, "Conv",  [256, 3, 2],          "3-P3/8"],
    [-1, 2, "C3k2",  [512, false, 0.25],   "4"],
    [-1, 1, "Conv",  [512, 3, 2],          "5-P4/16"],
    [-1, 2, "C3k2",  [512, true],          "6"],
    [-1, 1, "Conv",  [1024, 3, 2],         "7-P5/32"],
    [-1, 2, "C3k2",  [1024, true],         "8"],
    [-1, 1, "SPPF",  [1024, 5],            "9"],
    [-1, 2, "C2PSA", [1024],               "10"]
  ],
  head: [
    [-1, 1, "nn.Upsample", [null, 2, "nearest"], "11"],
    [[-1, 6], 1, "Concat", [1],                  "12 · cat backbone P4"],
    [-1, 2, "C3k2",        [512, false],         "13"],

    [-1, 1, "nn.Upsample", [null, 2, "nearest"], "14"],
    [[-1, 4], 1, "Concat", [1],                  "15 · cat backbone P3"],
    [-1, 2, "C3k2",        [256, false],         "16 (P3/8-small)"],

    [-1, 1, "Conv",         [256, 3, 2],         "17"],
    [[-1, 13], 1, "Concat", [1],                 "18 · cat head P4"],
    [-1, 2, "C3k2",         [512, false],        "19 (P4/16-medium)"],

    [-1, 1, "Conv",         [512, 3, 2],         "20"],
    [[-1, 10], 1, "Concat", [1],                 "21 · cat head P5"],
    [-1, 2, "C3k2",         [1024, true],        "22 (P5/32-large)"],

    [[16, 19, 22], 1, "Detect", ["nc"], "23 · Detect(P3, P4, P5)"]
  ]
},

/* ─────────────────────────────── YOLO12 ─────────────────────────────────── */
{
  id: "yolo12",
  nombre: "YOLO12",
  subtitulo: "A2C2f · atencion por areas",
  anio: 2025,
  yaml: "ultralytics/cfg/models/12/yolo12.yaml",
  color: "#e0446b",
  resumen: "Arquitectura centrada en atencion. <b>A2C2f</b> sustituye a C3k2 en " +
           "P4/P5 y en casi todo el cuello: divide el mapa en <i>areas</i> y " +
           "aplica atencion dentro de cada una (coste lineal en vez de " +
           "cuadratico). Elimina SPPF y C2PSA — el pooling piramidal ya no hace " +
           "falta porque la atencion por areas da contexto global.",
  destacados: ["A2C2f", "C3k2"],
  novedades: [
    "A2C2f: esqueleto tipo C2f con 2 ABlock (atencion por areas) por unidad.",
    "AAttn: qkv 1x1 + codificacion posicional depthwise 7x7, atencion por areas.",
    "area=4 en P4 y area=1 en P5 (atencion global en el nivel mas profundo).",
    "En el cuello a2=False -> A2C2f degenera en bloques C3k (sin atencion).",
    "En escalas l/x se activa la conexion residual con gamma aprendible."
  ],
  ausencias: ["SPPF", "C2PSA"],
  nc: 80, reg_max: 16, end2end: false,
  scales: { n: [0.50, 0.25, 1024], s: [0.50, 0.50, 1024], m: [0.50, 1.00, 512],
            l: [1.00, 1.00, 512], x: [1.00, 1.50, 512] },
  stats: { n: [272, 2602288, 6.7], s: [272, 9284096, 21.7], m: [292, 20199168, 68.1],
           l: [488, 26450784, 89.7], x: [488, 59210784, 200.3] },
  backbone: [
    [-1, 1, "Conv",  [64, 3, 2],          "0-P1/2"],
    [-1, 1, "Conv",  [128, 3, 2],         "1-P2/4"],
    [-1, 2, "C3k2",  [256, false, 0.25],  "2"],
    [-1, 1, "Conv",  [256, 3, 2],         "3-P3/8"],
    [-1, 2, "C3k2",  [512, false, 0.25],  "4"],
    [-1, 1, "Conv",  [512, 3, 2],         "5-P4/16"],
    [-1, 4, "A2C2f", [512, true, 4],      "6"],
    [-1, 1, "Conv",  [1024, 3, 2],        "7-P5/32"],
    [-1, 4, "A2C2f", [1024, true, 1],     "8"]
  ],
  head: [
    [-1, 1, "nn.Upsample", [null, 2, "nearest"], "9"],
    [[-1, 6], 1, "Concat", [1],                  "10 · cat backbone P4"],
    [-1, 2, "A2C2f",       [512, false, -1],     "11"],

    [-1, 1, "nn.Upsample", [null, 2, "nearest"], "12"],
    [[-1, 4], 1, "Concat", [1],                  "13 · cat backbone P3"],
    [-1, 2, "A2C2f",       [256, false, -1],     "14 (P3/8-small)"],

    [-1, 1, "Conv",         [256, 3, 2],         "15"],
    [[-1, 11], 1, "Concat", [1],                 "16 · cat head P4"],
    [-1, 2, "A2C2f",        [512, false, -1],    "17 (P4/16-medium)"],

    [-1, 1, "Conv",        [512, 3, 2],          "18"],
    [[-1, 8], 1, "Concat", [1],                  "19 · cat head P5"],
    [-1, 2, "C3k2",        [1024, true],         "20 (P5/32-large)"],

    [[14, 17, 20], 1, "Detect", ["nc"], "21 · Detect(P3, P4, P5)"]
  ]
},

/* ─────────────────────────────── YOLO26 ─────────────────────────────────── */
{
  id: "yolo26",
  nombre: "YOLO26",
  subtitulo: "end2end · reg_max=1 · sin DFL",
  anio: 2025,
  yaml: "ultralytics/cfg/models/26/yolo26.yaml",
  color: "#3ecf8e",
  resumen: "Vuelve al esqueleto de YOLO11 (C3k2 + SPPF + C2PSA) pero cambia " +
           "radicalmente la salida: <b>end2end=True</b> (sin NMS) y " +
           "<b>reg_max=1</b>, lo que convierte el DFL en la identidad y lo hace " +
           "desaparecer del modelo exportado. El SPPF gana un atajo residual y " +
           "todos los C3k2 del cuello pasan a shortcut=True.",
  destacados: ["C3k2", "C2PSA", "SPPF+"],
  novedades: [
    "end2end=True: predicciones one-to-one, se elimina la NMS del pipeline.",
    "reg_max=1: la caja se regresa como 4 escalares -> DFL = Identidad.",
    "SPPF con atajo residual (args [1024, 5, 3, True]).",
    "Cuello con shortcut=True en todos los C3k2 (v11 los tenia a False).",
    "Capa 22: C3k2 con attn=True -> Bottleneck + PSABlock dentro."
  ],
  ausencias: ["NMS", "DFL"],
  nc: 80, reg_max: 1, end2end: true,
  scales: { n: [0.50, 0.25, 1024], s: [0.50, 0.50, 1024], m: [0.50, 1.00, 512],
            l: [1.00, 1.00, 512], x: [1.00, 1.50, 512] },
  stats: { n: [260, 2572280, 6.1], s: [260, 10009784, 22.8], m: [280, 21896248, 75.4],
           l: [392, 26299704, 93.8], x: [392, 58993368, 209.5] },
  backbone: [
    [-1, 1, "Conv",  [64, 3, 2],           "0-P1/2"],
    [-1, 1, "Conv",  [128, 3, 2],          "1-P2/4"],
    [-1, 2, "C3k2",  [256, false, 0.25],   "2"],
    [-1, 1, "Conv",  [256, 3, 2],          "3-P3/8"],
    [-1, 2, "C3k2",  [512, false, 0.25],   "4"],
    [-1, 1, "Conv",  [512, 3, 2],          "5-P4/16"],
    [-1, 2, "C3k2",  [512, true],          "6"],
    [-1, 1, "Conv",  [1024, 3, 2],         "7-P5/32"],
    [-1, 2, "C3k2",  [1024, true],         "8"],
    [-1, 1, "SPPF",  [1024, 5, 3, true],   "9 · con atajo residual"],
    [-1, 2, "C2PSA", [1024],               "10"]
  ],
  head: [
    [-1, 1, "nn.Upsample", [null, 2, "nearest"], "11"],
    [[-1, 6], 1, "Concat", [1],                  "12 · cat backbone P4"],
    [-1, 2, "C3k2",        [512, true],          "13"],

    [-1, 1, "nn.Upsample", [null, 2, "nearest"], "14"],
    [[-1, 4], 1, "Concat", [1],                  "15 · cat backbone P3"],
    [-1, 2, "C3k2",        [256, true],          "16 (P3/8-small)"],

    [-1, 1, "Conv",         [256, 3, 2],         "17"],
    [[-1, 13], 1, "Concat", [1],                 "18 · cat head P4"],
    [-1, 2, "C3k2",         [512, true],         "19 (P4/16-medium)"],

    [-1, 1, "Conv",         [512, 3, 2],         "20"],
    [[-1, 10], 1, "Concat", [1],                 "21 · cat head P5"],
    [-1, 1, "C3k2",         [1024, true, 0.5, true], "22 (P5/32-large) · attn"],

    [[16, 19, 22], 1, "Detect", ["nc"], "23 · Detect(P3, P4, P5)"]
  ]
}

];

/* Indice rapido por id */
const MODELOS_POR_ID = Object.fromEntries(MODELOS.map(m => [m.id, m]));
