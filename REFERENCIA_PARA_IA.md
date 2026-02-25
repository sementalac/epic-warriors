# EPIC WARRIORS — REFERENCIA PARA DESARROLLADORES IA

## 🤖 LEE ESTO PRIMERO — INSTRUCCIONES PARA LA IA

Este documento y `ARQUITECTURA.md` son todo lo que necesitas para empezar.
El usuario NO sube los archivos del juego al inicio. El flujo es este:

1. El usuario describe qué quiere cambiar
2. **Tú le dices qué archivo(s) necesitas que te suba** (mínimo posible)
3. El usuario sube ese(s) archivo(s)
4. Haces el cambio
5. **Entregas solo los archivos que han cambiado** — el usuario reemplaza solo esos en su carpeta

### Archivos que el usuario tiene en su carpeta local y en GitHub Pages
Todos en el mismo directorio — mover a otra carpeta rompe el juego:

| Archivo | Qué contiene | Cambia cuando... |
|---|---|---|
| `epic-warriors-v1_XX.html` | Engine + UI + globals + HTML | Cambios en lógica, UI, edificios, combate |
| `epic-warriors.css` | Todos los estilos | Cambios visuales |
| `game-data.js` | NPC_CASTLES — 250 castillos NPC | Casi nunca |
| `game-simulator.js` | `renderSimulator()` — simulador de batalla | Cambios en el simulador |
| `game-admin.js` | Todo el panel de administración | Cambios en funciones admin |
| `REFERENCIA_PARA_IA.md` | Este documento | Al actualizar docs |
| `ARQUITECTURA.md` | Reglas de arquitectura | Al actualizar docs |

### Qué pedir según el cambio solicitado
| Si el usuario quiere... | Pide... |
|---|---|
| Cambiar estilos, colores, layout | `epic-warriors.css` |
| Cambiar algo del panel admin | `game-admin.js` |
| Cambiar el simulador de batalla | `game-simulator.js` |
| Cambiar edificios, costes, lógica de juego, UI | `epic-warriors-v1_XX.html` |
| No está claro qué toca | Pregunta antes de pedir archivos |

### Regla de versionado — SIEMPRE al entregar el HTML
Cuando el HTML cambia, actualizar el número de versión en 3 sitios y en los query strings:
```html
<script src="game-simulator.js?v=1.XX"></script>
<script src="game-admin.js?v=1.XX"></script>
<link rel="stylesheet" href="epic-warriors.css?v=1.XX">
```
Y en: `<title>`, `#versionFooter`, nombre del archivo.

---

## 📁 ESTRUCTURA DE ARCHIVOS (desde v1.31)

| Archivo | Contenido | Líneas aprox |
|---|---|---|
| `epic-warriors-v1_XX.html` | HTML + JS principal (engine, UI, globals) | ~9.300 |
| `epic-warriors.css` | Todos los estilos | ~2.300 |
| `game-data.js` | NPC_CASTLES — datos estáticos (250 castillos) | inmutable |
| `game-simulator.js` | `renderSimulator()` — simulador de batalla en ventana nueva | ~840 |
| `game-admin.js` | Todo el panel admin (funciones + RPCs Supabase) | ~860 |

**Regla de carga** (orden en `<head>`):
```html
<script src="game-data.js"></script>
<script src="game-simulator.js"></script>
<script src="game-admin.js"></script>
<link rel="stylesheet" href="epic-warriors.css">
```

**Cuando trabajes con IA, pasa solo los archivos afectados + este .md + ARQUITECTURA.md.**

---




El número de versión vive en **3 sitios del HTML principal**. Los módulos externos NO llevan versión en el nombre — la versión se controla desde el HTML con query string en los imports:

```html
<script src="game-simulator.js?v=1.XX"></script>
<script src="game-admin.js?v=1.XX"></script>
<link rel="stylesheet" href="epic-warriors.css?v=1.XX">
```

Los 3 sitios en el HTML:
1. Nombre archivo: `epic-warriors-v1_XX.html`
2. `<title>Epic Warriors Online v1.XX</title>`
3. `<div id="versionFooter">EPIC WARRIORS v1.XX</div>`

**Cómo buscar:** `grep -n "v1.XX\|v1_XX" epic-warriors-v1_XX.html`

---

## 🔍 ESTRUCTURA DEL HTML — MAPEO RÁPIDO

```
Línea ~7:       <title>
Línea ~16:      <link rel="stylesheet" href="epic-warriors.css">
Línea ~3305:    <script> — inicio JS principal
Línea ~3310:    CONFIG (Supabase keys, credenciales dev)
Línea ~3340:    Bloque canónico de variables globales
Línea ~3379:    const TROOP_TYPES
Línea ~3463:    const CREATURE_TYPES
Línea ~3587:    const BUILDINGS
Línea ~3783:    function phasedVal + almacenCapForLevel + getCapacity
Línea ~3800:    getBarracksCapacity, getBarracksUsed
Línea ~3900:    tick(), calcRes(), snapshotResources()
Línea ~4200:    saveVillage(), flushVillage(), scheduleSave()
Línea ~4500:    resolveMissions(), resolveQueue(), etc.
Línea ~6500:    loadMyVillages(), loadWorld(), login/logout
Línea ~7400:    renderBuildings(), renderMap(), renderRanking()
Línea ~8500:    Modales de ataque, movimiento, transporte
Línea ~9300:    Fin del JS principal — </script>
Línea ~9310:    HTML visible (header, sidebar, pages)
Línea ~9475:    Admin overlay HTML (inline, no en game-admin.js)
Línea ~9610:    motdModal, versionFooter
```

---

## 📦 QUÉ TOCA CADA ARCHIVO

### `epic-warriors-v1_XX.html`
Todo lo que no está en los módulos. Contiene:
- Globals, config, TROOP_TYPES, CREATURE_TYPES, BUILDINGS
- Motor del juego: tick, calcRes, saveVillage, resolveMissions, simulateBattle
- UI: renderBuildings, renderMap, renderRanking, renderRecursos, modales
- Login/logout, loadMyVillages, loadWorld
- HTML visible: sidebar, pages, header

### `epic-warriors.css`
Solo estilos. No tiene lógica. Si añades un elemento nuevo con clase nueva, añade su estilo aquí.

### `game-simulator.js`
Contiene únicamente `renderSimulator()`. Esta función abre una ventana nueva con el simulador de batalla embebido (HTML+CSS+JS autónomo via `doc.write`).
- **Depende de:** `TROOP_TYPES`, `CREATURE_TYPES` (globals del HTML principal)
- **No tocar** sin revisar que los tipos de tropa siguen siendo los mismos

### `game-admin.js`
Todas las funciones del panel de administración. Solo accesible para `sementalac@gmail.com`.
- **Depende de:** `sbClient`, `currentUser`, `activeVillage`, `myVillages`, `showNotif`, `TROOP_TYPES`, `escapeHtml`, `escapeJs`, `fmt`, `loadMyVillages`, `switchVillage`, `getBarracksCapacity`
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

### `game-data.js`
Inmutable. Contiene `NPC_CASTLES` (250 castillos con stats de combate). No modificar.

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
grep -n "function phasedVal" epic-warriors-v1_XX.html
grep -n "const BUILDINGS" epic-warriors-v1_XX.html
grep -n "function tick" epic-warriors-v1_XX.html
```

### Paso 2: Hacer el cambio
- **Cambio en estilos** → editar `epic-warriors.css`
- **Cambio en admin** → editar `game-admin.js`
- **Cambio en simulador** → editar `game-simulator.js`
- **Cambio en engine/UI** → editar `epic-warriors-v1_XX.html`

### Paso 3: Actualizar versionado (OBLIGATORIO)
```bash
# En el HTML: título, footer, query strings de imports
grep -n "v1.XX\|v1_XX" epic-warriors-v1_XX.html | head -5
```

### Paso 4: Validar
```bash
grep -n "Math.pow(1\.5, l)\|Math.pow(1\.8, l)\|Math.pow(1\.9, l)" epic-warriors-v1_XX.html
grep -n "1000 \* Math.pow(2, lvl)" epic-warriors-v1_XX.html
# Resultado esperado: vacío
```

---

## 🗂️ TABLA DE UBICACIONES IMPORTANTES

| Qué buscar | Dónde | Cómo buscar |
|---|---|---|
| Config Supabase | HTML ~3310 | `grep -n "SUPABASE_URL\|supabaseUrl"` |
| Globals del juego | HTML ~3340 | `grep -n "^    let "` |
| TROOP_TYPES | HTML ~3379 | `grep -n "const TROOP_TYPES"` |
| BUILDINGS | HTML ~3587 | `grep -n "const BUILDINGS"` |
| phasedVal | HTML ~3783 | `grep -n "function phasedVal"` |
| almacenCapForLevel | HTML ~3783 | `grep -n "function almacenCapForLevel"` |
| tick() | HTML ~3900 | `grep -n "function tick()"` |
| saveVillage | HTML ~4200 | `grep -n "function saveVillage"` |
| simulateBattle | HTML ~4800 | `grep -n "function simulateBattle"` |
| renderSimulator | game-simulator.js | línea 4 |
| Panel admin JS | game-admin.js | línea 6 |
| Estilos globales | epic-warriors.css | `:root {` |

---

## ✅ VALIDACIÓN POST-CAMBIO

**1. Versionado correcto**
```bash
grep "v1.XX\|v1_XX" epic-warriors-v1_XX.html | head -5
```

**2. No quedan fórmulas viejas**
```bash
grep -n "Math.pow(1\.5, l)\|Math.pow(1\.8, l)\|1000 \* Math.pow(2, lvl)" epic-warriors-v1_XX.html
```

**3. Funciones críticas siguen presentes**
```bash
grep -n "function phasedVal\|function almacenCapForLevel\|function tick\|function saveVillage" epic-warriors-v1_XX.html
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

### 🟡 CUIDADO
- `resolveMissions()` — Lógica de timestamps, errores corrompen estado
- `resolveQueue()` / `resolveSummoningQueue()` / `resolveTrainingQueue()`
- `getBarracksUsed()` — Cálculo de tropas presentes vs en misión
- `escapeHtml()` para HTML renderizado, `escapeJs()` para onclick

### ✅ PERMITIDO TOCAR LIBREMENTE
- Estilos en `epic-warriors.css`
- Funciones en `game-admin.js`
- `renderSimulator()` en `game-simulator.js`
- UI/UX (botones, colores, layouts)
- Bases de `phasedVal` (ajustar balance de costes)
- Descripciones de edificios

---

## 📊 HISTORIAL DE CAMBIOS RELEVANTES

### v1.31 — Separación en módulos + limpieza
- `epic-warriors.css` separado del HTML (~2.300 líneas de estilos)
- `game-simulator.js` — `renderSimulator()` extraído (~840 líneas)
- `game-admin.js` — todas las funciones admin extraídas (~860 líneas)
- 24 comentarios triviales eliminados
- 303 líneas de CSS sin uso eliminadas
- HTML principal reducido de 13.628 a ~9.300 líneas (−32%)

### v1.30 — RPCs admin para bypass RLS
- 5 funciones admin migradas a RPCs con SECURITY DEFINER
- `loadAdminVillages`, `selectAdminVillage`, `adminApplyUniversal`, `adminRepairAll`, `adminRepairConfirm`

### v1.29 — Sistema de costes y capacidad unificados
- Nueva función `phasedVal`: curva ×2/×1.30/×1.05
- Nueva función `almacenCapForLevel`: tres fases
- Eliminados todos los multiplicadores individuales por edificio

---

## 📝 CHECKLIST ANTES DE ENTREGAR VERSIÓN

- [ ] Nombre archivo: `epic-warriors-v1_XX.html`
- [ ] `<title>Epic Warriors Online v1.XX</title>`
- [ ] `<div id="versionFooter">EPIC WARRIORS v1.XX</div>`
- [ ] Query strings de imports actualizados: `?v=1.XX`
- [ ] `phasedVal` y `almacenCapForLevel` siguen en el HTML
- [ ] `grep -n "Math.pow(1\.5, l)\|1000 \* Math.pow(2, lvl)"` → vacío
- [ ] Abrir en navegador, F12, cero errores rojos
- [ ] NO se tocó tick(), saveVillage(), simulateBattle()
- [ ] Supabase sigue funcionando

---

**Última actualización:** v1.31
**Archivos del proyecto:** epic-warriors-v1_XX.html · epic-warriors.css · game-data.js · game-simulator.js · game-admin.js
