# Anatomía del YOLO

Página web local para estudiar la arquitectura de cada versión de YOLO **capa por capa**,
en formato diagrama, y poder abrir cualquier bloque para ver **qué hay dentro**.

## Arrancar

```bash
cd yolo_arquitecture
python servidor.py
```

Abre `http://localhost:8777`. También funciona haciendo doble clic en `index.html`
(no usa `fetch` ni módulos ES, así que no hay problemas de CORS con `file://`).

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

## Lo que hace que sea "dinámica"

No son imágenes: el grafo se **calcula** en el navegador.

- **`js/parser.js` replica `parse_model()`** de `ultralytics/nn/tasks.py`. Al cambiar la
  escala (n/s/m/l/x) se recalculan los canales reales con
  `make_divisible(min(c2, max_channels) × width, 8)` y las repeticiones con
  `max(round(n × depth), 1)`. Incluye el redondeo bancario de Python.
- Los flags que dependen de la escala se aplican igual que en el código fuente:
  `C3k2` pasa a `c3k=True` en **m/l/x** (la unidad interna deja de ser un `Bottleneck` y
  pasa a ser un bloque `C3k`), y `A2C2f` activa `residual=True` con `mlp_ratio=1.2` en **l/x**.
- Cambiar el tamaño de entrada (320 / 640 / 960 / 1280) recalcula la resolución de cada capa.
- **YOLOv10 cambia de grafo con la escala**, no solo de anchos: n/s/m/b/l/x son ficheros YAML
  distintos que colocan `C2fCIB` en posiciones diferentes. Cambia la escala y mira las capas 6, 8, 13 y 19.

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

Los grafos están transcritos literalmente de los YAML del repo clonado en `../ultralytics`:

```
ultralytics/cfg/models/{v3,v5,v8,v9,v10,11,12,26}/*.yaml
```

La estructura interna de cada bloque viene de `ultralytics/nn/modules/block.py`,
`conv.py` y `head.py`. Los canales ocultos usan las mismas fórmulas que el código
(`int(c2·e)`, `c1//2`, `max(c//64, 1)`, …).

Referencia conceptual:
<https://docs.ultralytics.com/es/guides/yolo-architecture>

## Un aviso que conviene tener presente

Los YAML de **YOLOv3 y YOLOv5** que hay en Ultralytics se ensamblan con la cabeza `Detect`
moderna (anchor-free + DFL): son lo que la documentación llama **v3u** y **v5u**. Los
originales eran anchor-based con cabeza acoplada. La app lo avisa en la ficha de esas
dos versiones.

## Estructura

```
yolo_arquitecture/
├── index.html
├── servidor.py
├── css/estilo.css
└── js/
    ├── datos-modelos.js   grafos YAML de las 8 versiones
    ├── parser.js          réplica de parse_model (canales, repeticiones, strides)
    ├── bloques.js         expansión interna de cada módulo (con drill-down)
    ├── glosario.js        fichas de bloques, comparativa y conceptos
    ├── diagrama.js        renderizador SVG (zoom, pan, enrutado de skip-connections)
    └── app.js             estado e interfaz
```

Para añadir una versión basta con copiar su YAML a `datos-modelos.js` con el mismo formato
`[from, repeats, module, [args], "comentario"]`; el parser y el renderizador se encargan del resto.
Si el YAML usa un módulo nuevo, hay que añadirlo a `MODULOS_BASE` / `MODULOS_REPETIBLES`
en `parser.js` y darle un expansor en `bloques.js`.
