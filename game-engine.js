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

// v1.95 OGame puro: calcRes() devuelve vs.resources directamente — sin interpolación.
// El servidor es la única autoridad. Solo calculamos aldeanos_libres desde troops.
// Para producción/h usar getProd() directamente.
function calcRes(vs) {
  // ═══════════════════════════════════════════════════════════════
  // ALDEANOS: calculados localmente desde troops (no cambian entre syncs)
  // troops.aldeano = TOTAL de aldeanos en la aldea
  // aldeanos_assigned = { madera: X, piedra: Y } = asignaciones
  // aldeanos_libres = troops.aldeano - sum(assigned) - en refugio
  // ═══════════════════════════════════════════════════════════════
  var assigned = vs.aldeanos_assigned || defaultAssignments();
  if (assigned.esencia === undefined) assigned.esencia = 0;

  var totalAssigned = (assigned.madera || 0) + (assigned.piedra || 0) + (assigned.hierro || 0)
    + (assigned.provisiones || 0) + (assigned.esencia || 0);

  var aldTotal = (vs.troops && vs.troops.aldeano !== undefined) ? vs.troops.aldeano : 0;
  var aldInRefugio = (vs.refugio && vs.refugio.aldeano) || 0;
  var aldLibres = Math.max(0, aldTotal - totalAssigned - aldInRefugio);

  // Recursos: exactamente lo que devolvió el servidor, sin tocar
  var r = vs.resources || {};

  return {
    madera: Math.floor(r.madera || 0),
    madera_raw: r.madera || 0,
    piedra: Math.floor(r.piedra || 0),
    piedra_raw: r.piedra || 0,
    hierro: Math.floor(r.hierro || 0),
    hierro_raw: r.hierro || 0,
    provisiones: Math.floor(r.provisiones || 0),
    provisiones_raw: r.provisiones || 0,
    esencia: Math.floor(r.esencia || 0),
    esencia_raw: r.esencia || 0,

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

/**
 * Despacha una misión al servidor (Modelo Ogame v2.1)
 * @param {string} type - 'attack', 'espionage', 'transport', 'move', 'reinforce'
 * @param {number} tx - X destino (informativo/histórico)
 * @param {number} ty - Y destino (informativo/histórico)
 * @param {string} targetId - UUID de aldea destino
 * @param {object} troops - Mapa de tropas {espada: 10, ...}
 * @param {object} cargo - Mapa de recursos {madera: 500, ...}
 * @param {number} durationMs - Duración calculada en cliente
 * @param {object} creatures - Mapa de criaturas (opcional)
 */
async function startMission(type, tx, ty, targetId, troops, cargo, durationMs, creatures) {
  console.log('[DEBUG startMission] llamada con:', type, targetId, JSON.stringify(troops));
  if (!activeVillage) { console.log('[DEBUG startMission] abortado: no activeVillage'); return; }
  var vs = activeVillage.state;
  cargo = cargo || {};
  creatures = creatures || {};
  durationMs = durationMs || 0;

  // v1.98 FIX ENG-01: Eliminados snapshotResources + flushVillage antes del RPC.
  // Misma clase de bug que regla #28: flushVillage escribe last_updated=NOW() sin
  // acumular producción → secure_village_tick ve v_hrs≈0 → producción perdida.
  // El RPC (launch_mission_secure_v2) ya llama secure_village_tick que se encarga
  // de producción, aldeanos y colas vencidas.

  showNotif('Calculando y despachando...', 'warn');
  try {
    var payload = {
      p_village_id: activeVillage.id,
      p_target_id: targetId,
      p_type: type,
      p_troops: troops,
      p_creatures: creatures,
      p_cargo: cargo,
      p_duration_ms: durationMs
    };

    var { data: newState, error: rpcErr } = await sbClient.rpc('launch_mission_secure_v2', payload);
    console.log('[DEBUG startMission] respuesta RPC:', JSON.stringify(newState), 'error:', rpcErr);

    if (rpcErr) throw rpcErr;

    if (!newState) {
      showNotif('Error: El servidor no devolvió estado.', 'err');
      return;
    }

    // v1.95: merge — preservar buildings/aldeanos_assigned y reinyectar mission_queue actualizada
    var localAldAssigned = activeVillage.state.aldeanos_assigned;
    activeVillage.state = Object.assign({}, activeVillage.state, newState);
    activeVillage.state.mission_queue = newState.mission_queue || activeVillage.state.mission_queue || [];
    if (localAldAssigned) activeVillage.state.aldeanos_assigned = localAldAssigned;
    showNotif('¡Misión enviada correctamente!', 'ok');
    tick();
  } catch (e) {
    showNotif('Error: ' + (e.message || 'Desconocido'), 'err');
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
      await triggerServerTick();
    } catch (e) {
      console.warn('[Ogame missions sync] error:', e);
    } finally {
      window._ogameSyncRunning = false;
    }
  }

  return v.state;
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
