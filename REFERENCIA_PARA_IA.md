# REFERENCIA PARA IA — Epic Warriors v1.51

---

## ⚠️ REGLAS CRÍTICAS DE OPERACIÓN

1. **Solo existen los archivos subidos en el turno ACTUAL.** Nunca asumir que un upload anterior sigue disponible.
2. **Si el archivo está en el contexto del documento → ir directo a crear el output. Sin `ls`, sin `bash`, sin intentar leerlo desde disco.** Es el mayor desperdicio de tokens — evitarlo siempre.
3. **Entregar siempre archivo completo en `/mnt/user-data/outputs/`** — nunca instrucciones manuales de parcheo.
4. Si falta un archivo necesario → pedirlo. Solo pedir LO NECESARIO (ver tabla workflow).

---

## 🔑 WORKFLOW ANTI-SOBRECARGA (validado v1.50)

**Regla de oro: ARQUITECTURA.md + REFERENCIA_PARA_IA.md siempre en contexto, más SOLO el archivo que toca.**

| Cambio | Archivo necesario |
|---|---|
| Bug UI / render / cola | Solo `game-ui.js` |
| Bug de combate | Solo `game-combat.js` |
| Bug de misiones/red | Solo `game-engine.js` |
| Tropas/criaturas UI | Solo `game-troops.js` |
| Cuevas | Solo `game-caves.js` |
| Admin | Solo `game-admin.js` |
| Bug HTML/estructura | Solo `index.html` |
| Bug multi-archivo | Máximo 2 archivos por turno |

---

## Estado del proyecto: Epic Warriors v1.51

| Archivo | Versión | Notas |
|---------|---------|-------|
| index.html | **v1.51** | ✅ |
| game-ui.js | v1.50 | ✅ |
| game-engine.js | **v1.51** | ✅ fix botín PvP provisiones + defRefugio |
| game-admin.js | v1.49 | ✅ |
| game-caves.js | v1.49 | ✅ |
| game-troops.js | v1.47 | ✅ sin cambios |
| game-combat.js | v1.46 | ✅ sin cambios |
| game-social.js | v1.45 | ✅ sin cambios |
| game-smithy.js | v1.44 | ✅ sin cambios |

---

## v1.51 — Fix botín PvP + cleanup

**Bug crítico:** `executeAttackPvP` calculaba el botín con `['madera','piedra','hierro','oro']`. El recurso `oro` no existe — el juego usa `provisiones`. Las provisiones del defensor **nunca se robaban** en PvP.

**Fix:**
```js
// ANTES ❌
['madera','piedra','hierro','oro'].forEach(...)
// DESPUÉS ✅
['madera','piedra','hierro','provisiones'].forEach(...)
```
(Afectaba dos bucles en las líneas 865 y 870 de game-engine.js)

**Cleanup adicional (game-engine.js línea 808):**
```js
// ANTES (orden engañoso — targetVillage.refugio no existe como columna)
var defRefugio = targetVillage.refugio || (ts && ts.refugio) || {};
// DESPUÉS ✅
var defRefugio = (ts && ts.refugio) || {};
```

**Fix HTML (index.html línea 261):**
```html
<!-- ANTES: atributo style duplicado —el navegador ignora el primero -->
<div class="card" style="margin-bottom:14px;" id="ovReinforcementsCard" style="display:none;">
<!-- DESPUÉS ✅ -->
<div class="card" style="margin-bottom:14px;display:none;" id="ovReinforcementsCard">
```

**Nota:** Los IDs `movItems`/`movItemsOv` ya estaban en index.html (líneas 255 y 321). El pendiente de v1.50 ya estaba resuelto.

---

## v1.50 — Fix renderQueue

**Bug:** misiones aparecían duplicadas en "EN CONSTRUCCIÓN" porque `renderQueue()` usaba los mismos contenedores para construcción y misiones.

**Fix:**
```js
// ANTES ❌
var mIds = ['qItems', 'qItemsOv'];
// DESPUÉS ✅
var mIds = ['movItems', 'movItemsOv'];
// + if (!el) return;  ← null-check de seguridad
```

---

## Reglas críticas por módulo

### game-ui.js
- `renderQueue(vs)` — construcción → `qItems/qItemsOv`, misiones → `movItems/movItemsOv`
- `snapshotResources(vs)` — única función que congela recursos antes de guardar
- `calcRes(vs)` — solo lectura, NUNCA escribe en `state.resources`

### game-engine.js
- Espionaje y combate PvP (jugador real Y fantasma) → siempre via `villages.state` jsonb
- Sin bifurcación `isGhost` para datos de aldea
- `MISSION_FACTOR = 3600` (velocidades en casillas/hora)

### game-caves.js
- `guardiancueva` vive en `state.creatures` igual que cualquier criatura
- Fallback en línea ~472 garantiza que existe en `CREATURE_TYPES` antes de usarlo
- Al borrar usuario: `caves.update({status:'wild', owner_id:null, village_id:null})`
- Al capturar: `vs.creatures.guardiancueva = 1`
- Al morir: llamar `onCaveGuardianDied(villageId, ownerId)`

### game-admin.js — orden de borrado de usuario
```
alliance_members → messages → thread_members → player_objectives
→ caves (liberar) → villages → profiles
```
- `troops`, `resources`, `creatures` NO existen como tablas — no intentar borrarlas
- `ranking` NO existe como tabla
- Tabla correcta: `player_objectives` (no `objectives`)
- `renderAdminUsersList` — solo llamar si `document.getElementById('adminUsersList')` existe

### game-troops.js
- `renderCaughtCreatures()` — renderiza `guardiancueva` separado con estilo dorado "⛏️ CAPTURADO"
- `renderCreaturesList()` — excluye `guardiancueva`

### game-social.js
- `renderThreads`: Sistema → "Informes del sistema" | Alianza → "Chat [TAG]" | DM → nombre jugador
- `threadMeta()`: devuelve `{ icon, color, label }` por tipo

---

## Modelo de datos v1.49 — JSON blob único

Todos los datos de aldea en `villages.state` jsonb:
```json
{
  "resources":         { "madera": 0, "piedra": 0, "hierro": 0, "provisiones": 0, "esencia": 0, "aldeanos": 0 },
  "aldeanos_assigned": { "madera": 0, "piedra": 0, "hierro": 0, "provisiones": 0, "esencia": 0 },
  "troops":            { "aldeano": 0, "soldado": 0 },
  "creatures":         { "dragon": 0, "guardiancueva": 0 },
  "buildings":         { "aserradero": { "level": 0 }, "muralla": { "level": 0 } },
  "build_queue":       null,
  "mission_queue":     [],
  "summoning_queue":   [],
  "training_queue":    [],
  "last_updated":      "ISO string",
  "last_aldeano_at":   null,
  "refugio":           {}
}
```

- Tablas `troops`, `creatures`, `buildings`, `resources` → **eliminadas en v1.49**
- Trigger `trigger_create_creatures` → **eliminado en v1.49**
- RPC `admin_ghost_create` → crea fantasmas con `state` jsonb directamente

---

## Base de datos (tablas activas)

| Tabla | Contenido |
|---|---|
| `profiles` | experience, troop_levels, weapon_levels, armor_levels |
| `villages` | owner_id, cx, cy, **state jsonb** |
| `caves` | id, cx, cy, status, owner_id, village_id |
| `guest_troops` | tropas de refuerzo en aldeas ajenas |
| `player_objectives` | estado objetivos NPC (no "objectives") |
| `alliance_members` | user_id, alliance_id, role, status |
| `message_threads` | thread_type: 'system' \| 'dm' \| 'alliance' |
| `thread_members` | user_id, thread_id, last_read_at |
| `messages` | thread_id, sender_id, body, read |

---

## Sistema de guardado
```
scheduleSave() → _stateDirty = true → setTimeout(flushVillage, 2000)
flushVillage() → saveVillage(activeVillage) → escribe en Supabase
```
**El tick NUNCA puede llamar a Supabase.**

## Orden de carga de scripts (fijo, no reordenar)
```
game-globals → game-data → game-constants → game-troops → game-combat
→ game-engine → game-ui → game-social → game-smithy → game-auth
→ game-simulator → game-admin → css
```
