# EPIC WARRIORS — ESTADO DEL PROYECTO v1.82
*Última actualización: sesión v1.82*

---

## STACK
- **Frontend:** Vanilla JS, GitHub Pages, módulos ES
- **Backend:** Supabase (PostgreSQL + RLS)
- **Modelo:** Server-authoritative (Ogame-style desde v1.66)

---

## PROBLEMA RAÍZ RESUELTO EN v1.82
**Síntoma:** Si el jugador pulsaba F5 inmediatamente después de construir/entrenar/mover, la acción se perdía.

**Causa:** Las funciones que llaman RPCs de servidor (`startBuild`, `cancelBuild`, `startRecruitment`, `startSummoning`) actualizaban el estado local y llamaban `setSave('saved')`, pero NO llamaban `flushVillage()` inmediatamente. La columna `build_queue` (y `training_queue`) en Supabase no se escribía hasta el siguiente auto-save debounced.

**Solución:** Añadir `await flushVillage()` justo después de `setSave('saved')` en cada una de estas funciones.

---

## FIXES v1.82 — POR ARCHIVO

### ✅ game-ui.js — COMPLETADO

| Función | Fix | Estado |
|---|---|---|
| `startBuild` | Añadir `showNotif(...)` correcto + `await flushVillage()` | ✅ Aplicado y verificado |
| `cancelBuild` | Añadir `await flushVillage()` tras `setSave('saved')` | ✅ Aplicado y verificado |

**Código correcto en startBuild (líneas ~48-53):**
```js
showNotif('Construyendo ' + (def ? def.name : id) + ' nivel ' + (lvl + 1) + '...', 'ok');
setSave('saved');
await flushVillage(); // v1.82: persiste build_queue inmediatamente
tick();
renderBuildings(calcRes(activeVillage.state));
renderQueue(activeVillage.state);
```

**Código correcto en cancelBuild:**
```js
showNotif('Construcción cancelada. Recursos devueltos.', 'ok');
setSave('saved');
await flushVillage(); // v1.82: persiste build_queue=null inmediatamente
tick();
renderBuildings(calcRes(activeVillage.state));
renderQueue(activeVillage.state);
```

---

### ⏳ game-troops.js — PENDIENTE

| Función | Fix necesario | Estado |
|---|---|---|
| `startRecruitment` | Añadir `await flushVillage()` tras `setSave('saved')` | ❌ Pendiente |
| `startSummoning` | Añadir `await flushVillage()` tras `setSave('saved')` | ❌ Pendiente |

---

### ✅ Funciones que YA tenían flushVillage correcto (no tocar)
- `executeMoveClick` → `await flushVillage()` ✅
- `executeTransportClick` → `await flushVillage()` ✅
- `confirmMoveGuestTroops` → `await flushVillage()` ✅
- `foundVillage` → `flushVillage()` (no-await, aceptable) ✅

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
4. await