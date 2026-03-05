# REFERENCIA PARA IA — Epic Warriors v1.71

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

---

## v1.68 — Auditoría de seguridad admin

### Checklist de seguridad (ejecutar tras cualquier migración)
```sql
-- 1. Tablas sin RLS (deben ser 0)
SELECT relname FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r' AND relrowsecurity = false;

-- 2. Funciones duplicadas (deben ser 0 con count > 1)
SELECT proname, COUNT(*) FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
GROUP BY proname HAVING COUNT(*) > 1;

-- 3. Políticas RLS duplicadas (deben ser 0)
SELECT tablename, policyname, COUNT(*) FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, policyname HAVING COUNT(*) > 1;
```

### Reglas admin (caves + villages)
- `caves`: 4 políticas — select público, insert/delete solo admin, update owner o admin
- `villages`: 4 políticas — insert owner, select público, update/delete solo admin
- **Nunca** `UPDATE villages SET state = ...` directo desde cliente — siempre RPC
- **Nunca** `UPDATE villages SET state = ...` sin incluir `aldeanos` en resources

### Sincronización isAdmin() ↔ is_admin()
- Cliente (`isAdmin()`): comprueba `currentUser.email === 'sementalac@gmail.com'`
- Servidor (`is_admin()`): comprueba `profiles.role = 'admin'`
- Ambos deben estar sincronizados. Tu perfil tiene `role = 'admin'` confirmado.

### Nuevas RPCs admin v1.68
| RPC | Qué hace |
|---|---|
| `admin_teleport_village(village_id, cx, cy)` | Mueve aldea a coordenadas cx/cy, valida colisión |
| `admin_repair_complete_builds(village_id)` | Completa build_queue vencida preservando aldeanos |

---

## v1.67 — Fix crítico: aldeanos borrados en RPCs

### Bug raíz
Todas las RPCs que usaban `jsonb_build_object(...)` para reconstruir `resources` omitían el campo `aldeanos`. PostgreSQL reemplaza el objeto entero (no hace merge), así que cada llamada ponía `aldeanos` a `null`.

### Regla nueva (crítica)
> **Toda RPC que reconstruya `resources` con `jsonb_build_object` DEBE incluir `'aldeanos'` tomado de `troops.aldeano` del estado actual en DB — NUNCA del cliente.**

```sql
-- Patrón correcto en cualquier RPC que toque resources:
v_new_res := jsonb_build_object(
  'madera',      ...,
  'piedra',      ...,
  'hierro',      ...,
  'provisiones', ...,
  'esencia',     ...,
  'aldeanos',    COALESCE((v_troops->>'aldeano')::int, 0)  -- ← SIEMPRE
);
```

### RPCs corregidas
| RPC | Fix aplicado |
|---|---|
| `secure_village_tick` | `aldeanos = v_ald_current` (valor recién calculado) |
| `start_build_secure` | `aldeanos` de `troops.aldeano` DB + fix check `build_queue` vacía |
| `cancel_build_secure` | `aldeanos` de `troops.aldeano` DB |
| `start_training_secure` | `aldeanos = v_new_ald` (tras descontar reclutados) |
| `cancel_training_secure` | `aldeanos = v_new_ald` (tras devolver aldeanos) |
| `save_village_client` | 4 versiones duplicadas → 1 canónica. `aldeanos` del servidor siempre |

### Regla save_village_client
`save_village_client` debe existir en **una sola versión**. Si hay que modificarla, hacer DROP de todas las versiones anteriores primero (ver `fix_save_village_client_v167.sql`).

### Seguridad RLS — reglas fijas para `villages`
Las únicas 4 políticas permitidas en `villages` son:

| Política | Tipo | Quién |
|---|---|---|
| `villages_insert` | INSERT | `auth.uid() = owner_id` |
| `villages_select` | SELECT | todos |
| `villages_update_admin_only` | UPDATE | solo admin |
| `villages_delete_admin_only` | DELETE | solo admin |

**Nunca añadir UPDATE genérico para usuarios normales** — rompe la seguridad server-authoritative. Los jugadores modifican su aldea solo a través de RPCs SECURITY DEFINER.

Antes de añadir cualquier política RLS, verificar duplicados:
```sql
SELECT tablename, policyname, COUNT(*)
FROM pg_policies WHERE schemaname='public'
GROUP BY tablename, policyname HAVING COUNT(*) > 1;
```

---

## v1.66 — Modelo Ogame: acciones server-authoritative

### Regla de oro v1.66
**El cliente NUNCA descuenta recursos localmente para construir, entrenar ni invocar.** Solo llama al RPC correspondiente, espera la respuesta y aplica el state devuelto.

### Nuevas RPCs (pegar `ogame_secure_rpcs_v166.sql` en Supabase)
| RPC | Qué hace |
|---|---|
| `start_build_secure(village_id, building_id)` | Valida recursos, descuenta, crea build_queue → devuelve state |
| `cancel_build_secure(village_id)` | Devuelve recursos, limpia build_queue → devuelve state |
| `start_training_secure(village_id, type, amount)` | Valida aldeanos+recursos+barracas, encola → devuelve state+training_queue |
| `cancel_training_secure(village_id)` | Devuelve recursos+aldeanos de toda la cola → devuelve state |
| `start_summoning_secure(village_id, creature_key)` | Valida esencia+invocadores, encola → devuelve state+summoning_queue |
| `update_battle_stats(won_npc, won_pvp, lost_pvp)` | Incrementa contadores en profiles |

### Funciones JS modificadas v1.66
| Función | Archivo | Cambio |
|---|---|---|
| `startBuild` | game-ui.js | async → `start_build_secure` |
| `cancelBuild` | game-ui.js | Nueva → `cancel_build_secure` |
| `renderQueue` | game-ui.js | Botón ✕ cancelar construcción |
| `syncVillageResourcesFromServer` | game-ui.js | Corregido a `secure_village_tick`; preserva build_queue local |
| `startRecruitment` | game-troops.js | async → `start_training_secure` |
| `cancelTrainingQueue` | game-troops.js | async → `cancel_training_secure` |
| `startSummoningFromInput` | game-troops.js | Nueva → `start_summoning_secure` |
| `startSummoning` | game-troops.js | Nueva async |
| `switchVillage` | index.html | Inyecta `_profileBattles` al cambiar aldea |
| `save_village_client` call | index.html | Ahora envía troops, creatures, buildings |

### v1.70 — DT-01 resuelto: RPCs de gasto 100% atómicos

**Cambio:** `start_build_secure`, `start_training_secure` y `start_summoning_secure` ya **NO** hacen `PERFORM secure_village_tick` al inicio. Calculan los recursos reales directamente inline con la misma fórmula de producción.

**Patrón v1.70 correcto en cualquier RPC de gasto:**
```sql
-- Al inicio del RPC, tras el FOR UPDATE:
v_last_updated := COALESCE((v_state->>'last_updated')::timestamptz, NOW());
v_hrs := LEAST(24.0, GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_last_updated)) / 3600.0));
-- ... calcular prod_xxx igual que secure_village_tick
cur_madera := LEAST(cap, FLOOR(COALESCE((v_res->>'madera')::float, 0) + prod_madera * v_hrs));
-- ... validar y descontar con cur_xxx (no con v_res->>'xxx')
```

**Regla nueva (crítica):**
> **`secure_village_tick` NO debe llamarse dentro de otros RPCs de gasto.** Su único rol es la sincronización periódica de 60s desde JS y el recálculo de aldeanos. Los RPCs de gasto son autónomos.

**RPCs actualizadas en v1.70:**
| RPC | Cambio |
|---|---|
| `start_build_secure` | Cálculo inline reemplaza `PERFORM secure_village_tick` |
| `start_training_secure` | Ídem |
| `start_summoning_secure` | Ídem + escribe todos los recursos en el write final (no solo esencia) |

### Estado de archivos v1.71
| Archivo | Versión | Estado |
|---|---|---|
| index.html | **v1.71** | ✅ Fix buildings lvl0 · createFirstVillage→RPC · sync 60s en tick · dedup profileBattles · versión+cache |
| game-ui.js | **v1.71** | ✅ barra construcción, startBuild sin pre-sync, executeTransport/executeMove via RPCs atómicas |
| game-engine.js | **v1.66** | ✅ update_battle_stats + execute_founding_secure fix |
| game-troops.js | **v1.66** | ✅ startRecruitment/cancel/summon async |
| game-constants.js | **v1.65** | Sin cambios |
| game-admin.js | **v1.68** | ✅ admin_teleport + admin_repair RPCs |

### ⚠️ Regla: buildings en create_first_village_secure
El `jsonb_build_object` de buildings en la RPC `create_first_village_secure` debe ser **idéntico** a `BUILDINGS.map(b => b.id)` de `game-constants.js`. Si se añade un building nuevo en JS, actualizar también el SQL.
| start_build_secure | **v1.70** | ✅ Cálculo inline — sin tick previo |
| start_training_secure | **v1.70** | ✅ Cálculo inline — sin tick previo |
| start_summoning_secure | **v1.70** | ✅ Cálculo inline — sin tick previo |

## v1.64 — Seguridad de Colas y Anti-Bloat
**Reglas críticas:**
1. **Source of Truth**: Las colas (`build_queue`, `training_queue`, `mission_queue`, `summoning_queue`) deben ser eliminadas del objeto `state` JSON antes de persistir (`saveVillage`). Su fuente de verdad son sus respectivas columnas en la DB.
2. **Tick Save**: El `tick()` debe comparar el estado de todas las colas (usando strings JSON) y disparar `scheduleSave()` si hay cualquier cambio (completado o cancelación).
3. **Training Authority**: Nunca sobreescribir la cola de entrenamiento del servidor con la del cliente en `syncVillageResourcesFromServer`. El servidor manda.

---

## v1.63 — Audit de Robustez y Guardado Autorritativo
**Cambios clave:** El sistema de guardado ha sido simplificado y blindado. El cliente ahora es solo un intermediario que persiste el objeto `state` completo.

### Reglas de Solidez (v1.63)
1. **Guardado Total**: `saveVillage` envía el objeto `s` completo a Supabase. No filtrar claves manualmente (evita borrar datos nuevos).
2. **Autoridad Server-Side**: Las colas y misiones se resuelven validando `newState.state || newState` para ser compatibles con cualquier cambio en RPCs.
3. **No Legacy**: No escribir en las tablas `resources`, `buildings` o `troops`. Ya no existen.
4. **Admin Hunt**: Resolución cada 3 segundos. Autodestrucción si `is_temp` es true y no hay misiones.
5. **Visibilidad**: La UX de misiones en el mapa ha sido desactivada para mejorar el rendimiento y la claridad.

---

## v1.62 — Simulador de Ataques Admin ("Día de Caza") y Global Admin Tick

**Nuevo módulo:** El panel de admin (`game-admin.js`) incluye un simulador de ataques fantasma para testear batallas, mensajes y velocidades de tropas.

### Flujo de un ataque Admin
1. `adminLaunchHunt()` — lanza el ataque desde el formulario del panel admin.
2. Si el origen está vacío, se crea una aldea temporal via RPC `admin_ghost_create` y se marca con `state.is_temp = true`.
3. Las tropas se inyectan en `state.troops`/`state.creatures` de la aldea fantasma ("magia admin") y se descuentan de vuelta inmediatamente para que queden en misión.
4. La misión se guarda con el flag `admin_test: true` y los niveles de God Mode en `god_levels: { troop, weapon, armor }`.
5. **CRÍTICO:** La misión se escribe en **DOS sitios**: `state` (JSON) Y la columna separada `mission_queue` de la tabla `villages`. Si no se escribe en ambos, se pierde al recargar.
6. El **Global Admin Tick** (`index.html`, dentro de `tick()`) se ejecuta cada 5 segundos cuando el usuario es admin. Consulta la DB directamente buscando aldeas con `is_temp: true` y misiones `admin_test` cuyo `finish_at` ya pasó. Llama a `executeAttackPvP(m)` directamente (SIN PASAR por `resolveMissions`, que depende de `activeVillage`).
7. `executeAttackPvP` detecta `m.admin_test === true` y usa `simulateBattle()` local con niveles God Mode. Envía el reporte a AMBOS: atacante (admin) y defensor.
8. Tras procesar, la aldea temporal se borra automáticamente si no quedan misiones (`is_temp` + `mission_queue` vacía).

### Flags especiales en misiones admin
```json
{
  "admin_test": true,
  "god_levels": { "troop": 50, "weapon": 25, "armor": 25 },
  "origin_village_id": "uuid-de-la-aldea-fantasma"
}
```

### Flags especiales en aldeas temporales
```json
{ "is_temp": true }  ← dentro de villages.state jsonb
```

### ⚠️ CRÍTICO — Columna `mission_queue` separada
Desde v1.62, `mission_queue` es una **columna independiente** en la tabla `villages`, NO solo dentro del JSON `state`. El cliente las fusiona al cargar:
```js
// En loadMyVillages:
s.mission_queue = (v.mission_queue || []).filter(...);
// En saveVillage: se escriben AMBAS (state + columna)
sbClient.from('villages').update({ state: ..., mission_queue: s.mission_queue || [] })
```
Lo mismo aplica a `build_queue`, `summoning_queue`, `training_queue`.

---

## Estado del proyecto: Epic Warriors v1.62

| Archivo | Versión | Notas |
|---------|---------|-------|
| index.html | **v1.66** | ✅ save_village_client completo + switchVillage battles |
| game-ui.js | **v1.66** | ✅ startBuild/cancelBuild async + sync corregido |
| game-engine.js | **v1.63** | ✅ Red de seguridad v2 (sNextFinal) |
| game-admin.js | **v1.63** | ✅ Fix duplicación + clean sync |
| game-caves.js | v1.49 | ✅ |
| game-troops.js | v1.47 | ✅ |
| game-combat.js | v1.46 | ✅ |

---

## v1.52 — Fase Robustez y Seguridad (RPC-centric)

**Cambio de paradigma:** La lógica crítica de recursos y misiones ya no se calcula solo en el cliente. El servidor (Supabase RPC) es la autoridad final.

1. **Recursos Transcurridos**: Calculados en servidor via `sync_village_resources`. El cliente interpola para suavidad visual pero sincroniza cada 60s.
2. **Smart Merge (Anti-Flickering)**: `syncVillageResourcesFromServer` mezcla el estado del servidor con el local. Si la diferencia es < 5, mantiene el valor local para evitar "saltos" en los contadores.
3. **Misiones Seguras**:
   - Salida: `launch_mission_secure` (valida disponibilidad de tropas).
   - Combate: `execute_attack_secure` / `simulate_battle_server` (Motor PL/pgSQL).
   - Logística: `execute_move_secure`, `execute_reinforce_secure`, `execute_transport_secure`.
   - Regreso: `finalize_mission_secure` (suma atómica de tropas y botín).
4. **Fundación Segura**: `execute_founding_secure` evita creación ilegal de aldeas.

**Regla de Oro v1.52:** Si vas a modificar tropas, recursos o misiones, hazlo mediante un RPC que garantice la integridad de los datos. Nunca confíes en el estado del cliente como fuente de verdad única para mutaciones.

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

## Modelo de datos v1.62 — Columnas separadas en `villages`

⚠️ Desde v1.62: `mission_queue`, `build_queue`, `summoning_queue`, `training_queue` son **columnas reales** de la tabla `villages`, NO solo propiedades del JSON `state`.

El cliente las fusiona al leer:
```js
s.mission_queue = (v.mission_queue || []).filter(...);
```
Y las escribe en AMBOS sitios al guardar:
```js
sbClient.from('villages').update({ state: {...sin colas...}, mission_queue: [...] })
```

El JSON `state` en la columna `state` de Supabase **NO contiene** `mission_queue` (se strip en `saveVillage`):
```json
{
  "resources":         { "madera": 0, "piedra": 0, "hierro": 0, "provisiones": 0, "esencia": 0, "aldeanos": 0 },
  "aldeanos_assigned": { "madera": 0, "piedra": 0, "hierro": 0, "provisiones": 0, "esencia": 0 },
  "troops":            { "aldeano": 0, "soldado": 0 },
  "creatures":         { "dragon": 0, "guardiancueva": 0 },
  "buildings":         { "aserradero": { "level": 0 }, "muralla": { "level": 0 } },
  "last_updated":      "ISO string",
  "last_aldeano_at":   null,
  "refugio":           {},
  "is_temp":           false
}
```
`is_temp: true` → aldea temporal de admin, se autodestruye cuando `mission_queue` queda vacía.

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
