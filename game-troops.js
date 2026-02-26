// ============================================================
// EPIC WARRIORS — game-troops.js
// UI: renderTroops, renderCreatures, renderSummoningQueue,
// renderCreaturesList, showCreatureStats, renderSummonOptions,
// showBarracasModal, startRecruitment, showTroopStats,
// renderTrainOptions, resolveTrainingQueue, renderTrainingQueue
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
  // Tropas militares (no aldeanos) para mostrar en desglose
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

  // troopsListBox ya no se usa — la lista está integrada en renderTrainOptions
  box.innerHTML = '';
}

// ============================================================
// CREATURES UI RENDERING
// ============================================================

function renderCreatures() {
  if (!activeVillage) return;
  var vs = activeVillage.state;

  // Torre de Invocación info
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

  // Cola de invocación
  renderSummoningQueue();

  // Lista de criaturas actuales
  renderCreaturesList();

  // Botones de invocación
  renderSummonOptions();
}

function renderSummoningQueue() {
  var box = document.getElementById('summoningQueueBox');
  if (!box || !activeVillage) return;

  var vs = activeVillage.state;
  var queue = vs.summoning_queue || [];

  if (queue.length === 0) {
    box.innerHTML = '<div style="color:var(--dim);font-size:.8rem;">No hay invocaciones en curso</div>';
    return;
  }

  var html = '';
  var now = Date.now();

  // Cabecera con botón cancelar
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html += '<span style="font-size:.68rem;color:var(--dim);letter-spacing:.08em;">' + queue.length + ' EN COLA</span>';
  html += '<button onclick="cancelSummoningQueue()" style="font-size:.65rem;padding:3px 9px;border-radius:4px;border:1px solid var(--danger);background:rgba(255,80,80,.1);color:var(--danger);cursor:pointer;">🗑 Cancelar todo</button>';
  html += '</div>';
  var active = queue[0];
  var cData = CREATURE_TYPES[active.creature];
  if (cData) {
    var finish = new Date(active.finish_at).getTime();
    var timeLeft = Math.max(0, Math.ceil((finish - now) / 1000));
    var start = new Date(active.start_at).getTime();
    var total = Math.max(1, (finish - start) / 1000);
    var pct = Math.min(100, Math.round(((total - timeLeft) / total) * 100));

    html += '<div style="background:var(--panel2);padding:8px 10px;border-radius:6px;margin-bottom:8px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">';
    html += '<span style="font-size:.9rem;">' + cData.icon + ' ' + cData.name + '</span>';
    html += '<span style="font-size:.75rem;color:var(--ok);">' + fmtTime(timeLeft) + '</span>';
    html += '</div>';
    html += '<div style="background:var(--bg);height:7px;border-radius:4px;overflow:hidden;">';
    html += '<div style="width:' + pct + '%;height:100%;background:var(--ok);transition:width 1s linear;"></div>';
    html += '</div>';
    html += '</div>';
  }

  // Remaining items: grouped by creature type, just count
  if (queue.length > 1) {
    var waiting = queue.slice(1);
    var counts = {};
    waiting.forEach(function (s) {
      counts[s.creature] = (counts[s.creature] || 0) + 1;
    });
    var lastFinishQ = new Date(queue[queue.length - 1].finish_at);
    var lastStrQ = lastFinishQ.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var totalLeft = Math.max(0, Math.ceil((lastFinishQ.getTime() - Date.now()) / 1000));
    html += '<div style="background:var(--panel2);padding:7px 10px;border-radius:6px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">';
    html += '<div style="font-size:.68rem;color:var(--dim);letter-spacing:.08em;">EN ESPERA</div>';
    html += '<div style="font-size:.63rem;color:var(--dim);">Cola completa: <span style="color:var(--accent);">' + fmtTime(totalLeft) + '</span> · <b>' + lastStrQ + '</b></div>';
    html += '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    Object.keys(counts).forEach(function (key) {
      var cd = CREATURE_TYPES[key];
      if (!cd) return;
      html += '<div style="display:flex;align-items:center;gap:4px;background:var(--bg);padding:3px 8px;border-radius:4px;font-size:.78rem;">';
      html += cd.icon + ' ' + cd.name + ' <span style="color:var(--ok);font-weight:bold;margin-left:2px;">×' + counts[key] + '</span>';
      html += '</div>';
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
    var count = creatures[key] || 0;
    if (count === 0) return;
    hasAny = true;

    var cData = CREATURE_TYPES[key];
    html += '<div style="background:var(--panel2);padding:10px;border-radius:6px;text-align:center;">';
    html += '<div style="font-size:2rem;">' + cData.icon + '</div>';
    html += '<div style="font-size:.75rem;margin-top:4px;">' + cData.name + '</div>';
    html += '<div style="font-size:1.2rem;color:var(--ok);font-weight:bold;margin-top:4px;">' + count + '</div>';
    html += '</div>';
  });

  html += '</div>';

  if (!hasAny) {
    box.innerHTML = '<div style="color:var(--dim);font-size:.8rem;">No tienes criaturas invocadas</div>';
  } else {
    box.innerHTML = html;
  }
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
    + '<div style="color:var(--dim);">❤️ HP</div><div style="color:var(--text);">' + c.hp + '</div>'
    + '<div style="color:var(--dim);">⚔️ Daño</div><div style="color:var(--text);">' + c.damage + '</div>'
    + '<div style="color:var(--dim);">🛡️ Defensa</div><div style="color:var(--text);">' + c.defense + '</div>'
    + '<div style="color:var(--dim);">⚡ Ataques/turno</div><div style="color:var(--text);">' + c.attacksPerTurn + '</div>'
    + '<div style="color:var(--dim);">🎯 Precisión</div><div style="color:var(--text);">' + c.attackChance + '</div>'
    + '<div style="color:var(--dim);">🏃 Velocidad</div><div style="color:var(--text);">' + c.speed + '</div>'
    + '</div>'
    + '<div style="font-size:.72rem;color:var(--dim);border-top:1px solid var(--border);padding-top:10px;margin-bottom:14px;">' + escapeHtml(c.desc) + '</div>'
    + '<div style="font-size:.75rem;background:var(--panel2);border-radius:6px;padding:8px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;text-align:center;">'
    + '<div><div style="color:var(--dim);">Invocadores</div><div style="color:var(--esencia);">' + c.summonersNeeded + '</div></div>'
    + '<div><div style="color:var(--dim);">Esencia</div><div style="color:var(--esencia);">✨ ' + c.cost.esencia + '</div></div>'
    + '<div><div style="color:var(--dim);">Tiempo</div><div style="color:var(--gold);">⏱ ' + Math.floor(c.time / 60) + 'min</div></div>'
    + '</div>'
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

  // Group by tier
  var tiers = {};
  Object.keys(CREATURE_TYPES).forEach(function (key) {
    var cData = CREATURE_TYPES[key];
    if (!tiers[cData.tier]) tiers[cData.tier] = [];
    tiers[cData.tier].push({ key: key, data: cData });
  });

  Object.keys(tiers).sort().forEach(function (tier) {
    var tierInt = parseInt(tier);
    // VISIBLE si el nivel de la Torre de Invocación >= tier
    // INVOCABLE solo si además tienes los invocadores necesarios
    var visible = torreLevel >= tierInt;
    var unlocked = invocadorLevel >= tierInt;

    // Ocultar solo si la torre no tiene nivel suficiente
    if (!visible) return;

    html += '<div style="background:var(--panel2);padding:10px;border-radius:6px;">';
    html += '<div style="font-size:.75rem;color:var(--dim);letter-spacing:.1em;margin-bottom:8px;">TIER ' + tier + '</div>';

    tiers[tier].forEach(function (c) {
      var canSummonResult = canSummon(c.key, vs);
      var isOk = canSummonResult.ok;

      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg);border-radius:4px;margin-bottom:6px;' + (!unlocked ? 'opacity:.5;filter:grayscale(.4);' : (!isOk ? 'opacity:.7;' : '')) + '">';
      // Icon clickable for stats
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
      // Quantity input + button
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

function startRecruitment(type, amount) {
  if (!activeVillage) return;
  if (!amount || amount <= 0) return;

  var vs = activeVillage.state;
  var res = calcRes(vs);
  var stats = getTroopStatsWithLevel(type, 1);
  var costTotal = {};
  Object.keys(stats.cost).forEach(k => costTotal[k] = stats.cost[k] * amount);

  if (!canAfford(costTotal, res)) { showNotif('No tienes recursos suficientes.', 'err'); return; }

  var barrCap = getBarracksCapacity(vs.buildings);
  var usedSlots = getBarracksUsed(vs);
  var slotsFreed = amount * 1;
  var slotsNeeded = amount * (stats.barracasSlots || 1);
  if (usedSlots - slotsFreed + slotsNeeded > barrCap) {
    showNotif('No hay espacio suficiente en las barracas.', 'err'); return;
  }

  var resNow = calcRes(vs);
  var aldLibres = resNow.aldeanos_libres || 0;
  if (aldLibres < amount) {
    showNotif('Necesitas ' + amount + ' aldeanos LIBRES. Tienes ' + aldLibres + '.', 'err'); return;
  }

  snapshotResources(vs);

  // Descontar recursos y aldeanos INMEDIATAMENTE
  Object.keys(costTotal).forEach(k => {
    if (k === 'prov') vs.resources.provisiones = Math.max(0, vs.resources.provisiones - costTotal[k]);
    else if (vs.resources[k] !== undefined) vs.resources[k] = Math.max(0, vs.resources[k] - costTotal[k]);
  });
  if (!vs.troops) vs.troops = {};
  consumeAldeanos(vs, amount); // resta proporcional de recolectores si hace falta

  // Encolar entrenamiento (secuencial, como criaturas)
  if (!vs.training_queue) vs.training_queue = [];
  var cuartRed = getCuartelesReduction(vs.buildings);
  var baseTime = stats.time || 180;
  var finalTime = Math.max(30, Math.floor(baseTime * (1 - cuartRed)));

  for (var i = 0; i < amount; i++) {
    var lastFinish = Date.now();
    if (vs.training_queue.length > 0) {
      lastFinish = Math.max(lastFinish, new Date(vs.training_queue[vs.training_queue.length - 1].finish_at).getTime());
    }
    vs.training_queue.push({
      type: type,
      finish_at: new Date(lastFinish + finalTime * 1000).toISOString(),
      start_at: new Date(lastFinish).toISOString()
    });
  }

  showNotif(amount + ' ' + stats.name + ' en cola de entrenamiento', 'ok');
  flushVillage();
  tick();
  renderTroops();
}

// Cancelar toda la cola de entrenamiento (devuelve recursos y aldeanos)
function cancelTrainingQueue() {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  if (!vs.training_queue || vs.training_queue.length === 0) {
    showNotif('No hay tropas en entrenamiento.', 'err'); return;
  }
  snapshotResources(vs);
  var refund = {};
  var refundAld = 0;
  vs.training_queue.forEach(function(t) {
    var stats = getTroopStatsWithLevel(t.type, 1);
    if (stats && stats.cost) {
      Object.keys(stats.cost).forEach(function(k) {
        var resKey = (k === 'prov') ? 'provisiones' : k;
        refund[resKey] = (refund[resKey] || 0) + stats.cost[k];
      });
    }
    refundAld++;
  });
  Object.keys(refund).forEach(function(k) {
    if (vs.resources[k] !== undefined) vs.resources[k] += refund[k];
  });
  vs.troops.aldeano = (vs.troops.aldeano || 0) + refundAld;
  vs.training_queue = [];
  flushVillage();
  showNotif('Cola cancelada. ' + refundAld + ' aldeanos y recursos devueltos.', 'ok');
  renderTroops();
}

function showTroopStats(key) {
  var t = TROOP_TYPES[key];
  if (!t) return;
  var existing = document.getElementById('troopStatsModal');
  if (existing) existing.remove();
  window._closeTroopStats = function () { var m = document.getElementById('troopStatsModal'); if (m) m.remove(); };

  // Nivel de herrería actual para esta tropa
  var wLvl = (typeof _researchData !== 'undefined' && _researchData && _researchData.weapon_levels && _researchData.weapon_levels[key]) || 0;
  var aLvl = (typeof _researchData !== 'undefined' && _researchData && _researchData.armor_levels  && _researchData.armor_levels[key])  || 0;

  var overlay = document.createElement('div');
  overlay.id = 'troopStatsModal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:20px;max-width:340px;width:90%;font-family:VT323,monospace;">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px;">'
    + '<span style="font-size:2.5rem;">' + t.icon + '</span>'
    + '<div><div style="font-size:1.2rem;color:var(--accent);">' + t.name + '</div>'
    + '<div style="font-size:.7rem;color:var(--dim);">Tropa normal · 1 plaza barracas</div></div>'
    + '<button onclick="_closeTroopStats()" style="margin-left:auto;background:none;border:none;color:var(--dim);font-size:1.2rem;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.82rem;margin-bottom:14px;">'
    + '<div style="color:var(--dim);">❤️ HP</div><div style="color:var(--text);">' + t.hp + '</div>'
    + '<div style="color:var(--dim);">⚔️ Daño</div><div style="color:var(--text);">' + t.damage + '</div>'
    + '<div style="color:var(--dim);">🛡️ Defensa</div><div style="color:var(--text);">' + t.defense + '</div>'
    + '<div style="color:var(--dim);">⚡ Ataques/turno</div><div style="color:var(--text);">' + t.attacksPerTurn + '</div>'
    + '<div style="color:var(--dim);">🎯 % Acierto</div><div style="color:var(--text);">' + t.attackChance + '/20</div>'
    + '<div style="color:var(--dim);">🏃 Velocidad</div><div style="color:var(--text);">' + t.speed + '</div>'
    + '<div style="color:var(--dim);">🗡️ Arma (Herrería)</div><div style="color:' + (wLvl > 0 ? 'var(--ok)' : 'var(--dim)') + ';">+' + wLvl + (wLvl === 0 ? ' (sin mejorar)' : '') + '</div>'
    + '<div style="color:var(--dim);">🛡 Armadura (Herrería)</div><div style="color:' + (aLvl > 0 ? 'var(--accent)' : 'var(--dim)') + ';">+' + aLvl + (aLvl === 0 ? ' (sin mejorar)' : '') + '</div>'
    + '<div style="color:var(--dim);">📦 Capacidad carga</div><div style="color:var(--text);">' + t.capacity + '</div>'
    + '</div>'
    + '<div style="font-size:.72rem;color:var(--dim);border-top:1px solid var(--border);padding-top:10px;margin-bottom:14px;">' + escapeHtml(t.desc) + '</div>'
    + '<div style="font-size:.75rem;background:var(--panel2);border-radius:6px;padding:8px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;text-align:center;">'
    + '<div><div style="color:var(--dim);">1 Aldeano</div><div style="color:var(--aldeanos);">👤 ×1</div></div>'
    + '<div><div style="color:var(--dim);">Tiempo</div><div style="color:var(--gold);">⏱ ' + Math.floor((t.time || 180) / 60) + 'min</div></div>'
    + '<div><div style="color:var(--dim);">Plazas</div><div style="color:var(--accent);">🏠 ' + (t.barracasSlots || 1) + '</div></div>'
    + '</div>'
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

  var html = '';

  // Cabecera plazas + cuarteles
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 10px;border-bottom:1px solid var(--border);margin-bottom:10px;">';
  html += '<span style="font-size:.78rem;color:var(--dim);letter-spacing:.08em;">PLAZAS OCUPADAS</span>';
  html += '<span style="font-size:1rem;color:var(--accent);font-family:VT323,monospace;"><b>' + usedSlots + '</b> / ' + barrCap + '</span>';
  html += '</div>';
  if (cuartLvl > 0) {
    html += '<div style="font-size:.72rem;color:var(--ok);margin-bottom:10px;">🎖️ Cuarteles Niv.' + cuartLvl + ' → -' + Math.round(cuartRed * 100) + '% entrenamiento</div>';
  }

  html += '<div style="display:grid;gap:7px;">';

  // ── Aldeano: tropa base, sin botón entrenar ──
  var ald = TROOP_TYPES['aldeano'];
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

  // ── Tropas militares ──
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
    // Icono clickable para stats
    html += '<button onclick="showTroopStats(\'' + key + '\')" title="Ver estadísticas" style="background:none;border:none;cursor:pointer;font-size:2.2rem;padding:0;line-height:1;flex-shrink:0;">' + t.icon + '</button>';
    // Info centro
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:1.1rem;color:var(--text);font-family:VT323,monospace;">' + t.name + '</div>';
    html += '<div style="font-size:.72rem;color:var(--dim);margin-top:2px;">👤×1 · ' + (costStr.trim() || '—') + ' · ⏱ ' + timeStr + '</div>';
    if (!hasAldeano) html += '<div style="font-size:.68rem;color:var(--danger);margin-top:2px;">Sin aldeanos libres</div>';
    else if (!canAffordOne) html += '<div style="font-size:.68rem;color:var(--danger);margin-top:2px;">Sin recursos suficientes</div>';
    html += '</div>';
    // Cantidad en base
    html += '<div style="text-align:right;flex-shrink:0;margin-right:10px;min-width:36px;">';
    html += '<div style="font-size:1.8rem;color:' + (count > 0 ? 'var(--accent)' : 'var(--dim)') + ';font-family:VT323,monospace;line-height:1;">' + count + '</div>';
    html += '<div style="font-size:.6rem;color:var(--dim);">en base</div>';
    html += '</div>';
    // Input + botón
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
      // Tropa lista — añadir (el slot ya estaba reservado en getBarracksUsed,
      // así que simplemente convertimos el slot de "entrenando" a "en base")
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

function renderTrainingQueue() {
  var box = document.getElementById('trainingQueueBox');
  if (!box || !activeVillage) return;
  var vs = activeVillage.state;
  var queue = vs.training_queue || [];
  if (queue.length === 0) {
    box.innerHTML = '<div style="color:var(--dim);font-size:.8rem;">No hay tropas en entrenamiento</div>';
    return;
  }
  var now = Date.now();
  var html = '';

  // Tiempo total de TODA la cola — siempre del último elemento
  var lastFinish = new Date(queue[queue.length - 1].finish_at);
  var lastStr = lastFinish.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  var totalSecsLeft = Math.max(0, Math.ceil((lastFinish.getTime() - now) / 1000));

  // Cabecera con botón cancelar
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html += '<span style="font-size:.68rem;color:var(--dim);letter-spacing:.08em;">' + queue.length + ' TROPA(S) EN COLA</span>';
  html += '<button onclick="cancelTrainingQueue()" style="font-size:.65rem;padding:3px 9px;border-radius:4px;border:1px solid var(--danger);background:rgba(255,80,80,.1);color:var(--danger);cursor:pointer;">🗑 Cancelar todo</button>';
  html += '</div>';

  // First active
  var active = queue[0];
  var tStats = TROOP_TYPES[active.type];
  if (tStats) {
    var finish = new Date(active.finish_at).getTime();
    var timeLeft = Math.max(0, Math.ceil((finish - now) / 1000));
    var start = new Date(active.start_at).getTime();
    var total = Math.max(1, (finish - start) / 1000);
    var pct = Math.min(100, Math.round(((total - timeLeft) / total) * 100));
    html += '<div style="background:var(--panel2);padding:8px 10px;border-radius:6px;margin-bottom:8px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">';
    html += '<span style="font-size:.9rem;">' + tStats.icon + ' ' + tStats.name + '</span>';
    html += '<span style="font-size:.75rem;color:var(--ok);">' + fmtTime(timeLeft) + '</span>';
    html += '</div>';
    html += '<div style="background:var(--bg);height:7px;border-radius:4px;overflow:hidden;">';
    html += '<div style="width:' + pct + '%;height:100%;background:var(--accent);transition:width 1s linear;"></div>';
    html += '</div>';
    // Total queue time — siempre visible, no solo si hay >1
    html += '<div style="font-size:.63rem;color:var(--dim);margin-top:4px;">Cola completa (' + queue.length + ' tropas): <span style="color:var(--accent);">' + fmtTime(totalSecsLeft) + '</span> · termina <b>' + lastStr + '</b></div>';
    html += '</div>';
  }
  // Waiting
  if (queue.length > 1) {
    var waiting = queue.slice(1);
    var counts = {};
    waiting.forEach(function (t) { counts[t.type] = (counts[t.type] || 0) + 1; });
    html += '<div style="background:var(--panel2);padding:7px 10px;border-radius:6px;">';
    html += '<div style="font-size:.68rem;color:var(--dim);margin-bottom:5px;letter-spacing:.08em;">EN ESPERA</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    Object.keys(counts).forEach(function (key) {
      var ts = TROOP_TYPES[key];
      if (!ts) return;
      html += '<div style="display:flex;align-items:center;gap:4px;background:var(--bg);padding:3px 8px;border-radius:4px;font-size:.78rem;">';
      html += ts.icon + ' ' + ts.name + ' <span style="color:var(--accent);font-weight:bold;margin-left:2px;">×' + counts[key] + '</span>';
      html += '</div>';
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

  // Tropas en misión por tipo
  var inMission = {};
  missions.forEach(function (m) {
    if (!m.troops) return;
    Object.keys(m.troops).forEach(function (k) { inMission[k] = (inMission[k] || 0) + (m.troops[k] || 0); });
  });

  var pct = cap > 0 ? Math.min(100, Math.round(used / cap * 100)) : 0;
  var pctColor = pct >= 90 ? 'var(--danger)' : pct >= 60 ? 'var(--gold)' : 'var(--ok)';

  // Calcular capacidad siguiente nivel para mostrar al jugador
  var nextLvl = lvl + 1;
  var nextCap = Math.floor(Math.round(50 * Math.pow(1.40, nextLvl - 1)) * 0.10);

  var html = '';

  // Cabecera estado refugio
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

  // Sliders por tropa
  html += '<div class="card"><div style="display:grid;gap:10px;">';
  Object.keys(TROOP_TYPES).forEach(function (key) {
    var t = TROOP_TYPES[key];
    var inBase = Math.max(0, (vs.troops[key] || 0) - (inMission[key] || 0));
    var inRef = refugio[key] || 0;
    // Max para este slider: lo que ya está dentro + lo que hay libre fuera (sin misión, sin ya en refugio)
    var outside = inBase - inRef;
    var slotsPerUnit = t.barracasSlots || 1;
    var freeSlots = cap - used;
    var maxCanAdd = Math.floor(freeSlots / slotsPerUnit);
    var maxVal = inRef + Math.max(0, maxCanAdd);
    // No puede superar los que están en base
    maxVal = Math.min(maxVal, inBase);

    var isInvocador = (key === 'invocador');

    html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">';
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

  // Leer valores de los sliders
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

  // Check invocadores: si metes más invocadores de los que había, revisar cola de invocación
  var prevInvRef = (vs.refugio && vs.refugio.invocador) || 0;
  var newInvRef = newRefugio.invocador || 0;
  if (newInvRef > prevInvRef) {
    // Invocadores disponibles fuera del refugio después del cambio
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

