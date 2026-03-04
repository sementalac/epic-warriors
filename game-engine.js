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
    resources: { madera: 800, piedra: 600, hierro: 400, provisiones: 200, esencia: 50 },
    aldeanos_granja: 0,
    aldeanos_assigned: defaultAssignments(),
    troops: defaultTroops(),
    creatures: defaultCreatures(),
    buildings: b,
    build_queue: null,
    mission_queue: [],
    summoning_queue: [],
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

// ⚠️ OPT-E ADVERTENCIA DE SIDE-EFFECT:
// calcRes() NO es una función pura. Internamente llama a calcAndApplyAldeanos(vs)
// que MODIFICA vs.troops.aldeano y vs.last_aldeano_at.
// Nunca llamar calcRes() en paths de solo lectura/render sin ser consciente de esto.
// Para obtener producción sin modificar estado, usar getProd() directamente.
function calcRes(vs) {
  // Aplicar aldeanos discretos antes de calcular (actualiza vs.resources.aldeanos)
  calcAndApplyAldeanos(vs);

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

  var barrCap = getBarracksCapacity(vs.buildings);

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
    madera: Math.floor(madera),
    piedra: Math.floor(piedra),
    hierro: Math.floor(hierro),
    provisiones: Math.floor(provisiones),
    esencia: Math.floor(esencia),

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
  var vs = activeVillage.state;
  // Buscar por mid (nuevo) con fallback a finish_at (misiones guardadas antes de v0.92)
  var idx = vs.mission_queue.findIndex(m => m.mid === missionRef || m.finish_at === missionRef);
  if (idx === -1) { showNotif('Misión no encontrada', 'err'); return; }

  var m = vs.mission_queue[idx];
  if (m.type === 'return') { showNotif('No puedes cancelar el retorno', 'err'); return; }

  var now = Date.now();
  var start = new Date(m.start_at).getTime();
  var finish = new Date(m.finish_at).getTime();
  var progress = Math.max(0, Math.min(1, (now - start) / (finish - start)));

  var dx = Math.abs(m.tx - activeVillage.x);
  var dy = Math.abs(m.ty - activeVillage.y);
  var totalDist = Math.max(dx, dy);
  var distTraveled = totalDist * progress;

  var minSpeed = 999;
  Object.keys(m.troops).forEach(k => {
    var troopData = TROOP_TYPES[k] || CREATURE_TYPES[k];
    if ((m.troops[k] || 0) > 0 && troopData && troopData.speed < minSpeed) {
      minSpeed = troopData.speed;
    }
  });
  if (minSpeed === 999) minSpeed = 1;

  var returnSecs = (distTraveled / minSpeed) * MISSION_FACTOR;
  var returnAt = new Date(now + returnSecs * 1000).toISOString();

  vs.mission_queue.splice(idx, 1);
  vs.mission_queue.push({
    type: 'return',
    tx: activeVillage.x,
    ty: activeVillage.y,
    troops: m.troops,
    finish_at: returnAt,
    start_at: new Date(now).toISOString()
  });

  showNotif('Misión cancelada. Tropas regresan en ' + fmtTime(Math.ceil(returnSecs)), 'ok');
  await flushVillage();
  tick();
}

async function startMission(type, tx, ty, targetId, troops, guestContingents) {
  if (!activeVillage) return;
  var vs = activeVillage.state;

  var dx = Math.abs(tx - activeVillage.x);
  var dy = Math.abs(ty - activeVillage.y);
  var dist = Math.max(dx, dy);

  var minSpeed = 999;
  Object.keys(troops).forEach(k => {
    var troopData = TROOP_TYPES[k] || CREATURE_TYPES[k];
    if (troops[k] > 0 && troopData && troopData.speed < minSpeed) minSpeed = troopData.speed;
  });
  if (guestContingents) {
    guestContingents.forEach(function (c) {
      Object.keys(c.troops || {}).forEach(function (k) {
        var troopData = TROOP_TYPES[k] || CREATURE_TYPES[k];
        if ((c.troops[k] || 0) > 0 && troopData && troopData.speed < minSpeed) minSpeed = troopData.speed;
      });
    });
  }
  if (minSpeed === 999) minSpeed = 1;

  var seconds = (dist / minSpeed) * MISSION_FACTOR;
  var finishAt = new Date(Date.now() + seconds * 1000).toISOString();

  snapshotResources(vs);
  Object.keys(troops).forEach(k => {
    if (TROOP_TYPES[k]) vs.troops[k] = Math.max(0, (vs.troops[k] || 0) - troops[k]);
    else if (CREATURE_TYPES[k]) vs.creatures[k] = Math.max(0, (vs.creatures[k] || 0) - troops[k]);
  });

  var totalUnits = 0;
  Object.keys(troops).forEach(k => { if (TROOP_TYPES[k]) totalUnits += troops[k]; });
  vs.resources.provisiones = Math.max(0, vs.resources.provisiones - totalUnits);

  var missionEntry = {
    mid: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    type, tx, ty, targetId, troops,
    finish_at: finishAt,
    start_at: new Date().toISOString()
  };
  if (guestContingents && guestContingents.length > 0) {
    missionEntry.guest_contingents = guestContingents;
  }
  vs.mission_queue.push(missionEntry);

  // Registrar en active_missions para visibilidad de aliados (solo ataque PvP con contingentes)
  if (type === 'attack' && guestContingents && guestContingents.length > 0) {
    _insertActiveMission(missionEntry.mid, missionEntry, guestContingents);
  }

  showNotif('Misión enviada! Llegada en ' + fmtTime(Math.ceil(seconds)), 'ok');
  await flushVillage();
  tick();
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

async function resolveMissions(vs) {
  if (!vs.mission_queue || vs.mission_queue.length === 0) return vs;

  // ── v1.48: Fallback robusto para guardiancueva ──────────────
  // Si game-caves.js no ha cargado aún, CREATURE_TYPES.guardiancueva
  // podría no existir → el guardián se perdería al regresar de misión.
  if (typeof CREATURE_TYPES !== 'undefined' && !CREATURE_TYPES.guardiancueva) {
    CREATURE_TYPES.guardiancueva = {
      name: 'Guardián de la Cueva', icon: '🧿', tier: 5,
      isCaveGuardian: true,
      attackChance: 17, hp: 200, attacksPerTurn: 2, damage: 38,
      defense: 17, armor: 0, weapon: 0, dexterity: 17,
      speed: 140, capacity: 0,
      summonersNeeded: 0,
      cost: { esencia: 0 }, time: 0,
      desc: 'Guardián ancestral de una cueva mágica.'
    };
  }
  // ────────────────────────────────────────────────────────────

  var now = Date.now();
  var remaining = [];
  var changed = false;

  for (let m of vs.mission_queue) {
    var finish = new Date(m.finish_at).getTime();
    if (now >= finish) {
      changed = true;
      // EXECUTE MISSION — wrapped in try/catch para que un error no atasque la misión
      try {
        if (m.type === 'spy') {
          await executeSpyMission(m);
        } else if (m.type === 'cave_attack') {
          // ── Ataque a cueva NPC especial ──
          if (typeof executeAttackCave === 'function') {
            await executeAttackCave(m);
          }
        } else if (m.type === 'attack') {
          await executeAttackMission(m);
        } else if (m.type === 'found') {
          await executeFounding(m);
          continue;
        } else if (m.type === 'move') {
          await executeMove(m);
          continue; // tropas quedan en destino permanentemente
        } else if (m.type === 'reinforce') {
          await executeReinforce(m);
          continue; // tropas quedan en guest_troops
        } else if (m.type === 'transport') {
          await executeTransport(m);
          // NO hacer continue - permitir que las tropas vuelvan
        } else if (m.type === 'return_reinforce') {
          // Tropas volviendo de refuerzo a su aldea origen
          // Se añaden a las tropas del activeVillage (que es el origen)
          Object.keys(m.troops || {}).forEach(function (k) {
            if ((m.troops[k] || 0) <= 0) return;
            if (TROOP_TYPES[k]) vs.troops[k] = (vs.troops[k] || 0) + m.troops[k];
            else if (CREATURE_TYPES[k]) { if (!vs.creatures) vs.creatures = defaultCreatures(); vs.creatures[k] = (vs.creatures[k] || 0) + m.troops[k]; }
          });
          // No enviar mensaje - no es importante
          continue;
        } else if (m.type === 'return') {
          // ── TROPAS REGRESAN ──
          var barrCap = getBarracksCapacity(vs.buildings);
          var usedNow = getBarracksUsed(vs);
          var freeSlots = Math.max(0, barrCap - usedNow);

          // Calcular cuántas plazas necesitan las tropas que regresan.
          // ⚠️ BUGFIX: Las CRIATURAS no ocupan barracas — se excluyen del cálculo
          // de slotsNeeded. Solo TROOP_TYPES (tropas normales) consumen plazas.
          var slotsNeeded = 0;
          Object.keys(m.troops).forEach(function (k) {
            var count = m.troops[k] || 0;
            if (count <= 0) return;
            if (!TROOP_TYPES[k]) return; // criatura → no ocupa barracas, saltar
            var slots = k === 'aldeano' ? count : count * (TROOP_TYPES[k].barracasSlots || 1);
            slotsNeeded += slots;
          });

          var accepted = {}, anyRejected = false;

          // Las criaturas siempre se aceptan íntegras (no necesitan barracas)
          Object.keys(m.troops).forEach(function (k) {
            if (CREATURE_TYPES[k]) accepted[k] = m.troops[k] || 0;
          });

          if (slotsNeeded <= freeSlots) {
            // Caben todas las tropas normales
            Object.keys(m.troops).forEach(function (k) {
              if (TROOP_TYPES[k]) accepted[k] = m.troops[k] || 0;
            });
          } else {
            // No caben todas — eliminar porcentaje proporcional solo de tropas normales
            var pctEliminar = (slotsNeeded - freeSlots) / slotsNeeded;

            Object.keys(m.troops).forEach(function (k) {
              if (!TROOP_TYPES[k]) return; // criaturas ya aceptadas arriba
              var total = m.troops[k] || 0;
              if (total <= 0) { accepted[k] = 0; return; }
              var toEliminate = Math.ceil(total * pctEliminar);
              var toAccept = total - toEliminate;
              // Verificar que las plazas de los aceptados no superen freeSlots
              while (toAccept > 0) {
                var testSlots = k === 'aldeano' ? toAccept : toAccept * (TROOP_TYPES[k].barracasSlots || 1);
                if (testSlots <= freeSlots) break;
                toAccept--;
              }
              accepted[k] = toAccept;
              if (toAccept < total) anyRejected = true;
            });

            // Verificación final: la suma de slots de tropas aceptadas no supera freeSlots
            var totalAcceptedSlots = 0;
            Object.keys(accepted).forEach(function (k) {
              if (!TROOP_TYPES[k]) return; // ignorar criaturas en el conteo
              var count = accepted[k] || 0;
              totalAcceptedSlots += k === 'aldeano' ? count : count * (TROOP_TYPES[k].barracasSlots || 1);
            });
            if (totalAcceptedSlots > freeSlots) {
              // Recorte de emergencia proporcional solo en tropas normales
              Object.keys(accepted).forEach(function (k) {
                if (!TROOP_TYPES[k]) return; // no tocar criaturas
                accepted[k] = Math.floor(accepted[k] * freeSlots / totalAcceptedSlots);
              });
              anyRejected = true;
            }
          }

          // Añadir tropas y criaturas aceptadas al estado
          Object.keys(accepted).forEach(function (k) {
            var toAdd = accepted[k] || 0;
            if (toAdd <= 0) return;

            if (TROOP_TYPES[k]) {
              // Tropa normal
              if (k === 'aldeano') {
                vs.troops.aldeano = (vs.troops.aldeano || 0) + toAdd;
              } else {
                vs.troops[k] = (vs.troops[k] || 0) + toAdd;
              }
            } else if (CREATURE_TYPES[k]) {
              // Criatura — nunca ocupa barracas
              if (!vs.creatures) vs.creatures = defaultCreatures();
              vs.creatures[k] = (vs.creatures[k] || 0) + toAdd;
            }
          });

          // ── DEATH CHECK del Guardián de la Cueva ──────────────────────
          // v1.48: Soporte para múltiples guardianes — contar cuántos murieron
          var guardiansSent = (m.troops && m.troops.guardiancueva) || 0;
          var guardiansReturned = accepted.guardiancueva || 0;
          var guardiansDied = guardiansSent - guardiansReturned;
          if (guardiansDied > 0 && typeof onCaveGuardianDied === 'function') {
            // Liberar una cueva por cada guardián muerto (secuencial para no pisar)
            for (var gdi = 0; gdi < guardiansDied; gdi++) {
              try { await onCaveGuardianDied(activeVillage.id, currentUser.id); }
              catch (gde) { console.warn('[Caves] onCaveGuardianDied error:', gde); }
            }
          }
          // ──────────────────────────────────────────────────────────────

          // Aplicar botín con límites de capacidad
          var lootReport = '';
          if (m.loot) {
            var cap = getCapacity(vs.buildings);
            var appliedLoot = {};

            ['madera', 'piedra', 'hierro', 'provisiones'].forEach(function (res) {
              var incoming = m.loot[res] || 0;
              if (incoming > 0) {
                var current = vs.resources[res] || 0;
                var space = Math.max(0, cap - current);
                var added = Math.min(incoming, space);

                vs.resources[res] = current + added;
                if (added > 0) appliedLoot[res] = added;
              }
            });

            // Esencia no tiene límite
            if (m.loot.esencia > 0) {
              vs.resources.esencia = (vs.resources.esencia || 0) + m.loot.esencia;
              appliedLoot.esencia = m.loot.esencia;
            }

            // Generar reporte de botín
            if (Object.keys(appliedLoot).length > 0) {
              lootReport = '\n\n💰 Botín obtenido:\n';
              if (appliedLoot.madera) lootReport += '🌲 ' + fmt(appliedLoot.madera) + ' madera\n';
              if (appliedLoot.piedra) lootReport += '⛰️ ' + fmt(appliedLoot.piedra) + ' piedra\n';
              if (appliedLoot.hierro) lootReport += '⚙️ ' + fmt(appliedLoot.hierro) + ' hierro\n';
              if (appliedLoot.provisiones) lootReport += '🌾 ' + fmt(appliedLoot.provisiones) + ' provisiones\n';
              if (appliedLoot.esencia) lootReport += '✨ ' + fmt(appliedLoot.esencia) + ' esencia';
            }
          }

          var acceptedStr = Object.keys(accepted).filter(function (k) { return (accepted[k] || 0) > 0; })
            .map(function (k) { return accepted[k] + ' ' + (TROOP_TYPES[k] ? TROOP_TYPES[k].name : k); }).join(', ') || 'ninguna';
          var rejectedStr = anyRejected ? '\n⚠️ Sin espacio en barracas: algunas tropas se perdieron.' : '';

          showNotif('¡Tropas han regresado!', 'ok');
          continue; // La misión de retorno se descarta tras procesar
        }
      } catch (e) {
        console.warn('resolveMissions: error ejecutando misión', m.type, e);
        // La misión se descarta igualmente — no se queda atascada
      }

      // Tropas regresan a la velocidad del más lento, igual que la ida
      // Solo vuelven los supervivientes (m.troops ya tiene los supervivientes tras batalla)
      var survivors = m.troops || {};
      var hasSurvivors = Object.values(survivors).some(function (n) { return n > 0; });

      if (hasSurvivors) {
        // Calcular velocidad del más lento entre supervivientes (tropas Y criaturas)
        var minSpeed = 999;
        Object.keys(survivors).forEach(function (k) {
          if (k === 'guardiancueva') return; // no tiene speed de movimiento propio
          var n = survivors[k] || 0;
          if (n <= 0) return;
          var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
          if (td && td.speed < minSpeed) minSpeed = td.speed;
        });
        if (minSpeed === 999) minSpeed = 1;

        // Misma distancia que la ida
        var dx = Math.abs(m.tx - activeVillage.x);
        var dy = Math.abs(m.ty - activeVillage.y);
        var dist = Math.max(dx, dy);
        var returnSecs = (dist / minSpeed) * MISSION_FACTOR;
        var returnAt = new Date(Date.now() + returnSecs * 1000).toISOString();

        // Añadir misión de retorno
        remaining.push({
          type: 'return',
          tx: activeVillage.x,
          ty: activeVillage.y,
          troops: survivors,
          finish_at: returnAt,
          start_at: new Date().toISOString(),
          origin_name: m.targetId || 'misión',
          loot: m.loot || null
        });
        // Notificación eliminada - causaba spam en cada tick
      }
    } else {
      // Misión aún no ha terminado - mantener en la cola
      remaining.push(m);
    }
  }

  if (changed) {
    // Descartar solo misiones con finish_at hace más de 7 días (datos corruptos, no offline legítimo)
    var sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    remaining = remaining.filter(function (m) {
      var ft = new Date(m.finish_at).getTime();
      if (ft < sevenDaysAgo) {
        console.warn('resolveMissions: descartando misión corrupta (>7 días)', m);
        return false;
      }
      return true;
    });
    vs.mission_queue = remaining;
  }
  return vs;
}

async function executeSpyMission(m) {
  var target = (typeof NPC_CASTLES !== 'undefined' ? NPC_CASTLES : []).find(c => c.id === m.targetId);
  if (target) {
    var obj = playerObjectives.find(o => o.objective_id === target.id);
    var alreadyCleared = obj && obj.status === 'cleared';
    var report =
      '⚔️ INFORME DE ESPIONAJE\n' +
      '══════════════════════\n' +
      target.name + ' [' + m.tx + ', ' + m.ty + ']\n\n' +
      '🗡️ Ataques por turno: ' + target.attacksPerTurn + '\n' +
      '🎯 Bono de ataque:    +' + target.attackChance + '\n' +
      '💥 Daño:              ' + fmt(target.damage) + '\n' +
      '❤️ Vida (PG):         ' + fmt(target.hp) + '\n' +
      '🛡️ Clase de Armadura: ' + target.defense + '\n' +
      '⚡ Destreza:          ' + target.dexterity + '\n\n' +
      '🏆 Recompensa:        ' + fmt(target.rewards.experience) + ' XP\n' +
      (alreadyCleared ? '\n✅ Ya derrotado por ti.' : '\n⚠️ Aún no derrotado.');
    await updateObjective(target.id, 'spied');
    await sendSystemReport(currentUser.id, '🔍 ESPIONAJE: ' + target.name, report);
    showNotif('Espionaje completado. Revisa tus mensajes.', 'ok');
  } else {
    // Puede ser aldea PvP o fantasma — buscar en villages
    var spyR = await sbClient.from('villages').select('id,name,owner_id,cx,cy,refugio').eq('id', m.targetId).maybeSingle();
    if (spyR.data) {
      var sv = spyR.data;
      var spyRefugio = sv.refugio || {};
      var isGhost = sv.owner_id === GHOST_OWNER_ID;
      var ownerName = isGhost ? 'Aldea Fantasma' : ((profileCache[sv.owner_id] && profileCache[sv.owner_id].username) || 'Jugador desconocido');
      var wallLvlSpy = 0;
      var spyTroops = {}, spyCreatures = {};

      // Leer state (v1.49 jsonb)
      {
        var spyVR = await sbClient.from("villages").select("state").eq("id", m.targetId).maybeSingle();
        var spyState = null;
        if (spyVR.data && spyVR.data.state) {
          spyState = typeof spyVR.data.state === "string" ? JSON.parse(spyVR.data.state) : spyVR.data.state;
        }
        if (spyState) {
          spyTroops = spyState.troops || {};
          spyCreatures = spyState.creatures || {};
          var spyBlds = spyState.buildings || {};
          wallLvlSpy = (spyBlds.muralla && spyBlds.muralla.level) || 0;
        }
      }

      // Obtener niveles de investigación del defensor (solo jugadores reales)
      var defTroopLvls = {}, defWeaponLvls = {}, defArmorLvls = {};
      if (!isGhost) {
        try {
          var profR = await sbClient.from('profiles')
            .select('troop_levels,weapon_levels,armor_levels')
            .eq('id', sv.owner_id).maybeSingle();
          if (profR.data) {
            defTroopLvls = profR.data.troop_levels || {};
            defWeaponLvls = profR.data.weapon_levels || {};
            defArmorLvls = profR.data.armor_levels || {};
          }
        } catch (e) { /* ignorar — sin datos de investigación */ }
      }

      // ── Módulo de generación de tablas cruzadas ──────────────────
      function buildSpyTable(title, entities, entityDict, isCreature) {
        if (!entities || entities.length === 0) return '';
        var html = '<div style="margin-bottom:18px;">';
        if (title) {
          html += '<div style="font-size:.7rem;letter-spacing:.12em;color:var(--dim);text-transform:uppercase;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,.05);padding-bottom:4px;">' + title + '</div>';
        }

        // Función auxiliar eliminada debido a que el usuario no quiere los iconos para tropas.

        // Paginar de 6 en 6
        var CHUNK = 6;
        for (var i = 0; i < entities.length; i += CHUNK) {
          var chunk = entities.slice(i, i + CHUNK);
          var chunkHtml = '<table style="width:100%;border-collapse:separate;border-spacing:0;background:rgba(0,0,0,.15);border:1px solid rgba(255,255,255,.05);border-radius:6px;margin-bottom:8px;font-size:.75rem;text-align:center;table-layout:fixed;">';

          // Fila 1: Cabeceras (Icono + Nombre) -> Se quitan iconos
          chunkHtml += '<tr><th style="padding:6px;border-bottom:1px solid rgba(255,255,255,.05);border-right:1px solid rgba(255,255,255,.05);width:15%;text-align:left;color:var(--dim);font-weight:normal;font-size:.7rem;">Unidad</th>';
          chunk.forEach(function (k) {
            var label = entityDict[k] ? entityDict[k].name : k;
            chunkHtml += '<th style="padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.05);width:' + (85 / CHUNK) + '%;font-weight:normal;color:var(--text);">';
            chunkHtml += '<div style="font-size:.65rem;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + label + '">' + label + '</div>';
            chunkHtml += '</th>';
          });
          for (var j = chunk.length; j < CHUNK; j++) chunkHtml += '<th style="border-bottom:1px solid rgba(255,255,255,.05);"></th>';
          chunkHtml += '</tr>';

          // Fila 2: Cantidad
          chunkHtml += '<tr><td style="padding:6px;border-bottom:1px solid rgba(255,255,255,.05);border-right:1px solid rgba(255,255,255,.05);text-align:left;color:var(--dim);">Cantidad</td>';
          chunk.forEach(function (k) {
            var n = isCreature ? (spyCreatures[k] || 0) : Math.max(0, (spyTroops[k] || 0) - (spyRefugio[k] || 0));
            var color = n > 0 ? 'var(--text)' : 'var(--dim)';
            var bold = n > 0 ? 'font-weight:bold;' : '';
            chunkHtml += '<td style="padding:6px 2px;border-bottom:1px solid rgba(255,255,255,.05);color:' + color + ';' + bold + 'font-family:VT323,monospace;font-size:1.1rem;">' + (n === 0 ? '-' : fmt(n)) + '</td>';
          });
          for (var j = chunk.length; j < CHUNK; j++) chunkHtml += '<td style="border-bottom:1px solid rgba(255,255,255,.05);"></td>';
          chunkHtml += '</tr>';

          // Filas 3, 4, 5 (solo Tropas)
          if (!isCreature) {
            chunkHtml += '<tr><td style="padding:6px;border-bottom:1px solid rgba(255,255,255,.05);border-right:1px solid rgba(255,255,255,.05);text-align:left;color:var(--dim);">Nivel</td>';
            chunk.forEach(function (k) { chunkHtml += '<td style="padding:4px 2px;border-bottom:1px solid rgba(255,255,255,.05);">' + (defTroopLvls[k] || 1) + '</td>'; });
            for (var j = chunk.length; j < CHUNK; j++) chunkHtml += '<td style="border-bottom:1px solid rgba(255,255,255,.05);"></td>';
            chunkHtml += '</tr>';

            chunkHtml += '<tr><td style="padding:6px;border-bottom:1px solid rgba(255,255,255,.05);border-right:1px solid rgba(255,255,255,.05);text-align:left;color:var(--dim);">Nv. Arma</td>';
            chunk.forEach(function (k) {
              var w = defWeaponLvls[k] || 0;
              chunkHtml += '<td style="padding:4px 2px;border-bottom:1px solid rgba(255,255,255,.05);">' + (w > 0 ? w : '-') + '</td>';
            });
            for (var j = chunk.length; j < CHUNK; j++) chunkHtml += '<td style="border-bottom:1px solid rgba(255,255,255,.05);"></td>';
            chunkHtml += '</tr>';

            chunkHtml += '<tr>';
            chunkHtml += '<td style="padding:6px;border-right:1px solid rgba(255,255,255,.05);text-align:left;color:var(--dim);">Nv. Armadura</td>';
            chunk.forEach(function (k) {
              var a = defArmorLvls[k] || 0;
              chunkHtml += '<td style="padding:4px 2px;">' + (a > 0 ? a : '-') + '</td>';
            });
            for (var j = chunk.length; j < CHUNK; j++) chunkHtml += '<td></td>';
            chunkHtml += '</tr>';
          }
          chunkHtml += '</table>';
          html += chunkHtml;
        }
        html += '</div>';
        return html;
      }
      var S = {
        section: 'margin-bottom:14px;',
        title: 'font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);'
          + 'border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:4px;margin-bottom:8px;',
        row: 'display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:5px;'
          + 'background:rgba(255,255,255,.03);margin-bottom:4px;',
        name: 'flex:1;font-size:.8rem;color:var(--text);',
        qty: 'font-size:.82rem;font-family:VT323,monospace;color:var(--accent);min-width:40px;text-align:right;',
        badge: 'font-size:.62rem;padding:1px 5px;border-radius:3px;white-space:nowrap;'
          + 'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--dim);',
        badgeGold: 'font-size:.62rem;padding:1px 5px;border-radius:3px;white-space:nowrap;'
          + 'background:rgba(255,210,0,.08);border:1px solid rgba(255,210,0,.25);color:var(--gold);',
        badgeRed: 'font-size:.62rem;padding:1px 5px;border-radius:3px;white-space:nowrap;'
          + 'background:rgba(255,61,90,.08);border:1px solid rgba(255,61,90,.25);color:var(--danger);',
        noData: 'font-size:.75rem;color:var(--dim);padding:6px 8px;font-style:italic;'
      };

      // ── Header ───────────────────────────────────────────────────
      var now = new Date();
      var dateStr = ('0' + now.getDate()).slice(-2) + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + now.getFullYear();
      var timeStr = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2) + ':' + ('0' + now.getSeconds()).slice(-2);

      var html = '<div style="font-family:inherit;">';
      html += '<div style="margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.1);">'
        + '<div style="font-size:.9rem;color:var(--gold);margin-bottom:2px;">Asunto: Espionaje a ' + escapeHtml(sv.name) + ' [' + sv.cx + ', ' + sv.cy + ']</div>'
        + '<div style="font-size:.75rem;color:var(--text);margin-bottom:8px;">Espionaje a ' + escapeHtml(sv.name) + ' [' + sv.cx + ', ' + sv.cy + '] | Jugador: <strong style="color:var(--gold);">' + escapeHtml(ownerName) + '</strong></div>'
        + '<div style="font-size:.7rem;color:var(--dim);">Espionaje realizado el ' + dateStr + ' a las ' + timeStr + '</div>'
        + '</div>';

      // Filtrar visibles
      var visibleTroops = Object.keys(TROOP_TYPES).filter(function (k) { return Math.max(0, (spyTroops[k] || 0) - (spyRefugio[k] || 0)) > 0; });
      var visibleCreatures = Object.keys(CREATURE_TYPES).filter(function (k) { return (spyCreatures[k] || 0) > 0; });

      if (visibleTroops.length === 0 && visibleCreatures.length === 0) {
        html += '<div style="font-size:.8rem;color:var(--dim);text-align:center;padding:20px;font-style:italic;">No se han detectado tropas en esta aldea.</div>';
      } else {
        html += buildSpyTable('Tropas lideradas por ' + escapeHtml(ownerName), visibleTroops, TROOP_TYPES, false);
        html += buildSpyTable('Criaturas Defensoras de la Aldea', visibleCreatures, CREATURE_TYPES, true);
      }

      // Muralla y footer
      if (wallLvlSpy > 0) {
        html += '<div style="margin-top:10px;font-size:.75rem;color:var(--dim);border-top:1px solid rgba(255,255,255,.05);padding-top:8px;">'
          + 'Nivel de Muralla: <strong style="color:var(--text);">' + wallLvlSpy + '</strong></div>';
      }

      // Mostrar recursos espionados en la aldea destino usando sv.state
      var spyRes = spyState && spyState.resources ? spyState.resources : {};

      html += '<div style="margin-top:16px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);padding:12px;border-radius:6px;">'
        + '<div style="font-size:.65rem;letter-spacing:.12em;color:var(--dim);text-transform:uppercase;margin-bottom:8px;text-align:center;">Recursos Almacenados</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">'

        + '<div style="display:flex;align-items:center;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);padding:6px 10px;border-radius:4px;gap:6px;">'
        + '<span style="font-size:1.2rem;">🌲</span> <span style="font-family:VT323,monospace;font-size:1.15rem;color:var(--text);">' + fmt(spyRes.madera || 0) + '</span></div>'

        + '<div style="display:flex;align-items:center;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);padding:6px 10px;border-radius:4px;gap:6px;">'
        + '<span style="font-size:1.2rem;">⛰️</span> <span style="font-family:VT323,monospace;font-size:1.15rem;color:var(--text);">' + fmt(spyRes.piedra || 0) + '</span></div>'

        + '<div style="display:flex;align-items:center;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);padding:6px 10px;border-radius:4px;gap:6px;">'
        + '<span style="font-size:1.2rem;">⚙️</span> <span style="font-family:VT323,monospace;font-size:1.15rem;color:var(--text);">' + fmt(spyRes.hierro || 0) + '</span></div>'

        + '<div style="display:flex;align-items:center;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);padding:6px 10px;border-radius:4px;gap:6px;">'
        + '<span style="font-size:1.2rem;">🌾</span> <span style="font-family:VT323,monospace;font-size:1.15rem;color:var(--text);">' + fmt(spyRes.provisiones || 0) + '</span></div>'

        + '<div style="display:flex;align-items:center;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);padding:6px 10px;border-radius:4px;gap:6px;">'
        + '<span style="font-size:1.2rem;">✨</span> <span style="font-family:VT323,monospace;font-size:1.15rem;color:var(--text);">' + fmt(spyRes.esencia || 0) + '</span></div>'

        + '</div></div>';

      html += '</div>';

      await sendSystemReport(currentUser.id, '🔍 ESPIONAJE: ' + sv.name, html);
      showNotif('Espionaje completado. Revisa tus mensajes.', 'ok');
    } else {
      await sendSystemReport(currentUser.id, 'ESPIONAJE', 'Coordenada [' + m.tx + ', ' + m.ty + '] sin objetivo.');
      showNotif('Sin objetivo en esa coordenada.', 'err');
    }
  }
}


async function executeAttackMission(m) {
  var target = (typeof NPC_CASTLES !== 'undefined' ? NPC_CASTLES : []).find(c => c.id === m.targetId);
  if (!target) {
    // No es NPC — puede ser ataque PvP
    await executeAttackPvP(m);
    return;
  }

  // Comprobar si ya fue derrotado por este jugador
  var obj = playerObjectives.find(o => o.objective_id === target.id);
  if (obj && obj.status === 'cleared') {
    await sendSystemReport(currentUser.id, '⚔️ BATALLA: ' + target.name,
      '❌ Ya derrotaste a ' + target.name + ' anteriormente. No puedes atacarlo de nuevo.');
    showNotif(target.name + ' ya fue derrotado por ti.', 'err');
    return;
  }

  // Ejército atacante: solo tropas propias (aliados NO pueden atacar NPCs)
  var _atkFullArmy = Object.assign({}, m.troops || {});

  // El caballero es UNA sola unidad con sus stats completos
  var knightArmy = {
    _knight: {
      count: 1,
      stats: {
        hp: target.hp,
        damage: target.damage,
        attacksPerTurn: target.attacksPerTurn,
        attackChance: target.attackChance,
        defense: target.defense,
        dexterity: target.dexterity,
        armor: 0,
        weapon: 0,
        icon: '👑',
        name: target.name
      }
    }
  };

  var result = simulateBattle(_atkFullArmy, knightArmy, 0, _researchData);
  var victoria = result.winner === 1;

  var attackerCasualties = {};
  var defenderCasualties = {};

  Object.keys(_atkFullArmy).forEach(function (type) {
    var initial = _atkFullArmy[type] || 0;
    var final = (result.survivors1[type] || 0);
    if (initial > final) {
      attackerCasualties[type] = initial - final;
    }
  });

  Object.keys(knightArmy).forEach(function (type) {
    var initial = knightArmy[type].count || 0;
    var final = (result.survivors2[type] || 0);
    if (initial > final) {
      defenderCasualties[type] = initial - final;
    }
  });

  // Calcular XP por bajas — v1.36: factor × nivel_tropa_matada × cantidad
  // Aldeano: 2 × nivel; otras tropas: 10 × nivel; criaturas: 10 (sin nivel)
  var attackerXP = 0;
  var defenderXP = 0;
  var atkTroopLvls = (_researchData && _researchData.troop_levels) || {};

  // Atacante gana XP por matar tropas del defensor NPC (nivel 1 siempre)
  Object.keys(defenderCasualties).forEach(function (type) {
    var killed = defenderCasualties[type];
    if (type === '_knight') {
      attackerXP += target.rewards.experience;
    } else if (TROOP_TYPES[type]) {
      var lvl = 1; // NPC siempre nivel 1
      attackerXP += killed * (type === 'aldeano' ? 2 : 10) * lvl;
    } else if (CREATURE_TYPES[type]) {
      attackerXP += killed * 10;
    }
  });

  // Defensor gana XP por matar tropas del atacante (nivel del atacante)
  Object.keys(attackerCasualties).forEach(function (type) {
    var killed = attackerCasualties[type];
    if (TROOP_TYPES[type]) {
      var lvl = atkTroopLvls[type] || 1;
      defenderXP += killed * (type === 'aldeano' ? 2 : 10) * lvl;
    } else if (CREATURE_TYPES[type]) {
      defenderXP += killed * 10;
    }
  });

  // Calcular recuperación de tropas (todo el ejército combinado)
  var attackerRecovered = calculateRecovery(attackerCasualties);

  // Supervivientes totales = combate + recuperados
  var totalSurv = {};
  Object.keys(result.survivors1).forEach(function (type) {
    var n = (result.survivors1[type] || 0) + (attackerRecovered[type] || 0);
    if (n > 0) totalSurv[type] = n;
  });
  Object.keys(attackerRecovered).forEach(function (type) {
    if (!totalSurv[type] && attackerRecovered[type] > 0) totalSurv[type] = attackerRecovered[type];
  });

  // Supervivientes propios incluyendo recuperados
  var ownSurv = Object.assign({}, totalSurv);

  var loot = null;
  if (victoria) {
    loot = { madera: 0, piedra: 0, hierro: 0, provisiones: 0, esencia: 0 };
  }

  var reportHTML = generateBattleReport(
    currentUser.user_metadata?.username || 'Jugador',
    target.name, _atkFullArmy, knightArmy, result, loot, attackerXP, defenderXP, true
  );

  if (victoria) {
    await sbClient.rpc('add_experience', { amount: attackerXP });
    // Actualizar caché local y DOM sin recargar desde Supabase
    if (typeof _researchData !== 'undefined' && _researchData) {
      _researchData.experience = (_researchData.experience || 0) + attackerXP;
      var xpEl = document.getElementById('ovExperience');
      if (xpEl) xpEl.textContent = formatNumber(_researchData.experience);
      var xpEl2 = document.getElementById('researchXPDisplay');
      if (xpEl2) xpEl2.textContent = formatNumber(_researchData.experience) + ' XP';
    }
    await updateObjective(target.id, 'cleared');
    if (activeVillage && activeVillage.state) {
      activeVillage.state.battles_won_npc = (activeVillage.state.battles_won_npc || 0) + 1;
      scheduleSave();
      sbClient.from('profiles').update({ battles_won_npc: activeVillage.state.battles_won_npc }).eq('id', currentUser.id).then(function () { }).catch(function () { });
    }
    showNotif('¡' + target.name + ' derrotado! +' + fmt(attackerXP) + ' XP', 'ok');
  } else {
    await updateObjective(target.id, 'attacked');
    showNotif('Derrota contra ' + target.name + '. Revisa el reporte.', 'err');
  }

  m.troops = ownSurv;
  m.loot = loot;
  await sendSystemReport(currentUser.id, (victoria ? '🏆' : '💀') + ' BATALLA: ' + target.name, reportHTML);
}

// ============================================================
// PvP — Ataque entre jugadores
// ============================================================
async function executeAttackPvP(m) {
  try {
    // 1. Cargar aldea defensora
    var r = await sbClient.from('villages').select('*').eq('id', m.targetId).maybeSingle();
    if (r.error || !r.data) {
      await sendSystemReport(currentUser.id, '⚔️ ATAQUE PvP', '❌ La aldea objetivo ya no existe. Tus tropas regresan.');
      _returnTroopsHome(m); return;
    }
    var targetVillage = r.data;
    var ts = typeof targetVillage.state === 'string' ? JSON.parse(targetVillage.state) : (targetVillage.state || null);

    // v1.49: todas las aldeas tienen state jsonb — no hay fallback a tablas separadas
    if (!ts) ts = { buildings: {}, troops: {}, creatures: {}, resources: {} }; // self-healing

    var wallLvl = (ts.buildings && ts.buildings.muralla && ts.buildings.muralla.level) || 0;

    // 2. Construir contingentes ATACANTES
    var leaderName = (profileCache[currentUser.id] && profileCache[currentUser.id].username) || activeVillage.name || 'Atacante';
    var attackerContingents = [{
      owner_id: currentUser.id,
      name: leaderName,
      village_name: activeVillage.name || '',
      village_id: activeVillage.id,
      troops: Object.assign({}, m.troops || {})
    }];
    (m.guest_contingents || []).forEach(function (c) {
      if (!c.troops || !Object.values(c.troops).some(function (n) { return n > 0; })) return;
      attackerContingents.push({
        owner_id: c.owner_id,
        name: (profileCache[c.owner_id] && profileCache[c.owner_id].username) || c.owner_id.slice(0, 8),
        village_name: '',
        village_id: c.origin_village_id,
        troops: Object.assign({}, c.troops)
      });
    });

    // refugio del defensor — tropas ocultas: invisibles y no defienden
    var defRefugio = (ts && ts.refugio) || {};

    // 3. Construir contingentes DEFENSORES: dueño + aliados estacionados
    var defOwnerTroops = {};
    Object.keys(TROOP_TYPES).forEach(function (k) {
      var n = Math.max(0, ((ts.troops && ts.troops[k]) || 0) - (defRefugio[k] || 0));
      if (n > 0) defOwnerTroops[k] = n;
    });
    Object.keys(CREATURE_TYPES).forEach(function (k) { var n = (ts.creatures && ts.creatures[k]) || 0; if (n > 0) defOwnerTroops[k] = n; });
    var defenderContingents = [{
      owner_id: targetVillage.owner_id,
      name: targetVillage.owner_id === GHOST_OWNER_ID
        ? (targetVillage.name || 'Aldea Fantasma')
        : (profileCache[targetVillage.owner_id] && profileCache[targetVillage.owner_id].username) || 'Defensor',
      village_name: targetVillage.name || '',
      village_id: targetVillage.id,
      troops: defOwnerTroops
    }];
    var guestDefenders = [];
    if (_guestTroopsTableExists !== false) {
      try {
        var gr = await sbClient.from('guest_troops').select('*').eq('host_village_id', m.targetId);
        if (!gr.error && gr.data) guestDefenders = gr.data;
      } catch (e) { /* ignorar */ }
    }
    guestDefenders.forEach(function (gt) {
      var gTroops = typeof gt.troops === 'string' ? JSON.parse(gt.troops) : (gt.troops || {});
      if (!Object.values(gTroops).some(function (n) { return n > 0; })) return;
      defenderContingents.push({
        owner_id: gt.owner_id,
        name: (profileCache[gt.owner_id] && profileCache[gt.owner_id].username) || gt.owner_id.slice(0, 8),
        village_name: '',
        village_id: gt.origin_village_id,
        gt_id: gt.id,
        troops: gTroops
      });
    });

    // 4. BATALLAR — aplicar niveles de investigación + herrería del atacante
    var atkLevelsByOwner = {};
    if (currentUser && _researchData) {
      atkLevelsByOwner[currentUser.id] = _researchData;
    }
    var bResult = simulateBattlePvP(attackerContingents, defenderContingents, wallLvl, atkLevelsByOwner, {});
    var victoria = bResult.winner === 1;

    // 5. Botín — capacidad de supervivientes atacantes
    var loot = {};
    if (victoria) {
      var totalCarry = 0;
      bResult.attackerResults.forEach(function (ar) {
        Object.keys(ar.survivors).forEach(function (k) {
          var td = TROOP_TYPES[k];
          if (td && td.capacity > 0) totalCarry += (ar.survivors[k] || 0) * td.capacity;
        });
      });
      var totalAvail = 0, avail = {};
      ['madera', 'piedra', 'hierro', 'provisiones'].forEach(function (res) {
        var n = (ts.resources && ts.resources[res]) || 0;
        if (n > 0) { avail[res] = n; totalAvail += n; }
      });
      if (totalCarry > 0 && totalAvail > 0) {
        ['madera', 'piedra', 'hierro', 'provisiones'].forEach(function (res) {
          if (!avail[res]) return;
          var take = Math.min(Math.floor(totalCarry * (avail[res] / totalAvail)), avail[res]);
          if (take > 0) { loot[res] = take; ts.resources[res] = Math.max(0, avail[res] - take); }
        });
      }
    }

    // 6. Guardar defensores
    var defOwnerRes = bResult.defenderResults[0];
    Object.keys(TROOP_TYPES).forEach(function (k) { if (ts.troops) ts.troops[k] = defOwnerRes.survivors[k] || 0; });
    Object.keys(CREATURE_TYPES).forEach(function (k) { if (ts.creatures) ts.creatures[k] = defOwnerRes.survivors[k] || 0; });
    for (var di = 1; di < bResult.defenderResults.length; di++) {
      var dRes = bResult.defenderResults[di];
      var gtId = defenderContingents[di].gt_id;
      if (!gtId) continue;
      var hasSurv = Object.values(dRes.survivors).some(function (n) { return n > 0; });
      if (hasSurv) await sbClient.from('guest_troops').update({ troops: JSON.stringify(dRes.survivors) }).eq('id', gtId);
      else await sbClient.from('guest_troops').delete().eq('id', gtId);
    }
    // v1.49: guardar defensor siempre via villages.state jsonb (fantasma y jugador real)
    await sbClient.from('villages').update({ state: JSON.stringify(ts) }).eq('id', m.targetId);

    // 7. Retorno propias tropas
    var ownRes = bResult.attackerResults[0];
    m.troops = Object.assign({}, ownRes.survivors);
    Object.keys(ownRes.recovered || {}).forEach(function (k) { m.troops[k] = (m.troops[k] || 0) + (ownRes.recovered[k] || 0); });
    m.loot = loot;

    // 8. Retorno contingentes aliados atacantes
    for (var ai = 1; ai < bResult.attackerResults.length; ai++) {
      var aRes = bResult.attackerResults[ai];
      var aC = m.guest_contingents[ai - 1];
      var surv = Object.assign({}, aRes.survivors);
      Object.keys(aRes.recovered || {}).forEach(function (k) { surv[k] = (surv[k] || 0) + (aRes.recovered[k] || 0); });
      if (!Object.values(surv).some(function (n) { return n > 0; })) continue;
      var origVR = await sbClient.from('villages').select('id,x,y,state').eq('id', aC.origin_village_id).maybeSingle();
      if (origVR.error || !origVR.data) continue;
      var origV = origVR.data;
      var origState = typeof origV.state === 'string' ? JSON.parse(origV.state) : origV.state;
      var cMinSpd = 999;
      Object.keys(surv).forEach(function (k) { var td = TROOP_TYPES[k] || CREATURE_TYPES[k]; if ((surv[k] || 0) > 0 && td && td.speed < cMinSpd) cMinSpd = td.speed; });
      if (cMinSpd === 999) cMinSpd = 1;
      var cDist = Math.max(Math.abs(m.tx - origV.x), Math.abs(m.ty - origV.y));
      var cSecs = Math.ceil((cDist / cMinSpd) * MISSION_FACTOR);
      if (!origState.mission_queue) origState.mission_queue = [];
      origState.mission_queue.push({
        type: 'return_reinforce', tx: origV.x, ty: origV.y, troops: surv,
        finish_at: new Date(Date.now() + cSecs * 1000).toISOString(), start_at: new Date().toISOString()
      });
      await sbClient.from('villages').update({ state: JSON.stringify(origState) }).eq('id', aC.origin_village_id);
    }

    // 9. Limpiar active_missions
    await _clearActiveMission(m.mid);

    // 9b. XP — calculado en simulateBattlePvP (distribuido proporcional a tropas aportadas)
    var pvpXP = (bResult.attackerResults[0] && bResult.attackerResults[0].xp) || 0;
    if (pvpXP > 0) {
      sbClient.rpc('add_experience', { amount: pvpXP }).then(function () {
        if (typeof _researchData !== 'undefined' && _researchData) {
          _researchData.experience = (_researchData.experience || 0) + pvpXP;
          var xpEl = document.getElementById('ovExperience');
          if (xpEl) xpEl.textContent = formatNumber(_researchData.experience);
          var xpEl2 = document.getElementById('researchXPDisplay');
          if (xpEl2) xpEl2.textContent = formatNumber(_researchData.experience) + ' XP';
        }
      }).catch(function (e) { console.warn('PvP XP error:', e); });
    }

    // 10. Informe y notificaciones
    var reportHtml = generateBattlePvPReport(bResult, wallLvl, loot, { x: m.tx, y: m.ty });
    var titleAtk = (victoria ? '🏆' : '💀') + ' BATALLA PvP: ' + (targetVillage.name || '[' + m.tx + ',' + m.ty + ']');
    var titleDef = (victoria ? '🚨' : '🛡️') + ' BATALLA PvP: ' + leaderName + ' atacó tu aldea';
    var sentTo = new Set();
    async function notifyParticipant(uid, title) {
      if (!uid || uid === GHOST_OWNER_ID) return; // aldeas fantasma no tienen buzón
      if (!sentTo.has(uid)) { await sendSystemReport(uid, title, reportHtml); sentTo.add(uid); }
    }
    await notifyParticipant(currentUser.id, titleAtk);
    for (var ai2 = 1; ai2 < bResult.attackerResults.length; ai2++) await notifyParticipant(bResult.attackerResults[ai2].owner_id, titleAtk);
    await notifyParticipant(targetVillage.owner_id, titleDef);
    for (var di2 = 1; di2 < bResult.defenderResults.length; di2++) await notifyParticipant(bResult.defenderResults[di2].owner_id, titleDef);

    if (victoria) {
      if (targetVillage.owner_id === GHOST_OWNER_ID) {
        // Victoria contra aldea fantasma cuenta como NPC
        if (activeVillage && activeVillage.state) {
          activeVillage.state.battles_won_npc = (activeVillage.state.battles_won_npc || 0) + 1;
          scheduleSave();
          sbClient.from('profiles').update({ battles_won_npc: activeVillage.state.battles_won_npc }).eq('id', currentUser.id).then(function () { }).catch(function () { });
        }
        showNotif('⚔️ ¡Aldea fantasma derrotada!' + (pvpXP > 0 ? ' +' + fmt(pvpXP) + ' XP' : ''), 'ok');
      } else {
        if (activeVillage && activeVillage.state) {
          activeVillage.state.battles_won_pvp = (activeVillage.state.battles_won_pvp || 0) + 1;
          scheduleSave();
          sbClient.from('profiles').update({ battles_won_pvp: activeVillage.state.battles_won_pvp }).eq('id', currentUser.id).then(function () { }).catch(function () { });
        }
        showNotif('⚔️ ¡Victoria PvP contra ' + (targetVillage.name || 'aldea') + '!' + (pvpXP > 0 ? ' +' + fmt(pvpXP) + ' XP' : ''), 'ok');
      }
    } else {
      if (targetVillage.owner_id !== GHOST_OWNER_ID) {
        if (activeVillage && activeVillage.state) {
          activeVillage.state.battles_lost_pvp = (activeVillage.state.battles_lost_pvp || 0) + 1;
          scheduleSave();
          sbClient.from('profiles').update({ battles_lost_pvp: activeVillage.state.battles_lost_pvp }).eq('id', currentUser.id).then(function () { }).catch(function () { });
        }
      }
      showNotif('💀 Derrota PvP. Revisa el informe.', 'err');
    }

  } catch (e) {
    console.error('executeAttackPvP error:', e);
    await sendSystemReport(currentUser.id, '⚔️ ERROR PvP', 'Error: ' + (e.message || e) + '. Tus tropas regresan.');
    _returnTroopsHome(m);
  }
}

// ============================================================
// ACTIVE MISSIONS — visibilidad multi-jugador para ataques conjuntos
// Tabla Supabase: active_missions (id, mission_id, leader_id, host_village_id,
//   target_x, target_y, participant_id, troops jsonb, finish_at, status)
// ============================================================
var _activeMissionsTableExists = null;

async function _insertActiveMission(missionId, m, contingents) {
  if (_activeMissionsTableExists === false) return;
  try {
    var rows = [];
    // Fila del líder
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
    // Fila por contingente aliado
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
  if (_activeMissionsTableExists === false) return;
  try {
    // Marcar como cancelada
    await sbClient.from('active_missions').update({ status: 'cancelled' }).eq('mission_id', missionId);

    // Cargar aldea del líder y eliminar la misión de su queue
    var lvr = await sbClient.from('villages').select('id,x,y,state').eq('id', leaderVillageId).maybeSingle();
    if (!lvr.error && lvr.data) {
      var lvState = typeof lvr.data.state === 'string' ? JSON.parse(lvr.data.state) : lvr.data.state;
      var mObj = (lvState.mission_queue || []).find(function (q) { return q.mid === missionId; });
      if (mObj) {
        // Devolver propias tropas al líder
        var lMinSpd = 999;
        Object.keys(mObj.troops || {}).forEach(function (k) {
          var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
          if ((mObj.troops[k] || 0) > 0 && td && td.speed < lMinSpd) lMinSpd = td.speed;
        });
        if (lMinSpd === 999) lMinSpd = 1;
        var lDist = Math.max(Math.abs(mObj.tx - lvr.data.x), Math.abs(mObj.ty - lvr.data.y));
        var lSecs = Math.ceil((lDist / lMinSpd) * MISSION_FACTOR);
        // Eliminar misión de ataque y crear retorno
        lvState.mission_queue = (lvState.mission_queue || []).filter(function (q) { return q.mid !== missionId; });
        if (Object.values(mObj.troops || {}).some(function (n) { return n > 0; })) {
          lvState.mission_queue.push({
            type: 'return', tx: lvr.data.x, ty: lvr.data.y, troops: mObj.troops, loot: {},
            finish_at: new Date(Date.now() + lSecs * 1000).toISOString(), start_at: new Date().toISOString()
          });
        }
        // Devolver tropas de cada aliado
        for (var ci = 0; ci < (mObj.guest_contingents || []).length; ci++) {
          var c = mObj.guest_contingents[ci];
          if (!Object.values(c.troops || {}).some(function (n) { return n > 0; })) continue;
          var origVR = await sbClient.from('villages').select('id,x,y,state').eq('id', c.origin_village_id).maybeSingle();
          if (origVR.error || !origVR.data) continue;
          var ov = origVR.data;
          var ovState = typeof ov.state === 'string' ? JSON.parse(ov.state) : ov.state;
          var aMinSpd = 999;
          Object.keys(c.troops).forEach(function (k) {
            var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
            if ((c.troops[k] || 0) > 0 && td && td.speed < aMinSpd) aMinSpd = td.speed;
          });
          if (aMinSpd === 999) aMinSpd = 1;
          var aDist = Math.max(Math.abs(mObj.tx - ov.x), Math.abs(mObj.ty - ov.y));
          var aSecs = Math.ceil((aDist / aMinSpd) * MISSION_FACTOR);
          if (!ovState.mission_queue) ovState.mission_queue = [];
          ovState.mission_queue.push({
            type: 'return_reinforce', tx: ov.x, ty: ov.y, troops: c.troops,
            finish_at: new Date(Date.now() + aSecs * 1000).toISOString(), start_at: new Date().toISOString()
          });
          await sbClient.from('villages').update({ state: JSON.stringify(ovState) }).eq('id', ov.id);
        }
        await sbClient.from('villages').update({ state: JSON.stringify(lvState) }).eq('id', lvr.data.id);
      }
    }
    await sbClient.from('active_missions').delete().eq('mission_id', missionId);
    showNotif('⚔️ Ataque conjunto cancelado. Tropas regresando.', 'ok');
    if (activeVillage && activeVillage.id === leaderVillageId) await flushVillage();
    tick();
  } catch (e) {
    console.error('cancelAlliedMission error:', e);
    showNotif('Error cancelando misión: ' + (e.message || e), 'err');
  }
}

function _returnTroopsHome(m) {
  // Encola retorno inmediato de las tropas
  if (!activeVillage) return;
  var dist = Math.max(Math.abs((m.tx || 0) - activeVillage.x), Math.abs((m.ty || 0) - activeVillage.y));
  var minSpeed = 1;
  Object.keys(m.troops || {}).forEach(function (k) {
    var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
    if ((m.troops[k] || 0) > 0 && td) minSpeed = Math.min(minSpeed, td.speed || 1);
  });
  var secs = Math.ceil((dist / minSpeed) * MISSION_FACTOR);
  activeVillage.state.mission_queue.push({
    type: 'return', tx: activeVillage.x, ty: activeVillage.y,
    troops: m.troops, loot: {},
    finish_at: new Date(Date.now() + secs * 1000).toISOString(),
    start_at: new Date().toISOString()
  });
}

// updateObjective definida más abajo (única versión — upsert)

function resolveQueue(vs) {
  if (!vs.build_queue) return vs;

  var finishAt = new Date(vs.build_queue.finish_at).getTime();
  if (Date.now() >= finishAt) {
    var id = vs.build_queue.id;

    // UPGRADE BUILDING
    if (!vs.buildings[id]) vs.buildings[id] = { level: 1 };
    else vs.buildings[id].level++;

    vs.build_queue = null;

    var def = BUILDINGS.find(function (b) { return b.id === id; });
    showNotif((def ? def.name : id) + ' mejorada!', 'ok');

    // ⚠️ CRITICAL: Save changes removed from here to avoid side-effects.
    // Caller (tick or loadMyVillages) MUST check if queue changed and save.
  }
  return vs;
}

// ============================================================
// USERNAME (EPIC WARRIOS V2)
// Reglas:
// - 4 a 15 caracteres
// - Solo letras, numeros, "_" y "-"
// - Debe ser unico
