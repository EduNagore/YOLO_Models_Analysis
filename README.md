# Anatomía del YOLO

Página web local para estudiar la arquitectura de cada versión de YOLO **capa por capa**, en formato diagrama, y poder abrir cualquier bloque para ver **qué hay dentro**.

## Enlace a la web

<https://edunagore.github.io/YOLO_Models_Analysis/>

## Qué incluye

**8 versiones**: YOLOv3, YOLOv5, YOLOv8, YOLOv9-c, YOLOv10, YOLO11, YOLO12, YOLO26.

**5 vistas**:

| Vista | Para qué sirve |
|---|---|
| Diagrama | El grafo completo. Columnas = nivel de la pirámide (P1…P5), filas = orden de las capas. Las conexiones largas de la FPN/PAN van enrutadas por carriles a la derecha. |
| Tabla de capas | Lo mismo que imprime `parse_model()` de Ultralytics: from, n, módulo, args, c_in, c_out, resolución. |
| Comparativa | Qué cambia realmente entre generaciones (bloque del backbone, pooling, atención, submuestreo, cabeza, DFL, NMS). |
| Glosario | Una ficha por bloque, cada una con su diagrama interno abrible. |
| Conceptos | Seis ideas de fondo: las tres etapas, por qué tres escalas, qué hace el CSP, cómo funcionan depth/width/max_channels, anchor-free, y el camino para eliminar la NMS. |

**5 temas de color**, en el botón *Tema* de la cabecera: Noche (por defecto), Carbón,
Contraste, Papel y Claro. La elección se guarda en el navegador.


## Drill-down

Un clic en cualquier capa abre el panel derecho con su interior real: las convoluciones,
los `chunk`/`split`, las concatenaciones y los atajos residuales. Dentro del panel, los nodos
marcados con **+** se abren a su vez, y se puede bajar hasta el `Conv2d` individual:

```
#8 C3k2 → m[0] C3k → m[0] Bottleneck → cv1 Conv → Conv2d 3×3
#10 C2PSA → m[0] PSABlock → attn Attention → qkv Conv → Conv2d 1×1
#23 Detect → cv2[0] Conv → Conv2d 3×3
```

Las migas de pan de arriba permiten volver; `Backspace` sube un nivel y `Esc` cierra el modal.

## Fuente de los datos

Los grafos están transcritos literalmente de los YAML de Ultralytics:

```
ultralytics/cfg/models/{v3,v5,v8,v9,v10,11,12,26}/*.yaml
```

Referencia conceptual:
<https://docs.ultralytics.com/es/guides/yolo-architecture>


## Estructura

```
YOLO_estudio/
├── index.html
├── servidor.py            servidor local de desarrollo
├── .nojekyll              GitHub Pages sirve los ficheros tal cual
├── css/estilo.css
├── js/
│   ├── datos-modelos.js   grafos YAML de las 8 versiones
│   ├── parser.js          réplica de parse_model (canales, repeticiones, strides)
│   ├── bloques.js         expansión interna de cada módulo (con drill-down)
│   ├── glosario.js        fichas de bloques, comparativa y conceptos
│   ├── diagrama.js        renderizador SVG (zoom, pan, enrutado de skip-connections)
│   ├── tema.js            selector de tema de color
│   └── app.js             estado e interfaz
└── ultralytics/           clon local opcional de referencia (no versionado)
```

