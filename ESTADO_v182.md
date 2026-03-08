# EPIC WARRIORS — ESTADO DEL PROYECTO v1.82
*Última actualización: sesión v1.82 ronda 2*

---

## STACK
- **Frontend:** Vanilla JS, GitHub Pages, módulos ES
- **Backend:** Supabase (PostgreSQL + RLS)
- **Modelo:** Server-authoritative (Ogame-style desde v1.66)

---

## PROBLEMA RAÍZ RESUELTO EN v1.82
**Síntoma:** Si el jugador pulsaba F5 inmediatamente después de construir/entrenar/invocar/mejorar herrería, la acción se perdía.

**Causa:** Las funciones que llaman RPCs de servidor actualizaban el estado local y llamaban `setSave('saved')` o `scheduleSave()`, pero NO llamaban `flushVillage()` inmediatamente. La columna separada (build_queue, training_queue, summoning_queue) en Supabase no se escribía hasta el siguiente auto-save debounced (2s).

**Solución:** Añadir `await flushVillage()` justo después de `setSave('saved')` en cada una de estas funciones.

---

## FIXES v1.82 — POR ARCHIVO

### ✅ game-ui.js — COMPLETADO

| Función | Fix | Estado |
|---|---|---|
| `startBuild` | `await flushVillage()` tras `setSave('saved')` | ✅ Ronda 1 |
| `cancelBuild` | `await flushVillage()` tras `setSave('saved')` | ✅ Ronda 1 |

---

### ✅ game-troops.js — COMPLETADO

| Función | Fix | Estado |
|---|---|---|
| `startRecruitment` | `scheduleSave()` → `await flushVillage()` | ✅ Ronda 2 |
| `startSummoning` | `scheduleSave()` → `await flushVillage()` | ✅ Ronda 2 |
| `cancelTrainingQueue` | `await flushVillage()` añadido tras `setSave('saved')` | ✅ Ronda 2 |

---

### ✅ game-smithy.js — COMPLETADO

| Función | Fix | Estado |
|---|---|---|
| `upgradeSmithyItem` | `await flushVillage()` añadido tras `setSave('saved')` | ✅ Ronda 2 |

---

### ✅ game-combat.js — COMPLETADO

| Función | Fix | Estado |
|---|---|---|
| `cancelSummoningQueue` | `await flushVillage()` añadido antes de `loadMyVillages()` | ✅ Ronda 2 |

---

### ✅ Funciones que YA tenían flushVillage correcto (no tocar)
- `executeMoveClick` → `await flushVillage()` ✅
- `executeTransportClick` → `await flushVillage()` ✅
- `confirmMoveGuestTroops` → `await flushVillage()` ✅
- `foundVillage` → `flushVillage()` ✅
- `startMission` → `await flushVillage()` ✅
- `launchCaveAttack` → `await flushVillage()` ✅
- `saveRefugio` → `flushVillage()` ✅

---

## REGLAS DE ARQUITECTURA CRÍTICAS

### Rule 28
`startBuild` / `startRecruitment` / `startSummoning` **NO deben llamar `flushVillage` ANTES de la RPC** — causaría que el servidor vea `last_updated=NOW()` con recursos viejos → falso "Recursos insuficientes".

### Rule 29
`flushVillage` / `save_village_client` **NO escribe resources** (server-authoritative). Solo escribe: `build_queue`, `training_queue`, `mission_queue`, `aldeanos_assigned`, `refugio`, metadata.

### Flujo correcto
```
1. RPC al servidor (start_build_secure, etc.)
2. Aplicar newState al estado local
3. setSave('saved')
4. await flushVillage()  ← PERSISTENCIA INMEDIATA
5. tick() + render
```