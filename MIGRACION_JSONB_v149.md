# MIGRACIÓN A JSON BLOB — Epic Warriors v1.49

## Contexto
Epic Warriors es un juego de estrategia browser-based (JS + Supabase, 100% serverless).
Actualmente los datos de cada aldea se guardan en **5 tablas separadas** (villages, troops, creatures, buildings, resources) y se ensamblan/desensamblan en un objeto `state` en memoria en cada load/save. Esto causa bugs constantes (ej: `guardiancueva` no es columna de `creatures` pero sí existe en `state.creatures`).

## Objetivo
Migrar a una **sola columna `state jsonb`** en la tabla `villages`. Un read, un write, cero ensamblaje.

## Estado actual de tablas

```
villages: id, owner_id, name, cx, cy, build_queue, mission_queue, summoning_queue, training_queue, last_aldeano_at, refugio, created_at
troops: village_id + una columna por tipo de tropa (lancero, arquero, etc.)
creatures: village_id + una columna por tipo de criatura (dragon, fenix, etc.) — SIN guardiancueva
buildings: village_id + una columna por edificio (aserradero, cantera, etc.)
resources: village_id, madera, piedra, hierro, prov, esencia, w_madera, w_piedra, w_hierro, w_prov, w_esencia, last_update
caves: id, cx, cy, status, owner_id, village_id
```

## Estructura objetivo del state jsonb

```json
{
  "resources": { "madera": 500, "piedra": 300, "hierro": 100, "provisiones": 0, "esencia": 0, "aldeanos": 50 },
  "aldeanos_assigned": { "madera": 0, "piedra": 0, "hierro": 0, "provisiones": 0, "esencia": 0 },
  "troops": { "aldeano": 50, "lancero": 0, "arquero": 0, ... },
  "creatures": { "dragon": 0, "fenix": 0, "guardiancueva": 3, ... },
  "buildings": { "aserradero": { "level": 1 }, "cantera": { "level": 1 }, ... },
  "build_queue": null,
  "mission_queue": [],
  "summoning_queue": [],
  "training_queue": [],
  "last_updated": "ISO string",
  "last_aldeano_at": null,
  "refugio": {},
  "_aldeanos_total_mode": true
}
```

## Plan por fases

### Fase 1 — SQL
- `ALTER TABLE villages ADD COLUMN state jsonb;`
- Script SQL para ensamblar state desde las 5 tablas para cada aldea existente
- Mover build_queue, mission_queue, summoning_queue, training_queue, last_aldeano_at, refugio DENTRO del state
- Aldeas fantasma también reciben state

### Fase 2 — index.html (el más crítico)
- `loadMyVillages()` → un solo select, state viene directo del jsonb
- `saveVillage()` → un solo update({ state: ... })
- `refreshMilitaryScore()` → leer state.troops/creatures directamente del jsonb
- Self-healing simplificado (si state es null, crear default)
- Eliminar todo el mapping SQL ↔ state

### Fase 3 — game-engine.js
- Espionaje jugador real → leer villages.state (ya no hay dos caminos)
- Espionaje/ataque fantasma → mismo camino (también tienen state)
- Resultado combate en fantasma → update state jsonb directamente
- Eliminar cargas desde tablas troops/creatures/buildings/resources separadas

### Fase 4 — game-admin.js
- Crear fantasma → insert con state jsonb
- Borrar usuario → solo eliminar de villages (no limpiar 5 tablas)
- RPCs de admin simplificadas

### Fase 5 — game-caves.js + game-troops.js
- Eliminar excepciones guardiancueva (ya vive naturalmente en state.creatures)
- Eliminar cross-checks _cavesCache ↔ state (state es fuente de verdad directa)
- Simplificar saveVillage (guardiancueva se guarda igual que cualquier criatura)

### Fase 6 — Limpieza
- DROP tables troops, creatures, buildings, resources (o renombrar a _legacy)
- DROP trigger trigger_create_creatures
- DROP columnas de colas de villages (build_queue, mission_queue, etc.) — ahora dentro de state
- Actualizar RLS policies

## Archivos a modificar (pedir de uno en uno)
1. index.html — load/save/score
2. game-engine.js — espionaje + combate
3. game-admin.js — fantasmas + borrado
4. game-caves.js — simplificar excepciones
5. game-troops.js — eliminar cross-checks
6. game-combat.js — verificar accesos a tablas

## Reglas críticas que NO cambian
- `calcRes()` nunca escribe en state.resources
- `snapshotResources()` congela antes de guardar
- Ningún setInterval llama a Supabase
- game-globals.js se carga primero
- Orden de carga de scripts fijo

## Documentos de referencia
- REFERENCIA_PARA_IA.md — reglas del proyecto
- ARQUITECTURA.md — arquitectura completa con historial de versiones
- Ambos necesitan actualización tras la migración
