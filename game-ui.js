// ============================================================
// EPIC WARRIORS — game-ui.js
// Edificios: startBuild, canAfford, renderBuildings, renderQueue
// Mapa: panMap, renderMinimap, renderMap, selectNPC, selectCell
// Modales: openMissionModal, openMoveModal, openTransportModal
// Recursos: renderRecursos, assignWorker, updateGranjaPanel
// Refuerzos: renderReinforcementsPanel, processRecalls, recallReinforcement
// Recursos: renderRecursos, snapshotResources, assignWorker, updateGranjaPanel
// Utilidades: escapeHtml, escapeJs, fmt, fmtTime, showNotif, createStars, formatNumber
// ============================================================

function startBuild(id) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  if (vs.build_queue) { showNotif('Ya hay una construccion en curso.', 'err'); return; }
  var def = BUILDINGS.find(function (b) { return b.id === id; });
  var lvl = (vs.buildings[id] && vs.buildings[id].level) || 0;
  var cost = def.cost(lvl);
  var res = calcRes(vs);
  if (!canAfford(cost, res)) { showNotif('Recursos insuficientes.', 'err'); return; }

  // Snapshot primero (fija last_updated = ahora y escribe valores reales)
  // Luego resta el coste — nunca puede quedar negativo porque canAfford ya lo comprobó
  snapshotResources(vs);
  vs.resources.madera = Math.max(0, vs.resources.madera - (cost.madera || 0));
  vs.resources.piedra = Math.max(0, vs.resources.piedra - (cost.piedra || 0));
  vs.resources.hierro = Math.max(0, vs.resources.hierro - (cost.hierro || 0));
  vs.resources.provisiones = Math.max(0, vs.resources.provisiones - (cost.provisiones || 0));
  vs.resources.esencia = Math.max(0, vs.resources.esencia - (cost.esencia || 0));
  // last_updated ya lo fijó snapshotResources()

  // Store finish timestamp — this is what makes offline work
  var secs = def.time(lvl);
  vs.build_queue = { id: id, finish_at: new Date(Date.now() + secs * 1000).toISOString() };

  showNotif('Construyendo ' + def.name + ' nivel ' + (lvl + 1) + '...', 'ok');
  flushVillage(); // save immediately to Supabase
  tick();
  renderBuildings(calcRes(vs));
}

function canAfford(cost, res, cap, blds) {
  // Recursos individuales suficientes
  var resOk = (res.madera >= (cost.madera || 0)) && (res.piedra >= (cost.piedra || 0))
    && (res.hierro >= (cost.hierro || 0)) && (res.provisiones >= (cost.provisiones || 0))
    && (res.esencia >= (cost.esencia || 0));
  if (!resOk) return false;
  // Espacio libre en almacen para lo que no es esencia (el coste se va, no ocupa)
  return true;
}

// ============================================================
// ============================================================
function renderBuildings(res) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  if (!res) res = calcRes(vs); // fallback si no se pasó res
  var grid = document.getElementById('bldGrid');
  grid.innerHTML = '';

  BUILDINGS.forEach(function (def) {
    var lvl = (vs.buildings[def.id] && vs.buildings[def.id].level) || 0;
    var next = lvl + 1;
    var cost = def.cost(lvl);
    var prod = def.prod(next);
    var inQueue = vs.build_queue && vs.build_queue.id === def.id;
    var anyQueue = !!vs.build_queue;
    var afford = canAfford(cost, res);
    var icon = def.icon || '🏗️';

    var timeLeftSec = 0, pct = 0;
    if (inQueue) {
      var finish = new Date(vs.build_queue.finish_at).getTime();
      timeLeftSec = Math.max(0, Math.ceil((finish - Date.now()) / 1000));
      var total = def.time(lvl);
      pct = Math.min(100, Math.round(((total - timeLeftSec) / total) * 100));
    }

    var prodHTML = '';
    if (prod.madera) prodHTML += '<span class="pbadge" style="color:var(--madera);border-color:rgba(200,164,90,.3);background:rgba(200,164,90,.05)">🌲 +' + fmt(prod.madera) + '/h</span>';
    if (prod.piedra) prodHTML += '<span class="pbadge" style="color:var(--piedra);border-color:rgba(160,168,176,.3);background:rgba(160,168,176,.05)">⛰️ +' + fmt(prod.piedra) + '/h</span>';
    if (prod.hierro) prodHTML += '<span class="pbadge" style="color:var(--hierro);border-color:rgba(224,120,96,.3);background:rgba(224,120,96,.05)">⚙️ +' + fmt(prod.hierro) + '/h</span>';
    if (prod.provisiones) prodHTML += '<span class="pbadge" style="color:var(--prov);border-color:rgba(111,207,122,.3);background:rgba(111,207,122,.05)">🌾 +' + fmt(prod.provisiones) + '/h</span>';
    if (prod.esencia) prodHTML += '<span class="pbadge" style="color:var(--esencia);border-color:rgba(192,132,252,.3);background:rgba(192,132,252,.05)">✨ +' + fmt(prod.esencia) + '/h</span>';

    var costHTML = '';
    if (cost.madera) costHTML += '<span class="cost-i ' + (res.madera >= (cost.madera || 0) ? 'ok' : 'no') + '">🌲 ' + fmt(cost.madera) + '</span>';
    if (cost.piedra) costHTML += '<span class="cost-i ' + (res.piedra >= (cost.piedra || 0) ? 'ok' : 'no') + '">⛰️ ' + fmt(cost.piedra) + '</span>';
    if (cost.hierro) costHTML += '<span class="cost-i ' + (res.hierro >= (cost.hierro || 0) ? 'ok' : 'no') + '">⚙️ ' + fmt(cost.hierro) + '</span>';
    if (cost.provisiones) costHTML += '<span class="cost-i ' + (res.provisiones >= (cost.provisiones || 0) ? 'ok' : 'no') + '">🌾 ' + fmt(cost.provisiones) + '</span>';
    if (cost.esencia) costHTML += '<span class="cost-i ' + (res.esencia >= (cost.esencia || 0) ? 'ok' : 'no') + '">✨ ' + fmt(cost.esencia) + '</span>';

    var btnCls = 'avail', btnTxt = 'Mejorar a Nivel ' + next;
    if (inQueue) { btnCls = 'busy'; btnTxt = 'Construyendo... (' + timeLeftSec + 's)'; }
    else if (!afford || anyQueue) { btnCls = 'insuf'; btnTxt = !afford ? 'Recursos insuficientes' : 'Cola ocupada'; }

    var card = document.createElement('div');
    card.className = 'bld-card';
    card.innerHTML = '<div class="bld-head" onclick="openBuildingDetail(\'' + def.id + '\')" style="cursor:pointer"><div class="bld-ico">' + icon + '</div><div><div class="bld-name">' + def.name + '</div><div class="bld-lvl">Nivel: <span class="lvl-n">' + lvl + '</span></div></div><span class="detail-badge">ver detalle &rsaquo;</span></div>'
      + '<div class="bld-body"><div class="bld-desc">'
      + (def.id === 'reclutamiento'
        ? 'Nivel ' + lvl + ' → ' + getAldeanosProd(vs.buildings) + ' aldeanos/h'
        : def.id === 'barracas'
          ? 'Nivel ' + lvl + ' → ' + getBarracksCapacity(vs.buildings) + ' plazas de tropas'
          : def.id === 'granja'
            ? 'Nivel ' + lvl + ' → ' + (5 + lvl) + ' provisiones/aldeano/h en granja'
            : 'Nivel actual: ' + lvl) + '</div>'
      + (prodHTML ? '<div class="prod-row">' + prodHTML + '</div>' : '')
      + '<div class="cost-row">' + costHTML + '</div>'
      + (inQueue ? '<div class="pbar-wrap"><div class="pbar-fill" style="width:' + pct + '%"></div></div>' : '')
      + '<button class="bld-btn ' + btnCls + '" onclick="startBuild(\'' + def.id + '\')">' + btnTxt + '</button></div>';
    grid.appendChild(card);
  });
}

// ============================================================
// ============================================================
// ============================================================
// VER TROPAS EN MOVIMIENTO — modal informativo
// ============================================================
function showMissionTroops(missionRef) {
  var vs = activeVillage && activeVillage.state;
  if (!vs) return;
  var m = (vs.mission_queue || []).find(function (q) { return q.mid === missionRef || q.finish_at === missionRef; });
  if (!m) { showNotif('Misión no encontrada', 'err'); return; }

  var troops = m.troops || {};
  var hasTroops = Object.keys(troops).some(function (k) { return (troops[k] || 0) > 0; });
  if (!hasTroops) { showNotif('Esta misión no lleva unidades', 'info'); return; }

  // Determinar nombre e icono de la misión
  var missionName, missionIcon;
  if (m.type === 'spy')              { missionIcon = '🏹'; missionName = 'Espionaje → [' + m.tx + ',' + m.ty + ']'; }
  else if (m.type === 'return')      { missionIcon = '🏠'; missionName = 'Tropas regresando a casa'; }
  else if (m.type === 'return_reinforce') { missionIcon = '↩️'; missionName = 'Tropas volviendo a casa'; }
  else if (m.type === 'reinforce')   { missionIcon = '🛡️'; missionName = 'Refuerzo → [' + m.tx + ',' + m.ty + ']'; }
  else if (m.type === 'transport')   { missionIcon = '📦'; missionName = 'Caravana → [' + m.tx + ',' + m.ty + ']'; }
  else if (m.type === 'move')        { missionIcon = '⚔️'; missionName = 'Tropas → [' + m.tx + ',' + m.ty + ']'; }
  else                               { missionIcon = '⚔️'; missionName = 'Ataque → [' + m.tx + ',' + m.ty + ']'; }

  // Tiempo restante
  var tl = Math.max(0, Math.ceil((new Date(m.finish_at).getTime() - Date.now()) / 1000));
  var timeStr = tl > 3600 ? Math.floor(tl/3600) + 'h ' + Math.floor((tl%3600)/60) + 'm ' + (tl%60) + 's'
              : tl > 60  ? Math.floor(tl/60) + 'm ' + (tl%60) + 's'
              : tl + 's';

  // Separar tropas y criaturas
  var troopRows = '', creatureRows = '', totalUnits = 0;
  Object.keys(troops).forEach(function (k) {
    var qty = troops[k] || 0;
    if (qty <= 0) return;
    totalUnits += qty;
    var td = TROOP_TYPES[k];
    var cd = CREATURE_TYPES[k];
    if (td) {
      troopRows += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);">'
        + '<span style="font-size:1.3rem;">' + td.icon + '</span>'
        + '<span style="flex:1;color:var(--text);font-size:.88rem;">' + td.name + '</span>'
        + '<span style="color:var(--accent);font-size:.95rem;font-weight:bold;">×' + fmt(qty) + '</span>'
        + '</div>';
    } else if (cd) {
      creatureRows += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);">'
        + '<span style="font-size:1.3rem;">' + cd.icon + '</span>'
        + '<span style="flex:1;color:var(--text);font-size:.88rem;">' + cd.name + '</span>'
        + '<span style="color:var(--accent2);font-size:.95rem;font-weight:bold;">×' + fmt(qty) + '</span>'
        + '</div>';
    }
  });

  // Secciones de contenido
  var sectTroops = troopRows
    ? '<div style="font-size:.72rem;color:var(--dim);text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px;">⚔️ Tropas</div>' + troopRows
    : '';
  var sectCreatures = creatureRows
    ? '<div style="font-size:.72rem;color:var(--dim);text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px;">🐉 Criaturas</div>' + creatureRows
    : '';

  // Contingentes aliados (si los hay)
  var guestHTML = '';
  if (m.guest_contingents && m.guest_contingents.length > 0) {
    m.guest_contingents.forEach(function (gc) {
      if (!gc.troops || !Object.values(gc.troops).some(function(n){return n>0;})) return;
      var gName = (profileCache[gc.owner_id] && profileCache[gc.owner_id].username) || gc.owner_id.slice(0,8);
      var gRows = '';
      Object.keys(gc.troops).forEach(function(k){
        var qty2 = gc.troops[k]||0; if(!qty2) return;
        var td2 = TROOP_TYPES[k]; var cd2 = CREATURE_TYPES[k];
        var info = td2||cd2; if(!info) return;
        gRows += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">'
          + '<span style="font-size:1.1rem;">' + info.icon + '</span>'
          + '<span style="flex:1;color:var(--dim);font-size:.82rem;">' + info.name + '</span>'
          + '<span style="color:var(--text);font-size:.88rem;">×' + fmt(qty2) + '</span>'
          + '</div>';
      });
      if (gRows) {
        guestHTML += '<div style="background:var(--panel2);border-radius:6px;padding:8px;margin-top:8px;">'
          + '<div style="font-size:.72rem;color:#e87030;margin-bottom:4px;">🤝 ' + escapeHtml(gName) + ' (aliado)</div>'
          + gRows + '</div>';
      }
    });
  }

  // Construir y mostrar el modal
  var existing = document.getElementById('missionTroopsModal');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'missionTroopsModal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;';
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:20px;max-width:360px;width:92%;font-family:VT323,monospace;max-height:80vh;overflow-y:auto;">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:10px;">'
    + '<span style="font-size:1.8rem;">' + missionIcon + '</span>'
    + '<div style="flex:1;">'
    + '<div style="font-size:1rem;color:var(--accent);">' + missionName + '</div>'
    + '<div style="font-size:.72rem;color:var(--dim);">⏱ ' + timeStr + ' · ' + fmt(totalUnits) + ' unidades en total</div>'
    + '</div>'
    + '<button onclick="document.getElementById(\'missionTroopsModal\').remove()" style="background:none;border:none;color:var(--dim);font-size:1.2rem;cursor:pointer;padding:0 4px;">✕</button>'
    + '</div>'
    + sectTroops
    + sectCreatures
    + guestHTML
    + '</div>';
  document.body.appendChild(overlay);
}

function renderQueue(vs) {
  var ids = ['qItems', 'qItemsOv'];
  ids.forEach(function (elId) {
    var el = document.getElementById(elId);
    var emId = elId === 'qItems' ? 'qEmpty' : 'qEmptyOv';
    var em = document.getElementById(emId);
    if (!vs.build_queue) { em.style.display = 'block'; el.innerHTML = ''; return; }
    em.style.display = 'none';
    var q = vs.build_queue;
    var def = BUILDINGS.find(function (b) { return b.id === q.id; });
    var finish = new Date(q.finish_at).getTime();
    var tl = Math.max(0, Math.ceil((finish - Date.now()) / 1000));
    var lvl = ((vs.buildings[q.id] && vs.buildings[q.id].level) || 0);
    var total = def ? def.time(lvl) : 60;
    var pct = Math.min(100, Math.round(((total - tl) / total) * 100));
    var icon = def ? def.icon : '🏗️';
    el.innerHTML = '<div class="queue-item"><div class="queue-icon">' + icon + '</div>'
      + '<div class="queue-info"><div class="queue-name">' + (def ? def.name : q.id) + ' -> Nivel ' + (lvl + 1) + '</div>'
      + '<div class="queue-time">' + tl + 's restantes</div>'
      + '<div class="qbar"><div class="qbar-fill" style="width:' + pct + '%"></div></div></div></div>';
  });

  var mIds = ['qItems', 'qItemsOv']; // We use the same containers or add specific ones
  mIds.forEach(function (elId) {
    var el = document.getElementById(elId);
    if (!vs.mission_queue || vs.mission_queue.length === 0) return;

    vs.mission_queue.forEach(m => {
      var finish = new Date(m.finish_at).getTime();
      var now = Date.now();
      var tl = Math.max(0, Math.ceil((finish - now) / 1000));

      // FILTRO MEJORADO: No mostrar misiones completadas
      // Si ya terminó (tl=0) y es una misión de retorno, no mostrar (será procesada en resolveMissions)
      if (tl <= 0 && m.type === 'return') return;
      // Para otras misiones, dar 5 segundos de gracia antes de ocultar
      if (tl <= 0 && now - finish > 5000) return;

      var start = m.start_at ? new Date(m.start_at).getTime() : (finish - 60000);
      var total = Math.max(1, Math.ceil((finish - start) / 1000));
      var pct = Math.min(100, Math.round(((total - tl) / total) * 100));

      var icon, name, color;
      if (m.type === 'spy') { icon = '🏹'; name = 'Espionaje a [' + m.tx + ',' + m.ty + ']'; color = 'var(--accent)'; }
      else if (m.type === 'return') { icon = '🏠'; name = 'Tropas regresando'; color = 'var(--ok)'; }
      else if (m.type === 'found') { icon = '🏘️'; name = 'Colonos hacia [' + m.tx + ',' + m.ty + ']'; color = 'var(--gold)'; }
      else if (m.type === 'move') { icon = '⚔'; name = 'Tropas → [' + m.tx + ',' + m.ty + ']'; color = 'var(--accent)'; }
      else if (m.type === 'reinforce') { icon = '🛡️'; name = 'Refuerzo → [' + m.tx + ',' + m.ty + ']'; color = 'var(--accent2)'; }
      else if (m.type === 'transport') { icon = '📦'; name = 'Caravana → [' + m.tx + ',' + m.ty + ']'; color = 'var(--madera)'; }
      else if (m.type === 'return_reinforce') { icon = '↩'; name = 'Tropas volviendo a casa'; color = 'var(--ok)'; }
      else { icon = '⚔️'; name = 'Ataque a [' + m.tx + ',' + m.ty + ']'; color = 'var(--danger)'; }

      var timeStr = tl > 3600 ? Math.floor(tl / 3600) + 'h ' + Math.floor((tl % 3600) / 60) + 'm'
        : tl > 60 ? Math.floor(tl / 60) + 'm ' + (tl % 60) + 's'
          : tl + 's';

      var div = document.createElement('div');
      div.className = 'queue-item mission';
      div.style.borderLeftColor = color;
      var cancelBtn = (m.type !== 'return' && m.type !== 'found' && m.type !== 'move' && m.type !== 'reinforce' && m.type !== 'transport' && m.type !== 'return_reinforce')
        ? '<button onclick="cancelMission(\'' + (m.mid || m.finish_at) + '\')" style="background:rgba(255,61,90,.1);border:1px solid rgba(255,61,90,.3);color:var(--danger);padding:3px 8px;border-radius:3px;font-size:.62rem;cursor:pointer;margin-top:4px;">✗ Cancelar</button>'
        : '';
      var hasTroopsInMission = m.troops && Object.keys(m.troops).some(function(k){return (m.troops[k]||0)>0;});
      var viewBtn = hasTroopsInMission
        ? '<button onclick="showMissionTroops(\'' + escapeJs(m.mid || m.finish_at) + '\')" style="background:rgba(100,180,255,.08);border:1px solid rgba(100,180,255,.25);color:var(--accent);padding:3px 8px;border-radius:3px;font-size:.62rem;cursor:pointer;margin-top:4px;margin-right:4px;">👁 Ver tropas</button>'
        : '';
      div.innerHTML = '<div class="queue-icon">' + icon + '</div>'
        + '<div class="queue-info"><div class="queue-name">' + name + '</div>'
        + '<div class="queue-time">' + timeStr + '</div>'
        + '<div class="qbar"><div class="qbar-fill" style="width:' + pct + '%; background:' + color + '"></div></div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:2px;">' + viewBtn + cancelBtn + '</div>'
        + '</div>';
      el.appendChild(div);
    });

    // Misiones aliadas — ataques conjuntos donde YO participo pero no soy el líder
    if (_activeMissionsTableExists !== false && currentUser) {
      sbClient.from('active_missions')
        .select('*')
        .eq('participant_id', currentUser.id)
        .eq('status', 'active')
        .then(function (amr) {
          if (amr.error || !amr.data) return;
          amr.data.forEach(function (am) {
            if (am.leader_id === currentUser.id) return; // ya visible en mi propia queue
            var finish = new Date(am.finish_at).getTime();
            var now2 = Date.now();
            var tl2 = Math.max(0, Math.ceil((finish - now2) / 1000));
            var timeStr2 = tl2 > 3600 ? Math.floor(tl2/3600) + 'h ' + Math.floor((tl2%3600)/60) + 'm'
              : tl2 > 60 ? Math.floor(tl2/60) + 'm ' + (tl2%60) + 's' : tl2 + 's';
            var start2 = new Date(am.created_at || am.finish_at).getTime();
            var total2 = Math.max(1, Math.ceil((finish - start2) / 1000));
            var pct2 = Math.min(100, Math.round(((total2 - tl2) / total2) * 100));
            var leaderName = (profileCache[am.leader_id] && profileCache[am.leader_id].username) || am.leader_id.slice(0,8);
            var aDiv = document.createElement('div');
            aDiv.className = 'queue-item mission';
            aDiv.style.borderLeftColor = '#e87030';
            aDiv.style.opacity = '0.85';
            aDiv.innerHTML = '<div class="queue-icon">⚔️</div>'
              + '<div class="queue-info">'
              + '<div class="queue-name" style="color:#e87030;">Ataque conjunto [' + am.target_x + ',' + am.target_y + ']</div>'
              + '<div style="font-size:.62rem;color:var(--dim);">Liderado por ' + escapeHtml(leaderName) + '</div>'
              + '<div class="queue-time">' + timeStr2 + '</div>'
              + '<div class="qbar"><div class="qbar-fill" style="width:' + pct2 + '%;background:#e87030;"></div></div>'
              + '<button onclick="cancelAlliedMission(\'' + am.mission_id + '\',\'' + am.host_village_id + '\')" '
              + 'style="background:rgba(255,61,90,.1);border:1px solid rgba(255,61,90,.3);color:var(--danger);padding:3px 8px;border-radius:3px;font-size:.62rem;cursor:pointer;margin-top:4px;">✗ Cancelar (todos)</button>'
              + '</div>';
            el.appendChild(aDiv);
          });
          if (_activeMissionsTableExists === null) _activeMissionsTableExists = true;
        }).catch(function (e) {
          if (e && e.code === '42P01') _activeMissionsTableExists = false;
        });
    }
  });
}

// ============================================================
// MAP — con cámara libre (offset), flechas y WASD
// ============================================================
var mapCamX = null; // null = centrado en aldea
var mapCamY = null;

function panMap(dx, dy, resetToVillage) {
  if (!activeVillage) return;
  if (resetToVillage) {
    mapCamX = activeVillage.x;
    mapCamY = activeVillage.y;
  } else {
    if (mapCamX === null) mapCamX = activeVillage.x;
    if (mapCamY === null) mapCamY = activeVillage.y;
    mapCamX = Math.max(1, Math.min(MAP_SIZE, mapCamX + dx));
    mapCamY = Math.max(1, Math.min(MAP_SIZE, mapCamY + dy));
  }
  renderMap();
  try { sessionStorage.setItem('EW_camX', String(mapCamX)); sessionStorage.setItem('EW_camY', String(mapCamY)); } catch (e) { }
}

// Teclado: flechas + WASD (solo cuando el mapa está activo)
document.addEventListener('keydown', function (e) {
  var mapActive = document.getElementById('page-map') &&
    document.getElementById('page-map').classList.contains('active');
  if (!mapActive) return;
  // No interferir con inputs de texto
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName)) return;
  var moved = false;
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { panMap(0, -1); moved = true; }
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { panMap(0, 1); moved = true; }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { panMap(-1, 0); moved = true; }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { panMap(1, 0); moved = true; }
  if (moved) e.preventDefault();
});

// ============================================================
// MINIMAPA — canvas 30×30, centrado en la cámara del mapa principal
// No es interactivo. Se actualiza cada vez que renderMap() lo llama.
// Colores: propio=cian, aliado=verde, enemigo=rojo, npc=dorado
// ============================================================
var MINI_COLS = 30;
var MINI_CELL = 9; // px por celda (9px * 30 = 270px)
var MINI_GAP = 0;

function renderMinimap(cx, cy) {
  var canvas = document.getElementById('minimapCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Fondo
  ctx.fillStyle = 'rgba(10,10,16,0.95)';
  ctx.fillRect(0, 0, W, H);

  // Lookups
  var lookup = {};
  (allVillages || []).forEach(function (v) { lookup[v.x + ',' + v.y] = v; });
  var npcLookup = {};
  (typeof NPC_CASTLES !== 'undefined' ? NPC_CASTLES : []).forEach(function (n) { npcLookup[n.x + ',' + n.y] = n; });

  var half = Math.floor(MINI_COLS / 2); // 15
  var cellPx = MINI_CELL;

  for (var row = 0; row < MINI_COLS; row++) {
    for (var col = 0; col < MINI_COLS; col++) {
      var wx = cx - half + col;
      var wy = cy - half + row;
      var key = wx + ',' + wy;
      var px = col * cellPx;
      var py = row * cellPx;

      if (wx < 1 || wx > MAP_SIZE || wy < 1 || wy > MAP_SIZE) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px, py, cellPx - 1, cellPx - 1);
        continue;
      }

      var vill = lookup[key];
      var npc = npcLookup[key];

      if (vill) {
        var isOwn = currentUser && (vill.owner_id === currentUser.id);
        var isAlly = !isOwn && (_allyUserIds && _allyUserIds.has(vill.owner_id));
        if (isOwn) ctx.fillStyle = 'rgba(0,212,255,0.85)';
        else if (isAlly) ctx.fillStyle = 'rgba(96,208,96,0.85)';
        else ctx.fillStyle = 'rgba(255,61,90,0.85)';
        ctx.fillRect(px, py, cellPx - 1, cellPx - 1);
      } else if (npc) {
        ctx.fillStyle = 'rgba(255,230,0,0.7)';
        ctx.fillRect(px, py, cellPx - 1, cellPx - 1);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(px, py, cellPx - 1, cellPx - 1);
      }
    }
  }

  // Dibujar encuadre de lo que muestra el mapa principal (15x15)
  var mainR = MAP_VIEW; // 7 → 15×15
  var mainSize = mainR * 2 + 1; // 15
  var frameLeft = (half - mainR) * cellPx;
  var frameTop = (half - mainR) * cellPx;
  var framePx = mainSize * cellPx;
  ctx.strokeStyle = 'rgba(240,192,64,0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(frameLeft + 0.5, frameTop + 0.5, framePx - cellPx, framePx - cellPx);

  // Punto central (aldea activa si está en el encuadre)
  if (activeVillage) {
    var avx = activeVillage.x, avy = activeVillage.y;
    var dc = avx - (cx - half), dr = avy - (cy - half);
    if (dc >= 0 && dc < MINI_COLS && dr >= 0 && dr < MINI_COLS) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(dc * cellPx + cellPx / 2, dr * cellPx + cellPx / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function renderMap() {
  if (!activeVillage) { return; }
  if (allVillages.length === 0) {
    document.getElementById('mapCoordsDisplay').textContent = 'Cargando...';
    // Solo recargar mapa si han pasado más de 5 minutos (reduce queries)
    var _nowMap = Date.now();
    var _doLoad = (_nowMap - _lastMapLoad) > 300000 || allVillages.length === 0;
    _lastMapLoad = _doLoad ? _nowMap : _lastMapLoad;
    (_doLoad ? loadAllVillages() : Promise.resolve()).then(function () {
      if (allVillages.length > 0) renderMap();
      else document.getElementById('mapCoordsDisplay').textContent = 'No se pudieron cargar los datos del mapa.';
    });
    return;
  }

  // Cámara: si es null, centrar en aldea
  var cx = (mapCamX !== null) ? mapCamX : activeVillage.x;
  var cy = (mapCamY !== null) ? mapCamY : activeVillage.y;
  if (mapCamX === null) { mapCamX = activeVillage.x; mapCamY = activeVillage.y; }

  var r = MAP_VIEW;
  var size = r * 2 + 1;

  var npcLookup = {};
  (typeof NPC_CASTLES !== 'undefined' ? NPC_CASTLES : []).forEach(function (n) { npcLookup[n.x + ',' + n.y] = n; });

  // Construir lookup de aldeas por coordenada
  var lookup = {};
  allVillages.forEach(function (v) { lookup[v.x + ',' + v.y] = v; });

  var grid = document.getElementById('mapGrid');
  grid.style.gridTemplateColumns = 'repeat(' + size + ', 28px)';
  grid.innerHTML = '';

  // Indica si la cámara está descentrada del jugador
  var isOffCenter = (cx !== activeVillage.x || cy !== activeVillage.y);
  document.getElementById('mapCoordsDisplay').textContent =
    'Cámara: [' + cx + ', ' + cy + ']' +
    (isOffCenter ? '  |  Tu aldea: [' + activeVillage.x + ', ' + activeVillage.y + ']  |  (⌂ para volver)' : '  |  Vista: [' + (cx - r) + ',' + (cy - r) + '] a [' + (cx + r) + ',' + (cy + r) + ']');

  renderMinimap(cx, cy);

  for (var dy2 = -r; dy2 <= r; dy2++) {
    for (var dx2 = -r; dx2 <= r; dx2++) {
      var wx = cx + dx2, wy = cy + dy2;
      var key = wx + ',' + wy;
      var vill = lookup[key];
      var npc = npcLookup[key];

      var cell = document.createElement('div');
      cell.className = 'map-cell';
      cell.title = '[' + wx + ', ' + wy + ']';

      if (wx < 1 || wx > MAP_SIZE || wy < 1 || wy > MAP_SIZE) {
        cell.classList.add('out-of-bounds');
      } else if (vill) {
        var isOwn = (vill.owner_id === currentUser.id);
        var isAlly = !isOwn && (_allyUserIds && _allyUserIds.has(vill.owner_id));
        cell.classList.add(isOwn ? 'own' : (isAlly ? 'ally' : 'enemy'));
        cell.textContent = isOwn ? '🏠' : (isAlly ? '🤝' : '⚔️');
        if (wx === activeVillage.x && wy === activeVillage.y) cell.classList.add('center-marker');
        (function (v, own, ally, x, y) { cell.onclick = function () { selectCell(v, own, ally, x, y); }; })(vill, isOwn, isAlly, wx, wy);
      } else if (npc) {
        cell.classList.add('npc');
        var obj = playerObjectives.find(o => o.objective_id === npc.id);
        var isCleared = obj && obj.status === 'cleared';
        cell.textContent = isCleared ? '🏰' : '🛡️';
        if (isCleared) { cell.style.opacity = '0.4'; cell.title += ' (SUPERADO)'; }
        (function (n, nx, ny) { cell.onclick = function () { selectNPC(n, nx, ny); }; })(npc, wx, wy);
      } else {
        cell.classList.add('empty');
        if (wx === activeVillage.x && wy === activeVillage.y) cell.classList.add('center-marker');
        (function (x, y) { cell.onclick = function () { selectCell(null, false, x, y); }; })(wx, wy);
      }
      grid.appendChild(cell);
    }
  }
}

function selectNPC(npc, x, y) {
  var panel = document.getElementById('mapPanel');
  var title = document.getElementById('mapPanelTitle');
  var sub = document.getElementById('mapPanelSub');
  var actions = document.getElementById('mapActions');
  panel.classList.add('show');

  var inRange = isInTorreRange(x, y);
  var obj = playerObjectives.find(o => o.objective_id === npc.id);
  var isCleared = obj && obj.status === 'cleared';
  var isSpied = obj && obj.status === 'spied';

  // Fecha de derrota (guardada en last_interaction)
  var clearDateStr = '';
  if (isCleared && obj.last_interaction) {
    var d = new Date(obj.last_interaction);
    clearDateStr = ' · ' + d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  var statusTag = isCleared
    ? ' <span style="color:var(--ok)">[DERROTADO' + clearDateStr + ']</span>'
    : isSpied ? ' <span style="color:var(--accent)">[ESPIADO]</span>' : '';

  title.innerHTML = npc.name + ' ' + (npc.icon || '🏇') + statusTag;

  // Stats: solo visibles si espiado o derrotado
  if (isCleared || isSpied) {
    sub.innerHTML = '[' + x + ', ' + y + '] · '
      + 'PG: ' + fmt(npc.hp) + ' · CA: ' + npc.defense + ' · XP: ' + fmt(npc.rewards.experience);
  } else {
    sub.innerHTML = '[' + x + ', ' + y + '] · <span style="color:var(--dim);font-style:italic;">Stats desconocidos — envía un explorador</span>';
  }

  if (isCleared) {
    actions.innerHTML = '<span style="color:var(--ok);font-size:.72rem;">✅ Ya derrotaste a este caballero.</span>';
  } else if (inRange) {
    actions.innerHTML = ''
      + '<button class="map-action-btn spy" onclick="openMissionModal(\'spy\', \'' + npc.id + '\', ' + x + ', ' + y + ')">🔍 Espiar</button>'
      + '<button class="map-action-btn atk" onclick="openMissionModal(\'attack\', \'' + npc.id + '\', ' + x + ', ' + y + ')">⚔️ Atacar</button>';
  } else {
    actions.innerHTML = '<span style="color:var(--danger);font-size:.72rem;">⚠ Fuera de alcance — mejora la Torre de Vigía</span>';
  }
}

async function openMissionModal(type, targetId, x, y) {
  // v1.22: Bloquear ataques/espionaje a aliados por código
  if (type === 'attack' || type === 'spy') {
    var targetVill = allVillages.find(function (v) { return v.id === targetId; });
    if (targetVill && _allyUserIds && _allyUserIds.has(targetVill.owner_id)) {
      showNotif('⚠️ No puedes ' + (type === 'attack' ? 'atacar' : 'espiar') + ' a un aliado.', 'err');
      return;
    }
  }
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var troops = vs.troops || {};

  // Aldeanos LIBRES (no asignados a recursos) — los únicos que pueden enviarse
  var aldLibres = res.aldeanos_libres || 0;

  var html = '<div class="bld-modal-overlay" id="missionOverlay" onclick="closeMissionOverlay(event)">'
    + '<div class="bld-modal" style="max-width:400px;">'
    + '<div class="bld-modal-head">'
    + '<div class="bld-modal-icon">' + (type === 'spy' ? '🏹' : '⚔️') + '</div>'
    + '<div><div class="bld-modal-title">' + (type === 'spy' ? 'Preparar Espionaje' : 'Enviar Ataque') + '</div>'
    + '<div class="bld-modal-sub">Destino: [' + x + ', ' + y + ']</div></div>'
    + '<button class="bld-modal-close" onclick="document.getElementById(\'bldModal\').style.display=\'none\';">&#x2715;</button>'
    + '</div>'
    + '<div class="bld-modal-body" style="padding:15px;">';

  if (type === 'spy') {
    var scouts = troops.explorador || 0;
    if (scouts <= 0) {
      html += '<p style="color:var(--danger); text-align:center;">Necesitas al menos 1 Explorador para espiar.</p>';
    } else {
      html += '<p>Selecciona cuántos exploradores enviar:</p>'
        + '<input type="number" id="mUnits_explorador" value="1" min="1" max="' + scouts + '" style="width:100%; margin-bottom:10px;">'
        + '<p style="font-size:0.7rem; color:var(--dim);">Solo los exploradores pueden realizar misiones de espionaje.</p>';
    }
  } else {
    html += '<p>Selecciona tus tropas:</p>';
    Object.keys(TROOP_TYPES).forEach(k => {
      var count = (k === 'aldeano') ? aldLibres : (troops[k] || 0);
      if (count > 0) {
        html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">'
          + '<span>' + TROOP_TYPES[k].icon + ' ' + TROOP_TYPES[k].name + ' (' + count + ' disp.)</span>'
          + '<input type="number" id="mUnits_' + k + '" value="0" min="0" max="' + count + '" style="width:60px;" oninput="calcMissionETA(' + x + ',' + y + ')">'
          + '</div>';
      }
    });

    var creatures = vs.creatures || defaultCreatures();
    var hasCreatures = false;
    Object.keys(CREATURE_TYPES).forEach(k => {
      var count = creatures[k] || 0;
      if (count > 0) {
        if (!hasCreatures) {
          html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);"><p style="color:var(--accent);font-size:.85rem;">🐉 Criaturas:</p></div>';
          hasCreatures = true;
        }
        html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">'
          + '<span>' + CREATURE_TYPES[k].icon + ' ' + CREATURE_TYPES[k].name + ' (' + count + ' disponibles)</span>'
          + '<input type="number" id="mUnits_' + k + '" value="0" min="0" max="' + count + '" style="width:60px;">'
          + '</div>';
      }
    });

    if (Object.values(troops).reduce((a, b) => a + b, 0) === 0 && !hasCreatures) {
      html += '<p style="color:var(--danger);">No tienes tropas ni criaturas disponibles.</p>';
    }

    // Tropas aliadas estacionadas — SOLO para ataques PvP (no NPC)
    var isPvPTarget = allVillages && allVillages.some(function (v) { return v.id === targetId; });
    if (isPvPTarget && _guestTroopsTableExists !== false) {
      try {
        var gtr = await sbClient.from('guest_troops')
          .select('id,owner_id,troops')
          .eq('host_village_id', activeVillage.id);
        if (!gtr.error && gtr.data && gtr.data.length > 0) {
          var hasGuestTroops = false;
          var guestHtml = '';
          gtr.data.forEach(function (gt) {
            var gTroops = typeof gt.troops === 'string' ? JSON.parse(gt.troops) : (gt.troops || {});
            var ownerName = (profileCache[gt.owner_id] && profileCache[gt.owner_id].username)
              ? profileCache[gt.owner_id].username : '(aliado)';
            Object.keys(gTroops).forEach(function (k) {
              var n = gTroops[k] || 0;
              if (n <= 0) return;
              var tDef = TROOP_TYPES[k] || CREATURE_TYPES[k];
              if (!tDef) return;
              hasGuestTroops = true;
              guestHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
                + '<span style="color:var(--accent2);">' + tDef.icon + ' ' + tDef.name
                + ' <span style="color:var(--dim);font-size:.68rem;">(' + n + ' disp. · ' + escapeHtml(ownerName) + ')</span></span>'
                + '<input type="number" id="gUnits_' + gt.id + '_' + k + '" value="0" min="0" max="' + n
                + '" data-gtid="' + gt.id + '" data-troop="' + k
                + '" data-ownerid="' + gt.owner_id + '" data-origvid="' + gt.origin_village_id
                + '" style="width:60px;" oninput="calcMissionETA(' + x + ',' + y + ')">'
                + '</div>';
            });
          });
          if (hasGuestTroops) {
            html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">'
              + '<p style="color:var(--accent2);font-size:.85rem;">🛡️ Tropas aliadas estacionadas aquí:</p>'
              + '<p style="color:var(--dim);font-size:.68rem;margin-top:-6px;margin-bottom:8px;">Puedes incluirlas en el ataque. Sus bajas son permanentes.</p>'
              + '</div>';
            html += guestHtml;
          }
        }
      } catch (e) { /* ignorar error de guest_troops */ }
    }
  }

  // ETA based on distance + slowest troop
  var dist = Math.max(Math.abs(x - activeVillage.x), Math.abs(y - activeVillage.y));
  html += '</div>'
    + '<div style="padding:8px 15px;border-top:1px solid var(--border);background:var(--panel2);">'
    + '<div style="font-size:.68rem;color:var(--dim);margin-bottom:2px;">📍 Distancia: ' + dist + ' casillas</div>'
    + '<div id="missionETA" style="font-size:.8rem;color:var(--accent);">Selecciona tropas para ver ETA</div>'
    + '</div>'
    + '<div class="bld-modal-footer">'
    + '<button class="bld-footer-btn avail" onclick="executeMissionClick(\'' + type + '\', \'' + targetId + '\', ' + x + ', ' + y + ')">Confirmar Misión</button>'
    + '</div>'
    + '</div></div>';
  var wrap = document.getElementById('bldModal'); // reusing building modal container
  wrap.innerHTML = html;
  wrap.style.display = 'block';
}

function calcMissionETA(destX, destY) {
  if (!activeVillage) return;
  var dist = Math.max(Math.abs(destX - activeVillage.x), Math.abs(destY - activeVillage.y));
  var minSpeed = Infinity;
  Object.keys(TROOP_TYPES).forEach(function (k) {
    var input = document.getElementById('mUnits_' + k);
    if (input && parseInt(input.value) > 0) {
      var spd = TROOP_TYPES[k].speed || 1;
      if (spd < minSpeed) minSpeed = spd;
    }
  });
  Object.keys(CREATURE_TYPES).forEach(function (k) {
    var input = document.getElementById('mUnits_' + k);
    if (input && parseInt(input.value) > 0) {
      var spd = CREATURE_TYPES[k].speed || 1;
      if (spd < minSpeed) minSpeed = spd;
    }
  });
  var etaEl = document.getElementById('missionETA');
  if (!etaEl) return;
  if (!isFinite(minSpeed)) {
    etaEl.textContent = 'Selecciona tropas para ver ETA';
    etaEl.style.color = 'var(--dim)';
    return;
  }
  // Speed = casillas/min
  var etaSecs = Math.ceil((dist / minSpeed) * 60);
  var arrivalTime = new Date(Date.now() + etaSecs * 1000);
  var arrStr = arrivalTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  etaEl.textContent = '⏱ ' + fmtTime(etaSecs) + ' · Llegada ~' + arrStr + ' (vel. mín: ' + minSpeed + ')';
  etaEl.style.color = 'var(--accent)';
}

function closeMissionOverlay(event) {
  if (event.target.id === 'missionOverlay') {
    document.getElementById('bldModal').style.display = 'none';
  }
}

async function executeMissionClick(type, targetId, x, y) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var selectedTroops = {};
  var total = 0;

  // Collect troops
  Object.keys(TROOP_TYPES).forEach(k => {
    var el = document.getElementById('mUnits_' + k);
    if (el) {
      var val = parseInt(el.value) || 0;
      if (val > 0) {
        selectedTroops[k] = val;
        total += val;
      }
    }
  });

  // Collect creatures
  Object.keys(CREATURE_TYPES).forEach(k => {
    var el = document.getElementById('mUnits_' + k);
    if (el) {
      var val = parseInt(el.value) || 0;
      if (val > 0) {
        selectedTroops[k] = val;
        total += val;
      }
    }
  });

  if (total <= 0) {
    showNotif("Debes seleccionar al menos una unidad.", "err");
    return;
  }

  // Verificar aldeanos libres si se seleccionaron
  if (selectedTroops.aldeano && selectedTroops.aldeano > 0) {
    var aldLibres = res.aldeanos_libres || 0;
    if (selectedTroops.aldeano > aldLibres) {
      showNotif('Solo tienes ' + aldLibres + ' aldeanos libres. ' + (res.aldeanos_total - aldLibres) + ' están asignados a recursos.', 'err');
      return;
    }
  }

  // Verificar tropas y criaturas disponibles
  for (var k in selectedTroops) {
    if (k === 'aldeano') continue; // ya verificado arriba

    if (TROOP_TYPES[k]) {
      var available = vs.troops[k] || 0;
      if (selectedTroops[k] > available) {
        showNotif('No tienes suficientes ' + TROOP_TYPES[k].name + 's', 'err');
        return;
      }
    } else if (CREATURE_TYPES[k]) {
      var available = (vs.creatures && vs.creatures[k]) || 0;
      if (selectedTroops[k] > available) {
        showNotif('No tienes suficientes ' + CREATURE_TYPES[k].name + 's', 'err');
        return;
      }
    }
  }

  document.getElementById('bldModal').style.display = 'none';
  // Recolectar tropas aliadas agrupadas por contingente (gt_id → {owner_id, origin_village_id, troops})
  var contingentsMap = {};
  var guestInputs = document.querySelectorAll('[id^="gUnits_"]');
  guestInputs.forEach(function (el) {
    var val = parseInt(el.value) || 0;
    if (val <= 0) return;
    var gtId = el.dataset.gtid;
    var troopKey = el.dataset.troop;
    if (!contingentsMap[gtId]) {
      contingentsMap[gtId] = {
        gt_id: gtId,
        owner_id: el.dataset.ownerid,
        origin_village_id: el.dataset.origvid,
        troops: {}
      };
    }
    contingentsMap[gtId].troops[troopKey] = (contingentsMap[gtId].troops[troopKey] || 0) + val;
    total += val;
  });
  var guestContingents = Object.values(contingentsMap).filter(function (c) {
    return Object.values(c.troops).some(function (n) { return n > 0; });
  });
  if (total <= 0) { showNotif('Debes seleccionar al menos una unidad.', 'err'); return; }
  await startMission(type, x, y, targetId, selectedTroops,
    guestContingents.length > 0 ? guestContingents : null);
}

function goToCoords() {
  var x = parseInt(document.getElementById('mapGoX').value);
  var y = parseInt(document.getElementById('mapGoY').value);
  if (isNaN(x) || isNaN(y)) { showNotif('Coordenadas inválidas', 'err'); return; }
  if (x < 1 || x > MAP_SIZE || y < 1 || y > MAP_SIZE) {
    showNotif('Coordenadas fuera del mapa (1-' + MAP_SIZE + ')', 'err'); return;
  }
  mapCamX = x;
  mapCamY = y;
  renderMap();
  showNotif('Navegando a [' + x + ', ' + y + ']', 'ok');
}

async function foundVillage(x, y) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var myVillagesList = myVillages || [];
  if (myVillagesList.length >= 10) { showNotif('Máximo 10 aldeas', 'err'); return; }
  var exploradores = (vs.troops && vs.troops.explorador) || 0;
  if (exploradores < 1) { showNotif('Necesitas al menos 1 explorador', 'err'); return; }
  var aldeanos = (vs.troops && vs.troops.aldeano) || 0;
  if (aldeanos < 50) { showNotif('Necesitas 50 aldeanos', 'err'); return; }

  // Calcular tiempo de viaje — el más lento marca la velocidad (aldeano speed=1, explorador speed=4)
  var dist = Math.max(Math.abs(x - activeVillage.x), Math.abs(y - activeVillage.y));
  var foundingTroops = { explorador: 1, aldeano: 50 };
  var minSpeed = Object.keys(foundingTroops).reduce(function (min, k) {
    var spd = (TROOP_TYPES[k] && TROOP_TYPES[k].speed) || 1;
    return Math.min(min, spd);
  }, 999);
  if (minSpeed === 999) minSpeed = 1;
  var seconds = Math.ceil((dist / minSpeed) * MISSION_FACTOR);
  var arrivalStr = new Date(Date.now() + seconds * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  if (!confirm('Fundar aldea en [' + x + ', ' + y + ']?\n\nConsume 1 explorador + 50 aldeanos.\nTiempo de viaje: ' + fmtTime(seconds) + ' (llegada ~' + arrivalStr + ')')) return;

  // Guardar valores originales por si hay que revertir
  var origExploradores = exploradores;
  var origAldeanos = aldeanos;
  var origAssigned = vs.aldeanos_assigned ? JSON.parse(JSON.stringify(vs.aldeanos_assigned)) : null;

  // Consumir tropas
  vs.troops.explorador = Math.max(0, exploradores - 1);
  consumeAldeanos(vs, 50);

  // Añadir misión de fundación al queue
  var finishAt = new Date(Date.now() + seconds * 1000).toISOString();
  if (!vs.mission_queue) vs.mission_queue = [];
  vs.mission_queue.push({
    type: 'found',
    tx: x,
    ty: y,
    targetId: null,
    troops: { explorador: 1, aldeano: 50 },
    finish_at: finishAt,
    start_at: new Date().toISOString()
  });

  try {
    flushVillage();
    showNotif('🏠 Colonos en camino a [' + x + ', ' + y + ']! Llegarán en ' + fmtTime(seconds), 'ok');
    tick();
  } catch (e) {
    // Revertir si falla el guardado
    vs.troops.explorador = origExploradores;
    vs.troops.aldeano = origAldeanos;
    if (origAssigned) vs.aldeanos_assigned = origAssigned;
    vs.mission_queue = vs.mission_queue.filter(function (m) { return m.finish_at !== finishAt; });
    showNotif('Error al enviar colonos: ' + (e.message || e), 'err');
    console.error('foundVillage error:', e);
  }
}

async function executeFounding(m) {
  // Crear la aldea en Supabase cuando llegan los colonos
  var myVillagesList = myVillages || [];
  if (myVillagesList.length >= 10) {
    await sendSystemReport(currentUser.id, '⚠️ COLONOS RECHAZADOS',
      'Tus colonos llegaron a [' + m.tx + ', ' + m.ty + '] pero ya tienes el máximo de 10 aldeas. Los colonos se perdieron.');
    return;
  }
  // Verificar que la casilla siga libre
  var occupied = allVillages.find(function (v) { return v.x === m.tx && v.y === m.ty; });
  if (occupied) {
    await sendSystemReport(currentUser.id, '⚠️ COLONOS RECHAZADOS',
      'Tus colonos llegaron a [' + m.tx + ', ' + m.ty + '] pero otro jugador ya fundó una aldea ahí. Los colonos se perdieron.');
    return;
  }
  try {
    var newVillageName = 'Aldea ' + (myVillagesList.length + 1);
    var r = await sbClient.from('villages').insert({
      owner_id: currentUser.id,
      name: newVillageName,
      cx: m.tx,
      cy: m.ty,
      build_queue: null,
      mission_queue: [],
      summoning_queue: [],
      training_queue: []
    }).select('id').single();
    if (r.error) throw r.error;

    var newId = r.data.id;
    await sbClient.from('resources').insert({ village_id: newId, madera: 500, piedra: 300, hierro: 100, prov: 200, esencia: 0 });
    await sbClient.from('buildings').insert({
      village_id: newId,
      aserradero: 1, cantera: 1, minehierro: 1, granja: 1, almacen: 1,
      torre: 1, barracas: 1, circulo: 1, reclutamiento: 1,
      muralla: 0, lab: 0
    });
    var newTroops = { village_id: newId };
    Object.keys(TROOP_TYPES).forEach(function (k) { newTroops[k] = k === 'aldeano' ? 50 : 0; });
    await sbClient.from('troops').insert(newTroops);

    await sendSystemReport(currentUser.id, '🏠 ¡NUEVA ALDEA FUNDADA!',
      'Tus colonos han llegado a [' + m.tx + ', ' + m.ty + '] y han fundado ' + newVillageName + '.\n¡Ya puedes seleccionarla en el desplegable de aldeas!');
    showNotif('¡Nueva aldea fundada en [' + m.tx + ', ' + m.ty + ']!', 'ok');
    await loadMyVillages();
    renderMap();
  } catch (e) {
    console.error('executeFounding error:', e);
    await sendSystemReport(currentUser.id, '❌ ERROR AL FUNDAR ALDEA',
      'Los colonos llegaron a [' + m.tx + ', ' + m.ty + '] pero ocurrió un error al crear la aldea: ' + (e.message || e));
  }
}

async function openMapDM(targetUserId, targetName) {
  if (!targetUserId) { showNotif('No se puede identificar al jugador', 'err'); return; }
  showNotif('Abriendo chat con ' + targetName + '…', 'ok');
  // Navigate to messages and open DM
  showPage('messages', document.querySelector('.nav-item[onclick*="messages"]'));
  await new Promise(r => setTimeout(r, 300));
  try {
    var r = await sbClient.rpc('get_or_create_dm_thread', {
      p_user1: currentUser.id, p_user2: targetUserId
    });
    if (r.error) throw r.error;
    currentThreadId = r.data;
    currentThreadType = 'dm';
    renderMessagesHeader('dm', 'DM con ' + targetName);
    subscribeToThread(currentThreadId);
    await loadThreadMessages('dm');
    await renderThreads();
  } catch (e) {
    showNotif('Error: ' + e.message, 'err');
  }
}

function selectCell(village, isOwn, isAlly, x, y) {
  // backward compat: if called with 4 args (old path), shift
  if (typeof isAlly === 'number') { y = x; x = isAlly; isAlly = false; }
  var panel = document.getElementById('mapPanel');
  var title = document.getElementById('mapPanelTitle');
  var sub = document.getElementById('mapPanelSub');
  var actions = document.getElementById('mapActions');
  panel.classList.add('show');

  var inRange = isInTorreRange(x, y);
  var rng = activeVillage ? getTorreRange(activeVillage.state.buildings) : 0;
  var rngTag = rng === 0
    ? ' <span style="color:var(--danger);font-size:.64rem;">⚠ Sin torre</span>'
    : (inRange
      ? ' <span style="color:var(--ok);font-size:.64rem;">✓ En rango (' + rng + ')</span>'
      : ' <span style="color:var(--danger);font-size:.64rem;">✗ Fuera de rango (' + rng + ')</span>');

  if (!village) {
    title.textContent = 'Casilla vacía';
    sub.innerHTML = '[' + x + ', ' + y + ']' + rngTag;
    if (inRange) {
      var myVillageCount = (myVillages || []).length;
      if (myVillageCount >= 10) {
        actions.innerHTML = '<span style="font-size:.7rem;color:var(--danger);">Máximo 10 aldeas alcanzado.</span>';
      } else {
        actions.innerHTML = '<button class="map-action-btn move" onclick="foundVillage(' + x + ',' + y + ')">🏠 Fundar Aldea<br><span style="font-size:.6rem;color:rgba(255,255,255,.6);">Consume 1 explorador + 50 aldeanos</span></button>';
      }
    } else {
      var rng2 = activeVillage ? getTorreRange(activeVillage.state.buildings) : 0;
      var outMsg = rng2 === 0
        ? '<span style="font-size:.7rem;color:var(--danger)">⚠ No tienes Torre de Vigía. Constrúyela para poder fundar aldeas aquí.</span>'
        : '<span style="font-size:.7rem;color:var(--danger)">⚠ Fuera de alcance. Mejora la Torre de Vigía (nivel actual: ' + rng2 + ') para fundar una aldea aquí.</span>';
      actions.innerHTML = outMsg;
    }
    return;
  }

  var ownerName = (village.state && village.state.owner_name) ? village.state.owner_name : 'Desconocido';

  if (isOwn) {
    title.textContent = (village.name || 'Mi Aldea') + ' 🏠';
    sub.innerHTML = '[' + x + ', ' + y + '] · Tuya' + rngTag;
    if (village.id === activeVillage.id) {
      actions.innerHTML = '<span style="font-size:.7rem;color:var(--dim);">Esta es tu aldea activa.</span>';
    } else {
      var vid2 = village.id || '';
      var vname2 = escapeJs(village.name || 'Aldea');
      actions.innerHTML = ''
        + '<button class="map-action-btn move" onclick="openMoveModal(\'' + vid2 + '\',\'' + vname2 + '\',' + x + ',' + y + ',false)">⚔ Mover tropas</button>'
        + '<button class="map-action-btn move" style="background:rgba(212,146,58,.1);border-color:var(--madera);color:var(--madera);" onclick="openTransportModal(\'' + vid2 + '\',\'' + vname2 + '\',' + x + ',' + y + ',false)">📦 Transportar recursos</button>';
    }
  } else if (isAlly) {
    var allyOwnerId = (village.owner_id || '');
    var allyVid = (village.id || '');
    var allyVname = escapeJs(village.name || 'Aldea aliada');
    title.textContent = (village.name || 'Aldea aliada') + ' 🤝';
    sub.innerHTML = '[' + x + ', ' + y + '] · Aliado' + rngTag;
    if (inRange) {
      actions.innerHTML = ''
        + '<button class="map-action-btn move" onclick="openMoveModal(\'' + allyVid + '\',\'' + allyVname + '\',' + x + ',' + y + ',true)">🛡️ Enviar refuerzo</button>'
        + '<button class="map-action-btn move" style="background:rgba(212,146,58,.1);border-color:var(--madera);color:var(--madera);" onclick="openTransportModal(\'' + allyVid + '\',\'' + allyVname + '\',' + x + ',' + y + ',true)">📦 Enviar recursos</button>'
        + '<button class="map-action-btn spy" style="background:rgba(0,212,255,.1);border-color:var(--accent);color:var(--accent);" onclick="openMapDM(\'' + allyOwnerId + '\',\'' + escapeJs(ownerName || 'Aliado') + '\')">✉️ Mensaje</button>';
    } else {
      actions.innerHTML = '<span style="color:var(--danger);font-size:.72rem;">⚠ Fuera de alcance — mejora la Torre de Vigía</span>';
    }
  } else {
    title.textContent = (village.name || 'Aldea enemiga') + ' ⚔️';
    sub.textContent = '[' + x + ', ' + y + '] · ' + String(ownerName || '');
    var span = document.createElement('span');
    span.style.fontSize = '.64rem';
    span.style.marginLeft = '6px';
    if (rng === 0) { span.style.color = 'var(--danger)'; span.textContent = '⚠ Sin torre'; }
    else if (inRange) { span.style.color = 'var(--ok)'; span.textContent = '✓ En rango (' + rng + ')'; }
    else { span.style.color = 'var(--danger)'; span.textContent = '✗ Fuera de rango (' + rng + ')'; }
    sub.appendChild(span);
    var ownerId = (village.owner_id || village.user_id || '');
    var vid = (village.id || '');
    if (inRange) {
      actions.innerHTML = ''
        + '<button class="map-action-btn atk" onclick="openMissionModal(\'attack\',\'' + vid + '\',' + x + ',' + y + ')">⚔️ Atacar</button>'
        + '<button class="map-action-btn spy" onclick="openMissionModal(\'spy\',\'' + vid + '\',' + x + ',' + y + ')">🔍 Espiar</button>'
        + '<button class="map-action-btn move" style="background:rgba(0,212,255,.1);border-color:var(--accent);color:var(--accent);" onclick="openMapDM(\'' + ownerId + '\',\'' + escapeJs(ownerName) + '\')">✉️ Mensaje</button>';
    } else {
      actions.innerHTML = '<span style="color:var(--danger);font-size:.72rem;">⚠ Fuera de alcance — mejora la Torre de Vigía</span>';
    }
  }
}

// ================================================================
// MOVE / TRANSPORT / REINFORCE SYSTEM
// ================================================================

var _allyUserIds = new Set();

async function loadAllyUserIds() {
  _allyUserIds = new Set();
  if (!_myAllianceId) return;
  try {
    var r = await sbClient.from('alliance_members')
      .select('user_id').eq('alliance_id', _myAllianceId).eq('status', 'active');
    if (r.data) r.data.forEach(function (m) {
      if (m.user_id !== currentUser.id) _allyUserIds.add(m.user_id);
    });
  } catch (e) { console.warn('loadAllyUserIds error', e); }
}

function calcTotalCapacity(troops) {
  var cap = 0;
  Object.keys(troops).forEach(function (k) {
    var count = troops[k] || 0;
    if (count <= 0) return;
    var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
    cap += count * ((td && td.capacity) || 0);
  });
  return cap;
}

// ============================================================
// MOVER TROPAS - 2 PASOS
// Paso 1: Seleccionar tropas → Paso 2: Seleccionar recursos (opcional)
// Las tropas SE QUEDAN permanentemente en destino
// ============================================================
function openMoveModal(destVillageId, destVillageName, tx, ty, isAllyDest) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var troops = vs.troops || {};
  var aldLibres = res.aldeanos_libres || 0;
  var dist = Math.max(Math.abs(tx - activeVillage.x), Math.abs(ty - activeVillage.y));

  // PASO 1: Seleccionar tropas
  var troopRows = '';
  var hasTroops = false;
  Object.keys(TROOP_TYPES).forEach(function (k) {
    var count = (k === 'aldeano') ? aldLibres : (troops[k] || 0);
    if (count <= 0) return;
    hasTroops = true;
    var capInfo = (TROOP_TYPES[k].capacity || 0) > 0 ? ' • Cap: ' + TROOP_TYPES[k].capacity : '';
    troopRows += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<span>' + TROOP_TYPES[k].icon + ' ' + TROOP_TYPES[k].name + ' (' + count + ' disp.)<span style="color:var(--dim);font-size:.7rem;">' + capInfo + '</span></span>'
      + '<input type="number" id="mv_troop_' + k + '" value="0" min="0" max="' + count + '" style="width:64px;" oninput="calcMoveCapacity()">'
      + '</div>';
  });

  // Agregar criaturas
  var creatures = vs.creatures || defaultCreatures();
  Object.keys(CREATURE_TYPES).forEach(function (k) {
    var count = creatures[k] || 0;
    if (count <= 0) return;
    hasTroops = true;
    troopRows += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<span>' + CREATURE_TYPES[k].icon + ' ' + CREATURE_TYPES[k].name + ' (' + count + ' disponibles)</span>'
      + '<input type="number" id="mv_troop_' + k + '" value="0" min="0" max="' + count + '" style="width:64px;" oninput="calcMoveCapacity()">'
      + '</div>';
  });

  if (!hasTroops) {
    showNotif('No tienes tropas disponibles.', 'err');
    return;
  }

  var titleTxt = isAllyDest ? '🛡️ Enviar refuerzo' : '⚔ Mover tropas';
  var note = isAllyDest
    ? '<div style="font-size:.72rem;color:var(--accent2);margin-bottom:10px;">Las tropas se quedarán en la aldea aliada. Tú o el aliado podéis llamarlas de vuelta.</div>'
    : '<div style="font-size:.72rem;color:var(--accent);margin-bottom:10px;">Las tropas pasarán a ser de esta aldea permanentemente.</div>';

  var html = '<div class="bld-modal-overlay" id="moveOverlay" onclick="closeMoveOverlay(event)">'
    + '<div class="bld-modal" style="max-width:420px;">'
    + '<div class="bld-modal-head"><div class="bld-modal-icon">' + (isAllyDest ? '🛡️' : '⚔') + '</div>'
    + '<div><div class="bld-modal-title">' + titleTxt + '</div>'
    + '<div class="bld-modal-sub">Paso 1/2: Selecciona tropas • Hacia ' + escapeHtml(destVillageName) + '</div></div>'
    + '<button class="bld-modal-close" onclick="document.getElementById(\'bldModal\').style.display=\'none\';">&#x2715;</button>'
    + '</div><div class="bld-modal-body" style="padding:15px;">' + note
    + '<div style="font-size:.68rem;color:var(--accent);margin-bottom:6px;">Capacidad de carga: <b id="mvCapDisplay">0</b> unidades</div>'
    + troopRows
    + '</div><div style="padding:8px 15px;border-top:1px solid var(--border);background:var(--panel2);">'
    + '<div style="font-size:.68rem;color:var(--dim);">📍 Distancia: ' + dist + ' casillas</div>'
    + '<div id="mvTroopETA" style="font-size:.8rem;color:var(--dim);">Selecciona tropas para ver ETA</div>'
    + '</div><div class="bld-modal-footer">'
    + '<button class="bld-footer-btn avail" onclick="moveStep2(\'' + destVillageId + '\',\'' + escapeJs(destVillageName) + '\',' + tx + ',' + ty + ',' + (isAllyDest ? 'true' : 'false') + ')">Siguiente →</button>'
    + '</div></div></div>';

  window._moveDest = { vid: destVillageId, name: destVillageName, tx: tx, ty: ty, isAlly: isAllyDest, dist: dist };

  var wrap = document.getElementById('bldModal');
  wrap.innerHTML = html;
  wrap.style.display = 'block';
}

function calcMoveCapacity() {
  var totalCap = 0;
  var minSpeed = Infinity;
  var hasTroops = false;

  Object.keys(TROOP_TYPES).forEach(function (k) {
    var el = document.getElementById('mv_troop_' + k);
    if (!el) return;
    var qty = parseInt(el.value) || 0;
    if (qty > 0) {
      hasTroops = true;
      totalCap += qty * (TROOP_TYPES[k].capacity || 0);
      var spd = TROOP_TYPES[k].speed || 1;
      if (spd < minSpeed) minSpeed = spd;
    }
  });

  Object.keys(CREATURE_TYPES).forEach(function (k) {
    var el = document.getElementById('mv_troop_' + k);
    if (!el) return;
    var qty = parseInt(el.value) || 0;
    if (qty > 0) {
      hasTroops = true;
      // Criaturas NO tienen capacidad de carga
      var spd = CREATURE_TYPES[k].speed || 1;
      if (spd < minSpeed) minSpeed = spd;
    }
  });

  var capEl = document.getElementById('mvCapDisplay');
  if (capEl) capEl.textContent = totalCap;

  var etaEl = document.getElementById('mvTroopETA');
  if (etaEl) {
    if (!hasTroops) {
      etaEl.textContent = 'Selecciona tropas para ver ETA';
      etaEl.style.color = 'var(--dim)';
    } else {
      var dist = (window._moveDest && window._moveDest.dist) || 0;
      var secs = Math.ceil((dist / minSpeed) * MISSION_FACTOR);
      var arr = new Date(Date.now() + secs * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      etaEl.textContent = '⏱ ' + fmtTime(secs) + ' • Llegada ~' + arr + ' (vel: ' + minSpeed + ')';
      etaEl.style.color = 'var(--accent)';
    }
  }
}

function moveStep2(destVillageId, destVillageName, tx, ty, isAllyDest) {
  // Recoger tropas seleccionadas
  var selectedTroops = {};
  var totalCap = 0;
  var minSpeed = Infinity;
  var hasTroops = false;

  Object.keys(TROOP_TYPES).forEach(function (k) {
    var el = document.getElementById('mv_troop_' + k);
    if (!el) return;
    var qty = parseInt(el.value) || 0;
    if (qty > 0) {
      selectedTroops[k] = qty;
      hasTroops = true;
      totalCap += qty * (TROOP_TYPES[k].capacity || 0);
      var spd = TROOP_TYPES[k].speed || 1;
      if (spd < minSpeed) minSpeed = spd;
    }
  });

  Object.keys(CREATURE_TYPES).forEach(function (k) {
    var el = document.getElementById('mv_troop_' + k);
    if (!el) return;
    var qty = parseInt(el.value) || 0;
    if (qty > 0) {
      selectedTroops[k] = qty;
      hasTroops = true;
      var spd = CREATURE_TYPES[k].speed || 1;
      if (spd < minSpeed) minSpeed = spd;
    }
  });

  if (!hasTroops) {
    showNotif('Selecciona al menos una tropa.', 'err');
    return;
  }

  // PASO 2: Seleccionar recursos (opcional)
  var vs = activeVillage.state;
  var dist = Math.max(Math.abs(tx - activeVillage.x), Math.abs(ty - activeVillage.y));

  var resRows = '';
  if (totalCap > 0) {
    var resKeys = ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'];
    var resIcons = { madera: '🌲', piedra: '⛰️', hierro: '⚙️', provisiones: '🌾', esencia: '✨' };
    resKeys.forEach(function (rk) {
      var have = Math.floor(vs.resources[rk] || 0);
      if (have <= 0) return;
      resRows += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
        + '<span>' + resIcons[rk] + ' ' + rk.charAt(0).toUpperCase() + rk.slice(1) + ' (' + fmt(have) + ' disp.)</span>'
        + '<input type="number" id="mv_' + rk + '" value="0" min="0" max="' + Math.min(have, totalCap) + '" style="width:80px;" oninput="calcMoveLoad()">'
        + '</div>';
    });
  }

  var troopSummary = '';
  Object.keys(selectedTroops).forEach(function (k) {
    var typeData = TROOP_TYPES[k] || CREATURE_TYPES[k];
    troopSummary += (typeData.icon || '') + ' ' + selectedTroops[k] + ' ' + (typeData.name || k) + ' • ';
  });
  troopSummary = troopSummary.slice(0, -3);

  var titleTxt = isAllyDest ? '🛡️ Enviar refuerzo' : '⚔ Mover tropas';
  var note = isAllyDest
    ? 'Las tropas se quedarán en la aldea aliada hasta que las llames de vuelta.'
    : 'Las tropas pasarán a ser de esta aldea permanentemente.';

  var html = '<div class="bld-modal-overlay" id="moveOverlay" onclick="closeMoveOverlay(event)">'
    + '<div class="bld-modal" style="max-width:420px;">'
    + '<div class="bld-modal-head"><div class="bld-modal-icon">' + (isAllyDest ? '🛡️' : '⚔') + '</div>'
    + '<div><div class="bld-modal-title">' + titleTxt + '</div>'
    + '<div class="bld-modal-sub">Paso 2/2: Recursos (opcional) • Hacia ' + escapeHtml(destVillageName) + '</div></div>'
    + '<button class="bld-modal-close" onclick="document.getElementById(\'bldModal\').style.display=\'none\';">&#x2715;</button>'
    + '</div><div class="bld-modal-body" style="padding:15px;">'
    + '<div style="font-size:.7rem;color:var(--dim);margin-bottom:6px;padding:6px 8px;background:var(--panel2);border-radius:4px;">' + troopSummary + '</div>'
    + '<div style="font-size:.68rem;color:var(--accent2);margin-bottom:8px;">' + note + '</div>';

  if (totalCap > 0 && resRows) {
    html += '<div style="font-size:.68rem;color:var(--accent);margin-bottom:6px;">Capacidad: <b id="mvCapDisplay2">' + totalCap + '</b> uds • Cargado: <b id="mvLoadDisplay" style="color:var(--ok)">0</b></div>'
      + resRows;
  } else if (totalCap > 0) {
    html += '<p style="color:var(--dim);font-size:.75rem;">Sin recursos disponibles para enviar.</p>';
  } else {
    html += '<p style="color:var(--dim);font-size:.75rem;">Las tropas seleccionadas no tienen capacidad de carga.</p>';
  }

  html += '</div><div style="padding:8px 15px;border-top:1px solid var(--border);background:var(--panel2);">'
    + '<div style="font-size:.68rem;color:var(--dim);">📍 ' + dist + ' casillas • ETA: <span id="mvETA">' + fmtTime(Math.ceil((dist / minSpeed) * MISSION_FACTOR)) + '</span></div>'
    + '<div id="mvWarning" style="font-size:.68rem;color:var(--danger);min-height:14px;"></div>'
    + '</div><div class="bld-modal-footer">'
    + '<button class="bld-footer-btn" style="background:var(--border);color:var(--dim);" onclick="openMoveModal(\'' + destVillageId + '\',\'' + escapeJs(destVillageName) + '\',' + tx + ',' + ty + ',' + (isAllyDest ? 'true' : 'false') + ')">← Atrás</button>'
    + '<button class="bld-footer-btn avail" onclick="executeMoveClick(\'' + destVillageId + '\',' + tx + ',' + ty + ',' + (isAllyDest ? 'true' : 'false') + ')">Enviar tropas</button>'
    + '</div></div></div>';

  window._moveTotalCap = totalCap;
  window._moveMinSpeed = minSpeed;
  window._moveDist = dist;
  window._moveSelectedTroops = selectedTroops;

  var wrap = document.getElementById('bldModal');
  wrap.innerHTML = html;
  wrap.style.display = 'block';
  if (totalCap > 0) calcMoveLoad();
}

function calcMoveLoad() {
  var load = 0;
  ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'].forEach(function (rk) {
    var el = document.getElementById('mv_' + rk);
    if (el) load += parseInt(el.value) || 0;
  });
  var loadEl = document.getElementById('mvLoadDisplay');
  var warnEl = document.getElementById('mvWarning');
  if (loadEl) { loadEl.textContent = load; loadEl.style.color = load > (window._moveTotalCap || 0) ? 'var(--danger)' : 'var(--ok)'; }
  if (warnEl) warnEl.textContent = load > (window._moveTotalCap || 0) ? '⚠ Sobrepasa la capacidad de carga' : '';
}

function closeMoveOverlay(event) {
  if (event.target.id === 'moveOverlay') document.getElementById('bldModal').style.display = 'none';
}

async function executeMoveClick(destVillageId, tx, ty, isAllyDest) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);

  // Usar tropas pre-seleccionadas del paso 1
  var selectedTroops = window._moveSelectedTroops || {};
  if (Object.keys(selectedTroops).length === 0) {
    showNotif('No hay tropas seleccionadas.', 'err');
    return;
  }

  // Validar que tenemos las tropas
  var aldLibres = res.aldeanos_libres || 0;
  for (var k in selectedTroops) {
    var needed = selectedTroops[k];
    var available = 0;
    if (k === 'aldeano') {
      available = aldLibres;
    } else if (TROOP_TYPES[k]) {
      available = vs.troops[k] || 0;
    } else if (CREATURE_TYPES[k]) {
      available = (vs.creatures && vs.creatures[k]) || 0;
    }
    if (needed > available) {
      var typeData = TROOP_TYPES[k] || CREATURE_TYPES[k];
      showNotif('No tienes suficientes ' + (typeData ? typeData.name : k) + 's.', 'err');
      return;
    }
  }

  // Recoger recursos opcionales
  var cargo = {}; var totalLoad = 0;
  ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'].forEach(function (rk) {
    var el = document.getElementById('mv_' + rk);
    var v = parseInt((el && el.value) || 0);
    if (v > 0) { cargo[rk] = v; totalLoad += v; }
  });

  // Validar capacidad si hay recursos
  if (totalLoad > 0) {
    var totalCap = window._moveTotalCap || 0;
    if (totalLoad > totalCap) {
      showNotif('Sobrepasa la capacidad de carga.', 'err');
      return;
    }
    for (var rk in cargo) {
      if (cargo[rk] > Math.floor(vs.resources[rk] || 0)) {
        showNotif('No tienes suficientes ' + rk + '.', 'err');
        return;
      }
    }
  }

  document.getElementById('bldModal').style.display = 'none';

  var dist = Math.max(Math.abs(tx - activeVillage.x), Math.abs(ty - activeVillage.y));
  var minSpeed = window._moveMinSpeed || 1;
  var seconds = Math.ceil((dist / minSpeed) * MISSION_FACTOR);
  var finishAt = new Date(Date.now() + seconds * 1000).toISOString();

  snapshotResources(vs);

  // Descontar recursos
  for (var rk in cargo) {
    vs.resources[rk] = Math.max(0, (vs.resources[rk] || 0) - cargo[rk]);
  }

  // Descontar tropas
  Object.keys(selectedTroops).forEach(function (k) {
    if (k === 'aldeano') {
      vs.resources.aldeanos = Math.max(0, (vs.resources.aldeanos || 0) - selectedTroops[k]);
      vs.troops.aldeano = vs.resources.aldeanos;
    } else if (TROOP_TYPES[k]) {
      vs.troops[k] = Math.max(0, (vs.troops[k] || 0) - selectedTroops[k]);
    } else if (CREATURE_TYPES[k]) {
      vs.creatures[k] = Math.max(0, ((vs.creatures && vs.creatures[k]) || 0) - selectedTroops[k]);
    }
  });

  if (!vs.mission_queue) vs.mission_queue = [];
  vs.mission_queue.push({
    type: isAllyDest ? 'reinforce' : 'move',
    tx: tx, ty: ty, targetId: destVillageId,
    troops: selectedTroops,
    cargo: cargo, // Recursos opcionales
    finish_at: finishAt,
    start_at: new Date().toISOString(),
    origin_village_id: activeVillage.id,
    origin_owner_id: currentUser.id
  });

  await flushVillage();
  var cargoMsg = totalLoad > 0 ? ' (con ' + totalLoad + ' recursos)' : '';
  showNotif((isAllyDest ? '🛡️ Refuerzo enviado' : '⚔ Tropas en camino') + cargoMsg + ' • ' + fmtTime(seconds), 'ok');
  tick();
}

function _calcMinTroopSpeed(troops, aldLibres) {
  var minSpeed = Infinity;
  Object.keys(TROOP_TYPES).forEach(function (k) {
    var count = (k === 'aldeano') ? aldLibres : (troops[k] || 0);
    if (count > 0 && (TROOP_TYPES[k].capacity || 0) > 0) {
      var spd = TROOP_TYPES[k].speed || 1;
      if (spd < minSpeed) minSpeed = spd;
    }
  });
  return isFinite(minSpeed) ? minSpeed : 1;
}

// ============================================================
// TRANSPORTE DE MATERIAL - 2 PASOS
// Paso 1: Seleccionar tropas → Paso 2: Seleccionar recursos
// Las tropas VAN, DEJAN recursos y VUELVEN
// ============================================================
function openTransportModal(destVillageId, destVillageName, tx, ty, isAllyDest) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var troops = vs.troops || {};
  var aldLibres = res.aldeanos_libres || 0;
  var dist = Math.max(Math.abs(tx - activeVillage.x), Math.abs(ty - activeVillage.y));

  // PASO 1: Seleccionar tropas
  var troopRows = '';
  var hasTroops = false;
  Object.keys(TROOP_TYPES).forEach(function (k) {
    var count = (k === 'aldeano') ? aldLibres : (troops[k] || 0);
    if (count <= 0) return;
    if ((TROOP_TYPES[k].capacity || 0) <= 0) return; // Solo tropas con capacidad
    hasTroops = true;
    troopRows += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<span>' + TROOP_TYPES[k].icon + ' ' + TROOP_TYPES[k].name + ' (' + count + ' disp.) <span style="color:var(--dim);font-size:.7rem;">• Cap: ' + TROOP_TYPES[k].capacity + '</span></span>'
      + '<input type="number" id="tr_troop_' + k + '" value="0" min="0" max="' + count + '" style="width:64px;" oninput="calcTransportCapacity()">'
      + '</div>';
  });

  if (!hasTroops) {
    showNotif('No tienes tropas con capacidad de carga disponibles.', 'err');
    return;
  }

  var html = '<div class="bld-modal-overlay" id="transportOverlay" onclick="closeTransportOverlay(event)">'
    + '<div class="bld-modal" style="max-width:420px;">'
    + '<div class="bld-modal-head"><div class="bld-modal-icon">📦</div>'
    + '<div><div class="bld-modal-title">Transporte de material</div>'
    + '<div class="bld-modal-sub">Paso 1/2: Selecciona tropas • Hacia ' + escapeHtml(destVillageName) + '</div></div>'
    + '<button class="bld-modal-close" onclick="document.getElementById(\'bldModal\').style.display=\'none\';">&#x2715;</button>'
    + '</div><div class="bld-modal-body" style="padding:15px;">'
    + '<div style="font-size:.72rem;color:var(--accent2);margin-bottom:10px;">Las tropas irán, dejarán el material y volverán automáticamente.</div>'
    + '<div style="font-size:.68rem;color:var(--accent);margin-bottom:6px;">Capacidad total: <b id="trCapDisplay">0</b> unidades</div>'
    + troopRows
    + '</div><div style="padding:8px 15px;border-top:1px solid var(--border);background:var(--panel2);">'
    + '<div style="font-size:.68rem;color:var(--dim);">📍 Distancia: ' + dist + ' casillas</div>'
    + '<div id="trTroopETA" style="font-size:.8rem;color:var(--dim);">Selecciona tropas para ver ETA</div>'
    + '</div><div class="bld-modal-footer">'
    + '<button class="bld-footer-btn avail" onclick="transportStep2(\'' + destVillageId + '\',\'' + escapeJs(destVillageName) + '\',' + tx + ',' + ty + ',' + (isAllyDest ? 'true' : 'false') + ')">Siguiente →</button>'
    + '</div></div></div>';

  window._transportDest = { vid: destVillageId, name: destVillageName, tx: tx, ty: ty, isAlly: isAllyDest, dist: dist };

  var wrap = document.getElementById('bldModal');
  wrap.innerHTML = html;
  wrap.style.display = 'block';
}

function calcTransportCapacity() {
  var totalCap = 0;
  var minSpeed = Infinity;
  var hasTroops = false;

  Object.keys(TROOP_TYPES).forEach(function (k) {
    var el = document.getElementById('tr_troop_' + k);
    if (!el) return;
    var qty = parseInt(el.value) || 0;
    if (qty > 0) {
      hasTroops = true;
      totalCap += qty * (TROOP_TYPES[k].capacity || 0);
      var spd = TROOP_TYPES[k].speed || 1;
      if (spd < minSpeed) minSpeed = spd;
    }
  });

  var capEl = document.getElementById('trCapDisplay');
  if (capEl) capEl.textContent = totalCap;

  var etaEl = document.getElementById('trTroopETA');
  if (etaEl) {
    if (!hasTroops) {
      etaEl.textContent = 'Selecciona tropas para ver ETA';
      etaEl.style.color = 'var(--dim)';
    } else {
      var dist = (window._transportDest && window._transportDest.dist) || 0;
      var secs = Math.ceil((dist / minSpeed) * MISSION_FACTOR);
      var arr = new Date(Date.now() + secs * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      etaEl.textContent = '⏱ Ida: ' + fmtTime(secs) + ' • Vuelta: ' + fmtTime(secs) + ' • Llegada ~' + arr + ' (vel: ' + minSpeed + ')';
      etaEl.style.color = 'var(--accent)';
    }
  }
}

function transportStep2(destVillageId, destVillageName, tx, ty, isAllyDest) {
  // Recoger tropas seleccionadas
  var selectedTroops = {};
  var totalCap = 0;
  var minSpeed = Infinity;
  var hasTroops = false;

  Object.keys(TROOP_TYPES).forEach(function (k) {
    var el = document.getElementById('tr_troop_' + k);
    if (!el) return;
    var qty = parseInt(el.value) || 0;
    if (qty > 0) {
      selectedTroops[k] = qty;
      hasTroops = true;
      totalCap += qty * (TROOP_TYPES[k].capacity || 0);
      var spd = TROOP_TYPES[k].speed || 1;
      if (spd < minSpeed) minSpeed = spd;
    }
  });

  if (!hasTroops) {
    showNotif('Selecciona al menos una tropa.', 'err');
    return;
  }

  // PASO 2: Seleccionar recursos
  var vs = activeVillage.state;
  var dist = Math.max(Math.abs(tx - activeVillage.x), Math.abs(ty - activeVillage.y));

  var resRows = '';
  var resKeys = ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'];
  var resIcons = { madera: '🌲', piedra: '⛰️', hierro: '⚙️', provisiones: '🌾', esencia: '✨' };
  resKeys.forEach(function (rk) {
    var have = Math.floor(vs.resources[rk] || 0);
    if (have <= 0) return;
    resRows += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<span>' + resIcons[rk] + ' ' + rk.charAt(0).toUpperCase() + rk.slice(1) + ' (' + fmt(have) + ' disp.)</span>'
      + '<input type="number" id="tr_' + rk + '" value="0" min="0" max="' + Math.min(have, totalCap) + '" style="width:80px;" oninput="calcTransportLoad()">'
      + '</div>';
  });

  var troopSummary = '';
  Object.keys(selectedTroops).forEach(function (k) {
    troopSummary += TROOP_TYPES[k].icon + ' ' + selectedTroops[k] + ' ' + TROOP_TYPES[k].name + '(s) • ';
  });
  troopSummary = troopSummary.slice(0, -3); // quitar último •

  var html = '<div class="bld-modal-overlay" id="transportOverlay" onclick="closeTransportOverlay(event)">'
    + '<div class="bld-modal" style="max-width:420px;">'
    + '<div class="bld-modal-head"><div class="bld-modal-icon">📦</div>'
    + '<div><div class="bld-modal-title">Transporte de material</div>'
    + '<div class="bld-modal-sub">Paso 2/2: Selecciona recursos • Hacia ' + escapeHtml(destVillageName) + '</div></div>'
    + '<button class="bld-modal-close" onclick="document.getElementById(\'bldModal\').style.display=\'none\';">&#x2715;</button>'
    + '</div><div class="bld-modal-body" style="padding:15px;">'
    + '<div style="font-size:.7rem;color:var(--dim);margin-bottom:6px;padding:6px 8px;background:var(--panel2);border-radius:4px;">' + troopSummary + '</div>'
    + '<div style="font-size:.68rem;color:var(--accent);margin-bottom:6px;">Capacidad: <b id="trCapDisplay2">' + totalCap + '</b> uds • Cargado: <b id="trLoadDisplay" style="color:var(--ok)">0</b></div>'
    + (resRows || '<p style="color:var(--dim);">Sin recursos disponibles.</p>')
    + '</div><div style="padding:8px 15px;border-top:1px solid var(--border);background:var(--panel2);">'
    + '<div style="font-size:.68rem;color:var(--dim);">📍 ' + dist + ' casillas • ETA: <span id="trETA">' + fmtTime(Math.ceil((dist / minSpeed) * MISSION_FACTOR)) + '</span></div>'
    + '<div id="trWarning" style="font-size:.68rem;color:var(--danger);min-height:14px;"></div>'
    + '</div><div class="bld-modal-footer">'
    + '<button class="bld-footer-btn" style="background:var(--border);color:var(--dim);" onclick="openTransportModal(\'' + destVillageId + '\',\'' + escapeJs(destVillageName) + '\',' + tx + ',' + ty + ',' + (isAllyDest ? 'true' : 'false') + ')">← Atrás</button>'
    + '<button class="bld-footer-btn avail" onclick="executeTransportClick(\'' + destVillageId + '\',' + tx + ',' + ty + ',' + (isAllyDest ? 'true' : 'false') + ')">Enviar transporte</button>'
    + '</div></div></div>';

  window._transportTotalCap = totalCap;
  window._transportMinSpeed = minSpeed;
  window._transportDist = dist;
  window._transportSelectedTroops = selectedTroops;

  var wrap = document.getElementById('bldModal');
  wrap.innerHTML = html;
  wrap.style.display = 'block';
  calcTransportLoad();
}

function closeTransportOverlay(event) {
  if (event.target.id === 'transportOverlay') {
    document.getElementById('bldModal').style.display = 'none';
  }
}

function calcTransportLoad() {
  var load = 0;
  ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'].forEach(function (rk) {
    var el = document.getElementById('tr_' + rk);
    if (el) load += parseInt(el.value) || 0;
  });
  var loadEl = document.getElementById('trLoadDisplay');
  var warnEl = document.getElementById('trWarning');
  var etaEl = document.getElementById('trETA');
  if (loadEl) { loadEl.textContent = load; loadEl.style.color = load > (window._transportTotalCap || 0) ? 'var(--danger)' : 'var(--ok)'; }
  if (warnEl) warnEl.textContent = load > (window._transportTotalCap || 0) ? '\u26a0 Sobrepasa la capacidad de carga' : '';
  if (etaEl && window._transportDist != null) {
    var secs = Math.ceil((window._transportDist / (window._transportMinSpeed || 1)) * MISSION_FACTOR);
    etaEl.textContent = fmtTime(secs);
  }
}

async function executeTransportClick(destVillageId, tx, ty, isAllyDest) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var aldLibres = res.aldeanos_libres || 0;

  // Validar tropas seleccionadas
  var selectedTroops = window._transportSelectedTroops || {};
  if (Object.keys(selectedTroops).length === 0) {
    showNotif('No hay tropas seleccionadas.', 'err');
    return;
  }

  // Validar que tenemos las tropas
  for (var k in selectedTroops) {
    var needed = selectedTroops[k];
    var available = (k === 'aldeano') ? aldLibres : (vs.troops[k] || 0);
    if (needed > available) {
      showNotif('No tienes suficientes ' + TROOP_TYPES[k].name + 's.', 'err');
      return;
    }
  }

  // Recoger recursos seleccionados
  var cargo = {}; var totalLoad = 0;
  ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'].forEach(function (rk) {
    var el = document.getElementById('tr_' + rk);
    var v = parseInt((el && el.value) || 0);
    if (v > 0) { cargo[rk] = v; totalLoad += v; }
  });

  if (totalLoad <= 0) { showNotif('Selecciona al menos un recurso.', 'err'); return; }
  if (totalLoad > (window._transportTotalCap || 0)) { showNotif('Sobrepasa la capacidad de carga.', 'err'); return; }

  for (var rk in cargo) {
    if (cargo[rk] > Math.floor(vs.resources[rk] || 0)) { showNotif('No tienes suficientes ' + rk + '.', 'err'); return; }
  }

  document.getElementById('bldModal').style.display = 'none';

  var minSpeed = window._transportMinSpeed || 1;
  var dist = Math.max(Math.abs(tx - activeVillage.x), Math.abs(ty - activeVillage.y));
  var seconds = Math.ceil((dist / minSpeed) * MISSION_FACTOR);
  var finishAt = new Date(Date.now() + seconds * 1000).toISOString();

  snapshotResources(vs);

  // Descontar recursos
  for (var rk in cargo) vs.resources[rk] = Math.max(0, (vs.resources[rk] || 0) - cargo[rk]);

  // Descontar tropas temporalmente
  for (var k in selectedTroops) {
    if (k === 'aldeano') {
      vs.resources.aldeanos = Math.max(0, (vs.resources.aldeanos || 0) - selectedTroops[k]);
      vs.troops.aldeano = vs.resources.aldeanos; // mantener sincronizado
    } else {
      vs.troops[k] = Math.max(0, (vs.troops[k] || 0) - selectedTroops[k]);
    }
  }

  if (!vs.mission_queue) vs.mission_queue = [];
  vs.mission_queue.push({
    type: 'transport',
    status: 'going', // 'going' -> 'returning'
    tx: tx,
    ty: ty,
    targetId: destVillageId,
    troops: selectedTroops,
    resources: cargo,
    is_ally: isAllyDest,
    finish_at: finishAt,
    start_at: new Date().toISOString(),
    origin_village_id: activeVillage.id,
    minSpeed: minSpeed
  });

  await flushVillage();
  showNotif('📦 Transporte en camino • ' + fmtTime(seconds), 'ok');
  tick();
}

async function executeMove(m) {
  try {
    var destVillage = myVillages.find(function (v) { return v.id === m.targetId; });
    if (!destVillage) { await loadMyVillages(); destVillage = myVillages.find(function (v) { return v.id === m.targetId; }); }
    if (!destVillage) {
      await sendSystemReport(currentUser.id, '\u26a0\ufe0f MOVIMIENTO FALLIDO', 'Las tropas llegaron a [' + m.tx + ', ' + m.ty + '] pero la aldea no existe o ya no es tuya.');
      return;
    }
    var dvs = destVillage.state;

    // Entregar recursos si hay cargo
    var cargoMsg = '';
    if (m.cargo && Object.keys(m.cargo).length > 0) {
      var rr = await sbClient.from('resources').select('madera,piedra,hierro,prov,esencia').eq('village_id', m.targetId).single();
      if (!rr.error) {
        var newRes = {
          madera: (Number(rr.data.madera) || 0) + (m.cargo.madera || 0),
          piedra: (Number(rr.data.piedra) || 0) + (m.cargo.piedra || 0),
          hierro: (Number(rr.data.hierro) || 0) + (m.cargo.hierro || 0),
          prov: (Number(rr.data.prov) || 0) + (m.cargo.provisiones || 0),
          esencia: (Number(rr.data.esencia) || 0) + (m.cargo.esencia || 0),
          last_update: new Date().toISOString()
        };
        await sbClient.from('resources').update(newRes).eq('village_id', m.targetId);
        dvs.resources.madera = newRes.madera;
        dvs.resources.piedra = newRes.piedra;
        dvs.resources.hierro = newRes.hierro;
        dvs.resources.provisiones = newRes.prov;
        dvs.resources.esencia = newRes.esencia;

        var cargoList = Object.keys(m.cargo).filter(function (k) { return m.cargo[k] > 0; })
          .map(function (k) { return fmt(m.cargo[k]) + ' ' + k; }).join(', ');
        cargoMsg = '\n📦 Entregaron: ' + cargoList;
      }
    }

    var freeSlots = Math.max(0, getBarracksCapacity(dvs.buildings) - getBarracksUsed(dvs));
    var slotsNeeded = 0;
    Object.keys(m.troops).forEach(function (k) {
      var count = m.troops[k] || 0;
      if (count > 0) slotsNeeded += (k === 'aldeano') ? count : count * ((TROOP_TYPES[k] && TROOP_TYPES[k].barracasSlots) || 1);
    });
    var pct = slotsNeeded > freeSlots ? freeSlots / slotsNeeded : 1;
    var accepted = {}, rejected = {}, anyRejected = false;
    Object.keys(m.troops).forEach(function (k) {
      var count = m.troops[k] || 0;
      var toAccept = Math.floor(count * pct);
      accepted[k] = toAccept;
      if (toAccept < count) { rejected[k] = count - toAccept; anyRejected = true; }
    });
    Object.keys(accepted).forEach(function (k) {
      if ((accepted[k] || 0) <= 0) return;
      if (TROOP_TYPES[k]) dvs.troops[k] = (dvs.troops[k] || 0) + accepted[k];
      else if (CREATURE_TYPES[k]) { if (!dvs.creatures) dvs.creatures = defaultCreatures(); dvs.creatures[k] = (dvs.creatures[k] || 0) + accepted[k]; }
    });
    await saveVillage(destVillage);
    if (anyRejected) {
      var origV = myVillages.find(function (v) { return v.id === m.origin_village_id; });
      if (origV) {
        Object.keys(rejected).forEach(function (k) {
          if ((rejected[k] || 0) <= 0) return;
          if (TROOP_TYPES[k]) origV.state.troops[k] = (origV.state.troops[k] || 0) + rejected[k];
          else if (CREATURE_TYPES[k]) origV.state.creatures[k] = (origV.state.creatures[k] || 0) + rejected[k];
        });
        await saveVillage(origV);
      }
    }
    var rejMsg = anyRejected ? '\n\u26a0\ufe0f Algunas tropas volvieron (barracas llenas en destino).' : '';
    await sendSystemReport(currentUser.id, '\u2694 TROPAS TRASLADADAS',
      'Tropas llegaron a ' + (destVillage.name || 'aldea') + ' [' + m.tx + ', ' + m.ty + '] y ya son de esa aldea.' + cargoMsg + rejMsg);
    renderMap();
  } catch (e) { console.error('executeMove error:', e); }
}

async function executeReinforce(m) {
  if (_guestTroopsTableExists === false) {
    // Tabla no disponible — devolver tropas a origen
    var origV = myVillages.find(function (v) { return v.id === m.origin_village_id; });
    if (origV) {
      Object.keys(m.troops).forEach(function (k) {
        if (TROOP_TYPES[k]) origV.state.troops[k] = (origV.state.troops[k] || 0) + (m.troops[k] || 0);
        else if (CREATURE_TYPES[k]) origV.state.creatures[k] = (origV.state.creatures[k] || 0) + (m.troops[k] || 0);
      });
      await saveVillage(origV);
    }
    await sendSystemReport(currentUser.id, '⚠️ REFUERZO NO DISPONIBLE',
      'El sistema de refuerzos a aliados aún no está activo. Las tropas han regresado a casa.');
    return;
  }
  try {
    var troopJson = JSON.stringify(m.troops);
    var r = await sbClient.from('guest_troops').insert({
      owner_id: m.origin_owner_id || currentUser.id,
      origin_village_id: m.origin_village_id,
      host_village_id: m.targetId,
      troops: troopJson,
      arrived_at: new Date().toISOString(),
      recall_requested: false
    });
    if (r.error) throw r.error;
    await sendSystemReport(currentUser.id, '\u{1f6e1}\ufe0f REFUERZO ENTREGADO',
      'Tus tropas llegaron a [' + m.tx + ', ' + m.ty + '] y est\u00e1n estacionadas. Pulsa "Volver" cuando quieras recuperarlas.');
    renderReinforcementsPanel();
  } catch (e) {
    console.error('executeReinforce error:', e);
    var origV = myVillages.find(function (v) { return v.id === m.origin_village_id; });
    if (origV) {
      Object.keys(m.troops).forEach(function (k) {
        if (TROOP_TYPES[k]) origV.state.troops[k] = (origV.state.troops[k] || 0) + (m.troops[k] || 0);
        else if (CREATURE_TYPES[k]) origV.state.creatures[k] = (origV.state.creatures[k] || 0) + (m.troops[k] || 0);
      });
      await saveVillage(origV);
    }
    await sendSystemReport(currentUser.id, '\u26a0\ufe0f REFUERZO FALLIDO',
      'Las tropas no pudieron llegar y volvieron a casa. Error: ' + (e.message || e));
  }
}

async function executeTransport(m) {
  try {
    var cargo = m.cargo || {};
    var rr = await sbClient.from('resources').select('madera,piedra,hierro,prov,esencia').eq('village_id', m.targetId).single();
    if (rr.error) throw rr.error;
    var newRes = {
      madera: (Number(rr.data.madera) || 0) + (cargo.madera || 0),
      piedra: (Number(rr.data.piedra) || 0) + (cargo.piedra || 0),
      hierro: (Number(rr.data.hierro) || 0) + (cargo.hierro || 0),
      prov: (Number(rr.data.prov) || 0) + (cargo.provisiones || 0),
      esencia: (Number(rr.data.esencia) || 0) + (cargo.esencia || 0),
      last_update: new Date().toISOString()
    };
    await sbClient.from('resources').update(newRes).eq('village_id', m.targetId);
    var destV = myVillages.find(function (v) { return v.id === m.targetId; });
    if (destV) {
      destV.state.resources.madera = newRes.madera; destV.state.resources.piedra = newRes.piedra;
      destV.state.resources.hierro = newRes.hierro; destV.state.resources.provisiones = newRes.prov;
      destV.state.resources.esencia = newRes.esencia;
    }
    var cargoStr = Object.keys(cargo).filter(function (k) { return cargo[k] > 0; })
      .map(function (k) { return fmt(cargo[k]) + ' ' + k; }).join(', ');
    await sendSystemReport(currentUser.id, '\ud83d\udce6 CARAVANA LLEG\u00d3',
      'Tu caravana entreg\u00f3 ' + cargoStr + ' en [' + m.tx + ', ' + m.ty + '].');
    renderMap();
  } catch (e) {
    console.error('executeTransport error:', e);
    var origV = myVillages.find(function (v) { return v.id === m.origin_village_id; });
    if (origV && m.cargo) {
      Object.keys(m.cargo).forEach(function (rk) { origV.state.resources[rk] = (origV.state.resources[rk] || 0) + (m.cargo[rk] || 0); });
      await saveVillage(origV);
    }
    await sendSystemReport(currentUser.id, '\u26a0\ufe0f CARAVANA FALLIDA',
      'Los recursos volvieron a tu aldea. Error: ' + (e.message || e));
  }
}

var _guestTroopsTableExists = null; // null=unknown, true=yes, false=no

async function renderReinforcementsPanel() {
  var card = document.getElementById('ovReinforcementsCard');
  var box = document.getElementById('ovReinforcementsBox');
  if (!card || !box || !activeVillage) return;
  // Si ya sabemos que la tabla no existe, no volver a intentar
  if (_guestTroopsTableExists === false) { card.style.display = 'none'; return; }
  try {
    var r = await sbClient.from('guest_troops')
      .select('id,owner_id,origin_village_id,host_village_id,troops,arrived_at,recall_requested')
      .eq('host_village_id', activeVillage.id);
    if (r.error) {
      // Tabla no existe o error de schema — desactivar silenciosamente
      _guestTroopsTableExists = false;
      card.style.display = 'none';
      return;
    }
    _guestTroopsTableExists = true;
    if (!r.data || r.data.length === 0) { card.style.display = 'none'; return; }
    card.style.display = '';
    var html = '';
    r.data.forEach(function (gt) {
      // Owner name: look up from profileCache if available
      var ownerName = (profileCache[gt.owner_id] && profileCache[gt.owner_id].username) ? profileCache[gt.owner_id].username : gt.owner_id.slice(0, 8);
      // Look up origin village from local allVillages cache
      var origV = allVillages.find(function (v) { return v.id === gt.origin_village_id; })
        || myVillages.find(function (v) { return v.id === gt.origin_village_id; });
      var origName = (origV && origV.name) ? origV.name : 'Aldea';
      var origCoords = origV ? '[' + origV.x + ',' + origV.y + ']' : '';
      var troops = typeof gt.troops === 'string' ? JSON.parse(gt.troops) : (gt.troops || {});
      var troopStr = Object.keys(troops).filter(function (k) { return (troops[k] || 0) > 0; })
        .map(function (k) { return troops[k] + ' ' + ((TROOP_TYPES[k] && TROOP_TYPES[k].icon) || k); }).join(', ');
      var isOwner = gt.owner_id === currentUser.id;
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--panel2);border-radius:6px;margin-bottom:6px;border:1px solid rgba(96,208,96,.2);">'
        + '<div><span style="color:var(--accent2);">\u{1f6e1}\ufe0f ' + escapeHtml(ownerName) + '</span>'
        + '<span style="color:var(--dim);font-size:.72rem;"> desde ' + escapeHtml(origName) + ' ' + origCoords + '</span>'
        + (gt.recall_requested ? '<span style="color:var(--danger);font-size:.68rem;"> \u00b7 \u21a9 RETIRO SOLICITADO</span>' : '')
        + '<br><span style="font-size:.75rem;">' + escapeHtml(troopStr || 'sin tropas') + '</span>'
        + '</div>'
        + '<button onclick="recallReinforcement(\'' + gt.id + '\')" style="padding:3px 8px;background:rgba(224,64,64,.1);border:1px solid var(--danger);color:var(--danger);border-radius:3px;font-size:.62rem;cursor:pointer;margin-left:8px;">'
        + (isOwner ? '\u21a9 Volver' : '\u21a9 Devolver') + '</button>'
        + (isOwner ? '<button onclick="moveGuestTroops(\'' + gt.id + '\',\'' + escapeJs(JSON.stringify(troops)) + '\')" style="padding:3px 8px;background:rgba(0,212,255,.1);border:1px solid var(--accent);color:var(--accent);border-radius:3px;font-size:.62rem;cursor:pointer;margin-left:4px;">⚔ Mover</button>' : '')
        + '</div>';
    });
    box.innerHTML = html;
  } catch (e) { card.style.display = 'none'; }
}

async function recallReinforcement(guestTroopId) {
  var r = await sbClient.from('guest_troops').update({ recall_requested: true }).eq('id', guestTroopId);
  if (r.error) { showNotif('Error: ' + r.error.message, 'err'); return; }
  showNotif('\u21a9 Retiro solicitado. Las tropas volver\u00e1n a casa.', 'ok');
  renderReinforcementsPanel();
}

function moveGuestTroops(guestTroopId, troopsJson) {
  if (!activeVillage) return;
  var troops = {};
  try { troops = JSON.parse(troopsJson); } catch (e) { showNotif('Error leyendo tropas', 'err'); return; }
  var availableVillages = (myVillages || []).filter(function (v) { return v.id !== activeVillage.id; });
  if (availableVillages.length === 0) {
    showNotif('No tienes otras aldeas a las que mover las tropas.', 'err'); return;
  }
  var opts = availableVillages.map(function (v) {
    return '<option value="' + v.id + '" data-x="' + v.x + '" data-y="' + v.y + '">'
      + escapeHtml(v.name || 'Aldea') + ' [' + v.x + ',' + v.y + ']</option>';
  }).join('');
  var troopStr = Object.keys(troops).filter(function (k) { return (troops[k] || 0) > 0; })
    .map(function (k) {
      var t = TROOP_TYPES[k] || CREATURE_TYPES[k];
      return (t ? t.icon + ' ' + troops[k] + ' ' + t.name : k + ' x' + troops[k]);
    }).join(', ');
  var html = '<div class="bld-modal-overlay" id="moveGuestOverlay" onclick="if(event.target.id===\'moveGuestOverlay\')document.getElementById(\'bldModal\').style.display=\'none\'">'
    + '<div class="bld-modal" style="max-width:380px;">'
    + '<div class="bld-modal-head"><div class="bld-modal-icon">⚔</div>'
    + '<div><div class="bld-modal-title">Mover tropas aliadas</div>'
    + '<div class="bld-modal-sub">Elige aldea destino</div></div>'
    + '<button class="bld-modal-close" onclick="document.getElementById(\'bldModal\').style.display=\'none\'">&#x2715;</button>'
    + '</div><div class="bld-modal-body" style="padding:15px;">'
    + '<div style="color:var(--accent2);font-size:.8rem;margin-bottom:10px;">🛡️ Tropas: ' + escapeHtml(troopStr) + '</div>'
    + '<div style="font-size:.75rem;color:var(--dim);margin-bottom:12px;">Las tropas marcharán como misión de movimiento y serán permanentes en destino.</div>'
    + '<label style="font-size:.8rem;color:var(--dim);">Aldea destino:</label>'
    + '<select id="moveGuestDestSel" style="width:100%;margin-top:4px;background:var(--panel2);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:5px;font-family:VT323,monospace;font-size:.9rem;">'
    + opts + '</select>'
    + '</div><div class="bld-modal-footer">'
    + '<button class="bld-footer-btn avail" onclick="confirmMoveGuestTroops(\'' + guestTroopId + '\',' + JSON.stringify(JSON.stringify(troops)) + ')">⚔ Mover</button>'
    + '</div></div></div>';
  var wrap = document.getElementById('bldModal');
  wrap.innerHTML = html;
  wrap.style.display = 'block';
}

async function confirmMoveGuestTroops(guestTroopId, troopsJson) {
  var sel = document.getElementById('moveGuestDestSel');
  if (!sel || !activeVillage) return;
  var destId = sel.value;
  var opt = sel.options[sel.selectedIndex];
  var tx = parseInt(opt.dataset.x), ty = parseInt(opt.dataset.y);
  var troops = {};
  try { troops = JSON.parse(troopsJson); } catch (e) { showNotif('Error', 'err'); return; }

  var dist = Math.max(Math.abs(tx - activeVillage.x), Math.abs(ty - activeVillage.y));
  var minSpeed = 999;
  Object.keys(troops).forEach(function (k) {
    var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
    if ((troops[k] || 0) > 0 && td && td.speed < minSpeed) minSpeed = td.speed;
  });
  if (minSpeed === 999) minSpeed = 1;
  var secs = Math.ceil((dist / minSpeed) * MISSION_FACTOR);
  var finishAt = new Date(Date.now() + secs * 1000).toISOString();

  // Eliminar de guest_troops
  var dr = await sbClient.from('guest_troops').delete().eq('id', guestTroopId);
  if (dr.error) { showNotif('Error: ' + dr.error.message, 'err'); return; }

  // Crear misión de movimiento desde la aldea activa hacia destino
  if (!activeVillage.state.mission_queue) activeVillage.state.mission_queue = [];
  activeVillage.state.mission_queue.push({
    mid: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    type: 'move', tx: tx, ty: ty, targetId: destId, troops: troops,
    finish_at: finishAt, start_at: new Date().toISOString()
  });
  await flushVillage();
  document.getElementById('bldModal').style.display = 'none';
  showNotif('⚔ Tropas en marcha → [' + tx + ',' + ty + '] en ' + fmtTime(secs), 'ok');
  renderReinforcementsPanel();
}

async function processRecalls() {
  if (!currentUser) return;
  if (_guestTroopsTableExists === false) return; // tabla no existe, no intentar
  try {
    var r = await sbClient.from('guest_troops')
      .select('id,origin_village_id,host_village_id,troops')
      .eq('owner_id', currentUser.id).eq('recall_requested', true);
    if (r.error || !r.data || r.data.length === 0) return;
    for (var i = 0; i < r.data.length; i++) {
      var gt = r.data[i];
      var origVillage = myVillages.find(function (v) { return v.id === gt.origin_village_id; });
      if (!origVillage) continue;
      var hv = allVillages.find(function (v) { return v.id === gt.host_village_id; });
      var tx = hv ? Number(hv.x) : 0, ty = hv ? Number(hv.y) : 0;
      var dist = Math.max(Math.abs(tx - origVillage.x), Math.abs(ty - origVillage.y));
      var troops = typeof gt.troops === 'string' ? JSON.parse(gt.troops) : (gt.troops || {});
      var minSpeed = 999;
      Object.keys(troops).forEach(function (k) {
        var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
        if ((troops[k] || 0) > 0 && td && td.speed < minSpeed) minSpeed = td.speed;
      });
      if (minSpeed === 999) minSpeed = 1;
      var seconds = Math.ceil((dist / minSpeed) * MISSION_FACTOR);
      var finishAt = new Date(Date.now() + seconds * 1000).toISOString();
      if (!origVillage.state.mission_queue) origVillage.state.mission_queue = [];
      origVillage.state.mission_queue.push({
        type: 'return_reinforce', tx: origVillage.x, ty: origVillage.y,
        troops: troops, finish_at: finishAt, start_at: new Date().toISOString()
      });
      await saveVillage(origVillage);
      await sbClient.from('guest_troops').delete().eq('id', gt.id);
    }
  } catch (e) { console.warn('processRecalls error:', e); }
}

// ============================================================
// SIMULADOR DE BATALLA — v0.23 embebido, motor unificado con standalone
// ============================================================
var _simIframe = null;

// Simulador cargado desde game-simulator.js


function showPage(name, el) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
  document.getElementById('page-' + name).classList.add('active');
  if (el) el.classList.add('active');
  setTimeout(function () { if (name === 'buildings') renderBuildings(); if (name === 'map') renderMap(); }, 50);
  if (name === 'ranking') renderRanking();
  if (name === 'alliances') renderAlliances();
  if (name === 'research') renderResearch(); // v1.35: Centro de Investigación
  if (name === 'messages') { renderThreads(); renderMessagesHeader(); }
  if (name === 'recursos') renderRecursos();
  if (name === 'fleet') renderTroops();
  if (name === 'creatures') renderCreatures();
  if (name === 'admin-users') loadAdminUsersPage();
  if (name === 'simulator') {
    setTimeout(function () { renderSimulator(); }, 50);
  }
  // Guardar página activa en sessionStorage para restaurar tras F5
  try { sessionStorage.setItem('EW_lastPage', name); } catch (e) { }
  // Resync recursos — solo si han pasado más de 2 minutos desde el último sync
  var _nowSync = Date.now();
  if (_nowSync - (_lastResourceSync || 0) > 120000) {
    _lastResourceSync = _nowSync;
    syncResourcesFromDB();
  }
}

// Resync ligero — actualiza recursos desde DB sin recargar todo el estado
async function syncResourcesFromDB() {
  if (!activeVillage || !currentUser) return;
  try {
    var { data: res, error } = await sbClient
      .from('resources')
      .select('madera,piedra,hierro,prov,esencia,last_update')
      .eq('village_id', activeVillage.id)
      .single();
    if (error || !res) return;
    var s = activeVillage.state;
    // Solo actualizar si el valor de DB es más reciente
    var dbTime = new Date(res.last_update || 0).getTime();
    var localTime = new Date(s.last_updated || 0).getTime();
    if (dbTime >= localTime) {
      s.resources.madera = Number(res.madera) || 0;
      s.resources.piedra = Number(res.piedra) || 0;
      s.resources.hierro = Number(res.hierro) || 0;
      s.resources.provisiones = Number(res.prov) || 0;
      s.resources.esencia = Number(res.esencia) || 0;
      s.last_updated = res.last_update;
      _elCache = {}; // limpiar cache DOM
      tick();
    }
  } catch (e) {
    console.warn('syncResourcesFromDB error:', e);
  }
}

// ============================================================
// ALDEANOS — asignar / desasignar de granja
// Guardado INMEDIATO al pulsar (no espera al timer)
// ============================================================
function updateGranjaPanel() {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var assigned = vs.aldeanos_assigned || defaultAssignments();
  if (assigned.esencia === undefined) assigned.esencia = 0;

  var totalAssigned = (assigned.madera || 0) + (assigned.piedra || 0) + (assigned.hierro || 0)
    + (assigned.provisiones || 0) + (assigned.esencia || 0);

  var aldTotal = (vs.troops && vs.troops.aldeano !== undefined) ? vs.troops.aldeano : 0;
  var aldLibres = Math.max(0, aldTotal - totalAssigned);

  var el = document.getElementById('aldLibresDisplay');
  if (el) el.textContent = aldLibres + ' / ' + aldTotal;

  // Inputs para asignar
  ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'].forEach(function (key) {
    var input = document.getElementById('aldInput_' + key);
    if (input) {
      input.value = assigned[key] || 0;
      input.max = aldLibres + (assigned[key] || 0); // Puede reasignar los que ya tiene + libres
    }
  });
}

function renderRecursos() {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var w = vs.aldeanos_assigned || defaultAssignments();
  if (w.esencia === undefined) w.esencia = 0;
  var base = getBaseProd(vs.buildings);
  var bon = getBonusPerWorker(vs.buildings);
  var p = getProd(vs.buildings, 0, w);
  var totalW = (w.madera || 0) + (w.piedra || 0) + (w.hierro || 0) + (w.provisiones || 0) + (w.esencia || 0);
  var barrCap = getBarracksCapacity(vs.buildings);
  var cap = getCapacity(vs.buildings);
  var stored = res.madera + res.piedra + res.hierro + res.provisiones;
  var almPct = cap > 0 ? Math.min(100, Math.round(stored / cap * 100)) : 0;

  var elFree = document.getElementById('recAldLibres'); if (elFree) elFree.textContent = (res.aldeanos_libres !== undefined ? res.aldeanos_libres : res.aldeanos);
  var elWork = document.getElementById('recAldWorking'); if (elWork) elWork.textContent = totalW;

  // v1.17: Mostrar capacidad de barracas con porcentaje y uso
  var used = getBarracksUsed(vs);
  var barrPct = barrCap > 0 ? Math.round(used / barrCap * 100) : 0;
  var elCap = document.getElementById('recAldCap'); if (elCap) elCap.textContent = used + ' / ' + barrCap + ' (' + barrPct + '%)';

  var elAlm = document.getElementById('recAlmPct'); if (elAlm) elAlm.textContent = almPct + '%';

  var RES_DEFS = [
    { key: 'madera', icon: '🌲', name: 'Madera', color: 'var(--madera)', base: base.madera, bon: bon.madera, prod: p.madera, inAlm: true },
    { key: 'piedra', icon: '⛰️', name: 'Piedra', color: 'var(--piedra)', base: base.piedra, bon: bon.piedra, prod: p.piedra, inAlm: true },
    { key: 'hierro', icon: '⚙️', name: 'Hierro', color: 'var(--hierro)', base: base.hierro, bon: bon.hierro, prod: p.hierro, inAlm: true },
    { key: 'provisiones', icon: '🌾', name: 'Provisiones', color: 'var(--prov)', base: base.provisiones, bon: bon.provisiones, prod: p.provisiones, inAlm: true },
    { key: 'esencia', icon: '✨', name: 'Esencia', color: 'var(--esencia)', base: base.esencia, bon: bon.esencia, prod: p.esencia, inAlm: false },
  ];

  var grid = document.getElementById('recursosGrid');
  if (!grid) return;

  var KEYS = ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'];
  var totalLibres = res.aldeanos_libres !== undefined ? res.aldeanos_libres : res.aldeanos;

  grid.innerHTML = RES_DEFS.map(function (d) {
    var wk = w[d.key] || 0;
    var avl = totalLibres + wk; // disponibles = libres + ya asignados a este recurso
    return '<div class="card">'
      + '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">'
      + '<div class="h2" style="color:' + d.color + '">' + d.icon + ' ' + d.name + '</div>'
      + '<span style="font-size:.65rem;color:var(--dim);">' + (d.inAlm ? 'almacén' : 'sin límite') + '</span>'
      + '</div>'
      + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;font-size:.78rem;">'
      + '<span>📊 <b id="rw_p_' + d.key + '" style="color:' + d.color + '">' + fmt(d.prod) + '</b>/h</span>'
      + '<span style="color:var(--dim)">base ' + d.base + ' · +<b>' + d.bon + '</b>/ald·h</span>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
      + '<input type="range" min="0" max="' + avl + '" value="' + wk + '" id="rw_s_' + d.key + '"'
      + ' style="flex:1;accent-color:' + d.color + ';"'
      + ' oninput="syncWorkerInput(\'' + d.key + '\',this.value)">'
      + '<input type="number" min="0" max="' + avl + '" value="' + wk + '" id="rw_n_' + d.key + '"'
      + ' style="width:52px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-family:VT323,monospace;font-size:.82rem;text-align:center;"'
      + ' oninput="syncWorkerSlider(\'' + d.key + '\',this.value,' + avl + ')">'
      + '</div>'
      + '<div id="rw_i_' + d.key + '" style="font-size:.68rem;color:var(--dim);">' + wk + ' asignados / ' + avl + ' disponibles</div>'
      + '</div>';
  }).join('')
    + '<div style="grid-column:1/-1;display:flex;justify-content:center;padding:10px 0 4px;">'
    + '<button onclick="applyAllWorkers()" style="'
    + 'padding:10px 32px;background:rgba(240,192,64,.12);border:1px solid var(--accent);'
    + 'border-radius:6px;color:var(--accent);font-family:VT323,monospace;font-size:1rem;'
    + 'letter-spacing:.08em;cursor:pointer;transition:background .2s;"'
    + ' onmouseover="this.style.background=\'rgba(240,192,64,.22)\'"'
    + ' onmouseout="this.style.background=\'rgba(240,192,64,.12)\'">'
    + '✓ Aplicar asignación'
    + '</button>'
    + '</div>';
}

// ============================================================
// WORKER ASSIGNMENT — con reajuste reactivo de todas las barras
// ============================================================
function snapshotResources(vs) {
  var res = calcRes(vs);
  vs.resources.madera = res.madera;
  vs.resources.piedra = res.piedra;
  vs.resources.hierro = res.hierro;
  vs.resources.provisiones = res.provisiones;
  vs.resources.esencia = res.esencia;
  // Sincronizar resources.aldeanos desde troops.aldeano (fuente de verdad)
  vs.resources.aldeanos = res.aldeanos_total;
  vs.last_updated = new Date().toISOString();
  return res;
}

function debouncedSave() {
  scheduleSave();
}


function assignWorker(resource, amount) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  if (!vs.aldeanos_assigned) vs.aldeanos_assigned = defaultAssignments();
  var res = calcRes(vs);
  amount = Math.max(0, Math.min(amount, res.aldeanos));
  if (amount <= 0) { showNotif('No hay aldeanos libres.', 'err'); return; }
  // Snapshot recursos materiales; aldeanos NO se toca (calcRes lo recalcula desde total)
  vs.resources.madera = res.madera; vs.resources.piedra = res.piedra;
  vs.resources.hierro = res.hierro; vs.resources.provisiones = res.provisiones;
  vs.resources.esencia = res.esencia;
  // aldeanos sigue siendo el TOTAL (no cambiar)
  vs.aldeanos_assigned[resource] = (vs.aldeanos_assigned[resource] || 0) + amount;
  vs.aldeanos_granja = vs.aldeanos_assigned.provisiones || 0;
  vs.last_updated = new Date().toISOString();
  debouncedSave(); tick(); updateRecursosSliders();
}

function unassignWorker(resource, amount) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  if (!vs.aldeanos_assigned) vs.aldeanos_assigned = defaultAssignments();

  amount = Math.max(0, Math.min(amount, vs.aldeanos_assigned[resource] || 0));
  if (amount <= 0) return;

  // Ponemos el estado al día (incluye aldeanos TOTAL)
  snapshotResources(vs);

  vs.aldeanos_assigned[resource] = Math.max(0, (vs.aldeanos_assigned[resource] || 0) - amount);
  vs.aldeanos_granja = vs.aldeanos_assigned.provisiones || 0;

  // last_updated ya lo fijó snapshotResources()
  debouncedSave(); tick(); updateRecursosSliders();
}

// ============================================================
// APPLY ALL WORKERS — botón global que lee los 5 sliders/inputs
// de una vez y los escribe todos en state en una sola operación
// ============================================================
function applyAllWorkers() {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  if (!vs.aldeanos_assigned) vs.aldeanos_assigned = defaultAssignments();
  var w = vs.aldeanos_assigned;

  // 1) Snapshot para tener recursos y aldeanos al día
  var r = snapshotResources(vs);
  var totalLibres = r.aldeanos_libres !== undefined ? r.aldeanos_libres : r.aldeanos;
  var totalAld = r.aldeanos_total || (totalLibres + Object.values(w).reduce(function (a, b) { return a + (b || 0); }, 0));

  // 2) Leer los 5 valores del DOM tal como el usuario los ha dejado
  var KEYS = ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'];
  var newVals = {};
  var sumNew = 0;
  KEYS.forEach(function (k) {
    var el = document.getElementById('rw_n_' + k);
    var v = Math.max(0, parseInt((el && el.value) || 0) || 0);
    newVals[k] = v;
    sumNew += v;
  });

  // 3) Validar: la suma no puede superar el total de aldeanos
  if (sumNew > totalAld) {
    showNotif('Solo tienes ' + totalAld + ' aldeanos. Estás asignando ' + sumNew + '.', 'err');
    return;
  }

  // 4) Aplicar todos de golpe
  KEYS.forEach(function (k) { w[k] = newVals[k]; });
  vs.aldeanos_granja = w.provisiones || 0;
  // last_updated ya lo fijó snapshotResources()

  showNotif('✓ Aldeanos asignados correctamente', 'ok');
  debouncedSave(); tick(); updateRecursosSliders();
}

// Llamado al soltar la barra o confirmar número — guarda y refresca todo
function setWorker(resource, rawValue) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  if (!vs.aldeanos_assigned) vs.aldeanos_assigned = defaultAssignments();
  var w = vs.aldeanos_assigned;

  // 1) Primero, aplicamos el offline-calc para que recursos/aldeanos estén al día
  var r = snapshotResources(vs);

  // 2) Los disponibles para este recurso = libres + los ya asignados a ESTE recurso
  var available = (r.aldeanos_libres || 0) + (w[resource] || 0);
  var value = Math.max(0, Math.min(parseInt(rawValue) || 0, available));

  // 3) Guardamos la asignación
  w[resource] = value;
  vs.aldeanos_granja = w.provisiones || 0; // compatibilidad
  // last_updated ya lo fijó snapshotResources()

  debouncedSave(); tick(); updateRecursosSliders();
}

// Sync instantáneo mientras se arrastra (sin guardar) — actualiza número + restricciones
function syncWorkerInput(key, val) {
  var ni = document.getElementById('rw_n_' + key);
  if (ni) ni.value = val;
  _previewWorker(key, parseInt(val) || 0);
}
function syncWorkerSlider(key, val, available) {
  val = Math.max(0, Math.min(parseInt(val) || 0, available));
  var sl = document.getElementById('rw_s_' + key);
  if (sl) sl.value = val;
  _previewWorker(key, val);
}

// Vista previa: ajusta maxes de los demás sin guardar
// Lee los valores ACTUALES del DOM (no del state) para calcular libres correctamente.
// Esto evita el bug donde mover la 3ª barra calcula mal los aldeanos disponibles
// porque el state aún tiene los valores anteriores sin guardar.
function _previewWorker(changedKey, newVal) {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var totalAld = res.aldeanos_total || (vs.troops && vs.troops.aldeano) || 0;
  var KEYS = ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'];

  // Leer valores actuales del DOM (pueden diferir del state si no se ha guardado)
  var domVals = {};
  KEYS.forEach(function (k) {
    if (k === changedKey) {
      domVals[k] = parseInt(newVal) || 0;
    } else {
      var el = document.getElementById('rw_s_' + k);
      domVals[k] = el ? (parseInt(el.value) || 0) : ((vs.aldeanos_assigned || {})[k] || 0);
    }
  });

  // Total asignado según DOM actual
  var totalW = KEYS.reduce(function (sum, k) { return sum + domVals[k]; }, 0);
  var freeNow = Math.max(0, totalAld - totalW);

  // Actualizar maxes de los demás sliders
  KEYS.forEach(function (key) {
    if (key === changedKey) return;
    var cur = domVals[key];
    var newMax = cur + freeNow;
    var sl = document.getElementById('rw_s_' + key); if (sl) sl.max = newMax;
    var ni = document.getElementById('rw_n_' + key); if (ni) ni.max = newMax;
    var info = document.getElementById('rw_i_' + key);
    if (info) info.textContent = cur + ' asignados / ' + newMax + ' disponibles';
  });
  var elFree = document.getElementById('recAldLibres'); if (elFree) elFree.textContent = freeNow;
  var elWork = document.getElementById('recAldWorking'); if (elWork) elWork.textContent = totalW;
}

// Refresca sliders + stats sin re-renderizar DOM
function updateRecursosSliders() {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  var res = calcRes(vs);
  var w = vs.aldeanos_assigned || defaultAssignments();
  if (w.esencia === undefined) w.esencia = 0;
  var p = getProd(vs.buildings, 0, w);
  var cap = getCapacity(vs.buildings);
  var totalW = (w.madera || 0) + (w.piedra || 0) + (w.hierro || 0) + (w.provisiones || 0) + (w.esencia || 0);
  var barrCap = getBarracksCapacity(vs.buildings);
  var stored = res.madera + res.piedra + res.hierro + res.provisiones;
  var almPct = cap > 0 ? Math.min(100, Math.round(stored / cap * 100)) : 0;

  var elFree = document.getElementById('recAldLibres'); if (elFree) elFree.textContent = (res.aldeanos_libres !== undefined ? res.aldeanos_libres : res.aldeanos);
  var elWork = document.getElementById('recAldWorking'); if (elWork) elWork.textContent = totalW;

  // v1.17: Mostrar capacidad de barracas con porcentaje y uso
  var used = getBarracksUsed(vs);
  var barrPct = barrCap > 0 ? Math.round(used / barrCap * 100) : 0;
  var elCap = document.getElementById('recAldCap'); if (elCap) elCap.textContent = used + ' / ' + barrCap + ' (' + barrPct + '%)';

  var elAlm = document.getElementById('recAlmPct'); if (elAlm) elAlm.textContent = almPct + '%';

  var prodMap = { madera: p.madera, piedra: p.piedra, hierro: p.hierro, provisiones: p.provisiones, esencia: p.esencia };
  ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'].forEach(function (key) {
    var workers = w[key] || 0, available = (res.aldeanos_libres !== undefined ? res.aldeanos_libres : res.aldeanos) + workers;
    var sl = document.getElementById('rw_s_' + key); if (sl) { sl.max = available; sl.value = workers; }
    var ni = document.getElementById('rw_n_' + key); if (ni) { ni.max = available; ni.value = workers; }
    var info = document.getElementById('rw_i_' + key); if (info) info.textContent = workers + ' asignados / ' + available + ' disponibles';
    var prod = document.getElementById('rw_p_' + key); if (prod) prod.textContent = fmt(prodMap[key]) + '/h';
  });
  var bcEl = document.getElementById('barrCapDisplay'); if (bcEl) bcEl.textContent = barrCap;
  var usedSlotsRS = getBarracksUsed(vs);
  var buEl = document.getElementById('barrUsedDisplay'); if (buEl) buEl.textContent = usedSlotsRS;
  var bfEl = document.getElementById('barrFreeDisplay'); if (bfEl) bfEl.textContent = Math.max(0, barrCap - usedSlotsRS);
  var bpEl = document.getElementById('barrProdDisplay'); if (bpEl) bpEl.textContent = getAldeanosProd(vs.buildings);
}

// Legacy aliases

// ============================================================
// RENAME VILLAGE
// ============================================================
function startRename() {
  if (!activeVillage) return;
  var f = document.getElementById('renameForm');
  var inp = document.getElementById('renameInput');
  f.style.display = 'flex';
  inp.value = activeVillage.name;
  inp.focus();
  inp.select();
}
function cancelRename() {
  document.getElementById('renameForm').style.display = 'none';
}
async function confirmRename() {
  var inp = document.getElementById('renameInput');
  var newName = inp.value.trim();
  if (!newName) { showNotif('El nombre no puede estar vacio.', 'err'); return; }
  if (newName.length > 30) { showNotif('Maximo 30 caracteres.', 'err'); return; }
  var r = await sbClient.from('villages').update({ name: newName }).eq('id', activeVillage.id);
  if (r.error) { showNotif('Error al renombrar: ' + r.error.message, 'err'); return; }
  activeVillage.name = newName;
  populateVillageSel();
  document.getElementById('villageSel').value = activeVillage.id;
  document.getElementById('renameForm').style.display = 'none';
  tick();
  showNotif('Aldea renombrada a: ' + newName, 'ok');
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function showNotif(msg, type) {
  type = type || '';
  var el = document.createElement('div');
  el.className = 'notif ' + type;
  el.textContent = msg;
  document.getElementById('notifWrap').appendChild(el);
  setTimeout(function () { el.remove(); }, 3000);
}

// ============================================================
// FORMAT
// ============================================================
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return '' + n;
}


// ============================================================
// BUILDING DETAIL MODAL
// Calculates levels up to 100, shows current up to current+10
// ============================================================
function fmtTime(secs) {
  if (secs < 60) return secs + 's';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
  var h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h + 'h ' + (m ? m + 'm' : '');
}

function openBuildingDetail(id) {
  if (!activeVillage) return;
  modalBuildingId = id;
  var vs = activeVillage.state;
  var def = BUILDINGS.find(function (b) { return b.id === id; });
  if (!def) return;
  var curLvl = (vs.buildings[id] && vs.buildings[id].level) || 0;
  var res = calcRes(vs);
  var icon = def.icon || '🏗️';
  var inQueue = vs.build_queue && vs.build_queue.id === id;
  var anyQueue = !!vs.build_queue;
  var endShow = Math.min(curLvl + 10, 100);

  // ── Cabeceras de tabla según el edificio ──────────────────
  var isReclutamiento = (id === 'reclutamiento');
  var isAlmacen = (id === 'almacen');
  var isGranja = (id === 'granja');
  var isBarracas = (id === 'barracas');

  var isTorre = (id === 'torre');
  var isTorreInv = (id === 'torreinvocacion');
  var isMuralla = (id === 'muralla');
  var thExtra = isReclutamiento ? '<th>⚡ Aldeanos/h</th>'
    : isBarracas ? '<th>🏠 Plazas barracas</th>'
      : isAlmacen ? '<th>🏛️ Capacidad</th>'
        : isGranja ? '<th>🌾 Prov./aldeano/h</th>'
          : isTorre ? '<th>👁️ Alcance</th>'
            : isTorreInv ? '<th>🔮 Reducción</th>'
              : isMuralla ? '<th>🛡️ Defensa</th>'
                : '<th>Producción</th>';

  var rowsHTML = '';
  for (var lvl = curLvl; lvl <= endShow; lvl++) {
    var isCur = (lvl === curLvl);
    var isNext = (lvl === curLvl + 1);
    var cost = def.cost(lvl);
    var prod = def.prod(lvl);
    var tsecs = def.time(lvl);

    var rowCls = isCur ? 'row-current' : (isNext ? 'row-next' : '');
    var badgeCls = isNext ? 'lvl-badge accent' : 'lvl-badge';
    var tagHTML = isCur ? '<span class="lvl-tag cur">actual</span>'
      : isNext ? '<span class="lvl-tag nxt">siguiente</span>' : '';

    // ── Columna de "efecto" según edificio ───────────────────
    var plines = '';

    if (isReclutamiento) {
      var prodAld = (lvl === 0) ? 0 : Math.max(2, Math.floor(2 + lvl * 2));
      var fakeBldRec = {};
      BUILDINGS.forEach(function (b) { fakeBldRec[b.id] = { level: (vs.buildings[b.id] && vs.buildings[b.id].level) || 1 }; });
      fakeBldRec['reclutamiento'] = { level: lvl };
      var intMs = lvl === 0 ? Infinity : getAldeanosIntervalMs(fakeBldRec);
      var intStr = '';
      if (lvl === 0) {
        intStr = '<div class="pl" style="color:var(--danger)">Sin producción</div>';
      } else {
        var intSec = Math.round(intMs / 1000);
        var intLabel = intSec >= 60
          ? (intSec % 60 === 0 ? (intSec / 60) + ' min' : Math.floor(intSec / 60) + 'min ' + (intSec % 60) + 's')
          : intSec + 's';
        intStr = '<div class="pl" style="color:var(--accent2)">⚡ 1 aldeano cada <b>' + intLabel + '</b></div>';
      }
      plines = intStr;

    } else if (isBarracas) {
      var fakeBldBar = {}; fakeBldBar['barracas'] = { level: lvl };
      var plazas = getBarracksCapacity(fakeBldBar);
      plines = '<div class="pl" style="color:var(--aldeanos)">🏠 ' + plazas + ' plazas</div>';

    } else if (isAlmacen) {
      var cap = Math.floor(almacenCapForLevel(lvl));
      plines = '<div class="pl" style="color:var(--accent)">📦 ' + fmt(cap) + ' unidades</div>'
        + '<div class="pl none" style="font-size:.58rem;opacity:.7">(madera+piedra+hierro+provisiones — la Esencia NO usa almacén)</div>';

    } else if (isGranja) {
      var provPerAld = 5 + lvl;
      plines = '<div class="pl" style="color:var(--prov)">🌾 ' + provPerAld + ' prov./aldeano/h</div>';

    } else {
      // Simular el edificio actual a este nivel concreto, manteniendo el resto igual
      var fakeBlds = {};
      BUILDINGS.forEach(function (b) { fakeBlds[b.id] = { level: (vs.buildings[b.id] && vs.buildings[b.id].level) || 1 }; });
      fakeBlds[id] = { level: lvl };
      var bProd = getBaseProd(fakeBlds);
      var bBonus = getBonusPerWorker(fakeBlds);
      // Clave de workers según edificio
      var workerKey = id === 'aserradero' ? 'madera'
        : id === 'cantera' ? 'piedra'
          : id === 'minehierro' ? 'hierro'
            : id === 'circulo' ? 'esencia' : null;
      var wk = workerKey ? ((vs.aldeanos_assigned && vs.aldeanos_assigned[workerKey]) || 0) : 0;
      // Mostrar SOLO el recurso que produce este edificio concreto
      if (id === 'aserradero') {
        var totM = bProd.madera + wk * bBonus.madera;
        plines = '<div class="pl" style="color:var(--madera)">🌲 ' + fmt(bProd.madera) + '/h base'
          + (wk ? ' <span style="color:var(--aldeanos)">+' + fmt(bBonus.madera) + '/ald × ' + wk + ' = <b>' + fmt(totM) + '/h total</b></span>' : '') + '</div>';
      } else if (id === 'cantera') {
        var totP = bProd.piedra + wk * bBonus.piedra;
        plines = '<div class="pl" style="color:var(--piedra)">⛰️ ' + fmt(bProd.piedra) + '/h base'
          + (wk ? ' <span style="color:var(--aldeanos)">+' + fmt(bBonus.piedra) + '/ald × ' + wk + ' = <b>' + fmt(totP) + '/h total</b></span>' : '') + '</div>';
      } else if (id === 'minehierro') {
        var totH = bProd.hierro + wk * bBonus.hierro;
        plines = '<div class="pl" style="color:var(--hierro)">⚙️ ' + fmt(bProd.hierro) + '/h base'
          + (wk ? ' <span style="color:var(--aldeanos)">+' + fmt(bBonus.hierro) + '/ald × ' + wk + ' = <b>' + fmt(totH) + '/h total</b></span>' : '') + '</div>';
      } else if (id === 'circulo') {
        var totE = bProd.esencia + wk * bBonus.esencia;
        plines = '<div class="pl" style="color:var(--esencia)">✨ ' + fmt(bProd.esencia) + '/h base'
          + (wk ? ' <span style="color:var(--aldeanos)">+' + fmt(bBonus.esencia) + '/ald × ' + wk + ' = <b>' + fmt(totE) + '/h total</b></span>' : '') + '</div>';
      } else if (id === 'torre') {
        var range = lvl * 10;
        plines = lvl === 0
          ? '<div class="pl" style="color:var(--danger)">Sin alcance</div>'
          : '<div class="pl" style="color:var(--accent)">👁️ ' + range + ' casillas de alcance</div>';
      } else if (id === 'torreinvocacion') {
        var red = lvl * 5;
        plines = lvl === 0
          ? '<div class="pl" style="color:var(--danger)">Sin reducción</div>'
          : '<div class="pl" style="color:var(--esencia)">🔮 -' + red + '% tiempo invocación</div>';
      } else if (id === 'muralla') {
        var wallHPShow = lvl * 500;
        plines = lvl === 0
          ? '<div class="pl" style="color:var(--danger)">Sin muralla — tropas expuestas</div>'
          : '<div class="pl" style="color:var(--piedra)">🏰 ' + fmt(wallHPShow) + ' HP de escudo</div>'
          + '<div class="pl" style="color:var(--dim);font-size:.58rem;">Atacantes deben destruirlo antes de dañar tropas</div>';
      } else if (id === 'lab') {
        plines = lvl === 0
          ? '<div class="pl" style="color:var(--danger)">Sin nivel</div>'
          : '<div class="pl" style="color:var(--gold)">📜 Investigación activa<br><span style="font-size:.58rem;color:var(--dim)">Próximamente disponible</span></div>';
      } else {
        plines = '<div class="pl none">—</div>';
      }
    }

    // ── Coste para subir ESTE nivel al siguiente ──────────────
    var clines = '';
    if (lvl < 100) {
      var c = def.cost(lvl);
      if (c.madera) clines += '<div class="cl ' + (res.madera >= (c.madera || 0) ? 'can' : 'cant') + '">🌲 ' + fmt(c.madera) + '</div>';
      if (c.piedra) clines += '<div class="cl ' + (res.piedra >= (c.piedra || 0) ? 'can' : 'cant') + '">⛰️ ' + fmt(c.piedra) + '</div>';
      if (c.hierro) clines += '<div class="cl ' + (res.hierro >= (c.hierro || 0) ? 'can' : 'cant') + '">⚙️ ' + fmt(c.hierro) + '</div>';
      if (c.provisiones) clines += '<div class="cl ' + (res.provisiones >= (c.provisiones || 0) ? 'can' : 'cant') + '">🌾 ' + fmt(c.provisiones) + '</div>';
      if (c.esencia) clines += '<div class="cl ' + (res.esencia >= (c.esencia || 0) ? 'can' : 'cant') + '">✨ ' + fmt(c.esencia) + '</div>';
      if (!clines) clines = '<div class="cl can">—</div>';
    } else {
      clines = '<div class="cl can" style="color:var(--gold)">MAX</div>';
    }

    var timeHTML = (lvl < 100 && tsecs > 0)
      ? '<span class="ttime">' + fmtTime(tsecs) + '</span>'
      : (lvl >= 100)
        ? '<span class="ttime" style="color:var(--dim)">—</span>'
        : '<span class="ttime" style="color:var(--ok)">Instantáneo</span>';

    rowsHTML += '<tr class="' + rowCls + '">'
      + '<td><span class="' + badgeCls + '">' + lvl + '</span>' + tagHTML + '</td>'
      + '<td><div class="prod-lines">' + plines + '</div></td>'
      + '<td><div class="cost-lines">' + clines + '</div></td>'
      + '<td>' + timeHTML + '</td>'
      + '</tr>';
  }

  // ── Subtítulo contextual en la cabecera del modal ─────────
  var curBaseProd = getBaseProd(vs.buildings);
  var curBonusProd = getBonusPerWorker(vs.buildings);
  var curWorkers = vs.aldeanos_assigned || defaultAssignments();
  var modalSub = 'Nivel actual: ' + curLvl + '&nbsp;&nbsp;|&nbsp;&nbsp;Máximo: 100';
  if (isReclutamiento) {
    var curProd = (curLvl === 0) ? 0 : Math.max(2, Math.floor(2 + curLvl * 2));
    var curIntMs = getAldeanosIntervalMs(vs.buildings);
    var curIntSec = curIntMs === Infinity ? null : Math.round(curIntMs / 1000);
    var curIntLabel = curIntSec === null ? 'sin producción'
      : curIntSec >= 60
        ? (curIntSec % 60 === 0 ? (curIntSec / 60) + ' min' : Math.floor(curIntSec / 60) + 'min ' + (curIntSec % 60) + 's')
        : curIntSec + 's';
    modalSub = 'Nivel ' + curLvl + '&nbsp;·&nbsp;⚡ 1 aldeano cada ' + curIntLabel + ' (≈ ' + curProd + '/h)';
  } else if (isBarracas) {
    var fakeBldBarCur = {}; fakeBldBarCur['barracas'] = { level: curLvl };
    var curPlazas = getBarracksCapacity(fakeBldBarCur);
    modalSub = 'Nivel ' + curLvl + '&nbsp;·&nbsp;🏠 ' + curPlazas + ' plazas para tropas normales';
  } else if (isAlmacen) {
    var curCap = Math.floor(almacenCapForLevel(curLvl));
    modalSub = 'Nivel ' + curLvl + '&nbsp;·&nbsp;📦 Capacidad actual: ' + fmt(curCap) + ' unidades';
  } else if (isGranja) {
    modalSub = 'Nivel ' + curLvl + '&nbsp;·&nbsp;🌾 ' + (5 + curLvl) + ' provisiones/aldeano/h';
  } else if (id === 'aserradero') {
    var wk = curWorkers.madera || 0;
    var total = curBaseProd.madera + wk * curBonusProd.madera;
    modalSub = 'Nivel ' + curLvl + '&nbsp;·&nbsp;🌲 Base ' + fmt(curBaseProd.madera) + '/h' + (wk ? ' + ' + wk + ' ald. → ' + fmt(total) + '/h total' : '');
  } else if (id === 'cantera') {
    var wk = curWorkers.piedra || 0;
    var total = curBaseProd.piedra + wk * curBonusProd.piedra;
    modalSub = 'Nivel ' + curLvl + '&nbsp;·&nbsp;⛰️ Base ' + fmt(curBaseProd.piedra) + '/h' + (wk ? ' + ' + wk + ' ald. → ' + fmt(total) + '/h total' : '');
  } else if (id === 'minehierro') {
    var wk = curWorkers.hierro || 0;
    var total = curBaseProd.hierro + wk * curBonusProd.hierro;
    modalSub = 'Nivel ' + curLvl + '&nbsp;·&nbsp;⚙️ Base ' + fmt(curBaseProd.hierro) + '/h' + (wk ? ' + ' + wk + ' ald. → ' + fmt(total) + '/h total' : '');
  } else if (id === 'circulo') {
    var wk = curWorkers.esencia || 0;
    var total = curBaseProd.esencia + wk * curBonusProd.esencia;
    modalSub = 'Nivel ' + curLvl + '&nbsp;·&nbsp;✨ Base ' + fmt(curBaseProd.esencia) + '/h' + (wk ? ' + ' + wk + ' ald. → ' + fmt(total) + '/h total' : '');
  } else if (id === 'torre') {
    var rng = curLvl * 10;
    modalSub = curLvl === 0
      ? 'Sin nivel — sin alcance. Necesitas la Torre para atacar y espiar.'
      : 'Nivel ' + curLvl + '&nbsp;·&nbsp;👁️ Alcance actual: <b>' + rng + ' casillas (radio circular)</b>';
  } else if (id === 'torreinvocacion') {
    var red = curLvl * 5;
    modalSub = curLvl === 0
      ? 'Sin nivel — sin reducción de tiempo de invocación.'
      : 'Nivel ' + curLvl + '&nbsp;·&nbsp;🔮 Reducción actual: <b>-' + red + '%</b> tiempo de invocación';
  } else if (id === 'cuarteles') {
    var redCuar = Math.min(50, curLvl);
    modalSub = curLvl === 0
      ? 'Sin nivel — sin reducción de tiempo de entrenamiento.'
      : 'Nivel ' + curLvl + '&nbsp;·&nbsp;🎖️ Reducción actual: <b>-' + redCuar + '%</b> tiempo de entrenamiento (máx. 50%)';
  } else if (id === 'muralla') {
    var wallHPCur = curLvl * 500;
    modalSub = curLvl === 0
      ? 'Sin nivel — tus tropas están expuestas desde el primer golpe.'
      : 'Nivel ' + curLvl + '&nbsp;·&nbsp;🏰 Escudo actual: <b>' + fmt(wallHPCur) + ' HP</b> — el atacante los destruye antes de llegar a tus tropas';
  } else if (id === 'lab') {
    modalSub = 'Nivel ' + curLvl + '&nbsp;·&nbsp;📜 Módulo de Investigación — <span style="color:var(--gold)">Próximamente activo</span>';
  }

  // ── Botón footer ──────────────────────────────────────────
  var btnCls, btnTxt;
  if (curLvl >= 100) {
    btnCls = 'maxlvl'; btnTxt = 'Nivel máximo alcanzado (100)';
  } else if (inQueue) {
    btnCls = 'busy'; btnTxt = 'Construyendo nivel ' + (curLvl + 1) + '...';
  } else if (anyQueue) {
    btnCls = 'insuf'; btnTxt = 'Cola ocupada — espera a que termine';
  } else if (!canAfford(def.cost(curLvl), res)) {
    btnCls = 'insuf'; btnTxt = 'Recursos insuficientes para nivel ' + (curLvl + 1);
  } else {
    btnCls = 'avail'; btnTxt = 'Mejorar a Nivel ' + (curLvl + 1);
  }

  var html = '<div class="bld-modal-overlay" id="bldOverlay" onclick="closeBldOverlay(event)">'
    + '<div class="bld-modal">'
    + '<div class="bld-modal-head">'
    + '<div class="bld-modal-icon">' + icon + '</div>'
    + '<div><div class="bld-modal-title">' + def.name + '</div>'
    + '<div class="bld-modal-sub">' + modalSub + '</div></div>'
    + '<button class="bld-modal-close" onclick="document.getElementById(\'bldModal\').style.display=\'none\';">&#x2715; Cerrar</button>'
    + '</div>'
    + '<div class="bld-modal-body">'
    + '<div style="background:rgba(255,255,255,.04);border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:.75rem;color:var(--dim);line-height:1.5;border-left:3px solid var(--accent);">'
    + def.desc
    + '</div>'
    + '<div class="bld-modal-note">Costes en <span style="color:var(--danger)">rojo</span> = no puedes pagarlos ahora. Cada fila muestra el coste de subir ese nivel al siguiente.</div>'
    + '<table class="bld-lvl-table">'
    + '<thead><tr><th>Nivel</th>' + thExtra + '<th>Coste (subir)</th><th>Tiempo</th></tr></thead>'
    + '<tbody>' + rowsHTML + '</tbody>'
    + '</table>'
    + '</div>'
    + '<div class="bld-modal-footer">'
    + '<button class="bld-footer-btn ' + btnCls + '" onclick="startBuildCurrentModal()">' + btnTxt + '</button>'
    + '</div>'
    + '</div></div>';

  var wrap = document.getElementById('bldModal');
  wrap.innerHTML = html;
  wrap.style.display = 'block';
}

function closeBldOverlay(event) {
  if (event.target.id === 'bldOverlay') {
    document.getElementById('bldModal').style.display = 'none';
  }
}

function startBuildCurrentModal() {
  document.getElementById('bldModal').style.display = 'none';
  if (modalBuildingId) startBuild(modalBuildingId);
}

// ============================================================
// STARS
// ============================================================
function createStars() {
  var c = document.getElementById('stars');
  for (var i = 0; i < 120; i++) {
    var s = document.createElement('div');
    s.className = 'star';
    var sz = Math.random() * 2 + .5;
    s.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;left:' + (Math.random() * 100) + '%;top:' + (Math.random() * 100) + '%;animation-duration:' + (Math.random() * 4 + 2) + 's;animation-delay:' + (Math.random() * 4) + 's;';
    c.appendChild(s);
  }
}

createStars();

// Guardado "mejor esfuerzo" al ocultar la pestaña (no bloqueante).
// Nota: ningún navegador garantiza 100% el guardado al cerrar, pero esto evita el XHR síncrono y la auth incorrecta.
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    try { flushVillage(); } catch (e) { }
  }
});


// ============================================================
// EPIC WARRIOS V2 — SOCIAL + RANKING + TROOPS SYNC (v2)
// ============================================================
let currentThreadId = null;
let currentThreadType = null;
var _selectedReportIds = new Set(); // v1.30: multi-select para informes de sistema

async function ensureLogged() {
  if (!currentUser) { showNotif('Inicia sesión primero.', 'err'); return false; }
  return true;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeJs(str) {
  // Escapa string para uso en atributos onclick/JavaScript inline
  // Reemplaza backslash primero, luego comillas simples
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
}

function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  const num = Number(n);
  if (isNaN(num)) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toLocaleString('es-ES');
}
