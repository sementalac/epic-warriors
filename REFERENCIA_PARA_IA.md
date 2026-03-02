# REFERENCIA PARA IA — Epic Warriors

## ⚠️ REGLA CRÍTICA: ARCHIVOS Y UPLOADS

**Los archivos subidos en turnos anteriores NO persisten en disco entre turnos.**
- Solo están disponibles los archivos subidos en el turno ACTUAL de la conversación.
- Si necesito modificar un archivo, el usuario DEBE subirlo en el mismo mensaje donde pide el cambio.
- Nunca asumir que un archivo está disponible porque fue subido antes.
- Si el archivo no está en `/mnt/user-data/uploads/`, pedirlo antes de proceder.
- **Siempre entregar los archivos completos y listos en `/mnt/user-data/outputs/`** — nunca instrucciones de cómo parchearlos manualmente.

---

## Estado del proyecto: Epic Warriors v1.47

### Archivos entregados en v1.47

| Archivo | Cambio | Estado |
|---------|--------|--------|
| game-caves.js | v1.47: Garantía robusta de guardiancueva en CREATURE_TYPES | ✅ Entregado v1.47 |
| game-troops.js | v1.47: renderCaughtCreatures() para criaturas cazadas | ✅ Entregado v1.47 |
| index.html | v1.47: Sección HTML + botones admin navegación rápida | ✅ Entregado v1.47 |
| game-admin.js | Sin cambios (ya tiene funciones necesarias) | ✅ v1.46 |
| game-engine.js | Sin cambios (ya maneja criaturas correctamente) | ✅ v1.46 |
| game-ui.js | Sin cambios (ya soporta criaturas en ataques) | ✅ v1.46 |
| game-combat.js | Sin cambios (ya tiene defaultCreatures) | ✅ v1.46 |

---

## v1.47 — Criaturas Cazadas Completamente Funcionales

## Reglas críticas por módulo

### game-engine.js
- **Espionaje jugador real** → leer tropas de `villages.state` (JSON blob), NO de tablas `troops`/`creatures`
- **Espionaje aldea fantasma** → leer de tablas separadas `troops`/`creatures`/`buildings`
- **UPDATE a `creatures`** → siempre filtrar `guardiancueva` (no es columna real)

### game-caves.js
- `guardiancueva` existe en `CREATURE_TYPES` pero **NO es columna de la tabla `creatures`**
- Se persiste exclusivamente via tabla `caves` (status, owner_id, village_id)
- Al borrar usuario: liberar sus cuevas con `caves.update({status:'wild', owner_id:null, village_id:null})`

### game-admin.js — orden de borrado de usuario
```
alliance_members → messages (sender) → thread_members → player_objectives
→ troops → resources → creatures → caves (liberar) → villages → profiles
```
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
- Al capturar: guardián pasa a `vs.creatures.guardiancueva = 1`
- Al morir en combate: llamar `onCaveGuardianDied(villageId, ownerId)`

### Sistema de Criaturas Cazadas (v1.47+)
- **`guardiancueva`** es criatura especial: se captura en cuevas, NO se invoca
- Se renderiza SEPARADAMENTE en `renderCaughtCreatures()` (no en `renderCreaturesList()`)
- Apartado visual diferenciado: estilo dorado, label "⛏️ CAPTURADO"
- Se persiste en `vs.creatures.guardiancueva` (junto con el resto de criaturas)
- **Regla crítica**: `guardiancueva` SIEMPRE debe existir en `CREATURE_TYPES` ANTES de usarlo
  - Fallback en game-caves.js línea ~472 garantiza existencia
  - Si se usa sin estar definido → error en combate
- Se puede usar en ataques/espías como cualquier criatura (sin restricción)
- Al atacar con guardián y perder → cueva reaparece en el mapa (llama `onCaveGuardianDied()`)

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
- `villages` — aldeas: owner_id, x, y, state (JSON blob con troops/buildings/resources)
- `troops` — solo aldeas fantasma (GHOST_OWNER_ID)
- `creatures` — solo aldeas fantasma — SIN columna `guardiancueva`
- `resources` — solo aldeas fantasma
- `buildings` — solo aldeas fantasma
- `caves` — id, cx, cy, status, owner_id, village_id
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
