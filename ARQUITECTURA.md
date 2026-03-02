# EPIC WARRIORS — DOCUMENTO DE ARQUITECTURA
> Versión del documento: 2.1 — Última actualización: v1.47
> Fuentes de verdad: **Supabase** (datos) · **GitHub Pages** (código)

---

## 📋 PROTOCOLO DE MANTENIMIENTO DE ESTE DOCUMENTO

Este documento debe actualizarse **en la misma entrega** que introduce el cambio. No actualizarlo después.

### Cuándo actualizar
- Nueva tabla o columna en Supabase
- Nueva función que entra en la lista de "no tocar sin revisión"
- Nueva regla de arquitectura o restricción
- Eliminación de un comportamiento o componente
- Cambio en el modelo de red, guardado o tick

### Cómo añadir una versión nueva

1. Actualizar la cabecera: `Última actualización: vX.XX`
2. Añadir entrada al final de `## HISTORIAL DE VERSIONES` con esta plantilla:

```markdown
### vX.XX — [Título]
- descripción del cambio principal
- [Supabase] nuevas tablas/columnas/triggers/RPCs si aplica
- [Regla nueva] restricción añadida
- [Eliminado] comportamiento anterior que ya no existe
```

3. Actualizar las secciones afectadas (tablas, reglas, componentes).
4. No eliminar entradas antiguas del historial.

---

## STACK TÉCNICO

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend HTML | `index.html` | HTML + config + initGame + tick + saveVillage |
| Globals | `game-globals.js` | sbClient, SUPABASE_URL/KEY, globals compartidos — cargado primero |
| Constantes | `game-constants.js` | TROOP_TYPES, CREATURE_TYPES, BUILDINGS, cálculos puros |
| Tropas UI | `game-troops.js` | UI de tropas/criaturas, entrenamiento, invocación |
| Combate | `game-combat.js` | Motor de batalla, loot, informes, getTroopLevel |
| Motor red | `game-engine.js` | calcRes, misiones, resolveMissions, executeXxx |
| UI | `game-ui.js` | Mapa, edificios, modales, recursos UI, utils |
| Social | `game-social.js` | Ranking, investigación, alianzas, mensajes |
| Herrería | `game-smithy.js` | Mejoras de armas/armaduras por tropa, SMITHY_DATA |
| Auth | `game-auth.js` | Login, registro, perfil, cuenta |
| Estilos | `epic-warriors.css` | Todos los estilos separados del HTML |
| Base de datos | Supabase (PostgreSQL) | Estado persistente de jugadores |
| Hosting | GitHub Pages | Distribución del cliente |
| Assets estáticos | `game-data.js` | NPCs, datos inmutables (250 castillos) |
| Simulador | `game-simulator.js` | Simulador de batalla (iframe embebido) |
| Admin | `game-admin.js` | Panel de administración |
| Cuevas | `game-caves.js` | Sistema de cuevas: spawn, ataque, captura, muerte del guardián, panel admin |

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
| `player_objectives` | Estado de objetivos NPC por jugador | Al completar batalla NPC |
| `caves` | Cuevas del mapa: id, cx, cy, status (wild/captured), owner_id, village_id | Al capturar/liberar guardián, al morir el guardián |
| `messages` | Informes de batalla, espionaje, sistema | Al completar misiones |

> Si añades una tabla nueva, añádela a esta tabla con su contenido y momento de escritura.

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


---

## MÓDULO game-caves.js — ARQUITECTURA

### Tabla `caves`
```sql
CREATE TABLE caves (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cx         INT NOT NULL,
  cy         INT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'wild',  -- 'wild' | 'captured'
  owner_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  village_id UUID REFERENCES villages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Guardián (`guardiancueva`)
- Definido en `CREATURE_TYPES` en `game-caves.js` como fallback (también puede estar en `game-constants.js`)
- **NO es una columna de la tabla `creatures`** — esta es la regla más crítica del módulo
- Se persiste via la tabla `caves` (status, owner_id, village_id)
- Al capturar: `caves.status = 'captured'`, `owner_id = currentUser.id`, `village_id = activeVillage.id`
- Al morir: la cueva reaparece en posición aleatoria como `status = 'wild'`

### Flujo de combate en cueva
```
openCaveAttackModal() → launchCaveAttack() → startCaveMission()
  → misión tipo 'cave_attack' en mission_queue
  → al resolver: executeAttackCave()
    → simulateBattle() vs guardián
    → victoria: caves.update({status:'captured'})
    → derrota: tropas regresan, cueva sigue wild
```

### En `_adminDeleteUserData`
Al borrar un usuario, liberar sus cuevas capturadas:
```javascript
await sbClient.from('caves').update({ status: 'wild', owner_id: null, village_id: null })
  .eq('owner_id', userId);
```

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
- **60 criaturas** en **30 tiers** — 2 por tier, una de cada arquetipo
- **Visibilidad**: `torreLevel >= tier` (Torre de Invocación, niveles 1-30)
- **Invocación**: requiere dos condiciones: (1) nivel individual del invocador en `_researchData.troop_levels['invocador'] >= tier` (subido en el Centro de Investigación, igual que cualquier tropa); (2) `invocadoresActuales >= summonersNeeded` invocadores presentes en la aldea. Ambas son necesarias (AND).
- La Torre de Invocación **solo reduce tiempos** (-5%/nivel), **no desbloquea** criaturas
- Nunca filtrar visibilidad por nivel de invocador.

### Mensajes del sistema
- `sendSystemReport(userId, title, body)` escribe via RPC `send_system_message`
- Si el destinatario es el usuario activo y está en la página de mensajes, refresca automáticamente `renderThreads()` y `loadSystemReports()`
- **NO hay mensaje de "tropas han regresado"** — solo notificación emergente

---

## VARIABLES GLOBALES — BLOQUE CANÓNICO

Desde v1.44, todas las variables globales compartidas están en `game-globals.js` (cargado primero). El bloque canónico del HTML ya no las define — solo las usa.

Variables críticas definidas en `game-globals.js`: `sbClient`, `SUPABASE_URL`, `SUPABASE_KEY`, `GAME_VERSION`, `MAP_SIZE`, `GHOST_OWNER_ID`, `currentUser`, `myVillages`, `activeVillage`, `activeVillageId`, `isFlushing`, `pendingFlush`, `_stateDirty`, `_missionWatchScheduled`, `uiTimer`, `autoSaveTimer`, `playerObjectives`

---

## REGLAS QUE NO SE DEBEN ROMPER

1. **Ningún `setInterval` puede llamar a Supabase.**
2. **`calcRes()` nunca escribe en `state.resources`.** Solo lee.
3. **`snapshotResources()` es la única función que congela recursos.**
4. **La muralla es un escudo con HP, no un bonus a tropas.**
5. **La visibilidad de criaturas depende de `torreLevel`, no del nivel del invocador.**
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

16. **`game-constants.js` solo datos puros.** Ninguna función en él puede referenciar `document`, `sbClient` o cualquier global del juego a nivel de módulo.
17. **El orden de carga de scripts en `<head>` es fijo:** game-globals → game-data → game-constants → game-troops → game-combat → game-engine → game-ui → game-social → game-smithy → game-auth → game-simulator → game-admin → css. No reordenar.
18. **`game-globals.js` debe cargarse PRIMERO.** Contiene `sbClient` y los globals del juego. Cualquier módulo que los use antes fallará con ReferenceError.

19. **`guardiancueva` NO es columna de la tabla `creatures`.** Se gestiona exclusivamente a través de la tabla `caves`. Nunca incluirlo en UPDATE/INSERT sobre `creatures`.
20. **Espionaje sobre aldeas de jugadores reales:** leer tropas de `villages.state` (JSON blob), NO de las tablas separadas `troops`/`creatures`. Las tablas separadas solo existen para aldeas fantasma.

> Si añades una nueva regla, añádela aquí numerada y con descripción. No eliminar reglas antiguas.

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
| `loadAdminCaves` / `executeAttackCave` / `onCaveGuardianDied` | game-caves.js | Sistema de cuevas completo |
| `simJS_template` (en game-simulator.js) | game-simulator.js | Backticks internos deben estar escapados |

> Si añades un componente crítico nuevo, añádelo a esta tabla.

---

## HISTORIAL DE VERSIONES

> Añadir siempre al principio. No eliminar entradas antiguas.

### v1.47 — Criaturas cazadas completamente funcionales + Admin mobile

**game-caves.js — Garantía robusta de guardiancueva**
- Añadida validación en `executeAttackCave()` para garantizar que `guardiancueva` existe en `CREATURE_TYPES`
- Fallback completo: si no existe, se define automáticamente
- Mejora robustez en caso de problemas de carga de módulos

**game-troops.js — Nueva función `renderCaughtCreatures()`**
- `renderCaughtCreatures()`: nueva función que renderiza guardias capturados separadamente
- `renderCreaturesList()` modificada: ahora excluye `guardiancueva` (se renderiza en apartado separado)
- `renderCreatures()` mejorada: llama a `renderCaughtCreatures()` entre `renderCreaturesList()` y `renderSummonOptions()`
- Estilo visual diferenciado: gradiente dorado, borde brillante, label "⛏️ CAPTURADO"

**index.html — Nueva sección + Navegación admin**
- Nueva sección HTML: `<div id="caughtCreaturesBox">` para criaturas cazadas
- Ubicación: entre "TUS CRIATURAS" y "INVOCAR" en página de criaturas
- Botones navegación rápida admin: 👥 Usuarios | ⛏️ Cuevas | 🛡️ Alianzas
- Responsive: usa `flex-wrap` funciona perfectamente en mobile

**REFERENCIA_PARA_IA.md y ARQUITECTURA.md — Documentación actualizada**
- Reglas nuevas v1.47: `guardiancueva` siempre debe existir en CREATURE_TYPES antes de usarlo
- Sistema de Criaturas Cazadas documentado completamente

### v1.46 — Cuevas, borrado de usuarios y correcciones de espionaje

**game-caves.js (nuevo módulo)**
- Sistema completo de cuevas salvajes en el mapa (`CAVES_TOTAL = 10`)
- Guardián `guardiancueva` en `CREATURE_TYPES` — **no es columna de `creatures`**, se gestiona via tabla `caves`
- Flujo: cueva wild → ataque → captura guardián → si muere, reaparece en posición aleatoria
- Panel admin: botones 🎲 Random y 📍 Elegir coordenadas para teleportar cuevas
- [Supabase] Tabla `caves`: `id, cx, cy, status ('wild'|'captured'), owner_id, village_id, created_at`

**game-admin.js — borrado de usuarios corregido**
- Orden de borrado corregido: `alliance_members → messages → thread_members → player_objectives → troops → resources → creatures → caves → villages → profiles`
- Tabla `objectives` renombrada a `player_objectives` en todos los accesos
- Tabla `ranking` eliminada del flujo (no existe)
- `renderAdminUsersList` solo se llama si el elemento DOM existe (evita `null.innerHTML`)
- `viewAdminUserDetails` corregido: usa `player_objectives`

**game-engine.js — correcciones**
- `PATCH creatures 400` corregido: filtrar `guardiancueva` en el UPDATE post-combate de aldeas fantasma
- Espionaje PvP corregido: ahora lee tropas de `villages.state` para jugadores reales; solo usa tablas separadas (`troops`/`creatures`) para aldeas fantasma
- [Regla nueva] `guardiancueva` nunca va en UPDATE a tabla `creatures`
- [Regla nueva] Espionaje distingue jugador real vs fantasma para leer tropas

### v1.43 — Correcciones XP y stats de tropa
- `weapon` y `armor` en `TROOP_TYPES` = 0 para todas las tropas. Son stats de Herrería, no base.
- Modal `showTroopStats`: muestra nivel de Herrería real, no base hardcodeado.
- `add_experience` RPC: ahora actualiza `_researchData.experience`, `ovExperience` y `researchXPDisplay` inmediatamente.
- [REGLA] `weapon`/`armor` en `TROOP_TYPES` siempre 0. Solo se suman en combate los niveles de Herrería.
- [REGLA] Edificios nunca bajan de nivel.

### v1.40 — Invocadores y colas
- **`getTroopLevel`** corregido: eliminado el sistema de umbrales ficticio basado en cantidad. Ahora lee `_researchData.troop_levels['invocador']` igual que cualquier otra tropa.
- **`canSummon`**: requiere (1) `troop_levels['invocador'] >= cData.tier` y (2) `invocadoresActuales >= summonersNeeded`. Ambas AND.
- **`resolveSummoningQueue`**: el sistema de PAUSA eliminado. Si los invocadores bajan (muertos/movidos) o el nivel de invocador es insuficiente → **cancelación automática sin devolución** de esencia. Se guarda `tierRequired` en cada entrada de cola al encolar.
- **`cancelSummoningQueue()`** nueva en `game-combat.js`: cancela toda la cola manualmente con devolución completa de esencia.
- **`cancelTrainingQueue()`** nueva en `game-troops.js`: cancela toda la cola de entrenamiento con devolución de recursos y aldeanos.
- **UI**: botón 🗑 "Cancelar todo" añadido en `renderTrainingQueue` y `renderSummoningQueue`. Solo visible si hay cola.

### v1.39 — Separación completa en módulos JS
- index.html reducido de ~9.300 a ~1.945 líneas (−79%); ahora solo HTML + config + initGame + tick + save
- Nuevos archivos: game-constants.js, game-troops.js, game-combat.js, game-engine.js, game-ui.js, game-social.js, game-auth.js
- Orden de carga obligatorio: game-data → game-constants → game-troops → game-combat → game-engine → game-ui → game-social → game-auth → game-simulator → game-admin → css
- [Regla nueva] Nunca poner código que referencie DOM o sbClient a nivel de módulo en game-constants.js (debe ser datos puros)
- [Regla nueva] El orden de carga de scripts en `<head>` es fijo y no se puede reordenar arbitrariamente: **game-globals → game-data → game-constants → game-troops → game-combat → game-engine → game-ui → game-social → game-smithy → game-auth → game-simulator → game-admin → css**

### v1.38 — Bestiario completo: 60 criaturas en 30 tiers
- `CREATURE_TYPES` expandido de 10 a 60 criaturas (2 por tier, tiers 1-30)
- Criaturas existentes mantenidas con sus claves JS — jugadores no pierden nada; stats buffed en T5-T22
- Bug corregido: Dragón y Arconte pasaban a tier 22 (antes tier 5 era inalcanzable)
- `getTroopLevel('invocador')` rediseñado: eliminado sistema de umbrales por cantidad → ahora lee `_researchData.troop_levels['invocador']` (igual que cualquier tropa)
- Torre de Invocación: rol cambiado de gate a reductor de tiempos exclusivamente
- Tiempos de invocación reescalados: T1=5min, T5=50min, T10=5h, T15=24h, T22=72h, T30=144h (sin torre)
- 50 nuevas criaturas añadidas (mitología clásica y medieval): Kobold, Sílfide, Troll, Banshee, Quimera, Cíclope, Basilisco, Valquiria, Minotauro, Salamandra, Manticora, Ondina, Centauro, Medusa, Wyvern, Nereida, Gigante, Harpía, Cerbero, Quetzal, Leviatán, Serafín, Titán, Lich, Pegaso, Naga, Yeti, Sátiro, Simurgh, Gorgona, Kraken, Ángel Caído, Ammit, Roc, Coloso, Sleipnir, Abismo, Nemea, Tifón, Equidna, Tarasca, Garuda, Jörmungandr, Valquiria Oscura, Primordio, Azrael, Ignis Rex, Fenrir, Moloch, Metatrón
- [Supabase] Tabla `creatures` necesita 50 columnas nuevas (ALTER TABLE — ver propuesta_criaturas.html)

### vX.XX — [Plantilla para nuevas versiones]
- descripción del cambio principal
- [Supabase] nuevas tablas/columnas/triggers/RPCs si aplica
- [Regla nueva] restricción añadida
- [Eliminado] comportamiento anterior que ya no existe

---

### v1.44 — Nuevos módulos documentados + correcciones
- `game-globals.js` nuevo: sbClient, SUPABASE_URL/KEY, GAME_VERSION, MAP_SIZE, GHOST_OWNER_ID, y todos los globals (`currentUser`, `myVillages`, `activeVillage`, flags de guardado). Cargado PRIMERO en `<head>`.
- `game-smithy.js` nuevo: Herrería completa (SMITHY_DATA, costes, upgrade, render). Niveles en `profiles.weapon_levels`/`armor_levels`. Máx nivel = nivel de Herrería (cap 15).
- `divideIntoGroups` (game-combat.js) y `divGroups` (game-simulator.js) corregidas: algoritmo de cubos (bucket 1=10, bucket 2=100, bucket 3=1000…). Ejemplo: 50→[10,40]; 1001→[10,90,900,1].
- [Supabase] RPC `add_experience(amount integer)` creado — faltaba, daba 404.
- [Supabase] FK `thread_members.user_id` → `profiles(id)` (antes apuntaba a `auth.users`, rompía joins en PostgREST).
- [Regla nueva] `game-globals.js` debe ser el PRIMER script cargado en `<head>`. Si se carga después de otro módulo que usa `sbClient`, habrá ReferenceError.

---

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
