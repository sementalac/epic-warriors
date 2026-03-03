# REFERENCIA PARA IA — Epic Warriors

## ⚠️ REGLA CRÍTICA: ARCHIVOS Y UPLOADS

**Los archivos subidos en turnos anteriores NO persisten en disco entre turnos.**
- Solo están disponibles los archivos subidos en el turno ACTUAL de la conversación.
- Si necesito modificar un archivo, el usuario DEBE subirlo en el mismo mensaje donde pide el cambio.
- Nunca asumir que un archivo está disponible porque fue subido antes.
- Si el archivo no está en `/mnt/user-data/uploads/`, pedirlo antes de proceder.
- **Siempre entregar los archivos completos y listos en `/mnt/user-data/outputs/`** — nunca instrucciones de cómo parchearlos manualmente.

---

## Estado del proyecto: Epic Warriors v1.49

### Archivos entregados en v1.49

| Archivo | Cambio | Estado |
|---------|--------|--------|
| index.html | v1.49: load/save/score/createVillage → jsonb | ✅ Entregado v1.49 |
| game-ui.js | v1.49: transport/syncResources/refuerzos → jsonb | ✅ Entregado v1.49 |
| game-engine.js | v1.49: espionaje + combate PvP → jsonb | ✅ Entregado v1.49 |
| game-admin.js | v1.49: info usuario + borrado → jsonb | ✅ Entregado v1.49 |
| game-caves.js | v1.49: write legacy guardiancueva eliminado | ✅ Entregado v1.49 |
| game-troops.js | Sin cambios (no accede a Supabase) | ✅ v1.47 |
| game-combat.js | Sin cambios (motor puro en memoria) | ✅ v1.46 |

---

## Reglas críticas por módulo

### game-engine.js
- **Espionaje (jugador real Y fantasma)** → leer desde `villages.state` jsonb — un solo camino para ambos
- **executeAttackPvP carga** → `villages.state` jsonb — sin fallback a tablas separadas
- **Guardar resultado combate (jugador real Y fantasma)** → `villages.update({ state: JSON.stringify(ts) })` — un solo camino

### game-caves.js
- `guardiancueva` existe en `CREATURE_TYPES` y vive en `state.creatures` igual que cualquier criatura
- Al liberar guardián (admin): actualizar `state.creatures.guardiancueva = 0` en `villages.state`
- Al borrar usuario: liberar sus cuevas con `caves.update({status:'wild', owner_id:null, village_id:null})`

### game-admin.js — orden de borrado de usuario
```
alliance_members → messages (sender) → thread_members → player_objectives
→ caves (liberar) → villages → profiles
```
- `troops`, `resources`, `creatures` ya NO existen — no intentar borrarlas
- Tabla correcta: `player_objectives` (no `objectives`)
- `ranking` no existe como tabla — no intentar borrar
- `renderAdminUsersList` solo llamar si `document.getElementById('adminUsersList')` existe

---

## Arquitectura general

### Sistema de velocidad (v1.44+)
- Todas las velocidades de tropas están en **casillas/hora (cas/h)**
- `MISSION_FACTOR = 3600` en game-combat.js

### Sistema de mensajes (v1.45+)
- `renderThreads`: muestra nombre descriptivo sin ID
  - Sistema → "Informes del sistema"
  - Alianza → "Chat [TAG]"
  - DM → nombre del otro jugador
- `threadMeta()`: devuelve `{ icon, color, label }` por tipo

### Sistema de cuevas (v1.46+)
- `CAVES_TOTAL = 10` cuevas en el mundo (wild + capturadas)
- Misión tipo `cave_attack` → resuelve en `executeAttackCave()`
- Al capturar: guardián pasa a `vs.creatures.guardiancueva = 1` (dentro de `state`)
- Al morir en combate: llamar `onCaveGuardianDied(villageId, ownerId)`

### Sistema de Criaturas Cazadas (v1.47+)
- **`guardiancueva`** es criatura especial: se captura en cuevas, NO se invoca
- Se renderiza SEPARADAMENTE en `renderCaughtCreatures()` (no en `renderCreaturesList()`)
- Apartado visual diferenciado: estilo dorado, label "⛏️ CAPTURADO"
- Se persiste en `state.creatures.guardiancueva` dentro del jsonb de `villages`
- **Regla crítica**: `guardiancueva` SIEMPRE debe existir en `CREATURE_TYPES` ANTES de usarlo
  - Fallback en game-caves.js línea ~472 garantiza existencia
  - Si se usa sin estar definido → error en combate
- Se puede usar en ataques/espías como cualquier criatura (sin restricción)
- Al atacar con guardián y perder → cueva reaparece en el mapa (llama `onCaveGuardianDied()`)

### Modelo de datos v1.49 — JSON blob único
Desde v1.49 **todos** los datos de aldea (jugadores y fantasmas) viven en `villages.state` jsonb:

```json
{
  "resources":          { "madera": 0, "piedra": 0, "hierro": 0, "provisiones": 0, "esencia": 0, "aldeanos": 0 },
  "aldeanos_assigned":  { "madera": 0, "piedra": 0, "hierro": 0, "provisiones": 0, "esencia": 0 },
  "troops":             { "aldeano": 0, "soldado": 0, ... },
  "creatures":          { "dragon": 0, "fenix": 0, "guardiancueva": 0, ... },
  "buildings":          { "aserradero": { "level": 0 }, "muralla": { "level": 0 }, ... },
  "build_queue":        null,
  "mission_queue":      [],
  "summoning_queue":    [],
  "training_queue":     [],
  "last_updated":       "ISO string",
  "last_aldeano_at":    null,
  "refugio":            {}
}
```

Las tablas `troops`, `creatures`, `buildings`, `resources` **ya no existen** (eliminadas en v1.49).
El trigger `trigger_create_creatures` **ya no existe**.
La RPC `admin_ghost_create` crea fantasmas con `state` jsonb directamente.

### Archivos principales
- `game-constants.js` — TROOP_TYPES, CREATURE_TYPES, constantes globales
- `game-combat.js` — motor de batalla, MISSION_FACTOR, defaultTroops/defaultCreatures
- `game-troops.js` — gestión de tropas, showTroopStats
- `game-engine.js` — calcRes, misiones, resolveMissions, executeXxx
- `game-ui.js` — UI principal, calcMissionETA, render de paneles, openMissionModal
- `game-social.js` — ranking, investigación, alianzas, mensajes
- `game-caves.js` — sistema de cuevas completo + panel admin de cuevas
- `game-admin.js` — panel de administración, borrado de usuarios, aldeas fantasma

### Base de datos (Supabase) — tablas relevantes
- `profiles` — usuario: experience, troop_levels, weapon_levels, armor_levels
- `villages` — aldeas: owner_id, cx, cy, **state jsonb** (troops + creatures + buildings + resources + colas)
- `caves` — id, cx, cy, status, owner_id, village_id
- `guest_troops` — tropas de refuerzo en aldeas ajenas
- `player_objectives` — estado de objetivos NPC por jugador (no "objectives")
- `alliance_members` — user_id, alliance_id, role, status
- `message_threads` — thread_type: 'system' | 'dm' | 'alliance'
- `thread_members` — user_id, thread_id, last_read_at
- `messages` — thread_id, sender_id, body, read

---

## Workflow para la IA

1. Al inicio de cada sesión, leer este archivo y ARQUITECTURA.md
2. Verificar qué archivos están en `/mnt/user-data/uploads/` antes de empezar
3. Si falta algún archivo necesario → pedirlo al usuario
4. Aplicar cambios y entregar **archivo completo** en `/mnt/user-data/outputs/`
5. Nunca entregar instrucciones manuales de parcheo
