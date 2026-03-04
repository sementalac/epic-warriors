// ============================================================
// EPIC WARRIORS — game-caves.js  v1.48
// Sistema de Cuevas: NPCs especiales en el mapa cuya criatura
// guardiana puede ser capturada y añadida al ejército del jugador.
//
// v1.48: Fix loadAdminCaves — muestra ubicación real del guardián
//        (coordenadas de la aldea actual o "En movimiento")
//
// v1.47: Criaturas cazadas completamente funcionales
//        - renderCaughtCreatures() en game-troops.js
//        - Apartado visual separado para guardianes capturados
//        - Garantía robusta de guardiancueva en CREATURE_TYPES
//
// Flujo:
//   1. Siempre hay CAVES_TOTAL cuevas en total (wild + captured)
//   2. Wild  → visible en mapa, atacable por cualquier jugador
//   3. Attack win → guardián pasa a creatures del jugador (guardiancueva)
//   4. Si el guardián muere en combate → cave reaparece como wild en
//      una posición aleatoria libre del mapa
//
// Tabla Supabase requerida:
//   CREATE TABLE caves (
//     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     cx          INT  NOT NULL,
//     cy          INT  NOT NULL,
//     status      TEXT NOT NULL DEFAULT 'wild',  -- 'wild' | 'captured'
//     owner_id    UUID REFERENCES profiles(id)  ON DELETE SET NULL,
//     village_id  UUID REFERENCES villages(id)  ON DELETE SET NULL,
//     created_at  TIMESTAMPTZ DEFAULT NOW()
//   );
//   CREATE INDEX ON caves(status);
//   CREATE INDEX ON caves(owner_id);
//
// Dependencias: sbClient, currentUser, activeVillage,
//               CREATURE_TYPES, allVillages, MAP_SIZE,
//               simulateBattle, sendSystemReport, showNotif,
//               generateBattleReport (game-combat.js)
// ============================================================

const CAVES_TOTAL = 10;   // Nº total de cuevas que existen en el mundo
const CAVE_XP = 800;  // XP que da vencer al guardián

// Lookup global de cuevas wild para el mapa — se rellena en loadCaves()
var cavesLookup = {};  // key: "cx,cy" → cave object
var cavesLoaded = false;
var _cavesCache = [];   // array completo (wild + captured)

// ─────────────────────────────────────────────────────────────
// DEFINICIÓN DEL GUARDIÁN — en game-constants.js debes añadir:
//
//   guardiancueva: {
//     name: 'Guardián de la Cueva', icon: '🧿', tier: 5,
//     isCaveGuardian: true,
//     attackChance: 17, hp: 200, attacksPerTurn: 2, damage: 38,
//     defense: 17, armor: 0, weapon: 0, dexterity: 17,
//     speed: 140, capacity: 0,
//     summonersNeeded: 0,   // No se invoca — se captura
//     cost: { esencia: 0 }, time: 0,
//     desc: 'Guardián ancestral de una cueva mágica. Solo puede obtenerse venciendo en la cueva. Si muere, desaparece para siempre.'
//   }
//
// Si no quieres tocar game-constants.js, se define aquí como fallback:
if (typeof CREATURE_TYPES !== 'undefined' && !CREATURE_TYPES.guardiancueva) {
  CREATURE_TYPES.guardiancueva = {
    name: 'Guardián de la Cueva', icon: '🧿', tier: 5,
    isCaveGuardian: true,
    attackChance: 17, hp: 200, attacksPerTurn: 2, damage: 38,
    defense: 17, armor: 0, weapon: 0, dexterity: 17,
    speed: 140, capacity: 0,
    summonersNeeded: 0,
    cost: { esencia: 0 }, time: 0,
    desc: 'Guardián ancestral de una cueva mágica. Solo puede obtenerse venciendo en la cueva. Si muere, desaparece para siempre.'
  };
}

// ─────────────────────────────────────────────────────────────
// CARGA DE CUEVAS DESDE SUPABASE
// ─────────────────────────────────────────────────────────────

async function loadCaves(force) {
  if (cavesLoaded && !force) return;
  try {
    var r = await sbClient.from('caves').select('*').order('created_at');
    if (r.error) {
      if (r.error.code === '42P01') {
        console.warn('[Caves] Tabla "caves" no existe. Créala con el SQL del header de game-caves.js');
        cavesLoaded = true;
        return;
      }
      throw r.error;
    }

    _cavesCache = r.data || [];
    _rebuildCavesLookup();
    cavesLoaded = true;

    // Si hay menos cuevas wild de las necesarias, completar hasta CAVES_TOTAL wild
    var wildCount = _cavesCache.filter(function (c) { return c.status === 'wild'; }).length;
    var needSpawn = CAVES_TOTAL - wildCount;
    if (needSpawn > 0) {
      await _spawnCaves(needSpawn);
    }
  } catch (e) {
    console.warn('[Caves] loadCaves error:', e.message || e);
  }
}

function _rebuildCavesLookup() {
  cavesLookup = {};
  _cavesCache.forEach(function (c) {
    if (c.status === 'wild') {
      cavesLookup[c.cx + ',' + c.cy] = c;
    }
  });
}

// ─────────────────────────────────────────────────────────────
// SPAWN DE CUEVAS NUEVAS
// ─────────────────────────────────────────────────────────────

async function _spawnCaves(count) {
  var occupied = new Set();

  // Coordenadas ya ocupadas: aldeas y cuevas existentes
  if (typeof allVillages !== 'undefined') {
    allVillages.forEach(function (v) { occupied.add(v.x + ',' + v.y); });
  }
  if (typeof NPC_CASTLES !== 'undefined') {
    NPC_CASTLES.forEach(function (n) { occupied.add(n.x + ',' + n.y); });
  }
  _cavesCache.forEach(function (c) { occupied.add(c.cx + ',' + c.cy); });

  var ms = typeof MAP_SIZE !== 'undefined' ? MAP_SIZE : 200;
  var rows = [];
  var tries = 0;

  while (rows.length < count && tries < 2000) {
    tries++;
    var cx = Math.floor(Math.random() * (ms - 4)) + 3;  // margen de 3 casillas del borde
    var cy = Math.floor(Math.random() * (ms - 4)) + 3;
    var key = cx + ',' + cy;

    // Mínima separación de 5 casillas entre cuevas
    var tooClose = rows.some(function (r) {
      return Math.abs(r.cx - cx) < 5 && Math.abs(r.cy - cy) < 5;
    });
    if (occupied.has(key) || tooClose) continue;

    occupied.add(key);
    rows.push({ cx: cx, cy: cy, status: 'wild' });
  }

  if (rows.length === 0) return;

  try {
    var ins = await sbClient.from('caves').insert(rows).select();
    if (!ins.error && ins.data) {
      ins.data.forEach(function (c) {
        _cavesCache.push(c);
        cavesLookup[c.cx + ',' + c.cy] = c;
      });
    }
  } catch (e) {
    console.warn('[Caves] _spawnCaves error:', e.message || e);
  }
}

// ─────────────────────────────────────────────────────────────
// MAPA — RENDERIZADO DE CELDAS DE CUEVA
// Se llama desde renderMap() de game-ui.js
// ─────────────────────────────────────────────────────────────

// Devuelve el objeto cueva en una coordenada (solo wild)
function getCaveAt(cx, cy) {
  return cavesLookup[cx + ',' + cy] || null;
}

// Renderiza la celda de cueva en el mapa
function renderCaveCell(cell, cave) {
  cell.classList.add('cave-wild');
  cell.title = '[' + cave.cx + ',' + cave.cy + '] ⛏️ Cueva salvaje — ¡ataca para capturar al guardián!';

  // Gradiente de color según la "personalidad" de la cueva (basada en su id)
  var colors = [
    { bg: 'rgba(120,60,20,.55)', border: '#8B4513', glyph: '🟫' },   // marrón
    { bg: 'rgba(80,20,120,.55)', border: '#7B2D8B', glyph: '🟣' },    // púrpura
    { bg: 'rgba(20,80,120,.55)', border: '#1E6B9B', glyph: '🔵' },    // azul
    { bg: 'rgba(20,110,60,.55)', border: '#1A7A3A', glyph: '🟢' },    // verde
    { bg: 'rgba(160,60,10,.55)', border: '#B04010', glyph: '🟠' }     // naranja
  ];
  var idx = (cave.id ? cave.id.charCodeAt(0) % colors.length : 0);
  var color = colors[idx];

  cell.style.background = color.bg;
  cell.style.border = '1.5px solid ' + color.border;
  cell.style.borderRadius = '4px';
  cell.style.position = 'relative';
  cell.innerHTML =
    '<div style="font-size:1rem;line-height:1;filter:drop-shadow(0 0 3px ' + color.border + ');">⛏️</div>'
    + '<div style="position:absolute;bottom:1px;right:2px;font-size:.45rem;opacity:.85;">' + color.glyph + '</div>';
}

// ─────────────────────────────────────────────────────────────
// PANEL LATERAL DEL MAPA — click en cueva
// ─────────────────────────────────────────────────────────────

function selectCave(cave, x, y) {
  var panel = document.getElementById('mapPanel');
  var title = document.getElementById('mapPanelTitle');
  var sub = document.getElementById('mapPanelSub');
  var actions = document.getElementById('mapActions');
  panel.classList.add('show');

  var guardian = (typeof CREATURE_TYPES !== 'undefined') ? CREATURE_TYPES.guardiancueva : null;

  title.innerHTML = '⛏️ Cueva Salvaje <span style="font-size:.75rem;color:var(--dim);">[' + x + ', ' + y + ']</span>';

  var guardianStats = guardian
    ? '❤️ ' + guardian.hp + ' PG &nbsp;·&nbsp; ⚔️ ' + guardian.damage + ' daño (×' + guardian.attacksPerTurn + ') &nbsp;·&nbsp; 🛡️ ' + guardian.defense + ' def'
    : '';

  sub.innerHTML =
    '<div style="color:var(--gold);font-size:.78rem;margin-bottom:4px;">🧿 Guardián de la Cueva te espera</div>'
    + '<div style="font-size:.68rem;color:var(--dim);">' + guardianStats + '</div>'
    + '<div style="font-size:.65rem;color:var(--accent);margin-top:4px;">✨ Si lo vences, se une a tu ejército. Si muere en batalla, desaparece para siempre.</div>';

  var inRange = (typeof isInTorreRange === 'function') ? isInTorreRange(x, y) : true;

  if (!inRange) {
    actions.innerHTML = '<span style="color:var(--danger);font-size:.72rem;">⚠ Fuera de alcance — mejora la Torre de Vigía</span>';
    return;
  }

  // ── v1.48: Sin límite de guardianes — se pueden capturar tantos como cuevas haya
  var currentGuardians = _countPlayerCaveGuardians();

  actions.innerHTML =
    '<button class="map-action-btn atk" onclick="openCaveAttackModal(\'' + cave.id + '\',' + x + ',' + y + ')">⚔️ Atacar la Cueva</button>'
    + (currentGuardians > 0
      ? '<div style="font-size:.62rem;color:var(--gold);margin-top:6px;">🧿 Guardianes capturados: ' + currentGuardians + '</div>'
      : '');
}

// Cuenta guardianes capturados en la aldea activa (incluye los que están en misión)
function _countPlayerCaveGuardians() {
  if (!activeVillage || !activeVillage.state) return 0;
  var inBase = (activeVillage.state.creatures && activeVillage.state.creatures.guardiancueva) || 0;
  var inMission = 0;
  (activeVillage.state.mission_queue || []).forEach(function (m) {
    if (m.troops && (m.troops.guardiancueva || 0) > 0) inMission += m.troops.guardiancueva;
  });
  return inBase + inMission;
}

// ─────────────────────────────────────────────────────────────
// MODAL DE ATAQUE A CUEVA
// ─────────────────────────────────────────────────────────────

function openCaveAttackModal(caveId, x, y) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var guardian = CREATURE_TYPES.guardiancueva;

  var prev = document.getElementById('caveAttackOverlay');
  if (prev) prev.remove();

  var overlay = document.createElement('div');
  overlay.id = 'caveAttackOverlay';
  overlay.className = 'bld-modal-overlay';
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

  // Construir filas de tropas disponibles
  var troopRows = '';
  Object.keys(TROOP_TYPES).forEach(function (k) {
    var available = _getAvailableTroops(vs, k);
    if (available <= 0) return;
    var td = TROOP_TYPES[k];
    troopRows +=
      '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);">'
      + '<span style="font-size:1.1rem;width:26px;text-align:center;">' + td.icon + '</span>'
      + '<span style="flex:1;font-size:.78rem;color:var(--text);">' + td.name + '</span>'
      + '<span style="font-size:.68rem;color:var(--dim);margin-right:6px;">/' + available + '</span>'
      + '<input type="number" id="cave_troop_' + k + '" min="0" max="' + available + '" value="0" '
      + 'style="width:60px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:.82rem;text-align:right;outline:none;">'
      + '</div>';
  });
  // Criaturas propias (incluye guardiancueva — v1.48: capturados pueden atacar cuevas)
  Object.keys(CREATURE_TYPES).forEach(function (k) {
    var available = (vs.creatures && vs.creatures[k]) || 0;
    if (available <= 0) return;
    var cd = CREATURE_TYPES[k];
    troopRows +=
      '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);">'
      + '<span style="font-size:1.1rem;width:26px;text-align:center;">' + cd.icon + '</span>'
      + '<span style="flex:1;font-size:.78rem;color:var(--accent2);">' + cd.name + ' <span style="font-size:.6rem;color:var(--dim);">T' + cd.tier + '</span></span>'
      + '<span style="font-size:.68rem;color:var(--dim);margin-right:6px;">/' + available + '</span>'
      + '<input type="number" id="cave_troop_' + k + '" min="0" max="' + available + '" value="0" '
      + 'style="width:60px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:.82rem;text-align:right;outline:none;">'
      + '</div>';
  });

  if (!troopRows) {
    troopRows = '<div style="color:var(--dim);font-size:.75rem;padding:12px 0;text-align:center;">No tienes tropas disponibles.</div>';
  }

  var popup = document.createElement('div');
  popup.className = 'bld-modal';
  popup.style.cssText = 'width:min(480px,94vw);max-height:88vh;display:flex;flex-direction:column;';
  popup.innerHTML =
    '<div class="bld-modal-head">'
    + '<span style="font-size:1.5rem;">⛏️</span>'
    + '<div style="flex:1;">'
    + '<div class="bld-modal-title" style="color:var(--gold);">Atacar la Cueva</div>'
    + '<div class="bld-modal-sub">[' + x + ', ' + y + '] — El Guardián te espera</div>'
    + '</div>'
    + '<button class="bld-modal-close" onclick="document.getElementById(\'caveAttackOverlay\').remove()">×</button>'
    + '</div>'

    + '<div style="flex:1;overflow-y:auto;padding:16px;">'

    // Info del guardián
    + '<div style="background:rgba(255,200,0,.07);border:1px solid rgba(255,200,0,.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;">'
    + '<div style="display:flex;align-items:center;gap:10px;">'
    + '<span style="font-size:2rem;">🧿</span>'
    + '<div>'
    + '<div style="font-family:VT323,monospace;font-size:1rem;color:var(--gold);">' + guardian.name.toUpperCase() + ' — TIER ' + guardian.tier + '</div>'
    + '<div style="font-size:.68rem;color:var(--dim);">❤️ ' + guardian.hp + ' PG &nbsp;·&nbsp; ⚔️ ' + guardian.damage + ' daño (×' + guardian.attacksPerTurn + ') &nbsp;·&nbsp; 🛡️ CA ' + guardian.defense + ' &nbsp;·&nbsp; 🎯 ' + guardian.attackChance + '%</div>'
    + '<div style="font-size:.65rem;color:var(--accent);margin-top:3px;">Si lo vences: se une a tu ejército. Si muere luego: desaparece para siempre.</div>'
    + '</div>'
    + '</div>'
    + '</div>'

    // Selector de tropas
    + '<div style="font-size:.62rem;color:var(--dim);letter-spacing:.1em;margin-bottom:8px;">ELIGE TUS TROPAS</div>'
    + troopRows

    + '<div id="caveAttackMsg" style="margin-top:10px;font-size:.72rem;min-height:16px;"></div>'
    + '</div>'

    + '<div class="bld-modal-footer">'
    + '<button class="btn" onclick="document.getElementById(\'caveAttackOverlay\').remove()">Cancelar</button>'
    + '<button class="btn" style="background:rgba(255,61,90,.15);border-color:var(--danger);color:var(--danger);" '
    + 'onclick="launchCaveAttack(\'' + caveId + '\',' + x + ',' + y + ')">⚔️ Atacar</button>'
    + '</div>';

  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

function _getAvailableTroops(vs, key) {
  var total = (vs.troops && vs.troops[key]) || 0;
  if (key !== 'aldeano') return total;
  // Aldeanos: restar asignados
  var assigned = vs.aldeanos_assigned || {};
  var working = Object.values(assigned).reduce(function (s, n) { return s + n; }, 0);
  return Math.max(0, total - working);
}

// ─────────────────────────────────────────────────────────────
// LANZAR ATAQUE A CUEVA (desde el frontend)
// El combate real ocurre aquí (igual que NPC castles)
// ─────────────────────────────────────────────────────────────

async function launchCaveAttack(caveId, x, y) {
  if (!activeVillage) return;
  var msg = document.getElementById('caveAttackMsg');

  // Recolectar tropas seleccionadas
  var troops = {};
  var hasAny = false;
  Object.keys(TROOP_TYPES).forEach(function (k) {
    var el = document.getElementById('cave_troop_' + k);
    if (!el) return;
    var n = parseInt(el.value) || 0;
    if (n > 0) { troops[k] = n; hasAny = true; }
  });
  Object.keys(CREATURE_TYPES).forEach(function (k) {
    var el = document.getElementById('cave_troop_' + k);
    if (!el) return;
    var n = parseInt(el.value) || 0;
    if (n > 0) { troops[k] = n; hasAny = true; }
  });

  if (!hasAny) {
    if (msg) msg.innerHTML = '<span style="color:var(--danger)">Selecciona al menos 1 tropa.</span>';
    return;
  }

  // Validar que el jugador tiene esas tropas
  var vs = activeVillage.state;
  var valid = true;
  Object.keys(troops).forEach(function (k) {
    var avail = TROOP_TYPES[k] ? _getAvailableTroops(vs, k) : ((vs.creatures && vs.creatures[k]) || 0);
    if (troops[k] > avail) { valid = false; }
  });
  if (!valid) {
    if (msg) msg.innerHTML = '<span style="color:var(--danger)">No tienes suficientes tropas.</span>';
    return;
  }

  if (msg) msg.innerHTML = '<span style="color:var(--dim)">⏳ Enviando tropas…</span>';

  // Usar el sistema de misiones estándar para el viaje, con tipo 'cave_attack'
  await startCaveMission(caveId, x, y, troops);

  document.getElementById('caveAttackOverlay').remove();
}

// ─────────────────────────────────────────────────────────────
// MISIÓN DE CUEVA (viaje + combate inmediato al llegar)
// Se integra con startMission() del engine modificando el tipo
// ─────────────────────────────────────────────────────────────

async function startCaveMission(caveId, x, y, troops) {
  if (!activeVillage) return;
  var vs = activeVillage.state;

  var dx = Math.abs(x - activeVillage.x);
  var dy = Math.abs(y - activeVillage.y);
  var dist = Math.max(dx, dy);

  var minSpeed = 999;
  Object.keys(troops).forEach(function (k) {
    var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
    if (troops[k] > 0 && td && td.speed < minSpeed) minSpeed = td.speed;
  });
  if (minSpeed === 999) minSpeed = 1;

  var ms = typeof MISSION_FACTOR !== 'undefined' ? MISSION_FACTOR : 3600;
  var seconds = (dist / minSpeed) * ms;
  var finishAt = new Date(Date.now() + seconds * 1000).toISOString();

  // Descontar tropas del estado local
  snapshotResources(vs);
  Object.keys(troops).forEach(function (k) {
    if (TROOP_TYPES[k]) vs.troops[k] = Math.max(0, (vs.troops[k] || 0) - troops[k]);
    else if (CREATURE_TYPES[k]) vs.creatures[k] = Math.max(0, (vs.creatures[k] || 0) - troops[k]);
  });

  var missionEntry = {
    mid: 'cave_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36),
    type: 'cave_attack',
    tx: x, ty: y,
    targetId: caveId,
    troops: troops,
    finish_at: finishAt,
    start_at: new Date().toISOString()
  };

  vs.mission_queue.push(missionEntry);
  showNotif('⛏️ Tropas enviadas a la cueva. Llegan en ' + fmtTime(Math.ceil(seconds)), 'ok');
  await flushVillage();
  if (typeof tick === 'function') tick();
}

// ─────────────────────────────────────────────────────────────
// EJECUCIÓN DEL COMBATE (llamada desde resolveMissions)
// ─────────────────────────────────────────────────────────────

async function executeAttackCave(m) {
  // 1. Verificar que la cueva sigue siendo wild
  var caveR = await sbClient.from('caves').select('*').eq('id', m.targetId).maybeSingle();
  if (caveR.error || !caveR.data) {
    await sendSystemReport(currentUser.id, '⛏️ CUEVA: Error', '❌ La cueva ya no existe. Tus tropas regresan.');
    return;
  }
  var cave = caveR.data;
  if (cave.status !== 'wild') {
    await sendSystemReport(currentUser.id, '⛏️ CUEVA: Ya capturada',
      '⚠️ Otro jugador capturó esta cueva antes de que llegaran tus tropas. Tus tropas regresan.');
    return;
  }

  // 2. GARANTIZAR que guardiancueva existe en CREATURE_TYPES
  // (fallback robusto por si hay problemas de carga de módulos)
  if (!CREATURE_TYPES.guardiancueva) {
    CREATURE_TYPES.guardiancueva = {
      name: 'Guardián de la Cueva', icon: '🧿', tier: 5,
      isCaveGuardian: true,
      attackChance: 17, hp: 200, attacksPerTurn: 2, damage: 38,
      defense: 17, armor: 0, weapon: 0, dexterity: 17,
      speed: 140, capacity: 0,
      summonersNeeded: 0,
      cost: { esencia: 0 }, time: 0,
      desc: 'Guardián ancestral de una cueva mágica. Solo puede obtenerse venciendo en la cueva. Si muere, desaparece para siempre.'
    };
  }

  // 3. Montar ejército defensor (el guardián)
  var guardian = CREATURE_TYPES.guardiancueva;
  var defArmy = {
    _guardian: {
      count: 1,
      stats: {
        hp: guardian.hp,
        damage: guardian.damage,
        attacksPerTurn: guardian.attacksPerTurn,
        attackChance: guardian.attackChance,
        defense: guardian.defense,
        dexterity: guardian.dexterity,
        armor: 0, weapon: 0,
        icon: guardian.icon,
        name: guardian.name
      }
    }
  };

  // 4. Combate
  var rd = (typeof _researchData !== 'undefined') ? _researchData : null;
  var result = simulateBattle(m.troops, defArmy, 0, rd);
  var victoria = result.winner === 1;

  // 4. Calcular bajas
  var atkCas = {}, defCas = {};
  Object.keys(m.troops).forEach(function (k) {
    var ini = m.troops[k] || 0;
    var fin = result.survivors1[k] || 0;
    if (ini > fin) atkCas[k] = ini - fin;
  });
  var guardianKilled = (result.survivors2['_guardian'] || 0) === 0;
  if (guardianKilled) defCas['_guardian'] = 1;

  // 5. XP al atacante
  var xpGained = victoria ? CAVE_XP : Math.floor(CAVE_XP * 0.1);
  if (xpGained > 0) {
    await sbClient.rpc('add_experience', { amount: xpGained });
    if (rd) {
      rd.experience = (rd.experience || 0) + xpGained;
      var xpEl = document.getElementById('ovExperience');
      if (xpEl) xpEl.textContent = formatNumber(rd.experience);
    }
  }

  // 6. Supervivientes propios (con recuperación)
  var recovered = (typeof calculateRecovery === 'function') ? calculateRecovery(atkCas) : {};
  var survivors = {};
  Object.keys(result.survivors1).forEach(function (k) {
    var n = (result.survivors1[k] || 0) + (recovered[k] || 0);
    if (n > 0) survivors[k] = n;
  });

  // 7. Si victoria → añadir guardián + actualizar cueva
  if (victoria) {
    // Añadir guardián a las criaturas del jugador (se registrará al retornar)
    survivors.guardiancueva = (survivors.guardiancueva || 0) + 1;

    // Marcar cueva como capturada
    await sbClient.from('caves').update({
      status: 'captured',
      owner_id: currentUser.id,
      village_id: activeVillage.id
    }).eq('id', cave.id);

    // Actualizar lookup local
    delete cavesLookup[cave.cx + ',' + cave.cy];
    var cIdx = _cavesCache.findIndex(function (c) { return c.id === cave.id; });
    if (cIdx !== -1) {
      _cavesCache[cIdx].status = 'captured';
      _cavesCache[cIdx].owner_id = currentUser.id;
      _cavesCache[cIdx].village_id = activeVillage.id;
    }

    // ── v1.51: Auto-respawn de cueva salvaje para mantener el cupo lleno ──
    setTimeout(async function () {
      try {
        var spawnPos = await _findFreeCaveSpot();
        if (spawnPos) {
          var insR = await sbClient.from('caves').insert({ cx: spawnPos.cx, cy: spawnPos.cy, status: 'wild' }).select().single();
          if (!insR.error && insR.data) {
            _cavesCache.push(insR.data);
            cavesLookup[spawnPos.cx + ',' + spawnPos.cy] = insR.data;
            if (typeof renderMap === 'function') renderMap();
          }
        }
      } catch (e) { }
    }, 100);

    showNotif('🧿 ¡Guardián capturado! Se une a tu ejército. +' + xpGained + ' XP', 'ok');
    if (typeof renderMap === 'function') setTimeout(renderMap, 500);
  } else {
    showNotif('💀 Derrotado en la cueva. Revisa el informe.', 'err');
  }

  // 8. Tropas regresan con el guardián (si victoria)
  m.troops = survivors;

  // 9. Informe de batalla
  var reportHtml = _generateCaveReport(m, result, victoria, atkCas, xpGained, cave);
  await sendSystemReport(
    currentUser.id,
    (victoria ? '🏆 CUEVA CAPTURADA: ' : '💀 CUEVA: DERROTA — ') + '[' + cave.cx + ',' + cave.cy + ']',
    reportHtml
  );
}

function _generateCaveReport(m, result, victoria, atkCas, xpGained, cave) {
  var guardian = CREATURE_TYPES.guardiancueva;
  var totalAtk = Object.values(m.troops).reduce(function (s, n) { return s + n; }, 0);

  var casualtyLines = '';
  Object.keys(atkCas).forEach(function (k) {
    var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
    casualtyLines += '<div style="color:var(--danger);">- ' + atkCas[k] + ' ' + (td ? td.name : k) + ' perdidos</div>';
  });

  var survivors = result.survivors1 || {};
  var survLines = '';
  Object.keys(survivors).forEach(function (k) {
    var n = survivors[k] || 0;
    if (n <= 0) return;
    var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
    survLines += '<div style="color:var(--ok);">+ ' + n + ' ' + (td ? td.name : k) + ' supervivientes</div>';
  });

  return [
    '<div style="font-size:.82rem;line-height:1.6;color:var(--text);">',
    '<div style="background:rgba(255,200,0,.08);border:1px solid rgba(255,200,0,.2);border-radius:6px;padding:10px 14px;margin-bottom:12px;">',
    '<b style="color:var(--gold);">⛏️ Cueva [' + cave.cx + ',' + cave.cy + ']</b><br>',
    'Resultado: <b style="color:' + (victoria ? 'var(--ok)' : 'var(--danger)') + ';">' + (victoria ? '🏆 VICTORIA' : '💀 DERROTA') + '</b><br>',
    'XP obtenida: <b style="color:var(--gold);">+' + xpGained + '</b>',
    '</div>',
    '<div style="margin-bottom:8px;"><b style="color:var(--dim);font-size:.7rem;">GUARDIÁN</b><br>',
    guardian.icon + ' <b>' + guardian.name + '</b> — ' + (victoria ? '<span style="color:var(--ok);">Capturado ✅</span>' : '<span style="color:var(--danger);">Te derrotó 💀</span>'),
    '</div>',
    casualtyLines ? '<div style="margin-bottom:8px;"><b style="color:var(--dim);font-size:.7rem;">BAJAS</b><br>' + casualtyLines + '</div>' : '',
    survLines ? '<div style="margin-bottom:8px;"><b style="color:var(--dim);font-size:.7rem;">SUPERVIVIENTES</b><br>' + survLines + '</div>' : '',
    victoria ? '<div style="background:rgba(0,200,100,.08);border:1px solid rgba(0,200,100,.2);border-radius:6px;padding:8px 12px;color:var(--ok);">🧿 El Guardián de la Cueva ahora forma parte de tu ejército.<br><b>Si muere en combate, desaparecerá para siempre.</b></div>' : '',
    '</div>'
  ].join('');
}

// ─────────────────────────────────────────────────────────────
// MUERTE DEL GUARDIÁN EN COMBATE
// Llamar esta función cuando el guardián muere en una batalla PvP/NPC
// ─────────────────────────────────────────────────────────────

async function onCaveGuardianDied(villageId, ownerId) {
  try {
    // Buscar la cueva capturada de este jugador/aldea
    var r = await sbClient.from('caves')
      .select('id,cx,cy')
      .eq('status', 'captured')
      .eq('village_id', villageId)
      .maybeSingle();

    if (r.error || !r.data) {
      // Fallback: buscar por owner_id
      var r2 = await sbClient.from('caves')
        .select('id,cx,cy')
        .eq('status', 'captured')
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (r2.error || !r2.data) return;
      r = r2;
    }

    var oldCave = r.data;

    // Resetear la cueva: nueva posición aleatoria en el mapa como wild
    var newPos = await _findFreeCaveSpot();
    if (!newPos) {
      // Si no encuentra posición, reusar la misma
      await sbClient.from('caves').update({
        status: 'wild',
        owner_id: null,
        village_id: null
      }).eq('id', oldCave.id);
    } else {
      await sbClient.from('caves').update({
        status: 'wild',
        cx: newPos.cx,
        cy: newPos.cy,
        owner_id: null,
        village_id: null
      }).eq('id', oldCave.id);
    }

    // Actualizar cache local
    var cIdx = _cavesCache.findIndex(function (c) { return c.id === oldCave.id; });
    if (cIdx !== -1) {
      delete cavesLookup[_cavesCache[cIdx].cx + ',' + _cavesCache[cIdx].cy];
      var nc = newPos || { cx: oldCave.cx, cy: oldCave.cy };
      _cavesCache[cIdx].status = 'wild';
      _cavesCache[cIdx].cx = nc.cx;
      _cavesCache[cIdx].cy = nc.cy;
      _cavesCache[cIdx].owner_id = null;
      _cavesCache[cIdx].village_id = null;
      cavesLookup[nc.cx + ',' + nc.cy] = _cavesCache[cIdx];
    }

    // Notificar al jugador que perdió el guardián
    if (ownerId) {
      var pos = newPos || { cx: oldCave.cx, cy: oldCave.cy };
      await sendSystemReport(
        ownerId,
        '🧿 GUARDIÁN MUERTO — La cueva reaparece',
        '<div style="font-size:.82rem;line-height:1.6;color:var(--text);">'
        + '<div style="background:rgba(255,61,90,.08);border:1px solid rgba(255,61,90,.3);border-radius:6px;padding:10px 14px;">'
        + '💀 Tu <b>Guardián de la Cueva</b> ha muerto en combate.<br>'
        + 'Ha desaparecido para siempre de tu ejército.<br><br>'
        + '⛏️ Una nueva cueva ha aparecido en el mapa en <b>[' + pos.cx + ', ' + pos.cy + ']</b>.'
        + '</div></div>'
      );
    }

    if (typeof renderMap === 'function') setTimeout(renderMap, 300);
  } catch (e) {
    console.warn('[Caves] onCaveGuardianDied error:', e.message || e);
  }
}

async function _findFreeCaveSpot() {
  var occupied = new Set();
  if (typeof allVillages !== 'undefined') allVillages.forEach(function (v) { occupied.add(v.x + ',' + v.y); });
  if (typeof NPC_CASTLES !== 'undefined') NPC_CASTLES.forEach(function (n) { occupied.add(n.x + ',' + n.y); });
  _cavesCache.forEach(function (c) { if (c.status === 'wild') occupied.add(c.cx + ',' + c.cy); });

  var ms = typeof MAP_SIZE !== 'undefined' ? MAP_SIZE : 200;
  for (var i = 0; i < 500; i++) {
    var cx = Math.floor(Math.random() * (ms - 4)) + 3;
    var cy = Math.floor(Math.random() * (ms - 4)) + 3;
    var key = cx + ',' + cy;
    var tooClose = _cavesCache.some(function (c) {
      return c.status === 'wild' && Math.abs(c.cx - cx) < 5 && Math.abs(c.cy - cy) < 5;
    });
    if (!occupied.has(key) && !tooClose) return { cx: cx, cy: cy };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// ADMIN — PANEL DE CUEVAS
// v1.48: Muestra ubicación real del guardián capturado
//        (coordenadas de aldea + nombre, o "En movimiento")
// ─────────────────────────────────────────────────────────────

async function loadAdminCaves() {
  var box = document.getElementById('adminCavesBox');
  if (!box) return;
  box.innerHTML = '<div class="muted">Cargando...</div>';

  var r = await sbClient.from('caves').select('*').order('status').order('created_at');
  if (r.error) {
    box.innerHTML = '<div class="muted" style="color:var(--danger)">Error: ' + escapeHtml(r.error.message) + '</div>';
    return;
  }

  var caves = r.data || [];
  _cavesCache = caves;
  _rebuildCavesLookup();

  // Cargar usernames de propietarios
  var ownerIds = [...new Set(caves.filter(function (c) { return c.owner_id; }).map(function (c) { return c.owner_id; }))];
  var usernameMap = {};
  if (ownerIds.length > 0) {
    var ur = await sbClient.from('profiles').select('id,username').in('id', ownerIds);
    if (!ur.error && ur.data) ur.data.forEach(function (u) { usernameMap[u.id] = u.username; });
  }

  // ── v1.48: Cargar datos de aldeas de captores para ubicación real ──
  var captured = caves.filter(function (c) { return c.status === 'captured'; });
  var villageIds = [...new Set(captured.filter(function (c) { return c.village_id; }).map(function (c) { return c.village_id; }))];
  var villageMap = {}; // village_id → { name, cx, cy, state }
  if (villageIds.length > 0) {
    var vr = await sbClient.from('villages').select('id,name,cx,cy,state').in('id', villageIds);
    if (!vr.error && vr.data) {
      vr.data.forEach(function (v) { villageMap[v.id] = v; });
    }
  }

  var wild = caves.filter(function (c) { return c.status === 'wild'; });

  var html =
    '<div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;">'
    + _statPill('⛏️ Wild', wild.length, 'var(--gold)')
    + _statPill('🔒 Capturadas', captured.length, 'var(--accent)')
    + _statPill('📦 Total', caves.length, 'var(--ok)')
    + '</div>'

    + '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">'
    + '<button class="btn btn-sm" onclick="adminSpawnCave()">➕ Crear cueva</button>'
    + '<button class="btn btn-sm" onclick="adminRefillCaves()">🔄 Reponer hasta ' + CAVES_TOTAL + '</button>'
    + '<button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" onclick="adminResetAllCaves()">💀 Reset total</button>'
    + '</div>'

    + '<div style="font-size:.62rem;color:var(--dim);letter-spacing:.1em;margin-bottom:6px;">CUEVAS WILD — EN EL MAPA</div>';

  if (wild.length === 0) {
    html += '<div class="muted" style="margin-bottom:12px;">Sin cuevas wild actualmente.</div>';
  } else {
    html += '<div class="table" style="margin-bottom:12px;"><div class="trow thead"><div>Posición</div><div>ID</div><div></div></div>';
    wild.forEach(function (c) {
      html += '<div class="trow">'
        + '<div style="font-family:VT323,monospace;color:var(--gold);">[' + c.cx + ', ' + c.cy + ']</div>'
        + '<div style="font-size:.62rem;color:var(--dim);">' + c.id.slice(0, 8) + '…</div>'
        + '<div style="display:flex;gap:4px;align-items:center;">'
        + '<button class="btn btn-sm" onclick="adminTeleportCaveRandom(\'' + c.id + '\')" title="Mover a posición aleatoria">🎲 Random</button>'
        + '<button class="btn btn-sm" onclick="adminTeleportCaveCustom(\'' + c.id + '\')" title="Mover a coordenadas específicas">📍 Elegir</button>'
        + '<button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" onclick="adminDeleteCave(\'' + c.id + '\')">✕</button>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
  }

  html += '<div style="font-size:.62rem;color:var(--dim);letter-spacing:.1em;margin-bottom:6px;">CUEVAS CAPTURADAS — EN EJÉRCITOS</div>';
  if (captured.length === 0) {
    html += '<div class="muted">Ningún jugador tiene guardián actualmente.</div>';
  } else {
    html += '<div class="table"><div class="trow thead"><div>Jugador</div><div>Ubicación actual</div><div></div></div>';
    captured.forEach(function (c) {
      var uname = c.owner_id ? (usernameMap[c.owner_id] || c.owner_id.slice(0, 8)) : '—';

      // ── v1.48: Determinar ubicación real del guardián ──
      var locationHtml = '';
      var village = c.village_id ? villageMap[c.village_id] : null;

      if (village) {
        // Comprobar si el guardián está en movimiento (misión activa con guardiancueva)
        var onMission = false;
        var vState = typeof village.state === 'string' ? JSON.parse(village.state) : (village.state || {});
        var mq = (vState && vState.mission_queue) || [];
        for (var mi = 0; mi < mq.length; mi++) {
          var mission = mq[mi];
          if (mission.troops && (mission.troops.guardiancueva || 0) > 0) {
            onMission = true;
            break;
          }
        }

        if (onMission) {
          locationHtml = '<span style="color:var(--accent);">🚶 En movimiento</span>';
        } else {
          locationHtml = '<span style="font-family:VT323,monospace;color:var(--ok);">'
            + escapeHtml(village.name) + ' [' + village.cx + ', ' + village.cy + ']'
            + '</span>';
        }
      } else {
        locationHtml = '<span style="color:var(--dim);font-size:.65rem;">Aldea desconocida</span>';
      }

      html += '<div class="trow">'
        + '<div>👤 ' + escapeHtml(uname) + '</div>'
        + '<div>' + locationHtml + '</div>'
        + '<div>'
        + '<button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" '
        + 'onclick="adminRevokeCave(\'' + c.id + '\',\'' + escapeAttr(uname) + '\')" title="Liberar guardián (vuelve al mapa)">🔓 Liberar</button>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
  }

  box.innerHTML = html;
}

function _statPill(label, value, color) {
  return '<div style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:6px;padding:6px 12px;text-align:center;">'
    + '<div style="font-size:.62rem;color:var(--dim);">' + label + '</div>'
    + '<div style="font-family:VT323,monospace;font-size:1.2rem;color:' + color + ';">' + value + '</div>'
    + '</div>';
}

async function adminSpawnCave() {
  var pos = await _findFreeCaveSpot();
  if (!pos) { showNotif('No hay espacio libre en el mapa.', 'err'); return; }
  var ins = await sbClient.from('caves').insert({ cx: pos.cx, cy: pos.cy, status: 'wild' });
  if (ins.error) { showNotif('Error: ' + ins.error.message, 'err'); return; }
  showNotif('⛏️ Nueva cueva creada en [' + pos.cx + ',' + pos.cy + ']', 'ok');
  loadAdminCaves();
  if (typeof renderMap === 'function') setTimeout(renderMap, 300);
}

async function adminRefillCaves() {
  var wild = _cavesCache.filter(function (c) { return c.status === 'wild'; }).length;
  var need = CAVES_TOTAL - wild; // v1.51: Mantener siempre CAVES_TOTAL wild
  if (need <= 0) { showNotif('Ya hay ' + CAVES_TOTAL + ' cuevas salvajes en el mapa.', 'ok'); return; }
  await _spawnCaves(need);
  showNotif('✓ ' + need + ' cueva(s) nueva(s) salvajes creadas.', 'ok');
  loadAdminCaves();
  if (typeof renderMap === 'function') setTimeout(renderMap, 300);
}

// 🎲 Mover a posición aleatoria
async function adminTeleportCaveRandom(caveId) {
  var pos = await _findFreeCaveSpot();
  if (!pos) { showNotif('No hay posición libre.', 'err'); return; }
  var r = await sbClient.from('caves').update({ cx: pos.cx, cy: pos.cy }).eq('id', caveId);
  if (r.error) { showNotif('Error: ' + r.error.message, 'err'); return; }
  showNotif('⛏️ Cueva movida a [' + pos.cx + ',' + pos.cy + ']', 'ok');
  loadAdminCaves();
  if (typeof renderMap === 'function') setTimeout(renderMap, 200);
}

// 📍 Mover a coordenadas específicas — abre mini-modal inline
function adminTeleportCaveCustom(caveId) {
  // Si ya hay un modal abierto para esta cueva, cerrarlo
  var existingId = 'caveMoveModal_' + caveId.slice(0, 8);
  var existing = document.getElementById(existingId);
  if (existing) { existing.remove(); return; }

  var ms = typeof MAP_SIZE !== 'undefined' ? MAP_SIZE : 200;

  var modal = document.createElement('div');
  modal.id = existingId;
  modal.style.cssText = [
    'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.65);',
    'display:flex;align-items:center;justify-content:center;'
  ].join('');
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

  modal.innerHTML =
    '<div style="background:var(--panel);border:1px solid var(--accent);border-radius:10px;'
    + 'padding:22px 24px;min-width:280px;max-width:340px;font-family:VT323,monospace;">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'
    + '<span style="font-size:1.4rem;">📍</span>'
    + '<div style="font-size:1rem;color:var(--accent);letter-spacing:.06em;">MOVER CUEVA</div>'
    + '<button onclick="document.getElementById(\'' + existingId + '\').remove()" '
    + 'style="margin-left:auto;background:none;border:none;color:var(--dim);cursor:pointer;font-size:1.1rem;line-height:1;">✕</button>'
    + '</div>'

    + '<div style="font-size:.72rem;color:var(--dim);margin-bottom:12px;">'
    + 'Introduce las coordenadas destino (1–' + (ms - 1) + ').'
    + '</div>'

    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">'
    + '<div>'
    + '<div style="font-size:.62rem;color:var(--dim);margin-bottom:4px;">X</div>'
    + '<input id="caveMoveX_' + caveId.slice(0, 8) + '" type="number" min="1" max="' + (ms - 1) + '" placeholder="X" '
    + 'style="width:100%;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:4px;'
    + 'padding:6px 10px;color:var(--text);font-family:VT323,monospace;font-size:.95rem;outline:none;box-sizing:border-box;">'
    + '</div>'
    + '<div>'
    + '<div style="font-size:.62rem;color:var(--dim);margin-bottom:4px;">Y</div>'
    + '<input id="caveMoveY_' + caveId.slice(0, 8) + '" type="number" min="1" max="' + (ms - 1) + '" placeholder="Y" '
    + 'style="width:100%;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:4px;'
    + 'padding:6px 10px;color:var(--text);font-family:VT323,monospace;font-size:.95rem;outline:none;box-sizing:border-box;">'
    + '</div>'
    + '</div>'

    + '<div id="caveMoveErr_' + caveId.slice(0, 8) + '" style="font-size:.7rem;color:var(--danger);min-height:16px;margin-bottom:8px;"></div>'

    + '<div style="display:flex;gap:8px;">'
    + '<button class="btn" style="flex:1;" '
    + 'onclick="adminTeleportCaveToCoords(\'' + caveId + '\')">✓ Mover</button>'
    + '<button class="btn" style="background:rgba(255,255,255,.04);" '
    + 'onclick="document.getElementById(\'' + existingId + '\').remove()">Cancelar</button>'
    + '</div>'
    + '</div>';

  document.body.appendChild(modal);
  // Foco automático en X
  setTimeout(function () {
    var inp = document.getElementById('caveMoveX_' + caveId.slice(0, 8));
    if (inp) inp.focus();
  }, 50);
}

async function adminTeleportCaveToCoords(caveId) {
  var shortId = caveId.slice(0, 8);
  var errEl = document.getElementById('caveMoveErr_' + shortId);
  var ms = typeof MAP_SIZE !== 'undefined' ? MAP_SIZE : 200;

  var xVal = parseInt((document.getElementById('caveMoveX_' + shortId) || {}).value);
  var yVal = parseInt((document.getElementById('caveMoveY_' + shortId) || {}).value);

  if (isNaN(xVal) || isNaN(yVal)) {
    if (errEl) errEl.textContent = 'Introduce ambas coordenadas.';
    return;
  }
  if (xVal < 1 || xVal >= ms || yVal < 1 || yVal >= ms) {
    if (errEl) errEl.textContent = 'Coordenadas fuera de rango (1–' + (ms - 1) + ').';
    return;
  }

  // Comprobar que la casilla no está ocupada
  var key = xVal + ',' + yVal;
  var occupiedByVillage = typeof allVillages !== 'undefined' && allVillages.some(function (v) { return v.x === xVal && v.y === yVal; });
  var occupiedByCastle = typeof NPC_CASTLES !== 'undefined' && NPC_CASTLES.some(function (n) { return n.x === xVal && n.y === yVal; });
  var occupiedByCave = _cavesCache.some(function (c) { return c.id !== caveId && c.cx === xVal && c.cy === yVal; });

  if (occupiedByVillage || occupiedByCastle) {
    if (errEl) errEl.textContent = 'Esa casilla está ocupada por una aldea o castillo.';
    return;
  }
  if (occupiedByCave) {
    if (errEl) errEl.textContent = 'Ya hay otra cueva en esa posición.';
    return;
  }

  var r = await sbClient.from('caves').update({ cx: xVal, cy: yVal }).eq('id', caveId);
  if (r.error) {
    if (errEl) errEl.textContent = 'Error: ' + r.error.message;
    return;
  }

  // Cerrar modal
  var modal = document.getElementById('caveMoveModal_' + shortId);
  if (modal) modal.remove();

  showNotif('⛏️ Cueva movida a [' + xVal + ',' + yVal + ']', 'ok');
  loadAdminCaves();
  if (typeof renderMap === 'function') setTimeout(renderMap, 200);
}

async function adminDeleteCave(caveId) {
  if (!confirm('¿Eliminar esta cueva del mapa?')) return;
  var r = await sbClient.from('caves').delete().eq('id', caveId);
  if (r.error) { showNotif('Error: ' + r.error.message, 'err'); return; }
  showNotif('⛏️ Cueva eliminada.', 'ok');
  loadAdminCaves();
  if (typeof renderMap === 'function') setTimeout(renderMap, 200);
}

async function adminRevokeCave(caveId, username) {
  if (!confirm('¿Liberar el guardián de "' + username + '"? La cueva volverá al mapa en nueva posición.')) return;

  // Primero quitar el guardián del jugador captor
  var caveR = await sbClient.from('caves').select('owner_id,village_id').eq('id', caveId).maybeSingle();
  if (!caveR.error && caveR.data && caveR.data.village_id) {
    // Cargar aldea y quitar guardiancueva
    var villR = await sbClient.from('villages').select('id,state').eq('id', caveR.data.village_id).maybeSingle();
    if (!villR.error && villR.data) {
      var st = typeof villR.data.state === 'string' ? JSON.parse(villR.data.state) : villR.data.state;
      if (st && st.creatures) {
        st.creatures.guardiancueva = 0;
        await sbClient.from('villages').update({ state: JSON.stringify(st) }).eq('id', caveR.data.village_id);
      }
      // v1.49: guardiancueva vive en villages.state — no hay tabla creatures separada
    }
  }

  // Luego reubicar la cueva como wild
  var pos = await _findFreeCaveSpot();
  var upd = pos
    ? { status: 'wild', owner_id: null, village_id: null, cx: pos.cx, cy: pos.cy }
    : { status: 'wild', owner_id: null, village_id: null };
  var r = await sbClient.from('caves').update(upd).eq('id', caveId);
  if (r.error) { showNotif('Error actualizando cueva: ' + r.error.message, 'err'); return; }

  showNotif('✓ Guardián de "' + username + '" liberado. La cueva vuelve al mapa.', 'ok');
  loadAdminCaves();
  if (typeof renderMap === 'function') setTimeout(renderMap, 300);
}

async function adminResetAllCaves() {
  if (!confirm('¿RESET TOTAL? Esto eliminará TODAS las cuevas y guardianes capturados.\n\nSe crearán ' + CAVES_TOTAL + ' cuevas nuevas en el mapa.\n\nEsta acción es IRREVERSIBLE.')) return;

  // Borrar todos los guardianes de los jugadores
  var capR = await sbClient.from('caves').select('village_id').eq('status', 'captured');
  if (!capR.error && capR.data) {
    for (var i = 0; i < capR.data.length; i++) {
      var vid = capR.data[i].village_id;
      if (!vid) continue;
      var villR = await sbClient.from('villages').select('id,state').eq('id', vid).maybeSingle();
      if (!villR.error && villR.data) {
        var st = typeof villR.data.state === 'string' ? JSON.parse(villR.data.state) : villR.data.state;
        if (st && st.creatures) {
          st.creatures.guardiancueva = 0;
          await sbClient.from('villages').update({ state: JSON.stringify(st) }).eq('id', vid);
        }
      }
    }
  }

  // Borrar todas las cuevas
  await sbClient.from('caves').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // borra todo

  _cavesCache = [];
  cavesLookup = {};
  cavesLoaded = false;

  // Crear CAVES_TOTAL cuevas nuevas
  await _spawnCaves(CAVES_TOTAL);
  showNotif('✓ Reset completo. ' + CAVES_TOTAL + ' cuevas nuevas en el mapa.', 'ok');
  loadAdminCaves();
  if (typeof renderMap === 'function') setTimeout(renderMap, 400);
}
