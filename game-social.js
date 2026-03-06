// ============================================================
// EPIC WARRIORS — game-social.js
// Ranking: rankingCache, renderRanking, forceRefreshRanking
// Investigación: xpCostForLevel, loadResearchData, renderResearch
// Alianzas: refreshMyAlliance, createAlliance, leaveAlliance...
// Mensajes: renderThreads, openThread, sendChatMsg, startDM...
// ============================================================

let rankingCache = null;       // {data, fetchedAt}
const RANKING_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

async function renderRanking() {
  if (!(await ensureLogged())) return;
  const box = document.getElementById('rankingBox');

  const now = Date.now();
  if (rankingCache && (now - rankingCache.fetchedAt) < RANKING_TTL_MS) {
    renderRankingRows(box, rankingCache.data, rankingCache.fetchedAt);
    return;
  }

  box.innerHTML = '<div class="muted">Actualizando ranking…</div>';

  let rows = null;

  const v = await sbClient.from('ranking')
    .select('username, military_score, alliance_tag')
    .order('military_score', { ascending: false })
    .limit(200);

  if (!v.error && v.data && v.data.length > 0) {
    rows = v.data;
  } else {
    // Fallback: Si la vista ranking fallara, usamos profiles directamente
    const p = await sbClient.from('profiles')
      .select('username, military_score, alliance_tag')
      .order('military_score', { ascending: false })
      .limit(200);
    if (p.error || !p.data) {
      box.innerHTML = '<div class="muted">Error cargando ranking.</div>';
      return;
    }
    rows = p.data;
  }

  rankingCache = { data: rows, fetchedAt: Date.now() };
  renderRankingRows(box, rows, rankingCache.fetchedAt);
}

function renderRankingRows(box, rows, fetchedAt) {
  if (!rows || rows.length === 0) { box.innerHTML = '<div class="muted">Aún no hay datos.</div>'; return; }

  const myUsername = document.getElementById('ovUser') ? document.getElementById('ovUser').textContent : '';
  const nextUpdate = new Date(fetchedAt + RANKING_TTL_MS);
  const nextStr = nextUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  let html = '<div style="font-size:.6rem;color:var(--dim);margin-bottom:8px;">⏱ Próxima actualización: ~' + nextStr + ' (cada 6h) &nbsp;·&nbsp; 1 tropa = 1 punto militar</div>';
  var podiumBg = ['rgba(255,215,0,.07)', 'rgba(192,192,192,.05)', 'rgba(205,127,50,.05)'];
  html += '<div class="table"><div class="trow thead"><div>#</div><div>Jugador</div><div>Alianza</div><div style="text-align:right;">⚔️ Puntos</div></div>';

  rows.forEach((r, i) => {
    const isMe = r.username === myUsername;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    const isPodium = i < 3;
    var rowStyle = isMe
      ? 'background:rgba(240,192,64,.09);border-color:rgba(240,192,64,.3);'
      : (isPodium ? 'background:' + podiumBg[i] + ';' : '');
    var allianceCell = r.alliance_tag
      ? '<span style="background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.18);border-radius:3px;padding:1px 5px;color:var(--accent);font-size:.65rem;">' + escapeHtml(r.alliance_tag) + '</span>'
      : '<span style="color:var(--dim);">—</span>';
    html += '<div class="trow" style="' + rowStyle + '">'
      + '<div style="font-family:VT323,monospace;font-size:' + (isPodium ? '1.1rem' : '.85rem') + ';">' + medal + '</div>'
      + '<div style="' + (isMe ? 'color:var(--gold);font-weight:bold;' : '') + '">' + escapeHtml(r.username || '-') + (isMe ? ' ◀' : '') + '</div>'
      + '<div>' + allianceCell + '</div>'
      + '<div style="text-align:right;color:' + (isMe ? 'var(--gold)' : 'var(--accent)') + ';font-family:VT323,monospace;">' + fmt(Number(r.military_score || 0)) + '</div>'
      + '</div>';
  });
  html += '</div>';
  box.innerHTML = html;
}

function forceRefreshRanking() {
  rankingCache = null;
  renderRanking();
}

// ================================================================
// CENTRO DE INVESTIGACIÓN
// ================================================================

function xpCostForLevel(currentLvl) {
  if (currentLvl < 1 || currentLvl >= 30) return Infinity;
  var base = 10000;
  var step = Math.round((30000000 - 10000) / 28);
  var raw = base + (currentLvl - 1) * step;
  if (raw >= 1000000) return Math.round(raw / 100000) * 100000;
  if (raw >= 100000) return Math.round(raw / 10000) * 10000;
  return Math.round(raw / 1000) * 1000;
}

function getTroopStatsAtLevel(troopKey, lvl) {
  var base = TROOP_TYPES[troopKey];
  if (!base) return null;
  var mult = 1 + (lvl - 1) * 0.08;
  var spikes = Math.floor(lvl / 5);
  mult += spikes * 0.10;
  return {
    hp: Math.round(base.hp * mult),
    damage: Math.round(base.damage * mult),
    defense: Math.round(base.defense * mult),
    attackChance: Math.min(95, base.attackChance + Math.floor((lvl - 1) * 0.5))
  };
}

var _researchData = null;

async function loadResearchData(forceReload) {
  if (_researchData && !forceReload) return _researchData;
  try {
    var { data, error } = await sbClient
      .from('profiles')
      .select('experience, troop_levels, weapon_levels, armor_levels')
      .eq('id', currentUser.id)
      .single();
    if (error) throw error;
    _researchData = {
      experience: data.experience || 0,
      troop_levels: data.troop_levels || {},
      weapon_levels: data.weapon_levels || {},
      armor_levels: data.armor_levels || {}
    };
  } catch (e) {
    console.warn('loadResearchData error:', e);
    _researchData = { experience: 0, troop_levels: {}, weapon_levels: {}, armor_levels: {} };
  }
  return _researchData;
}

// FIX [MENOR-6]: en vez de sumar sobre el cache local (que puede estar stale
// tras múltiples combates rápidos), recargar el XP real desde DB.
// Se mantiene el parámetro 'amount' para compatibilidad con las llamadas existentes,
// pero el valor mostrado siempre refleja el estado real del servidor.
async function updateXPDisplay(amount) {
  try {
    var fresh = await loadResearchData(true);  // forceReload = true
    var xp = fresh.experience;
    var el1 = document.getElementById('ovExperience');
    if (el1) el1.textContent = formatNumber(xp);
    var el2 = document.getElementById('researchXPDisplay');
    if (el2) el2.textContent = formatNumber(xp) + ' XP';
  } catch (e) {
    // Fallback silencioso: si falla la recarga, al menos mostrar el cache + amount
    if (!_researchData) return;
    _researchData.experience = (_researchData.experience || 0) + (amount || 0);
    var xp = _researchData.experience;
    var el1 = document.getElementById('ovExperience');
    if (el1) el1.textContent = formatNumber(xp);
    var el2 = document.getElementById('researchXPDisplay');
    if (el2) el2.textContent = formatNumber(xp) + ' XP';
  }
}

async function renderResearch() {
  var rd = await loadResearchData(true);
  var xpEl = document.getElementById('researchXPDisplay');
  if (xpEl) xpEl.textContent = formatNumber(rd.experience) + ' XP';

  var grid = document.getElementById('researchTroopGrid');
  if (!grid) return;

  var troopKeys = ['aldeano', 'soldado', 'mago', 'druida', 'explorador', 'asesino', 'paladin', 'chaman'];
  var html = '';

  troopKeys.forEach(function (key) {
    var tDef = TROOP_TYPES[key];
    if (!tDef) return;
    var curLvl = rd.troop_levels[key] || 1;
    var isMax = curLvl >= 30;
    var cost = xpCostForLevel(curLvl);
    var canAfford = !isMax && rd.experience >= cost;
    var stats = getTroopStatsAtLevel(key, curLvl);
    var statsNext = isMax ? null : getTroopStatsAtLevel(key, curLvl + 1);

    var lvlPct = Math.round(curLvl / 30 * 100);
    var lvlColor = isMax ? 'var(--gold)' : curLvl >= 20 ? 'var(--ok)' : curLvl >= 10 ? 'var(--accent)' : 'var(--dim)';

    html += '<div style="background:var(--bg2);border-radius:8px;padding:12px;">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">';
    html += '<span style="font-size:2rem;">' + tDef.icon + '</span>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-family:VT323,monospace;font-size:1rem;color:var(--text);">' + tDef.name.toUpperCase() + '</div>';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-top:3px;">';
    html += '<div style="flex:1;height:4px;background:rgba(255,255,255,.07);border-radius:2px;">';
    html += '<div style="height:4px;width:' + lvlPct + '%;background:' + lvlColor + ';border-radius:2px;transition:width .4s;"></div>';
    html += '</div>';
    html += '<span style="font-size:.62rem;color:' + lvlColor + ';font-family:VT323,monospace;white-space:nowrap;">Nv.' + curLvl + '/30' + (isMax ? ' ★' : '') + '</span>';
    html += '</div>';
    html += '</div>';
    html += '<div style="text-align:right;flex-shrink:0;">';
    if (!isMax) {
      html += '<div style="font-size:.62rem;color:' + (canAfford ? 'var(--gold)' : 'var(--dim)') + ';margin-bottom:4px;">' + formatNumber(cost) + ' XP</div>';
      html += '<button class="btn btn-sm" style="' + (!canAfford ? 'opacity:.4;cursor:not-allowed;' : '') + '"'
        + (canAfford ? ' onclick="upgradeTroopLevel(\'' + key + '\')"' : '')
        + '>⬆ Subir</button>';
    } else {
      html += '<div style="font-size:.75rem;color:var(--gold);">✨ Maestría</div>';
    }
    html += '</div>';
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;font-size:.72rem;">';
    html += '<div style="grid-column:1/-1;font-size:.6rem;color:var(--dim);letter-spacing:.12em;opacity:.7;padding:3px 0 4px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:3px;">OFENSA</div>';
    function statRow(icon, label, cur, nxt) {
      var diff = nxt ? (nxt - cur > 0 ? ' <span style="color:var(--ok);">+' + (nxt - cur) + '</span>' : '') : '';
      return '<div style="color:var(--dim);padding:2px 0;">' + icon + ' ' + label + '</div>'
        + '<div style="color:var(--text);padding:2px 0;font-family:VT323,monospace;">' + cur + diff + '</div>';
    }
    html += statRow('⚔️', 'Daño', stats.damage, statsNext && statsNext.damage);
    html += statRow('🎯', 'Prob. Golpe', stats.attackChance, statsNext && statsNext.attackChance);
    html += '<div style="grid-column:1/-1;font-size:.6rem;color:var(--dim);letter-spacing:.12em;opacity:.7;padding:5px 0 4px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:3px;">DEFENSA</div>';
    html += statRow('❤️', 'HP', stats.hp, statsNext && statsNext.hp);
    html += statRow('🛡️', 'Defensa', stats.defense, statsNext && statsNext.defense);
    html += '</div>';
    html += '</div>';
  });

  grid.innerHTML = html;
}

// FIX [CRÍTICO-1]: upgrade_troop_level_secure valida XP en servidor y escribe
// experience + troop_levels en una sola transacción atómica.
// Antes: valores calculados en cliente → UPDATE directo → explotable con _researchData.experience = 9999999
async function upgradeTroopLevel(troopKey) {
  if (!currentUser) return;

  // Validación UI rápida (no de seguridad — el servidor revalida todo)
  var rd = await loadResearchData(false);
  var curLvl = rd.troop_levels[troopKey] || 1;
  if (curLvl >= 30) return;
  var cost = xpCostForLevel(curLvl);
  if (rd.experience < cost) { alert('No tienes suficiente XP.'); return; }

  try {
    var { data, error } = await sbClient.rpc('upgrade_troop_level_secure', {
      p_troop_key: troopKey
    });
    if (error) throw error;
    if (!data.ok) {
      var msgs = {
        'not_authenticated': 'No autenticado.',
        'profile_not_found': 'Perfil no encontrado.',
        'already_max_level': 'Ya está al nivel máximo.',
        'insufficient_xp':  'No tienes suficiente XP.'
      };
      alert(msgs[data.error] || ('Error: ' + data.error));
      return;
    }

    // Aplicar estado devuelto por el servidor
    _researchData.experience    = data.new_xp;
    _researchData.troop_levels  = Object.assign({}, rd.troop_levels, { [troopKey]: data.new_level });

    var xpEl = document.getElementById('ovExperience');
    if (xpEl) xpEl.textContent = formatNumber(data.new_xp);

    await renderResearch();
    var tDef = TROOP_TYPES[troopKey];
    _showToast('✅ ' + (tDef ? tDef.icon + ' ' + tDef.name : troopKey) + ' subido a nivel ' + data.new_level + '!');
  } catch (e) {
    console.error('upgradeTroopLevel error:', e);
    alert('Error al subir nivel: ' + e.message);
  }
}

function _showToast(msg) {
  var t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;font-size:.85rem;box-shadow:0 2px 12px #0008;pointer-events:none;';
  document.body.appendChild(t);
  setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .5s'; setTimeout(function () { t.remove(); }, 500); }, 2500);
}

// ================================================================
// ALIANZAS
// ================================================================

var _myAllianceId = null;
var _myAllianceRole = null;
var _myAllianceStatus = null;

function _alHideAll() {
  ['alNoAlliancePanel', 'alMemberPanel', 'alLeaderPanel', 'alPendingPanel'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function _alUpdateOverview(tag, name) {
  window._playerAllianceTag = tag || null;
  window._playerAllianceName = name || null;
  var el = document.getElementById('ovAlliance');
  if (el) {
    el.textContent = tag ? '[' + tag + '] ' + (name || '') : '';
  }
}

async function refreshMyAlliance() {
  if (!(await ensureLogged())) return;
  const box = document.getElementById('myAllianceBox');
  if (box) box.innerHTML = '<span class="muted">Cargando…</span>';

  const r = await sbClient.from('alliance_members')
    .select('status,role,alliance_id')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (r.error) {
    console.warn('alliance_members error:', r.error.message);
    if (box) box.innerHTML = '<span class="muted">No se pudo cargar alianza. <a href="#" onclick="refreshMyAlliance();return false;">Reintentar</a></span>';
    _alHideAll();
    var p = document.getElementById('alNoAlliancePanel');
    if (p) p.style.display = '';
    return;
  }

  const row = (r.data || []).find(x => x.status === 'active' || x.status === 'invited' || x.status === 'pending');

  _alHideAll();
  _myAllianceId = null;
  _myAllianceRole = null;
  _myAllianceStatus = null;

  if (!row) {
    if (box) box.innerHTML = '<span class="muted">No perteneces a ninguna alianza.</span>';
    _alUpdateOverview(null, null);
    var p = document.getElementById('alNoAlliancePanel');
    if (p) { p.style.display = ''; _loadAllianceList(); }
    return;
  }

  _myAllianceId = row.alliance_id;
  _myAllianceRole = row.role;
  _myAllianceStatus = row.status;

  const ar = await sbClient.from('alliances')
    .select('id,name,tag')
    .eq('id', row.alliance_id)
    .maybeSingle();

  var al = (ar.data) || { id: row.alliance_id, name: 'Alianza', tag: '???' };

  if (box) {
    box.innerHTML = '<b style="color:var(--accent)">[' + escapeHtml(al.tag || '') + '] ' + escapeHtml(al.name || '') + '</b>'
      + ' <span class="muted">&nbsp;&middot; Estado: ' + escapeHtml(row.status) + ' &middot; Rol: ' + escapeHtml(row.role) + '</span>';
  }

  if (row.status === 'pending' || row.status === 'invited') {
    _alUpdateOverview(null, null);
    var pp = document.getElementById('alPendingPanel');
    if (pp) pp.style.display = '';
    var sb = document.getElementById('alPendingStatusBox');
    var acts = document.getElementById('alPendingActions');
    if (sb) {
      sb.innerHTML = row.status === 'invited'
        ? '&#x1F4E8; Has sido <b>invitado</b> a <b>[' + escapeHtml(al.tag) + '] ' + escapeHtml(al.name) + '</b>. ¿Aceptas?'
        : '&#x23F3; Tu solicitud para unirte a <b>[' + escapeHtml(al.tag) + '] ' + escapeHtml(al.name) + '</b> está <b>pendiente de aprobación</b>.';
    }
    if (acts) {
      acts.innerHTML = row.status === 'invited'
        ? '<button class="btn" onclick="acceptInvite()">&#x2714; Aceptar invitación</button>'
        + '<button class="btn" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" onclick="declineOrCancel()">&#x2715; Rechazar</button>'
        : '<button class="btn" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" onclick="declineOrCancel()">&#x2715; Cancelar solicitud</button>';
    }
    return;
  }

  _alUpdateOverview(al.tag, al.name);
  loadAllyUserIds();

  if (row.role === 'leader') {
    var lp = document.getElementById('alLeaderPanel');
    if (lp) lp.style.display = '';
    _loadLeaderData(row.alliance_id);
  } else {
    var mp = document.getElementById('alMemberPanel');
    if (mp) mp.style.display = '';
    _loadMembersList(row.alliance_id, false);
    _loadAllianceAnnouncement(row.alliance_id);
  }
}

async function _loadAllianceList() {
  const box = document.getElementById('alliancesBox');
  if (!box) return;
  box.innerHTML = '<span class="muted">Cargando…</span>';

  const r = await sbClient.from('alliances')
    .select('id,name,tag,created_at')
    .order('name')
    .limit(100);

  if (r.error) { box.innerHTML = '<span class="muted">Error: ' + escapeHtml(r.error.message) + '</span>'; return; }
  if (!r.data || r.data.length === 0) { box.innerHTML = '<span class="muted">No hay alianzas aún. ¡Sé el primero en crear una!</span>'; return; }

  // Contar miembros activos
  var mr = await sbClient.from('alliance_members').select('alliance_id').eq('status', 'active');
  var memberCounts = {};
  if (!mr.error && mr.data) {
    mr.data.forEach(function (m) { memberCounts[m.alliance_id] = (memberCounts[m.alliance_id] || 0) + 1; });
  }

  let html = '<div class="table"><div class="trow thead"><div>TAG</div><div>Nombre</div><div style="text-align:center">👥</div><div style="text-align:right;"></div></div>';
  r.data.forEach(function (al) {
    var count = memberCounts[al.id] || 0;
    var tagPill = '<span style="background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.2);border-radius:3px;padding:1px 6px;color:var(--accent);font-family:VT323,monospace;font-size:.75rem;">' + escapeHtml(al.tag) + '</span>';
    html += '<div class="trow">'
      + '<div>' + tagPill + '</div>'
      + '<div style="color:var(--text);">' + escapeHtml(al.name) + '</div>'
      + '<div style="text-align:center;color:var(--dim);font-size:.8rem;">' + count + '</div>'
      + '<div style="text-align:right;"><button class="btn btn-sm" onclick="requestJoinAlliance(' + al.id + ', \'' + escapeHtml(al.name) + '\')">Solicitar</button></div>'
      + '</div>';
  });
  html += '</div>';
  box.innerHTML = html;
}

async function _loadMembersList(allianceId, isLeader) {
  var boxId = isLeader ? 'alLeaderMembersList' : 'alMembersList';
  const box = document.getElementById(boxId);
  if (!box) return;
  box.innerHTML = '<span class="muted">Cargando…</span>';

  const r = await sbClient.from('alliance_members')
    .select('user_id,role,status,profiles(username)')
    .eq('alliance_id', allianceId)
    .eq('status', 'active')
    .order('role'); // leaders first

  if (r.error) { box.innerHTML = '<span class="muted">Error.</span>'; return; }
  if (!r.data || r.data.length === 0) { box.innerHTML = '<span class="muted">Sin miembros activos.</span>'; return; }

  // Intentar cargar puntuación militar para mostrar en la lista
  var scoreMap = {};
  try {
    var userIds = r.data.map(function (m) { return m.user_id; });
    var rankR = await sbClient.from('ranking')
      .select('user_id,military_score')
      .in('user_id', userIds);
    if (!rankR.error && rankR.data) {
      rankR.data.forEach(function (row) { scoreMap[row.user_id] = row.military_score || 0; });
    }
  } catch (e) { /* ranking opcional */ }

  var total = r.data.length;
  var leaders = r.data.filter(function (m) { return m.role === 'leader'; }).length;

  let html = '<div style="font-size:.62rem;color:var(--dim);margin-bottom:8px;">'
    + total + ' miembro' + (total !== 1 ? 's' : '') + ' activo' + (total !== 1 ? 's' : '')
    + ' · ' + leaders + ' líder' + (leaders !== 1 ? 'es' : '')
    + '</div>';

  html += '<div class="table"><div class="trow thead"><div>Jugador</div><div>Rol</div>'
    + '<div style="text-align:right;">⚔️ Score</div>'
    + (isLeader ? '<div></div>' : '')
    + '</div>';

  r.data.forEach(function (m) {
    var uname = (m.profiles && m.profiles.username) ? escapeHtml(m.profiles.username) : m.user_id.slice(0, 8);
    var isMe = m.user_id === currentUser.id;
    var isLeaderRole = m.role === 'leader';
    var score = scoreMap[m.user_id] || 0;

    var roleBadge = isLeaderRole
      ? '<span style="font-size:.62rem;background:rgba(240,192,64,.12);border:1px solid rgba(240,192,64,.3);border-radius:3px;padding:1px 5px;color:var(--gold);">👑 Líder</span>'
      : '<span style="font-size:.62rem;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:3px;padding:1px 5px;color:var(--dim);">Miembro</span>';

    html += '<div class="trow" style="' + (isMe ? 'background:rgba(0,212,255,.04);' : '') + '">'
      + '<div>' + uname + (isMe ? ' <span style="color:var(--accent);font-size:.62rem;">◀ tú</span>' : '') + '</div>'
      + '<div>' + roleBadge + '</div>'
      + '<div style="text-align:right;font-family:VT323,monospace;font-size:.85rem;color:var(--accent);">' + fmt(score) + '</div>';

    if (isLeader && !isMe && !isLeaderRole) {
      html += '<div style="display:flex;gap:4px;">'
        + '<button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" '
        + 'onclick="kickMember(\'' + m.user_id + '\',\'' + uname + '\')">✕ Expulsar</button>'
        + '</div>';
    } else if (isLeader) {
      html += '<div></div>';
    }
    html += '</div>';
  });
  html += '</div>';

  // Si es líder, inyectar el panel de controles de liderazgo a continuación
  if (isLeader) {
    html += '<div id="alLeaderControlPanel"></div>';
  }

  box.innerHTML = html;

  // Poblar el panel de controles tras renderizar
  if (isLeader) {
    await _loadLeaderControlPanel(_myAllianceId);
  }
}

async function _loadPendingRequests(allianceId) {
  const box = document.getElementById('alPendingList');
  if (!box) return;
  box.innerHTML = '<span class="muted">Cargando…</span>';
  const r = await sbClient.from('alliance_members')
    .select('user_id,status,profiles(username)')
    .eq('alliance_id', allianceId)
    .in('status', ['pending', 'invited']);
  if (r.error) { box.innerHTML = '<span class="muted">Error.</span>'; return; }
  if (!r.data || r.data.length === 0) { box.innerHTML = '<span class="muted">Sin solicitudes pendientes.</span>'; return; }
  let html = '<div class="table"><div class="trow thead"><div>Jugador</div><div>Estado</div><div></div></div>';
  r.data.forEach(m => {
    var uname = (m.profiles && m.profiles.username) ? escapeHtml(m.profiles.username) : m.user_id.slice(0, 8);
    var isPending = m.status === 'pending';
    var statusBadge = isPending
      ? '<span style="font-size:.62rem;background:rgba(240,192,64,.1);border:1px solid rgba(240,192,64,.25);border-radius:3px;padding:1px 5px;color:var(--gold);">⏳ Solicitud</span>'
      : '<span style="font-size:.62rem;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.2);border-radius:3px;padding:1px 5px;color:var(--accent);">✉ Invitado</span>';
    html += '<div class="trow"><div>' + uname + '</div><div>' + statusBadge + '</div><div style="display:flex;gap:4px;">';
    if (isPending) {
      html += '<button class="btn btn-sm" onclick="acceptMember(\'' + m.user_id + '\', \'' + uname + '\')">&#x2714; Aceptar</button>'
        + '<button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" onclick="rejectMember(\'' + m.user_id + '\', \'' + uname + '\')">&#x2715; Rechazar</button>';
    } else {
      html += '<button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" onclick="rejectMember(\'' + m.user_id + '\', \'' + uname + '\')">&#x2715; Cancelar</button>';
    }
    html += '</div></div>';
  });
  html += '</div>';
  box.innerHTML = html;
}

async function _loadLeaderData(allianceId) {
  await Promise.all([
    _loadMembersList(allianceId, true),
    _loadPendingRequests(allianceId),
    _loadAllianceAnnouncement(allianceId),
    _loadLeaderControlPanel(allianceId)
  ]);
}

// Panel de controles exclusivos del líder: transferencia y disolución
async function _loadLeaderControlPanel(allianceId) {
  var box = document.getElementById('alLeaderControlPanel');
  if (!box) return; // el HTML no tiene este elemento aún, se inyecta dinámicamente

  box.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-top:12px;">
      <div style="font-size:.62rem;color:var(--dim);letter-spacing:.12em;margin-bottom:10px;">🔧 CONTROLES DE LIDERAZGO</div>

      <div style="margin-bottom:12px;">
        <div style="font-size:.72rem;color:var(--text);margin-bottom:6px;">🔄 Transferir liderazgo</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <input id="alTransferUser" type="text" placeholder="Nombre de miembro activo"
            style="flex:1;min-width:140px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:.78rem;outline:none;">
          <button class="btn btn-sm" onclick="transferLeadership()">Transferir</button>
        </div>
        <div id="alTransferMsg" style="font-size:.68rem;margin-top:4px;min-height:14px;"></div>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,.06);padding-top:12px;">
        <div style="font-size:.72rem;color:var(--danger);margin-bottom:6px;">⚠️ Zona de peligro</div>
        <button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);"
          onclick="dissolveAlliance()">💀 Disolver alianza</button>
        <div style="font-size:.6rem;color:var(--dim);margin-top:4px;">Expulsará a todos los miembros. Irreversible.</div>
      </div>
    </div>`;
}

async function renderAllianceRanking() {
  var box = document.getElementById('allianceRankingBox');
  if (!box) return;
  box.innerHTML = '<span class="muted">Cargando…</span>';

  var rows = rankingCache ? rankingCache.data : null;
  if (!rows) {
    var v = await sbClient.from('ranking')
      .select('username, military_score, alliance_tag')
      .order('military_score', { ascending: false })
      .limit(500);
    rows = (!v.error && v.data && v.data.length > 0) ? v.data : [];
  }

  var alMap = {};
  rows.forEach(function (r) {
    if (!r.alliance_tag) return;
    if (!alMap[r.alliance_tag]) alMap[r.alliance_tag] = { tag: r.alliance_tag, score: 0, members: 0 };
    alMap[r.alliance_tag].score += (r.military_score || 0);
    alMap[r.alliance_tag].members++;
  });

  var sorted = Object.values(alMap).sort(function (a, b) { return b.score - a.score; });

  if (sorted.length === 0) {
    box.innerHTML = '<span class="muted">Sin alianzas con puntuación aún.</span>';
    return;
  }

  var alPodiumBg = ['rgba(255,215,0,.07)', 'rgba(192,192,192,.05)', 'rgba(205,127,50,.05)'];
  var html = '<div class="table"><div class="trow thead"><div>#</div><div>Alianza</div><div>Miembros</div><div style="text-align:right;">⚔️ Puntos</div></div>';
  sorted.forEach(function (al, i) {
    var isMyAl = window._playerAllianceTag && window._playerAllianceTag === al.tag;
    var isPodium = i < 3;
    var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    var rowStyle = isMyAl
      ? 'background:rgba(0,212,255,.07);border-color:rgba(0,212,255,.2);'
      : (isPodium ? 'background:' + alPodiumBg[i] + ';' : '');
    var tagColor = isMyAl ? 'var(--accent)' : 'var(--text)';
    html += '<div class="trow" style="' + rowStyle + '">'
      + '<div style="font-family:VT323,monospace;font-size:' + (isPodium ? '1.1rem' : '.85rem') + ';">' + medal + '</div>'
      + '<div><span style="background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.18);border-radius:3px;padding:1px 6px;color:' + tagColor + ';font-family:VT323,monospace;font-size:.75rem;">' + escapeHtml(al.tag) + '</span></div>'
      + '<div style="color:var(--dim);font-size:.78rem;">' + al.members + '</div>'
      + '<div style="text-align:right;color:var(--ok);font-family:VT323,monospace;">' + fmt(al.score) + '</div>'
      + '</div>';
  });
  html += '</div>';
  box.innerHTML = html;
}

async function renderAlliances() {
  await refreshMyAlliance();
  renderAllianceRanking();
}

async function saveAllianceAnnouncement() {
  if (_myAllianceRole !== 'leader') { showNotif('Solo el líder puede editar el anuncio.', 'err'); return; }
  var msg = document.getElementById('alAnnouncementMsg');
  var text = (document.getElementById('alAnnouncementInput').value || '').trim().slice(0, 500);
  msg.textContent = '';
  var r = await sbClient.from('alliances').update({ announcement: text }).eq('id', _myAllianceId);
  if (r.error) {
    if (r.error.message && r.error.message.includes('announcement')) {
      msg.style.color = 'var(--danger)';
      msg.textContent = 'Ejecuta en Supabase SQL: ALTER TABLE alliances ADD COLUMN announcement text DEFAULT \'\';';
    } else {
      msg.style.color = 'var(--danger)';
      msg.textContent = 'Error: ' + r.error.message;
    }
    return;
  }
  msg.style.color = 'var(--ok)';
  msg.textContent = '✅ Anuncio guardado';
  var display = document.getElementById('alAnnouncementDisplay');
  if (display) display.textContent = text || 'Sin anuncios.';
}

async function _loadAllianceAnnouncement(allianceId) {
  var r = await sbClient.from('alliances').select('announcement').eq('id', allianceId).maybeSingle();
  var text = (r.data && r.data.announcement) ? r.data.announcement : '';
  var display = document.getElementById('alAnnouncementDisplay');
  var input = document.getElementById('alAnnouncementInput');
  if (display) display.textContent = text || 'Sin anuncios.';
  if (input) input.value = text;
}

async function createAlliance() {
  if (!(await ensureLogged())) return;
  const msg = document.getElementById('createAllianceMsg');
  msg.textContent = '';
  msg.style.color = 'var(--danger)';

  const name = (document.getElementById('alName').value || '').trim();
  const tag = (document.getElementById('alTag').value || '').trim().toUpperCase();
  if (name.length < 3) { msg.textContent = 'Nombre demasiado corto (mín. 3 caracteres).'; return; }
  if (tag.length < 2 || tag.length > 6 || !/^[A-Z0-9]+$/.test(tag)) { msg.textContent = 'TAG inválido (2-6 letras/números sin espacios).'; return; }

  const chk = await sbClient.from('alliance_members').select('status').eq('user_id', currentUser.id).in('status', ['active', 'pending', 'invited']);
  if (chk.data && chk.data.length > 0) { msg.textContent = 'Ya perteneces o tienes solicitud en una alianza.'; return; }

  const tagChk = await sbClient.from('alliances').select('id').eq('tag', tag).maybeSingle();
  if (tagChk.data) { msg.textContent = 'Ese TAG ya está en uso.'; return; }

  // FIX [CRÍTICO-3]: eliminado fallback con 2 inserciones independientes.
  // Si create_alliance RPC falla, se muestra error — no se cae a escrituras
  // no atómicas que podían dejar alianzas huérfanas sin líder en DB.
  const rpc = await sbClient.rpc('create_alliance', { p_name: name, p_tag: tag });
  if (rpc.error || !rpc.data) {
    msg.textContent = 'Error al crear alianza: ' + (rpc.error ? rpc.error.message : 'sin respuesta de servidor');
    return;
  }
  const id = rpc.data;

  msg.style.color = 'var(--ok)';
  msg.textContent = '¡Alianza [' + tag + '] creada! ✅';
  document.getElementById('alName').value = '';
  document.getElementById('alTag').value = '';
  await refreshMyAlliance();
}

async function requestJoinAlliance(allianceId, allianceName) {
  if (!(await ensureLogged())) return;
  const chk = await sbClient.from('alliance_members').select('status').eq('user_id', currentUser.id);
  if (chk.data && chk.data.length > 0) {
    var existing = chk.data.find(x => x.status === 'active' || x.status === 'pending' || x.status === 'invited');
    if (existing) { showNotif('Ya tienes una solicitud activa o perteneces a una alianza.', 'err'); return; }
  }
  const ins = await sbClient.from('alliance_members').insert({
    alliance_id: allianceId, user_id: currentUser.id, role: 'member', status: 'pending'
  });
  if (ins.error) { showNotif('Error: ' + ins.error.message, 'err'); return; }
  showNotif('Solicitud enviada a ' + (allianceName || 'la alianza') + ' ✅', 'ok');
  var pmsg = document.getElementById('alPendingMsg');
  if (pmsg) pmsg.textContent = 'Solicitud enviada. Espera a que el líder la acepte.';
  await refreshMyAlliance();
}

async function acceptInvite() {
  if (!(await ensureLogged())) return;
  if (!_myAllianceId) { showNotif('No tienes invitación pendiente.', 'err'); return; }
  const up = await sbClient.from('alliance_members')
    .update({ status: 'active' })
    .eq('alliance_id', _myAllianceId)
    .eq('user_id', currentUser.id);
  if (up.error) { showNotif('Error: ' + up.error.message, 'err'); return; }
  showNotif('¡Invitación aceptada! Bienvenido a la alianza ✅', 'ok');
  await refreshMyAlliance();
}

async function declineOrCancel() {
  if (!(await ensureLogged())) return;
  if (!_myAllianceId) return;
  const del = await sbClient.from('alliance_members')
    .delete()
    .eq('alliance_id', _myAllianceId)
    .eq('user_id', currentUser.id);
  if (del.error) { showNotif('Error: ' + del.error.message, 'err'); return; }
  showNotif('Solicitud/invitación cancelada.', 'ok');
  await refreshMyAlliance();
}

async function leaveAlliance() {
  if (!(await ensureLogged())) return;
  if (!_myAllianceId) { showNotif('No estás en ninguna alianza.', 'err'); return; }
  if (_myAllianceRole === 'leader') {
    showNotif('Eres el líder. Usa "Disolver alianza" o transfiere el liderazgo primero.', 'err');
    return;
  }
  if (!confirm('¿Seguro que quieres salir de la alianza?')) return;
  const del = await sbClient.from('alliance_members')
    .delete()
    .eq('alliance_id', _myAllianceId)
    .eq('user_id', currentUser.id);
  if (del.error) { showNotif('Error: ' + del.error.message, 'err'); return; }
  showNotif('Has salido de la alianza.', 'ok');
  _alUpdateOverview(null, null);
  await refreshMyAlliance();
}

async function dissolveAlliance() {
  if (!(await ensureLogged())) return;
  if (_myAllianceRole !== 'leader') { showNotif('Solo el líder puede disolver la alianza.', 'err'); return; }
  if (!confirm('¿Seguro? Esto eliminará la alianza y expulsará a todos sus miembros. Esta acción es IRREVERSIBLE.')) return;

  // FIX [MENOR-5]: borrar alianza primero; solo si tiene éxito borrar miembros.
  // Antes: se borraban miembros primero → si el DELETE de alliances fallaba,
  // la alianza quedaba huérfana sin miembros.
  const del = await sbClient.from('alliances').delete().eq('id', _myAllianceId);
  if (del.error) { showNotif('Error: ' + del.error.message, 'err'); return; }

  await sbClient.from('alliance_members').delete().eq('alliance_id', _myAllianceId);

  showNotif('Alianza disuelta.', 'ok');
  _alUpdateOverview(null, null);
  await refreshMyAlliance();
}

async function inviteToAlliance() {
  if (!(await ensureLogged())) return;
  if (_myAllianceRole !== 'leader') { showNotif('Solo el líder puede invitar.', 'err'); return; }
  const msg = document.getElementById('alInviteMsg');
  msg.textContent = '';
  msg.style.color = 'var(--danger)';
  const username = (document.getElementById('alInviteUser').value || '').trim();
  if (!username) { msg.textContent = 'Escribe un nombre de usuario.'; return; }

  const pu = await sbClient.from('profiles').select('id,username').ilike('username', username).maybeSingle();
  if (pu.error || !pu.data) { msg.textContent = 'Jugador "' + escapeHtml(username) + '" no encontrado.'; return; }
  const targetId = pu.data.id;
  if (targetId === currentUser.id) { msg.textContent = 'No puedes invitarte a ti mismo.'; return; }

  const chk = await sbClient.from('alliance_members').select('status,alliance_id').eq('user_id', targetId);
  if (chk.data && chk.data.length > 0) {
    var conflict = chk.data.find(x => x.status === 'active' || x.status === 'invited');
    if (conflict) { msg.textContent = 'Ese jugador ya pertenece a una alianza o tiene una invitación pendiente.'; return; }
    var pendingHere = chk.data.find(x => x.alliance_id === _myAllianceId);
    if (pendingHere) { msg.textContent = 'Ese jugador ya tiene una solicitud en tu alianza.'; return; }
  }

  const ins = await sbClient.from('alliance_members').insert({
    alliance_id: _myAllianceId, user_id: targetId, role: 'member', status: 'invited'
  });
  if (ins.error) { msg.textContent = 'Error: ' + ins.error.message; return; }

  msg.style.color = 'var(--ok)';
  msg.textContent = 'Invitación enviada a ' + escapeHtml(pu.data.username) + ' ✅';
  document.getElementById('alInviteUser').value = '';
  _loadPendingRequests(_myAllianceId);
}

async function acceptMember(userId, username) {
  if (!(await ensureLogged())) return;
  const up = await sbClient.from('alliance_members')
    .update({ status: 'active' })
    .eq('alliance_id', _myAllianceId)
    .eq('user_id', userId);
  if (up.error) { showNotif('Error: ' + up.error.message, 'err'); return; }
  showNotif(username + ' aceptado en la alianza ✅', 'ok');
  _loadLeaderData(_myAllianceId);
}

async function rejectMember(userId, username) {
  if (!(await ensureLogged())) return;
  const del = await sbClient.from('alliance_members')
    .delete()
    .eq('alliance_id', _myAllianceId)
    .eq('user_id', userId);
  if (del.error) { showNotif('Error: ' + del.error.message, 'err'); return; }
  showNotif(username + ' rechazado/expulsado.', 'ok');
  _loadLeaderData(_myAllianceId);
}

async function kickMember(userId, username) {
  if (!(await ensureLogged())) return;
  if (!confirm('¿Expulsar a ' + username + ' de la alianza?')) return;
  const del = await sbClient.from('alliance_members')
    .delete()
    .eq('alliance_id', _myAllianceId)
    .eq('user_id', userId);
  if (del.error) { showNotif('Error: ' + del.error.message, 'err'); return; }
  showNotif(username + ' expulsado de la alianza.', 'ok');
  _loadLeaderData(_myAllianceId);
}

// FIX [CRÍTICO-2]: transfer_alliance_leadership hace las 3 escrituras en una
// transacción atómica en el servidor. Antes: 3 UPDATEs independientes → podía
// quedar la alianza con 2 líderes o owner desincronizado si uno fallaba.
async function transferLeadership() {
  if (!(await ensureLogged())) return;
  if (_myAllianceRole !== 'leader') { showNotif('Solo el líder puede transferir el liderazgo.', 'err'); return; }

  var msgEl = document.getElementById('alTransferMsg');
  if (msgEl) { msgEl.textContent = ''; msgEl.style.color = 'var(--danger)'; }

  var inp = document.getElementById('alTransferUser');
  var username = inp ? (inp.value || '').trim() : '';
  if (!username) { if (msgEl) msgEl.textContent = 'Escribe el nombre de un miembro activo.'; return; }

  // Buscar el usuario entre los miembros activos de la alianza
  var r = await sbClient.from('alliance_members')
    .select('user_id,profiles(username)')
    .eq('alliance_id', _myAllianceId)
    .eq('status', 'active')
    .neq('user_id', currentUser.id);

  if (r.error) { showNotif('Error: ' + r.error.message, 'err'); return; }

  var member = (r.data || []).find(function (m) {
    return m.profiles && m.profiles.username.toLowerCase() === username.toLowerCase();
  });

  if (!member) {
    if (msgEl) msgEl.textContent = '"' + username + '" no es miembro activo de tu alianza.';
    return;
  }

  var newLeaderName = member.profiles.username;
  if (!confirm('¿Transferir el liderazgo a "' + newLeaderName + '"?\nTú pasarás a ser miembro normal.')) return;

  var rpc = await sbClient.rpc('transfer_alliance_leadership', {
    p_alliance_id:   _myAllianceId,
    p_new_leader_id: member.user_id
  });

  if (rpc.error || !rpc.data || !rpc.data.ok) {
    var msgs = {
      'not_authenticated': 'No autenticado.',
      'not_leader':        'Ya no eres el líder de esta alianza.',
      'target_not_member': 'Ese jugador ya no es miembro activo.'
    };
    var errKey = (rpc.data && rpc.data.error) || '';
    showNotif(msgs[errKey] || 'Error al transferir: ' + (rpc.error ? rpc.error.message : errKey), 'err');
    return;
  }

  showNotif('✓ Liderazgo transferido a ' + newLeaderName, 'ok');
  if (inp) inp.value = '';
  await refreshMyAlliance();
}

// ---------------- MESSAGES ----------------

const profileCache = {};
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

async function getProfileInfo(userId) {
  if (!userId) return { username: 'Sistema', allianceTag: null };
  var cached = profileCache[userId];
  if (cached && (Date.now() - cached._ts) < PROFILE_CACHE_TTL_MS) return cached;
  try {
    const p = await sbClient.from('profiles').select('username').eq('id', userId).maybeSingle();
    const username = (p.data && p.data.username) ? p.data.username : 'Jugador';
    let allianceTag = null;
    const am = await sbClient.from('alliance_members')
      .select('status,alliances(tag)')
      .eq('user_id', userId).eq('status', 'active').maybeSingle();
    if (am.data && am.data.alliances) allianceTag = am.data.alliances.tag;
    const info = { username, allianceTag, _ts: Date.now() };
    profileCache[userId] = info;
    return info;
  } catch (e) {
    return { username: 'Jugador', allianceTag: null };
  }
}

function getSystemMsgStyle(body) {
  if (!body) return { icon: '🔔', color: 'var(--esencia)', label: 'Sistema' };
  var b = body.toUpperCase();
  if (b.includes('ESPIONAJE') || b.includes('SPY') || b.includes('🔍'))
    return { icon: '🔍', color: 'var(--aldeanos)', label: 'Espionaje' };
  if (b.includes('BATALLA') || b.includes('ATTACK') || b.includes('⚔') || b.includes('🏆') || b.includes('💀'))
    return { icon: '⚔️', color: 'var(--danger)', label: 'Batalla' };
  return { icon: '🔔', color: 'var(--esencia)', label: 'Informe' };
}

function threadMeta(type) {
  if (type === 'system') return { icon: '🔔', color: 'var(--esencia)', label: 'Sistema' };
  if (type === 'alliance') return { icon: '⚔️', color: 'var(--accent2)', label: 'Alianza' };
  return { icon: '✉️', color: 'var(--accent)', label: 'DM' };
}

function renderMessagesHeader(type, title) {
  const h = document.getElementById('chatHeader');
  const area = document.getElementById('chatInputArea');
  if (!type) {
    h.innerHTML = '<span style="color:var(--dim);font-size:.78rem;">Selecciona una conversación…</span>';
    if (area) area.style.display = 'none';
    return;
  }
  var m = threadMeta(type);
  var isSystem = (type === 'system');

  if (type === 'system') {
    h.innerHTML = '<span style="font-size:1.1rem;">' + m.icon + '</span>'
      + '<div style="flex:1;">'
      + '<div style="font-size:.85rem;color:' + m.color + ';font-weight:600;">' + escapeHtml(title) + '</div>'
      + '<div style="font-size:.65rem;color:var(--dim);">Reportes de batallas y espionajes</div>'
      + '</div>';
  } else if (type === 'dm') {
    h.innerHTML = '<span style="font-size:1.1rem;">' + m.icon + '</span>'
      + '<div style="flex:1;">'
      + '<div style="font-size:.95rem;color:var(--text);font-weight:600;">' + escapeHtml(title) + '</div>'
      + '<div style="font-size:.65rem;color:var(--dim);letter-spacing:.08em;">MENSAJE DIRECTO</div>'
      + '</div>';
  } else {
    h.innerHTML = '<span style="font-size:1.1rem;">' + m.icon + '</span>'
      + '<div style="flex:1;">'
      + '<div style="font-size:.8rem;color:' + m.color + ';letter-spacing:.08em;">' + m.label + '</div>'
      + '<div style="font-size:.72rem;color:var(--dim);">' + escapeHtml(title || '') + '</div>'
      + '</div>';
  }

  if (area) area.style.display = isSystem ? 'none' : 'flex';
}

// v1.45: renderThreads — muestra nombre real del hilo, sin ID visible
async function renderThreads() {
  if (!(await ensureLogged())) return;
  const box = document.getElementById('threadsBox');
  box.innerHTML = '<div style="padding:10px 14px;font-size:.72rem;color:var(--dim);">Cargando…</div>';

  const r = await sbClient.from('thread_members')
    .select('thread_id,last_read_at,message_threads(thread_type,created_at)')
    .eq('user_id', currentUser.id)
    .order('thread_id', { ascending: false })
    .limit(100);

  if (r.error) {
    box.innerHTML = '<div style="padding:10px 14px;font-size:.7rem;color:var(--danger);">Error: ' + escapeHtml(r.error.message) + '</div>';
    return;
  }

  const rows = r.data || [];
  if (rows.length === 0) {
    box.innerHTML = '<div style="padding:14px;font-size:.75rem;color:var(--dim);text-align:center;">Sin conversaciones aún.<br>Espía a alguien o envía un DM.</div>';
    return;
  }

  // Para DMs: cargar el nombre del otro participante en una sola query
  var dmPartnerMap = {};
  var dmRows = rows.filter(function (x) {
    return (x.message_threads && x.message_threads.thread_type === 'dm');
  });
  if (dmRows.length > 0) {
    var dmIds = dmRows.map(function (x) { return x.thread_id; });
    try {
      var membersR = await sbClient.from('thread_members')
        .select('thread_id,user_id,profiles(username)')
        .in('thread_id', dmIds)
        .neq('user_id', currentUser.id);
      if (!membersR.error && membersR.data) {
        membersR.data.forEach(function (m) {
          dmPartnerMap[m.thread_id] = (m.profiles && m.profiles.username) ? m.profiles.username : 'Usuario';
        });
      }
    } catch (e) { /* si falla, usaremos label genérico */ }
  }

  var html = '';
  rows.forEach(function (x) {
    var t = (x.message_threads && x.message_threads.thread_type) || 'dm';
    var m = threadMeta(t);
    var isActive = (x.thread_id == currentThreadId);

    // Nombre descriptivo según tipo — sin IDs
    var threadName;
    if (t === 'system') {
      threadName = 'Informes del sistema';
    } else if (t === 'alliance') {
      threadName = window._playerAllianceTag
        ? 'Chat [' + window._playerAllianceTag + ']'
        : 'Chat de alianza';
    } else {
      var partner = dmPartnerMap[x.thread_id];
      threadName = partner ? partner : 'Mensaje directo';
    }

    html += '<div onclick="openThread(\'' + x.thread_id + '\',\'' + t + '\')" style="'
      + 'display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;'
      + 'border-left:3px solid ' + (isActive ? m.color : 'transparent') + ';'
      + 'background:' + (isActive ? 'rgba(255,255,255,.04)' : 'transparent') + ';'
      + 'transition:background .15s;border-bottom:1px solid rgba(255,255,255,.03);"'
      + ' onmouseover="this.style.background=\'rgba(255,255,255,.03)\'"'
      + ' onmouseout="this.style.background=\'' + (isActive ? 'rgba(255,255,255,.04)' : 'transparent') + '\'">'
      + '<span style="font-size:1.2rem;flex-shrink:0;">' + m.icon + '</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:.82rem;color:' + (isActive ? m.color : 'var(--text)') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(threadName) + '</div>'
      + '<div style="font-size:.6rem;color:' + m.color + ';opacity:.7;margin-top:2px;letter-spacing:.06em;">' + m.label.toUpperCase() + '</div>'
      + '</div>'
      + '</div>';
  });
  box.innerHTML = html;
}

async function openSystemThread() {
  if (!(await ensureLogged())) return;
  const r = await sbClient.from('thread_members')
    .select('thread_id,message_threads(thread_type)')
    .eq('user_id', currentUser.id)
    .limit(100);
  if (r.error) { showNotif('Error: ' + r.error.message, 'err'); return; }
  const sysRow = (r.data || []).find(x => x.message_threads && x.message_threads.thread_type === 'system');
  if (sysRow) {
    await openThread(sysRow.thread_id, 'system');
  } else {
    showNotif('No tienes informes de sistema aún. Espía a alguien.', 'err');
  }
}

async function openThread(id, type) {
  if (!(await ensureLogged())) return;
  currentThreadId = id;
  currentThreadType = type || 'dm';

  const reportsList = document.getElementById('reportsList');
  const chatBox = document.getElementById('chatBox');

  if (type === 'system') {
    reportsList.style.display = 'flex';
    chatBox.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--dim);text-align:center;"><div style="font-size:2rem;margin-bottom:10px;">📋</div><div style="font-size:.85rem;">Selecciona un informe<br>de la lista</div></div>';
    await loadSystemReports();
    renderMessagesHeader('system', 'Informes del Sistema');
  } else {
    reportsList.style.display = 'none';

    var headerTitle = type === 'alliance' ? 'Chat de alianza' : 'Mensaje directo';

    if (type === 'dm') {
      try {
        var { data: members } = await sbClient
          .from('thread_members')
          .select('user_id,profiles(username)')
          .eq('thread_id', id);

        if (members && members.length > 0) {
          var otherUser = members.find(function (m) { return m.user_id !== currentUser.id; });
          if (otherUser && otherUser.profiles) {
            headerTitle = otherUser.profiles.username;
          }
        }
      } catch (e) {
        console.warn('openThread: error getting DM partner name', e);
      }
    }

    renderMessagesHeader(type, headerTitle);
    await loadThreadMessages(type);
  }

  subscribeToThread(id);
  await renderThreads();
  await updateUnreadCount();
}

function parseMessageBody(rawBody) {
  if (!rawBody) return { title: 'Informe del sistema', body: '' };

  if (rawBody.trim().startsWith('{')) {
    try {
      var parsed = JSON.parse(rawBody);
      if (parsed.title !== undefined && parsed.body !== undefined) {
        return {
          title: parsed.title || 'Informe del sistema',
          body: parsed.body || ''
        };
      }
    } catch (e) {
      console.warn('parseMessageBody: JSON parse failed', e);
    }
  }

  var lines = rawBody.split('\n');
  var title = lines[0] || 'Informe del sistema';

  if (title.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
    title = lines[1] || lines[0] || 'Informe del sistema';
  }

  return {
    title: title.trim() || 'Informe del sistema',
    body: rawBody
  };
}

function toggleMsgExpand(id) {
  var el = document.getElementById('msgBody_' + id);
  var btn = document.getElementById('msgToggle_' + id);
  if (!el) return;
  var expanded = el.style.display !== 'none';
  el.style.display = expanded ? 'none' : 'block';
  if (btn) btn.textContent = expanded ? '▼' : '▲';
}

async function markMsgAsReadAndDelete(msgId) {
  try {
    await sbClient.from('messages').update({ read: true }).eq('id', msgId);
    var row = document.getElementById('msgRow_' + msgId);
    if (row) {
      row.style.transition = 'opacity .3s';
      row.style.opacity = '0';
      setTimeout(() => row.remove(), 300);
    }
    showNotif('Marcado como leído', 'ok');
    updateUnreadCount();
  } catch (e) {
    console.error('Error marking as read:', e);
    showNotif('Error al marcar como leído', 'err');
  }
}

async function deleteMessage(msgId) {
  if (!confirm('¿Eliminar este mensaje?')) return;
  try {
    await sbClient.from('messages').delete().eq('id', msgId);
    var row = document.getElementById('msgRow_' + msgId);
    if (row) {
      row.style.transition = 'opacity .3s';
      row.style.opacity = '0';
      setTimeout(() => row.remove(), 300);
    }
    showNotif('Mensaje eliminado', 'ok');
  } catch (e) {
    console.error('Error deleting message:', e);
    showNotif('Error al eliminar', 'err');
  }
}

async function loadThreadMessages(threadType) {
  const box = document.getElementById('chatBox');
  if (!currentThreadId) { box.innerHTML = ''; return; }
  box.innerHTML = '<div style="color:var(--dim);font-size:.75rem;text-align:center;padding:20px;">Cargando…</div>';

  const r = await sbClient.from('messages')
    .select('id,body,created_at,sender_id')
    .eq('thread_id', currentThreadId)
    .order('created_at', { ascending: false })
    .limit(80);

  if (r.error) {
    box.innerHTML = '<div style="color:var(--danger);font-size:.72rem;padding:10px;">Error: ' + escapeHtml(r.error.message) + '</div>';
    return;
  }

  const rows = (r.data || []).reverse();
  if (rows.length === 0) {
    box.innerHTML = '<div style="color:var(--dim);font-size:.75rem;text-align:center;padding:30px;">Sin mensajes aún.</div>';
    return;
  }

  const uniqueSenders = [...new Set(rows.map(function (m) { return m.sender_id; }))];
  await Promise.all(uniqueSenders.map(function (id) { return getProfileInfo(id); }));

  var isSystem = (threadType === 'system');
  box.innerHTML = '';

  for (const m of rows) {
    const mine = (m.sender_id === currentUser.id);
    const isSystemMsg = !m.sender_id || isSystem;
    const info = profileCache[m.sender_id] || { username: 'Sistema', allianceTag: null };
    const displayName = isSystemMsg ? 'Sistema'
      : mine ? 'Tú'
        : (info.username + (info.allianceTag ? ' [' + info.allianceTag + ']' : ''));

    if (isSystemMsg || isSystem) {
      var parsed = parseMessageBody(m.body);
      var sStyle = getSystemMsgStyle(parsed.title + ' ' + (parsed.body || ''));
      var date = new Date(m.created_at);
      var timeStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
        + ' ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

      var bodyHtml = '';
      if (parsed.body) {
        var b = parsed.body.trim();
        if (b) {
          // FIX [MEDIO-4]: sanitizar HTML de mensajes de sistema igual que en openReport
          if (b.startsWith('<')) {
            var safe = (typeof DOMPurify !== 'undefined')
              ? DOMPurify.sanitize(b, { USE_PROFILES: { html: true } })
              : b.replace(/<script[\s\S]*?<\/script>/gi, '')
                  .replace(/\son\w+\s*=/gi, ' data-removed=');
            bodyHtml = safe;
          } else {
            bodyHtml = '<pre style="white-space:pre-wrap;font-family:inherit;font-size:.78rem;">' + escapeHtml(b) + '</pre>';
          }
        } else {
          bodyHtml = '<div style="color:var(--dim);font-size:.75rem;padding:8px;">Sin detalles adicionales.</div>';
        }
      } else {
        bodyHtml = '<div style="color:var(--dim);font-size:.75rem;padding:8px;">Sin detalles adicionales.</div>';
      }

      var row = document.createElement('div');
      row.style.cssText = 'border:1px solid ' + sStyle.color + '33;border-radius:8px;overflow:hidden;cursor:pointer;transition:background .15s;';
      row.onclick = function () { toggleMsgExpand(m.id); };
      row.onmouseover = function () { this.style.background = 'rgba(255,255,255,.03)'; };
      row.onmouseout = function () { this.style.background = ''; };

      row.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:' + sStyle.color + '0d;">'
        + '<span style="font-size:1rem;flex-shrink:0;">' + sStyle.icon + '</span>'
        + '<span style="font-size:.68rem;color:' + sStyle.color + ';letter-spacing:.06em;flex-shrink:0;min-width:60px;">' + sStyle.label.toUpperCase() + '</span>'
        + '<span style="flex:1;font-size:.78rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(parsed.title) + '</span>'
        + '<span style="font-size:.6rem;color:var(--dim);flex-shrink:0;margin-left:8px;">' + timeStr + '</span>'
        + '<span id="msgToggle_' + m.id + '" style="font-size:.6rem;color:var(--dim);margin-left:6px;">▼</span>'
        + '</div>'
        + '<div id="msgBody_' + m.id + '" style="display:none;padding:12px 14px;border-top:1px solid ' + sStyle.color + '22;background:var(--bg);">'
        + bodyHtml
        + '</div>';

      box.appendChild(row);

    } else {
      var date2 = new Date(m.created_at);
      var timeStr2 = date2.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
        + ' ' + date2.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      var senderColor = mine ? 'rgba(240,192,64,.9)' : 'rgba(0,212,255,.9)';
      var senderBg = mine ? 'rgba(240,192,64,.1)' : 'rgba(0,212,255,.08)';
      var bodyContent = '<div style="padding:12px 14px;border-top:1px solid rgba(255,255,255,.06);background:var(--bg);font-size:.82rem;color:var(--text);line-height:1.5;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(m.body) + '</div>';
      var preview = (m.body || '').slice(0, 80) + ((m.body || '').length > 80 ? '…' : '');

      var row = document.createElement('div');
      row.style.cssText = 'border:1px solid rgba(255,255,255,.07);border-radius:8px;overflow:hidden;cursor:pointer;transition:background .15s;margin-bottom:4px;';
      row.onclick = function () { toggleMsgExpand(m.id); };
      row.onmouseover = function () { this.style.background = 'rgba(255,255,255,.03)'; };
      row.onmouseout = function () { this.style.background = ''; };
      row.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:' + senderBg + ';">'
        + '<span style="font-size:.85rem;flex-shrink:0;">' + (mine ? '👤' : '💬') + '</span>'
        + '<span style="font-size:.75rem;color:' + senderColor + ';font-weight:bold;flex-shrink:0;min-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(displayName) + '</span>'
        + '<span style="flex:1;font-size:.75rem;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(preview) + '</span>'
        + '<span style="font-size:.6rem;color:var(--dim);flex-shrink:0;margin-left:8px;">' + timeStr2 + '</span>'
        + '<button onclick="event.stopPropagation(); markMsgAsReadAndDelete(' + m.id + ')" style="padding:3px 8px;background:rgba(96,208,96,.15);border:1px solid var(--accent2);border-radius:3px;color:var(--accent2);font-size:.6rem;cursor:pointer;margin:0 4px;flex-shrink:0;">✓</button>'
        + '<button onclick="event.stopPropagation(); deleteMessage(' + m.id + ')" style="padding:3px 8px;background:rgba(255,61,90,.15);border:1px solid rgba(255,61,90,.4);border-radius:3px;color:rgba(255,61,90,.8);font-size:.6rem;cursor:pointer;margin:0 4px;flex-shrink:0;">🗑</button>'
        + '<span id="msgToggle_' + m.id + '" style="font-size:.6rem;color:var(--dim);margin-left:6px;">▼</span>'
        + '</div>'
        + '<div id="msgBody_' + m.id + '" style="display:none;">' + bodyContent + '</div>';
      row.id = 'msgRow_' + m.id;
      box.appendChild(row);
    }
  }

  box.scrollTop = box.scrollHeight;
}

// ============================================================
// SISTEMA DE REPORTES
// ============================================================

var currentReportId = null;

async function loadSystemReports() {
  _selectedReportIds = new Set();
  var selChk = document.getElementById('selectAllReportsChk');
  if (selChk) { selChk.checked = false; selChk.indeterminate = false; }
  _updateReportsToolbar();

  const box = document.getElementById('reportsListBox');
  if (!currentThreadId) {
    box.innerHTML = '<div style="padding:14px;color:var(--dim);font-size:.75rem;text-align:center;">Sin informes</div>';
    return;
  }

  box.innerHTML = '<div style="padding:14px;color:var(--dim);font-size:.75rem;text-align:center;">Cargando…</div>';

  const r = await sbClient.from('messages')
    .select('id,body,created_at,read')
    .eq('thread_id', currentThreadId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (r.error) {
    box.innerHTML = '<div style="padding:14px;color:var(--danger);font-size:.72rem;">Error: ' + escapeHtml(r.error.message) + '</div>';
    return;
  }

  const reports = r.data || [];
  if (reports.length === 0) {
    box.innerHTML = '<div style="padding:14px;color:var(--dim);font-size:.75rem;text-align:center;">Sin informes aún.<br>Realiza espionajes o batallas.</div>';
    return;
  }

  box.innerHTML = '';

  reports.forEach(function (msg) {
    var parsed = parseMessageBody(msg.body);
    var sStyle = getSystemMsgStyle(parsed.title + ' ' + (parsed.body || ''));
    var date = new Date(msg.created_at);
    var timeStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
      + ' ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    var isActive = (currentReportId === msg.id);
    var isUnread = !msg.read;

    var item = document.createElement('div');
    item.style.cssText = 'padding:10px 12px;margin-bottom:6px;border-radius:6px;cursor:pointer;'
      + 'border:1px solid ' + (isActive ? sStyle.color : 'var(--border)') + ';'
      + 'background:' + (isActive ? sStyle.color + '15' : isUnread ? 'rgba(255,255,255,.03)' : 'transparent') + ';'
      + 'transition:all .15s;';

    item.onmouseover = function () { if (!isActive) this.style.background = 'rgba(255,255,255,.05)'; };
    item.onmouseout = function () { if (!isActive) this.style.background = isUnread ? 'rgba(255,255,255,.03)' : 'transparent'; };

    item.id = 'reportItem_' + msg.id;
    item.onclick = function (e) {
      if (e.target.type === 'checkbox') return;
      openReport(msg.id, msg.body, msg.read);
    };

    item.innerHTML = '<div style="display:flex;align-items:center;gap:6px;">'
      + '<input type="checkbox" id="chk_' + msg.id + '" onclick="event.stopPropagation();toggleReportSelect(\'' + msg.id + '\')" style="width:14px;height:14px;cursor:pointer;flex-shrink:0;accent-color:var(--danger);">'
      + '<span style="font-size:1rem;flex-shrink:0;">' + sStyle.icon + '</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:.75rem;color:' + sStyle.color + ';font-weight:' + (isUnread ? 'bold' : 'normal') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(parsed.title) + '</div>'
      + '<div style="font-size:.6rem;color:var(--dim);margin-top:2px;">' + timeStr + '</div>'
      + '</div>'
      + (isUnread ? '<div style="width:8px;height:8px;background:var(--danger);border-radius:50%;flex-shrink:0;"></div>' : '')
      + '</div>';

    box.appendChild(item);
  });
}

async function openReport(msgId, body, isRead) {
  currentReportId = msgId;

  if (!isRead) {
    try {
      const r = await sbClient.from('messages').update({ read: true }).eq('id', msgId);
      if (r.error) console.warn('Error marking as read:', r.error);
      await new Promise(resolve => setTimeout(resolve, 100));
      await updateUnreadCount();
      await loadSystemReports();
    } catch (e) {
      console.warn('Error in openReport read update:', e);
    }
  }

  var parsed = parseMessageBody(body);
  var sStyle = getSystemMsgStyle(parsed.title + ' ' + (parsed.body || ''));

  var prev = document.getElementById('reportPopupOverlay');
  if (prev) prev.remove();

  var overlay = document.createElement('div');
  overlay.id = 'reportPopupOverlay';
  overlay.className = 'bld-modal-overlay';
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });

  var popup = document.createElement('div');
  popup.className = 'bld-modal';
  popup.style.cssText = 'width:min(780px,96vw);max-height:90vh;display:flex;flex-direction:column;';

  var head = document.createElement('div');
  head.className = 'bld-modal-head';
  head.innerHTML =
    '<span style="font-size:1.6rem;">' + sStyle.icon + '</span>'
    + '<div style="flex:1;min-width:0;">'
    + '<div class="bld-modal-title" style="color:' + sStyle.color + ';">' + escapeHtml(parsed.title) + '</div>'
    + '<div class="bld-modal-sub">' + sStyle.label.toUpperCase() + '</div>'
    + '</div>'
    + '<button onclick="deleteReport(\'' + msgId + '\')" style="padding:5px 12px;background:rgba(224,64,64,.1);border:1px solid var(--danger);border-radius:4px;color:var(--danger);font-family:VT323,monospace;font-size:.75rem;cursor:pointer;margin-right:8px;">🗑 Eliminar</button>'
    + '<button class="bld-modal-close" onclick="document.getElementById(&quot;reportPopupOverlay&quot;).remove()">×</button>';

  var bodyDiv = document.createElement('div');
  bodyDiv.style.cssText = 'flex:1;overflow-y:auto;padding:18px;';
  if (parsed.body) {
    var b = parsed.body.trim();
    // FIX [MEDIO-4]: sanitizar con DOMPurify si está disponible; si no, escapar.
    // Los informes de sistema son HTML generado por el juego, pero si la RLS
    // de messages permitiese inserciones externas podría usarse para XSS.
    if (b.startsWith('<')) {
      var safe = (typeof DOMPurify !== 'undefined')
        ? DOMPurify.sanitize(b, { USE_PROFILES: { html: true } })
        : b.replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/\son\w+\s*=/gi, ' data-removed=');
      bodyDiv.innerHTML = safe;
    } else {
      bodyDiv.innerHTML = '<pre style="white-space:pre-wrap;font-family:inherit;font-size:.82rem;color:var(--text);line-height:1.6;">' + escapeHtml(b) + '</pre>';
    }
  } else {
    bodyDiv.innerHTML = '<div style="color:var(--dim);font-size:.75rem;padding:20px;text-align:center;">Sin detalles adicionales.</div>';
  }

  popup.appendChild(head);
  popup.appendChild(bodyDiv);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

function toggleReportSelect(msgId) {
  var chk = document.getElementById('chk_' + msgId);
  if (!chk) return;
  if (chk.checked) { _selectedReportIds.add(msgId); } else { _selectedReportIds.delete(msgId); }
  _updateReportsToolbar();
}

function selectAllReports(selectAll) {
  var allChks = document.querySelectorAll('#reportsListBox input[type=checkbox]');
  allChks.forEach(function (chk) {
    chk.checked = selectAll;
    var id = chk.id.replace('chk_', '');
    if (selectAll) _selectedReportIds.add(id);
    else _selectedReportIds.delete(id);
  });
  _updateReportsToolbar();
}

function _updateReportsToolbar() {
  var count = _selectedReportIds.size;
  var countEl = document.getElementById('reportsSelCount');
  var btnEl = document.getElementById('reportsDeleteSelBtn');
  var chkAll = document.getElementById('selectAllReportsChk');
  var total = document.querySelectorAll('#reportsListBox input[type=checkbox]').length;

  if (countEl) countEl.textContent = count > 0 ? count + ' seleccionado' + (count !== 1 ? 's' : '') : '';
  if (btnEl) btnEl.style.display = count > 0 ? 'block' : 'none';
  if (chkAll) {
    chkAll.indeterminate = count > 0 && count < total;
    chkAll.checked = total > 0 && count === total;
  }
}

async function deleteSelectedReports() {
  var ids = Array.from(_selectedReportIds);
  if (ids.length === 0) return;
  if (!confirm('¿Eliminar ' + ids.length + ' informe(s) seleccionado(s)?')) return;

  var r = await sbClient.from('messages').delete().in('id', ids);
  if (r.error) { showNotif('Error al eliminar: ' + r.error.message, 'err'); return; }

  showNotif(ids.length + ' informe(s) eliminado(s)', 'ok');
  _selectedReportIds = new Set();
  currentReportId = null;
  var chatBox = document.getElementById('chatBox');
  if (chatBox) chatBox.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--dim);text-align:center;"><div style="font-size:2rem;margin-bottom:10px;">📋</div><div style="font-size:.85rem;">Selecciona un informe<br>de la lista</div></div>';
  await loadSystemReports();
  await updateUnreadCount();
}

async function deleteReport(msgId) {
  if (!confirm('¿Eliminar este informe?')) return;

  const r = await sbClient.from('messages').delete().eq('id', msgId);
  if (r.error) { showNotif('Error al eliminar: ' + r.error.message, 'err'); return; }

  showNotif('Informe eliminado', 'ok');
  currentReportId = null;
  var pop = document.getElementById('reportPopupOverlay');
  if (pop) pop.remove();
  await loadSystemReports();
  await updateUnreadCount();
}

async function markAllSystemAsRead() {
  if (!currentThreadId) return;
  try {
    const r = await sbClient.from('messages')
      .update({ read: true })
      .eq('thread_id', currentThreadId)
      .eq('read', false);
    if (r.error) { showNotif('Error: ' + r.error.message, 'err'); return; }
    await new Promise(resolve => setTimeout(resolve, 100));
    showNotif('Todos los informes marcados como leídos', 'ok');
    await updateUnreadCount();
    await loadSystemReports();
  } catch (e) {
    console.error('Error in markAllSystemAsRead:', e);
    showNotif('Error al marcar como leídos', 'err');
  }
}

async function updateUnreadCount() {
  if (!(await ensureLogged())) return;

  const r = await sbClient.from('thread_members')
    .select('thread_id,message_threads(thread_type)')
    .eq('user_id', currentUser.id);

  if (r.error) return;

  var systemThreads = (r.data || [])
    .filter(x => x.message_threads && x.message_threads.thread_type === 'system')
    .map(x => x.thread_id);

  if (systemThreads.length === 0) { hideBadge(); return; }

  const m = await sbClient.from('messages')
    .select('id', { count: 'exact', head: true })
    .in('thread_id', systemThreads)
    .eq('read', false);

  if (m.error) return;

  var count = m.count || 0;
  if (count > 0) { showBadge(count); } else { hideBadge(); }
}

function showBadge(count) {
  const badge = document.getElementById('msgBadge');
  if (badge) { badge.textContent = count > 99 ? '99+' : count; badge.style.display = 'inline-block'; }
}

function hideBadge() {
  const badge = document.getElementById('msgBadge');
  if (badge) badge.style.display = 'none';
}

// ---- REALTIME ----
let realtimeChannel = null;

function subscribeToThread(threadId) {
  if (realtimeChannel) { sbClient.removeChannel(realtimeChannel); realtimeChannel = null; }
  if (!threadId) return;
  realtimeChannel = sbClient.channel('thread-' + threadId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'thread_id=eq.' + threadId },
      async function (payload) {
        const m = payload.new;
        if (!m) return;
        if (currentThreadType === 'system') {
          await loadSystemReports();
        } else {
          await getProfileInfo(m.sender_id);
          await loadThreadMessages(currentThreadType || 'dm');
        }
        await updateUnreadCount();
      })
    .subscribe();
}

async function sendChatMsg() {
  if (!(await ensureLogged())) return;
  if (!currentThreadId) { showNotif('Elige una conversación primero.', 'err'); return; }
  const inp = document.getElementById('chatMsg');
  const body = (inp.value || '').trim();
  if (!body) return;
  const ins = await sbClient.from('messages').insert({ thread_id: currentThreadId, sender_id: currentUser.id, body });
  if (ins.error) { showNotif('No se pudo enviar: ' + ins.error.message, 'err'); return; }
  inp.value = '';
  await loadThreadMessages(currentThreadType || 'dm');
}

async function startDM() {
  if (!(await ensureLogged())) return;
  const uname = (document.getElementById('dmUser').value || '').trim();
  if (!uname) { showNotif('Escribe un username.', 'err'); return; }
  const u = await sbClient.from('profiles').select('id,username').eq('username', uname).maybeSingle();
  if (u.error || !u.data) { showNotif('Usuario no encontrado.', 'err'); return; }
  if (u.data.id === currentUser.id) { showNotif('No puedes enviarte un DM a ti mismo 😄', 'err'); return; }
  const r = await sbClient.rpc('create_dm_thread', { p_other: u.data.id });
  if (r.error) { showNotif('No se pudo abrir DM: ' + r.error.message, 'err'); return; }
  currentThreadId = r.data;
  currentThreadType = 'dm';
  renderMessagesHeader('dm', 'DM con ' + u.data.username);
  subscribeToThread(r.data);
  await renderThreads();
  await loadThreadMessages('dm');
}

async function openAllianceChat() {
  if (!(await ensureLogged())) return;
  const r = await sbClient.from('alliance_members').select('alliance_id,status').eq('user_id', currentUser.id);
  if (r.error) { showNotif(r.error.message, 'err'); return; }
  const a = (r.data || []).find(function (x) { return x.status === 'active'; });
  if (!a) { showNotif('No estás en una alianza activa.', 'err'); return; }
  const t = await sbClient.rpc('get_or_create_alliance_chat', { p_alliance_id: a.alliance_id });
  if (t.error) { showNotif('No se pudo abrir chat: ' + t.error.message, 'err'); return; }
  currentThreadId = t.data;
  currentThreadType = 'alliance';
  renderMessagesHeader('alliance', 'Chat de alianza');
  subscribeToThread(t.data);
  await renderThreads();
  await loadThreadMessages('alliance');
}

// ============================================================
// ADMIN — rol leído desde Supabase profiles.role
// ============================================================

// v1.52: initGlobalAnnouncements — Escucha anuncios directos del administrador
function initGlobalAnnouncements() {
  if (typeof sbClient === 'undefined') return;

  sbClient.channel('global-announcements')
    .on('broadcast', { event: 'announcement' }, function (payload) {
      if (payload && payload.payload && payload.payload.message) {
        var msg = payload.payload.message;
        var el = document.getElementById('motdModalText');
        if (el) {
          el.textContent = msg;
          var modal = document.getElementById('motdModal');
          if (modal) modal.style.display = 'flex';
          if (typeof showNotif === 'function') showNotif('📢 NUEVO ANUNCIO DEL ADMINISTRADOR', 'ok');
        }
      }
    })
    .subscribe();
}

// Inicializar al cargar el módulo si estamos logueados o al menos el cliente existe
if (typeof sbClient !== 'undefined') {
  initGlobalAnnouncements();
}
