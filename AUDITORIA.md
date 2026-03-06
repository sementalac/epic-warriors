# EPIC WARRIORS — REGISTRO DE AUDITORÍA
> Última actualización: v1.81 (ronda 2 — game-globals, game-constants, game-simulator)

Este archivo es la fuente de verdad sobre qué archivos han sido auditados, en qué versión, y qué bugs se encontraron y corrigieron. Actualizarlo en la misma entrega que introduce los cambios.

---

## ESTADO GLOBAL

| Archivo | Versión auditada | Bugs hallados | Estado |
|---|---|---|---|
| `game-combat.js` | v1.72 → v1.74 | 8 | ✅ Corregido |
| `game-troops.js` | v1.73 → v1.77 | 6 | ✅ Corregido |
| `game-engine.js` | v1.73 → v1.75 | 7 | ✅ Corregido |
| `game-ui.js` | v1.75 → v1.77 | 8 | ✅ Corregido |
| `index.html` | v1.71 → v1.81 | 9+2 | ✅ Corregido |
| `game-caves.js` | v1.76 → v1.77 | 5 | ✅ Corregido |
| `game-admin.js` | v1.77 → v1.78 | 4 | ✅ Corregido |
| `game-social.js` | v1.78 → v1.79 | 3 | ✅ Corregido |
| `game-smithy.js` | v1.74 → v1.81 | 4+1 | ✅ Corregido |
| `game-auth.js` | v1.70 → v1.80 | 6 | ✅ Corregido |
| `game-globals.js` | v1.70 → v1.81 | 2 | ✅ Corregido |
| `game-constants.js` | v1.44 → v1.81 | 1 | ✅ Corregido |
| `game-simulator.js` | v1.37 | 0 | ✅ Sin bugs |
| `index.html` | v1.71 → v1.76 | 5 | ✅ Corregido |
| `game-caves.js` | v1.76 → v1.77 | 5 | ✅ Corregido |
| `game-admin.js` | v1.77 → v1.78 | 4 | ✅ Corregido |
| `game-social.js` | v1.78 → v1.79 | 3 | ✅ Corregido |
| `game-smithy.js` | v1.74 → v1.80 | 3 | ✅ Corregido |
| `game-auth.js` | v1.70 → v1.80 | 6 | ✅ Corregido |

---

## DETALLE POR ARCHIVO

### ✅ game-combat.js — v1.72 → v1.74
**Pasadas realizadas:** 2 ✅

| # | Sev | Función | Descripción | Fix |
|---|---|---|---|---|
| 1 | 🟠 | `generateBattleReport` L169 | Log insertado sin `escapeHtml()` — XSS | `escapeHtml(line)` |
| 2 | 🟠 | `cancelSummoningQueue` | Sin `loadMyVillages()`+`tick()` tras RPC — estado desincronizado | Añadidos tras RPC exitoso |
| 3 | 🟠 | `generateBattleReport` L141/145 | `attackerName`/`defenderName` sin `escapeHtml()` — XSS | `escapeHtml(name)` |
| 4 | 🟡 | `generateBattlePvPReport` L466-467 | `winner===0` mostraba rojo + texto defensor | Color neutro + `⚖️ EMPATE` |
| 5 | 🟡 | `startSummoning` | Solo `renderCreatures()`, faltaba `tick()` | `tick()` añadido |
| 6 | 🟡 | `cancelSummoningQueue`+`startSummoning` | Sin null-guard en `data` antes de `data.ok` — TypeError | `!data \|\| !data.ok` |
| 7 | ⚪ | `generateBattlePvPReport` L442 | Fila "SE RECUPERAN" visible con todos ceros cuando `wallResisted===true` | `hasRecovery` flag |
| 8 | ⚪ | Comentarios | "nunca toca resources local" era falso | Corregidos |

---

### ✅ game-troops.js — v1.73 → v1.74
**Pasadas realizadas:** 2 ✅

| # | Sev | Función | Descripción | Fix |
|---|---|---|---|---|
| 1 | 🟠 | `startSummoning` L416 | Sin check `newState.ok` — fallo RPC mostraba éxito y aplicaba estado basura | `!newState \|\| newState.ok === false` |
| 2 | 🟠 | `startRecruitment`+`cancelTrainingQueue` | Sin check `newState.ok` — en `startRecruitment` vaciaba `training_queue` en fallo | Mismo patrón ok-check |
| 3 | 🟡 | `applyRefugio` | Sin `renderSummoningQueue()`+`renderCreatures()` tras cancel exitoso | Añadidos tras `data.ok` |
| 4 | 🟡 | `resolveSummoningQueue` | Sin `scheduleSave()` tras reembolso local de esencia — pérdida al cerrar sesión | `scheduleSave()` en ambos casos |
| 5 | ⚪ | `resolveTrainingQueue` | `changed` declarado pero nunca usaba `scheduleSave()` | `if (changed) scheduleSave()` |
| 6 | 🟠 | `startRecruitment` + `startSummoning` | Mismo bug que game-ui.js Bug-8: `snapshotResources+flushVillage` antes del RPC causaba falso «Recursos insuficientes» en entrenamiento e invocación | Eliminado el flush previo en ambas funciones (v1.77) |

---

### ✅ game-engine.js — v1.73 → v1.75
**Pasadas realizadas:** 2 ✅

| # | Sev | Función | Descripción | Fix |
|---|---|---|---|---|
| 1 | 🟠 | `executeAttackPvP` L838 | Log PvP sin `escapeHtml()` — XSS idéntico a game-combat.js Bug-1 | `escapeHtml(line)` |
| 2 | 🟠 | `executeAttackPvP` L849 | `esencia` omitida en informe de botín — se aplicaba en servidor pero el jugador no la veía | `loot.esencia` añadido al HTML |
| 3 | 🟠 | `startMission` L251 | Sin ok-check en `launch_mission_secure` — `{ok:false}` mostraba "¡Misión enviada!" y no hacía rollback | `!newState \|\| newState.ok === false` + rollback |
| 4 | 🟡 | `_returnTroopsHome` L1040 | Misión de retorno sin `mid` — `finalize_mission_secure` usaba `finish_at` como ID, colisionable con retornos simultáneos | `mid` único generado |
| 5 | 🟡 | `executeAttackMission` NPC L713 | Log NPC sin `escapeHtml()` — inconsistente con PvP, peligroso si el log cambia | `escapeHtml(line)` |
| 6 | 🟡 | `resolveMissions` L453 | Sin `scheduleSave()` tras actualizar `mission_queue` — estado podía perderse entre ticks | `scheduleSave()` añadido |
| 7 | 🟡 | `executeMove` + `executeReinforce` | Sin `loadMyVillages()+tick()` tras RPC exitoso — tropas en destino no se reflejaban hasta sync de 60s | `await loadMyVillages(); tick()` añadidos |

---

### ✅ game-ui.js — v1.75 → v1.76
**Pasadas realizadas:** 2 ✅

| # | Sev | Función | Descripción | Fix |
|---|---|---|---|---|
| 1 | 🟠 | `startBuild` L32 | Sin ok-check en `start_build_secure` — `{ok:false}` aplicaba estado basura y mostraba éxito | `!newState \|\| newState.ok === false` + return |
| 2 | 🟠 | `cancelBuild` L70 | `build_queue = null` fuera del `if (newState)` — se borraba la cola local aunque el servidor no confirmara | Movido dentro del `if (newState)` |
| 3 | 🟠 | `executeMoveClick` L1497 | Misión `move` sin `mid` — colisiona en `finalize_mission_secure` con movimientos simultáneos | `mid` único generado |
| 4 | 🟠 | `executeTransportClick` L1777 | Misión `transport` sin `mid` — misma colisión | `mid` único generado |
| 5 | 🟠 | `processRecalls` L2117 | Misión `return_reinforce` sin `mid` — misma colisión | `mid` único generado |
| 6 | 🟡 | `showPage` L2158 | Llamaba `syncResourcesFromDB()` (lectura directa DB) en vez de `syncVillageResourcesFromServer()` (RPC) — sobreescribía recursos interpolados con valores atrasados | `syncVillageResourcesFromServer()` |
| 7 | ⚪ | `openBuildingDetail` L2758–2762 | Costes en tabla detalle con `fmt()` en vez de `fmtCost()` — inconsistencia visual (fmt(1040)==fmt(1020)) | `fmtCost()` en toda la tabla de costes |
| 8 | 🟠 | `startBuild` | `snapshotResources+flushVillage` antes del RPC — `save_village_client` sobreescribía `last_updated=NOW()` sin escribir resources; el RPC calculaba `v_hrs≈0` → falso «Recursos insuficientes» | Eliminado el flush previo; la RPC tiene cálculo inline propio (v1.77) |

---

### ✅ index.html — v1.71 → v1.81
**Pasadas realizadas:** 4 ✅ (2 en v1.76 + 2 en v1.81)

| # | Sev | Línea | Descripción | Fix |
|---|---|---|---|---|
| 1 | 🟠 | L1053–1054 | Cache-busters en `v1.71` — navegadores con caché cargaban versiones antiguas rotas | Todos los scripts/CSS actualizados a `?v=1.76` |
| 2 | 🟡 | L1995 | `checkIncomingAttacks` descargaba `mission_queue` de **todas** las aldeas del mundo cada 30s — O(n·jugadores) | Reemplazado por RPC `get_incoming_attacks(p_coords)` — filtra en servidor, devuelve solo ataques entrantes |
| 3 | 🟡 | L1095 | `renderMissionsPanel` usaba `v.cx`/`v.cy` (strings DB crudos) en fallback de nombre — pueden ser null | `v.x`/`v.y` (normalizados en `loadMyVillages`) |
| 4 | ⚪ | L1941–1942 | `var _lastMapLoad` y `var _lastResourceSync` declarados aquí y también en `game-globals.js` (v1.73) — duplicados confusos | Eliminados de `index.html`, comentario explicativo |
| 5 | ⚪ | L9, L1046 | Título `<title>` y footer de versión en `v1.71` | Actualizados a `v1.76` |
| 6 | 🟠 | `toggleAlertsPanel` | `a.toName` y `a.fromName` insertados en innerHTML sin `escapeHtml()` — nombres de aldea/jugador son datos de usuario, vector XSS | `escapeHtml()` en ambos campos (v1.81) |
| 7 | 🟡 | `_missionRow` | Botones "Ver tropas" y "Cancelar" con `onclick` inline + `escapeJs()` — mismo patrón `Trojan:JS/FakeUpdate.B` que smithy | Event delegation con `data-action` + `data-mid` (v1.81) |
| 8 | ⚪ | `loadAllVillages` | `select(…)` sin `.limit()` — descarga state jsonb completo de todas las aldeas del mundo, O(n·jugadores × tamaño state) | `.limit(2000)` como tope de seguridad (v1.81) |
| 9 | 🟠 | L1046, scripts | Cache-busters en `v1.77` tras auditorías v1.78–v1.81 — navegadores cargaban `game-smithy.js` y `game-auth.js` sin los fixes de seguridad | Todos los scripts/CSS actualizados a `?v=1.81` |

---

### ✅ game-caves.js — v1.76 → v1.77
**Pasadas realizadas:** 2 ✅

| # | Sev | Función | Descripción | Fix |
|---|---|---|---|---|
| 1 | 🟠 | `adminRevokeCave` + `adminResetAllCaves` | `save_village_client` con firma incorrecta — la versión actual acepta parámetros distintos, la llamada directa reventaba silenciosamente | Reemplazado por nueva RPC `admin_clear_cave_guardian(p_cave_id)` |
| 2 | 🟡 | Auto-respawn post-captura | INSERT directo a `caves` tras captura — saltaba RLS y no usaba la firma validada | Reemplazado por RPC `admin_cave_create(p_cx, p_cy, p_status, p_guardian_type)` |
| 3 | 🟡 | `onCaveGuardianDied` | UPDATE directo a `caves` al morir el guardián — mismo vector RLS, sin validación server-side | Reemplazado por nueva RPC `admin_cave_respawn(p_cave_id, p_cx, p_cy)` |
| 4 | 🟡 | `loadAdminCaves` | Detección "en movimiento" hardcodeada con `=== 'guardiancueva'` — si el guardian_type cambia, la detección falla | Reemplazado por comprobación dinámica: cualquier criatura cuyo tipo esté en `CREATURE_TYPES` |
| 5 | ⚪ | `_generateCaveReport` | Nombres de tropa insertados en HTML sin `escapeHtml()` — vector XSS si los nombres de tipo de tropa se externalizan | `escapeHtml()` aplicado a todos los nombres de tropa en el informe |

**SQL generado:** 2 nuevas RPCs (`admin_clear_cave_guardian`, `admin_cave_respawn`) + verificación de firma de `admin_cave_create`.

---

### ✅ game-admin.js — v1.77 → v1.78
**Pasadas realizadas:** 2 ✅

| # | Sev | Función | Descripción | Fix |
|---|---|---|---|---|
| 1 | 🟠 | `adminLaunchHunt` | `missionEntry` creada pero nunca pusheada a `s.mission_queue` antes del RPC sync — Global Admin Tick no encontraba la misión → ataques admin nunca se resolvían | `s.mission_queue.push(missionEntry)` antes de `admin_ghost_sync_hunt` |
| 2 | 🟠 | `adminLaunchHunt` | Código muerto: `sTmp.is_temp = true` sobre variable local descartada — el state persistido nunca tenía `is_temp` → punto de invasión temporal nunca se autodestruía | `s.is_temp = true` sobre el state real; bloque `sTmp` eliminado |
| 3 | 🟡 | `adminFastBuildAll` | `select('id,state')` + check `s.build_queue` — desde v1.64 `build_queue` es columna separada y se stripea del `state` jsonb → siempre null → count 0 → función inútil | `select('id,build_queue')` + check sobre `v.build_queue` |
| 4 | ⚪ | `_adminDeleteUserData` | UPDATE directo a `caves` al borrar usuario — inconsistente con regla 26 (v1.77) | SELECT cuevas del usuario + bucle con `admin_clear_cave_guardian(p_cave_id)` |

---

### ✅ game-social.js — v1.78 → v1.79
**Pasadas realizadas:** 2 ✅

| # | Sev | Función | Descripción | Fix |
|---|---|---|---|---|
| 1 | 🟠 | `dissolveAlliance` L765 | Segunda `DELETE` (`alliance_members`) sin chequeo de error — si fallaba silenciosamente, los registros de miembros quedaban huérfanos en DB apuntando a una alianza ya eliminada | `const delMembers = await ...delete()` + `if (delMembers.error)` con notificación y return |
| 2 | 🟡 | `markMsgAsReadAndDelete` L1148 | Nombre engañoso: solo hacía `UPDATE read=true` en DB y eliminaba el elemento del DOM — al recargar el hilo el mensaje reaparecía (como leído). No había `DELETE` real | Añadido `DELETE` en DB después del `UPDATE read=true` |
| 3 | ⚪ | `_selectedReportIds` — global implícito | Variable usada en 6 sitios pero nunca declarada — falla con `ReferenceError` en strict mode | `var _selectedReportIds = new Set()` declarado junto a `currentReportId` |

---

---

### ✅ game-smithy.js — v1.74 → v1.80
**Pasadas realizadas:** 2 ✅

| # | Sev | Función | Descripción | Fix |
|---|---|---|---|---|
| 1 | 🟠 | `upgradeSmithyItem` | Sin null-guard en `data` antes de `data.ok` — si RPC devuelve `null`, TypeError silencioso deja la UI en estado `'error'` sin mensaje | `!data \|\| !data.ok` |
| 2 | 🟡 | `upgradeSmithyItem` | `last_updated` no reseteado tras aplicar `new_resources` del servidor — `calcRes()` acumulaba producción desde timestamp antiguo, sobreestimando recursos hasta el siguiente sync de 60s | `activeVillage.state.last_updated = new Date().toISOString()` tras aplicar `new_resources` |
| 3 | ⚪ | `renderSmithy` | `itemD.name`, `troop.name`, `troop.icon` insertados en innerHTML sin `escapeHtml()` — vector XSS si los datos se externalizan (misma clase que game-caves.js Bug-5) | `escapeHtml()` en todos los campos de nombre |

---

### ✅ game-auth.js — v1.70 → v1.80
**Pasadas realizadas:** 2 ✅

| # | Sev | Función | Descripción | Fix |
|---|---|---|---|---|
| 1 | 🟠 | `doRegister` | `ensureProfile()` retorno no comprobado — si fallaba, `initGame()` continuaba sin perfil → crash o estado indefinido | Check retorno + `signOut` + mensaje de error si `!profileOk` |
| 2 | 🟠 | `doDeleteVillage` | `.delete()` directo sobre tabla `villages` desde cliente — viola regla arquitectónica fundamental | RPC `delete_village_secure(p_village_id)` con validación de propiedad + cave cleanup server-side |
| 3 | 🟠 | `doDeleteVillage` | Limpieza del guardián de cueva ocurría después del DELETE — si fallaba, cueva con `village_id` apuntando a aldea inexistente | Cave cleanup movido dentro de la RPC, antes del DELETE, de forma atómica |
| 4 | 🟠 | `doDeleteAccount` | `.delete()` directo sobre `villages` y `profiles` + sin limpieza de cuevas capturadas — owner_id huérfano en `caves` | Consolidado en `delete_my_account` RPC: caves → villages → profiles → auth.users. Cliente solo llama la RPC |
| 5 | 🟡 | `saveMOTD` / `clearMOTD` | Upsert directo a tabla `config` — `isAdmin()` es client-side, manipulable desde consola | Nueva RPC `save_motd_secure(p_text)` con SECURITY DEFINER que verifica `profiles.role` en servidor |
| 6 | ⚪ | `visibilitychange` | Llamaba `flushVillage()` directamente — inconsistente con `beforeunload` (ya corregido en v1.70 para usar la RPC) | Mismo patrón RPC fire-and-forget que `beforeunload` |

**SQL generado:** 2 nuevas RPCs (`delete_village_secure`, `save_motd_secure`) + `delete_my_account` ampliada (cave cleanup + villages + profiles + auth.users). Ver cabecera de `game-auth.js` para el SQL completo.

---

### ✅ game-globals.js — v1.70 → v1.81
**Pasadas realizadas:** 2 ✅

| # | Sev | Descripción | Fix |
|---|---|---|---|
| 1 | ⚪ | `GAME_VERSION = '1.71'` — stale desde v1.81 | Actualizado a `'1.81'` |
| 2 | ⚪ | `_lastReinforcementsCheck`, `_lastAlertsCheck`, `_lastMsgPoll`, `_lastSeenUpdate`, `_lastOnlineCheck`, `_lastAlliancesCheck` declarados en `<script>` inline de `index.html` — inconsistente con convención v1.73 de centralizar globals en este archivo | Movidos aquí; declaraciones duplicadas eliminadas de `index.html` con comentario explicativo |

---

### ✅ game-constants.js — v1.44 → v1.81
**Pasadas realizadas:** 2 ✅

| # | Sev | Función | Descripción | Fix |
|---|---|---|---|---|
| 1 | ⚪ | `getCapacity(blds)` | `blds['almacen']` sin null-guard en `blds` — llamada con `undefined` lanzaba TypeError. Todas las demás funciones del archivo tienen el patrón `(blds && blds['x'] && ...)` menos esta | `(blds && blds['almacen'] && blds['almacen'].level) \|\| 0` |

---

### ✅ game-simulator.js — v1.37
**Pasadas realizadas:** 2 ✅ — **0 bugs encontrados**

Archivo limpio. Backticks internos correctamente escapados, `escAttr()` protege atributos, `divGroups` implementa cubos correctamente, límite de 300 turnos evita loops infinitos, tasa de recuperación fija 0.15 alineada con motor real.

---

1. Siempre **2 pasadas** por archivo — nunca presentar lista tras una sola.
2. Confirmar lista con el usuario antes de generar el archivo corregido.
3. Actualizar este archivo + `ARQUITECTURA.md` en la misma entrega.
4. Máximo 2 archivos por turno (regla workflow).
5. Orden recomendado por riesgo: `game-engine.js` → `game-ui.js` → `index.html` → `game-caves.js` → `game-admin.js` → `game-social.js` → `game-smithy.js` → `game-auth.js`.
6. **Siempre elegir la solución técnicamente mejor**, no la más rápida. Si hay una RPC de Supabase que evita una query pesada en cliente, usarla.

---

## ✅ AUDITORÍA COMPLETA — v1.81
Todos los archivos JS del juego han sido auditados con 2 pasadas. No quedan archivos pendientes.
**Total bugs corregidos: 63** (8+6+7+8+9+2+5+4+3+4+1+6+2+1 = 66 incluyendo rondas extra)
