// ============================================================
// EPIC WARRIORS — game-engine.js
// Recursos: getBaseProd, getBonusPerWorker, getProd, calcRes
// Misiones: cancelMission, startMission, sendSystemReport
// Ejecución: resolveMissions, executeSpyMission, executeAttackMission
//            executeAttackPvP, executeMove, executeReinforce, executeTransport
// Colas: resolveQueue
// ============================================================

function defaultState() {
  var b = {};
  BUILDINGS.forEach(function (d) { b[d.id] = { level: 1 }; });
  return {
    // FIX Me1: aldeanos:0 incluido — requerido por RPCs que reconstruyen resources con jsonb_build_object
    resources: { madera: 800, piedra: 600, hierro: 400, provisiones: 200, esencia: 50, aldeanos: 0 },
    aldeanos_granja: 0,
    aldeanos_assigned: defaultAssignments(),
    troops: defaultTroops(),
    creatures: defaultCreatures(),
    buildings: b,
    build_queue: null,
    mission_queue: [],
    summoning_queue: [],
    training_queue: [], // FIX Me2: columna separada v1.62 — evita undefined al iterar colas offline
    last_updated: new Date().toISOString()
  };
}


// ============================================================
// PRODUCTION RATES
// Base: edificio produce una cantidad pequeña automáticamente
// Bonus: cada aldeano asignado añade producción según nivel
//
// Bonus (÷10 respecto a valores anteriores para equilibrio):
//   madera:      3 × nivel_aserradero  por aldeano/h
//   piedra:      2.5 × nivel_cantera   por aldeano/h  (→ 2 redondeado)
//   hierro:      2 × nivel_mineHierro  por aldeano/h
//   provisiones: (5+nivel_granja)÷10   por aldeano/h  → ~0.6 base
//   esencia:     1 × nivel_circulo     por aldeano/h
// ============================================================

function getBaseProd(blds) {
  // Mismas fórmulas que BUILDINGS.prod(lvl) para consistencia con el modal
  var mLvl = (blds.aserradero && blds.aserradero.level) || 1;
  var pLvl = (blds.cantera && blds.cantera.level) || 1;
  var hLvl = (blds.minehierro && blds.minehierro.level) || 1;
  var cLvl = (blds.circulo && blds.circulo.level) || 1;
  return {
    madera: Math.floor(30 + 40 * mLvl * Math.pow(1.1, mLvl)),
    piedra: Math.floor(20 + 30 * pLvl * Math.pow(1.1, pLvl)),
    hierro: Math.floor(10 + 20 * hLvl * Math.pow(1.1, hLvl)),
    provisiones: 0,
    esencia: Math.floor(5 + 15 * cLvl * Math.pow(1.1, cLvl))
  };
}

function getBonusPerWorker(blds) {
  // Bonus ~10% de la producción base por aldeano asignado
  var base = getBaseProd(blds);
  var gLvl = (blds.granja && blds.granja.level) || 1;
  return {
    madera: Math.max(1, Math.floor(base.madera * 0.1)),
    piedra: Math.max(1, Math.floor(base.piedra * 0.1)),
    hierro: Math.max(1, Math.floor(base.hierro * 0.1)),
    provisiones: Math.max(1, 5 + gLvl),   // provisiones: 6+ por aldeano/h
    esencia: Math.max(1, Math.floor(base.esencia * 0.1))
  };
}

function getProd(blds, aldGranja, workers) {
  var w = workers || defaultAssignments();
  if (!workers && aldGranja) w.provisiones = aldGranja;
  // Asegurar clave esencia
  if (w.esencia === undefined) w.esencia = 0;

  var base = getBaseProd(blds);
  var bonus = getBonusPerWorker(blds);

  return {
    madera: Math.floor(base.madera + (w.madera || 0) * bonus.madera),
    piedra: Math.floor(base.piedra + (w.piedra || 0) * bonus.piedra),
    hierro: Math.floor(base.hierro + (w.hierro || 0) * bonus.hierro),
    provisiones: Math.floor(base.provisiones + (w.provisiones || 0) * bonus.provisiones),
    esencia: Math.floor(base.esencia + (w.esencia || 0) * bonus.esencia),
    aldeanos: getAldeanosProd(blds)
  };
}

// v1.71: calcAndApplyAldeanos() eliminada (era código muerto — servidor autoritativo).
// calcRes() ya NO tiene side-effects sobre vs. Es seguro usarla en paths de solo lectura.
// Para obtener solo producción sin recursos calculados, usar getProd() directamente.
function calcRes(vs) {

  var now = Date.now();
  var last = new Date(vs.last_updated).getTime();
  // Cap producción offline a 24h para evitar abuso de tiempo
  var hrs = Math.max(0, Math.min((now - last) / 3600000, 24));
  var w = vs.aldeanos_assigned || defaultAssignments();
  if (w.esencia === undefined) w.esencia = 0;
  var p = getProd(vs.buildings, 0, w);
  var cap = getCapacity(vs.buildings);

  var madera = (vs.resources.madera || 0) + p.madera * hrs;
  var piedra = (vs.resources.piedra || 0) + p.piedra * hrs;
  var hierro = (vs.resources.hierro || 0) + p.hierro * hrs;
  var provisiones = (vs.resources.provisiones || 0) + p.provisiones * hrs;
  var esencia = (vs.resources.esencia || 0) + p.esencia * hrs;

  // ═══════════════════════════════════════════════════════════════
  // NUEVO SISTEMA: 1 SOLO TIPO DE ALDEANO
  // troops.aldeano = TOTAL de aldeanos en la aldea
  // aldeanos_assigned = { madera: X, piedra: Y } = asignaciones (solo números)
  // aldeanos_libres = troops.aldeano - sum(assigned) - tropas_en_mision
  // ═══════════════════════════════════════════════════════════════

  var assigned = vs.aldeanos_assigned || defaultAssignments();
  if (assigned.esencia === undefined) assigned.esencia = 0;

  var totalAssigned = (assigned.madera || 0) + (assigned.piedra || 0) + (assigned.hierro || 0)
    + (assigned.provisiones || 0) + (assigned.esencia || 0);

  // Aldeanos totales en la aldea (fuente de verdad)
  var aldTotal = (vs.troops && vs.troops.aldeano !== undefined) ? vs.troops.aldeano : 0;

  // Aldeanos libres = totales - asignados - en refugio (no pueden trabajar ni entrenarse)
  var aldInRefugio = (vs.refugio && vs.refugio.aldeano) || 0;
  var aldLibres = Math.max(0, aldTotal - totalAssigned - aldInRefugio);

  // Cap almacén: cada recurso tiene su propio límite independiente (no suma total)
  // Si el almacén es nivel 3 → cap=8000, cada recurso puede llegar a 8000 por separado
  madera = Math.min(madera, cap);
  piedra = Math.min(piedra, cap);
  hierro = Math.min(hierro, cap);
  provisiones = Math.min(provisiones, cap);

  return {
    // Para la UI seguimos devolviendo el entero (lo que ve el jugador)
    madera: Math.floor(madera),
    madera_raw: madera,
    piedra: Math.floor(piedra),
    piedra_raw: piedra,
    hierro: Math.floor(hierro),
    hierro_raw: hierro,
    provisiones: Math.floor(provisiones),
    provisiones_raw: provisiones,
    esencia: Math.floor(esencia),
    esencia_raw: esencia,

    // compatibilidad: res.aldeanos = libres (UI vieja)
    aldeanos: aldLibres,

    // nuevo: para no romper total/libres nunca más
    aldeanos_libres: aldLibres,
    aldeanos_total: Math.floor(aldTotal),
    aldeanos_working: totalAssigned
  };
}

// Check if queued build is done (works offline: compares finish_at timestamp to now)
// ============================================================
// MISSIONS & TRAVEL
// ============================================================
async function cancelMission(missionRef) {
  if (!activeVillage) return;

  // v1.71: RPC atómica — antes el cliente calculaba distancia viajada y tiempo
  // de retorno localmente, permitiendo manipulación. Ahora el servidor calcula
  // returnSecs = tiempo ya transcurrido (simetría del viaje).
  try {
    const { data: res, error: rpcErr } = await sbClient.rpc('cancel_mission_secure', {
      p_village_id: activeVillage.id,
      p_mission_id: missionRef
    });

    if (rpcErr) throw rpcErr;
    if (!res || !res.ok) {
      showNotif(res?.error || 'No se pudo cancelar la misión', 'err');
      return;
    }

    showNotif('Misión cancelada. Tropas regresan en ' + fmtTime(Math.ceil(res.return_secs)), 'ok');

    // Sincronizar estado local desde el servidor
    await loadMyVillages();
    tick();
  } catch (e) {
    console.error('cancelMission error:', e);
    showNotif('Error al cancelar: ' + (e.message || e), 'err');
  }
}

async function startMission(type, tx, ty, targetId, troops, guestContingents) {
  if (!activeVillage) return;
  var vs = activeVillage.state;

  // Snapshot para rollback optimístico (deep copy)
  snapshotResources(vs);
  await flushVillage();
  var _troopsSnapshot = JSON.parse(JSON.stringify(vs.troops || {}));
  var _creaturesSnapshot = JSON.parse(JSON.stringify(vs.creatures || {}));
  var _provisionesSnapshot = vs.resources.provisiones;

  // Optimistic update local
  var totalUnits = 0;
  Object.keys(troops).forEach(k => {
    if (TROOP_TYPES[k]) { vs.troops[k] = Math.max(0, (vs.troops[k] || 0) - troops[k]); totalUnits += troops[k]; }
    else if (CREATURE_TYPES[k]) vs.creatures[k] = Math.max(0, (vs.creatures[k] || 0) - troops[k]);
  });
  vs.resources.provisiones = Math.max(0, vs.resources.provisiones - totalUnits);

  showNotif('Calculando y despachando...', 'warn');

  try {
    var payload = {
      p_village_id: activeVillage.id,
      p_type: type,
      p_tx: tx,
      p_ty: ty,
      p_target_id: targetId,
      p_troops: troops
    };
    // if (guestContingents) payload.p_guest_contingents = guestContingents; // Se omite p_guest_contingents en v2.0 basic

    var { data: newState, error: rpcErr } = await sbClient.rpc('launch_mission_secure_v2', payload);

    if (rpcErr) throw rpcErr;

    if (!newState || newState.ok === false) {
      // Rollback
      var errStr = newState && newState.error ? newState.error : 'No se pudo lanzar la misión.';
      vs.troops = _troopsSnapshot; vs.creatures = _creaturesSnapshot; vs.resources.provisiones = _provisionesSnapshot;
      showNotif(errStr, 'err');
      return;
    }

    // Sincronizar estado local con el devuelto por el servidor
    var sNext = newState.state || newState;
    if (sNext && sNext.buildings) {
      activeVillage.state = sNext;
    }

    var serverMission = newState.mission;
    if (serverMission) {
      if (!activeVillage.state.mission_queue) activeVillage.state.mission_queue = [];
      if (!activeVillage.state.mission_queue.find(m => m.mid === serverMission.mid)) {
        activeVillage.state.mission_queue.push(serverMission);
      }
      var nowT = Date.now();
      var finT = new Date(serverMission.finish_at).getTime();
      showNotif('¡Misión enviada! Llegada en ' + fmtTime(Math.ceil((finT - nowT) / 1000)), 'ok');
    } else {
      showNotif('Misión enviada con éxito.', 'ok');
    }

    if (type === 'attack' && guestContingents && guestContingents.length > 0 && serverMission) {
      _insertActiveMission(serverMission.mid, serverMission, guestContingents);
    }

    tick();
  } catch (e) {
    // Rollback
    vs.troops = _troopsSnapshot; vs.creatures = _creaturesSnapshot; vs.resources.provisiones = _provisionesSnapshot;
    showNotif('Error de conexión al lanzar misión', 'err');
    console.error('startMission error:', e);
  }
}

async function sendSystemReport(userId, title, body) {
  try {
    // Store as JSON with title + body so inbox can show title collapsed
    var payload = JSON.stringify({ title: title, body: body });
    var r = await sbClient.rpc('send_system_message', {
      p_user_id: userId,
      p_body: payload
    });
    if (r.error) console.warn('sendSystemReport RPC error:', r.error);
    // Refrescar mensajes automáticamente si el usuario está en la página de mensajes
    if (userId === (currentUser && currentUser.id)) {
      var msgPage = document.getElementById('page-messages');
      if (msgPage && msgPage.style.display !== 'none') {
        renderThreads();
        if (currentThreadId) loadSystemReports();
      }
    }
  } catch (e) {
    console.warn('sendSystemReport error:', e);
  }
}

// v2.0 Ogame: resolveMissions ya no resuelve misiones en el cliente.
// Simplemente lanza un sync al servidor (secure_village_tick v2 / resolve_pending_missions_secure)
// El servidor calculará daños, experiencia, botín y retornará las tropas mediante RPC.
async function resolveMissions(v) {
  var vs = v.state;
  if (!vs.mission_queue || vs.mission_queue.length === 0) return vs;

  var _tickNow = Date.now();
  var _needsServerSync = false;

  vs.mission_queue.forEach(function (m) {
    if (m.finish_at && new Date(m.finish_at).getTime() <= _tickNow) {
      _needsServerSync = true;
    }
  });

  if (_needsServerSync && !window._ogameSyncRunning) {
    window._ogameSyncRunning = true;
    try {
      if (document.getElementById('page-messages') && document.getElementById('page-messages').style.display !== 'none') {
        // Soft refresh of messages si el usuario está viéndolas (para ver reportes generados en servidor)
        if (typeof renderThreads === 'function') setTimeout(renderThreads, 500);
      }
      await syncVillageResourcesFromServer();
    } catch (e) {
      console.warn('[Ogame missions sync] error:', e);
    } finally {
      window._ogameSyncRunning = false;
    }
  }

  return activeVillage.state;
}

// ───────────────────────────────────────────────

// ============================================================
// ACTIVE MISSIONS — visibilidad multi-jugador para ataques conjuntos
// ============================================================
var _activeMissionsTableExists = null;

async function _insertActiveMission(missionId, m, contingents) {
  if (_activeMissionsTableExists === false) return;
  try {
    var rows = [];
    rows.push({
      mission_id: missionId,
      leader_id: currentUser.id,
      host_village_id: activeVillage.id,
      target_x: m.tx, target_y: m.ty,
      participant_id: currentUser.id,
      troops: JSON.stringify(m.troops || {}),
      finish_at: m.finish_at,
      status: 'active'
    });
    (contingents || []).forEach(function (c) {
      rows.push({
        mission_id: missionId,
        leader_id: currentUser.id,
        host_village_id: activeVillage.id,
        target_x: m.tx, target_y: m.ty,
        participant_id: c.owner_id,
        troops: JSON.stringify(c.troops || {}),
        finish_at: m.finish_at,
        status: 'active'
      });
    });
    var ir = await sbClient.from('active_missions').insert(rows);
    if (ir.error) {
      if (ir.error.code === '42P01') { _activeMissionsTableExists = false; }
      else console.warn('_insertActiveMission:', ir.error);
    } else { _activeMissionsTableExists = true; }
  } catch (e) { console.warn('_insertActiveMission error:', e); }
}

async function _clearActiveMission(missionId) {
  if (_activeMissionsTableExists === false || !missionId) return;
  try { await sbClient.from('active_missions').delete().eq('mission_id', missionId); } catch (e) { /* ignorar */ }
}

async function cancelAlliedMission(missionId, leaderVillageId) {
  if (!confirm('¿Cancelar este ataque conjunto? Las tropas de TODOS los participantes regresarán.')) return;

  try {
    const { data: res, error: rpcErr } = await sbClient.rpc('cancel_allied_mission_secure', {
      p_mission_id: missionId,
      p_leader_village_id: leaderVillageId
    });

    if (rpcErr) throw rpcErr;
    if (!res || !res.ok) {
      showNotif(res?.error || 'No se pudo cancelar la misión conjunta', 'err');
      return;
    }

    showNotif('⚔️ Ataque conjunto cancelado. Tropas regresando.', 'ok');
    await loadMyVillages();
    tick();
  } catch (e) {
    console.error('cancelAlliedMission error:', e);
    showNotif('Error cancelando misión: ' + (e.message || e), 'err');
  }
}


function resolveQueue(vs) {
  if (!vs.build_queue) return vs;

  var finishAt = new Date(vs.build_queue.finish_at).getTime();
  if (Date.now() >= finishAt) {
    var id = vs.build_queue.id;

    if (!vs.buildings[id]) vs.buildings[id] = { level: 1 };
    else vs.buildings[id].level++;

    vs.build_queue = null;

    var def = BUILDINGS.find(function (b) { return b.id === id; });
    showNotif((def ? def.name : id) + ' mejorada!', 'ok');
  }
  return vs;
}

// ============================================================
// USERNAME (EPIC WARRIOS V2)
// Reglas:
// - 4 a 15 caracteres
// - Solo letras, numeros, "_" y "-"
// - Debe ser unico
