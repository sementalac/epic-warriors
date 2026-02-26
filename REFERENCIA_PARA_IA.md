# EPIC WARRIORS — REFERENCIA PARA DESARROLLADORES IA

## 🤖 LEE ESTO PRIMERO — INSTRUCCIONES PARA LA IA

Este documento y `ARQUITECTURA.md` son todo lo que necesitas para empezar.
El usuario NO sube los archivos del juego al inicio. El flujo es este:

1. El usuario describe qué quiere cambiar
2. **Tú le dices qué archivo(s) necesitas que te suba** (mínimo posible)
3. El usuario sube ese(s) archivo(s)
4. Haces el cambio
5. **Entregas solo los archivos que han cambiado** — el usuario reemplaza solo esos en su carpeta

> ⚠️ **Si el cambio introduce nueva arquitectura, nuevas reglas, nuevas tablas, nuevos archivos o elimina comportamientos anteriores**, debes actualizar también `REFERENCIA_PARA_IA.md` y `ARQUITECTURA.md` y entregarlos junto con los archivos modificados. Ver sección **📋 PROTOCOLO DE ACTUALIZACIÓN DE DOCUMENTOS**.

### Archivos que el usuario tiene en su carpeta local y en GitHub Pages
Todos en el mismo directorio — mover a otra carpeta rompe el juego:

| Archivo | Qué contiene | Cambia cuando... |
|---|---|---|
| `index.html` | HTML + config + initGame + loadMyVillages + saveVillage + tick | Cambios en lógica central, login, save |
| `epic-warriors.css` | Todos los estilos | Cambios visuales |
| `game-data.js` | NPC_CASTLES — 250 castillos NPC | Casi nunca |
| `game-globals.js` | sbClient, SUPABASE_URL/KEY, globals compartidos (currentUser, myVillages, flags de guardado) | Cambios en config de Supabase o globals |
| `game-constants.js` | TROOP_TYPES, CREATURE_TYPES, BUILDINGS, phasedVal, almacenCapForLevel, barracas helpers | Cambios en stats de tropas/edificios |
| `game-troops.js` | UI de tropas/criaturas, entrenamiento, invocación | Cambios en la sección Tropas/Criaturas |
| `game-combat.js` | Motor de combate, simulateBattle, loot, reports, getTroopLevel, summoning logic, defaults | Cambios en combate/botín/criaturas |
| `game-engine.js` | calcRes, misiones, resolveMissions, executeAttack/Spy/Move/Reinforce/Transport, resolveQueue | Cambios en misiones/recursos/colas |
| `game-ui.js` | Edificios UI, mapa, modales movimiento/transporte, recursos UI, buildingDetail, utils, refuerzos | Cambios en UI del juego |
| `game-social.js` | Ranking, investigación, alianzas, mensajes, DMs, threads | Cambios en social/mensajes |
| `game-smithy.js` | Herrería: SMITHY_DATA, upgradeSmithyItem, renderSmithy, smithyWeaponCost, smithyArmorCost | Cambios en mejoras de armas/armaduras |
| `game-auth.js` | Auth (doLogin/doRegister/doLogout), perfil, cuenta, MOTD | Cambios en auth/perfil |
| `game-simulator.js` | `renderSimulator()` — simulador de batalla | Cambios en el simulador |
| `game-admin.js` | Todo el panel de administración | Cambios en funciones admin |
| `REFERENCIA_PARA_IA.md` | Este documento | Al introducir nueva arquitectura o reglas |
| `ARQUITECTURA.md` | Reglas de arquitectura | Al introducir nueva arquitectura o reglas |

### Qué pedir según el cambio solicitado
| Si el usuario quiere... | Pide... |
|---|---|
| Cambiar estilos, colores, layout | `epic-warriors.css` |
| Cambiar algo del panel admin | `game-admin.js` |
| Cambiar el simulador de batalla | `game-simulator.js` |
| Cambiar stats de tropas/criaturas/edificios | `game-constants.js` |
| Cambiar UI tropas, entrenamiento, invocación | `game-troops.js` |
| Cambiar combate, loot, informes de batalla | `game-combat.js` |
| Cambiar misiones, recursos, resolveMissions | `game-engine.js` |
| Cambiar mapa, modales, recursos UI, edificios UI | `game-ui.js` |
| Cambiar alianzas, mensajes, ranking, investigación | `game-social.js` |
| Cambiar mejoras de armas/armaduras (Herrería) | `game-smithy.js` |
| Cambiar login, registro, perfil, cuenta | `game-auth.js` |
| Cambiar globals, sbClient, config Supabase | `game-globals.js` |
| Cambiar initGame, loadMyVillages, tick, saveVillage | `index.html` |
| No está claro qué toca | Pregunta antes de pedir archivos |

### Regla de versionado — SIEMPRE al entregar el HTML
Cuando el HTML cambia, actualizar el número de versión en 2 sitios y en los query strings:
```html
<script src="game-simulator.js?v=1.XX"></script>
<script src="game-admin.js?v=1.XX"></script>
<link rel="stylesheet" href="epic-warriors.css?v=1.XX">
```
Y en: `<title>`, `#versionFooter`.

---

## 📋 PROTOCOLO DE ACTUALIZACIÓN DE DOCUMENTOS

### Cuándo actualizar los docs (obligatorio)

La IA **debe** actualizar `REFERENCIA_PARA_IA.md` y/o `ARQUITECTURA.md` cuando el cambio incluye cualquiera de estos:

| Tipo de cambio | Actualizar |
|---|---|
| Nueva tabla en Supabase o columna nueva | Ambos |
| Nueva función crítica (tick, save, etc.) | Ambos |
| Nueva regla de arquitectura o restricción | Ambos |
| Nuevo archivo del proyecto | Ambos |
| Nuevo RPC en Supabase | Solo REFERENCIA |
| Nuevo módulo o separación de código | Ambos |
| Cambio en cómo se calculan recursos/costes | Ambos |
| Nueva mecánica de juego (edificio, tropa, etc.) | REFERENCIA |
| Eliminación de comportamiento anterior | Ambos |
| Cambio en el esquema de versionado | Ambos |

**No es necesario actualizar** para: cambios de UI menores, ajustes de balance, corrección de bugs que no alteran arquitectura, cambios de estilos.

### Cómo actualizar los docs

**Paso 1 — Identificar qué secciones tocar:**
- ¿Hay una nueva tabla/columna? → Actualizar `🗄️ ESQUEMA DE BASE DE DATOS SUPABASE`
- ¿Hay una nueva función crítica? → Actualizar `🔢 ESTRUCTURA DEL HTML — MAPEO RÁPIDO` y `🔐 REGLAS OBLIGATORIAS`
- ¿Hay un nuevo RPC? → Actualizar tabla de RPCs en `📦 QUÉ TOCA CADA ARCHIVO > game-admin.js`
- ¿Hay una nueva restricción? → Añadir a `🔴 PROHIBIDO` o `🟡 CUIDADO`
- ¿Hay algo que ya no aplica? → Eliminar o tachar con nota de versión

**Paso 2 — Añadir entrada al historial:**

Copiar esta plantilla y rellenarla al final de `📊 HISTORIAL DE CAMBIOS RELEVANTES`:

```markdown
### vX.XX — [Título del cambio]
- **[Componente afectado]:** descripción del cambio
- **[Supabase]:** nuevas tablas/columnas/RPCs si aplica
- **[Restricción nueva]:** qué NO se puede hacer ahora
- **[Eliminado]:** qué comportamiento anterior ya no existe
```

**Paso 3 — Actualizar "Última actualización" al pie del documento.**

**Paso 4 — Hacer lo mismo en `ARQUITECTURA.md`:**
- Actualizar la versión en la cabecera
- Añadir entrada al `## HISTORIAL DE VERSIONES`
- Actualizar las tablas o reglas afectadas

### Qué NO hacer al actualizar docs
- No eliminar entradas del historial — solo añadir
- No reescribir secciones enteras si solo cambia una parte — editar lo mínimo necesario
- No actualizar los docs si el cambio es puramente cosmético o de UI

---

## 📁 ESTRUCTURA DE ARCHIVOS (desde v1.44)

| Archivo | Contenido | Líneas aprox |
|---|---|---|
| `index.html` | HTML + config + initGame + loadMyVillages + saveVillage + tick | ~1.945 |
| `epic-warriors.css` | Todos los estilos | ~2.300 |
| `game-data.js` | NPC_CASTLES — datos estáticos (250 castillos) | inmutable |
| `game-globals.js` | sbClient, SUPABASE_URL/KEY, GAME_VERSION, MAP_SIZE, globals compartidos | ~50 |
| `game-constants.js` | TROOP_TYPES, CREATURE_TYPES, BUILDINGS, phasedVal, almacenCapForLevel | ~986 |
| `game-troops.js` | UI tropas/criaturas, entrenamiento, invocación UI | ~622 |
| `game-combat.js` | Motor de combate, army, loot, reports, getTroopLevel, summoning | ~860 |
| `game-engine.js` | calcRes, misiones, resolveMissions, executeXxx, resolveQueue | ~1.108 |
| `game-ui.js` | Edificios UI, mapa, modales, recursos UI, utils, refuerzos | ~2.835 |
| `game-social.js` | Ranking, investigación, alianzas, mensajes | ~1.539 |
| `game-smithy.js` | Herrería: SMITHY_DATA, mejoras arma/armadura por tropa, renderSmithy | ~290 |
| `game-auth.js` | Auth, perfil, cuenta, MOTD, updateTransportUI | ~465 |
| `game-simulator.js` | `renderSimulator()` — simulador de batalla en iframe | ~840 |
| `game-admin.js` | Todo el panel admin (funciones + RPCs Supabase) | ~900 |

**Regla de carga** (orden en `<head>`):
```html
<script src="game-globals.js?v=1.XX"></script>
<script src="game-data.js"></script>
<script src="game-constants.js?v=1.XX"></script>
<script src="game-troops.js?v=1.XX"></script>
<script src="game-combat.js?v=1.XX"></script>
<script src="game-engine.js?v=1.XX"></script>
<script src="game-ui.js?v=1.XX"></script>
<script src="game-social.js?v=1.XX"></script>
<script src="game-smithy.js?v=1.XX"></script>
<script src="game-auth.js?v=1.XX"></script>
<script src="game-simulator.js?v=1.XX"></script>
<script src="game-admin.js?v=1.XX"></script>
<link rel="stylesheet" href="epic-warriors.css?v=1.XX">
```

**Cuando trabajes con IA, pasa solo los archivos afectados + este .md + ARQUITECTURA.md.**

---

## 🔢 VERSIONADO

El número de versión vive en **2 sitios del HTML principal**. Los módulos externos NO llevan versión en el nombre — la versión se controla desde el HTML con query string en los imports:

```html
<script src="game-constants.js?v=1.XX"></script>
<script src="game-troops.js?v=1.XX"></script>
<script src="game-combat.js?v=1.XX"></script>
<script src="game-engine.js?v=1.XX"></script>
<script src="game-ui.js?v=1.XX"></script>
<script src="game-social.js?v=1.XX"></script>
<script src="game-auth.js?v=1.XX"></script>
<script src="game-simulator.js?v=1.XX"></script>
<script src="game-admin.js?v=1.XX"></script>
<link rel="stylesheet" href="epic-warriors.css?v=1.XX">
```

Los 2 sitios en el HTML:
1. `<title>Epic Warriors Online v1.XX</title>`
2. `<div id="versionFooter">EPIC WARRIORS v1.XX</div>`

**Cómo buscar:** `grep -n "v1.XX" index.html`

---

## 🔍 ESTRUCTURA DEL HTML — MAPEO RÁPIDO

```
index.html (v1.39 — solo HTML + globals + core):
  Línea ~9:       <title>
  Línea ~14:      imports JS + CSS con query strings (10 archivos)
  Línea ~191:     page-overview (Visión General)
  Línea ~734:     <script> — inicio JS inline
  Línea ~735:     CONFIG (Supabase keys) + sbClient + globals
  Línea ~800:     initGame()
  Línea ~938:     loadMyVillages(), loadAllVillages()
  Línea ~1090:    saveVillage(), flushVillage(), scheduleSave()
  Línea ~1180:    tick() + uiAnim
  Línea ~1490:    checkIncomingAttacks(), toggleAlertsPanel()
  Línea ~1537:    </script>
  Línea ~1548:    HTML modales (bldModal, profileOverlay, adminOverlay, motdModal)
  Línea ~1942:    versionFooter

Módulos externos (ver cada archivo para mapeo de funciones):
  game-constants.js  — TROOP_TYPES, CREATURE_TYPES, BUILDINGS, phasedVal
  game-troops.js     — renderTroops, renderCreatures, startRecruitment, renderTrainOptions
  game-combat.js     — simulateBattle, executeTurn, generateBattleReport, getTroopLevel
  game-engine.js     — calcRes, resolveMissions, executeAttackPvP, executeMove, resolveQueue
  game-ui.js         — renderBuildings, renderMap, renderRecursos, openBuildingDetail
  game-social.js     — renderRanking, renderResearch, renderAlliances, renderThreads
  game-auth.js       — doLogin, doRegister, doLogout, openProfile, doChangeUsername
```

> ⚠️ Estas líneas son aproximadas. Si añades o eliminas bloques grandes, actualiza este mapa.

---

## 📦 QUÉ TOCA CADA ARCHIVO

### `index.html`
Solo el núcleo mínimo. Contiene:
- HTML completo (auth screen, topbar, sidebar, todas las pages, modales)
- Config Supabase, sbClient, bloque canónico de globals
- `initGame`, `loadMyVillages`, `loadAllVillages`, `populateVillageSel`, `switchVillage`, `createFirstVillage`
- `saveVillage`, `flushVillage`, `scheduleSave`, `setSave`
- `tick`, `renderAnimatedUi`, `ensureUiAnim`, `_el`, `_elCache`
- `checkIncomingAttacks`, `toggleAlertsPanel`, `updateLastSeen`, `updateOnlineCount`, `updateAlertsButton`

### `game-constants.js`
Solo datos puros y cálculos sin DOM/Supabase:
- `TROOP_TYPES`, `CREATURE_TYPES`, `getTroopStatsWithLevel`, `getTorreRange`
- `phasedVal`, `BUILDINGS`
- `getCuartelesReduction`, `getBarracksCapacity`, `getBarracksUsed`
- `getAldeanosProd`, `getAldeanosIntervalMs`, `calcAndApplyAldeanos`
- `almacenCapForLevel`, `getCapacity`, `getStoredTotal`

### `game-troops.js`
UI de la sección Tropas y Criaturas:
- `renderTroops`, `renderCreatures`, `renderSummoningQueue`, `renderCreaturesList`
- `showCreatureStats`, `renderSummonOptions`, `showBarracasModal`, `showTroopStats`
- `startRecruitmentFromInput`, `startRecruitment`, `cancelTrainingQueue`
- `renderTrainOptions`, `resolveTrainingQueue`, `renderTrainingQueue`

### `game-combat.js`
Motor de combate y lógica de misiones:
- `divideIntoGroups`, `createArmy`, `calculateRecovery`, `calculateLootCapacity`, `calculateLoot`
- `generateBattleReport`, `generateTroopTable`, `toggleBattleLog`
- `executeTurn`, `simulateBattle`, `simulateBattlePvP`, `generateBattlePvPReport`
- `isInTorreRange`, `defaultTroops`, `defaultCreatures`, `consumeAldeanos`, `defaultAssignments`
- `MISSION_FACTOR`, `getTroopLevel`, `getCreatureLevel`, `canSummon`, `startSummoning`, `startSummoningFromInput`, `cancelSummoningQueue`
- `resolveSummoningQueue`, `defaultState`

### `game-engine.js`
Motor de recursos y misiones en red:
- `getBaseProd`, `getBonusPerWorker`, `getProd`, `calcRes`
- `cancelMission`, `startMission`, `sendSystemReport`
- `resolveMissions`, `executeSpyMission`, `executeAttackMission`, `executeAttackPvP`
- `_insertActiveMission`, `_clearActiveMission`, `cancelAlliedMission`, `_returnTroopsHome`
- `executeMove`, `executeReinforce`, `executeTransport`
- `resolveQueue`

### `game-ui.js`
Todo el UI renderizado del juego:
- `startBuild`, `canAfford`, `renderBuildings`, `showMissionTroops`, `renderQueue`
- `panMap`, `renderMinimap`, `renderMap`, `selectNPC`, `selectCell`
- `openMissionModal`, `calcMissionETA`, `executeMissionClick`
- `openMoveModal`, `moveStep2`, `executeMoveClick`
- `openTransportModal`, `transportStep2`, `executeTransportClick`
- `renderReinforcementsPanel`, `processRecalls`, `recallReinforcement`
- `showPage`, `syncResourcesFromDB`, `updateGranjaPanel`, `renderRecursos`
- `snapshotResources`, `assignWorker`, `unassignWorker`, `applyAllWorkers`
- `startRename`, `confirmRename`, `openBuildingDetail`, `closeBldOverlay`
- `showNotif`, `fmt`, `fmtTime`, `escapeHtml`, `escapeJs`, `formatNumber`, `createStars`

### `game-social.js`
Sistema social completo:
- `renderRanking`, `forceRefreshRanking`, `rankingCache`
- `xpCostForLevel`, `loadResearchData`, `renderResearch`, `upgradeTroopLevel`
- `refreshMyAlliance`, `createAlliance`, `leaveAlliance`, `dissolveAlliance`, `renderAlliances`
- `renderThreads`, `openThread`, `openSystemThread`, `sendChatMsg`, `startDM`, `openAllianceChat`
- `loadSystemReports`, `openReport`, `deleteReport`, `markAllSystemAsRead`, `updateUnreadCount`
- `subscribeToThread`

### `game-auth.js`
Autenticación y gestión de cuenta:
- `normUsername`, `isUsernameShapeValid`, `setUserMsg`, `fetchBannedTerms`, `isUsernameBanned`, `isUsernameAvailable`
- `switchTab`, `setMsg`, `onUserInput`, `doLogin`, `doRegister`, `ensureProfile`, `getMyPlayerData`, `doLogout`
- `loadUserRole`, `saveMOTD`, `clearMOTD`
- `openProfile`, `closeProfile`, `doChangeUsername`, `doDeleteVillage`, `doDeleteAccount`
- `updateTransportUI`, `validateTransportRes`

### `epic-warriors.css`
Solo estilos. No tiene lógica. Si añades un elemento nuevo con clase nueva, añade su estilo aquí.

### `game-simulator.js`
Contiene únicamente `renderSimulator()`. Esta función genera un iframe con el simulador de batalla autónomo (HTML+CSS+JS via `doc.write`).
- **Depende de:** `TROOP_TYPES`, `CREATURE_TYPES` (globals del HTML principal)
- El template `simJS_template` es un template literal — los backticks y `${}` internos deben estar escapados como `\`` y `\${`
- **No tocar** sin revisar que los tipos de tropa siguen siendo los mismos

### `game-admin.js`
Todas las funciones del panel de administración. Solo accesible para `sementalac@gmail.com`.
- **Depende de:** `sbClient`, `currentUser`, `activeVillage`, `myVillages`, `showNotif`, `TROOP_TYPES`, `escapeHtml`, `escapeJs`, `fmt`, `loadMyVillages`, `switchVillage`, `getBarracksCapacity`
- Define su propia función `escapeAttr(s)` al inicio del archivo
- Todas las escrituras a otras cuentas usan **RPCs con SECURITY DEFINER** (nunca `.from().update()` directo)

**RPCs de Supabase usados por game-admin.js:**
| RPC | Qué hace |
|---|---|
| `admin_list_user_villages(p_owner_id)` | Lee aldeas de otro usuario |
| `admin_get_village_data(p_village_id, p_owner_id)` | Lee recursos+tropas+perfil de otro usuario |
| `admin_apply_to_village(...)` | Escribe recursos+tropas+XP en aldea ajena |
| `admin_repair_scan()` | Lee TODAS las aldeas para reparación |
| `admin_repair_apply(p_repairs)` | Aplica reparaciones en batch |
| `admin_delete_user(target_user_id)` | Borra usuario y todos sus datos |
| `admin_ghost_create(p_name, p_cx, p_cy, p_wall, p_troops, p_creatures)` | Crea aldea fantasma en tablas separadas |
| `admin_ghost_list()` | Lista todas las aldeas fantasma (join de 5 tablas) |
| `admin_ghost_delete(p_id)` | Borra aldea fantasma de todas las tablas |

> Si añades un RPC nuevo, añádelo a esta tabla con su firma y descripción.

### `game-data.js`
Inmutable. Contiene `NPC_CASTLES` (250 castillos con stats de combate). No modificar.

---

## 🗄️ ESQUEMA DE BASE DE DATOS SUPABASE

### Tablas principales

**`villages`** — columnas reales (NO tiene columna `state`):
```
id, owner_id, name, cx, cy,
build_queue, mission_queue, summoning_queue, training_queue,
last_aldeano_at, created_at
```
- Coordenadas: `cx`, `cy` (NO `x`, `y`)
- UNIQUE(cx, cy)

**`buildings`** — una fila por aldea (PK: village_id):
```
village_id, aserradero, cantera, minehierro, granja, almacen,
torre, barracas, circulo, reclutamiento, muralla, lab, torreinvocacion, cuarteles
```

**`troops`** — una fila por aldea (PK: village_id):
```
village_id, aldeano, soldado, asesino, paladin, chaman,
guerrero, mago, druida, explorador, invocador
```

**`creatures`** — una fila por aldea (PK: village_id):
```
village_id, orco, hada, golem, espectro, grifo, hidra, fenix, behemot, dragon, arconte
```
- ⚠️ Tiene trigger `trigger_create_creatures` que inserta automáticamente al crear en `villages`
- Al crear aldeas, NO hacer INSERT en creatures — usar UPDATE después del trigger

**`resources`** — una fila por aldea (PK: village_id):
```
village_id, madera, piedra, hierro, prov, esencia,
w_madera, w_piedra, w_hierro, w_prov, w_esencia, last_update
```

**`profiles`** — datos del jugador:
```
id, username, avatar_url, role, username_changed, updated_at, created_at,
experience, military_score, alliance_tag, last_seen,
battles_won_pvp, battles_lost_pvp, battles_won_npc
```

**`messages`** — informes de batalla, espionaje y sistema:
```
id, owner_id, title, body, read, created_at
```

**`objectives`** — estado de objetivos NPC por jugador:
```
id, owner_id, castle_id, completed_at
```

**`guest_troops`** — tropas de refuerzo en aldeas ajenas:
```
id, from_village_id, to_village_id, troops (JSON), sent_at
```

### Aldeas Fantasma
- `owner_id = '00000000-0000-0000-0000-000000000000'` (GHOST_OWNER_ID)
- No usan columna `state` — datos en las 5 tablas separadas igual que cualquier aldea
- Al atacar/espiar aldeas fantasma, cargar datos desde las 5 tablas separadas (no tienen `state`)
- Al guardar resultado de combate, hacer UPDATE en `troops`, `creatures`, `resources` directamente

> Si añades una tabla nueva o columna nueva, añádela aquí con su PK y descripción.

---

## 🏗️ SISTEMA DE COSTES DE EDIFICIOS — REGLAS OBLIGATORIAS

### ⚠️ NUNCA usar multiplicadores individuales por edificio
Desde v1.29 TODOS los edificios usan `phasedVal`. Solo varía la **base**.

### Función phasedVal
```javascript
function phasedVal(l, base, m1, e1, m2, e2, m3) {
  if (l <= e1) return base * Math.pow(m1, l);
  var v1 = base * Math.pow(m1, e1);
  if (l <= e2) return v1 * Math.pow(m2, l - e1);
  var v2 = v1 * Math.pow(m2, e2 - e1);
  return v2 * Math.pow(m3, l - e2);
}
```

**Fases estándar para TODOS:**
| Fase | Niveles | Multiplicador |
|---|---|---|
| Early | 0–10 | ×2.0 |
| Mid | 11–30 | ×1.30 |
| Late | 31–100 | ×1.05 |

**Tiempos:** misma curva con ×1.6 / ×1.20 / ×1.05

### Bases por categoría
| Categoría | Edificios | Base coste (madera/piedra) |
|---|---|---|
| Básicos | Aserradero, Cantera, Granja | 50–85 |
| Básicos+ | Mina de Hierro | 85/68/25 |
| Mágico | Círculo Místico | 170/170 + 37 esencia |
| Estratégicos | Barracas, Cuarteles | 200/300/100 |
| Avanzados | Muralla, Lab, Torre Invocación | 200–350 |
| **Almacén** | Almacén | **500/500/250** — siempre el más caro |

---

## 🏛️ CAPACIDAD DEL ALMACÉN

```javascript
function almacenCapForLevel(l) {
  if (l <= 10) return 1000 * Math.pow(2, l);
  var v10 = 1000 * Math.pow(2, 10);
  if (l <= 30) return v10 * Math.pow(1.3, l - 10);
  var v30 = v10 * Math.pow(1.3, 20);
  return v30 * Math.pow(1.05, l - 30);
}
```
Nv.10 ≈ 1M | Nv.30 ≈ 195M | Nv.50 ≈ 517M

**⚠️ NUNCA usar `1000 * Math.pow(2, lvl)` directamente** — eliminado en v1.29.

---

## 🛠️ CÓMO ACTUALIZAR — GUÍA PASO A PASO

### Paso 1: Localizar el código
```bash
grep -n "function phasedVal" index.html
grep -n "const BUILDINGS" index.html
grep -n "function tick" index.html
```

### Paso 2: Hacer el cambio

### Paso 3: Actualizar versionado (OBLIGATORIO)
```bash
grep -n "v1.XX" index.html | head -5
```

### Paso 4: Validar
```bash
grep -n "Math.pow(1\.5, l)\|Math.pow(1\.8, l)\|Math.pow(1\.9, l)" index.html
grep -n "1000 \* Math.pow(2, lvl)" index.html
# Resultado esperado: vacío
```

### Paso 5: Actualizar docs si aplica
Ver sección **📋 PROTOCOLO DE ACTUALIZACIÓN DE DOCUMENTOS**.

---

## 🗂️ TABLA DE UBICACIONES IMPORTANTES

| Qué buscar | Dónde | Cómo buscar |
|---|---|---|
| Config Supabase | index.html ~735 | `grep -n "SUPABASE_URL"` |
| Globals del juego | index.html ~740 | `grep -n "^    let "` |
| TROOP_TYPES | game-constants.js | `grep -n "const TROOP_TYPES"` |
| CREATURE_TYPES | game-constants.js | `grep -n "const CREATURE_TYPES"` |
| BUILDINGS | game-constants.js | `grep -n "const BUILDINGS"` |
| phasedVal | game-constants.js | `grep -n "function phasedVal"` |
| almacenCapForLevel | game-constants.js | `grep -n "function almacenCapForLevel"` |
| tick() | index.html | `grep -n "function tick()"` |
| saveVillage | index.html | `grep -n "function saveVillage"` |
| calcRes | game-engine.js | `grep -n "function calcRes"` |
| simulateBattle | game-combat.js | `grep -n "function simulateBattle"` |
| executeAttackPvP | game-engine.js | `grep -n "function executeAttackPvP"` |
| executeSpyMission | game-engine.js | `grep -n "function executeSpyMission"` |
| getMyPlayerData | game-auth.js | `grep -n "function getMyPlayerData"` |
| renderSimulator | game-simulator.js | línea 4 |
| Panel admin JS | game-admin.js | línea 8 |
| Estilos globales | epic-warriors.css | `:root {` |
| snapshotResources | game-ui.js | `grep -n "function snapshotResources"` |
| renderMap | game-ui.js | `grep -n "function renderMap"` |
| renderAlliances | game-social.js | `grep -n "function renderAlliances"` |
| renderRanking | game-social.js | `grep -n "function renderRanking"` |
| doLogin | game-auth.js | `grep -n "function doLogin"` |

---

## ✅ VALIDACIÓN POST-CAMBIO

**1. Versionado correcto**
```bash
grep "v1.XX" index.html | head -5
```

**2. No quedan fórmulas viejas**
```bash
grep -n "Math.pow(1\.5, l)\|Math.pow(1\.8, l)\|1000 \* Math.pow(2, lvl)" index.html
```

**3. Funciones críticas siguen presentes**
```bash
grep -n "function phasedVal\|function almacenCapForLevel\|function tick\|function saveVillage" index.html
```

**4. Sin errores de sintaxis** — abrir en navegador, F12, cero líneas rojas.

---

## 🔐 REGLAS OBLIGATORIAS (NO ROMPER)

### 🔴 PROHIBIDO
- `tick()` — Solo cálculo local, JAMÁS llamar a Supabase
- `saveVillage()` / `flushVillage()` — Guardado con guards de concurrencia
- `simulateBattle()` — Motor de combate
- `calcRes()` — SOLO lectura, NUNCA escribe en state.resources
- Fórmula `1000 * Math.pow(2, lvl)` para almacén — eliminada en v1.29
- Multiplicadores individuales por edificio (×1.5, ×1.8, etc.) — eliminados en v1.29
- Admin escribir directo con `.from().update()` en tablas de otros usuarios — usar RPCs
- Hacer INSERT en `creatures` manualmente al crear aldeas — el trigger lo hace solo
- **`weapon` y `armor` en `TROOP_TYPES` deben ser siempre 0** — son stats de Herrería, no bases de tropa. Solo se añaden en combate sumando `weapon_levels[key]` y `armor_levels[key]` de `_researchData`.
- **Edificios no pueden bajar de nivel** — no existe downgrade. No preguntar ni implementar.
- **Tras llamar `add_experience` RPC**, actualizar SIEMPRE `_researchData.experience` en memoria y los elementos DOM `ovExperience` y `researchXPDisplay`. El RPC solo escribe en Supabase, no actualiza la UI.

### 🟡 CUIDADO
- `resolveMissions()` — Lógica de timestamps, errores corrompen estado
- `resolveQueue()` / `resolveSummoningQueue()` / `resolveTrainingQueue()`
- `getBarracksUsed()` — Cálculo de tropas presentes vs en misión
- `escapeHtml()` para HTML renderizado, `escapeJs()` para onclick, `escapeAttr()` definida en game-admin.js
- Al atacar/espiar aldeas sin `state`, cargar desde tablas separadas

### ✅ PERMITIDO TOCAR LIBREMENTE
- Estilos en `epic-warriors.css`
- Funciones en `game-admin.js`
- `renderSimulator()` en `game-simulator.js`
- UI/UX (botones, colores, layouts)
- Bases de `phasedVal` (ajustar balance de costes)
- Descripciones de edificios

---

## 📊 HISTORIAL DE CAMBIOS RELEVANTES

> Añadir siempre al principio. No eliminar entradas antiguas.

### vX.XX — [Plantilla para nuevas versiones]
- **[Componente]:** descripción del cambio
- **[Supabase]:** nuevas tablas/columnas/triggers/RPCs si aplica
- **[Regla nueva]:** qué restricción se añade
- **[Eliminado]:** qué comportamiento anterior ya no existe

---

### v1.44 — Nuevos módulos documentados + fix grupos de combate + fix Supabase
- **[game-globals.js]:** nuevo archivo cargado en `<head>` antes que todo. Define `sbClient`, `SUPABASE_URL/KEY`, `GAME_VERSION`, `MAP_SIZE`, `GHOST_OWNER_ID` y todos los globals compartidos (`currentUser`, `myVillages`, `activeVillage`, flags de guardado).
- **[game-smithy.js]:** nuevo archivo. Contiene `SMITHY_DATA`, `smithyWeaponCost`, `smithyArmorCost`, `upgradeSmithyItem`, `renderSmithy`. Gestiona las mejoras de armas/armaduras individuales por tropa. Niveles guardados en `profiles.weapon_levels` / `armor_levels`. Límite máx: nivel Herrería (máx 15).
- **[game-combat.js]:** corregida `divideIntoGroups` — ahora usa sistema de cubos (bucket 1 hasta 10, bucket 2 hasta 100, bucket 3 hasta 1000…). Ejemplo: 50 → [10, 40]; 1001 → [10, 90, 900, 1].
- **[game-simulator.js]:** corregida `divGroups` con el mismo algoritmo de cubos que `divideIntoGroups`.
- **[Supabase]:** creado RPC `add_experience(amount integer)` — suma XP al jugador actual via `auth.uid()`. Era 404 antes de esta versión.
- **[Supabase]:** FK `thread_members.user_id` redirigida de `auth.users` a `profiles(id)` para que el embedded select `profiles(username)` funcione en PostgREST.
- **[Regla nueva]:** `game-globals.js` debe cargarse PRIMERO en `<head>`, antes de `game-data.js` y cualquier otro módulo.
- **`weapon`/`armor` en `TROOP_TYPES` puestos a 0** en todas las tropas. Los stats de arma y armadura solo existen como mejoras de Herrería (`weapon_levels`, `armor_levels` en `_researchData`).
- **Modal `showTroopStats`:** eliminadas filas "Arma base" / "Armadura base". Ahora muestra "Arma (Herrería): +N" y "Armadura (Herrería): +N" con el nivel real de `_researchData`.
- **XP visible en tiempo real:** tras `add_experience` RPC (tanto NPC como PvP), se actualiza `_researchData.experience` en memoria y los elementos `ovExperience` y `researchXPDisplay` sin recargar página.

### v1.39 — Separación completa en módulos JS
- **[Arquitectura]:** index.html reducido de ~9.300 a ~1.945 líneas (−79%)
- **[Nuevos archivos]:** game-constants.js (~986L), game-troops.js (~622L), game-combat.js (~812L), game-engine.js (~1.108L), game-ui.js (~2.835L), game-social.js (~1.539L), game-auth.js (~465L)
- **[index.html]:** ahora solo contiene HTML + config/globals + initGame + loadMyVillages + saveVillage + tick + checkIncomingAttacks
- **[Regla nueva]:** los imports en `<head>` deben seguir el orden: game-data → game-constants → game-troops → game-combat → game-engine → game-ui → game-social → game-auth → game-simulator → game-admin → epic-warriors.css
- **[Nota]:** updateTransportUI y validateTransportRes quedaron en game-auth.js (al final del script original); funcionalmente correcto aunque semánticamente mejor serían en game-ui.js

---

### v1.38 — Bestiario completo: 60 criaturas en 30 tiers
- **CREATURE_TYPES:** 10 → 60 criaturas; 2 por tier; tiers 1-30; claves JS existentes conservadas
- **Bug corregido:** Dragón/Arconte eran tier 5 inalcanzable → ahora tier 22
- **getTroopLevel:** eliminado sistema de umbrales por cantidad → ahora lee `_researchData.troop_levels['invocador']` (igual que cualquier tropa)
- **Torre de Invocación:** ya no bloquea criaturas, solo reduce tiempos (-5%/nivel)
- **Supabase:** tabla `creatures` necesita 50 columnas nuevas con DEFAULT 0 (ver SQL en propuesta_criaturas.html)

### v1.33 — Aldeas fantasma funcionales + persistencia de batallas
- **Aldeas fantasma:** `executeAttackPvP` y `executeSpyMission` cargan datos desde tablas separadas cuando la aldea no tiene `state`
- **Combate fantasma:** al guardar resultado, hace UPDATE en `troops`, `creatures`, `resources` en lugar de `state`
- **Espionaje PvP:** ahora muestra tropas, criaturas y nivel de muralla de cualquier aldea (fantasma o jugador)
- **Mensajes:** se refrescan automáticamente al llegar informes sin necesidad de F5
- **Victorias NPC:** nueva columna en visión general (castillos + aldeas fantasma)
- **Persistencia batallas:** `battles_won_pvp`, `battles_lost_pvp`, `battles_won_npc` guardados en `profiles` al instante — no se pierden al recargar
- **game-admin.js:** añadida `escapeAttr()` local; RPCs ghost (`admin_ghost_create`, `admin_ghost_list`, `admin_ghost_delete`)
- **Supabase:** columnas `battles_won_pvp`, `battles_lost_pvp`, `battles_won_npc` añadidas a `profiles`; trigger `trigger_create_creatures` en `villages`

### v1.32 — Correcciones críticas post-separación
- `game-simulator.js`: backticks internos de `simJS_template` escapados correctamente (`\`` y `\${`)
- `game-admin.js`: guard `_ghostCreating` para prevenir doble-click; `escapeAttr` local
- RPC `admin_ghost_create` reescrito para ignorar INSERT en `creatures` (trigger lo hace) y hacer UPDATE
- Ghost user creado en `auth.users` y `profiles`

### v1.31 — Separación en módulos + limpieza
- `epic-warriors.css` separado del HTML (~2.300 líneas)
- `game-simulator.js` — `renderSimulator()` extraído (~840 líneas)
- `game-admin.js` — todas las funciones admin extraídas (~860 líneas)
- HTML principal reducido de 13.628 a ~9.300 líneas (−32%)

### v1.30 — RPCs admin para bypass RLS
- 5 funciones admin migradas a RPCs con SECURITY DEFINER

### v1.29 — Sistema de costes y capacidad unificados
- Nueva función `phasedVal`: curva ×2/×1.30/×1.05
- Nueva función `almacenCapForLevel`: tres fases

---

## 📝 CHECKLIST ANTES DE ENTREGAR VERSIÓN

### Código
- [ ] `<title>Epic Warriors Online v1.XX</title>`
- [ ] `<div id="versionFooter">EPIC WARRIORS v1.XX</div>`
- [ ] Query strings de imports actualizados: `?v=1.XX`
- [ ] `phasedVal` y `almacenCapForLevel` siguen en el HTML
- [ ] `grep -n "Math.pow(1\.5, l)\|1000 \* Math.pow(2, lvl)"` → vacío
- [ ] Abrir en navegador, F12, cero errores rojos
- [ ] NO se tocó tick(), saveVillage(), simulateBattle() sin justificación

### Documentación (solo si el cambio lo requiere)
- [ ] `REFERENCIA_PARA_IA.md` actualizado con nueva arquitectura/reglas/tablas
- [ ] `ARQUITECTURA.md` actualizado con nueva arquitectura/reglas/tablas
- [ ] Historial de versiones añadido en ambos archivos
- [ ] "Última actualización" actualizada al pie de ambos documentos
- [ ] Plantilla de nueva versión NO incluida en la entrega (es solo referencia)

---

**Última actualización:** v1.44
**Archivos del proyecto:** index.html · epic-warriors.css · game-data.js · game-globals.js · game-constants.js · game-troops.js · game-combat.js · game-engine.js · game-ui.js · game-social.js · game-smithy.js · game-auth.js · game-simulator.js · game-admin.js
