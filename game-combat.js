// ============================================================
// EPIC WARRIORS — game-combat.js  [v1.74 — audit patch]
// Motor de combate: executeTurn, simulateBattle, simulateBattlePvP
// Utiles: divideIntoGroups, createArmy, calculateLoot
// Reportes: generateBattleReport, generateBattlePvPReport
// Lógica: getTroopLevel, getCreatureLevel, canSummon
// Defaults: defaultTroops, defaultCreatures, defaultState, consumeAldeanos
// ============================================================
// FIX SUMMARY v1.74 (8 issues — auditoría completa 2 pasadas)
// [CRÍTICO-1] startSummoning: ahora llama RPC start_summoning_secure — nunca modifica resources local
// [CRÍTICO-2] cancelSummoningQueue: ahora llama RPC cancel_summoning_secure
// [MEDIO-3]   calculateRecovery: tasa fija 15% — elimina Math.random() explotable desde cliente
// [MEDIO-4]   consumeAldeanos: añadido guard; troops.aldeano solo se modifica si save_village_client blinda troops
// [MENOR-5]   generateBattlePvPReport: añadidos provisiones y esencia al dict de iconos
// [MENOR-6]   startSummoning/startSummoningFromInput: versiones zombie eliminadas de este módulo;
//             las versiones server-authoritative viven en game-troops.js (v1.66+)
// [MEDIO-7]   generateBattleReport L141/145: attackerName+defenderName escapados con escapeHtml() — XSS
// [MEDIO-8]   generateBattleReport L169: log escapado con escapeHtml() — XSS
// [MEDIO-9]   generateBattlePvPReport L466-467: empate (winner===0) ahora muestra texto y color correcto
// [MENOR-10]  generateBattlePvPReport: fila "SE RECUPERAN" oculta cuando wallResisted===true
// [MENOR-11]  cancelSummoningQueue/startSummoning: null-guard en data antes de data.ok — evita TypeError
// [MENOR-12]  cancelSummoningQueue: llama loadMyVillages()+tick() tras RPC exitoso para resync completo
// [MENOR-13]  startSummoning: llama tick() tras renderCreatures() para actualizar recursos y provisiones
// [COSMÉTICO] comentarios que afirmaban "nunca toca resources local" corregidos (L598 sí actualiza local)
// ============================================================

function divideIntoGroups(total) {
  if (total <= 0) return [];
  const groups = [];
  let remaining = total;
  let bucketMax = 10;
  let prevMax = 0;
  while (remaining > 0) {
    const capacity = bucketMax - prevMax;
    const fill = Math.min(remaining, capacity);
    groups.push(fill);
    remaining -= fill;
    prevMax = bucketMax;
    bucketMax *= 10;
  }
  return groups;
}

function createArmy(armyId, troops, troopLevels, weaponLevels, armorLevels) {
  let army = [];
  Object.keys(troops).forEach(type => {
    let entry = troops[type];
    let count, stats;
    if (entry && typeof entry === 'object' && entry.stats) {
      count = entry.count || 1;
      stats = entry.stats;
    } else {
      count = entry;
      var lvl = (troopLevels && troopLevels[type]) ? troopLevels[type] : 1;
      if (TROOP_TYPES[type]) {
        stats = JSON.parse(JSON.stringify(getTroopStatsWithLevel(type, lvl)));
        if (weaponLevels && weaponLevels[type]) stats.weapon = (stats.weapon || 0) + weaponLevels[type];
        if (armorLevels && armorLevels[type]) stats.armor = (stats.armor || 0) + armorLevels[type];
      } else {
        stats = TROOP_TYPES[type] || CREATURE_TYPES[type];
      }
    }
    if (!count || count <= 0) return;
    if (!stats) return;
    let groupSizes = divideIntoGroups(count);
    groupSizes.forEach((size, idx) => {
      army.push({
        armyId,
        groupId: army.length + 1,
        type,
        stats: JSON.parse(JSON.stringify(stats)),
        count: size,
        totalHP: size * stats.hp
      });
    });
  });
  return army;
}

// ── FIX [MEDIO-3]: tasa de recuperación fija — elimina Math.random() ──────────
// Antes: recoveryRate = 0.1 + Math.random() * 0.2  → explotable con recargas.
// Ahora: 15% fijo (valor medio del rango original). Determinista e igual para todos.
function calculateRecovery(casualties) {
  var recovered = {};
  var RECOVERY_RATE = 0.15; // fijo — no aleatorio
  Object.keys(casualties).forEach(function (type) {
    var dead = casualties[type] || 0;
    if (dead > 0) {
      recovered[type] = Math.floor(dead * RECOVERY_RATE);
    }
  });
  return recovered;
}

function calculateLootCapacity(troops) {
  var total = 0;
  Object.keys(troops).forEach(function (type) {
    var count = troops[type] || 0;
    var troopData = TROOP_TYPES[type] || CREATURE_TYPES[type];
    if (troopData && count > 0) {
      total += count * (troopData.capacity || 0);
    }
  });
  return total;
}

function calculateLoot(defenderResources, capacity) {
  var available = {
    madera: defenderResources.madera || 0,
    piedra: defenderResources.piedra || 0,
    hierro: defenderResources.hierro || 0,
    provisiones: defenderResources.provisiones || 0,
    esencia: defenderResources.esencia || 0
  };
  var totalAvailable = available.madera + available.piedra + available.hierro +
    available.provisiones + available.esencia;
  if (totalAvailable === 0 || capacity === 0) {
    return { madera: 0, piedra: 0, hierro: 0, provisiones: 0, esencia: 0 };
  }
  var ratio = Math.min(1, capacity / totalAvailable);
  return {
    madera: Math.floor(available.madera * ratio),
    piedra: Math.floor(available.piedra * ratio),
    hierro: Math.floor(available.hierro * ratio),
    provisiones: Math.floor(available.provisiones * ratio),
    esencia: Math.floor(available.esencia * ratio)
  };
}

function generateBattleReport(attackerName, defenderName, attackerTroops, defenderTroops,
  result, loot, attackerXP, defenderXP, isNPC) {
  var winner = result.winner === 1 ? 'atacante' : result.winner === 2 ? 'defensor' : 'empate';
  var attackerInitial = {}, attackerFinal = result.survivors1 || {}, attackerCasualties = {};
  Object.keys(attackerTroops).forEach(function (type) {
    var initial = attackerTroops[type] || 0;
    var fin = attackerFinal[type] || 0;
    if (initial > 0) { attackerInitial[type] = initial; attackerCasualties[type] = initial - fin; }
  });
  var attackerRecovered = calculateRecovery(attackerCasualties);
  var defenderInitial = {}, defenderFinal = result.survivors2 || {}, defenderCasualties = {};
  Object.keys(defenderTroops).forEach(function (type) {
    var initial = defenderTroops[type] || 0;
    var fin = defenderFinal[type] || 0;
    if (initial > 0) { defenderInitial[type] = initial; defenderCasualties[type] = initial - fin; }
  });
  var defenderRecovered = calculateRecovery(defenderCasualties);
  var html = '<div style="background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:16px;max-width:700px;margin:0 auto;">';
  html += '<div style="margin-bottom:20px;"><div style="font-size:1.1rem;font-weight:bold;color:var(--danger);margin-bottom:12px;border-bottom:2px solid var(--danger);padding-bottom:6px;">⚔️ ATACANTES</div>';
  html += '<div style="color:var(--text);font-size:.85rem;margin-bottom:8px;"><b>' + escapeHtml(attackerName) + '</b></div>';
  html += generateTroopTable(attackerInitial, attackerFinal, attackerRecovered, false);
  html += '<div style="margin-top:8px;color:var(--accent);font-size:.8rem;">📊 Experiencia ganada: ' + fmt(attackerXP) + '</div></div>';
  html += '<div style="margin-bottom:20px;"><div style="font-size:1.1rem;font-weight:bold;color:var(--ok);margin-bottom:12px;border-bottom:2px solid var(--ok);padding-bottom:6px;">🛡️ DEFENSORES</div>';
  html += '<div style="color:var(--text);font-size:.85rem;margin-bottom:8px;"><b>' + escapeHtml(defenderName) + '</b></div>';
  html += generateTroopTable(defenderInitial, defenderFinal, defenderRecovered, isNPC);
  html += '<div style="margin-top:8px;color:var(--accent);font-size:.8rem;">📊 Experiencia ganada: ' + fmt(defenderXP) + '</div></div>';
  html += '<div style="background:var(--panel2);border-radius:6px;padding:12px;margin-bottom:16px;text-align:center;">';
  html += '<div style="font-size:1.2rem;font-weight:bold;color:' + (winner === 'atacante' ? 'var(--ok)' : winner === 'defensor' ? 'var(--danger)' : 'var(--dim)') + ';margin-bottom:8px;">';
  html += winner === 'atacante' ? '🏆 Ha ganado el bando atacante' : winner === 'defensor' ? '💀 Ha ganado el bando defensor' : '⚖️ Empate';
  html += '</div><div style="font-size:.75rem;color:var(--dim);">Rondas de combate: ' + result.rounds + '</div></div>';
  if (winner === 'atacante' && loot) {
    var totalLoot = (loot.madera || 0) + (loot.piedra || 0) + (loot.hierro || 0) + (loot.provisiones || 0) + (loot.esencia || 0);
    if (totalLoot > 0) {
      html += '<div style="background:var(--panel2);border-radius:6px;padding:12px;margin-bottom:16px;">';
      html += '<div style="font-size:.9rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">💰 Materias robadas:</div>';
      html += '<div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;font-size:.85rem;">';
      if (loot.madera > 0) html += '<div>🌲 <b style="color:var(--madera);">' + fmt(loot.madera) + '</b></div>';
      if (loot.piedra > 0) html += '<div>⛰️ <b style="color:var(--piedra);">' + fmt(loot.piedra) + '</b></div>';
      if (loot.hierro > 0) html += '<div>⚙️ <b style="color:var(--hierro);">' + fmt(loot.hierro) + '</b></div>';
      if (loot.provisiones > 0) html += '<div>🌾 <b style="color:var(--prov);">' + fmt(loot.provisiones) + '</b></div>';
      if (loot.esencia > 0) html += '<div>✨ <b style="color:var(--esencia);">' + fmt(loot.esencia) + '</b></div>';
      html += '</div></div>';
    }
  }
  if (result.log && result.log.length > 0) {
    html += '<div style="margin-top:16px;"><button onclick="toggleBattleLog(this)" style="width:100%;background:var(--panel2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:4px;cursor:pointer;font-size:.8rem;">Ver detalles de combate ▼</button>';
    html += '<div style="display:none;margin-top:8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:12px;max-height:300px;overflow-y:auto;font-size:.7rem;font-family:monospace;color:var(--dim);">';
    result.log.forEach(function (line) { html += escapeHtml(line) + '<br>'; });
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function generateTroopTable(initial, final, recovered, isNPC) {
  var types = Object.keys(initial).filter(function (t) { return initial[t] > 0; });
  if (types.length === 0) return '<div style="color:var(--dim);font-size:.8rem;">Sin tropas</div>';
  var html = '<table style="width:100%;border-collapse:collapse;font-size:.8rem;color:var(--text);">';
  html += '<thead><tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:6px;color:var(--dim);font-size:.75rem;"></th>';
  types.forEach(function (type) {
    var troopData = TROOP_TYPES[type] || CREATURE_TYPES[type];
    var name = troopData ? troopData.name : type;
    var icon = troopData ? troopData.icon : '❓';
    if (type === '_knight') { name = 'Caballero'; icon = '👑'; }
    html += '<th style="text-align:center;padding:6px;color:var(--text);">' + icon + ' ' + name + '</th>';
  });
  html += '</tr></thead><tbody>';
  html += '<tr><td style="padding:6px;color:var(--dim);">Iniciales</td>';
  types.forEach(function (type) { html += '<td style="text-align:center;padding:6px;">' + (initial[type] || 0) + '</td>'; });
  html += '</tr><tr><td style="padding:6px;color:var(--dim);">Finales</td>';
  types.forEach(function (type) { html += '<td style="text-align:center;padding:6px;">' + (final[type] || 0) + '</td>'; });
  html += '</tr>';
  if (!isNPC) {
    html += '<tr style="border-top:1px solid var(--border);"><td style="padding:6px;color:var(--ok);">Recuperadas</td>';
    types.forEach(function (type) {
      var rec = recovered[type] || 0;
      html += '<td style="text-align:center;padding:6px;color:var(--ok);">' + rec + '</td>';
    });
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function toggleBattleLog(btn) {
  var logDiv = btn.nextElementSibling;
  if (logDiv.style.display === 'none') {
    logDiv.style.display = 'block';
    btn.textContent = 'Ocultar detalles ▲';
  } else {
    logDiv.style.display = 'none';
    btn.textContent = 'Ver detalles de combate ▼';
  }
}

function executeTurn(army1, army2, log, wallObj) {
  const all = [];
  army1.forEach(g => { if (g.count > 0) all.push({ group: g, isAtk: true }); });
  army2.forEach(g => { if (g.count > 0) all.push({ group: g, isAtk: false }); });
  all.sort((a, b) => {
    if (b.group.stats.dexterity !== a.group.stats.dexterity) return b.group.stats.dexterity - a.group.stats.dexterity;
    if (a.group.count !== b.group.count) return a.group.count - b.group.count;
    return Math.random() - 0.5;
  });
  all.forEach(item => {
    const group = item.group;
    if (group.count <= 0) return;
    const enemies = item.isAtk ? army2 : army1;
    for (let i = 0; i < (group.stats.attacksPerTurn || 1); i++) {
      if (group.count <= 0) break;
      if (item.isAtk && wallObj && wallObj.hp > 0) {
        const dmg = group.count * (group.stats.damage || 0);
        wallObj.hp = Math.max(0, wallObj.hp - dmg);
        if (log) log.push((item.isAtk ? '⚔' : '🛡') + ' ' + group.stats.icon + ' ' + (group.stats.name || '') + ' G' + group.groupId + ' golpea la muralla: ' + dmg + ' dmg → ' + wallObj.hp + ' HP');
        if (wallObj.hp <= 0 && log) log.push('💥 ¡Muralla destruida! Los atacantes avanzan sobre las tropas.');
        continue;
      }
      const aliveEnemies = enemies.filter(e => e.count > 0);
      if (aliveEnemies.length === 0) break;
      const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      const attackRoll = (group.stats.attackChance || 10) + Math.floor(Math.random() * 20) + 1;
      if (attackRoll > target.stats.defense) {
        const dmg = group.count * group.stats.damage;
        target.totalHP -= dmg;
        const newCount = Math.max(0, Math.floor(target.totalHP / target.stats.hp + 0.0001));
        const killed = target.count - newCount;
        target.count = newCount;
        var gLbl = (item.isAtk ? '⚔' : '🛡️') + ' ' + group.stats.icon + ' ' + (group.stats.name || '') + ' G' + group.groupId;
        var tLbl = (target.armyId === 1 ? '⚔' : '🛡️') + ' ' + target.stats.icon + ' ' + (target.stats.name || '') + ' G' + target.groupId;
        if (log) log.push(gLbl + ' → ' + tLbl + ': ' + dmg + ' dmg, ' + killed + ' bajas');
        if (target.count <= 0) {
          const idx = enemies.indexOf(target);
          if (idx !== -1) enemies.splice(idx, 1);
          if (log) log.push('  💀 ' + tLbl + ' eliminado');
        }
      } else {
        var gLbl2 = (item.isAtk ? '⚔' : '🛡️') + ' ' + group.stats.icon + ' ' + (group.stats.name || '') + ' G' + group.groupId;
        var tLbl2 = (target.armyId === 1 ? '⚔' : '🛡️') + ' ' + target.stats.icon + ' ' + (target.stats.name || '') + ' G' + target.groupId;
        if (log) log.push(gLbl2 + ' falló vs ' + tLbl2 + ' (' + Math.floor(attackRoll) + ' vs DEF ' + Math.floor(target.stats.defense) + ')');
      }
    }
  });
}

function simulateBattle(army1Troops, army2Troops, defenderWallLevel, atkLevels, defLevels) {
  var aTL = atkLevels && atkLevels.troop_levels;
  var aWL = atkLevels && atkLevels.weapon_levels;
  var aAL = atkLevels && atkLevels.armor_levels;
  var dTL = defLevels && defLevels.troop_levels;
  var dWL = defLevels && defLevels.weapon_levels;
  var dAL = defLevels && defLevels.armor_levels;
  let army1 = createArmy(1, army1Troops, aTL, aWL, aAL);
  let army2 = createArmy(2, army2Troops, dTL, dWL, dAL);
  let log = [];
  let turn = 1;
  var wallObj = { hp: (defenderWallLevel && defenderWallLevel > 0) ? defenderWallLevel * 500 : 0 };
  if (wallObj.hp > 0) {
    log.push('🏰 Muralla nivel ' + defenderWallLevel + ': ' + wallObj.hp + ' HP. Los atacantes la golpean primero; los defensores contraatacan desde el turno 1.');
  }
  while (army1.length > 0 && army2.length > 0 && turn <= 100) {
    log.push('--- Ronda ' + turn + ' ---');
    executeTurn(army1, army2, log, wallObj);
    turn++;
  }
  var wallResisted = wallObj.hp > 0;
  let winner = wallResisted ? 2 : (army1.length > 0) ? 1 : (army2.length > 0) ? 2 : 0;
  let survivors1 = {};
  army1.forEach(g => survivors1[g.type] = (survivors1[g.type] || 0) + g.count);
  let survivors2 = {};
  army2.forEach(g => survivors2[g.type] = (survivors2[g.type] || 0) + g.count);
  return { winner, wallResisted, log, survivors1, survivors2, rounds: turn - 1 };
}

function simulateBattlePvP(attackerContingents, defenderContingents, wallLevel, atkLevelsByOwner, defLevelsByOwner) {
  var wallObj = { hp: (wallLevel && wallLevel > 0) ? wallLevel * 500 : 0 };
  var log = [];
  if (wallObj.hp > 0) log.push('🏰 Muralla nivel ' + wallLevel + ': ' + wallObj.hp + ' HP. Los atacantes la golpean primero; defensores contraatacan desde el turno 1.');

  function buildArmyPvP(contingents, armyId, levelsByOwner) {
    var army = [];
    contingents.forEach(function (c) {
      var lvls = (levelsByOwner && levelsByOwner[c.owner_id]) || {};
      var tl = lvls.troop_levels || {};
      var wl = lvls.weapon_levels || {};
      var al = lvls.armor_levels || {};
      Object.keys(c.troops || {}).forEach(function (troopKey) {
        var count = c.troops[troopKey] || 0;
        if (count <= 0) return;
        var stats;
        if (TROOP_TYPES[troopKey]) {
          var lvl = tl[troopKey] || 1;
          stats = JSON.parse(JSON.stringify(getTroopStatsWithLevel(troopKey, lvl)));
          if (wl[troopKey]) stats.weapon = (stats.weapon || 0) + wl[troopKey];
          if (al[troopKey]) stats.armor = (stats.armor || 0) + al[troopKey];
        } else {
          stats = CREATURE_TYPES[troopKey];
          if (!stats) return;
          stats = JSON.parse(JSON.stringify(stats));
        }
        divideIntoGroups(count).forEach(function (size) {
          army.push({
            armyId: armyId, groupId: army.length + 1,
            owner_id: c.owner_id, troopType: troopKey,
            stats: stats,
            count: size, totalHP: size * stats.hp
          });
        });
      });
    });
    return army;
  }

  var army1 = buildArmyPvP(attackerContingents, 1, atkLevelsByOwner);
  var army2 = buildArmyPvP(defenderContingents, 2, defLevelsByOwner);
  var turn = 1;

  while (army1.length > 0 && army2.length > 0 && turn <= 100) {
    log.push('--- Ronda ' + turn + ' ---');
    executeTurn(army1, army2, log, wallObj);
    turn++;
  }

  var wallResisted = wallObj.hp > 0;
  var winner = wallResisted ? 2 : (army1.length > 0 ? 1 : (army2.length > 0 ? 2 : 0));

  function collectResults(contingents, army) {
    return contingents.map(function (c) {
      var surv = {};
      army.forEach(function (g) {
        if (g.owner_id === c.owner_id && g.count > 0)
          surv[g.troopType] = (surv[g.troopType] || 0) + g.count;
      });
      var cas = {};
      Object.keys(c.troops || {}).forEach(function (k) {
        var lost = (c.troops[k] || 0) - (surv[k] || 0);
        if (lost > 0) cas[k] = lost;
      });
      var rec = wallResisted ? {} : calculateRecovery(cas);
      return {
        owner_id: c.owner_id, name: c.name || c.owner_id.slice(0, 8),
        village_name: c.village_name || '', village_id: c.village_id || null,
        initial: Object.assign({}, c.troops), survivors: surv,
        casualties: cas, recovered: rec, xp: 0
      };
    });
  }

  var atkResults = collectResults(attackerContingents, army1);
  var defResults = collectResults(defenderContingents, army2);

  var totalAtkTroops = attackerContingents.reduce(function (s, c) { return s + Object.values(c.troops || {}).reduce(function (a, n) { return a + (n || 0); }, 0); }, 0);
  var xpForAtk = 0;
  defResults.forEach(function (dr) {
    Object.keys(dr.casualties || {}).forEach(function (type) {
      var k = dr.casualties[type] || 0;
      if (k > 0) {
        if (TROOP_TYPES[type]) xpForAtk += k * (type === 'aldeano' ? 2 : 10);
        else if (CREATURE_TYPES[type]) xpForAtk += k * 10;
      }
    });
  });
  atkResults.forEach(function (r, i) {
    var myTroops = Object.values(attackerContingents[i].troops || {}).reduce(function (a, n) { return a + (n || 0); }, 0);
    r.xp = (totalAtkTroops > 0 && myTroops > 0) ? Math.round(xpForAtk * myTroops / totalAtkTroops) : 0;
  });

  var totalDefTroops = defenderContingents.reduce(function (s, c) { return s + Object.values(c.troops || {}).reduce(function (a, n) { return a + (n || 0); }, 0); }, 0);
  var xpForDef = 0;
  atkResults.forEach(function (ar) {
    Object.keys(ar.casualties || {}).forEach(function (type) {
      var k = ar.casualties[type] || 0;
      if (k > 0) {
        if (TROOP_TYPES[type]) xpForDef += k * (type === 'aldeano' ? 2 : 10);
        else if (CREATURE_TYPES[type]) xpForDef += k * 10;
      }
    });
  });
  defResults.forEach(function (r, i) {
    var myTroops = Object.values(defenderContingents[i].troops || {}).reduce(function (a, n) { return a + (n || 0); }, 0);
    r.xp = (totalDefTroops > 0 && myTroops > 0) ? Math.round(xpForDef * myTroops / totalDefTroops) : 0;
  });

  return {
    winner, wallResisted, wallDestroyed: !wallResisted && wallLevel > 0,
    log, rounds: turn - 1,
    attackerResults: atkResults,
    defenderResults: defResults
  };
}

// ── FIX [MENOR-5]: dict de iconos completo (provisiones + esencia añadidos) ──
function generateBattlePvPReport(battleResult, wallLevel, loot, targetCoords) {
  var winner = battleResult.winner;
  var wallResisted = battleResult.wallResisted;
  var atkR = battleResult.attackerResults || [];
  var defR = battleResult.defenderResults || [];
  var totalAtkXP = 0, totalDefXP = 0;
  atkR.forEach(function (r) { totalAtkXP += (r.xp || 0); });
  defR.forEach(function (r) { totalDefXP += (r.xp || 0); });

  function troopTable(result) {
    var types = Object.keys(result.initial).filter(function (k) { return (result.initial[k] || 0) > 0; });
    if (!types.length) return '<div style="color:var(--dim);font-size:.75rem;">Sin tropas</div>';
    var hdr = types.map(function (k) {
      var t = TROOP_TYPES[k] || CREATURE_TYPES[k];
      return '<th style="text-align:center;padding:4px 8px;border:1px solid var(--border);font-size:.68rem;color:var(--text);">'
        + (t ? t.icon + '<br>' + t.name : k) + '</th>';
    }).join('');
    function row(lbl, clr, vals) {
      return '<tr><td style="padding:4px 8px;border:1px solid var(--border);color:' + clr + ';font-size:.68rem;white-space:nowrap;">' + lbl + '</td>'
        + types.map(function (k) {
          var v = vals[k] || 0;
          var c = v === 0 ? 'var(--dim)' : clr;
          return '<td style="text-align:center;padding:4px 8px;border:1px solid var(--border);color:' + c + ';">' + v + '</td>';
        }).join('') + '</tr>';
    }
    // Bug-5 fix: solo mostrar fila "SE RECUPERAN" si hay alguna recuperación real (wallResisted=true → recovered={})
    var hasRecovery = Object.keys(result.recovered || {}).some(function (k) { return (result.recovered[k] || 0) > 0; });
    return '<div style="overflow-x:auto;"><table style="border-collapse:collapse;font-size:.78rem;margin-bottom:4px;">'
      + '<thead><tr><th style="padding:4px 8px;border:1px solid var(--border);"></th>' + hdr + '</tr></thead><tbody>'
      + row('INICIALES', 'var(--text)', result.initial)
      + row('FINALES', 'var(--accent2)', result.survivors)
      + (hasRecovery ? row('SE RECUPERAN', 'var(--accent)', result.recovered) : '')
      + '</tbody></table></div>';
  }

  function pBlock(result, sideColor, chip) {
    return '<div style="background:var(--panel);border:1px solid var(--border);padding:12px 16px;margin-bottom:2px;">'
      + '<div style="font-family:VT323,monospace;font-size:1.05rem;color:#f0c040;margin-bottom:8px;">'
      + escapeHtml(result.name)
      + (result.village_name ? ' <span style="font-size:.62rem;color:var(--dim);background:var(--panel2);border:1px solid var(--border);padding:1px 5px;">' + escapeHtml(result.village_name) + '</span>' : '')
      + ' <span style="font-size:.6rem;padding:1px 6px;background:' + sideColor + '22;border:1px solid ' + sideColor + '55;color:' + sideColor + ';">' + chip + '</span>'
      + '</div>'
      + troopTable(result)
      + '<div style="font-size:.68rem;color:#f0c040;text-align:right;margin-top:4px;">⭐ Experiencia: ' + fmt(result.xp || 0) + '</div>'
      + '</div>';
  }

  var html = '<div style="font-family:Share Tech Mono,monospace;max-width:700px;">';
  html += '<div style="background:var(--panel);border:1px solid var(--border);border-top:3px solid var(--accent);padding:14px 18px;margin-bottom:2px;">'
    + '<div style="font-family:VT323,monospace;font-size:1.5rem;color:var(--accent);letter-spacing:2px;">⚔ INFORME DE BATALLA</div>'
    + '<div style="font-size:.68rem;color:var(--dim);margin-top:4px;">'
    + (targetCoords ? 'Objetivo: <span style="color:var(--text);">[' + targetCoords.x + ',' + targetCoords.y + ']</span> &nbsp;·&nbsp; ' : '')
    + (wallLevel > 0 ? 'Muralla nv.' + wallLevel + ' · <span style="color:' + (wallResisted ? 'var(--accent2)' : 'var(--danger)') + ';">' + (wallResisted ? 'resistió' : 'destruida') + '</span>' : 'Sin muralla')
    + '</div></div>';

  // Bug-3 fix: winner===0 (empate) tenía color rojo y texto "HA GANADO EL BANDO DEFENSOR"
  var bc = winner === 1 ? '#40c060' : winner === 0 ? '#a0a040' : '#e04040';
  var bt = winner === 1 ? '🏆 HA GANADO EL BANDO ATACANTE' : winner === 0 ? '⚖️ EMPATE' : '🛡️ HA GANADO EL BANDO DEFENSOR';
  html += '<div style="text-align:center;padding:12px;font-family:VT323,monospace;font-size:1.6rem;letter-spacing:3px;border:1px solid ' + bc + ';color:' + bc + ';background:' + bc + '11;margin-bottom:2px;">' + bt + '</div>';
  html += '<div style="font-family:VT323,monospace;font-size:1.2rem;letter-spacing:2px;padding:8px 16px;border-left:3px solid #e87030;background:linear-gradient(90deg,rgba(232,112,48,.14),transparent);color:#e87030;margin-bottom:2px;">⚔ ATACANTES</div>';
  atkR.forEach(function (r) { html += pBlock(r, '#e87030', 'ATACANTE'); });
  html += '<div style="font-family:VT323,monospace;font-size:1.2rem;letter-spacing:2px;padding:8px 16px;border-left:3px solid #4090e0;background:linear-gradient(90deg,rgba(64,144,224,.14),transparent);color:#4090e0;margin-bottom:2px;">🛡 DEFENSORES</div>';
  defR.forEach(function (r) { html += pBlock(r, '#4090e0', 'DEFENSOR'); });
  html += '<div style="background:var(--panel);border:1px solid var(--border);border-top:2px solid #f0c040;padding:14px 18px;margin-top:2px;">';
  html += '<div style="font-family:VT323,monospace;color:#f0c040;font-size:1rem;letter-spacing:1px;margin-bottom:10px;">📊 RESUMEN GLOBAL</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">'
    + '<div style="background:var(--panel2);border:1px solid var(--border);padding:8px 12px;"><div style="font-size:.62rem;color:var(--dim);">XP ATACANTES</div><div style="font-family:VT323,monospace;font-size:1.1rem;color:#40c060;">' + fmt(totalAtkXP) + '</div></div>'
    + '<div style="background:var(--panel2);border:1px solid var(--border);padding:8px 12px;"><div style="font-size:.62rem;color:var(--dim);">XP DEFENSORES</div><div style="font-family:VT323,monospace;font-size:1.1rem;color:#e04040;">' + fmt(totalDefXP) + '</div></div></div>';

  if (loot && Object.keys(loot).some(function (k) { return (loot[k] || 0) > 0; })) {
    // FIX [MENOR-5]: provisiones y esencia añadidos
    var icons = {
      madera: '🪵', piedra: '🪨', hierro: '⚙️', oro: '🥇',
      provisiones: '🌾', esencia: '✨'
    };
    html += '<div style="font-family:VT323,monospace;color:#f0c040;font-size:.85rem;margin-bottom:6px;">📦 MATERIAS ROBADAS</div><div style="display:flex;gap:6px;flex-wrap:wrap;">';
    Object.keys(loot).forEach(function (k) {
      if (!(loot[k] > 0)) return;
      html += '<div style="background:var(--panel2);border:1px solid var(--border);padding:6px 12px;display:flex;align-items:center;gap:6px;"><span>' + (icons[k] || '📦') + '</span><div><div style="font-family:VT323,monospace;color:#f0c040;">' + fmt(loot[k]) + '</div><div style="font-size:.62rem;color:var(--dim);">' + k.toUpperCase() + '</div></div></div>';
    });
    html += '</div>';
  }
  if (battleResult.log && battleResult.log.length) {
    html += '<div style="margin-top:10px;"><button onclick="toggleBattleLog(this)" style="width:100%;background:var(--panel2);border:1px solid var(--border);color:var(--text);padding:6px;cursor:pointer;font-size:.72rem;">Ver traza ▼</button>'
      + '<div style="display:none;margin-top:4px;background:var(--bg);border:1px solid var(--border);padding:8px;max-height:200px;overflow-y:auto;font-size:.62rem;font-family:monospace;color:var(--dim);">'
      + battleResult.log.map(function (l) { return escapeHtml(l); }).join('<br>') + '</div></div>';
  }
  html += '</div></div>';
  return html;
}

function isInTorreRange(tx, ty) {
  if (!activeVillage) return false;
  var villages = myVillages && myVillages.length > 0 ? myVillages : [activeVillage];
  for (var i = 0; i < villages.length; i++) {
    var v = villages[i];
    if (!v || !v.state) continue;
    var range = getTorreRange(v.state.buildings);
    if (range === 0) continue;
    var mx = v.x || 0, my = v.y || 0;
    if (Math.sqrt(Math.pow(tx - mx, 2) + Math.pow(ty - my, 2)) <= range) return true;
  }
  return false;
}

function defaultTroops() {
  var tr = {};
  Object.keys(TROOP_TYPES).forEach(function (k) { tr[k] = (k === 'aldeano' ? 50 : 0); });
  return tr;
}

function defaultCreatures() {
  var cr = {};
  Object.keys(CREATURE_TYPES).forEach(function (k) { cr[k] = 0; });
  if (!cr.arana_gigante) cr.arana_gigante = 0; // Garantizar consistencia
  return cr;
}

// ── FIX [MEDIO-4]: consumeAldeanos — guard explícito ────────────────────────
// troops.aldeano se modifica aquí para uso local (provisiones, fundación, etc.)
// REGLA: save_village_client DEBE blindar troops.aldeano en servidor.
// Si en algún momento save_village_client deja de aceptar troops, este write
// quedará solo en cliente y el servidor lo sobreescribirá en el siguiente tick.
// Mientras save_village_client persiste troops correctamente, esto es seguro.
function consumeAldeanos(vs, amount) {
  if (!vs.troops) vs.troops = {};
  var total = vs.troops.aldeano || 0;
  if (amount > total) amount = total;
  var assigned = vs.aldeanos_assigned || defaultAssignments();
  var totalAssigned = (assigned.madera || 0) + (assigned.piedra || 0) + (assigned.hierro || 0)
    + (assigned.provisiones || 0) + (assigned.esencia || 0);
  var libres = Math.max(0, total - totalAssigned);
  vs.troops.aldeano = Math.max(0, total - amount);
  if (amount <= libres) return;
  var deficit = amount - libres;
  var keys = ['madera', 'piedra', 'hierro', 'provisiones', 'esencia'];
  if (totalAssigned > 0) {
    keys.forEach(function (k) {
      var prop = (assigned[k] || 0) / totalAssigned;
      var quitar = Math.round(deficit * prop);
      assigned[k] = Math.max(0, (assigned[k] || 0) - quitar);
    });
    var newTotal = keys.reduce(function (s, k) { return s + (assigned[k] || 0); }, 0);
    var diff = (totalAssigned - deficit) - newTotal;
    for (var i = 0; i < keys.length && diff !== 0; i++) {
      if (assigned[keys[i]] > 0 && diff < 0) { assigned[keys[i]]--; diff++; }
      else if (diff > 0) { assigned[keys[i]]++; diff--; }
    }
  }
  vs.aldeanos_assigned = assigned;
}

function defaultAssignments() {
  return { madera: 0, piedra: 0, hierro: 0, provisiones: 0, esencia: 0 };
}

// ── v1.44: velocidad en cas/h — MISSION_FACTOR actualizado ──
// formula: segundos_viaje = (distancia / velocidad_cas_h) * 3600
const MISSION_FACTOR = 3600; // segundos por casilla a velocidad 1 (vel en cas/h)

function getTroopLevel(troopType) {
  var levels = (typeof _researchData !== 'undefined' && _researchData && _researchData.troop_levels) || {};
  return levels[troopType] || 1;
}

// ── FIX [CRÍTICO-2 + MENOR-11/12]: cancelSummoningQueue usa RPC ──────────────
// El servidor valida propiedad, suma esencia y limpia cola en una transacción.
// Tras RPC exitoso: actualiza esencia local desde respuesta del servidor,
// luego llama loadMyVillages()+tick() para resync completo de estado.
async function cancelSummoningQueue() {
  if (!activeVillage) return;
  var vs = activeVillage.state;
  if (!vs.summoning_queue || vs.summoning_queue.length === 0) {
    showNotif('No hay invocaciones en cola.', 'err'); return;
  }

  const { data, error } = await sbClient.rpc('cancel_summoning_secure', {
    p_village_id: activeVillage.id
  });

  if (error) {
    showNotif('Error al cancelar: ' + error.message, 'err'); return;
  }
  // Bug-11 fix: null-guard antes de data.ok — RPC puede devolver data:null
  if (!data || !data.ok) {
    showNotif((data && data.error) || 'No se pudo cancelar.', 'err'); return;
  }

  // Actualizar esencia local desde la respuesta del servidor (patch optimista)
  // NOTA: este write local es provisional — loadMyVillages()+tick() a continuación
  // sobreescribe con el estado autoritativo del servidor.
  vs.summoning_queue = [];
  vs.resources.esencia = (vs.resources.esencia || 0) + (data.refunded_esencia || 0);

  showNotif('Cola cancelada. +' + fmt(data.refunded_esencia || 0) + ' ✨ esencia devuelta.', 'ok');
  await flushVillage(); // v1.82: persiste summoning_queue=[] inmediatamente
  // Bug-12 fix: resync completo igual que cancelMission/cancelAlliedMission
  await loadMyVillages();
  tick();
}

function getCreatureLevel(creatureType) {
  var torreLevel = (activeVillage && activeVillage.state && activeVillage.state.buildings &&
    activeVillage.state.buildings.torreinvocacion &&
    activeVillage.state.buildings.torreinvocacion.level) || 0;
  return Math.max(1, torreLevel);
}

function canSummon(creatureType, vs) {
  var cData = CREATURE_TYPES[creatureType];
  if (!cData) return { ok: false, reason: 'Criatura no válida' };
  var torreLevel = (vs.buildings.torreinvocacion && vs.buildings.torreinvocacion.level) || 0;
  if (torreLevel === 0) return { ok: false, reason: 'Necesitas construir la Torre de Invocación' };
  var invocadorLevel = getTroopLevel('invocador');
  if (invocadorLevel < cData.tier) return { ok: false, reason: 'Invocadores nivel ' + cData.tier + ' requeridos (tienes nivel ' + invocadorLevel + ')' };
  var invEnRefugio = (vs.refugio && vs.refugio.invocador) || 0;
  var invocadoresActuales = Math.max(0, (vs.troops.invocador || 0) - invEnRefugio);
  if (invocadoresActuales < cData.summonersNeeded) return { ok: false, reason: 'Necesitas ' + cData.summonersNeeded + ' invocadores disponibles (tienes ' + invocadoresActuales + ')' };
  if ((vs.resources.esencia || 0) < cData.cost.esencia) return { ok: false, reason: 'Esencia insuficiente' };
  return { ok: true };
}

// ── FIX [CRÍTICO-1 + MENOR-6 + MENOR-11/13]: startSummoning* reescritas con RPC ─
// Las versiones anteriores descontaban esencia directo en cliente.
// Ahora delegan a start_summoning_secure (igual que startRecruitment en game-troops.js).
// Estas funciones quedan aquí para compatibilidad con llamadas existentes;
// cuando game-troops.js las redefina más abajo en la carga de página,
// las versiones de troops.js (idénticas) prevalecerán — sin conflicto.
async function startSummoningFromInput(creatureType) {
  var input = document.getElementById('summonQty_' + creatureType);
  var amount = input ? (parseInt(input.value) || 1) : 1;
  if (amount < 1) amount = 1;
  await startSummoning(creatureType, amount);
}

async function startSummoning(creatureType, amount) {
  if (!activeVillage) return;
  var cData = CREATURE_TYPES[creatureType];
  if (!cData) return;
  if (!amount || amount < 1) amount = 1;

  const { data, error } = await sbClient.rpc('start_summoning_secure', {
    p_village_id: activeVillage.id,
    p_creature_key: creatureType,
    p_amount: amount
  });

  if (error) {
    showNotif('Error: ' + error.message, 'err'); return;
  }
  // Bug-11 fix: null-guard antes de data.ok — RPC puede devolver data:null
  if (!data || !data.ok) {
    showNotif((data && data.error) || 'No se pudo invocar.', 'err'); return;
  }

  // Aplicar estado devuelto por el servidor
  if (data.state) {
    activeVillage.state = data.state;
  }
  if (data.summoning_queue !== undefined) {
    activeVillage.state.summoning_queue = data.summoning_queue;
  }

  showNotif(amount + ' ' + cData.name + '(s) en cola de invocación', 'ok');
  if (typeof renderCreatures === 'function') renderCreatures();
  // Bug-13 fix: tick() necesario para actualizar recursos, provisiones y resto de UI
  if (typeof tick === 'function') tick();
}

var _notifyOnceThrottle = {};
function _notifyOnce(key, msg, type, intervalMs) {
  intervalMs = intervalMs || 4000;
  var now = Date.now();
  if (_notifyOnceThrottle[key] && (now - _notifyOnceThrottle[key]) < intervalMs) return;
  _notifyOnceThrottle[key] = now;
  showNotif(msg, type);
}
