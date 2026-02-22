# EPIC WARRIORS — DOCUMENTO DE ARQUITECTURA
> Versión del documento: 1.3 — Última actualización: v1.08
> Fuentes de verdad: **Supabase** (datos) · **GitHub Pages** (código)

---

## STACK TÉCNICO

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend | HTML + JS (single file) | Toda la lógica del juego |
| Base de datos | Supabase (PostgreSQL) | Estado persistente de jugadores |
| Hosting | GitHub Pages | Distribución del cliente |
| Assets estáticos | `game-data.js` | NPCs, datos inmutables |

El juego es **100% serverless**. No hay servidor de aplicación. Toda la lógica reside en el cliente HTML, y Supabase actúa como base de datos remota accesible directamente desde el navegador.

---

## ARQUITECTURA DE RED — LEY FUNDAMENTAL

### Modelo: Evento-Reactivo. Cero polling.

Inspirado en Ogame/Ikariam. El cliente **nunca consulta Supabase de forma periódica**. La red solo se toca en estos momentos:

| Cuándo | Qué operación |
|---|---|
| Login / carga inicial | `loadMyVillages`, `checkIncomingAttacks`, `updateLastSeen`, `processRecalls` |
| El jugador hace una acción | `flushVillage` (guardado inmediato) |
| Un `finish_at` llega a cero en el tick local | `resolveMissions` → `flushVillage` |
| Cambio de aldea activa | `checkIncomingAttacks` |
| El jugador minimiza/cierra la pestaña | `flushVillage` (visibilitychange) |
| Logout | `flushVillage` final |

**No existe ningún `setInterval` que llame a Supabase.**

### Por qué es correcto

Todas las colas (edificios, tropas, invocaciones, misiones) se guardan con un `finish_at` (timestamp ISO). El cliente calcula el estado actual comparando `finish_at` con `Date.now()`. No necesita preguntar al servidor — ya sabe cuándo llega cada cosa.

---

## EL TICK

```
setInterval(tick, 1000)  ← único loop del juego
```

`tick()` es **solo cálculo local en memoria**. Lo que hace cada segundo:

1. Resolver colas locales: `resolveQueue`, `resolveSummoningQueue`, `resolveTrainingQueue`
2. Si alguna cola completó → `scheduleSave()` (guarda el cambio)
3. Detectar si alguna misión tiene `finish_at <= now` → lanzar `resolveMissions` (única llamada de red reactiva)
4. Actualizar UI: recursos animados, contadores de misiones, barras de capacidad
5. Nada más.

**El tick NO puede llamar a Supabase directamente. Nunca.**

---

## SISTEMA DE GUARDADO

```
scheduleSave()
  → _stateDirty = true
  → setTimeout(flushVillage, 2000)   ← debounce de 2s

flushVillage()
  → _stateDirty = false
  → saveVillage(activeVillage)       ← escribe en Supabase
```

- `_stateDirty`: flag que indica si hay cambios sin guardar. Solo `scheduleSave` lo pone a `true`, solo `flushVillage` lo pone a `false`.
- El debounce de 2s evita guardados duplicados cuando el jugador hace varias acciones seguidas.
- `isFlushing` + `pendingFlush`: evitan condiciones de carrera si llegan dos `flushVillage` solapados.
- **No hay autoSave en bucle.** El único guardado automático es el del `visibilitychange`.

---

## TABLAS SUPABASE

| Tabla | Contenido | Cuándo se escribe |
|---|---|---|
| `villages` | Estado completo de cada aldea (recursos, tropas, colas, edificios) | En cada `saveVillage` |
| `profiles` | Datos del jugador (username, XP, military_score, last_seen) | Al hacer acciones que cambian XP/score, y al login |
| `buildings` | Niveles de edificios por aldea | Dentro de `saveVillage` |
| `troops` | Tropas por aldea | Dentro de `saveVillage` |
| `creatures` | Criaturas por aldea | Dentro de `saveVillage` |
| `guest_troops` | Tropas de refuerzo en aldeas ajenas | `processRecalls` (al login) |
| `objectives` | Estado de objetivos NPC por jugador | Al completar batalla NPC |
| `messages` | Informes de batalla, espionaje, sistema | Al completar misiones |

---

## DATOS ESTÁTICOS — game-data.js

`game-data.js` contiene `NPC_CASTLES` (250 castillos NPC con sus stats). Es un archivo separado que debe cargarse **antes** del script principal.

**No modificar `game-data.js` sin actualizar este documento.**

Los datos de tropas (`TROOP_TYPES`) y criaturas (`CREATURE_TYPES`) están definidos dentro del HTML principal y son la fuente de verdad para todos los cálculos de combate, producción y capacidad.

---

## SISTEMA DE RECURSOS

Los recursos **nunca se calculan en tiempo real en Supabase**. El cálculo es:

```
recursos_actuales = recursos_en_BD + (produccion_por_hora × horas_transcurridas)
```

Donde `horas_transcurridas = (Date.now() - last_updated) / 3600000`.

- `calcRes(vs)` → calcula recursos actuales para la UI. **No escribe nada.**
- `snapshotResources(vs)` → congela el valor calculado en `vs.resources` antes de guardar.
- `saveVillage` llama a `snapshotResources` antes de escribir en Supabase.

**Nunca escribir `calcRes()` directamente en `state.resources` fuera de `snapshotResources`.** Causaría duplicación infinita de recursos en cada tick.

---

## MURALLA — MECÁNICA DE COMBATE

La muralla es un **escudo con HP propio**, no un bonus a las tropas.

- Nivel 1 = 500 HP de muralla, +500 HP por nivel (nivel 10 = 5.000 HP)
- En combate: el atacante destruye la muralla ronda a ronda antes de poder dañar tropas
- Mientras la muralla aguanta, los defensores sí pueden atacar
- Implementado en `simulateBattle()` con la variable `wallHP`

**No reimplementar la muralla como bonus de HP a tropas. Fue un error previo corregido en v0.95.**

---

## CRIATURAS — VISIBILIDAD Y REQUISITOS

- **Visibilidad**: controlada por el nivel de la Torre de Invocación (`torreLevel >= tier`)
- **Invocación**: requiere además tener invocadores del nivel adecuado (`invocadorLevel >= tier`)
- El jugador puede VER criaturas que no puede invocar (aparecen en gris con mensaje de requisito)

**No filtrar criaturas por `invocadorLevel` en `renderCreaturesList`. Solo filtrar por `torreLevel`.**

---

## VARIABLES GLOBALES — BLOQUE CANÓNICO

Todas las variables de estado del juego **deben declararse explícitamente** en el bloque canónico de globales, ubicado justo después de la inicialización de Supabase (~línea 3000 del HTML). Este bloque es la única fuente de verdad para las variables globales.

**Variables actuales del bloque canónico (v1.00):**

```javascript
let currentUser      = null;     // usuario autenticado de Supabase
let myVillages       = [];       // aldeas del jugador (cargadas al login)
let activeVillage    = null;     // objeto completo de la aldea activa
let activeVillageId  = null;     // id sincronía logout/doLogin
let allVillages      = [];       // todas las aldeas del mapa (carga diferida)

let uiTimer       = null;        // setInterval del tick visual (1s)
let autoSaveTimer = null;        // LEGACY — declarado para compatibilidad con doLogout()

let isFlushing   = false;        // guard: flushVillage en vuelo
let pendingFlush = false;        // guard: flush pendiente tras el actual
let _stateDirty  = false;        // hay cambios en memoria sin guardar

let _missionWatchScheduled = false; // resolveMissions ya en vuelo — no relanzar
```

**Regla:** Cualquier variable usada en `tick()` o en funciones llamadas desde `tick()` **debe estar declarada en este bloque** antes del primer `setInterval(tick, 1000)`. Una variable no declarada aquí produce `ReferenceError` en el primer frame, bloqueando el login.

---

## CHANGELOG

### v1.08 — Corrección de renderizado de mensajes del sistema y mejora de UX en DM

**Bug 1 cerrado:** Los mensajes del sistema (reportes de batalla, espionaje) aparecían completamente vacíos en la interfaz. Al hacer clic se expandían pero no mostraban ningún contenido.

**Causa raíz:**
1. `parseMessageBody()` no manejaba correctamente casos edge:
   - Si `rawBody` era `null` o `undefined`, el código fallaba
   - Si el JSON parseado tenía `title` o `body` vacíos/undefined, los devolvía tal cual
   - No había fallback para casos donde el parseo JSON fallaba silenciosamente
   
2. El renderizado del body no tenía fallback cuando `parsed.body` estaba vacío
3. La detección de formato legacy (primera línea como título) era frágil

**Fix aplicado:**
1. **Mejorado `parseMessageBody()`**:
   - Validación inicial: si `rawBody` es falsy, retornar objeto con valores por defecto
   - Parseo JSON: verificar que AMBOS `title` y `body` existan antes de aceptar
   - Fallback explícito: si cualquier valor está vacío, usar "Informe del sistema" como título
   - Detección de timestamp: si la primera línea es una fecha (formato DD/MM/YYYY), usar la segunda línea como título
   - Logging de errores de parseo para debug
   
2. **Mejorado renderizado del body**:
   - Si `parsed.body` está vacío o es falsy, mostrar "Sin detalles adicionales" en lugar de contenido vacío
   - Verificación doble: primero if(parsed.body), luego if(b) después del trim
   
**Resultado:** Los reportes de batalla y espionaje ahora se muestran correctamente con su título y contenido completo.

**Bug 2 cerrado (UX):** En mensajes directos (DM), el header solo mostraba "Mensaje directo" genérico en lugar del nombre del usuario con quien hablas.

**Causa raíz:** La función `openThread()` pasaba un título hardcodeado sin consultar quién era el otro usuario en el thread.

**Fix aplicado:**
1. **Mejorado `openThread()`** para obtener el nombre del otro usuario:
   - Query a `thread_members` con join a `profiles` para obtener usernames
   - Filtrar para encontrar el miembro que NO es el usuario actual
   - Mostrar "DM con [username]" en el header
   - Fallback a "Mensaje directo" si falla la query
   
2. **Guardado de `currentThreadType`** para uso posterior en `loadThreadMessages()`

**Resultado:** Los DM ahora muestran claramente con quién estás hablando en el header del chat.

**Partes modificadas:**
- `parseMessageBody()` — robustez mejorada con validaciones y fallbacks
- Renderizado de mensajes del sistema — fallback para body vacío
- `openThread()` — obtención del nombre del otro usuario en DM

**Partes NO modificadas:** `resolveMissions()`, `tick()`, `scheduleSave()`, `flushVillage()`, `saveVillage()`, `simulateBattle()`, esquema Supabase, `game-data.js`, bloque canónico de globales, `escapeJs()`.

---

### v1.07 — Corrección crítica: misiones de retorno bloqueadas + errores de sintaxis en mensajes

**Bug 1 cerrado:** Las misiones de tipo `'return'` (tropas volviendo de batalla/espionaje) no se estaban resolviendo al llegar a su `finish_at`, causando que las tropas quedaran atascadas indefinidamente en tránsito.

**Causa raíz:** En `resolveMissions()`, el procesamiento de misiones de tipo `'return'` estaba ubicado **fuera del bloque try-catch principal** de ejecución de misiones. Cuando una misión de retorno llegaba a su `finish_at`:

1. Entraba en el bloque `if (now >= finish)` (línea 5014)
2. Pasaba por todos los `else if` de tipos específicos (spy, attack, found, etc.) sin coincidir
3. Llegaba al código de líneas 5051-5085 que **creaba una nueva misión de retorno** en lugar de procesarla
4. La misión original nunca se eliminaba de la cola

El código duplicado en líneas 5086-5209 (`else if (m.type === 'return' && now >= finish)`) **nunca se ejecutaba** porque estaba en un `else if` inalcanzable — ya dentro del bloque que comprobaba `now >= finish`.

**Fix aplicado para Bug 1:**
1. **Movido el procesamiento completo de `type === 'return'`** (líneas 5086-5209) **dentro del bloque try-catch** de ejecución de misiones, como un nuevo `else if` después de `return_reinforce`
2. **Eliminado el código duplicado** que estaba en el lugar incorrecto
3. **Añadido `continue`** al final del bloque de retorno para descartar la misión tras procesarla
4. **Simplificado el `else` final** para solo añadir misiones pendientes a `remaining`

**Resultado:** Ahora las tropas que regresan se procesan correctamente, devolviendo las tropas (respetando capacidad de barracas), aplicando botín, enviando informe al jugador, y eliminando la misión de la cola.

**Bug 2 cerrado (UX):** El panel de control supremo (admin) no tenía botón de cerrar accesible.

**Fix:** Añadido botón `✕ Cerrar` en la esquina superior derecha del panel, junto al título, siempre visible independientemente del estado de edición.

**Bug 3 cerrado (crítico):** `Uncaught SyntaxError: Invalid or unexpected token` en la sección de mensajes. El juego no cargaba la interfaz de mensajes y mostraba errores de sintaxis en consola.

**Causa raíz:** 
1. Uso de `setAttribute('onclick', 'toggleMsgExpand(' + m.id + ')')` en lugar de asignación directa de eventos → generaba HTML con sintaxis incorrecta
2. Nombres de usuarios y aldeas con comillas simples (ej: "O'Brien", "L'aldea") insertados directamente en atributos `onclick` sin escapar → rompían la sintaxis JavaScript inline
3. `escapeHtml()` no es adecuada para strings en atributos onclick — convierte `'` a `&#39;` que funciona en HTML pero no en JavaScript

**Fix aplicado para Bug 3:**
1. **Nueva función `escapeJs(str)`** para escapar correctamente strings que van dentro de JavaScript inline (atributos onclick):
   - Escapa backslashes: `\` → `\\`
   - Escapa comillas simples: `'` → `\'`
   - Escapa comillas dobles: `"` → `\"`
   - Escapa saltos de línea: `\n` → `\\n`
   
2. **Eliminado `setAttribute('onclick')`** en `loadThreadMessages()`:
   - Línea 9861: ahora usa `row.onclick = function() { toggleMsgExpand(m.id); };`
   - Línea 9892: mismo cambio para mensajes DM/alianza
   
3. **Todos los nombres en onclick ahora usan `escapeJs()`**:
   - `openMapDM()` — líneas 7360, 7380: `escapeJs(ownerName)`
   - `openMoveModal()` — líneas 7347, 7358, 7625: `escapeJs(vname2)`, `escapeJs(allyVname)`, `escapeJs(destVillageName)`
   - `openTransportModal()` — líneas 7348, 7359, 7918: `escapeJs(vname2)`, `escapeJs(allyVname)`, `escapeJs(destVillageName)`
   - `moveStep2()` — línea 7478: `escapeJs(destVillageName)`
   - `transportStep2()` — línea 7812: `escapeJs(destVillageName)`

**Resultado:** Los mensajes ahora cargan correctamente sin errores de sintaxis, incluso cuando los nombres de usuarios/aldeas contienen caracteres especiales.

**Partes modificadas:**
- `resolveMissions()` — reestructurada lógica de tipos de misión
- `loadThreadMessages()` — reemplazado setAttribute por asignación directa de eventos
- HTML del panel de control supremo — añadido botón de cierre
- Nueva función `escapeJs()` — añadida después de `escapeHtml()`
- Todos los onclick con nombres de usuarios/aldeas — ahora usan `escapeJs()`

**Partes NO modificadas:** `tick()`, `scheduleSave()`, `flushVillage()`, `saveVillage()`, `simulateBattle()`, esquema Supabase, `game-data.js`, bloque canónico de globales.

**Reglas del sistema preservadas:**
- **Modelo evento-reactivo:** `resolveMissions` sigue siendo reactivo, solo se llama cuando un `finish_at` llega a cero en el tick local
- **Guardado por eventos:** El procesamiento de retornos dispara `scheduleSave()` al modificar el estado
- **Capacidad de barracas:** Se respeta estrictamente al devolver tropas, aplicando las leyes de v0.95-v1.00
- **Recursos:** Botín se aplica respetando límites de almacén, esencia sin límite
- **Escapado de HTML vs JS:** `escapeHtml()` para contenido mostrado, `escapeJs()` para atributos onclick/JavaScript inline

---

### v1.00 — Corrección ReferenceError al login

**Bug cerrado:** `initGame error: ReferenceError: _missionWatchScheduled is not defined at tick`

**Causa raíz:** En v0.98 se diseñaron `_missionWatchScheduled`, `_stateDirty` y se documentaron en ARQUITECTURA.md, pero nunca se añadieron al bloque canónico de globales del HTML. `activeVillageId` tenía el mismo problema. `tick()` se lanza desde `switchVillage()` dentro de `initGame()` — el primer frame del juego — y ya referenciaba estas variables sin declararlas.

**Fix:**
- Añadidas `let activeVillageId`, `let _stateDirty`, `let _missionWatchScheduled` al bloque canónico
- Bloque de globales reescrito con comentarios de sección para guiar adiciones futuras
- Versión actualizada en `<title>` y `#versionFooter` → `v1.00`

**Decisión técnica:** `autoSaveTimer` se mantiene declarado aunque el modelo reactivo ya no usa autoSave en bucle. `doLogout()` llama `clearInterval(autoSaveTimer)` — eliminarlo rompería el logout sin necesidad.

**Partes no modificadas:** `tick()`, `resolveMissions()`, `scheduleSave()`, `flushVillage()`, `saveVillage()`, `simulateBattle()`, esquema Supabase, `game-data.js`.

---

### v0.98 — Modelo evento-reactivo (actual)
- **Eliminados todos los `setInterval` de red** (autoSave cada 60s, checkIncomingAttacks cada 30s, processRecalls cada 5min, updateLastSeen cada 5min)
- **`tick()` es ahora 100% local**: cero llamadas a Supabase dentro del tick
- **`resolveMissions` es reactivo**: solo se lanza cuando un `finish_at` llega a cero, no en polling
- **Guardado por eventos**: `scheduleSave()` solo se llama cuando el jugador hace algo o cuando una cola completa
- **Carga inicial one-shot**: `checkIncomingAttacks`, `updateLastSeen`, `updateOnlineCount`, `processRecalls` se llaman una sola vez al hacer login
- Añadido `_stateDirty` flag para evitar guardados innecesarios
- Añadido `_missionWatchScheduled` para evitar resoluciones de misión duplicadas

### v0.99 — Sliders, minimapa y borrar aldea
- **Bug sliders corregido**: `_previewWorker` ahora lee valores del DOM en lugar del state — eliminado el error "más aldeanos de los disponibles" al mover la 3ª barra
- **Mapa principal 15×15** (`MAP_VIEW = 7`, antes 10)
- **Minimapa 30×30**: canvas no interactivo junto al mapa. Colores: propio=cian, aliado=verde, enemigo=rojo, NPC=dorado. Encuadre dorado indica la zona visible en el mapa principal
- **Borrar aldea**: en zona de peligro del perfil. Requiere escribir nombre exacto de la aldea. Deshabilitado si es la única aldea. Borra en Supabase: buildings, troops, creatures, village

### v0.98 — Modelo evento-reactivo (sin polling)
- Eliminados todos los setInterval de red
- tick() es 100% local — cero Supabase
- resolveMissions reactivo: solo cuando finish_at llega a cero
- Carga one-shot al login: checkIncomingAttacks, updateLastSeen, updateOnlineCount, processRecalls

### v0.97 — Base de partida
- Juego funcional con polling cada 1s (resolveMissions), 30s (checkIncomingAttacks), 60s (autoSave), 5min (processRecalls)

### v0.95 — Correcciones de mecánicas
- Muralla reimplementada como escudo con HP propio (antes sumaba HP a tropas — incorrecto)
- Criaturas: visibilidad por `torreLevel`, no por `invocadorLevel`
- Provisiones no se restauran al volver de misión
- Military score suma todas las aldeas y criaturas del jugador
- Descripciones de edificios mejoradas con información correcta

---

## REGLA DE VERSIONADO — OBLIGATORIO EN CADA VERSIÓN

Cada vez que se genera una nueva versión del juego, **deben actualizarse los tres sitios siguientes** de forma coherente. Si no se actualizan los tres, la versión es inconsistente.

| Qué | Dónde | Ejemplo |
|---|---|---|
| **Nombre del archivo** | El propio `.html` | `epic-warriors-v1_08.html` |
| **Pestaña del navegador** | `<title>` en la línea ~7 del HTML | `<title>Epic Warriors Online v1.08</title>` |
| **Pie de página del juego** | `<div id="versionFooter">` en la línea ~10834 | `EPIC WARRIORS v1.08` |

**Formato de versión:** `v1.XX` con dos dígitos (v1.00, v1.01, v1.07, v1.08...).
El nombre de archivo usa guión bajo: `v1_08`. El título y el footer usan punto: `v1.08`.

---

## REGLAS QUE NO SE DEBEN ROMPER

1. **Ningún `setInterval` puede llamar a Supabase.** Solo el tick visual (cálculo local) puede estar en un interval.
2. **`calcRes()` nunca escribe en `state.resources`.** Solo lee.
3. **`snapshotResources()` es la única función que congela recursos antes de guardar.**
4. **La muralla es un escudo con HP, no un bonus a tropas.**
5. **La visibilidad de criaturas depende de `torreLevel`, no de `invocadorLevel`.**
6. **`game-data.js` debe estar en el mismo directorio que el HTML** para que GitHub Pages lo sirva correctamente.
7. **Supabase es la única fuente de verdad persistente.** Nunca usar `localStorage` para estado de juego.
8. **GitHub Pages es el único hosting.** No introducir dependencias de servidor.
9. **Toda variable usada en `tick()` debe declararse en el bloque canónico de globales.** Una variable no declarada produce `ReferenceError` en el primer frame del juego, bloqueando el login. Ver sección *VARIABLES GLOBALES — BLOQUE CANÓNICO*.
10. **Escapado de strings:** Usar `escapeHtml()` para contenido HTML renderizado, **usar `escapeJs()` para strings dentro de atributos onclick o JavaScript inline**. No usar `escapeHtml()` en onclick — causa errores de sintaxis cuando el string contiene comillas simples.

---

## PARTES DEL SISTEMA QUE NO DEBEN MODIFICARSE SIN REVISIÓN

| Componente | Por qué |
|---|---|
| `saveVillage` / `flushVillage` | Lógica de guardado delicada con guards de concurrencia |
| `calcRes` / `snapshotResources` | Cualquier error aquí duplica o destruye recursos |
| `simulateBattle` / `executeTurn` | Motor de combate, cambios afectan balance global |
| `resolveQueue` / `resolveMissions` | Lógica de colas con timestamps — errores corrompen estado |
| Esquema de tablas Supabase | Cambios de columnas requieren migración SQL coordinada |
| `TROOP_TYPES` / `CREATURE_TYPES` | Son fuente de verdad para combate, coste y producción |
| Bloque canónico de globales | Añadir variables aquí sin declararlas rompe `tick()` en el primer frame |
