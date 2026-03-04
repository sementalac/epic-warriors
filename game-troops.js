// ============================================================
// EPIC WARRIORS — game-troops.js v1.48
// UI: renderTroops, renderCreatures, renderSummoningQueue,
// renderCreaturesList, showCreatureStats, renderSummonOptions,
// showBarracasModal, startRecruitment, showTroopStats,
// renderTrainOptions, resolveTrainingQueue, renderTrainingQueue
//
// v1.48: renderCaughtCreatures() cross-check con caves table
//        para múltiples aldeas + auto-corrección de estado
// v1.47: renderCaughtCreatures() para apartado de guardianes capturados
// ============================================================

function renderTroops() {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var w = vs.aldeanos_assigned || defaultAssignments();
  var range = getTorreRange(vs.buildings);
  var lvl = (vs.buildings.torre && vs.buildings.torre.level) || 0;

  renderTrainingQueue();
  renderTrainOptions();

  var box = document.getElementById('troopsListBox');
  if (!box) return;

  var troops = vs.troops || defaultTroops();
  var barrCap = getBarracksCapacity(vs.buildings);

  var usedSlots = getBarracksUsed(vs);
  var usedTroopSlots = 0;
  Object.keys(TROOP_TYPES).forEach(function (k) {
    if (k === 'aldeano') return;
    usedTroopSlots += (troops[k] || 0) * (TROOP_TYPES[k].barracasSlots || 1);
  });

  var aldWorking = res.aldeanos_working || 0;
  var aldTotal = res.aldeanos_total || 0;

  var html = '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0 12px;border-bottom:2px solid var(--border);margin-bottom:8px;">'
    + '<span style="font-size:.75rem;color:var(--dim);">PLAZAS OCUPADAS</span>'
    + '<span style="font-size:.85rem;color:var(--accent);"><b>' + usedSlots + '</b> / ' + barrCap + '</span>'
    + '</div>'
    + '<div style="background:var(--panel2);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:.72rem;">'
    + '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">'
    + '<span style="color:var(--dim)">👤 Aldeanos</span>'
    + '<span style="color:var(--aldeanos);font-size:.85rem;"><b>' + aldTotal + '</b></span>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;">'
    + '<span style="color:var(--dim)">⚔️ Tropas militares (plazas)</span>'
    + '<span style="color:var(--text)">' + usedTroopSlots + '</span>'
    + '</div>'
    + '</div>'
    + '<div style="margin-bottom:4px;"></div>';

  box.innerHTML = '';
}

// ============================================================
// CREATURES UI RENDERING
// ============================================================

function renderCreatures() {
  if (!activeVillage) return;
  var vs = activeVillage.state;

  var torreLevel = (vs.buildings.torreinvocacion && vs.buildings.torreinvocacion.level) || 0;
  var torreInfo = document.getElementById('torreInvocacionInfo');
  if (torreInfo) {
    if (torreLevel === 0) {
      torreInfo.innerHTML = '<span style="color:var(--danger);">⚠️ Torre de Invocación no construida</span>';
    } else {
      var reduction = torreLevel * 5;
      torreInfo.innerHTML = 'Nivel ' + torreLevel + ' • <span style="color:var(--ok);">-' + reduction + '% tiempo de invocación</span>';
    }
  }

  renderSummoningQueue();
  renderCreaturesList();
  renderCaughtCreatures();  // ⛏️ v1.47: Mostrar criaturas cazadas
  renderSummonOptions();
}

function renderSummoningQueue() {
  var box = document.getElementById('summoningQueueBox');
  if (!box || !activeVillage) return;

  var vs = activeVillage.state;
  var queue = vs.summoning_queue || [];
  var now = Date.now();

  if (queue.length === 0) {
    box.innerHTML = '<div class="tq-empty">🐉 Sin invocaciones en curso</div>';
    return;
  }

  var html = '';

  html += '<div class="tq-header">'
    + '<span class="tq-header-count">' + queue.length + ' en cola</span>'
    + '<button class="tq-cancel-btn" onclick="cancelSummoningQueue()">✕ Cancelar todo</button>'
    + '</div>';

  var active = queue[0];
  var cData = CREATURE_TYPES[active.creature];
  if (cData) {
    var finish = new Date(active.finish_at).getTime();
    var timeLeft = Math.max(0, Math.ceil((finish - now) / 1000));
    var start = new Date(active.start_at).getTime();
    var total = Math.max(1, (finish - start) / 1000);
    var pct = Math.min(100, Math.round(((total - timeLeft) / total) * 100));
    var arrStr = new Date(finish).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    html += '<div class="tq-active">'
      + '<div class="tq-active-icon">' + cData.icon + '</div>'
      + '<div class="tq-active-info">'
      + '<div class="tq-active-name">' + cData.name + '</div>'
      + '<div class="tq-bar"><div class="tq-bar-fill" style="width:' + pct + '%"></div></div>'
      + '<div class="tq-active-time">' + fmtTime(timeLeft) + ' restantes · termina ' + arrStr + '</div>'
      + '</div>'
      + '</div>';
  }

  if (queue.length > 1) {
    var waiting = queue.slice(1);
    var counts = {};
    waiting.forEach(function (s) { counts[s.creature] = (counts[s.creature] || 0) + 1; });

    var lastFinish = new Date(queue[queue.length - 1].finish_at);
    var totalLeft = Math.max(0, Math.ceil((lastFinish.getTime() - now) / 1000));
    var lastStr = lastFinish.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    html += '<div class="tq-waiting">'
      + '<div class="tq-waiting-label">En espera · Cola: <span style="color:var(--accent);">'
      + fmtTime(totalLeft) + '</span> · <b>' + lastStr + '</b></div>'
      + '<div class="tq-chips">';

    Object.keys(counts).forEach(function (key) {
      var cd = CREATURE_TYPES[key];
      if (!cd) return;
      html += '<div class="tq-chip">'
        + '<span class="tq-chip-icon">' + cd.icon + '</span>'
        + '<span>' + cd.name + '</span>'
        + (counts[key] > 1 ? '<span class="tq-chip-count">×' + counts[key] + '</span>' : '')
        + '</div>';
    });

    html += '</div></div>';
  }

  box.innerHTML = html;
}

function renderCreaturesList() {
  var box = document.getElementById('creaturesListBox');
  if (!box || !activeVillage) return;

  var vs = activeVillage.state;
  var creatures = vs.creatures || defaultCreatures();

  var hasAny = false;
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">';

  Object.keys(CREATURE_TYPES).forEach(function (key) {
    // ⛏️ v1.47: Excluir guardiancueva — se renderiza en apartado separado
    if (key === 'guardiancueva') return;

    var count = creatures[key] || 0;
    if (count === 0) return;
    hasAny = true;

    var cData = CREATURE_TYPES[key];
    html += '<div style="background:var(--panel2);padding:10px;border-radius:6px;text-align:center;position:relative;">';
    html += '<div style="position:absolute;top:6px;left:6px;font-size:.55rem;color:var(--esencia);letter-spacing:.08em;background:rgba(192,132,252,.12);border:1px solid rgba(192,132,252,.2);border-radius:3px;padding:1px 4px;">TIER ' + cData.tier + '</div>';
    html += '<button onclick="showCreatureStats(\'' + key + '\')" title="Ver estadísticas" style="background:none;border:none;cursor:pointer;font-size:2.2rem;padding:0;line-height:1;margin-top:6px;display:block;width:100%;">' + cData.icon + '</button>';
    html += '<div style="font-size:.78rem;color:var(--text);margin-top:5px;font-family:VT323,monospace;">' + cData.name + '</div>';
    html += '<div style="font-size:1.5rem;color:var(--ok);font-weight:bold;font-family:VT323,monospace;line-height:1.2;">' + count + '</div>';
    html += '<div style="font-size:.58rem;color:var(--dim);margin-top:1px;">en base</div>';
    html += '</div>';
  });

  html += '</div>';

  if (!hasAny) {
    box.innerHTML = '<div style="color:var(--dim);font-size:.8rem;">No tienes criaturas invocadas</div>';
  } else {
    box.innerHTML = html;
  }
}

// ============================================================
// ⛏️ v1.47: CRIATURAS CAZADAS — Apartado especial para guardiancueva
// ============================================================

function renderCaughtCreatures() {
  var box = document.getElementById('caughtCreaturesBox');
  if (!box || !activeVillage) return;

  var vs = activeVillage.state;
  var creatures = vs.creatures || defaultCreatures();
  var caughtCount = creatures.guardiancueva || 0;

  // ── v1.48: Verificar contra tabla caves que los guardianes pertenecen a ESTA aldea ──
  // Evita mostrar guardianes fantasma cuando el jugador tiene múltiples aldeas
  // o cuando el estado está desincronizado (admin revoke, muerte en combate, etc.)
  if (typeof _cavesCache !== 'undefined' && _cavesCache.length > 0) {
    var cavesOwnedByVillage = _cavesCache.filter(function (c) {
      return c.status === 'captured' && c.village_id === activeVillage.id;
    }).length;

    // Contar guardianes en misión (están fuera de vs.creatures pero siguen siendo de esta aldea)
    var guardiansInMission = 0;
    (vs.mission_queue || []).forEach(function (m) {
      if (m.troops && (m.troops.guardiancueva || 0) > 0) guardiansInMission += m.troops.guardiancueva;
    });

    var expectedTotal = cavesOwnedByVillage; // cada cueva capturada = 1 guardián
    var actualTotal = caughtCount + guardiansInMission;

    if (actualTotal > expectedTotal) {
      // Más guardianes en estado que cuevas capturadas → corregir
      vs.creatures.guardiancueva = Math.max(0, expectedTotal - guardiansInMission);
      caughtCount = vs.creatures.guardiancueva;
      if (typeof scheduleSave === 'function') scheduleSave();
    } else if (actualTotal < expectedTotal) {
      // Menos guardianes de los esperados → restaurar los que faltan
      vs.creatures.guardiancueva = expectedTotal - guardiansInMission;
      caughtCount = vs.creatures.guardiancueva;
      if (typeof scheduleSave === 'function') scheduleSave();
    }
  }

  if (caughtCount === 0) {
    // Comprobar si hay guardianes en misión para mostrar info
    var inMissionOnly = 0;
    (vs.mission_queue || []).forEach(function (m) {
      if (m.troops && (m.troops.guardiancueva || 0) > 0) inMissionOnly += m.troops.guardiancueva;
    });
    if (inMissionOnly > 0) {
      box.innerHTML = '<div style="color:var(--accent);font-size:.8rem;">🚶 ' + inMissionOnly + ' guardián' + (inMissionOnly > 1 ? 'es' : '') + ' en misión</div>';
    } else {
      box.innerHTML = '<div style="color:var(--dim);font-size:.8rem;">Aún no has capturado guardianes de cuevas</div>';
    }
    return;
  }

  // Contar los que están en misión para info adicional
  var guardiansInMissionDisplay = 0;
  (vs.mission_queue || []).forEach(function (m) {
    if (m.troops && (m.troops.guardiancueva || 0) > 0) guardiansInMissionDisplay += m.troops.guardiancueva;
  });

  var cData = CREATURE_TYPES.guardiancueva || {};
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">';

  html += '<div style="background:linear-gradient(135deg,rgba(255,215,0,.15),rgba(184,134,11,.1));border:2px solid rgba(255,215,0,.4);padding:10px;border-radius:6px;text-align:center;position:relative;box-shadow:0 0 12px rgba(255,215,0,.1);">';
  html += '<div style="position:absolute;top:6px;left:6px;font-size:.55rem;color:var(--gold);letter-spacing:.08em;background:rgba(255,215,0,.2);border:1px solid rgba(255,215,0,.4);border-radius:3px;padding:1px 4px;font-weight:bold;">⛏️ CAPTURADO</div>';
  html += '<button onclick="showCreatureStats(\'guardiancueva\')" title="Ver estadísticas" style="background:none;border:none;cursor:pointer;font-size:2.2rem;padding:0;line-height:1;margin-top:6px;display:block;width:100%;">' + cData.icon + '</button>';
  html += '<div style="font-size:.78rem;color:var(--gold);margin-top:5px;font-family:VT323,monospace;font-weight:bold;">' + (cData.name || 'Guardián') + '</div>';
  html += '<div style="font-size:1.5rem;color:var(--gold);font-weight:bold;font-family:VT323,monospace;line-height:1.2;">' + caughtCount + '</div>';
  html += '<div style="font-size:.58rem;color:var(--dim);margin-top:1px;">en base' + (guardiansInMissionDisplay > 0 ? ' · <span style="color:var(--accent);">' + guardiansInMissionDisplay + ' en misión</span>' : '') + '</div>';
  html += '</div>';

  html += '</div>';
  box.innerHTML = html;
}

function showCreatureStats(key) {
  var c = CREATURE_TYPES[key];
  if (!c) return;
  var existing = document.getElementById('creatureStatsModal');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'creatureStatsModal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  window._closeCreatureStats = function () { var m = document.getElementById('creatureStatsModal'); if (m) m.remove(); };
  overlay.innerHTML = '<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:20px;max-width:340px;width:90%;font-family:VT323,monospace;">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px;">'
    + '<span style="font-size:2.5rem;">' + c.icon + '</span>'
    + '<div><div style="font-size:1.2rem;color:var(--accent);">' + c.name + '</div>'
    + '<div style="font-size:.7rem;color:var(--esencia);">TIER ' + c.tier + ' — ' + (c.type || 'criatura') + '</div></div>'
    + '<button onclick="_closeCreatureStats()" style="margin-left:auto;background:none;border:none;color:var(--dim);font-size:1.2rem;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.82rem;margin-bottom:14px;">'
    + '<div style="grid-column:1/-1;border-top:1px solid var(--border);margin:4px 0;padding-top:4px;font-size:.65rem;letter-spacing:.12em;color:var(--dim);opacity:.7;">OFENSA</div>'
    + '<div style="color:var(--dim);">⚔️ Daño</div><div style="color:var(--text);">' + c.damage + '</div>'
    + '<div style="color:var(--dim);">⚡ Ataques/turno</div><div style="color:var(--text);">' + c.attacksPerTurn + '</div>'
    + '<div style="color:var(--dim);">🎯 Prob. Golpe</div><div style="color:var(--text);">' + c.attackChance + '</div>'
    + '<div style="color:var(--dim);">🌀 Destreza</div><div style="color:var(--text);">' + c.dexterity + '</div>'
    + '<div style="grid-column:1/-1;border-top:1px solid var(--border);margin:4px 0;padding-top:4px;font-size:.65rem;letter-spacing:.12em;color:var(--dim);opacity:.7;">DEFENSA</div>'
    + '<div style="color:var(--dim);">❤️ HP</div><div style="color:var(--text);">' + c.hp + '</div>'
    + '<div style="color:var(--dim);">🛡️ Defensa</div><div style="color:var(--text);">' + c.defense + '</div>'
    + '<div style="grid-column:1/-1;border-top:1px solid var(--border);margin:4px 0;padding-top:4px;font-size:.65rem;letter-spacing:.12em;color:var(--dim);opacity:.7;">MOVILIDAD</div>'
    + '<div style="color:var(--dim);">🏃 Velocidad</div><div style="color:var(--text);">' + c.speed + ' <span style="font-size:.68rem;color:var(--dim);">cas/h</span></div>'
    + '</div>'
    + '<div style="font-size:.72rem;color:var(--dim);border-top:1px solid var(--border);padding-top:10px;margin-bottom:10px;">' + escapeHtml(c.desc) + '</div>'
    + '<div style="font-size:.75rem;background:var(--panel2);border-radius:6px;padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:4px;text-align:center;">'
    + '<div><div style="color:var(--dim);">Invocadores</div><div style="color:var(--esencia);">' + c.summonersNeeded + '</div></div>'
    + '<div><div style="color:var(--dim);">Esencia</div><div style="color:var(--esencia);">✨ ' + c.cost.esencia + '</div></div>'
    + '</div>'
    + '<div style="font-size:.6rem;color:var(--dim);opacity:.45;text-align:center;margin-top:6px;">⏱ ' + Math.floor(c.time / 60) + 'min de invocación</div>'
    + '</div>';
  document.body.appendChild(overlay);
}

function renderSummonOptions() {
  var box = document.getElementById('summonBox');
  if (!box || !activeVillage) return;

  var vs = activeVillage.state;
  var torreLevel = (vs.buildings.torreinvocacion && vs.buildings.torreinvocacion.level) || 0;

  if (torreLevel === 0) {
    box.innerHTML = '<div style="color:var(--danger);font-size:.85rem;">⚠️ Construye la Torre de Invocación primero</div>';
    return;
  }

  var invocadorLevel = getTroopLevel('invocador');
  var invocadoresActuales = vs.troops.invocador || 0;

  var html = '<div style="display:grid;gap:10px;">';

  var tiers = {};
  Object.keys(CREATURE_TYPES).forEach(function (key) {
    var cData = CREATURE_TYPES[key];
    // ⛏️ v1.48: Criaturas capturadas NO son invocables — excluir del listado
    if (cData.isCaveGuardian) return;
    if (!tiers[cData.tier]) tiers[cData.tier] = [];
    tiers[cData.tier].push({ key: key, data: cData });
  });

  Object.keys(tiers).sort().forEach(function (tier) {
    var tierInt = parseInt(tier);
    var visible = torreLevel >= tierInt;
    var unlocked = invocadorLevel >= tierInt;

    if (!visible) return;

    html += '<div style="background:var(--panel2);padding:10px;border-radius:6px;border-top:2px solid rgba(192,132,252,' + (0.15 + tierInt * 0.08) + ');">';
    html += '<div style="font-size:.63rem;color:var(--esencia);letter-spacing:.12em;opacity:.9;margin-bottom:10px;display:flex;align-items:center;gap:6px;">';
    html += '<span>TIER ' + tier + '</span>';
    html += '<span style="flex:1;height:1px;background:rgba(192,132,252,.15);"></span>';
    html += '</div>';

    tiers[tier].forEach(function (c) {
      var canSummonResult = canSummon(c.key, vs);
      var isOk = canSummonResult.ok;

      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg);border-radius:4px;margin-bottom:6px;' + (!unlocked ? 'opacity:.5;filter:grayscale(.4);' : (!isOk ? 'opacity:.7;' : '')) + '">';
      html += '<button onclick="showCreatureStats(\'' + c.key + '\')" title="Ver estadísticas" style="background:none;border:none;cursor:pointer;font-size:1.8rem;padding:0;line-height:1;flex-shrink:0;">' + c.data.icon + '</button>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-size:.85rem;color:var(--text);">' + c.data.name + '</div>';
      html += '<div style="font-size:.68rem;color:var(--dim);margin-top:2px;">';
      html += '🧙‍♂️ ' + c.data.summonersNeeded + ' · ✨ ' + c.data.cost.esencia + ' · ⏱ ' + Math.floor(c.data.time / 60) + 'min';
      html += '</div>';
      if (!unlocked) {
        html += '<div style="font-size:.63rem;color:var(--dim);margin-top:2px;">🔒 Requiere invocadores de nivel ' + tierInt + ' para invocar</div>';
      } else if (!isOk) {
        html += '<div style="font-size:.63rem;color:var(--danger);margin-top:2px;">' + escapeHtml(canSummonResult.reason) + '</div>';
      }
      html += '</div>';
      html += '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">';
      html += '<input id="summonQty_' + c.key + '" type="number" value="1" min="1" max="99" style="width:46px;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-family:VT323,monospace;font-size:.85rem;text-align:center;">';
      html += '<button onclick="startSummoningFromInput(\'' + c.key + '\')" ' + (!isOk ? 'disabled' : '') + ' style="background:' + (isOk ? 'var(--ok)' : 'var(--border)') + ';border:none;color:white;padding:5px 10px;border-radius:4px;cursor:' + (isOk ? 'pointer' : 'default') + ';font-size:.75rem;white-space:nowrap;">+ Cola</button>';
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
  });

  html += '</div>';
  box.innerHTML = html;
}

// v1.66: invocar criatura via servidor
function startSummoningFromInput(key) {
  startSummoning(key);
}

async function startSummoning(key) {
  if (!activeVillage) return;

  setSave('saving');
  try {
    var { data: newState, error } = await sbClient.rpc('start_summoning_secure', {
      p_village_id:   activeVillage.id,
      p_creature_key: key
    });
    if (error) throw error;

    if (newState) {
      var vs = activeVillage.state;
      vs.resources        = newState.resources        || vs.resources;
      vs.summoning_queue  = newState.summoning_queue  || [];
      vs.last_updated     = newState.last_updated     || vs.last_updated;
    }

    var c = typeof CREATURE_TYPES !== 'undefined' ? CREATURE_TYPES[key] : null;
    showNotif((c ? c.name : key) + ' añadido a la cola de invocación', 'ok');
    setSave('saved');
    tick();
    if (typeof renderCreatures === 'function') renderCreatures();
    renderSummoningQueue();
  } catch (e) {
    setSave('error');
    showNotif('Error: ' + (e.message || 'No se pudo iniciar invocación'), 'err');
    console.error('startSummoning error:', e);
  }
}

function showBarracasModal() {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var barrCap = getBarracksCapacity(vs.buildings);
  var usedSlots = getBarracksUsed(vs);

  var html = '<div class="bld-modal-overlay" id="barrOverlay" onclick="if(event.target.id===\'barrOverlay\') this.remove()">'
    + '<div class="bld-modal" style="max-width:800px;">'
    + '<div class="bld-modal-head">'
    + '<div class="bld-modal-icon">🏰</div>'
    + '<div><div class="bld-modal-title">BARRACAS</div>'
    + '<div class="bld-modal-sub">Recluta tropas para tu ejército. Plazas: ' + usedSlots + ' / ' + barrCap + '</div></div>'
    + '<button class="bld-modal-close" onclick="this.closest(\'.bld-modal-overlay\').remove()">&#x2715;</button>'
    + '</div>'
    + '<div class="bld-modal-body" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:15px;padding:20px;">';

  Object.keys(TROOP_TYPES).forEach(function (key) {
    var stats = getTroopStatsWithLevel(key, 1);
    var cost = stats.cost || {};
    html += '<div style="background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<span style="font-size:1.8rem;">' + stats.icon + '</span>'
      + '<div style="flex:1;">'
      + '<div style="font-size:.9rem;font-weight:700;">' + stats.name + '</div>'
      + '<div style="font-size:.65rem;color:var(--dim);">' + stats.desc + '</div>'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:10px;font-size:.75rem;flex-wrap:wrap;color:var(--accent);">';
    if (cost.madera) html += '<span>🌲 ' + cost.madera + '</span>';
    if (cost.hierro) html += '<span>⚙️ ' + cost.hierro + '</span>';
    if (cost.prov) html += '<span>🌾 ' + cost.prov + '</span>';
    if (cost.esencia) html += '<span>✨ ' + cost.esencia + '</span>';
    html += '</div>'
      + '<div style="display:flex;gap:6px;margin-top:4px;">'
      + '<input type="number" id="recAmount-' + key + '" value="1" min="1" class="input" style="flex:1;padding:4px 8px;font-size:.8rem;">'
      + '<button class="btn" style="padding:6px 12px;font-size:.75rem;" onclick="startRecruitment(\'' + key + '\')">Reclutar</button>'
      + '</div>'
      + '</div>';
  });

  html += '</div></div></div>';
  var mod = document.createElement('div');
  mod.innerHTML = html;
  document.body.appendChild(mod.firstChild);
}

function startRecruitmentFromInput(type) {
  var input = document.getElementById('trainQty_' + type);
  var amount = input ? (parseInt(input.value) || 1) : 1;
  startRecruitment(type, amount);
}

// v1.66: server-authoritative — valida barracas, recursos y aldeanos en servidor
async function startRecruitment(type, amount) {
  if (!activeVillage) return;
  if (!amount || amount <= 0) return;

  setSave('saving');
  try {
    var { data: newState, error } = await sbClient.rpc('start_training_secure', {
      p_village_id: activeVillage.id,
      p_troop_type: type,
      p_amount:     amount
    });
    if (error) throw error;

    if (newState) {
      var vs = activeVillage.state;
      vs.resources      = newState.resources      || vs.resources;
      vs.troops         = newState.troops          || vs.troops;
      vs.training_queue = newState.training_queue  || [];
      vs.last_updated   = newState.last_updated    || vs.last_updated;
    }

    var stats = getTroopStatsWithLevel(type, 1);
    showNotif(amount + ' ' + (stats ? stats.name : type) + ' en cola de entrenamiento', 'ok');
    setSave('saved');
    tick();
    renderTroops();
    renderTrainingQueue();
  } catch (e) {
    setSave('error');
    showNotif('Error: ' + (e.message || 'No se pudo iniciar entrenamiento'), 'err');
    console.error('startRecruitment error:', e);
  }
}

// v1.66: server-authoritative — devuelve recursos y aldeanos via servidor
async function cancelTrainingQueue() {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  if (!vs.training_queue || vs.training_queue.length === 0) {
    showNotif('No hay tropas en entrenamiento.', 'err'); return;
  }

  setSave('saving');
  try {
    var { data: newState, error } = await sbClient.rpc('cancel_training_secure', {
      p_village_id: activeVillage.id
    });
    if (error) throw error;

    if (newState) {
      vs.resources      = newState.resources  || vs.resources;
      vs.troops         = newState.troops      || vs.troops;
      vs.last_updated   = newState.last_updated || vs.last_updated;
    }
    vs.training_queue = [];

    showNotif('Cola cancelada. Recursos y aldeanos devueltos.', 'ok');
    setSave('saved');
    tick();
    renderTroops();
    renderTrainingQueue();
  } catch (e) {
    setSave('error');
    showNotif('Error cancelando: ' + (e.message || ''), 'err');
    console.error('cancelTrainingQueue error:', e);
  }
}

// ============================================================
// showTroopStats — v1.44: muestra stats REALES (con investigación + herrería)
// ============================================================
function showTroopStats(key) {
  var t = TROOP_TYPES[key];
  if (!t) return;
  var existing = document.getElementById('troopStatsModal');
  if (existing) existing.remove();
  window._closeTroopStats = function () { var m = document.getElementById('troopStatsModal'); if (m) m.remove(); };

  // Niveles de equipamiento desde herrería
  var wLvl = (typeof _researchData !== 'undefined' && _researchData && _researchData.weapon_levels && _researchData.weapon_levels[key]) || 0;
  var aLvl = (typeof _researchData !== 'undefined' && _researchData && _researchData.armor_levels && _researchData.armor_levels[key]) || 0;

  // Stats REALES: nivel de investigación aplicado + bonuses de herrería
  var troopLvl = (typeof getTroopLevel === 'function') ? getTroopLevel(key) : 1;
  var s = (typeof getTroopStatsWithLevel === 'function') ? getTroopStatsWithLevel(key, troopLvl) : t;

  // Aplicar bonificaciones de herrería (igual que createArmy en game-combat.js)
  var realDamage = (s.damage || t.damage) + (wLvl > 0 ? wLvl : 0);
  var realDefense = (s.defense || t.defense) + (aLvl > 0 ? aLvl : 0);
  var realHp = s.hp || t.hp;
  var realAtk = s.attacksPerTurn || t.attacksPerTurn;
  var realChance = s.attackChance || t.attackChance;
  var realDex = s.dexterity || t.dexterity;
  var realSpeed = s.speed || t.speed;
  var realCap = s.capacity || t.capacity;

  // helpers para mostrar delta
  var dmgBonus = realDamage - t.damage;
  var defBonus = realDefense - t.defense;
  var hpBonus = realHp - t.hp;

  var overlay = document.createElement('div');
  overlay.id = 'troopStatsModal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:20px;max-width:340px;width:90%;font-family:VT323,monospace;">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px;">'
    + '<span style="font-size:2.5rem;">' + t.icon + '</span>'
    + '<div><div style="font-size:1.2rem;color:var(--accent);">' + t.name + '</div>'
    + '<div style="font-size:.7rem;color:var(--dim);">Tropa · ' + (t.barracasSlots || 1) + ' plaza' + ((t.barracasSlots || 1) > 1 ? 's' : '') + ' · ⏱ ' + Math.floor((t.time || 180) / 60) + 'min'
    + (troopLvl > 1 ? ' · <span style="color:var(--ok);">Nv.' + troopLvl + '</span>' : '') + '</div></div>'
    + '<button onclick="_closeTroopStats()" style="margin-left:auto;background:none;border:none;color:var(--dim);font-size:1.2rem;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.82rem;margin-bottom:14px;">'

    // — OFENSA —
    + '<div style="grid-column:1/-1;border-top:1px solid var(--border);margin:4px 0;padding-top:4px;font-size:.65rem;letter-spacing:.12em;color:var(--dim);opacity:.7;">OFENSA</div>'
    + '<div style="color:var(--dim);">⚔️ Daño</div>'
    + '<div style="color:var(--text);">' + realDamage
    + (dmgBonus > 0 ? ' <span style="font-size:.65rem;color:var(--ok);">(+' + dmgBonus + ' vs base ' + t.damage + ')</span>' : '') + '</div>'
    + '<div style="color:var(--dim);">⚡ Ataques/turno</div><div style="color:var(--text);">' + realAtk + '</div>'
    + '<div style="color:var(--dim);">🎯 Prob. Golpe</div><div style="color:var(--text);">' + realChance + '</div>'
    + '<div style="color:var(--dim);">🌀 Destreza</div><div style="color:var(--text);">' + realDex + '</div>'

    // — DEFENSA —
    + '<div style="grid-column:1/-1;border-top:1px solid var(--border);margin:4px 0;padding-top:4px;font-size:.65rem;letter-spacing:.12em;color:var(--dim);opacity:.7;">DEFENSA</div>'
    + '<div style="color:var(--dim);">❤️ HP</div>'
    + '<div style="color:var(--text);">' + realHp
    + (hpBonus > 0 ? ' <span style="font-size:.65rem;color:var(--ok);">(+' + hpBonus + ')</span>' : '') + '</div>'
    + '<div style="color:var(--dim);">🛡️ Defensa</div>'
    + '<div style="color:var(--text);">' + realDefense
    + (defBonus > 0 ? ' <span style="font-size:.65rem;color:var(--accent);">(+' + defBonus + ')</span>' : '') + '</div>'

    // — EQUIPAMIENTO (herrería) —
    + '<div style="grid-column:1/-1;border-top:1px solid var(--border);margin:4px 0;padding-top:4px;font-size:.65rem;letter-spacing:.12em;color:var(--dim);opacity:.7;">EQUIPAMIENTO</div>'
    + '<div style="color:var(--dim);">🗡️ Arma</div><div style="color:' + (wLvl > 0 ? 'var(--ok)' : 'var(--dim)') + ';">+' + wLvl + (wLvl === 0 ? ' (sin mejorar)' : '') + '</div>'
    + '<div style="color:var(--dim);">🛡 Armadura</div><div style="color:' + (aLvl > 0 ? 'var(--accent)' : 'var(--dim)') + ';">+' + aLvl + (aLvl === 0 ? ' (sin mejorar)' : '') + '</div>'

    // — LOGÍSTICA —
    + '<div style="grid-column:1/-1;border-top:1px solid var(--border);margin:4px 0;padding-top:4px;font-size:.65rem;letter-spacing:.12em;color:var(--dim);opacity:.7;">LOGÍSTICA</div>'
    + '<div style="color:var(--dim);">🏃 Velocidad</div>'
    + '<div style="color:var(--text);">' + realSpeed + ' <span style="font-size:.68rem;color:var(--dim);">cas/h</span></div>'
    + '<div style="color:var(--dim);">📦 Cap. carga</div><div style="color:var(--text);">' + realCap + '</div>'

    + '</div>'
    + '<div style="font-size:.72rem;color:var(--dim);border-top:1px solid var(--border);padding-top:10px;">' + escapeHtml(t.desc) + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
}

function renderTrainOptions() {
  var box = document.getElementById('trainOptionsBox');
  if (!box || !activeVillage) return;
  var vs = activeVillage.state;
  var troops = vs.troops || {};
  var res = calcRes(vs);
  var cuartLvl = (vs.buildings.cuarteles && vs.buildings.cuarteles.level) || 0;
  var cuartRed = getCuartelesReduction(vs.buildings);
  var aldLibres = res.aldeanos_libres || 0;
  var aldTotal = res.aldeanos_total || 0;
  var barrCap = getBarracksCapacity(vs.buildings);
  var usedSlots = getBarracksUsed(vs);
  var barrLvl = (vs.buildings.barracas && vs.buildings.barracas.level) || 0;

  var barrPct = barrCap > 0 ? Math.min(100, Math.round(usedSlots / barrCap * 100)) : 0;
  var barrColor = barrPct >= 90 ? 'var(--danger)' : barrPct >= 70 ? 'var(--gold)' : 'var(--ok)';
  var html = '';

  html += '<div style="margin-bottom:14px;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">';
  html += '<span style="font-size:.65rem;color:var(--dim);letter-spacing:.1em;">BARRACAS</span>';
  html += '<span style="font-family:VT323,monospace;color:' + barrColor + ';">' + usedSlots + ' <span style="color:var(--dim);">/ ' + barrCap + '</span></span>';
  html += '</div>';
  html += '<div style="height:4px;background:rgba(255,255,255,.07);border-radius:2px;">';
  html += '<div style="height:4px;width:' + barrPct + '%;background:' + barrColor + ';border-radius:2px;transition:width .3s;"></div>';
  html += '</div>';
  if (cuartLvl > 0) {
    html += '<div style="font-size:.63rem;color:var(--ok);margin-top:5px;">🎖️ Cuarteles Nv.' + cuartLvl + ' · -' + Math.round(cuartRed * 100) + '% tiempo de entrenamiento</div>';
  }
  html += '</div>';

  html += '<div style="display:grid;gap:7px;">';

  var ald = TROOP_TYPES['aldeano'];
  html += '<div style="font-size:.63rem;color:var(--dim);letter-spacing:.12em;opacity:.8;padding:4px 0 5px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:2px;">CIVILES</div>';
  html += '<div style="display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--panel2);border-radius:7px;border:1px solid rgba(255,221,96,.18);">';
  html += '<button onclick="showTroopStats(\'aldeano\')" title="Ver estadísticas" style="background:none;border:none;cursor:pointer;font-size:2.2rem;padding:0;line-height:1;flex-shrink:0;">' + ald.icon + '</button>';
  html += '<div style="flex:1;min-width:0;">';
  html += '<div style="font-size:1.1rem;color:var(--aldeanos);font-family:VT323,monospace;">' + ald.name + '</div>';
  html += '<div style="font-size:.72rem;color:var(--dim);margin-top:2px;">Tropa base · Se generan automáticamente · <span style="color:var(--aldeanos);">' + aldLibres + ' libres</span></div>';
  html += '</div>';
  html += '<div style="font-size:1.8rem;color:var(--aldeanos);font-family:VT323,monospace;font-weight:bold;flex-shrink:0;">' + aldTotal + '</div>';
  html += '</div>';

  if (barrLvl === 0) {
    html += '<div style="color:var(--danger);font-size:.85rem;padding:8px 0;">⚠️ Construye las Barracas para entrenar tropas militares</div>';
    html += '</div>';
    box.innerHTML = html;
    return;
  }

  html += '<div style="font-size:.63rem;color:var(--dim);letter-spacing:.12em;opacity:.8;padding:4px 0 5px;border-bottom:1px solid rgba(255,255,255,.06);margin-top:6px;margin-bottom:2px;">MILITARES</div>';
  Object.keys(TROOP_TYPES).forEach(function (key) {
    if (key === 'aldeano') return;
    var t = TROOP_TYPES[key];
    var count = troops[key] || 0;
    var baseTime = t.time || 180;
    var finalTime = Math.max(30, Math.floor(baseTime * (1 - cuartRed)));
    var mins = Math.floor(finalTime / 60);
    var secs = finalTime % 60;
    var timeStr = mins + 'min' + (secs ? ' ' + secs + 's' : '');
    var costPerUnit = t.cost || {};
    var canAffordOne = canAfford(costPerUnit, res);
    var hasAldeano = aldLibres >= 1;
    var canTrain = canAffordOne && hasAldeano;
    var costStr = '';
    if (costPerUnit.hierro) costStr += '⚙️' + costPerUnit.hierro + ' ';
    if (costPerUnit.madera) costStr += '🌲' + costPerUnit.madera + ' ';
    if (costPerUnit.piedra) costStr += '⛰️' + costPerUnit.piedra + ' ';
    if (costPerUnit.esencia) costStr += '✨' + costPerUnit.esencia + ' ';
    if (costPerUnit.prov) costStr += '🌾' + costPerUnit.prov + ' ';

    html += '<div style="display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--panel2);border-radius:7px;border:1px solid ' + (canTrain ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.02)') + ';' + (!canTrain ? 'opacity:.6;' : '') + '">';
    html += '<button onclick="showTroopStats(\'' + key + '\')" title="Ver estadísticas" style="background:none;border:none;cursor:pointer;font-size:2.2rem;padding:0;line-height:1;flex-shrink:0;">' + t.icon + '</button>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:1.1rem;color:var(--text);font-family:VT323,monospace;">' + t.name + '</div>';
    html += '<div style="font-size:.7rem;color:var(--dim);margin-top:2px;">' + (costStr.trim() || '—') + '</div>';
    html += '<div style="font-size:.65rem;color:var(--dim);opacity:.7;margin-top:1px;">⏱ ' + timeStr + '</div>';
    if (!hasAldeano) html += '<div style="font-size:.67rem;color:var(--danger);margin-top:2px;">Sin aldeanos libres</div>';
    else if (!canAffordOne) html += '<div style="font-size:.67rem;color:var(--danger);margin-top:2px;">Sin recursos</div>';
    html += '</div>';
    html += '<div style="text-align:right;flex-shrink:0;margin-right:10px;min-width:36px;">';
    html += '<div style="font-size:1.8rem;color:' + (count > 0 ? 'var(--accent)' : 'var(--dim)') + ';font-family:VT323,monospace;line-height:1;">' + count + '</div>';
    html += '<div style="font-size:.6rem;color:var(--dim);">en base</div>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">';
    html += '<input id="trainQty_' + key + '" type="number" value="1" min="1" max="99" style="width:48px;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:5px;padding:5px 6px;color:var(--text);font-family:VT323,monospace;font-size:1rem;text-align:center;">';
    html += '<button onclick="startRecruitmentFromInput(\'' + key + '\')" ' + (!canTrain ? 'disabled' : '') + ' style="background:' + (canTrain ? 'var(--accent)' : 'var(--border)') + ';border:none;color:' + (canTrain ? 'var(--bg)' : 'var(--dim)') + ';padding:6px 13px;border-radius:5px;cursor:' + (canTrain ? 'pointer' : 'default') + ';font-family:VT323,monospace;font-size:1rem;white-space:nowrap;font-weight:bold;">+ Cola</button>';
    html += '</div>';
    html += '</div>';
  });

  html += '</div>';
  box.innerHTML = html;
}

function resolveTrainingQueue(vs) {
  if (!vs.training_queue || vs.training_queue.length === 0) return vs;
  var now = Date.now();
  var remaining = [];
  var changed = false;
  for (var t of vs.training_queue) {
    var finishTime = new Date(t.finish_at).getTime();
    if (finishTime <= now) {
      if (!vs.troops) vs.troops = {};
      vs.troops[t.type] = (vs.troops[t.type] || 0) + 1;
      changed = true;
    } else {
      remaining.push(t);
    }
  }
  vs.training_queue = remaining;
  return vs;
}

function resolveSummoningQueue(vs) {
  if (!vs.summoning_queue || vs.summoning_queue.length === 0) return vs;
  var now = Date.now();
  var changed = false;

  var invEnRefugio = (vs.refugio && vs.refugio.invocador) || 0;
  var invocadoresActuales = Math.max(0, (vs.troops.invocador || 0) - invEnRefugio);

  // Mientras haya algo en la cola, intentamos procesar el PRIMERO (estricto FIFO)
  while (vs.summoning_queue.length > 0) {
    var s = vs.summoning_queue[0];
    var cData = CREATURE_TYPES[s.creature];

    // Si la criatura fue eliminada de constantes (?) simplemente la quitamos para que no bloquee
    if (!cData) {
      vs.summoning_queue.shift();
      changed = true;
      continue;
    }

    var tierRequired = s.tierRequired || cData.tier || 1;
    var invocadorLevel = getTroopLevel('invocador');

    // Casos de cancelación (eliminación definitiva)
    if (invocadorLevel < tierRequired) {
      _notifyOnce('sum_cancel_' + s.creature, '⚠️ Invocación de ' + cData.name + ' cancelada (nivel de invocador insuficiente).', 'err');
      vs.summoning_queue.shift();
      changed = true;
      continue;
    }

    // El sistema de cancelación por falta de invocadores TOTALES es peligroso si es reactivo,
    // pero se mantiene según arquitectura v1.40.
    var invEnMision = 0;
    (vs.mission_queue || []).forEach(function (m) { invEnMision += (m.troops && m.troops.invocador) || 0; });
    var totalInvocadores = invocadoresActuales + invEnMision;

    if (totalInvocadores < s.summonersNeeded) {
      _notifyOnce('sum_cancel_dead_' + s.creature, '⚠️ Invocación de ' + cData.name + ' cancelada (invocadores perdidos).', 'err');
      vs.summoning_queue.shift();
      changed = true;
      continue;
    }

    // --- LÓGICA FIFO BLOQUEANTE ---

    // Si no hay suficientes invocadores EN LA ALDEA ahora mismo, la cola se bloquea.
    // No saltamos al siguiente elemento.
    if (invocadoresActuales < s.summonersNeeded) {
      break;
    }

    var finishTime = new Date(s.finish_at).getTime();
    if (now >= finishTime && !s.paused) {
      // Completado exitosamente
      if (!vs.creatures) vs.creatures = defaultCreatures();
      vs.creatures[s.creature] = (vs.creatures[s.creature] || 0) + 1;
      _notifyOnce('sum_done_' + s.creature, '¡' + cData.name + ' invocado!', 'ok', 1000);
      vs.summoning_queue.shift();
      changed = true;
      // Seguimos el bucle 'while' para ver si la siguiente unidad en la cola ya terminó también
    } else {
      // El primer elemento no ha terminado su tiempo todavía. 
      // Siendo FIFO, el resto tampoco puede procesarse.
      break;
    }
  }

  return vs;
}

function renderTrainingQueue() {
  var box = document.getElementById('trainingQueueBox');
  if (!box || !activeVillage) return;
  var vs = activeVillage.state;
  var queue = vs.training_queue || [];
  var now = Date.now();

  box.style.cssText = 'height:160px;overflow-y:auto;overflow-x:hidden;';

  if (queue.length === 0) {
    box.innerHTML = '<div class="tq-empty">⚔ Sin tropas en entrenamiento</div>';
    return;
  }

  var html = '';
  var lastFinish = new Date(queue[queue.length - 1].finish_at);
  var lastStr = lastFinish.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  var totalSecsLeft = Math.max(0, Math.ceil((lastFinish.getTime() - now) / 1000));

  html += '<div class="tq-header">'
    + '<span class="tq-header-count">' + queue.length + ' tropa(s) en cola</span>'
    + '<button class="tq-cancel-btn" onclick="cancelTrainingQueue()">✕ Cancelar todo</button>'
    + '</div>';

  var active = queue[0];
  var tStats = TROOP_TYPES[active.type];
  if (tStats) {
    var finish = new Date(active.finish_at).getTime();
    var timeLeft = Math.max(0, Math.ceil((finish - now) / 1000));
    var start = new Date(active.start_at).getTime();
    var total = Math.max(1, (finish - start) / 1000);
    var pct = Math.min(100, Math.round(((total - timeLeft) / total) * 100));
    var arrStr = new Date(finish).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    html += '<div class="tq-active">'
      + '<div class="tq-active-icon">' + tStats.icon + '</div>'
      + '<div class="tq-active-info">'
      + '<div class="tq-active-name">' + tStats.name + '</div>'
      + '<div class="tq-bar"><div class="tq-bar-fill" style="width:' + pct + '%"></div></div>'
      + '<div class="tq-active-time">' + fmtTime(timeLeft) + ' restantes · termina ' + arrStr + '</div>'
      + '<div class="tq-active-eta">Cola completa (' + queue.length + '): '
      + fmtTime(totalSecsLeft) + ' · <b>' + lastStr + '</b></div>'
      + '</div>'
      + '</div>';
  }

  if (queue.length > 1) {
    var waiting = queue.slice(1);
    var counts = {};
    waiting.forEach(function (t) { counts[t.type] = (counts[t.type] || 0) + 1; });

    html += '<div class="tq-waiting">'
      + '<div class="tq-waiting-label">En espera</div>'
      + '<div class="tq-chips">';

    Object.keys(counts).forEach(function (key) {
      var ts = TROOP_TYPES[key];
      if (!ts) return;
      html += '<div class="tq-chip">'
        + '<span class="tq-chip-icon">' + ts.icon + '</span>'
        + '<span>' + ts.name + '</span>'
        + (counts[key] > 1 ? '<span class="tq-chip-count">×' + counts[key] + '</span>' : '')
        + '</div>';
    });

    html += '</div></div>';
  }

  box.innerHTML = html;
}

// ============================================================
// REFUGIO — render, apply, invocador queue check
// ============================================================

function renderRefugio() {
  var box = document.getElementById('refugioContent');
  if (!box || !activeVillage) return;
  var vs = activeVillage.state;
  var lvl = (vs.buildings.refugio && vs.buildings.refugio.level) || 0;

  if (lvl === 0) {
    box.innerHTML = '<div class="card" style="text-align:center;padding:36px 20px;color:var(--dim);">'
      + '<div style="font-size:3rem;margin-bottom:14px;">🕵️</div>'
      + '<div style="font-size:.85rem;max-width:360px;margin:auto;line-height:1.7;">'
      + 'Construye el <b style="color:var(--accent)">Refugio</b> desde el panel de Edificios para esconder tropas de espionajes y ataques.</div></div>';
    return;
  }

  var cap = getRefugioCapacity(vs.buildings);
  var refugio = vs.refugio || {};
  var used = getRefugioUsed(vs);
  var missions = vs.mission_queue || [];

  var inMission = {};
  missions.forEach(function (m) {
    if (!m.troops) return;
    Object.keys(m.troops).forEach(function (k) { inMission[k] = (inMission[k] || 0) + (m.troops[k] || 0); });
  });

  var pct = cap > 0 ? Math.min(100, Math.round(used / cap * 100)) : 0;
  var pctColor = pct >= 90 ? 'var(--danger)' : pct >= 60 ? 'var(--gold)' : 'var(--ok)';

  var nextLvl = lvl + 1;
  var nextCap = Math.floor(Math.round(50 * Math.pow(1.40, nextLvl - 1)) * 0.10);

  var html = '';

  html += '<div class="card" style="margin-bottom:14px;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html += '<div>';
  html += '<div class="muted" style="font-size:.68rem;letter-spacing:.08em;">REFUGIO — NIVEL ' + lvl + '</div>';
  html += '<div style="font-size:1.4rem;color:var(--accent);font-family:VT323,monospace;">';
  html += used + ' / <span style="color:var(--ok);">' + cap + '</span> plazas ocupadas</div>';
  html += '<div style="font-size:.62rem;color:var(--dim);margin-top:2px;">Nv.' + nextLvl + ' → ' + nextCap + ' plazas · Sube el Refugio para ampliar</div>';
  html += '</div>';
  html += '<div style="font-size:.68rem;color:var(--dim);text-align:right;line-height:1.8;">🕵️ Invisibles a espías<br>⚔️ No participan en defensa</div>';
  html += '</div>';
  html += '<div style="background:rgba(255,255,255,.07);height:6px;border-radius:3px;overflow:hidden;">';
  html += '<div style="height:6px;border-radius:3px;width:' + pct + '%;background:' + pctColor + ';transition:width .3s;"></div>';
  html += '</div></div>';

  html += '<div class="card"><div style="display:grid;gap:10px;">';
  var troopOrder = ['aldeano'].concat(Object.keys(TROOP_TYPES).filter(function (k) { return k !== 'aldeano'; }));
  var shownCivil = false, shownMilitar = false;
  troopOrder.forEach(function (key) {
    if (key === 'aldeano' && !shownCivil) {
      shownCivil = true;
      html += '<div style="font-size:.63rem;color:var(--dim);letter-spacing:.12em;opacity:.8;padding:2px 0 5px;border-bottom:1px solid rgba(255,255,255,.06);">CIVILES</div>';
    } else if (key !== 'aldeano' && !shownMilitar) {
      shownMilitar = true;
      html += '<div style="font-size:.63rem;color:var(--dim);letter-spacing:.12em;opacity:.8;padding:6px 0 5px;border-bottom:1px solid rgba(255,255,255,.06);">MILITARES</div>';
    }
    var t = TROOP_TYPES[key];
    var inBase = Math.max(0, (vs.troops[key] || 0) - (inMission[key] || 0));
    var inRef = refugio[key] || 0;
    var slotsPerUnit = t.barracasSlots || 1;
    var freeSlots = cap - used;
    var maxCanAdd = Math.floor(freeSlots / slotsPerUnit);
    var maxVal = Math.min(inRef + Math.max(0, maxCanAdd), inBase);

    var isInvocador = (key === 'invocador');
    var hasInBase = inBase > 0;
    html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);' + (hasInBase ? '' : 'opacity:.38;') + '">';
    html += '<span style="font-size:1.4rem;flex-shrink:0;">' + t.icon + '</span>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">';
    html += '<span style="font-size:.8rem;color:var(--text);">' + t.name + '</span>';
    html += '<span style="font-size:.72rem;color:var(--dim);">';
    html += '<span id="rfq_n_' + key + '" style="color:var(--accent);font-weight:bold;">' + inRef + '</span>';
    html += ' / ' + inBase + ' en base</span>';
    html += '</div>';
    html += '<input type="range" min="0" max="' + maxVal + '" value="' + inRef + '" id="rfs_' + key + '"';
    html += ' style="width:100%;accent-color:var(--accent2);"';
    html += ' oninput="syncRefugioSlider(\'' + key + '\',this.value)">';
    if (isInvocador && inRef > 0) {
      html += '<div style="font-size:.62rem;color:var(--gold);margin-top:2px;">⚠️ Invocadores en refugio no invocan. La cola activa podría cancelarse.</div>';
    }
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div style="display:flex;justify-content:center;margin-top:14px;">';
  html += '<button onclick="applyRefugio()" style="padding:10px 32px;background:rgba(0,212,255,.12);border:1px solid var(--accent);border-radius:6px;color:var(--accent);font-family:VT323,monospace;font-size:1rem;letter-spacing:.08em;cursor:pointer;">✓ Aplicar Refugio</button>';
  html += '</div></div>';

  box.innerHTML = html;
}

function syncRefugioSlider(key, val) {
  var el = document.getElementById('rfq_n_' + key);
  if (el) el.textContent = val;
}

function applyRefugio() {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var cap = getRefugioCapacity(vs.buildings);
  var missions = vs.mission_queue || [];
  var inMission = {};
  missions.forEach(function (m) {
    if (!m.troops) return;
    Object.keys(m.troops).forEach(function (k) { inMission[k] = (inMission[k] || 0) + (m.troops[k] || 0); });
  });

  var newRefugio = {};
  var totalSlots = 0;
  var valid = true;
  Object.keys(TROOP_TYPES).forEach(function (key) {
    var sl = document.getElementById('rfs_' + key);
    var val = sl ? Math.max(0, parseInt(sl.value) || 0) : 0;
    var inBase = Math.max(0, (vs.troops[key] || 0) - (inMission[key] || 0));
    if (val > inBase) {
      showNotif('No tienes ' + val + ' ' + TROOP_TYPES[key].name + ' disponibles.', 'err');
      valid = false; return;
    }
    newRefugio[key] = val;
    totalSlots += val * ((TROOP_TYPES[key].barracasSlots) || 1);
  });
  if (!valid) return;

  if (totalSlots > cap) {
    showNotif('Capacidad del Refugio insuficiente (' + totalSlots + ' / ' + cap + ' plazas).', 'err'); return;
  }

  var prevInvRef = (vs.refugio && vs.refugio.invocador) || 0;
  var newInvRef = newRefugio.invocador || 0;
  if (newInvRef > prevInvRef) {
    var totalInv = vs.troops.invocador || 0;
    var invInMission = inMission.invocador || 0;
    var invOutsideAfter = totalInv - invInMission - newInvRef;
    var invLevel = (typeof _researchData !== 'undefined' && _researchData && _researchData.troop_levels && _researchData.troop_levels.invocador) || 1;
    var queue = vs.summoning_queue || [];
    var refundEsencia = 0;
    var cancelCount = 0;
    var kept = [];
    queue.forEach(function (s) {
      var cData = CREATURE_TYPES[s.creature];
      if (!cData) return;
      var tierReq = s.tierRequired || cData.tier || 1;
      if (invOutsideAfter < s.summonersNeeded || invLevel < tierReq) {
        refundEsencia += (cData.cost && cData.cost.esencia) || 0;
        cancelCount++;
      } else {
        kept.push(s);
      }
    });
    if (cancelCount > 0) {
      snapshotResources(vs);
      vs.resources.esencia = (vs.resources.esencia || 0) + refundEsencia;
      vs.summoning_queue = kept;
      showNotif(cancelCount + ' invocación(es) cancelada(s). +' + fmt(refundEsencia) + ' ✨ devuelta.', 'ok');
    }
  }

  vs.refugio = newRefugio;
  flushVillage();
  showNotif('✓ Refugio actualizado.', 'ok');
  renderRefugio();
}

// ============================================================
// COMBAT SIMULATOR LOGIC (Ported from v0.11)
// ============================================================
