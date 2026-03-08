# EPIC WARRIORS — DOCUMENTO DE ARQUITECTURA
> Versión del documento: 4.7 — Última actualización: v1.88 (Safety First SQL Protocol)
> Fuentes de verdad: **Supabase** (datos/RPCs) · **GitHub Pages** (código)

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

El juego está evolucionando de un modelo serverless cliente-céntrico a uno **Server-Authoritative (Ogame-style)**. La lógica crítica (recursos, misiones, misiones de fundación) reside ahora en **RPCs de Supabase** para garantizar seguridad, integridad y escalabilidad. El cliente se encarga del renderizado y la interpolación visual.

**Todos los archivos deben estar en el mismo directorio.** Mover a otra carpeta rompe las referencias relativas.

### Modelo: Híbrido Servidor-Autoritativo (v1.50+)

| Cuándo | Qué operación |
|---|---|
| Login / carga inicial | `loadMyVillages`, `syncVillageResourcesFromServer` |
| Cada 60 segundos (Tick) | `syncVillageResourcesFromServer` (RPC: `sync_village_resources`) |
| Lanzar Misión | RPC: `launch_mission_secure` (Valida tropas antes de enviar) |
| Llegada de tropas | RPC: `finalize_mission_secure` (Resolución atómica en servidor) |
| Combate (PvP/NPC) | RPC: `execute_attack_secure` / `simulate_battle_server` |
| Movimiento/Refuerzo | RPC: `execute_move_secure` / `execute_reinforce_secure` |
| Transporte | RPC: `execute_transport_secure` |
| Fundación de aldea | RPC: `execute_founding_secure` (Validación de misión en servidor) |
| Detectar ataques entrantes | RPC: `get_incoming_attacks(p_coords)` — filtra en SQL, devuelve solo misiones de tipo `attack` que apuntan a nuestras coordenadas |
| Edificios/Training | `scheduleSave → flushVillage` (Persistencia de colas y assignments — NO para sincronizar recursos antes de RPCs) |

---

## EL TICK

```
setInterval(tick, 1000)  ← único loop del juego
```

`tick()` realiza cálculo local e interpolación, pero sincroniza con el servidor periódicamente:

1. Resolver colas locales (UI/Visual): `resolveQueue`, `resolveSummoningQueue`, `resolveTrainingQueue`
2. Si alguna cola completó → `scheduleSave()`
3. **Sincronización Periódica**: Cada 60 seg llama a `syncVillageResourcesFromServer()`
4. Detectar misiones terminadas → Llama a RPCs de resolución en servidor.
5. Actualizar UI: recursos animados (interpolación basada en produccion/capacidad persistida).

---

## SISTEMA DE GUARDADO Y SINCRONIZACIÓN

Con el modelo de robustez, el servidor es quien manda sobre los números reales.

### Protocolo de Seguridad SQL (v1.88)
Para evitar errores de ambigüedad y desincronización en Supabase:
1.  **Nombres Intocables**: Toda variable local en funciones PL/pgSQL DEBE llevar el prefijo `v_` (ej. `v_state`, `v_madera`). NUNCA usar nombres que coincidan con columnas de la tabla.
2.  **Autoridad Total**: El servidor calcula y descuenta recursos. El cliente solo muestra la animación.
3.  **Auditoría de Dos Pasadas**: Antes de entregar SQL, se debe verificar la lógica y nombres en una segunda pasada de lectura.

### Reglas de Capacidad y Población (v1.91)
*   **Barracas**: La capacidad total es la suma de todas las tropas (aldeanos + guerreros + magos + druidas + exploradores + asesinos + paladines + chamanes + invocadores).
*   **Criaturas**: NO ocupan espacio en barracas y no tienen límite de población (Invasión Infinita).
*   **Consumo**: Las tropas consumen provisiones al moverse/atacar. Las criaturas son autosuficientes en la aldea.

```
snapshotResources()
  → Congela recursos + PERSISTE producción/capacidad
  → El servidor usa estos valores para calcular el tiempo transcurrido (Time-Based)

syncVillageResourcesFromServer()
  → Llama a RPC 'sync_village_resources'
  → Mezcla Inteligente (Smart Merge): Si la diferencia es < 5, mantiene el valor local para evitar flickering visual.
  → Protección de Colas: Mantiene misiones locales recientes (< 10s) para evitar que desaparezcan antes de que el servidor las reporte.
```

- `_stateDirty`: flag de cambios sin guardar
- Debounce 2s: evita guardados duplicados por acciones rápidas
- `isFlushing` + `pendingFlush`: evitan condiciones de carrera

---

## TABLAS SUPABASE

| Tabla | Contenido | Cuándo se escribe |
|---|---|---|
| `villages` | `state` jsonb (troops+creatures+buildings+resources+flags), nombre, coords + columnas separadas: `mission_queue`, `build_queue`, `summoning_queue`, `training_queue` | En cada `saveVillage` — **v1.63: Persistencia total del objeto .state** para asegurar integridad de nuevos campos. |
| `profiles` | username, XP, military_score, last_seen, victorias PvP/NPC | Al login, al ganar/perder batallas, al cambiar XP |
> Las tablas `troops`, `creatures`, `buildings` y `resources` fueron **eliminadas en v1.49**. Todo su contenido vive ahora en `villages.state` jsonb.
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
- **Datos:** en `villages.state` jsonb, exactamente igual que las aldeas de jugadores reales
- **Creación:** RPC `admin_ghost_create` — inserta directamente con `state` jsonb completo
- El trigger `trigger_create_creatures` **ya no existe** (eliminado en v1.49)

### Al atacar o espiar cualquier aldea (jugador real o fantasma)
```javascript
// Un solo camino — todas las aldeas tienen state jsonb
var r = await sbClient.from('villages').select('state').eq('id', targetId).maybeSingle();
var ts = typeof r.data.state === 'string' ? JSON.parse(r.data.state) : r.data.state;
if (!ts) ts = { buildings: {}, troops: {}, creatures: {}, resources: {} }; // self-healing
```

### Al guardar resultado de combate en cualquier aldea
```javascript
// Un solo camino — jugador real y fantasma idénticos
await sbClient.from('villages').update({ state: JSON.stringify(ts) }).eq('id', targetId);
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

**Excepción: Día de Caza (admin_test)** — ver sección siguiente.

El archivo define su propia función `escapeAttr(s)` al inicio — no depende del HTML principal para esto.

---

## SIMULADOR DE ATAQUES ADMIN — "Día de Caza" (v1.62)

Permite al admin lanzar ataques de prueba desde cualquier punto del mapa para testear batallas, mensajes y velocidades.

### Arquitectura de procesamiento
```
adminLaunchHunt()
  → Si origen vacío: admin_ghost_create (RPC) → state.is_temp = true
  → Inyectar tropas en state (magia admin) + decontarlas (quedan en misión)
  → Escribir en DB: state + mission_queue (columna separada)
  → loadAllVillages() → refreshMap()

tick() [Global Admin Tick — solo si isAdmin()]
  → Cada 3s (v1.63): sbClient.from('villages').select(...).neq('owner_id', currentUser.id).not('mission_queue', 'is', null)
  → Analiza todas las misiones admin (admin_test:true) en aldeas ajenas.
  → Si finish_at <= Date.now() → executeAttackPvP(m) directo.
  → Autodestrucción mejorada: borra la aldea si es temporal (is_temp o Punto de Invasión) y no quedan misiones.
  → sendSystemReport a admin (atacante) y defensor
  → Actualizar mission_queue en DB (quitar misión procesada)
  → Si mission_queue vacía → DELETE villages donde id = gv.id (autodestrucción)
```

### ⚠️ Por qué NO se usa resolveMissions() para las misiones admin
`resolveMissions(vs)` usa `activeVillage` globalmente (coordenadas, `flushVillage`, etc.).
Llamarla para una aldea fantasma machacaría el contexto del jugador. Por eso el Global Admin Tick llama a `executeAttackPvP(m)` directamente, que tiene una rama específica para `admin_test`.

### Flags de misión admin
```json
{ "admin_test": true, "god_levels": { "troop": N, "weapon": N, "armor": N } }
```
### Flag de aldea temporal
```json
{ "is_temp": true }  ← dentro de state jsonb
```

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
  guardian_type TEXT NOT NULL DEFAULT 'guardiancueva',
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

### RPCs de cuevas (todas SECURITY DEFINER)
| RPC | Qué hace |
|---|---|
| `admin_cave_create(p_cx, p_cy, p_status, p_guardian_type)` | Crea cueva validando admin server-side |
| `admin_cave_delete(p_cave_id)` | Borra cueva validando admin server-side |
| `admin_clear_cave_guardian(p_cave_id)` | Libera guardián de una cueva concreta (v1.77) |
| `admin_cave_respawn(p_cave_id, p_cx, p_cy)` | Reposiciona cueva tras muerte del guardián (v1.77) |

### RPCs de auth / perfil (todas SECURITY DEFINER)
| RPC | Qué hace |
|---|---|
| `ensure_profile_secure(p_username)` | Crea perfil en registro; normalización y unicidad atómicas |
| `change_username_secure(p_new_username)` | Cambia username; check + write atómicos, sin race condition |
| `delete_village_secure(p_village_id)` | Valida propiedad, libera cuevas, borra aldea (v1.80) |
| `delete_my_account()` | caves → villages → profiles → auth.users en una transacción (v1.80) |
| `save_motd_secure(p_text)` | Guarda/borra MOTD verificando role=admin en servidor (v1.80) |
| `save_village_client(p_village_id, p_build_queue, p_mission_queue, p_last_aldeano_at)` | Persiste colas y metadata (NO resources) |

> **Regla:** Toda escritura en `caves` desde `game-caves.js` DEBE ir por RPC. Nunca INSERT/UPDATE directo desde cliente.

## MÓDULO game-simulator.js — ARQUITECTURA

`renderSimulator()` genera un iframe con un HTML/CSS/JS autónomo via `doc.write()`. El simulador es completamente independiente — se pasan los datos de tropas como JSON al inicializarlo.

**Dependencias externas:** solo `TROOP_TYPES` y `CREATURE_TYPES` del HTML principal.

**Trampa crítica:** el código del simulador vive dentro de `var simJS_template = \`...\`` — un template literal gigante. Los backticks y `${}` internos deben escaparse como `\`` y `\${`, si no el parser de JS cierra el string prematuramente y genera `Unexpected token '<'` en el navegador.

---

## SISTEMA DE RECURSOS (TIME-BASED)

Desde v1.50, el juego usa un sistema basado en el tiempo transcurrido procesado en servidor:

```
recursos_oficiales = resources_base + (produccion_rate × horas_transcurridas)
(Procesado en Postgres via RPC sync_village_resources)
```

- **Cliente**: Interpola visualmente para que el jugador vea los números subir cada segundo.
- **Servidor**: Calcula el valor exacto SOLO cuando ocurre un evento (clic, llegada de misión, sync).
- **Consistencia**: `snapshotResources` persiste `production` y `capacity` para que el servidor tenga los datos necesarios.

**Nunca intentar "adelantar" recursos en el cliente enviando un valor manual a Supabase.** El servidor ignorará el valor si no coincide con su cálculo de tiempo.

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
13. **Al crear una aldea (jugador o fantasma), insertar con `state` jsonb completo.** El trigger `trigger_create_creatures` ya no existe.
14. **Todas las aldeas (jugador real y fantasma) usan `villages.state` jsonb.** No hay tablas separadas `troops`/`creatures`/`buildings`/`resources` — fueron eliminadas en v1.49.
15. **`battles_won_pvp/npc` se persisten en `profiles` inmediatamente**, no solo en `state`.

16. **`game-constants.js` solo datos puros.** Ninguna función en él puede referenciar `document`, `sbClient` o cualquier global del juego a nivel de módulo.
17. **El orden de carga de scripts en `<head>` es fijo:** game-globals → game-data → game-constants → game-troops → game-combat → game-engine → game-ui → game-social → game-smithy → game-auth → game-simulator → game-admin → css. No reordenar.
18. **`game-globals.js` debe cargarse PRIMERO.** Contiene `sbClient` y los globals del juego. Cualquier módulo que los use antes fallará con ReferenceError.

19. **`guardiancueva` vive en `state.creatures` dentro del jsonb de `villages`.** Es una criatura normal a efectos de persistencia — no requiere tratamiento especial.
20. **Espionaje y combate PvP: un solo camino para jugador real y fantasma.** Leer y escribir siempre via `villages.state`. No hay bifurcación `isGhost` para datos de aldea.

21. **Lanzamiento de misiones**: Usar siempre `launch_mission_secure` RPC. Valida tropas en servidor.
22. **Resolución de misiones**: Usar siempre `finalize_mission_secure` RPC para retornos y retribución atómica de tropas/botín.
23. **Fundación de aldeas**: Usar siempre `execute_founding_secure` RPC. Valida misión previa en servidor.
24. **Sincronización**: Llamar a `sync_village_resources` RPC tras acciones críticas para evitar "resource drift".

25. **RPCs de gasto (`start_build_secure`, `start_training_secure`, `start_summoning_secure`) calculan recursos inline.** No deben llamar `secure_village_tick` internamente. La fórmula de producción vive en el cuerpo del RPC. `secure_village_tick` es solo para la sincronización periódica de 60s.

26. **Toda escritura en la tabla `caves` desde `game-caves.js` DEBE ir por RPC SECURITY DEFINER.** Nunca INSERT/UPDATE directo desde cliente — RLS lo bloqueará o dejará datos inconsistentes. RPCs disponibles: `admin_cave_create`, `admin_cave_delete`, `admin_clear_cave_guardian`, `admin_cave_respawn`.

27. **La detección del tipo de guardián en movimiento DEBE comparar contra `CREATURE_TYPES`**, no contra el string literal `'guardiancueva'`. Si se añaden nuevos tipos de guardián, la detección sigue funcionando sin tocar el código.

28. **`startBuild`, `startRecruitment`, `startSummoning` NO DEBEN llamar `flushVillage` antes del RPC.** Los RPCs `start_*_secure` calculan recursos inline (DT-01 v1.70). Un flush previo sobreescribe `last_updated=NOW()` sin escribir resources → el RPC ve `v_hrs≈0` → recursos viejos del DB → falso «Recursos insuficientes».

29. **`flushVillage` / `save_village_client` NO escribe `resources`.** Solo persiste colas (`build_queue`, `training_queue`, etc.), `aldeanos_assigned`, `refugio` y metadata de producción/capacidad. Nunca usarlo como mecanismo de sincronización de recursos antes de un RPC de gasto.

30. **`doDeleteVillage` DEBE usar la RPC `delete_village_secure`.** Nunca `.delete()` directo sobre `villages` desde el cliente. La RPC libera cuevas capturadas (UPDATE caves) y borra la aldea de forma atómica. El client-side cleanup de guardianes fue eliminado en v1.80.

31. **`doDeleteAccount` DEBE usar exclusivamente la RPC `delete_my_account`.** La RPC ejecuta en orden: caves → villages → profiles → auth.users. El cliente no toca ninguna tabla directamente.

32. **`saveMOTD` / `clearMOTD` DEBEN usar la RPC `save_motd_secure`.** La verificación de rol `isAdmin()` en cliente es solo UX — no es barrera de seguridad real. La RPC verifica `profiles.role = 'admin'` en servidor con SECURITY DEFINER.

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
| RPCs de Seguridad | SQL / Supabase | launch_mission, finalize_mission, sync_resources... |

> Si añades un componente crítico nuevo, añádelo a esta tabla.

---

## HISTORIAL DE VERSIONES

> Añadir siempre al principio. No eliminar entradas antiguas.

### v1.81 ronda 2 — Auditoría game-globals + game-constants + game-simulator
- **[MENOR]** `game-globals.js`: `GAME_VERSION` stale en `'1.71'`. Fix: `'1.81'`.
- **[MENOR]** `game-globals.js`: 6 timers de polling (`_lastAlertsCheck`, `_lastMsgPoll`, `_lastSeenUpdate`, `_lastOnlineCheck`, `_lastReinforcementsCheck`, `_lastAlliancesCheck`) declarados en `<script>` inline de `index.html` — inconsistente con convención v1.73. Fix: movidos aquí, eliminados de `index.html`.
- **[MENOR]** `game-constants.js` `getCapacity`: `blds['almacen']` sin null-guard en `blds` — única función del archivo sin el patrón `(blds && blds['x'] && ...)`. Fix: null-guard añadido.
- `game-simulator.js`: 0 bugs — archivo limpio tras 2 pasadas completas.
- [Regla nueva] `game-globals.js` es la fuente de verdad de todos los globals de timing. Ningún módulo debe declarar `var _last*` fuera de este archivo.

### v1.81 — Auditoría index.html (2 pasadas) + game-smithy.js event delegation
- **[CRÍTICO]** `index.html` `toggleAlertsPanel`: `a.toName` y `a.fromName` en innerHTML sin `escapeHtml()` — nombres de aldea y jugador son datos de usuario, vector XSS. Fix: `escapeHtml()` en ambos.
- **[CRÍTICO]** `index.html` cache-busters: todos los scripts seguían en `?v=1.77` — navegadores con caché cargaban `game-smithy.js` y `game-auth.js` sin los fixes de seguridad de v1.78–v1.80. Fix: actualizados a `?v=1.81`.
- **[MEDIO]** `index.html` `_missionRow`: botones con `onclick` inline + `escapeJs()` — mismo patrón que disparaba `Trojan:JS/FakeUpdate.B` en smithy. Fix: event delegation con `data-action` + `data-mid`, igual que smithy v1.81.
- **[MEDIO]** `game-smithy.js`: eliminados todos los `onclick` inline de `renderSmithy` (falso positivo `Trojan:JS/FakeUpdate.B` Defender). Fix: `data-troop` + `data-type` + listener delegado en contenedor con `replaceChild` para evitar acumulación.
- **[MENOR]** `index.html` `loadAllVillages`: query sin `.limit()` — O(n·jugadores × tamaño state). Fix: `.limit(2000)`.
- [Regla nueva] Ningún botón generado dinámicamente en innerHTML puede usar `onclick` inline. Usar `data-*` + event delegation en el contenedor.

### v1.80 — Auditoría game-smithy.js + game-auth.js (2 pasadas cada uno)
- **[CRÍTICO]** `game-auth.js` `doDeleteVillage`: `.delete()` directo sobre `villages` → RPC `delete_village_secure(p_village_id)`. La RPC valida propiedad, libera cuevas capturadas (UPDATE caves) y borra la aldea de forma atómica. El client-side `onCaveGuardianDied` eliminado de esta función — la cueva se liberaba *después* del DELETE de la aldea, dejando posibles FK huérfanas si el cleanup fallaba.
- **[CRÍTICO]** `game-auth.js` `doDeleteAccount`: `.delete()` directo sobre `villages` + `profiles` sin limpieza de cuevas → consolidado en `delete_my_account` RPC ampliada (caves → villages → profiles → auth.users). El cliente ya no toca ninguna tabla directamente.
- **[CRÍTICO]** `game-auth.js` `doRegister`: `ensureProfile()` retorno no comprobado — si la RPC fallaba, `initGame()` continuaba sin perfil → crash o estado indefinido. Fix: check de retorno + `signOut` + mensaje de error si `!profileOk`.
- **[MEDIO]** `game-auth.js` `saveMOTD` / `clearMOTD`: upsert directo a tabla `config` con guardia `isAdmin()` solo en cliente (manipulable desde consola) → nueva RPC `save_motd_secure(p_text)` con SECURITY DEFINER que verifica `profiles.role = 'admin'` en servidor.
- **[MEDIO]** `game-smithy.js` `upgradeSmithyItem`: `last_updated` no reseteado tras aplicar `new_resources` del servidor — `calcRes()` acumulaba producción desde timestamp antiguo hasta el siguiente sync de 60s. Fix: `activeVillage.state.last_updated = new Date().toISOString()` tras aplicar `new_resources`.
- **[MENOR]** `game-auth.js` `visibilitychange`: llamaba `flushVillage()` — inconsistente con `beforeunload` (ya corregido en v1.70). Fix: mismo patrón RPC fire-and-forget que `beforeunload`.
- **[MENOR]** `game-smithy.js` `renderSmithy`: `itemD.name`, `troop.name`, `troop.icon` insertados en innerHTML sin `escapeHtml()`. Fix: `escapeHtml()` aplicado (misma clase que game-caves.js Bug-5 / game-combat.js Bug-1).
- **[MENOR]** `game-smithy.js` `upgradeSmithyItem`: sin null-guard en `data` antes de `data.ok` — TypeError silencioso si RPC devuelve null. Fix: `!data || !data.ok`.
- [Supabase] Nueva RPC `delete_village_secure(p_village_id UUID)` — ver SQL en cabecera de `game-auth.js`.
- [Supabase] RPC `delete_my_account()` ampliada — ver SQL en cabecera de `game-auth.js`.
- [Supabase] Nueva RPC `save_motd_secure(p_text TEXT)` — ver SQL en cabecera de `game-auth.js`.
- [Regla nueva 30] `doDeleteVillage` DEBE usar la RPC `delete_village_secure`. Nunca `.delete()` directo sobre `villages`.
- [Regla nueva 31] `doDeleteAccount` DEBE usar exclusivamente la RPC `delete_my_account`. El cliente no toca ninguna tabla directamente.
- [Regla nueva 32] `saveMOTD` / `clearMOTD` DEBEN usar la RPC `save_motd_secure`. `isAdmin()` en cliente es solo UX.
- ✅ **AUDITORÍA COMPLETA** — todos los archivos JS del juego auditados con 2 pasadas.

### v1.79 — Auditoría game-social.js (2 pasadas)
- **[MEDIO]** `dissolveAlliance`: segunda `DELETE` (`alliance_members`) sin chequeo de error — si fallaba silenciosamente, los registros de miembros quedaban huérfanos en DB. Fix: chequeo explícito con notificación al usuario.
- **[MEDIO]** `markMsgAsReadAndDelete`: solo hacía `UPDATE read=true` sin `DELETE` real en DB — al recargar el hilo el mensaje reaparecía como leído. Fix: `DELETE` añadido tras el `UPDATE`.
- **[MENOR]** `_selectedReportIds`: variable global usada en 6 sitios pero nunca declarada — `ReferenceError` en strict mode. Fix: `var _selectedReportIds = new Set()` declarado en ámbito de módulo.

### v1.78 — Auditoría game-admin.js (2 pasadas)
- **[CRÍTICO]** `adminLaunchHunt`: `missionEntry` nunca se pusheaba a `s.mission_queue` antes del RPC `admin_ghost_sync_hunt` → el Global Admin Tick escaneaba `mission_queue` vacía → ningún ataque admin se resolvía jamás. Fix: `s.mission_queue.push(missionEntry)` antes del sync.
- **[CRÍTICO]** `adminLaunchHunt`: `sTmp.is_temp = true` era código muerto — `sTmp` era una variable local que se descartaba; el state real (`s`) se re-leía después sin `is_temp` → los puntos de invasión temporales nunca se autodestruían y se acumulaban en el mapa. Fix: `s.is_temp = true` directamente sobre el object persistido; bloque `sTmp` eliminado.
- **[MEDIO]** `adminFastBuildAll`: leía `build_queue` desde `state` jsonb (siempre null desde v1.64 — se stripea en `saveVillage`) → count siempre 0 → función completamente inútil. Fix: `select('id,build_queue')` sobre la columna real separada.
- **[MENOR]** `_adminDeleteUserData`: UPDATE directo a `caves` al liberar cuevas del usuario borrado. Fix: bucle con `admin_clear_cave_guardian(p_cave_id)` por cada cueva (regla 26).

### v1.77 — Fix crítico: snapshotResources+flushVillage revertido en RPCs de gasto
- **[CRÍTICO]** `startBuild` (game-ui.js), `startRecruitment` y `startSummoning` (game-troops.js): eliminado `snapshotResources + flushVillage` antes de los RPCs `start_build_secure`, `start_training_secure`, `start_summoning_secure`. Este patrón introducido en v1.73 causaba el bug inverso: `flushVillage` llama `save_village_client` que NO escribe `resources` (server-authoritative) pero SÍ sobreescribe `last_updated = NOW()` — el RPC calculaba `v_hrs ≈ 0` y veía los recursos viejos del DB → \«Recursos insuficientes\» aunque el cliente mostrara suficientes.
- **Causa raíz**: conflicto entre v1.73 (snapshot+flush) y v1.70/DT-01 (RPCs con cálculo inline propio) que nunca fue detectado. Los RPCs ya calculan recursos correctamente desde el `last_updated` que ellos mismos escriben — no necesitan ni deben recibir un flush previo.
- [Regla nueva] **`startBuild`, `startRecruitment`, `startSummoning` NO DEBEN hacer `flushVillage` antes del RPC.** Los RPCs `start_*_secure` tienen cálculo inline de recursos (DT-01 v1.70) y son la autoridad. Un flush previo corrompe `last_updated` sin actualizar resources.
- [Regla nueva] **`flushVillage` / `save_village_client` NO escribe `resources`.** Solo persiste colas, `aldeanos_assigned`, `refugio` y producción/capacidad. Nunca usarlo como mecanismo de sincronización de recursos antes de un RPC de gasto.
- [Eliminado] Patrón `snapshotResources(vs); await flushVillage();` en `startBuild`, `startRecruitment`, `startSummoning`.

### v1.77 — Auditoría game-caves.js (2 pasadas)
- **[CRÍTICO]** `adminRevokeCave` + `adminResetAllCaves`: llamaban a `save_village_client` con firma incorrecta — la RPC ha evolucionado desde que se escribió ese código y la llamada reventaba silenciosamente. Reemplazado por nueva RPC `admin_clear_cave_guardian(p_cave_id)` con firma estable y validación server-side.
- **[MEDIO]** Auto-respawn post-captura: INSERT directo a `caves` — saltaba RLS. Reemplazado por `admin_cave_create` RPC (ya existía, no se usaba aquí).
- **[MEDIO]** `onCaveGuardianDied`: UPDATE directo a `caves` al morir el guardián — mismo vector RLS. Reemplazado por nueva RPC `admin_cave_respawn(p_cave_id, p_cx, p_cy)`.
- **[MEDIO]** `loadAdminCaves`: detección "en movimiento" hardcodeada a `=== 'guardiancueva'` — si el `guardian_type` cambia o se añaden nuevos tipos, la detección fallaba en silencio. Ahora comprueba dinámicamente contra `CREATURE_TYPES`.
- **[MENOR]** `_generateCaveReport`: nombres de tropa sin `escapeHtml()` — vector XSS consistente con los fixes de v1.74/v1.75. Aplicado `escapeHtml()`.
- [Supabase] Nueva RPC `admin_clear_cave_guardian(p_cave_id uuid)` — libera guardian de una cueva concreta validando admin server-side. Devuelve `{ok, cave_id}`.
- [Supabase] Nueva RPC `admin_cave_respawn(p_cave_id uuid, p_cx int, p_cy int)` — reposiciona cueva a coordenadas aleatorias tras muerte del guardián, validando admin server-side.
- [Regla nueva] **Toda escritura en la tabla `caves` desde `game-caves.js` DEBE ir por RPC SECURITY DEFINER.** Nunca INSERT/UPDATE directo desde cliente — RLS lo bloqueará o dejará datos inconsistentes.
- [Regla nueva] **La detección del tipo de guardián en movimiento DEBE comparar contra `CREATURE_TYPES`**, no contra el string literal `'guardiancueva'`. Permite añadir tipos nuevos sin romper el panel admin.

### v1.71 — DT-03: Llegadas de misiones 100% atómicas
- **Bug**: `executeMove` y `executeTransport` escribían recursos y tropas en el destino con `sbClient.from('villages').update({state})` directo — el cliente leía el state, sumaba y escribía sin lock, dejando una ventana de race condition si dos misiones llegaban simultáneamente.
- [Supabase] Nueva RPC `apply_cargo_arrival(village_id, cargo)` → calcula producción inline + suma cargo atómicamente. Usada por `executeTransport`.
- [Supabase] Nueva RPC `apply_move_arrival(village_id, troops, creatures, cargo, troop_slots)` → calcula producción inline + suma tropas + cargo atómicamente + respeta cap de barracas con FOR UPDATE lock. Devuelve `{state, accepted, rejected}`. Usada por `executeMove`.
- [JS] `executeTransport` → usa `apply_cargo_arrival` RPC en vez de `villages.update` directo
- [JS] `executeMove` → usa `apply_move_arrival` RPC; la lógica de barracas y reasignación de cuevas se mantiene en JS usando el resultado `accepted/rejected` del servidor
- [Eliminado] Lectura previa del state del destino desde cliente en ambas funciones
- [Deuda técnica] DT-03 ✅ **cerrada**

### v1.70 — DT-01: Modelo Ogame puro — RPCs de gasto 100% atómicos
- **Filosofía**: `start_build_secure`, `start_training_secure`, `start_summoning_secure` ya NO llaman `PERFORM secure_village_tick` antes de validar. Calculan los recursos reales directamente en su cuerpo mediante la misma fórmula que `secure_village_tick` (producción × horas transcurridas + cap almacén).
- **Resultado**: cada acción de gasto es ahora 1 lock + 1 write en vez de 2 locks + 2 writes. Elimina el riesgo de que el tick fallase silenciosamente y dejase los recursos desactualizados.
- [Supabase] `start_build_secure` → bloque de cálculo inline reemplaza `PERFORM secure_village_tick`
- [Supabase] `start_training_secure` → ídem
- [Supabase] `start_summoning_secure` → ídem; además actualiza todos los recursos (no solo esencia) al hacer el write final
- `secure_village_tick` sigue existiendo sin cambios — su rol es la sincronización periódica de 60s desde JS y el recálculo de aldeanos
- [Deuda técnica] DT-01 ✅ **cerrada**

### v1.64 — Seguridad de Colas y Anti-Bloat
- **State Striping**: `saveVillage` ahora limpia el JSON de `state` eliminando las colas (`build_queue`, `training_queue`, etc.) antes de guardar, garantizando que las columnas especializadas sean la única fuente de verdad y evitando el crecimiento infinito del JSON.
- **Tick Master**: Añadidos triggers de guardado en el `tick()` para todas las colas (Entrenamiento e Invocación), eliminando la posibilidad de "tropas fantasma" al refrescar.
- **Autoridad Suprema**: El cliente ya no intenta "corregir" al servidor en la cola de entrenamiento; si el servidor dice que ha terminado, se acepta.

### v1.63 — Audit de Robustez y Limpieza General

### v1.62 — Fase Robustez (Arquitectura Ogame/Ikariam)
- **Time-Based Resources**: Recursos calculados en servidor basándose en tasas de producción y tiempo transcurrido.
- **RPCs Atómicos**: Lanzamiento, retorno, combate, logística y fundación migrados a funciones de base de datos seguras.
- **Smart Merge**: Sistema de caché en cliente para eliminar el flickering visual de recursos y colas.
- [Supabase] Nuevos RPCs: `sync_village_resources`, `launch_mission_secure`, `finalize_mission_secure`, `execute_founding_secure`, `execute_attack_secure`, `simulate_battle_server`, `execute_move_secure`, `execute_reinforce_secure`, `execute_transport_secure`.
- [Regla nueva] El cliente nunca dicta los recursos; el servidor es la autoridad final.
- [Regla nueva] Validación de tropas mandatoria en servidor antes de enviar misiones.
- [Eliminado] Lógica de suma de tropas manual en el cliente al procesar retornos.
- [Eliminado] Lógica de combate PvP/NPC calculada en el cliente.

### v1.49 — Migración a JSON blob (state jsonb)

**Objetivo:** eliminar el modelo de 5 tablas separadas y unificar todos los datos de aldea en `villages.state jsonb`. Un read, un write, cero ensamblaje.

**[Supabase] Cambios en base de datos:**
- `ALTER TABLE villages ADD COLUMN state jsonb`
- Script SQL migró datos de las 5 tablas a `state` para todas las aldeas (jugadores y fantasmas)
- `DROP TABLE troops, creatures, buildings, resources` — tablas legacy eliminadas
- `DROP TRIGGER trigger_create_creatures` — ya no necesario
- RPC `admin_ghost_create` reescrito: un solo `INSERT INTO villages` con `state` jsonb completo

**[JS] Archivos modificados:**
- `index.html`: `loadMyVillages` (1 select), `saveVillage` (1 update), `refreshMilitaryScore`, `createFirstVillage`
- `game-ui.js`: `executeTransport`, `syncResourcesFromDB`, refuerzos → `villages.state`
- `game-engine.js`: espionaje unificado (sin bifurcación isGhost), `executeAttackPvP` sin fallback a tablas, guardar defensor via `villages.state`
- `game-admin.js`: info usuario lee `state.resources`, borrado no toca tablas legacy
- `game-caves.js`: eliminado write legacy a tabla `creatures` al liberar guardián

**[Eliminado]:**
- Tablas `troops`, `creatures`, `buildings`, `resources`
- Trigger `trigger_create_creatures`
- Toda bifurcación `isGhost` para leer/escribir datos de aldea
- Fallback de carga desde tablas separadas en `executeAttackPvP`

**[Regla nueva]:** Todas las aldeas usan `villages.state` jsonb. No hay tablas separadas. No hay bifurcación jugador/fantasma para datos de aldea.

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

### v1.68 — Auditoría de seguridad admin + RLS caves
- **Bug crítico**: tabla `caves` sin RLS — cualquier usuario autenticado podía leer, escribir, borrar y capturar cuevas ajenas directamente desde el cliente sin pasar por ninguna RPC.
- **Bug**: `adminTeleportMap` usaba columnas `x,y` (no existen en `villages`) → el teletransporte nunca funcionó. Corregido a `cx,cy` via nueva RPC `admin_teleport_village`.
- **Bug**: `admin_repair` escribía `state` directamente con `UPDATE` sin incluir `aldeanos` en resources — mismo bug que v1.67. Corregido via nueva RPC `admin_repair_complete_builds`.
- **Inconsistencia resuelta**: `isAdmin()` cliente usaba email hardcodeado; `is_admin()` servidor usaba `profiles.role`. Sincronizados — `profiles.role = 'admin'` confirmado en DB.
- [Supabase] RLS activado en `caves` con 4 políticas: `caves_select_public` (todos), `caves_insert_admin_only`, `caves_update_owner_or_admin`, `caves_delete_admin_only`
- [Supabase] Nueva RPC `admin_teleport_village(village_id, cx, cy)` — valida columnas correctas y colisión de coordenadas
- [Supabase] Nueva RPC `admin_repair_complete_builds(village_id)` — completa build_queue vencidas preservando `aldeanos`
- [JS] `adminTeleportMap` → usa `admin_teleport_village` RPC en vez de UPDATE directo
- [JS] `admin_repair` loop → usa `admin_repair_complete_builds` RPC en vez de `villages.update({state})`
- [Regla nueva] **Toda tabla con datos de jugador debe tener RLS activado.** Verificar con: `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity = false`
- [Regla nueva] El admin nunca hace `UPDATE villages SET state = ...` directo desde el cliente. Siempre via RPC SECURITY DEFINER que preserve `aldeanos`.

### v1.67 — Fix crítico: aldeanos borrados en cada operación servidor
- **Bug raíz**: todas las RPCs que reconstruyen el objeto `resources` con `jsonb_build_object(...)` omitían el campo `aldeanos`. PostgreSQL reemplaza el objeto entero, no hace merge, por lo que cada llamada al servidor ponía `aldeanos` a `null`.
- **Afectaba**: `secure_village_tick`, `start_build_secure`, `cancel_build_secure`, `start_training_secure`, `cancel_training_secure`, `save_village_client`.
- [Supabase] `secure_village_tick` → añade `'aldeanos', v_ald_current` en el jsonb de resources
- [Supabase] `start_build_secure` → añade `'aldeanos'` preservando `troops.aldeano` del servidor. Fix adicional: check de `build_queue` vacía ahora comprueba `->>'id' IS NOT NULL` en vez de `NOT IN ('null','{}','')` (jsonb vacío es `'{}'` no `'[]'`)
- [Supabase] `cancel_build_secure` → ídem
- [Supabase] `start_training_secure` → añade `'aldeanos', v_new_ald` (aldeanos tras descontar los reclutados)
- [Supabase] `cancel_training_secure` → añade `'aldeanos', v_new_ald` (aldeanos devueltos)
- [Supabase] `save_village_client` → 4 versiones duplicadas eliminadas con `DROP FUNCTION` dinámico. Versión canónica única (12 parámetros). `aldeanos` en `v_res_patch` se toma siempre de `v_cur_trp->>'aldeano'` (servidor), nunca del cliente.
- [Regla nueva] **Toda RPC que reconstruya `resources` con `jsonb_build_object` DEBE incluir `'aldeanos'` tomado de `troops.aldeano` del estado actual en DB.**
- [Regla nueva] `save_village_client` solo debe existir en una versión. Antes de crear una nueva versión, hacer DROP de todas las anteriores.
- [Supabase] Limpieza de políticas RLS duplicadas y cierre de agujero de seguridad:
  - `"Users can update own villages."` **ELIMINADA** — permitía UPDATE directo al cliente, saltando todas las RPCs
  - Eliminados duplicados: `alliances_insert_owner`, `alliances_select_public`, `"Users can insert their own villages."`, `"Villages are viewable by everyone."`
  - `"Users manage own guest troops"` (ALL) eliminada — solapaba con las 6 políticas específicas
- [Regla nueva] Políticas RLS de `villages`: solo las 4 canónicas: `villages_insert`, `villages_select`, `villages_update_admin_only`, `villages_delete_admin_only`. Nunca añadir UPDATE genérico para usuarios normales.
- [Regla nueva] Antes de añadir política RLS, verificar duplicados: `SELECT tablename, policyname, COUNT(*) FROM pg_policies WHERE schemaname='public' GROUP BY tablename, policyname HAVING COUNT(*)>1`

### v1.66 — Modelo Ogame: acciones server-authoritative
- **Filosofía**: el cliente ya NO descuenta recursos localmente para construir/entrenar/invocar. Solo manda intenciones al servidor. El servidor valida, descuenta y devuelve el estado actualizado.
- [Supabase] Nuevas RPCs SECURITY DEFINER:
  - `phased_val(l, base, m1, e1, m2, e2, m3)` — helper, réplica exacta de `phasedVal` JS
  - `get_building_cost(building_id, next_lvl)` → jsonb con coste y tiempo de todos los edificios
  - `start_build_secure(village_id, building_id)` → valida recursos, descuenta, crea build_queue, devuelve state
  - `cancel_build_secure(village_id)` → devuelve recursos del edificio en cola, limpia build_queue
  - `get_troop_cost(type)` → jsonb coste de las 9 tropas
  - `get_creature_cost(key)` → tabla de costes de las 60 criaturas (30 tiers)
  - `start_training_secure(village_id, troop_type, amount)` → valida aldeanos+recursos+barracas, encola, devuelve state+training_queue
  - `cancel_training_secure(village_id)` → devuelve todos los recursos y aldeanos de la cola
  - `start_summoning_secure(village_id, creature_key)` → valida esencia+invocadores, encola criatura, devuelve state+summoning_queue
  - `update_battle_stats(won_npc, won_pvp, lost_pvp)` → incrementa contadores en profiles
  - `execute_founding_secure` — corregido: ahora busca misión en columna `mission_queue` (no en `state`)
- [JS] `startBuild` en game-ui.js → async, llama `start_build_secure`, aplica state devuelto
- [JS] `cancelBuild` nuevo en game-ui.js → async, llama `cancel_build_secure`
- [JS] `renderQueue` → añadido botón ✕ cancelar construcción
- [JS] `startRecruitment` en game-troops.js → async, llama `start_training_secure`
- [JS] `cancelTrainingQueue` en game-troops.js → async, llama `cancel_training_secure`
- [JS] `startSummoningFromInput` + `startSummoning` nuevas en game-troops.js → async, llama `start_summoning_secure`
- [JS] `syncVillageResourcesFromServer` → corregido a `secure_village_tick` (antes llamaba `sync_village_resources`)
- [JS] `syncVillageResourcesFromServer` → preserva `build_queue` local durante el merge de estado
- [JS] `switchVillage` → inyecta `_profileBattles` en cada aldea al activarla (batallas globales correctas)
- [JS] `save_village_client` → ahora persiste troops, creatures y buildings además de resources
- [Regla nueva] El cliente NUNCA modifica `resources`, `troops` ni `buildings` directamente antes de confirmación del servidor para acciones de gasto (construir, entrenar, invocar).
- [Regla nueva] `save_village_client` sigue siendo necesario para: completions client-side (build/train/summon finish), misiones (provisiones), workers, refugio.
- [Eliminado] Lógica client-side de descuento de recursos en startBuild, startRecruitment, startSummoningFromInput.

### v1.65 — Arquitectura de seguridad server-authoritative (recursos, aldeas)
- `secure_village_tick` RPC: calcula recursos Y aldeanos en servidor, reemplaza `sync_village_resources`
- `save_village_client` RPC: solo acepta campos seguros (aldeanos_assigned, refugio, colas). Resources protegidos con LEAST anti-hack.
- RLS: UPDATE/DELETE bloqueados para usuarios normales. Admin (sementalac@gmail.com) tiene acceso directo.
- `apply_mission_arrival` RPC: maneja llegadas de misiones (recursos, tropas) sin exponer UPDATE directo.
- Bug foundVillage: misión sin `mid` → RPC no la encontraba. Fix: generar `mid` al crear la misión.
- Bug provisiones: `foundVillage` no descontaba provisiones. Fix: `snapshotResources` + descuento antes de crear misión.
- `battles_won_npc` movido de `state` a `profiles` (fuente de verdad global). RPC `update_battle_stats`.

### v1.69 — Fix sync multi-aldea + colas offline + build_secure atómico
- **Bug**: `switchVillage` nunca llamaba `syncVillageResourcesFromServer` → aldeas no activas no recibían tick y acumulaban 0 aldeanos/recursos entre sesiones. Fix: llamada async a `syncVillageResourcesFromServer` al final de `switchVillage`.
- **Bug**: `last_aldeano_at = null` en aldeas → `secure_village_tick` no podía calcular aldeanos nuevos. Fix: query puntual `UPDATE villages SET state = jsonb_set(state, '{last_aldeano_at}', to_jsonb(now()::text)) WHERE state->>'last_aldeano_at' IS NULL`.
- **Bug**: `loadMyVillages` solo resolvía `build_queue` offline, ignoraba `training_queue` y `summoning_queue`. Fix: resolver las tres colas en el load con `needsSave` unificado.
- **Bug**: `start_build_secure` fallaba con "Recursos insuficientes" cuando el cliente tenía recursos interpolados no guardados en DB. Fix: `PERFORM secure_village_tick(p_village_id)` al inicio del RPC antes de leer recursos.
- [JS] `switchVillage` → llama `syncVillageResourcesFromServer()` tras activar aldea
- [JS] `loadMyVillages` → resuelve `training_queue` y `summoning_queue` offline además de `build_queue`
- [Supabase] `start_build_secure` → `PERFORM secure_village_tick` antes de validar recursos
- [Eliminado] Bloque duplicado `_profileBattles` en `switchVillage`
- [Deuda técnica] Ver sección DEUDA TÉCNICA más abajo

### v1.73 — Auditoría seguridad + robustez multi-archivo
- **[CRÍTICO]** `game-admin.js`: 4 operaciones directas a DB sin validación server-side → rerouteadas a RPCs SECURITY DEFINER (`admin_delete_alliance`, `admin_kick_from_alliance`, `admin_cave_create`, `admin_cave_delete`). Vector de ataque: `currentUser.email` manipulable desde consola.
- **[CRÍTICO]** `game-ui.js` `startBuild`: `snapshotResources + flushVillage` añadidos antes del RPC. ⚠️ Este fix introdujo un bug secundario corregido en v1.77: `flushVillage` sobreescribía `last_updated` sin guardar resources → RPC veía `v_hrs≈0`.
- **[CRÍTICO]** `game-troops.js` `resolveTrainingQueue`: `+1` hardcodeado → `+(t.amount||1)`. Colas de N tropas resolvían como 1.
- **[MEDIO]** `game-troops.js` `startRecruitment` y `startSummoning`: snapshot+flush añadidos (mismo patrón que startBuild). ⚠️ Mismo bug secundario, corregido en v1.77.
- **[MEDIO]** `game-admin.js` `adminLaunchHunt`: eliminado `UPDATE villages SET state` directo — `is_temp` ya persiste vía `admin_ghost_sync_hunt`.
- **[MEDIO]** `game-ui.js`: nueva función `fmtCost()` — exacta hasta 9.999 para evitar ambigüedad visual en costes de edificios (fmt(1020) == fmt(1040) → confusión).
- **[MENOR]** `game-globals.js`: declarados explícitamente `_lastResourceSync`, `_lastMapLoad`, `_guestTroopsTableExists`, `profileCache`. Antes creados implícitamente → posibles ReferenceError en strict mode.
- **[MENOR]** `game-constants.js` `getBarracksCapacity` / `getAldeanosIntervalMs`: null-check en `blds`.
- **[MENOR]** `game-constants.js` `getBarracksUsed`: training_queue multiplicaba 1 slot fijo → ahora `t.amount * slots`.
- **[MENOR]** `game-admin.js` `adminSpawnGhostMap`: keys `guerrero/arquero` hardcodeadas → dinámicas desde `TROOP_TYPES`.
- **[MENOR]** `index.html`: `}` extra en admin global tick rompía todo el `<script>` → `initGame` no se definía.
- **[MENOR]** `index.html`: `ensureProfile(currentUser.id, myName)` → `ensureProfile(myName)` (firma cambió, argumento UUID sobraba).
- [Supabase] Nuevas RPCs: `admin_delete_alliance`, `admin_kick_from_alliance`, `admin_cave_create`, `admin_cave_delete`
- [Supabase] `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS normalized_username TEXT`
- [Regla REVERTIDA en v1.77] ~~`startBuild`, `startRecruitment`, `startSummoning` DEBEN hacer `snapshotResources + flushVillage` antes del RPC~~ — esta regla era incorrecta. `flushVillage` llama `save_village_client` que NO escribe resources pero SÍ sobreescribe `last_updated=NOW()`, haciendo que el RPC calcule `v_hrs≈0` y vea recursos viejos. Eliminada y corregida en v1.77.
- [Regla nueva] `fmtCost()` para costes en UI. `fmt()` para producción y cantidades. No intercambiar.

### v1.72 — Fix } extra en admin global tick + ensureProfile
- descripción incluida en v1.73 (misma sesión de auditoría)

### v1.71 — Auditoría Ogame: 6 fixes index.html
- **[CRÍTICO]** `createFirstVillage()` reescrita: ya no hace 100 queries + INSERT directo. Ahora llama `create_first_village_secure` RPC SECURITY DEFINER → búsqueda de coordenadas e INSERT atómicos en una sola transacción. Imposible race condition entre registros simultáneos.
- **[MEDIO]** `tick()`: añadido check `_lastResourceSync > 60000` → llama `syncVillageResourcesFromServer` cada 60s. Antes `_lastResourceSync` estaba declarado pero nunca se comprobaba; los recursos del servidor dejaban de sincronizar tras el boot.
- **[MEDIO]** Resolución de misiones en tick: `saveVillage(v)` → `saveVillage(v, { updateScore: false })`. `refreshMilitaryScore` movido a una sola llamada post-resolución para evitar ráfagas de queries en llegadas múltiples.
- **[MENOR]** `switchVillage()`: eliminado bloque `_profileBattles` duplicado (v1.65 + v1.66 hacían lo mismo dos veces).
- **[MENOR]** Title y footer actualizados a v1.71.
- **[MENOR]** Cache busters de todos los scripts JS/CSS actualizados de `?v=1.50` a `?v=1.71`.
- [Supabase] Nueva RPC `create_first_village_secure(p_user_id, p_name)`: busca coordenadas libres + INSERT atómico. Buildings todos a level 1. Devuelve `{ok, village_id, cx, cy}`.
- [Regla nueva] La lista de buildings en `create_first_village_secure` debe ser idéntica a `BUILDINGS.map(b => b.id)` en JS. Actualizarla si se añade un edificio nuevo.

### v1.76 — Auditoría game-ui.js + index.html (2 pasadas cada uno)
- **[CRÍTICO]** `game-ui.js` `startBuild`: ok-check en `start_build_secure` — sin él `{ok:false}` aplicaba estado basura y mostraba éxito. Misma clase de bug que DT-07/DT-08.
- **[CRÍTICO]** `game-ui.js` `cancelBuild`: `build_queue = null` fuera del `if (newState)` — se borraba la cola local aunque el servidor no confirmara la cancelación.
- **[CRÍTICO]** `game-ui.js` `executeMoveClick`, `executeTransportClick`, `processRecalls`: misiones `move`, `transport` y `return_reinforce` generadas sin `mid` — colisionaban en `finalize_mission_secure`. Mismo patrón que DT-09 (`_returnTroopsHome`).
- **[MEDIO]** `game-ui.js` `showPage`: `syncResourcesFromDB()` (lectura directa a DB) → `syncVillageResourcesFromServer()` (RPC `secure_village_tick`) al cambiar de página. La lectura directa sobrescribía recursos interpolados con valores atrasados de DB.
- **[MEDIO]** `index.html` `checkIncomingAttacks`: query `.from('villages').select(…).neq('owner_id', …)` sin filtro ni límite — descargaba `mission_queue` de **todas** las aldeas del mundo cada 30s. Reemplazado por RPC `get_incoming_attacks(p_coords)` que filtra en PostgreSQL y devuelve solo los ataques entrantes relevantes. **Coste: O(ataques entrantes) vs O(n·jugadores).**
- **[MENOR]** `game-ui.js` `openBuildingDetail`: `fmt()` → `fmtCost()` en tabla de costes de edificios — consistencia con regla de v1.73.
- **[MENOR]** `index.html` `renderMissionsPanel`: `v.cx`/`v.cy` → `v.x`/`v.y` en fallback de nombre de aldea.
- **[MENOR]** `index.html`: `var _lastMapLoad` y `var _lastResourceSync` eliminados — ya declarados en `game-globals.js` (v1.73).
- **[MENOR]** `index.html`: cache-busters, título y footer actualizados a `v1.76`.
- [Supabase] Nueva RPC requerida: `get_incoming_attacks(p_coords jsonb)` — ver sección RPCS DE SUPABASE.
- [Regla nueva] `checkIncomingAttacks` y cualquier detección de eventos en aldeas ajenas **DEBEN usar una RPC de servidor** que filtre en SQL. Nunca descargar toda la tabla de villages para filtrar en cliente.
- [Regla nueva] Toda misión creada en cliente (`move`, `transport`, `return_reinforce`, `reinforce`, `found`) **DEBE incluir `mid` único** (`Math.random().toString(36).slice(2,10) + Date.now().toString(36)`). Sin `mid`, `finalize_mission_secure` usa `finish_at` como ID y colisiona con misiones simultáneas del mismo tipo.

### v1.75 — Auditoría game-engine.js (2 pasadas)
- **[MEDIO]** `startMission`: ok-check en `launch_mission_secure` — sin él `{ok:false}` aplicaba estado basura y mostraba "¡Misión enviada!". Rollback de tropas/criaturas/provisiones también en fallo de validación.
- **[MEDIO]** `executeAttackPvP` log: `escapeHtml()` en líneas del log de batalla PvP — mismo vector XSS que v1.74.
- **[MEDIO]** `executeAttackPvP` botín: `esencia` añadida al informe de botín — se aplicaba en servidor pero no se mostraba al jugador.
- **[MENOR]** `executeAttackMission` (NPC) log: `escapeHtml()` en líneas del log NPC — consistencia con PvP.
- **[MENOR]** `_returnTroopsHome`: misión de retorno ahora incluye `mid` único — sin él `finalize_mission_secure` usaba `finish_at` como ID, colisionable con retornos simultáneos.
- **[MENOR]** `resolveMissions`: `scheduleSave()` tras actualizar `mission_queue` — evita pérdida de estado entre ticks.
- **[MENOR]** `executeMove` + `executeReinforce`: `await loadMyVillages(); tick()` tras RPC exitoso — patrón consistente con `cancelMission`/`cancelAlliedMission`.
- [Regla nueva] `executeMove` y `executeReinforce` DEBEN llamar `loadMyVillages()+tick()` tras RPC exitoso — las tropas permanentes en destino no se reflejan localmente sin sync.

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

---

## DEUDA TÉCNICA

### ✅ Sin deuda técnica abierta

| ID | Descripción | Estado |
|---|---|---|
| ~~DT-01~~ | ~~RPCs de gasto usaban `PERFORM secure_village_tick` antes de validar — doble lock + doble write.~~ | ✅ Resuelto v1.70 |
| ~~DT-02~~ | ~~`start_training_secure` y `start_summoning_secure` con bug de recursos desactualizados.~~ | ✅ Resuelto v1.69 |
| ~~DT-03~~ | ~~`executeMove` y `executeTransport` escribían recursos al destino con `villages.update` directo — race condition posible.~~ | ✅ Resuelto v1.71 |
| ~~DT-04~~ | ~~`resolveTrainingQueue` añadía 1 tropa fija ignorando `t.amount`.~~ | ✅ Resuelto v1.73 |
| ~~DT-05~~ | ~~`startBuild/startRecruitment/startSummoning` sin flush previo → falsos "Recursos insuficientes".~~ | ✅ Resuelto v1.73 |
| ~~DT-06~~ | ~~`generateBattleReport`: nombres y log sin `escapeHtml()` — XSS.~~ | ✅ Resuelto v1.74 |
| ~~DT-07~~ | ~~`startSummoning/startRecruitment/cancelTrainingQueue`: sin check `newState.ok` — fallo RPC mostraba éxito.~~ | ✅ Resuelto v1.74 |
| ~~DT-08~~ | ~~`startMission`: sin ok-check en `launch_mission_secure` — `{ok:false}` mostraba éxito y no hacía rollback.~~ | ✅ Resuelto v1.75 |
| ~~DT-09~~ | ~~`executeAttackPvP`: log sin `escapeHtml()`, esencia omitida en botín, `_returnTroopsHome` sin `mid`.~~ | ✅ Resuelto v1.75 |
