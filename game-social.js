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

  // Muestra datos cacheados si son recientes
  const now = Date.now();
  if (rankingCache && (now - rankingCache.fetchedAt) < RANKING_TTL_MS) {
    renderRankingRows(box, rankingCache.data, rankingCache.fetchedAt);
    return;
  }

  box.innerHTML = '<div class="muted">Actualizando ranking…</div>';

  // Suma de tropas por jugador: cada fila en 'troops' tiene (village_id, troop_type, quantity)
  // Necesitamos agrupar por user_id a través de villages
  let rows = null;

  // Intenta la vista ranking primero (más eficiente si existe en Supabase)
  const v = await sbClient.from('ranking')
    .select('username, military_score, alliance_tag')
    .order('military_score', { ascending: false })
    .limit(200);

  if (!v.error && v.data && v.data.length > 0) {
    rows = v.data;
  } else {
    // Fallback: calcula desde profiles + troops + villages
    const p = await sbClient.from('profiles')
      .select('id, username')
      .limit(500);
    if (p.error || !p.data) {
      box.innerHTML = '<div class="muted">Error cargando ranking.</div>';
      return;
    }

    // Carga todas las tropas con su aldea (user_id viene de villages)
    // v0.19: Usamos * para obtener todas las columnas de tipos de tropa nuevas
    const t = await sbClient.from('troops')
      .select('*, villages(owner_id)')  // owner_id es la columna correcta en villages
      .limit(5000);

    // Agrupa tropas por owner_id
    const scoreMap = {};
    if (!t.error && t.data) {
      t.data.forEach(tr => {
        const uid = tr.villages && tr.villages.owner_id; // era user_id — bug corregido
        if (!uid) return;

        // Sumamos todas las clases de tropas definidas en el juego
        let playerTotalTroops = 0;
        Object.keys(TROOP_TYPES).forEach(k => {
          playerTotalTroops += (Number(tr[k]) || 0);
        });

        scoreMap[uid] = (scoreMap[uid] || 0) + playerTotalTroops;
      });
    }

    // Busca alianzas activas
    const am = await sbClient.from('alliance_members')
      .select('user_id, status, alliances(tag)')
      .eq('status', 'active')
      .limit(500);
    const allianceTagMap = {};
    if (!am.error && am.data) {
      am.data.forEach(r => {
        allianceTagMap[r.user_id] = r.alliances ? r.alliances.tag : null;
      });
    }

    rows = p.data.map(u => ({
      username: u.username,
      military_score: scoreMap[u.id] || 0,
      alliance_tag: allianceTagMap[u.id] || null
    })).sort((a, b) => b.military_score - a.military_score);
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
  html += '<div class="table"><div class="trow thead"><div>#</div><div>Usuario</div><div>Alianza</div><div>⚔️ Militar</div></div>';

  rows.forEach((r, i) => {
    const isMe = r.username === myUsername;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '' + (i + 1);
    const rowStyle = isMe ? 'background:rgba(240,192,64,.08);border-color:rgba(240,192,64,.3);' : '';
    html += '<div class="trow" style="' + rowStyle + '">'
      + '<div>' + medal + '</div>'
      + '<div style="' + (isMe ? 'color:var(--gold);font-weight:bold;' : '') + '">' + escapeHtml(r.username || '-') + (isMe ? ' ◀' : '') + '</div>'
      + '<div>' + escapeHtml(r.alliance_tag || '—') + '</div>'
      + '<div style="color:var(--accent)">' + fmt(Number(r.military_score || 0)) + '</div>'
      + '</div>';
  });
  html += '</div>';
  box.innerHTML = html;
}

// Botón para forzar refresh del ranking (ignora caché)
function forceRefreshRanking() {
  rankingCache = null;
  renderRanking();
}

// ================================================================
// CENTRO DE INVESTIGACIÓN — sistema de niveles de tropa (v1.35)
// ================================================================

// Tabla de coste XP por nivel (nivel 1→2 cuesta 10000, lineal hasta 30M)
// Fórmula: coste(n) = round(10000 + (n-1) * (30000000-10000)/28, -3) aprox
function xpCostForLevel(currentLvl) {
  if (currentLvl < 1 || currentLvl >= 30) return Infinity;
  var base = 10000;
  var step = Math.round((30000000 - 10000) / 28);
  var raw = base + (currentLvl - 1) * step;
  // Redondear a cifra limpia
  if (raw >= 1000000) return Math.round(raw / 100000) * 100000;
  if (raw >= 100000) return Math.round(raw / 10000) * 10000;
  return Math.round(raw / 1000) * 1000;
}

// Stats por nivel para una tropa (interpolación lineal entre nivel 1 y nivel 30)
// Usamos multiplicadores sobre stats base. Los spikes cada 5 niveles añaden +10% extra.
function getTroopStatsAtLevel(troopKey, lvl) {
  var base = TROOP_TYPES[troopKey];
  if (!base) return null;
  // Multiplicador base: +8% por nivel sobre stats base (lvl 1 = ×1.0)
  var mult = 1 + (lvl - 1) * 0.08;
  // Spike en múltiplos de 5: +10% adicional acumulado
  var spikes = Math.floor(lvl / 5);
  mult += spikes * 0.10;
  return {
    hp:      Math.round(base.hp * mult),
    damage:  Math.round(base.damage * mult),
    defense: Math.round(base.defense * mult),
    attackChance: Math.min(95, base.attackChance + Math.floor((lvl-1)*0.5))
  };
}

// Cache de datos de investigación del jugador
var _researchData = null; // { experience, troop_levels, ... }

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
      experience:   data.experience || 0,
      troop_levels: data.troop_levels || {},
      weapon_levels: data.weapon_levels || {},
      armor_levels:  data.armor_levels || {}
    };
  } catch(e) {
    console.warn('loadResearchData error:', e);
    _researchData = { experience: 0, troop_levels: {}, weapon_levels: {}, armor_levels: {} };
  }
  return _researchData;
}

async function renderResearch() {
  var rd = await loadResearchData(true);
  // Actualizar display XP
  var xpEl = document.getElementById('researchXPDisplay');
  if (xpEl) xpEl.textContent = formatNumber(rd.experience) + ' XP';

  var grid = document.getElementById('researchTroopGrid');
  if (!grid) return;

  // Tropas que tienen sistema de niveles (excluye invocador)
  var troopKeys = ['aldeano','soldado','mago','druida','explorador','asesino','paladin','chaman'];
  var html = '';

  troopKeys.forEach(function(key) {
    var tDef = TROOP_TYPES[key];
    if (!tDef) return;
    var curLvl = rd.troop_levels[key] || 1;
    var isMax = curLvl >= 30;
    var cost = xpCostForLevel(curLvl);
    var canAfford = !isMax && rd.experience >= cost;
    var stats = getTroopStatsAtLevel(key, curLvl);
    var statsNext = isMax ? null : getTroopStatsAtLevel(key, curLvl + 1);

    html += '<div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--bg2);border-radius:8px;flex-wrap:wrap;">';

    // Icono + nombre
    html += '<div style="min-width:80px;text-align:center;">';
    html += '<div style="font-size:1.8rem;">' + tDef.icon + '</div>';
    html += '<div style="font-size:.7rem;font-weight:700;color:var(--text);">' + tDef.name + '</div>';
    html += '</div>';

    // Nivel actual
    html += '<div style="min-width:70px;">';
    html += '<div class="muted" style="font-size:.65rem;">NIVEL</div>';
    html += '<div style="font-size:1.5rem;font-weight:700;color:' + (isMax ? 'var(--gold)' : 'var(--accent)') + ';">' + curLvl + '</div>';
    if (isMax) html += '<div style="font-size:.6rem;color:var(--gold);">MÁXIMO</div>';
    html += '</div>';

    // Stats actuales
    html += '<div style="flex:1;min-width:130px;">';
    html += '<div class="muted" style="font-size:.65rem;margin-bottom:4px;">STATS (nv.' + curLvl + ')</div>';
    html += '<div style="font-size:.72rem;line-height:1.7;">';
    html += '❤️ HP: <strong>' + stats.hp + '</strong>';
    if (statsNext) html += ' → <span style="color:var(--green)">' + statsNext.hp + '</span>';
    html += '<br>';
    html += '⚔️ Daño: <strong>' + stats.damage + '</strong>';
    if (statsNext) html += ' → <span style="color:var(--green)">' + statsNext.damage + '</span>';
    html += '<br>';
    html += '🛡️ Def: <strong>' + stats.defense + '</strong>';
    if (statsNext) html += ' → <span style="color:var(--green)">' + statsNext.defense + '</span>';
    html += '</div>';
    html += '</div>';

    // Coste y botón
    html += '<div style="text-align:right;min-width:110px;">';
    if (!isMax) {
      html += '<div class="muted" style="font-size:.65rem;">COSTE SUBIDA</div>';
      html += '<div style="font-size:.85rem;color:' + (canAfford ? 'var(--gold)' : 'var(--dim)') + ';margin-bottom:6px;">' + formatNumber(cost) + ' XP</div>';
      html += '<button class="btn btn-sm" style="' + (!canAfford ? 'opacity:.45;cursor:not-allowed;' : '') + '"'
            + (canAfford ? ' onclick="upgradeTroopLevel(\'' + key + '\')"' : '')
            + '>' + (canAfford ? '⬆ Subir nivel' : '❌ XP insuf.') + '</button>';
    } else {
      html += '<div style="font-size:.8rem;color:var(--gold);margin-top:8px;">✨ Maestría</div>';
    }
    html += '</div>';

    html += '</div>';
  });

  grid.innerHTML = html;
}

async function upgradeTroopLevel(troopKey) {
  if (!currentUser) return;
  var rd = await loadResearchData(false);
  var curLvl = rd.troop_levels[troopKey] || 1;
  if (curLvl >= 30) return;
  var cost = xpCostForLevel(curLvl);
  if (rd.experience < cost) {
    alert('No tienes suficiente XP.');
    return;
  }

  var newLvl = curLvl + 1;
  var newXP = rd.experience - cost;
  var newTroopLevels = Object.assign({}, rd.troop_levels);
  newTroopLevels[troopKey] = newLvl;

  try {
    var { error } = await sbClient
      .from('profiles')
      .update({ experience: newXP, troop_levels: newTroopLevels })
      .eq('id', currentUser.id);
    if (error) throw error;

    // Actualizar cache local
    _researchData.experience = newXP;
    _researchData.troop_levels = newTroopLevels;

    // Actualizar display XP global si existe
    var xpEl = document.getElementById('ovExperience');
    if (xpEl) xpEl.textContent = formatNumber(newXP);

    // Re-renderizar
    await renderResearch();

    // Feedback visual
    var tDef = TROOP_TYPES[troopKey];
    var msg = '✅ ' + (tDef ? tDef.icon + ' ' + tDef.name : troopKey) + ' subido a nivel ' + newLvl + '!';
    console.log(msg);
    // Pequeño toast
    _showToast(msg);
  } catch(e) {
    console.error('upgradeTroopLevel error:', e);
    alert('Error al subir nivel: ' + e.message);
  }
}

// Toast simple (reutilizable)
function _showToast(msg) {
  var t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;font-size:.85rem;box-shadow:0 2px 12px #0008;pointer-events:none;';
  document.body.appendChild(t);
  setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity .5s'; setTimeout(function(){ t.remove(); }, 500); }, 2500);
}

// ================================================================
// ALIANZAS — sistema completo
// ================================================================

// Estado local de alianza del jugador actual
var _myAllianceId = null;
var _myAllianceRole = null; // 'leader' | 'member'
var _myAllianceStatus = null; // 'active' | 'pending' | 'invited'

// Oculta todos los sub-paneles de alianza
function _alHideAll() {
  ['alNoAlliancePanel', 'alMemberPanel', 'alLeaderPanel', 'alPendingPanel'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// Actualiza el tag en el overview
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

  // Paso 1: obtener fila de alliance_members SIN join (el join falla si no hay FK registrada)
  const r = await sbClient.from('alliance_members')
    .select('status,role,alliance_id')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (r.error) {
    // 500 = error de servidor/RLS — no bloquear el juego, mostrar sin alianza
    console.warn('alliance_members error:', r.error.message, '— comprueba las políticas RLS de la tabla');
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

  // Paso 2: obtener datos de la alianza por separado
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

  // status === 'active'
  _alUpdateOverview(al.tag, al.name);
  loadAllyUserIds(); // Actualizar set de aliados para el mapa

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
  const r = await sbClient.from('alliances').select('id,name,tag,created_at').order('created_at', { ascending: false }).limit(100);
  if (r.error) { box.innerHTML = '<span class="muted">Error: ' + escapeHtml(r.error.message) + '</span>'; return; }
  if (!r.data || r.data.length === 0) { box.innerHTML = '<span class="muted">No hay alianzas aún.</span>'; return; }
  let html = '<div class="table"><div class="trow thead"><div>TAG</div><div>Nombre</div><div></div></div>';
  r.data.forEach(al => {
    html += '<div class="trow"><div><b>[' + escapeHtml(al.tag) + ']</b></div><div>' + escapeHtml(al.name) + '</div>'
      + '<div><button class="btn btn-sm" onclick="requestJoinAlliance(' + al.id + ', \'' + escapeHtml(al.name) + '\')">Solicitar</button></div></div>';
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
    .eq('status', 'active');
  if (r.error) { box.innerHTML = '<span class="muted">Error.</span>'; return; }
  if (!r.data || r.data.length === 0) { box.innerHTML = '<span class="muted">Sin miembros activos.</span>'; return; }
  let html = '<div class="table"><div class="trow thead"><div>Jugador</div><div>Rol</div>' + (isLeader ? '<div></div>' : '') + '</div>';
  r.data.forEach(m => {
    var uname = (m.profiles && m.profiles.username) ? escapeHtml(m.profiles.username) : m.user_id.slice(0, 8);
    var isMe = m.user_id === currentUser.id;
    html += '<div class="trow"><div>' + uname + (isMe ? ' <span style="color:var(--dim);font-size:.7rem;">(tú)</span>' : '') + '</div><div>' + escapeHtml(m.role) + '</div>';
    if (isLeader && !isMe) {
      html += '<div><button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" onclick="kickMember(\'' + m.user_id + '\', \'' + uname + '\')">Expulsar</button></div>';
    } else if (isLeader) {
      html += '<div></div>';
    }
    html += '</div>';
  });
  html += '</div>';
  box.innerHTML = html;
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
    html += '<div class="trow"><div>' + uname + '</div><div style="color:var(--accent);">' + escapeHtml(m.status) + '</div><div style="display:flex;gap:4px;">';
    if (isPending) {
      html += '<button class="btn btn-sm" onclick="acceptMember(\'' + m.user_id + '\', \'' + uname + '\')">&#x2714; Aceptar</button>'
        + '<button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" onclick="rejectMember(\'' + m.user_id + '\', \'' + uname + '\')">&#x2715; Rechazar</button>';
    } else {
      // invited — cancelar invitación
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
    _loadAllianceAnnouncement(allianceId)
  ]);
}


// v1.22: Ranking colectivo de alianzas
async function renderAllianceRanking() {
  var box = document.getElementById('allianceRankingBox');
  if (!box) return;
  box.innerHTML = '<span class="muted">Cargando…</span>';

  // Reutilizar caché del ranking individual si existe
  var rows = rankingCache ? rankingCache.data : null;
  if (!rows) {
    var v = await sbClient.from('ranking')
      .select('username, military_score, alliance_tag')
      .order('military_score', { ascending: false })
      .limit(500);
    rows = (!v.error && v.data && v.data.length > 0) ? v.data : [];
  }

  // Agrupar por alliance_tag
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

  var html = '<div class="table"><div class="trow thead"><div>#</div><div>TAG</div><div>Miembros</div><div>Puntuación total</div></div>';
  sorted.forEach(function (al, i) {
    var isMyAl = window._playerAllianceTag && window._playerAllianceTag === al.tag;
    html += '<div class="trow" style="' + (isMyAl ? 'background:rgba(0,212,255,.06);' : '') + '">'
      + '<div style="color:var(--dim);">' + (i + 1) + '</div>'
      + '<div><b style="color:' + (isMyAl ? 'var(--accent)' : 'var(--text)') + ';">[' + escapeHtml(al.tag) + ']</b></div>'
      + '<div style="color:var(--dim);">' + al.members + '</div>'
      + '<div style="color:var(--ok);font-weight:bold;">' + fmt(al.score) + '</div>'
      + '</div>';
  });
  html += '</div>';
  box.innerHTML = html;
}

async function renderAlliances() {
  await refreshMyAlliance();
  renderAllianceRanking();
}


// v1.22: Tablón de anuncios de alianza
async function saveAllianceAnnouncement() {
  if (_myAllianceRole !== 'leader') { showNotif('Solo el líder puede editar el anuncio.', 'err'); return; }
  var msg = document.getElementById('alAnnouncementMsg');
  var text = (document.getElementById('alAnnouncementInput').value || '').trim().slice(0, 500);
  msg.textContent = '';
  var r = await sbClient.from('alliances').update({ announcement: text }).eq('id', _myAllianceId);
  if (r.error) {
    // Si la columna no existe, avisar con instrucción SQL
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
  // Actualizar el display del miembro también
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

  // Validaciones
  const name = (document.getElementById('alName').value || '').trim();
  const tag = (document.getElementById('alTag').value || '').trim().toUpperCase();
  if (name.length < 3) { msg.textContent = 'Nombre demasiado corto (mín. 3 caracteres).'; return; }
  if (tag.length < 2 || tag.length > 6 || !/^[A-Z0-9]+$/.test(tag)) { msg.textContent = 'TAG inválido (2-6 letras/números sin espacios).'; return; }

  // ¿Ya está en una alianza?
  const chk = await sbClient.from('alliance_members').select('status').eq('user_id', currentUser.id).in('status', ['active', 'pending', 'invited']);
  if (chk.data && chk.data.length > 0) { msg.textContent = 'Ya perteneces o tienes solicitud en una alianza.'; return; }

  // ¿Tag ya existe?
  const tagChk = await sbClient.from('alliances').select('id').eq('tag', tag).maybeSingle();
  if (tagChk.data) { msg.textContent = 'Ese TAG ya está en uso.'; return; }

  let id = null;
  const rpc = await sbClient.rpc('create_alliance', { p_name: name, p_tag: tag });
  if (!rpc.error && rpc.data) {
    id = rpc.data;
  } else {
    const ins = await sbClient.from('alliances').insert({ name, tag, owner_id: currentUser.id }).select('id').single();
    if (ins.error) { msg.textContent = 'Error: ' + ins.error.message; return; }
    id = ins.data.id;
    const mem = await sbClient.from('alliance_members').insert({ alliance_id: id, user_id: currentUser.id, role: 'leader', status: 'active' });
    if (mem.error) { msg.textContent = 'Error al unirse: ' + mem.error.message; return; }
  }

  msg.style.color = 'var(--ok)';
  msg.textContent = '¡Alianza [' + tag + '] creada! ✅';
  document.getElementById('alName').value = '';
  document.getElementById('alTag').value = '';
  await refreshMyAlliance();
}

async function requestJoinAlliance(allianceId, allianceName) {
  if (!(await ensureLogged())) return;

  // ¿Ya tiene solicitud / está activo?
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
  await sbClient.from('alliance_members').delete().eq('alliance_id', _myAllianceId);
  const del = await sbClient.from('alliances').delete().eq('id', _myAllianceId);
  if (del.error) { showNotif('Error: ' + del.error.message, 'err'); return; }
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

  // Buscar el usuario por username
  const pu = await sbClient.from('profiles').select('id,username').ilike('username', username).maybeSingle();
  if (pu.error || !pu.data) { msg.textContent = 'Jugador "' + escapeHtml(username) + '" no encontrado.'; return; }
  const targetId = pu.data.id;
  if (targetId === currentUser.id) { msg.textContent = 'No puedes invitarte a ti mismo.'; return; }

  // ¿Ya tiene estado en alguna alianza?
  const chk = await sbClient.from('alliance_members').select('status,alliance_id').eq('user_id', targetId);
  if (chk.data && chk.data.length > 0) {
    var conflict = chk.data.find(x => x.status === 'active' || x.status === 'invited');
    if (conflict) { msg.textContent = 'Ese jugador ya pertenece a una alianza o tiene una invitación pendiente.'; return; }
    // Si tiene una pending en OTRA alianza, se puede invitar igualmente (queda a su elección)
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

// ---------------- MESSAGES ----------------

// Cache de perfiles: userId -> {username, allianceTag}
const profileCache = {};

async function getProfileInfo(userId) {
  if (!userId) return { username: 'Sistema', allianceTag: null };
  if (profileCache[userId]) return profileCache[userId];
  try {
    const p = await sbClient.from('profiles').select('username').eq('id', userId).maybeSingle();
    const username = (p.data && p.data.username) ? p.data.username : 'Jugador';
    let allianceTag = null;
    const am = await sbClient.from('alliance_members')
      .select('status,alliances(tag)')
      .eq('user_id', userId).eq('status', 'active').maybeSingle();
    if (am.data && am.data.alliances) allianceTag = am.data.alliances.tag;
    const info = { username, allianceTag };
    profileCache[userId] = info;
    return info;
  } catch (e) {
    return { username: 'Jugador', allianceTag: null };
  }
}

// Detecta el subtipo de mensaje de sistema por el cuerpo del mensaje
function getSystemMsgStyle(body) {
  if (!body) return { icon: '🔔', color: 'var(--esencia)', label: 'Sistema' };
  var b = body.toUpperCase();
  if (b.includes('ESPIONAJE') || b.includes('SPY') || b.includes('🔍'))
    return { icon: '🔍', color: 'var(--aldeanos)', label: 'Espionaje' };
  if (b.includes('BATALLA') || b.includes('ATTACK') || b.includes('⚔') || b.includes('🏆') || b.includes('💀'))
    return { icon: '⚔️', color: 'var(--danger)', label: 'Batalla' };
  return { icon: '🔔', color: 'var(--esencia)', label: 'Informe' };
}

// Tipo de hilo → icono + color + etiqueta
function threadMeta(type) {
  if (type === 'system') return { icon: '🔔', color: 'var(--esencia)', label: 'Sistema' };
  if (type === 'alliance') return { icon: '⚔️', color: 'var(--accent2)', label: 'Alianza' };
  return { icon: '✉️', color: 'var(--accent)', label: 'DM' };
}

// Actualiza la cabecera del chat con el tipo de hilo y nombre
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

  // Diferentes estilos según el tipo
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

  // Los mensajes de sistema son de solo lectura
  if (area) area.style.display = isSystem ? 'none' : 'flex';
}

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

  var html = '';
  rows.forEach(function (x) {
    var t = (x.message_threads && x.message_threads.thread_type) || 'dm';
    var m = threadMeta(t);
    var isActive = (x.thread_id == currentThreadId);
    html += '<div onclick="openThread(\'' + x.thread_id + '\',\'' + t + '\')" style="'
      + 'display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;'
      + 'border-left:3px solid ' + (isActive ? m.color : 'transparent') + ';'
      + 'background:' + (isActive ? 'rgba(255,255,255,.04)' : 'transparent') + ';'
      + 'transition:background .15s;"'
      + ' onmouseover="if(!this.classList.contains(\'active-thread\')) this.style.background=\'rgba(255,255,255,.03)\'"'
      + ' onmouseout="if(!this.classList.contains(\'active-thread\')) this.style.background=\'' + (isActive ? 'rgba(255,255,255,.04)' : 'transparent') + '\'">'
      + '<span style="font-size:1.1rem;flex-shrink:0;">' + m.icon + '</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:.75rem;color:' + m.color + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + m.label + '</div>'
      + '<div style="font-size:.62rem;color:var(--dim);">#' + x.thread_id.toString().slice(-8) + '</div>'
      + '</div>'
      + '</div>';
  });
  box.innerHTML = html;
}

// Abre un hilo de sistema (el primero que encuentre de tipo system, o lo crea)
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

  // Ocultar/mostrar paneles según el tipo
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
  await updateUnreadCount(); // Actualizar badge
}

function parseMessageBody(rawBody) {
  if (!rawBody) return { title: 'Informe del sistema', body: '' };

  // Try to parse as JSON {title, body} — new format
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

  // Legacy format: first line is title, rest is body
  var lines = rawBody.split('\n');
  var title = lines[0] || 'Informe del sistema';

  // Si la primera línea parece ser una fecha/timestamp, usar la segunda
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

// v1.17: Marcar mensaje como leído y eliminar
async function markMsgAsReadAndDelete(msgId) {
  try {
    // Marcar como leído en BD - sin filtro recipient_id (no existe en tabla)
    await sbClient.from('messages')
      .update({ read: true })
      .eq('id', msgId);

    // Eliminar de la vista inmediatamente
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

// v1.17: Eliminar mensaje (lo borra de BD y de la vista)
async function deleteMessage(msgId) {
  if (!confirm('¿Eliminar este mensaje?')) return;

  try {
    await sbClient.from('messages')
      .delete()
      .eq('id', msgId);

    // Eliminar de la vista inmediatamente
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
  // Build DOM directly for system messages (Gmail inbox style)
  box.innerHTML = '';

  for (const m of rows) {
    const mine = (m.sender_id === currentUser.id);
    const isSystemMsg = !m.sender_id || isSystem;
    const info = profileCache[m.sender_id] || { username: 'Sistema', allianceTag: null };
    const displayName = isSystemMsg ? 'Sistema'
      : mine ? 'Tú'
        : (info.username + (info.allianceTag ? ' [' + info.allianceTag + ']' : ''));

    if (isSystemMsg || isSystem) {
      // Parse title + body
      var parsed = parseMessageBody(m.body);
      var sStyle = getSystemMsgStyle(parsed.title + ' ' + (parsed.body || ''));
      var date = new Date(m.created_at);
      var timeStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
        + ' ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

      // Render body: HTML if starts with <, else plain text
      var bodyHtml = '';
      if (parsed.body) {
        var b = parsed.body.trim();
        if (b) {
          bodyHtml = b.startsWith('<') ? b : '<pre style="white-space:pre-wrap;font-family:inherit;font-size:.78rem;">' + escapeHtml(b) + '</pre>';
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

      // Header row (always visible)
      row.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:' + sStyle.color + '0d;">'
        + '<span style="font-size:1rem;flex-shrink:0;">' + sStyle.icon + '</span>'
        + '<span style="font-size:.68rem;color:' + sStyle.color + ';letter-spacing:.06em;flex-shrink:0;min-width:60px;">' + sStyle.label.toUpperCase() + '</span>'
        + '<span style="flex:1;font-size:.78rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(parsed.title) + '</span>'
        + '<span style="font-size:.6rem;color:var(--dim);flex-shrink:0;margin-left:8px;">' + timeStr + '</span>'
        + '<span id="msgToggle_' + m.id + '" style="font-size:.6rem;color:var(--dim);margin-left:6px;">▼</span>'
        + '</div>'
        // Body (hidden by default, expands on click)
        + '<div id="msgBody_' + m.id + '" style="display:none;padding:12px 14px;border-top:1px solid ' + sStyle.color + '22;background:var(--bg);">'
        + bodyHtml
        + '</div>';

      box.appendChild(row);

    } else {
      // Mensajes DM / alianza: estilo Gmail colapsable igual que sistema
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
// SISTEMA DE REPORTES (v1.11)
// ============================================================

var currentReportId = null;

async function loadSystemReports() {
  // v1.30: reset selection state on every reload
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

    item.onmouseover = function () {
      if (!isActive) this.style.background = 'rgba(255,255,255,.05)';
    };
    item.onmouseout = function () {
      if (!isActive) this.style.background = isUnread ? 'rgba(255,255,255,.03)' : 'transparent';
    };

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

  // Marcar como leído si no lo está
  if (!isRead) {
    try {
      const r = await sbClient.from('messages')
        .update({ read: true })
        .eq('id', msgId);
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

  // ---- Construir el popup centrado (igual que bld-modal) ----
  // Eliminar popup anterior si existe
  var prev = document.getElementById('reportPopupOverlay');
  if (prev) prev.remove();

  var overlay = document.createElement('div');
  overlay.id = 'reportPopupOverlay';
  overlay.className = 'bld-modal-overlay';
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });

  var popup = document.createElement('div');
  popup.className = 'bld-modal';
  popup.style.cssText = 'width:min(780px,96vw);max-height:90vh;display:flex;flex-direction:column;';

  // Cabecera
  var head = document.createElement('div');
  head.className = 'bld-modal-head';
  head.innerHTML =
    '<span style="font-size:1.6rem;">' + sStyle.icon + '</span>'
    + '<div style="flex:1;min-width:0;">'
    +   '<div class="bld-modal-title" style="color:' + sStyle.color + ';">' + escapeHtml(parsed.title) + '</div>'
    +   '<div class="bld-modal-sub">' + sStyle.label.toUpperCase() + '</div>'
    + '</div>'
    + '<button onclick="deleteReport(\'' + msgId + '\')" style="padding:5px 12px;background:rgba(224,64,64,.1);border:1px solid var(--danger);border-radius:4px;color:var(--danger);font-family:VT323,monospace;font-size:.75rem;cursor:pointer;margin-right:8px;">🗑 Eliminar</button>'
    + '<button class="bld-modal-close" onclick="document.getElementById(&quot;reportPopupOverlay&quot;).remove()">×</button>';

  // Cuerpo con scroll
  var bodyDiv = document.createElement('div');
  bodyDiv.style.cssText = 'flex:1;overflow-y:auto;padding:18px;';
  if (parsed.body) {
    var b = parsed.body.trim();
    if (b.startsWith('<')) {
      bodyDiv.innerHTML = b;
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

// v1.22: Multi-select helpers para informes de sistema
function toggleReportSelect(msgId) {
  var chk = document.getElementById('chk_' + msgId);
  if (!chk) return;
  if (chk.checked) {
    _selectedReportIds.add(msgId);
  } else {
    _selectedReportIds.delete(msgId);
  }
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

  const r = await sbClient.from('messages')
    .delete()
    .eq('id', msgId);

  if (r.error) {
    showNotif('Error al eliminar: ' + r.error.message, 'err');
    return;
  }

  showNotif('Informe eliminado', 'ok');
  currentReportId = null;

  // Cerrar popup si está abierto
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

    if (r.error) {
      showNotif('Error: ' + r.error.message, 'err');
      return;
    }

    // Esperar a que se propague el cambio
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

  // Contar mensajes no leídos del sistema
  const r = await sbClient.from('thread_members')
    .select('thread_id,message_threads(thread_type)')
    .eq('user_id', currentUser.id);

  if (r.error) return;

  var systemThreads = (r.data || [])
    .filter(x => x.message_threads && x.message_threads.thread_type === 'system')
    .map(x => x.thread_id);

  if (systemThreads.length === 0) {
    hideBadge();
    return;
  }

  // Contar mensajes no leídos en todos los hilos del sistema
  const m = await sbClient.from('messages')
    .select('id', { count: 'exact', head: true })
    .in('thread_id', systemThreads)
    .eq('read', false);

  if (m.error) return;

  var count = m.count || 0;

  if (count > 0) {
    showBadge(count);
  } else {
    hideBadge();
  }
}

function showBadge(count) {
  const badge = document.getElementById('msgBadge');
  if (badge) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'inline-block';
  }
}

function hideBadge() {
  const badge = document.getElementById('msgBadge');
  if (badge) {
    badge.style.display = 'none';
  }
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

        // Si es un mensaje del sistema, recargar lista de reportes
        if (currentThreadType === 'system') {
          await loadSystemReports();
        } else {
          await getProfileInfo(m.sender_id);
          await loadThreadMessages(currentThreadType || 'dm');
        }

        // Actualizar badge
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
