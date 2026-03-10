# CONTEXTO PARA NUEVO CHAT — Epic Warriors
# Auditoría OGame Puro v1.99 — Estado actual y próximos pasos

---

## QUÉ ES ESTE PROYECTO

Juego de estrategia web tipo OGame/Ikariam. Stack: HTML/JS vanilla + Supabase (PostgreSQL + Auth).
El modelo de recursos es "OGame puro": el servidor es la ÚNICA autoridad. El cliente no calcula
ni interpola nada — solo muestra lo que devuelve el servidor y cuenta regresivas de colas.

---

## ARCHIVOS DEL PROYECTO

| Archivo | Rol |
|---|---|
| `index.html` | Shell principal, tick() loop 1s, renderTopBar(), switchVillage |
| `game-engine.js` | calcRes(), getProd(), startMission(), resolveMissions() |
| `game-ui.js` | startBuild(), cancelBuild(), triggerServerTick(), snapshotResources(), showPage(), executeMoveClick() |
| `game-troops.js` | startRecruitment(), startSummoning(), cancelTrainingQueue() |
| `game-combat.js` | cancelSummoningQueue(), canSummon(), simulador de combate |
| `game-constants.js` | TROOP_TYPES, BUILDINGS, getBarracksUsed(), getBarracksCapacity(), getAldeanosIntervalMs() |

---

## PRINCIPIO RECTOR

```
Jugador hace acción → RPC → servidor calcula tiempo acumulado
                           → aplica producción + ejecuta acción  
                           → devuelve estado completo y real
                           → cliente muestra ese estado sin modificarlo
```

---

## PATRÓN DE MERGE ESTÁNDAR (crítico — no romper)

```js
// RPCs que devuelven estado PLANO completo
var localAldAssigned = activeVillage.state.aldeanos_assigned;
activeVillage.state = Object.assign({}, activeVillage.state, newState);
if (localAldAssigned) activeVillage.state.aldeanos_assigned = localAldAssigned;

// RPCs que devuelven {ok, state, build_queue} ANIDADO (start_build_secure)
var serverState = newState.state || newState;
var _bq = newState.build_queue || serverState.build_queue;
var localAldAssigned = activeVillage.state.aldeanos_assigned;
activeVillage.state = Object.assign({}, activeVillage.state, serverState);
activeVillage.state.build_queue = _bq || null;
if (localAldAssigned) activeVillage.state.aldeanos_assigned = localAldAssigned;
```

---

## LO QUE SE HA HECHO (sesiones anteriores + esta sesión)

### JS — todos corregidos ✅
- `calcRes()` ya no interpola tiempo — devuelve `vs.resources` directo del servidor
- `snapshotResources()` solo actualiza metadata (production/capacity/last_updated), nunca resources
- Sistema de animación `uiShown/uiTarget/ensureUiAnim` eliminado → `renderTopBar()` directo
- Generación local de aldeanos en `tick()` eliminada
- Sync periódico de 60s eliminado
- `startMission()` sin optimistic update
- `syncVillageResourcesFromServer` → renombrado `triggerServerTick()`
- `showPage()` ya NO llama `triggerServerTick()`
- `applyAllWorkers()` usa debounce 400ms en flushVillage (v1.99) — evita race condition de writes
- `startBuild()`: unwrap `newState.state`
- `cancelBuild()`: merge correcto con preservación de aldeanos_assigned
- Todas las RPCs de acción usan `Object.assign` (merge) en vez de reemplazo total
- **`executeMoveClick()` (v1.99)**: reemplazado lógica client-side completa por llamada a
  `startMission()` → `launch_mission_secure_v2`. Era el bug principal de tropas:
  el cliente descontaba tropas localmente y llamaba `flushVillage()`, que no guarda
  `mission_queue` (columna separada) → servidor nunca sabía de la misión →
  tropas nunca se restaban en BD ni llegaban al destino. ✅ RESUELTO

### SQL — todos corregidos ✅
- `secure_village_tick` v4:
  - Procesa `training_queue` vencida → añade tropas a state
  - Procesa `summoning_queue` vencida → añade criaturas a state
  - Procesa `mission_queue` vencida → entrega tropas/criaturas/cargo a aldea destino
    (finish_at en epoch ms, no timestamptz — comparación correcta)
  - Cap barracas usa slots TOTALES, no solo aldeanos
  - `FOR UPDATE` en villages evita race condition si dos RPCs llaman tick simultáneamente
- `cancel_mission_secure` v2:
  - Lee `mission_queue` de columna separada (no de `state` — era el bug "aldea no encontrada")
  - `finish_at` calculado en epoch ms (coherente con el resto de misiones)
  - Misión de retorno con `targetId`, `creatures`, `cargo` y `duration_ms` correctos

---

## triggerServerTick() se llama SOLO en:
1. Boot / F5 → `initGame` antes del primer tick
2. `switchVillage` → al cambiar de aldea
3. Cola vencida → `tick()` detecta `_needsServerSync = true`
4. `resolveMissions` → cuando vence una misión

---

## ESTADO DE LAS FUNCIONES SQL AUDITADAS

| Función | Return | Estado |
|---|---|---|
| `secure_village_tick` | state plano + colas | ✅ v4 — procesa misiones |
| `save_village_client` | state plano | ✅ persiste aldeanos_assigned |
| `launch_mission_secure_v2` | state plano + mission_queue | ✅ completo |
| `cancel_mission_secure` | `{ok, return_secs}` | ✅ v2 — lee columna separada |
| `start_build_secure` | `{ok, state{...}, build_queue}` ANIDADO | ✅ cliente corregido |
| `cancel_build_secure` | state plano + todas las colas | ✅ cliente corregido |
| `start_training_secure` | state + training_queue | ✅ cliente usa Object.assign |
| `start_summoning_secure` | `{ok, resources, summoning_queue}` parcial | ✅ cliente usa Object.assign |

---

## PENDIENTE — PRÓXIMA SESIÓN

### Verificaciones en juego (hacer primero)
1. ✅ Mover tropas → ¿se restan y llegan? → RESUELTO
2. Cancelar misión de movimiento → ¿tropas regresan correctamente?
3. Entrenar 1 tropa → esperar → ¿aparece notificación? ¿sube el contador?
4. Invocar 1 criatura → esperar → ¿aparece notificación? ¿sube en criaturas?
5. Cancelar training_queue → ¿devuelve el aldeano? ¿resources correctos?

### SQL pendiente de revisar
```sql
-- ¿Qué devuelve cancel_training_queue_secure? ¿state plano o {ok,...}?
SELECT prosrc FROM pg_proc WHERE proname = 'cancel_training_queue_secure';

-- ¿Hay más RPCs de acción no auditadas?
SELECT proname FROM pg_proc 
WHERE proname LIKE '%secure%' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;
```

### Posible bug en `cancel_training_queue_secure`
`cancelTrainingQueue` en `game-troops.js` hace:
```js
activeVillage.state = Object.assign({}, activeVillage.state, newState);
activeVillage.state.training_queue = [];
```
Si el RPC devuelve `{ok, ...}` anidado como `start_build_secure`,
el merge aplicaría `ok=true` al state en lugar del state real.
Necesita el mismo unwrap que se aplicó a `startBuild`.

### RPCs SQL nunca auditadas (mayor riesgo)
- `upgrade_smithy_secure` — descuenta recursos y escribe `weapon_levels`/`armor_levels`
- `upgrade_troop_level_secure` — descuenta XP y escribe `troop_levels`
- `capture_cave_secure` — race condition crítica, verificar que el UPDATE es condicional
- `admin_repair_apply` / `admin_repair_scan` — escribe troops y mission_queue en múltiples aldeas
- `transfer_alliance_leadership` — 3 escrituras, debería ser atómica

### Writes directos a tablas en game-social.js (dependen de RLS)
- `acceptInvite` / `acceptMember` — UPDATE directo a `alliance_members`
- `requestJoinAlliance` — INSERT directo (sin validar límite de miembros)
- `sendChatMsg` — INSERT directo a `messages` sin rate limiting ni validación de longitud

---

## REGLAS CRÍTICAS (no romper nunca)

```
38. calcRes() devuelve vs.resources directamente. Sin interpolación de tiempo.
39. snapshotResources() solo actualiza metadata. Nunca sobreescribe vs.resources.
40. Toda RPC usa Object.assign (merge), nunca activeVillage.state = newState directo.
41. No hay polling periódico. Solo sync por acción, cola vencida, boot o switchVillage.
42. El cliente NUNCA modifica vs.troops.aldeano, vs.resources ni vs.buildings directamente.
43. aldeanos_assigned es propiedad del cliente. Siempre preservar en merges.
44. applyAllWorkers usa flushVillage() con debounce 400ms (window._flushDebounce).
45. renderTopBar() = top bar cada tick. renderRecursos() = pestaña completa (game-ui.js).
46. showPage() no sincroniza con el servidor.
47. mission_queue es columna separada en BD — nunca se guarda vía save_village_client.
48. finish_at en misiones es epoch en MILISEGUNDOS, no timestamptz. No mezclar formatos.
49. executeMoveClick() delega en startMission() — nunca modificar state local de tropas/misiones.
```
