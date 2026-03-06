# EPIC WARRIORS — REGISTRO DE AUDITORÍA
> Última actualización: v1.74

Este archivo es la fuente de verdad sobre qué archivos han sido auditados, en qué versión, y qué bugs se encontraron y corrigieron. Actualizarlo en la misma entrega que introduce los cambios.

---

## ESTADO GLOBAL

| Archivo | Versión auditada | Bugs hallados | Estado |
|---|---|---|---|
| `game-combat.js` | v1.72 → v1.74 | 8 | ✅ Corregido |
| `game-troops.js` | v1.73 → v1.74 | 5 | ✅ Corregido |
| `game-engine.js` | — | — | 🔲 Pendiente |
| `game-ui.js` | — | — | 🔲 Pendiente |
| `game-caves.js` | — | — | 🔲 Pendiente |
| `game-admin.js` | — | — | 🔲 Pendiente |
| `game-social.js` | — | — | 🔲 Pendiente |
| `game-smithy.js` | — | — | 🔲 Pendiente |
| `game-auth.js` | — | — | 🔲 Pendiente |
| `index.html` | — | — | 🔲 Pendiente |

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

---

## REGLAS DEL PROCESO DE AUDITORÍA

1. Siempre **2 pasadas** por archivo — nunca presentar lista tras una sola.
2. Confirmar lista con el usuario antes de generar el archivo corregido.
3. Actualizar este archivo + `ARQUITECTURA.md` + `REFERENCIA_PARA_IA.md` en la misma entrega.
4. Máximo 2 archivos por turno (regla workflow).
5. Orden recomendado por riesgo: `game-engine.js` → `game-ui.js` → `index.html` → `game-caves.js` → `game-admin.js` → `game-social.js` → `game-smithy.js` → `game-auth.js`.
