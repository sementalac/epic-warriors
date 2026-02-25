# EPIC WARRIORS — DOCUMENTO DE ARQUITECTURA
> Versión del documento: 1.6 — Última actualización: v1.33
> Fuentes de verdad: **Supabase** (datos) · **GitHub Pages** (código)

---

## STACK TÉCNICO

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend HTML | `index.html` | Engine del juego + UI + estructura |
| Estilos | `epic-warriors.css` | Todos los estilos separados del HTML |
| Base de datos | Supabase (PostgreSQL) | Estado persistente de jugadores |
| Hosting | GitHub Pages | Distribución del cliente |
| Assets estáticos | `game-data.js` | NPCs, datos inmutables (250 castillos) |
| Simulador | `game-simulator.js` | Simulador de batalla (iframe embebido) |
| Admin | `game-admin.js` | Panel de administración |

El juego es **100% serverless**. No hay servidor de aplicación. Toda la lógica reside en el cliente, y Supabase actúa como base de datos remota accesible directamente desde el navegador.

**Todos los archivos deben estar en el mismo directorio.** Mover a otra carpeta rompe las referencias relativas.

---

## ARQUITECTURA DE RED — LEY FUNDAMENTAL

### Modelo: Evento-Reactivo. Cero polling.

| Cuándo | Qué operación |
|---|---|
| Login / carga inicial | `loadMyVillages`, `checkIncomingAttacks`, `updateLastSeen`, `processRecalls` |
| El jugador hace una acción | `flushVillage` (guardado inmediato) |
| Un `finish_at` llega a cero en el tick local | `resolveMissions` → `flushVillage` |
| Cambio de aldea activa | `checkIncomingAttacks` |
| El jugador minimiza/cierra la pestaña | `flushVillage` (visibilitychange) |
| Logout | `flushVillage` final |

**No existe ningún `setInterval` que llame a Supabase.**

Todas las colas se guardan con un `finish_at` (timestamp ISO). El cliente calcula el estado actual comparando `finish_at` con `Date.now()`.

---

## EL TICK

```
setInterval(tick, 1000)  ← único loop del juego
```

`tick()` es **solo cálculo local en memoria**:

1. Resolver colas locales: `resolveQueue`, `resolveSummoningQueue`, `resolveTrainingQueue`
2. Si alguna cola completó → `scheduleSave()`
3. Detectar misiones con `finish_at <= now` → `resolveMissions` (única llamada de red reactiva)
4. Actualizar UI: recursos animados, contadores, barras de capacidad

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

- `_stateDirty`: flag de cambios sin guardar
- Debounce 2s: evita guardados duplicados por acciones rápidas
- `isFlushing` + `pendingFlush`: evitan condiciones de carrera

---

## TABLAS SUPABASE

| Tabla | Contenido | Cuándo se escribe |
|---|---|---|
| `villages` | Colas (build, mission, summoning, training), nombre, coords | En cada `saveVillage` |
| `profiles` | username, XP, military_score, last_seen, victorias PvP/NPC | Al login, al ganar/perder batallas, al cambiar XP |
| `buildings` | Niveles de edificios por aldea (una fila por aldea) | Dentro de `saveVillage` |
| `troops` | Tropas por aldea (una fila por aldea) | Dentro de `saveVillage` |
| `creatures` | Criaturas por aldea (una fila por aldea) | Dentro de `saveVillage` |
| `resources` | Recursos + aldeanos asignados por aldea | Dentro de `saveVillage` |
| `guest_troops` | Tropas de refuerzo en aldeas ajenas | `processRecalls` al login |
| `objectives` | Estado de objetivos NPC por jugador | Al completar batalla NPC |
| `messages` | Informes de batalla, espionaje, sistema | Al completar misiones |

### Columnas de `profiles` relevantes
```
battles_won_pvp   — victorias contra jugadores reales
battles_lost_pvp  — derrotas contra jugadores reales
battles_won_npc   — victorias contra castillos NPC + aldeas fantasma
```
Estas se persisten inmediatamente al ganar/perder (`.from('profiles').update()`), no esperan a `saveVillage`.

### RLS (Row Level Security)
Los usuarios solo pueden leer/escribir sus propias filas. Para que el admin pueda acceder a datos de otros usuarios, todas las operaciones admin usan **funciones RPC con SECURITY DEFINER** que bypasean RLS tras verificar el UUID del admin.

---

## ALDEAS FANTASMA — ARQUITECTURA

Las aldeas fantasma son aldeas NPC controladas por el admin para poblar el mapa sin jugadores reales.

- **owner_id:** `'00000000-0000-0000-0000-000000000000'` (constante `GHOST_OWNER_ID`)
- **Datos:** guardados en las 5 tablas separadas igual que cualquier aldea (NO tienen columna `state`)
- **Trigger:** al crear en `villages`, el trigger `trigger_create_creatures` inserta automáticamente en `creatures` — nunca hacer INSERT manual en `creatures`

### Al atacar o espiar una aldea fantasma (o cualquier aldea sin `state`)
```javascript
// executeAttackPvP / executeSpyMission detectan ts === null
// y cargan desde tablas separadas:
var bldR = await sbClient.from('buildings').select('*').eq('village_id', targetId).maybeSingle();
var trpR = await sbClient.from('troops').select('*').eq('village_id', targetId).maybeSingle();
var crtR = await sbClient.from('creatures').select('*').eq('village_id', targetId).maybeSingle();
var resR = await sbClient.from('resources').select('*').eq('village_id', targetId).maybeSingle();
```

### Al guardar resultado de combate en aldea fantasma
```javascript
// NO usar villages.update({ state: ... })
// Usar UPDATE directo en tablas:
await sbClient.from('troops').update(trpUpdate).eq('village_id', targetId);
await sbClient.from('creatures').update(crtUpdate).eq('village_id', targetId);
await sbClient.from('resources').update(resUpdate).eq('village_id', targetId);
```

---

## MÓDULO game-admin.js — ARQUITECTURA DE SEGURIDAD

Todas las operaciones que tocan datos de otros usuarios pasan por RPCs:

```
Admin hace acción
  ↓ JS llama sbClient.rpc('admin_xxxx', params)
  ↓ Supabase verifica auth.uid() === UUID_admin
  ↓ Si OK → ejecuta con privilegios elevados (SECURITY DEFINER)
  ↓ Si NO → RAISE EXCEPTION 'No autorizado'
```

**Nunca usar `.from('tabla').update()` para modificar datos de otro usuario desde el cliente.**

El archivo define su propia función `escapeAttr(s)` al inicio — no depende del HTML principal para esto.

---

## MÓDULO game-simulator.js — ARQUITECTURA

`renderSimulator()` genera un iframe con un HTML/CSS/JS autónomo via `doc.write()`. El simulador es completamente independiente — se pasan los datos de tropas como JSON al inicializarlo.

**Dependencias externas:** solo `TROOP_TYPES` y `CREATURE_TYPES` del HTML principal.

**Trampa crítica:** el código del simulador vive dentro de `var simJS_template = \`...\`` — un template literal gigante. Los backticks y `${}` internos deben escaparse como `\`` y `\${`, si no el parser de JS cierra el string prematuramente y genera `Unexpected token '<'` en el navegador.

---

## SISTEMA DE RECURSOS

```
recursos_actuales = recursos_en_BD + (produccion_por_hora × horas_transcurridas)
horas_transcurridas = (Date.now() - last_updated) / 3600000
```

- `calcRes(vs)` → solo calcula para UI, **no escribe nada**
- `snapshotResources(vs)` → congela el valor calculado antes de guardar
- `saveVillage` llama a `snapshotResources` antes de escribir en Supabase

**Nunca escribir `calcRes()` en `state.resources` fuera de `snapshotResources`.** Causaría duplicación infinita.

---

## SISTEMA DE COSTES DE EDIFICIOS — v1.29

Todos los edificios usan `phasedVal` con la misma curva de 3 fases. Solo varía la base.

```javascript
function phasedVal(l, base, m1, e1, m2, e2, m3) { ... }
// Parámetros estándar: m1=2, e1=10, m2=1.30, e2=30, m3=1.05
// Tiempos: m1=1.6, m2=1.20, m3=1.05
```

**Jerarquía de bases:**
```
Almacén (500) > Lab/TorreInvocación (280-420) > Muralla (350) >
Barracas/Cuarteles (200-300) > Círculo Místico (170) >
Torre Vigía (70-140) > Básicos (34-85)
```

---

## CAPACIDAD DEL ALMACÉN — v1.29

```javascript
function almacenCapForLevel(l) {
  if (l <= 10) return 1000 * Math.pow(2, l);
  var v10 = 1000 * Math.pow(2, 10);
  if (l <= 30) return v10 * Math.pow(1.3, l - 10);
  var v30 = v10 * Math.pow(1.3, 20);
  return v30 * Math.pow(1.05, l - 30);
}
// Nv.10 ≈ 1M | Nv.30 ≈ 195M | Nv.50 ≈ 517M
```

---

## MECÁNICAS ESPECIALES

### Muralla
Escudo con HP propio (500 HP nv.1, +500 por nivel). El atacante destruye la muralla antes de poder dañar tropas. No reimplementar como bonus a tropas.

### Criaturas
- **Visibilidad**: `torreLevel >= tier` (Torre de Invocación)
- **Invocación**: requiere además `invocadorLevel >= tier`
- Nunca filtrar visibilidad por `invocadorLevel`

### Mensajes del sistema
- `sendSystemReport(userId, title, body)` escribe via RPC `send_system_message`
- Si el destinatario es el usuario activo y está en la página de mensajes, refresca automáticamente `renderThreads()` y `loadSystemReports()`
- **NO hay mensaje de "tropas han regresado"** — solo notificación emergente

---

## VARIABLES GLOBALES — BLOQUE CANÓNICO

Toda variable usada en `tick()` debe declararse en el bloque canónico (~línea 3340 del HTML). Variables sin declarar producen `ReferenceError` en el primer frame.

Variables críticas: `activeVillageId`, `_stateDirty`, `_missionWatchScheduled`, `autoSaveTimer`, `GHOST_OWNER_ID`

---

## REGLAS QUE NO SE DEBEN ROMPER

1. **Ningún `setInterval` puede llamar a Supabase.**
2. **`calcRes()` nunca escribe en `state.resources`.** Solo lee.
3. **`snapshotResources()` es la única función que congela recursos.**
4. **La muralla es un escudo con HP, no un bonus a tropas.**
5. **La visibilidad de criaturas depende de `torreLevel`, no de `invocadorLevel`.**
6. **Todos los archivos deben estar en el mismo directorio.**
7. **Supabase es la única fuente de verdad persistente.**
8. **Toda variable usada en `tick()` debe declararse en el bloque canónico.**
9. **`escapeHtml()` para HTML renderizado, `escapeJs()` para atributos onclick, `escapeAttr()` definida en game-admin.js.**
10. **Costes de edificios siempre con `phasedVal`.** Nunca `Math.pow(X, l)` directo.
11. **Capacidad almacén siempre con `almacenCapForLevel`.**
12. **Admin nunca escribe en tablas ajenas con `.from().update()`.** Siempre RPCs.
13. **Al crear una aldea, NO insertar en `creatures` manualmente.** El trigger lo hace.
14. **Aldeas fantasma y aldeas sin `state`: cargar datos desde tablas separadas antes de combate/espionaje.**
15. **`battles_won_pvp/npc` se persisten en `profiles` inmediatamente**, no solo en `state`.

---

## COMPONENTES QUE NO SE MODIFICAN SIN REVISIÓN

| Componente | Archivo | Por qué |
|---|---|---|
| `saveVillage` / `flushVillage` | HTML | Guards de concurrencia |
| `calcRes` / `snapshotResources` | HTML | Errores duplican/destruyen recursos |
| `simulateBattle` / `executeTurn` | HTML | Motor de combate |
| `resolveQueue` / `resolveMissions` | HTML | Colas con timestamps |
| Esquema de tablas Supabase | — | Requiere migración SQL coordinada |
| `TROOP_TYPES` / `CREATURE_TYPES` | HTML | Fuente de verdad combate/coste/producción |
| Bloque canónico de globals | HTML | Variables sin declarar rompen `tick()` |
| `phasedVal` | HTML | Del que dependen todos los costes |
| `almacenCapForLevel` | HTML | Del que depende la capacidad del almacén |
| `game-data.js` | game-data.js | Datos NPC inmutables |
| `simJS_template` (en game-simulator.js) | game-simulator.js | Backticks internos deben estar escapados |

---

## HISTORIAL DE VERSIONES

### v1.33 — Aldeas fantasma funcionales + persistencia de batallas
- `executeAttackPvP` carga datos desde tablas separadas si `state === null`
- `executeSpyMission` lee tropas/criaturas/muralla de cualquier aldea PvP o fantasma
- Resultado de combate en aldea fantasma guarda en `troops`/`creatures`/`resources` directamente
- Mensajes del sistema se refrescan automáticamente en la UI
- Victorias NPC visibles en visión general (nueva caja)
- `battles_won_pvp`, `battles_lost_pvp`, `battles_won_npc` persistidos en `profiles`
- RPCs ghost en game-admin.js: `admin_ghost_create` (ignora INSERT creatures, usa UPDATE), `admin_ghost_list`, `admin_ghost_delete`
- `trigger_create_creatures` en `villages` documentado

### v1.32 — Correcciones críticas post-separación
- game-simulator.js: `simJS_template` con backticks escapados (`\``)
- game-admin.js: guard `_ghostCreating`, `escapeAttr` local
- RPC `admin_ghost_create` reescrito

### v1.31 — Separación en módulos + limpieza
- CSS, simulador y admin extraídos a archivos separados
- HTML principal reducido de 13.628 a ~9.300 líneas (−32%)

### v1.30 — RPCs admin para bypass RLS
- 5 funciones admin migradas a RPCs SECURITY DEFINER

### v1.29 — Sistema de costes unificado
- `phasedVal` y `almacenCapForLevel`

### v0.98 — Modelo evento-reactivo
- Eliminados todos los `setInterval` de red

### v0.95 — Correcciones de mecánicas
- Muralla reimplementada como escudo HP
- Criaturas: visibilidad por `torreLevel`
