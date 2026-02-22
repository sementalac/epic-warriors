# EPIC WARRIORS — DOCUMENTO DE ARQUITECTURA
> Versión del documento: 1.0 — Última actualización: v0.98
> Fuentes de verdad: **Supabase** (datos) · **GitHub Pages** (código)

---

## STACK TÉCNICO

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend | HTML + JS (single file) | Toda la lógica del juego |
| Base de datos | Supabase (PostgreSQL) | Estado persistente de jugadores |
| Hosting | GitHub Pages | Distribución del cliente |
| Assets estáticos | `game-data.js` | NPCs, datos inmutables |

El juego es **100% serverless**. No hay servidor de aplicación. Toda la lógica reside en el cliente HTML, y Supabase actúa como base de datos remota accesible directamente desde el navegador.

---

## ARQUITECTURA DE RED — LEY FUNDAMENTAL

### Modelo: Evento-Reactivo. Cero polling.

Inspirado en Ogame/Ikariam. El cliente **nunca consulta Supabase de forma periódica**. La red solo se toca en estos momentos:

| Cuándo | Qué operación |
|---|---|
| Login / carga inicial | `loadMyVillages`, `checkIncomingAttacks`, `updateLastSeen`, `processRecalls` |
| El jugador hace una acción | `flushVillage` (guardado inmediato) |
| Un `finish_at` llega a cero en el tick local | `resolveMissions` → `flushVillage` |
| Cambio de aldea activa | `checkIncomingAttacks` |
| El jugador minimiza/cierra la pestaña | `flushVillage` (visibilitychange) |
| Logout | `flushVillage` final |

**No existe ningún `setInterval` que llame a Supabase.**

### Por qué es correcto

Todas las colas (edificios, tropas, invocaciones, misiones) se guardan con un `finish_at` (timestamp ISO). El cliente calcula el estado actual comparando `finish_at` con `Date.now()`. No necesita preguntar al servidor — ya sabe cuándo llega cada cosa.

---

## EL TICK

```
setInterval(tick, 1000)  ← único loop del juego
```

`tick()` es **solo cálculo local en memoria**. Lo que hace cada segundo:

1. Resolver colas locales: `resolveQueue`, `resolveSummoningQueue`, `resolveTrainingQueue`
2. Si alguna cola completó → `scheduleSave()` (guarda el cambio)
3. Detectar si alguna misión tiene `finish_at <= now` → lanzar `resolveMissions` (única llamada de red reactiva)
4. Actualizar UI: recursos animados, contadores de misiones, barras de capacidad
5. Nada más.

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

- `_stateDirty`: flag que indica si hay cambios sin guardar. Solo `scheduleSave` lo pone a `true`, solo `flushVillage` lo pone a `false`.
- El debounce de 2s evita guardados duplicados cuando el jugador hace varias acciones seguidas.
- `isFlushing` + `pendingFlush`: evitan condiciones de carrera si llegan dos `flushVillage` solapados.
- **No hay autoSave en bucle.** El único guardado automático es el del `visibilitychange`.

---

## TABLAS SUPABASE

| Tabla | Contenido | Cuándo se escribe |
|---|---|---|
| `villages` | Estado completo de cada aldea (recursos, tropas, colas, edificios) | En cada `saveVillage` |
| `profiles` | Datos del jugador (username, XP, military_score, last_seen) | Al hacer acciones que cambian XP/score, y al login |
| `buildings` | Niveles de edificios por aldea | Dentro de `saveVillage` |
| `troops` | Tropas por aldea | Dentro de `saveVillage` |
| `creatures` | Criaturas por aldea | Dentro de `saveVillage` |
| `guest_troops` | Tropas de refuerzo en aldeas ajenas | `processRecalls` (al login) |
| `objectives` | Estado de objetivos NPC por jugador | Al completar batalla NPC |
| `messages` | Informes de batalla, espionaje, sistema | Al completar misiones |

---

## DATOS ESTÁTICOS — game-data.js

`game-data.js` contiene `NPC_CASTLES` (250 castillos NPC con sus stats). Es un archivo separado que debe cargarse **antes** del script principal.

**No modificar `game-data.js` sin actualizar este documento.**

Los datos de tropas (`TROOP_TYPES`) y criaturas (`CREATURE_TYPES`) están definidos dentro del HTML principal y son la fuente de verdad para todos los cálculos de combate, producción y capacidad.

---

## SISTEMA DE RECURSOS

Los recursos **nunca se calculan en tiempo real en Supabase**. El cálculo es:

```
recursos_actuales = recursos_en_BD + (produccion_por_hora × horas_transcurridas)
```

Donde `horas_transcurridas = (Date.now() - last_updated) / 3600000`.

- `calcRes(vs)` → calcula recursos actuales para la UI. **No escribe nada.**
- `snapshotResources(vs)` → congela el valor calculado en `vs.resources` antes de guardar.
- `saveVillage` llama a `snapshotResources` antes de escribir en Supabase.

**Nunca escribir `calcRes()` directamente en `state.resources` fuera de `snapshotResources`.** Causaría duplicación infinita de recursos en cada tick.

---

## MURALLA — MECÁNICA DE COMBATE

La muralla es un **escudo con HP propio**, no un bonus a las tropas.

- Nivel 1 = 500 HP de muralla, +500 HP por nivel (nivel 10 = 5.000 HP)
- En combate: el atacante destruye la muralla ronda a ronda antes de poder dañar tropas
- Mientras la muralla aguanta, los defensores sí pueden atacar
- Implementado en `simulateBattle()` con la variable `wallHP`

**No reimplementar la muralla como bonus de HP a tropas. Fue un error previo corregido en v0.95.**

---

## CRIATURAS — VISIBILIDAD Y REQUISITOS

- **Visibilidad**: controlada por el nivel de la Torre de Invocación (`torreLevel >= tier`)
- **Invocación**: requiere además tener invocadores del nivel adecuado (`invocadorLevel >= tier`)
- El jugador puede VER criaturas que no puede invocar (aparecen en gris con mensaje de requisito)

**No filtrar criaturas por `invocadorLevel` en `renderCreaturesList`. Solo filtrar por `torreLevel`.**

---

## CHANGELOG

### v0.98 — Modelo evento-reactivo (actual)
- **Eliminados todos los `setInterval` de red** (autoSave cada 60s, checkIncomingAttacks cada 30s, processRecalls cada 5min, updateLastSeen cada 5min)
- **`tick()` es ahora 100% local**: cero llamadas a Supabase dentro del tick
- **`resolveMissions` es reactivo**: solo se lanza cuando un `finish_at` llega a cero, no en polling
- **Guardado por eventos**: `scheduleSave()` solo se llama cuando el jugador hace algo o cuando una cola completa
- **Carga inicial one-shot**: `checkIncomingAttacks`, `updateLastSeen`, `updateOnlineCount`, `processRecalls` se llaman una sola vez al hacer login
- Añadido `_stateDirty` flag para evitar guardados innecesarios
- Añadido `_missionWatchScheduled` para evitar resoluciones de misión duplicadas

### v0.99 — Sliders, minimapa y borrar aldea
- **Bug sliders corregido**: `_previewWorker` ahora lee valores del DOM en lugar del state — eliminado el error "más aldeanos de los disponibles" al mover la 3ª barra
- **Mapa principal 15×15** (`MAP_VIEW = 7`, antes 10)
- **Minimapa 30×30**: canvas no interactivo junto al mapa. Colores: propio=cian, aliado=verde, enemigo=rojo, NPC=dorado. Encuadre dorado indica la zona visible en el mapa principal
- **Borrar aldea**: en zona de peligro del perfil. Requiere escribir nombre exacto de la aldea. Deshabilitado si es la única aldea. Borra en Supabase: buildings, troops, creatures, village

### v0.98 — Modelo evento-reactivo (sin polling)
- Eliminados todos los setInterval de red
- tick() es 100% local — cero Supabase
- resolveMissions reactivo: solo cuando finish_at llega a cero
- Carga one-shot al login: checkIncomingAttacks, updateLastSeen, updateOnlineCount, processRecalls

### v0.97 — Base de partida
- Juego funcional con polling cada 1s (resolveMissions), 30s (checkIncomingAttacks), 60s (autoSave), 5min (processRecalls)

### v0.95 — Correcciones de mecánicas
- Muralla reimplementada como escudo con HP propio (antes sumaba HP a tropas — incorrecto)
- Criaturas: visibilidad por `torreLevel`, no por `invocadorLevel`
- Provisiones no se restauran al volver de misión
- Military score suma todas las aldeas y criaturas del jugador
- Descripciones de edificios mejoradas con información correcta

---

## REGLA DE VERSIONADO — OBLIGATORIO EN CADA VERSIÓN

Cada vez que se genera una nueva versión del juego, **deben actualizarse los tres sitios siguientes** de forma coherente. Si no se actualizan los tres, la versión es inconsistente.

| Qué | Dónde | Ejemplo |
|---|---|---|
| **Nombre del archivo** | El propio `.html` | `epic-warriors-v0_98.html` |
| **Pestaña del navegador** | `<title>` en la línea ~7 del HTML | `<title>Epic Warriors Online v0.98</title>` |
| **Pie de página del juego** | `<div id="versionFooter">` en la línea ~10286 | `EPIC WARRIORS v0.98` |

**Formato de versión:** `v0.XX` con dos dígitos (v0.98, v0.99, v1.00...).
El nombre de archivo usa guión bajo: `v0_98`. El título y el footer usan punto: `v0.98`.

---

## REGLAS QUE NO SE DEBEN ROMPER

1. **Ningún `setInterval` puede llamar a Supabase.** Solo el tick visual (cálculo local) puede estar en un interval.
2. **`calcRes()` nunca escribe en `state.resources`.** Solo lee.
3. **`snapshotResources()` es la única función que congela recursos antes de guardar.**
4. **La muralla es un escudo con HP, no un bonus a tropas.**
5. **La visibilidad de criaturas depende de `torreLevel`, no de `invocadorLevel`.**
6. **`game-data.js` debe estar en el mismo directorio que el HTML** para que GitHub Pages lo sirva correctamente.
7. **Supabase es la única fuente de verdad persistente.** Nunca usar `localStorage` para estado de juego.
8. **GitHub Pages es el único hosting.** No introducir dependencias de servidor.

---

## PARTES DEL SISTEMA QUE NO DEBEN MODIFICARSE SIN REVISIÓN

| Componente | Por qué |
|---|---|
| `saveVillage` / `flushVillage` | Lógica de guardado delicada con guards de concurrencia |
| `calcRes` / `snapshotResources` | Cualquier error aquí duplica o destruye recursos |
| `simulateBattle` / `executeTurn` | Motor de combate, cambios afectan balance global |
| `resolveQueue` / `resolveMissions` | Lógica de colas con timestamps — errores corrompen estado |
| Esquema de tablas Supabase | Cambios de columnas requieren migración SQL coordinada |
| `TROOP_TYPES` / `CREATURE_TYPES` | Son fuente de verdad para combate, coste y producción |
