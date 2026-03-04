// game-admin.js — Panel de administración Epic Warriors
// Depende de: sbClient, currentUser, activeVillage, showNotif, TROOP_TYPES,
//             escapeHtml, escapeJs, fmt, loadMyVillages, switchVillage

// Función local para escapar atributos HTML (onclick, etc.)
function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function _loadMOTDForAdmin() {
  if (!isAdmin()) return;
  var r = await sbClient.from('config').select('value').eq('key', 'motd').maybeSingle();
  if (r.data && r.data.value) {
    var el = document.getElementById('motdInput');
    if (el) el.value = r.data.value;
  }
}

async function checkAndShowMOTD() {
  try {
    var r = await sbClient.from('config').select('value').eq('key', 'motd').maybeSingle();
    if (!r.data || !r.data.value || !r.data.value.trim()) return;
    var text = r.data.value.trim();
    // Solo mostrar si no lo vio ya en esta sesión
    var seen = sessionStorage.getItem('EW_motd_seen');
    if (seen === text) return;
    sessionStorage.setItem('EW_motd_seen', text);
    document.getElementById('motdModalText').textContent = text;
    document.getElementById('motdModal').style.display = 'flex';
  } catch (e) {
    console.warn('MOTD check error:', e);
  }
}

function closeMOTD() {
  document.getElementById('motdModal').style.display = 'none';
}

function isAdmin() {
  if (!currentUser) return false;
  if (currentUser.email !== 'sementalac@gmail.com') return false;
  // Verificación extra: el id debe ser un UUID válido (no manipulado)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.id)) return false;
  return true;
}

function checkAdminButton() {
  var btn = document.getElementById('adminBtn');
  var nav = document.getElementById('adminNavSection');
  if (btn) btn.style.display = isAdmin() ? 'inline-block' : 'none';
  if (nav) nav.style.display = isAdmin() ? 'block' : 'none';
}

// ── Admin recursos panel ──
// ── Admin Control Panel (Universal v0.19) ──
let adEditingVillage = null;

function openAdmin() {
  if (!isAdmin()) { showNotif('Acceso denegado.', 'err'); return; }
  document.getElementById('adSearchInp').value = '';
  _loadMOTDForAdmin();
  document.getElementById('adSearchResults').style.display = 'none';
  document.getElementById('adVillagesBox').style.display = 'none';
  document.getElementById('adEditBox').style.display = 'none';
  loadGhostList();
  document.getElementById('adminMsg').textContent = '';
  document.getElementById('adminOverlay').classList.remove('hidden');

  // v1.17: Mostrar botón "Ver todos" solo para sementalac@gmail.com
  var btn = document.getElementById('adminViewAllBtn');
  if (btn) {
    btn.style.display = (currentUser && currentUser.email === 'sementalac@gmail.com') ? 'inline-block' : 'none';
  }
}

async function searchAdminPlayer() {
  const q = document.getElementById('adSearchInp').value.trim();
  if (q.length < 3) { showNotif('Escribe al menos 3 letras.', 'err'); return; }

  const box = document.getElementById('adSearchResults');
  const list = document.getElementById('adPlayersList');
  list.innerHTML = '<div class="muted">Buscando...</div>';
  box.style.display = 'block';

  // Mejoramos la consulta: si no parece un UUID, no filtramos por ID para evitar error de tipo
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);

  let res;
  if (isUuid) {
    res = await sbClient.from('profiles').select('id, username')
      .or(`id.eq.${q}, username.ilike.%${q}%`)
      .limit(10);
  } else {
    res = await sbClient.from('profiles').select('id, username')
      .ilike('username', `%${q}%`)
      .limit(10);
  }

  list.innerHTML = '';
  if (res.error) {
    list.innerHTML = `<div class="muted" style="color:var(--danger)">Error: ${res.error.message}</div>`;
    return;
  }

  if (!res.data?.length) {
    list.innerHTML = '<div class="muted">No se encontraron jugadores.</div>';
  } else {
    res.data.forEach(p => {
      const div = document.createElement('div');
      div.className = 'admin-village-item';
      div.textContent = `👤 ${p.username} (${p.id.substring(0, 8)}...)`;
      div.onclick = () => loadAdminVillages(p.id);
      list.appendChild(div);
    });
  }
}

async function loadAdminVillages(userId) {
  const box = document.getElementById('adVillagesBox');
  const list = document.getElementById('adVillagesList');
  list.innerHTML = '<div class="muted">Cargando...</div>';
  box.style.display = 'block';
  document.getElementById('adEditBox').style.display = 'none';

  const { data, error } = await sbClient.rpc('admin_list_user_villages', { p_owner_id: userId });
  list.innerHTML = '';

  if (error || !data?.length) {
    list.innerHTML = '<div class="muted">Este jugador no tiene aldeas o error: ' + (error?.message || 'Ninguna') + '</div>';
  } else {
    data.forEach(v => {
      const div = document.createElement('div');
      div.className = 'admin-village-item';
      div.textContent = `🏘️ ${v.name} (ID: ${v.id})`;
      div.onclick = () => selectAdminVillage(v);
      list.appendChild(div);
    });
  }
}

async function selectAdminVillage(village) {
  adEditingVillage = village;
  document.getElementById('adEditingName').textContent = village.name;
  document.getElementById('adminMsg').textContent = 'Cargando datos de aldea...';

  const { data, error } = await sbClient.rpc('admin_get_village_data', {
    p_village_id: village.id,
    p_owner_id: village.owner_id
  });

  if (error || !data) {
    document.getElementById('adminMsg').textContent = '❌ Error cargando datos: ' + (error?.message || 'sin datos');
    return;
  }

  const vRes = data.resources || { madera: 0, piedra: 0, hierro: 0, prov: 0, esencia: 0 };
  const vTrp = data.troops || { aldeano: 0 };
  const vPrf = data.profile || { experience: 0 };

  document.getElementById('adMadera').value = vRes.madera || 0;
  document.getElementById('adPiedra').value = vRes.piedra || 0;
  document.getElementById('adHierro').value = vRes.hierro || 0;
  document.getElementById('adProv').value = vRes.prov || 0;
  document.getElementById('adEsencia').value = vRes.esencia || 0;
  document.getElementById('adAldeanos').value = vTrp.aldeano || 0;
  document.getElementById('adExperience').value = vPrf.experience || 0;

  document.getElementById('adEditBox').style.display = 'block';
  document.getElementById('adminMsg').textContent = '';

  // Resaltar aldea seleccionada
  document.querySelectorAll('#adVillagesList .admin-village-item').forEach(el => {
    el.classList.toggle('active', el.textContent.includes(village.name));
  });
}

async function adminApplyUniversal() {
  if (!adEditingVillage) return;

  const madera = parseInt(document.getElementById('adMadera').value) || 0;
  const piedra = parseInt(document.getElementById('adPiedra').value) || 0;
  const hierro = parseInt(document.getElementById('adHierro').value) || 0;
  const prov = parseInt(document.getElementById('adProv').value) || 0;
  const esencia = parseInt(document.getElementById('adEsencia').value) || 0;
  const aldeanos = parseInt(document.getElementById('adAldeanos').value) || 0;
  const experience = parseInt(document.getElementById('adExperience').value) || 0;

  showNotif('Guardando cambios...', 'ok');

  const { error } = await sbClient.rpc('admin_apply_to_village', {
    p_village_id: adEditingVillage.id,
    p_owner_id: adEditingVillage.owner_id,
    p_madera: madera,
    p_piedra: piedra,
    p_hierro: hierro,
    p_prov: prov,
    p_esencia: esencia,
    p_aldeanos: aldeanos,
    p_experience: experience
  });

  if (error) {
    showNotif('Error guardando: ' + error.message, 'err');
  } else {
    showNotif('✓ Datos actualizados con éxito', 'ok');
    document.getElementById('adminMsg').textContent = `✓ Guardado: ${fmt(madera)}🌲 ${fmt(piedra)}⛰️ ${fmt(hierro)}⚙️ ${fmt(prov)}🌾`;

    // Si es nuestra propia aldea activa, forzamos recarga para ver cambios
    if (activeVillage && activeVillage.id === adEditingVillage.id) {
      await loadMyVillages();
      switchVillage(activeVillage.id);
    }
  }
}

// ── Admin — Reparación Global de misiones fantasma ──────────────
// Recorre TODAS las aldeas de TODOS los jugadores.
// Para cada aldea con misiones 'return' cuyo finish_at ya pasó
// (y no se resolvieron solas por el bug), devuelve las tropas
// respetando la capacidad de barracas y limpia la cola.
// Almacena el resultado del escaneo para usarlo en la fase de reparación
var _repairScanResults = null;

// ── FASE 1: Escanear — solo lectura, sin escribir nada ──────────
async function adminRepairAll() {
  if (!isAdmin()) { showNotif('Acceso denegado.', 'err'); return; }
  var { data: { user } } = await sbClient.auth.getUser();
  if (!user || user.email !== 'sementalac@gmail.com') {
    showNotif('Sesión no verificada. Vuelve a hacer login.', 'err'); return;
  }

  var logEl = document.getElementById('repairLog');
  var btnEl = document.getElementById('repairBtn');
  var confirmEl = document.getElementById('repairConfirmBox');
  if (!logEl || !btnEl) return;

  _repairScanResults = null;
  btnEl.disabled = true;
  btnEl.textContent = '⏳ Escaneando...';
  if (confirmEl) confirmEl.style.display = 'none';
  logEl.style.display = 'block';
  logEl.innerHTML = '<div style="color:var(--gold)">🔍 Escaneando todas las aldeas (solo lectura)...</div>';

  var now = Date.now();
  var affected = [];
  var log = [];

  try {
    var { data: allRows, error: scanErr } = await sbClient.rpc('admin_repair_scan');
    if (scanErr) throw new Error('Error en escaneo: ' + scanErr.message);
    if (!allRows || !allRows.length) {
      log.push('📋 0 aldeas encontradas — ' + new Date().toLocaleTimeString('es-ES'));
      log.push('✅ Todo correcto — ninguna aldea necesita reparación.');
      _repairScanResults = [];
      logEl.innerHTML = log.map(function (l) {
        return '<div style="color:var(--dim);margin-bottom:2px;">' + escapeHtml(l) + '</div>';
      }).join('');
      btnEl.disabled = false;
      btnEl.textContent = '🔍 Escanear de nuevo';
      return;
    }

    log.push('📋 ' + allRows.length + ' aldeas escaneadas — ' + new Date().toLocaleTimeString('es-ES'));
    log.push('─────────────────────────────────');

    for (var row of allRows) {
      var mq = Array.isArray(row.mission_queue) ? row.mission_queue : [];
      var stuck = mq.filter(function (m) {
        if (m.type !== 'return') return false;
        var ft = m.finish_at ? new Date(m.finish_at).getTime() : 0;
        return ft <= now;
      });

      var trpRow = row.troops || {};
      var bldRow = row.buildings || {};
      if (!trpRow || !bldRow) continue;

      var barrLvl = bldRow.barracas || 1;
      var _fakeBldScan = { barracas: { level: barrLvl } };
      var barrCap = getBarracksCapacity(_fakeBldScan);
      var otherSlots = 0;
      Object.keys(TROOP_TYPES).forEach(function (k) {
        if (k !== 'aldeano') otherSlots += (trpRow[k] || 0) * (TROOP_TYPES[k].barracasSlots || 1);
      });
      var maxAld = Math.max(0, barrCap - otherSlots);
      var currentAld = trpRow.aldeano || 0;
      var isOvercapped = currentAld > maxAld;

      var returningAld = 0;
      stuck.forEach(function (m) { returningAld += (m.troops && m.troops.aldeano) || 0; });

      if (stuck.length === 0 && !isOvercapped) continue;

      var playerName = row.username || (row.owner_id ? row.owner_id.substring(0, 8) + '…' : '?');
      var problems = [];
      if (stuck.length > 0) {
        var oldestStuck = stuck.reduce(function (min, m) {
          return new Date(m.finish_at).getTime() < new Date(min.finish_at).getTime() ? m : min;
        });
        var horasAtascado = Math.round((now - new Date(oldestStuck.finish_at).getTime()) / 3600000 * 10) / 10;
        problems.push(stuck.length + ' misión(es) retorno atascada(s) hace ' + horasAtascado + 'h · ' + returningAld + ' aldeanos esperando');
      }
      if (isOvercapped) {
        problems.push('sobreocupación: ' + currentAld + ' aldeanos en barracas de ' + barrCap + ' plazas (exceso: ' + (currentAld - maxAld) + ')');
      }

      // Construimos village object compatible con el resto del flujo
      var v = { id: row.village_id, name: row.village_name, owner_id: row.owner_id };
      affected.push({
        village: v, trpRow: trpRow, bldRow: bldRow,
        stuck: stuck, isOvercapped: isOvercapped,
        barrCap: barrCap, maxAld: maxAld, currentAld: currentAld,
        returningAld: returningAld, mq: mq
      });

      log.push('⚠️ [' + playerName + '] ' + (row.village_name || row.village_id));
      problems.forEach(function (p) { log.push('   → ' + p); });
    }

    log.push('─────────────────────────────────');
    if (affected.length === 0) {
      log.push('✅ Todo correcto — ninguna aldea necesita reparación.');
    } else {
      log.push('🔎 ' + affected.length + ' aldea(s) con problemas detectada(s).');
      log.push('Revisa el informe y confirma si quieres proceder.');
    }

    _repairScanResults = affected;

  } catch (e) {
    log.push('❌ Error crítico: ' + e.message);
    showNotif('Error en escaneo: ' + e.message, 'err');
  }

  logEl.innerHTML = log.map(function (l) {
    var color = l.startsWith('❌') ? 'var(--danger)'
      : l.startsWith('⚠️') ? 'var(--gold)'
        : l.startsWith('✅') ? 'var(--ok)'
          : l.startsWith('   →') ? '#ccc'
            : 'var(--dim)';
    return '<div style="color:' + color + ';margin-bottom:2px;">' + escapeHtml(l) + '</div>';
  }).join('');

  btnEl.disabled = false;
  btnEl.textContent = '🔍 Escanear de nuevo';

  if (confirmEl) {
    if (_repairScanResults && _repairScanResults.length > 0) {
      confirmEl.style.display = 'block';
      document.getElementById('repairConfirmCount').textContent = _repairScanResults.length;
    } else {
      confirmEl.style.display = 'none';
    }
  }
}

// ── FASE 2: Aplicar reparación — escribe en Supabase ───────────
async function adminRepairConfirm() {
  if (!isAdmin()) { showNotif('Acceso denegado.', 'err'); return; }
  if (!_repairScanResults || _repairScanResults.length === 0) {
    showNotif('Primero escanea para detectar problemas.', 'err'); return;
  }
  var { data: { user } } = await sbClient.auth.getUser();
  if (!user || user.email !== 'sementalac@gmail.com') {
    showNotif('Sesión no verificada.', 'err'); return;
  }

  var logEl = document.getElementById('repairLog');
  var confirmEl = document.getElementById('repairConfirmBox');
  var confirmBtn = document.getElementById('repairConfirmBtn');
  var now = Date.now();
  var log = ['🔧 APLICANDO REPARACIONES...', '─────────────────────────────────'];

  if (confirmBtn) confirmBtn.disabled = true;

  // Calcular los repairs para enviar al RPC
  var repairs = [];
  for (var entry of _repairScanResults) {
    var v = entry.village;
    var stuck = entry.stuck;
    var mq = entry.mq;
    var currentAld = entry.currentAld;
    var maxAld = entry.maxAld;
    var barrCap = entry.barrCap;
    var trpRow = entry.trpRow;
    var otherSlots = 0;
    Object.keys(TROOP_TYPES).forEach(function (k) {
      if (k !== 'aldeano') otherSlots += (trpRow[k] || 0) * (TROOP_TYPES[k].barracasSlots || 1);
    });

    var overcapFixed = 0;
    if (currentAld > maxAld) {
      overcapFixed = currentAld - maxAld;
      currentAld = maxAld;
    }

    var freeSlots = Math.max(0, barrCap - currentAld - otherSlots);
    var returningAld = 0;
    stuck.forEach(function (m) { returningAld += (m.troops && m.troops.aldeano) || 0; });

    var aldEntra = Math.min(returningAld, freeSlots);
    var newAld = currentAld + aldEntra;

    var newMq = mq.filter(function (m) {
      if (m.type !== 'return') return true;
      return new Date(m.finish_at).getTime() > now;
    });

    repairs.push({
      village_id: v.id,
      new_aldeanos: newAld,
      new_mission_queue: newMq
    });

    var linea = (stuck.length > 0 || overcapFixed > 0)
      ? '✅ ' + (v.name || v.id) + ':'
      : null;
    if (linea) {
      if (overcapFixed > 0) linea += ' exceso -' + overcapFixed + ' ald.';
      if (stuck.length > 0) linea += ' · ' + stuck.length + ' misión(es) · +' + aldEntra + ' ald. recuperados';
      if (returningAld - aldEntra > 0) linea += ' · ' + (returningAld - aldEntra) + ' perdidos (sin espacio)';
      log.push(linea);
    }
  }

  // Llamada única al RPC
  var { data: result, error: rpcErr } = await sbClient.rpc('admin_repair_apply', { p_repairs: repairs });

  log.push('─────────────────────────────────');
  if (rpcErr) {
    log.push('❌ Error aplicando reparaciones: ' + rpcErr.message);
    showNotif('Error en reparación: ' + rpcErr.message, 'err');
  } else {
    var fixed = result?.fixed ?? repairs.length;
    var errors = result?.errors ?? 0;
    log.push('✅ ' + fixed + ' aldea(s) reparadas' + (errors > 0 ? ' · ❌ ' + errors + ' errores' : ''));
    showNotif('Reparación completada: ' + fixed + ' aldeas arregladas.', 'ok');
  }

  logEl.innerHTML = log.map(function (l) {
    var color = l.startsWith('❌') ? 'var(--danger)' : l.startsWith('✅') ? 'var(--ok)' : l.startsWith('🔧') ? 'var(--gold)' : 'var(--dim)';
    return '<div style="color:' + color + ';margin-bottom:2px;">' + escapeHtml(l) + '</div>';
  }).join('');

  if (confirmEl) confirmEl.style.display = 'none';
  if (confirmBtn) confirmBtn.disabled = false;
  _repairScanResults = null;

  if (activeVillage) {
    await loadMyVillages();
    switchVillage(activeVillage.id);
  }
}

function closeAdmin() { document.getElementById('adminOverlay').classList.add('hidden'); }

// v1.17: Página de usuarios admin (solo para sementalac@gmail.com)
let _adminUsersPageCache = [];

function openAdminUsersPage() {
  if (!currentUser || currentUser.email !== 'sementalac@gmail.com') {
    showNotif('Acceso denegado', 'err');
    return;
  }

  closeAdmin(); // Cerrar el panel admin modal
  showPage('admin-users', null); // Mostrar la página
  loadAdminUsersPage();
}

// ============================================================
// ALDEAS FANTASMA — Test PvP sin jugadores reales
// owner_id = '00000000-0000-0000-0000-000000000000' (UUID centinela ghost)
// ============================================================

function ghostToggleForm() {
  var f = document.getElementById('ghostForm');
  var open = f.style.display === 'none';
  f.style.display = open ? 'block' : 'none';
  if (open) {
    // Renderizar inputs de tropas
    var box = document.getElementById('ghostTroopInputs');
    if (box) {
      box.innerHTML = Object.keys(TROOP_TYPES).map(function (k) {
        var t = TROOP_TYPES[k];
        return '<div style="background:var(--panel2);border:1px solid var(--border);border-radius:3px;padding:5px 6px;">'
          + '<div style="font-size:.6rem;color:var(--dim);margin-bottom:2px;">' + t.icon + ' ' + t.name + '</div>'
          + '<input type="number" id="ghostTroop_' + k + '" value="0" min="0" '
          + 'style="width:100%;background:transparent;border:none;color:var(--text);font-family:VT323,monospace;font-size:.9rem;outline:none;">'
          + '</div>';
      }).join('')
        + Object.keys(CREATURE_TYPES).map(function (k) {
          var c = CREATURE_TYPES[k];
          return '<div style="background:var(--panel2);border:1px solid var(--border);border-radius:3px;padding:5px 6px;">'
            + '<div style="font-size:.6rem;color:var(--accent2);margin-bottom:2px;">' + c.icon + ' ' + c.name + '</div>'
            + '<input type="number" id="ghostTroop_' + k + '" value="0" min="0" '
            + 'style="width:100%;background:transparent;border:none;color:var(--text);font-family:VT323,monospace;font-size:.9rem;outline:none;">'
            + '</div>';
        }).join('');
    }
    loadGhostList();
  }
}

async function ghostCreate() {
  if (!isAdmin()) return;
  var name = (document.getElementById('ghostName').value || '').trim() || 'Aldea Fantasma';
  var cx = parseInt(document.getElementById('ghostX').value) || 100;
  var cy = parseInt(document.getElementById('ghostY').value) || 100;
  var wall = parseInt(document.getElementById('ghostWall').value) || 0;

  if (cx < 1 || cx > MAP_SIZE || cy < 1 || cy > MAP_SIZE) {
    showNotif('Coordenadas fuera del mapa (1-' + MAP_SIZE + ')', 'err'); return;
  }

  var troops = {}, creatures = {};
  Object.keys(TROOP_TYPES).forEach(function (k) {
    var v = parseInt((document.getElementById('ghostTroop_' + k) || {}).value) || 0;
    if (v > 0) troops[k] = v;
  });
  Object.keys(CREATURE_TYPES).forEach(function (k) {
    var v = parseInt((document.getElementById('ghostTroop_' + k) || {}).value) || 0;
    if (v > 0) creatures[k] = v;
  });

  if (!Object.values(troops).concat(Object.values(creatures)).some(function (n) { return n > 0; })) {
    showNotif('Pon al menos 1 tropa', 'err'); return;
  }

  var ir = await sbClient.rpc('admin_ghost_create', {
    p_name: name,
    p_cx: cx,
    p_cy: cy,
    p_wall: wall,
    p_troops: troops,
    p_creatures: creatures
  });

  if (ir.error) {
    showNotif('Error: ' + (ir.error.message || ir.error.code), 'err');
    return;
  }
  showNotif('🏚️ Aldea fantasma "' + name + '" creada en [' + cx + ',' + cy + ']', 'ok');
  document.getElementById('ghostName').value = '';
  Object.keys(TROOP_TYPES).concat(Object.keys(CREATURE_TYPES)).forEach(function (k) {
    var el = document.getElementById('ghostTroop_' + k);
    if (el) el.value = 0;
  });
  loadGhostList();
  if (typeof renderMap === 'function') setTimeout(renderMap, 300);
}

async function loadGhostList() {
  var box = document.getElementById('ghostList');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--dim);font-size:.65rem;">Cargando...</div>';
  try {
    var r = await sbClient.rpc('admin_ghost_list');
    if (r.error || !r.data || r.data.length === 0) {
      box.innerHTML = '<div style="color:var(--dim);font-size:.65rem;">No hay aldeas fantasma.</div>';
      return;
    }
    box.innerHTML = r.data.map(function (v) {
      var wall = v.wall || 0;
      var tr = v.troops || {};
      var cr = v.creatures || {};
      var troopStr = Object.keys(TROOP_TYPES).concat(Object.keys(CREATURE_TYPES))
        .filter(function (k) { return ((tr[k] || 0) + (cr[k] || 0)) > 0; })
        .map(function (k) {
          var t = TROOP_TYPES[k] || CREATURE_TYPES[k];
          var n = (tr[k] || 0) + (cr[k] || 0);
          return (t ? t.icon : '') + n;
        }).join(' ') || 'sin tropas';
      return '<div style="display:flex;justify-content:space-between;align-items:center;background:var(--panel2);border:1px solid var(--border);border-radius:3px;padding:7px 10px;margin-bottom:4px;">'
        + '<div>'
        + '<div style="font-family:VT323,monospace;font-size:.95rem;color:var(--text);">🏚️ ' + escapeHtml(v.name) + ' <span style="color:var(--dim);font-size:.7rem;">[' + v.cx + ',' + v.cy + ']' + (wall > 0 ? ' 🏰nv.' + wall : '') + '</span></div>'
        + '<div style="font-size:.62rem;color:var(--dim);margin-top:2px;">' + troopStr + '</div>'
        + '</div>'
        + '<button onclick="ghostDelete(\'' + v.id + '\',\'' + escapeAttr(v.name) + '\')" style="background:rgba(255,61,90,.1);border:1px solid rgba(255,61,90,.3);color:var(--danger);padding:3px 8px;border-radius:3px;font-size:.62rem;cursor:pointer;">✗ Borrar</button>'
        + '</div>';
    }).join('');
  } catch (e) {
    box.innerHTML = '<div style="color:var(--danger);font-size:.65rem;">Error: ' + (e.message || e) + '</div>';
  }
}

async function ghostDelete(id, name) {
  if (!isAdmin()) return;
  if (!confirm('¿Borrar aldea fantasma "' + name + '"?')) return;

  // Intentar RPC primero, con fallback a borrado directo
  var r = await sbClient.rpc('admin_ghost_delete', { p_id: id });
  if (r.error) {
    console.warn('RPC admin_ghost_delete falló, intentando DELETE directo:', r.error.message);
    var r2 = await sbClient.from('villages').delete().eq('id', id);
    if (r2.error) { showNotif('Error borrando: ' + r2.error.message, 'err'); return; }
  }
  showNotif('🗑️ Aldea "' + name + '" eliminada', 'ok');
  loadGhostList();
  if (typeof loadAllVillages === 'function') loadAllVillages();
  if (typeof renderMap === 'function') setTimeout(renderMap, 300);
}

async function loadAdminUsersPage() {
  const res = await sbClient.from('profiles').select('id,username,role').order('username');
  if (res.error) {
    document.getElementById('adminUsersPageList').innerHTML = '<div style="color:var(--danger);">Error: ' + escapeHtml(res.error.message) + '</div>';
    return;
  }

  _adminUsersPageCache = res.data || [];
  renderAdminUsersPage();
}

function filterAdminUsersPage() {
  renderAdminUsersPage();
}

function renderAdminUsersPage() {
  const search = (document.getElementById('adminUsersSearch')?.value || '').toLowerCase();
  let filtered = _adminUsersPageCache;

  if (search) {
    filtered = _adminUsersPageCache.filter(u => (u.username || '').toLowerCase().includes(search));
  }

  const list = document.getElementById('adminUsersPageList');
  if (!filtered.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--dim);">Sin usuarios</div>';
    return;
  }

  let html = '';
  filtered.forEach(u => {
    const isMe = u.id === currentUser.id;
    html += '<div style="padding:10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:4px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">'
      + '<div style="flex:1;">'
      + '<div style="font-weight:bold;color:var(--text);">' + escapeHtml(u.username || '-') + (isMe ? ' (tú)' : '') + '</div>'
      + '<div style="font-size:.65rem;color:var(--dim);">' + (u.role === 'admin' ? '👑 Admin' : '👤 Jugador') + '</div>'
      + '</div>'
      + '<div>'
      + (isMe ? '' : '<button onclick="adminDeleteUserFromPage(\'' + escapeJs(u.id) + '\',\'' + escapeJs(u.username || '-') + '\')" style="padding:4px 8px;background:rgba(255,61,90,.2);border:1px solid rgba(255,61,90,.4);border-radius:3px;color:rgba(255,61,90,.8);font-size:.7rem;cursor:pointer;">🗑 Borrar</button>')
      + '</div>'
      + '</div>';
  });

  list.innerHTML = html;
}

async function adminDeleteUserFromPage(userId, username) {
  if (!confirm('¿Borrar la cuenta de "' + username + '"?\nEsto eliminará todas sus aldeas y datos.\nEsta acción no se puede deshacer.')) return;
  try {
    const r = await sbClient.rpc('admin_delete_user', { target_user_id: userId });
    if (!r.error) {
      showNotif('✓ Usuario "' + username + '" eliminado completamente', 'ok');
      loadAdminUsersPage();
      return;
    }
    console.warn('RPC admin_delete_user falló, usando borrado directo:', r.error.message);
    await _adminDeleteUserData(userId, username);
  } catch (e) {
    console.error('adminDeleteUserFromPage error:', e);
    showNotif('Error al eliminar: ' + e.message, 'err');
  }
}

// ── Admin dropdown de usuarios (v1.12) ──
let _adminUsersCache = [];

function toggleAdminUsersDropdown() {
  const dropdown = document.getElementById('adminUsersDropdown');
  const isVisible = dropdown.classList.contains('visible');
  if (!isVisible) {
    loadAllAdminUsers();
  } else {
    dropdown.classList.remove('visible');
  }
}

async function loadAllAdminUsers() {
  if (!isAdmin()) return;
  const dropdown = document.getElementById('adminUsersDropdown');
  const list = document.getElementById('adminUsersList');

  list.innerHTML = '<div style="font-size: .7rem; text-align: center; color: var(--dim);">Cargando usuarios...</div>';
  dropdown.classList.add('visible');

  const res = await sbClient.from('profiles').select('id,username,role').order('username');
  if (res.error) {
    list.innerHTML = '<div style="font-size: .7rem; text-align: center; color: var(--danger);">Error: ' + escapeHtml(res.error.message) + '</div>';
    return;
  }

  _adminUsersCache = res.data || [];
  renderAdminUsersList();
}

function renderAdminUsersList() {
  const list = document.getElementById('adminUsersList');
  const filterInput = document.getElementById('adUsersSearchInp');
  const filterTerm = (filterInput?.value || '').toLowerCase().trim();

  let filtered = _adminUsersCache;
  if (filterTerm) {
    filtered = _adminUsersCache.filter(u => (u.username || '').toLowerCase().includes(filterTerm));
  }

  if (!filtered.length) {
    list.innerHTML = '<div style="font-size: .7rem; text-align: center; color: var(--dim);">No se encontraron usuarios</div>';
    return;
  }

  let html = '';
  filtered.forEach(u => {
    const isMe = u.id === currentUser.id;
    const roleClass = u.role === 'admin' ? 'style="color:var(--danger);font-weight:bold;"' : '';
    html += `<div class="admin-users-item">
      <div class="admin-users-item-info">
        <div class="admin-users-item-name">${escapeHtml(u.username || '-')}${isMe ? ' (tú)' : ''}</div>
        <div class="admin-users-item-role" ${roleClass}>${escapeHtml(u.role || 'player')}</div>
      </div>
      <button class="admin-users-item-del" onclick="adminDeleteUser('${u.id}', '${escapeJs(u.username || '-')}')">🗑</button>
    </div>`;
  });

  list.innerHTML = html;
}

function filterAdminUsers() {
  renderAdminUsersList();
}

// ── Admin usuarios ──
async function loadAdminUsers(searchTerm) {
  if (!isAdmin()) return;
  var box = document.getElementById('adminUsersBox');
  var count = document.getElementById('adminUserCount');
  if (box) box.innerHTML = '<div class="muted">Cargando usuarios…</div>';

  // Carga perfiles con aldeas
  let query = sbClient.from('profiles').select('id,username,role,username_changed').order('username');

  // Si hay término de búsqueda, filtrar
  if (searchTerm && searchTerm.trim()) {
    query = query.ilike('username', '%' + searchTerm.trim() + '%');
  }

  const p = await query;
  if (p.error) { if (box) box.innerHTML = '<div class="muted">Error: ' + escapeHtml(p.error.message) + '</div>'; return; }
  const users = p.data || [];
  if (count) count.textContent = users.length + ' usuario' + (users.length !== 1 ? 's' : '') + (searchTerm ? ' encontrado' + (users.length !== 1 ? 's' : '') : ' registrados');

  if (users.length === 0) {
    if (box) box.innerHTML = '<div class="muted">No se encontraron usuarios</div>';
    return;
  }

  let html = '<table class="admin-users-table"><thead><tr>'
    + '<th>Usuario</th><th>Email (ID)</th><th>Rol</th><th>Nombre cambiado</th><th>Acción</th>'
    + '</tr></thead><tbody>';

  users.forEach(u => {
    const isMe = u.id === currentUser.id;
    html += '<tr>'
      + '<td><b style="cursor:pointer;color:var(--accent);text-decoration:underline;" onclick="viewAdminUserDetails(\'' + u.id + '\',\'' + escapeJs(u.username || '-') + '\')">' + escapeHtml(u.username || '-') + '</b>' + (isMe ? ' <span style="color:var(--gold)">(tú)</span>' : '') + '</td>'
      + '<td style="font-size:.6rem;color:var(--dim)">' + escapeHtml(u.id.substring(0, 12)) + '…</td>'
      + '<td class="' + (u.role === 'admin' ? 'admin-role' : '') + '">' + escapeHtml(u.role || 'player') + '</td>'
      + '<td>' + (u.username_changed ? '✅' : '—') + '</td>'
      + '<td>' + (isMe ? '<span style="color:var(--dim);font-size:.6rem">No puedes borrarte</span>'
        : '<button class="admin-del-btn" onclick="adminDeleteUser(\'' + u.id + '\',\'' + escapeJs(u.username || '-') + '\')">🗑 Borrar</button>') + '</td>'
      + '</tr>';
  });
  html += '</tbody></table>';
  if (box) box.innerHTML = html;
}

async function searchAdminUser() {
  const input = document.getElementById('adminSearchUser');
  const searchTerm = input ? input.value : '';
  await loadAdminUsers(searchTerm);
}

async function viewAdminUserDetails(userId, username) {
  if (!isAdmin()) return;

  // Obtener datos del usuario
  const profile = await sbClient.from('profiles').select('*').eq('id', userId).single();
  const villages = await sbClient.from('villages').select('id,name,cx,cy,state,last_updated').eq('owner_id', userId);
  const objectives = await sbClient.from('player_objectives').select('*').eq('user_id', userId);

  if (profile.error) {
    showNotif('Error cargando perfil: ' + profile.error.message, 'err');
    return;
  }

  const p = profile.data;
  const vills = villages.data || [];
  const objs = objectives.data || [];

  let info = '═══════════════════════════════\n';
  info += '👤 USUARIO: ' + username + '\n';
  info += '═══════════════════════════════\n\n';
  info += '📧 Email: ' + (currentUser.id === userId ? currentUser.email : 'Oculto') + '\n';
  info += '🆔 ID: ' + userId + '\n';
  info += '🎖️ Rol: ' + (p.role || 'player') + '\n';
  info += '⭐ XP: ' + (p.experience || 0) + '\n';
  info += '⚔️ Score Militar: ' + (p.military_score || 0) + '\n';
  info += '✏️ Nombre cambiado: ' + (p.username_changed ? 'Sí' : 'No') + '\n';
  info += '🕐 Última vez visto: ' + (p.last_seen ? new Date(p.last_seen).toLocaleString('es-ES') : 'Nunca') + '\n\n';

  info += '🏘️ ALDEAS (' + vills.length + '):\n';
  info += '─────────────────────────────\n';
  if (vills.length === 0) {
    info += '  Sin aldeas\n';
  } else {
    vills.forEach((v, i) => {
      info += '  ' + (i + 1) + '. ' + v.name + ' [' + v.cx + ',' + v.cy + ']\n';
      if (v.state && v.state.resources) {
        var res = v.state.resources;
        info += '     Recursos: 🌲' + Math.floor(res.madera || 0) + ' ⛰️' + Math.floor(res.piedra || 0) + ' ⚙️' + Math.floor(res.hierro || 0) + ' 🌾' + Math.floor(res.provisiones || 0) + ' ✨' + Math.floor(res.esencia || 0) + '\n';
      }
    });
  }

  info += '\n🎯 OBJETIVOS NPC (' + objs.length + '):\n';
  info += '─────────────────────────────\n';
  if (objs.length === 0) {
    info += '  Sin objetivos completados\n';
  } else {
    const cleared = objs.filter(o => o.status === 'cleared').length;
    info += '  Completados: ' + cleared + ' / ' + objs.length + '\n';
  }

  alert(info);
}

async function adminDeleteUser(userId, username) {
  if (!isAdmin()) return;
  if (!confirm('¿Borrar la cuenta de "' + username + '"?\nEsto eliminará todas sus aldeas y datos.\nEsta acción no se puede deshacer.')) return;
  try {
    // Intentar RPC primero (si está definido con service_role en Supabase)
    const r = await sbClient.rpc('admin_delete_user', { target_user_id: userId });
    if (!r.error) {
      showNotif('✓ Usuario "' + username + '" eliminado completamente', 'ok');
      await loadAdminUsers();
      return;
    }
    // Fallback: borrar datos directamente tabla a tabla (no borra auth.users)
    console.warn('RPC admin_delete_user falló (' + r.error.message + '), usando borrado directo de tablas...');
    await _adminDeleteUserData(userId, username);
  } catch (e) {
    console.error('adminDeleteUser error:', e);
    showNotif('Error al eliminar: ' + e.message, 'err');
  }
}

// Borra todos los datos de juego de un usuario (sin tocar auth.users)
async function _adminDeleteUserData(userId, username) {
  var steps = [];
  var errors = [];

  async function tryDelete(label, promise) {
    try { var r = await promise; if (r.error) errors.push(label + ': ' + r.error.message); else steps.push('✓ ' + label); }
    catch (e) { errors.push(label + ': ' + e.message); }
  }

  // 1. Sacar de alianzas
  await tryDelete('alliance_members', sbClient.from('alliance_members').delete().eq('user_id', userId));

  // 2. Mensajes y hilos
  await tryDelete('messages (sender)', sbClient.from('messages').delete().eq('sender_id', userId));
  await tryDelete('thread_members', sbClient.from('thread_members').delete().eq('user_id', userId));

  // 3. Objetivos (tabla real: player_objectives)
  await tryDelete('player_objectives', sbClient.from('player_objectives').delete().eq('user_id', userId));

  // 4. Aldeas y sus dependencias (ORDEN CRÍTICO: primero hijos, luego aldeas)
  const vills = await sbClient.from('villages').select('id').eq('owner_id', userId);
  if (!vills.error && vills.data && vills.data.length > 0) {
    var villIds = vills.data.map(function (v) { return v.id; });
    // v1.49: troops/resources/creatures ya no tienen FK a villages (datos en state jsonb)
    // Liberar cuevas capturadas por este usuario (marcarlas wild)
    await sbClient.from('caves').update({ status: 'wild', owner_id: null, village_id: null })
      .eq('owner_id', userId).then(function () { }).catch(function () { });
    // Ahora sí borrar aldeas
    await tryDelete('villages', sbClient.from('villages').delete().eq('owner_id', userId));
  }

  // 5. Perfil (último, es la fk raíz)
  await tryDelete('profiles', sbClient.from('profiles').delete().eq('id', userId));

  if (errors.length === 0) {
    showNotif('✓ Datos de "' + username + '" eliminados.', 'ok');
    console.info('Borrado completo. Si el usuario puede volver a loguearse (cuenta auth activa), crea el RPC admin_delete_user en Supabase con SECURITY DEFINER y llama a auth.users delete.');
  } else {
    showNotif('Borrado parcial de "' + username + '" — ' + errors.length + ' error(es). Ver consola.', 'err');
    console.error('Errores en borrado:', errors);
    console.info('Pasos completados:', steps);
  }

  if (typeof loadAdminUsers === 'function') await loadAdminUsers();
  if (typeof loadAdminUsersPage === 'function') await loadAdminUsersPage();
  // renderAdminUsersList solo si el elemento existe (evita el error null.innerHTML)
  var adminUsersList = document.getElementById('adminUsersList');
  if (typeof renderAdminUsersList === 'function' && adminUsersList) renderAdminUsersList();
}


// ============================================================
// ADMIN — GESTIÓN DE ALIANZAS
// ============================================================

async function loadAdminAlliances() {
  var box = document.getElementById('adminAlliancesBox');
  if (!box) return;
  box.innerHTML = '<div class="muted">Cargando...</div>';

  var r = await sbClient.from('alliances')
    .select('id,name,tag,created_at')
    .order('name');

  if (r.error) {
    box.innerHTML = '<div class="muted" style="color:var(--danger)">Error: ' + escapeHtml(r.error.message) + '</div>';
    return;
  }
  if (!r.data || r.data.length === 0) {
    box.innerHTML = '<div class="muted">No hay alianzas registradas.</div>';
    return;
  }

  // Cargar conteo de miembros activos de golpe
  var mr = await sbClient.from('alliance_members')
    .select('alliance_id')
    .eq('status', 'active');
  var memberCounts = {};
  if (!mr.error && mr.data) {
    mr.data.forEach(function (m) {
      memberCounts[m.alliance_id] = (memberCounts[m.alliance_id] || 0) + 1;
    });
  }

  // Cargar líderes
  var lr = await sbClient.from('alliance_members')
    .select('alliance_id,profiles(username)')
    .eq('role', 'leader')
    .eq('status', 'active');
  var leaderMap = {};
  if (!lr.error && lr.data) {
    lr.data.forEach(function (m) {
      leaderMap[m.alliance_id] = (m.profiles && m.profiles.username) ? m.profiles.username : '?';
    });
  }

  var html = '<div class="table">'
    + '<div class="trow thead"><div>TAG</div><div>Nombre</div><div>Líder</div><div style="text-align:center">Miembros</div><div></div></div>';

  r.data.forEach(function (al) {
    var count = memberCounts[al.id] || 0;
    var leader = leaderMap[al.id] || '—';
    html += '<div class="trow">'
      + '<div><span style="background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.2);border-radius:3px;padding:1px 6px;color:var(--accent);font-family:VT323,monospace;font-size:.75rem;">' + escapeHtml(al.tag) + '</span></div>'
      + '<div style="color:var(--text);">' + escapeHtml(al.name) + '</div>'
      + '<div style="color:var(--dim);font-size:.78rem;">👑 ' + escapeHtml(leader) + '</div>'
      + '<div style="text-align:center;color:var(--dim);font-size:.82rem;">' + count + '</div>'
      + '<div style="display:flex;gap:4px;">'
      + '<button class="btn btn-sm" onclick="adminInspectAlliance(\'' + al.id + '\',\'' + escapeAttr(al.tag) + '\')">👁 Ver</button>'
      + '<button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" onclick="adminDeleteAlliance(\'' + al.id + '\',\'' + escapeAttr(al.name) + '\')">✕ Borrar</button>'
      + '</div>'
      + '</div>';
  });
  html += '</div>';
  box.innerHTML = html;
}

async function adminInspectAlliance(allianceId, tag) {
  if (!isAdmin()) return;
  // Cargar miembros de la alianza
  var r = await sbClient.from('alliance_members')
    .select('user_id,role,status,profiles(username)')
    .eq('alliance_id', allianceId)
    .order('role');

  if (r.error) { showNotif('Error: ' + r.error.message, 'err'); return; }

  var members = r.data || [];
  var prev = document.getElementById('adminAllianceInspectBox');
  if (prev) prev.remove();

  var overlay = document.createElement('div');
  overlay.id = 'adminAllianceInspectBox';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

  var statuses = { active: 'Activo', pending: 'Solicitud', invited: 'Invitado' };
  var statusColors = { active: 'var(--ok)', pending: 'var(--gold)', invited: 'var(--accent)' };

  var rows = members.map(function (m) {
    var uname = (m.profiles && m.profiles.username) ? escapeHtml(m.profiles.username) : m.user_id.slice(0, 8);
    var roleBadge = m.role === 'leader'
      ? '<span style="color:var(--gold);font-size:.7rem;">👑 Líder</span>'
      : '<span style="color:var(--dim);font-size:.7rem;">Miembro</span>';
    var statusBadge = '<span style="color:' + (statusColors[m.status] || 'var(--dim)') + ';font-size:.7rem;">' + (statuses[m.status] || m.status) + '</span>';
    return '<div class="trow">'
      + '<div>' + uname + '</div>'
      + '<div>' + roleBadge + '</div>'
      + '<div>' + statusBadge + '</div>'
      + '<div><button class="btn btn-sm" style="background:rgba(224,64,64,.1);border-color:var(--danger);color:var(--danger);" '
      + 'onclick="adminKickFromAlliance(\'' + allianceId + '\',\'' + m.user_id + '\',\'' + escapeAttr(uname) + '\')">✕ Expulsar</button></div>'
      + '</div>';
  }).join('');

  var box = document.createElement('div');
  box.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:20px;width:min(520px,90vw);max-height:80vh;overflow-y:auto;';
  box.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<div style="font-family:VT323,monospace;font-size:1.2rem;color:var(--accent);">⚔️ Alianza [' + escapeHtml(tag) + '] — ' + members.length + ' miembro(s)</div>'
    + '<button onclick="document.getElementById(\'adminAllianceInspectBox\').remove()" style="background:none;border:none;color:var(--dim);font-size:1.2rem;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div class="table"><div class="trow thead"><div>Jugador</div><div>Rol</div><div>Estado</div><div></div></div>'
    + rows
    + '</div>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

async function adminKickFromAlliance(allianceId, userId, username) {
  if (!confirm('¿Expulsar a ' + username + ' de esta alianza?')) return;
  var r = await sbClient.from('alliance_members').delete()
    .eq('alliance_id', allianceId).eq('user_id', userId);
  if (r.error) { showNotif('Error: ' + r.error.message, 'err'); return; }
  showNotif('✓ ' + username + ' expulsado de la alianza', 'ok');
  // Recargar el overlay
  var overlay = document.getElementById('adminAllianceInspectBox');
  if (overlay) overlay.remove();
  await loadAdminAlliances();
}

async function adminDeleteAlliance(id, name) {
  if (!isAdmin()) return;
  if (!confirm('¿Borrar la alianza "' + name + '"?\nTodos los miembros serán expulsados.\nEsta acción no se puede deshacer.')) return;

  var r1 = await sbClient.from('alliance_members').delete().eq('alliance_id', id);
  if (r1.error) { showNotif('Error al expulsar miembros: ' + r1.error.message, 'err'); return; }

  var r2 = await sbClient.from('alliances').delete().eq('id', id);
  if (r2.error) { showNotif('Error al borrar alianza: ' + r2.error.message, 'err'); return; }

  showNotif('✓ Alianza "' + name + '" eliminada', 'ok');
  loadAdminAlliances();
}

// Abre la sección de alianzas en el panel admin
function openAdminAlliancesSection() {
  if (!isAdmin()) { showNotif('Acceso denegado.', 'err'); return; }
  var box = document.getElementById('adminAlliancesSection');
  if (!box) {
    // Crear la sección dinámicamente si no existe en el HTML
    _injectAdminAlliancesUI();
    return;
  }
  var isVisible = box.style.display !== 'none';
  box.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) loadAdminAlliances();
}

function _injectAdminAlliancesUI() {
  // Inyectar sección de alianzas dentro del admin overlay si no existe
  var target = document.getElementById('adminOverlay');
  if (!target) return;

  // Buscar un buen punto de inserción (después del ghostForm o al final del overlay)
  var existing = document.getElementById('adminAlliancesSection');
  if (existing) { existing.style.display = 'block'; loadAdminAlliances(); return; }

  var section = document.createElement('div');
  section.id = 'adminAlliancesSection';
  section.style.cssText = 'margin-top:16px;';
  section.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    + '<div style="font-family:VT323,monospace;font-size:1rem;color:var(--accent2);">⚔️ GESTIÓN DE ALIANZAS</div>'
    + '<button class="btn btn-sm" onclick="loadAdminAlliances()">🔄 Recargar</button>'
    + '</div>'
    + '<div id="adminAlliancesBox"><div class="muted">Cargando...</div></div>';

  // Insertar después del ghostList o al final del contenido admin
  var ghostArea = document.getElementById('ghostList');
  if (ghostArea && ghostArea.parentNode) {
    ghostArea.parentNode.insertBefore(section, ghostArea.nextSibling);
  } else {
    var adminContent = target.querySelector('.admin-content') || target;
    adminContent.appendChild(section);
  }

  loadAdminAlliances();
}

// ============================================================
// ADMIN — SECCIÓN DE CUEVAS (integración con panel admin)
// ============================================================

function openAdminCavesSection() {
  if (!isAdmin()) { showNotif('Acceso denegado.', 'err'); return; }

  var existing = document.getElementById('adminCavesSection');
  if (existing) {
    var visible = existing.style.display !== 'none';
    existing.style.display = visible ? 'none' : 'block';
    if (!visible) loadAdminCaves();
    return;
  }

  // Crear sección e inyectarla en el overlay de admin
  var section = document.createElement('div');
  section.id = 'adminCavesSection';
  section.style.cssText = 'margin-top:16px;';
  section.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
    + '<div style="font-family:VT323,monospace;font-size:1.1rem;color:var(--gold);">⛏️ GESTIÓN DE CUEVAS</div>'
    + '<button class="btn btn-sm" onclick="loadAdminCaves()">🔄 Recargar</button>'
    + '</div>'
    + '<div id="adminCavesBox"><div class="muted">Cargando…</div></div>';

  // Insertar al final del contenido del admin overlay
  var adminContent = document.querySelector('#adminOverlay .admin-content')
    || document.getElementById('adminOverlay');
  if (adminContent) adminContent.appendChild(section);

  loadAdminCaves();
}

// ============================================================
// ADMIN — GOD MODE (MAP INTERACTION)
// ============================================================

async function adminSpawnGhostMap(x, y) {
  if (!isAdmin()) return;
  var name = prompt('Nombre de la aldea fantasma:', 'Aldea Fantasma');
  if (name === null) return;

  var wall = parseInt(prompt('Nivel del muro:', '1')) || 1;
  var troops = { guerrero: 100, arquero: 50 };
  var creatures = { guardiancueva: 1 };

  var ir = await sbClient.rpc('admin_ghost_create', {
    p_name: name,
    p_cx: x,
    p_cy: y,
    p_wall: wall,
    p_troops: troops,
    p_creatures: creatures
  });

  if (ir.error) {
    showNotif('Error: ' + (ir.error.message || ir.error.code), 'err');
    return;
  }
  showNotif('🏚️ Fantasma creado en [' + x + ',' + y + ']', 'ok');
  if (typeof renderMap === 'function') setTimeout(renderMap, 300);
}

async function adminSpawnCaveMap(x, y) {
  if (!isAdmin()) return;
  if (!confirm('¿Crear una cueva salvaje en [' + x + ',' + y + ']?')) return;

  var type = prompt('Tipo de guardián (guardiancueva o arana_gigante):', 'guardiancueva');
  if (!type) return;

  try {
    var r = await sbClient.from('caves').insert({
      cx: x,
      cy: y,
      status: 'wild',
      guardian_type: type
    });
    if (r.error) throw r.error;

    showNotif('⛏️ Cueva creada en [' + x + ',' + y + ']', 'ok');
    if (typeof loadCaves === 'function') await loadCaves(true);
    if (typeof renderMap === 'function') renderMap();
  } catch (e) {
    showNotif('Error: ' + (e.message || e), 'err');
  }
}

async function adminTeleportMap(x, y) {
  if (!isAdmin()) return;
  if (!activeVillage) return;
  if (!confirm('¿Teletransportar "' + activeVillage.name + '" a [' + x + ',' + y + ']?')) return;

  try {
    var { error: rErr } = await sbClient.from('villages').update({ x: x, y: y }).eq('id', activeVillage.id);
    if (rErr) throw rErr;

    activeVillage.x = x;
    activeVillage.y = y;
    showNotif('🌌 Aldea teletransportada!', 'ok');
    if (typeof renderMap === 'function') {
      mapCamX = x;
      mapCamY = y;
      renderMap();
    }
  } catch (e) {
    showNotif('Error: ' + (e.message || e), 'err');
  }
}

async function adminDeleteCaveMap(caveId) {
  if (!isAdmin()) return;
  if (!confirm('¿Eliminar esta cueva permanentemente?')) return;

  try {
    var { error: rErr } = await sbClient.from('caves').delete().eq('id', caveId);
    if (rErr) throw rErr;

    showNotif('🗑️ Cueva eliminada', 'ok');
    if (typeof loadCaves === 'function') await loadCaves(true);
    if (typeof renderMap === 'function') renderMap();
  } catch (e) {
    showNotif('Error: ' + (e.message || e), 'err');
  }
}

async function sendGlobalAnnouncement() {
  if (!isAdmin()) return;
  var text = (document.getElementById('motdInput').value || '').trim();
  if (!text) {
    showNotif('Escribe algo en el cuadro del MOTD primero.', 'info');
    return;
  }

  if (!confirm('¿Enviar este mensaje como anuncio instantáneo a TODO el servidor?')) return;

  try {
    const channel = sbClient.channel('global-announcements');
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const resp = await channel.send({
          type: 'broadcast',
          event: 'announcement',
          payload: { message: text }
        });

        if (resp === 'ok') {
          showNotif('⚡ Anuncio enviado instantáneamente.', 'ok');
          saveMOTD();
        } else {
          showNotif('Error al enviar broadcast: ' + resp, 'err');
        }
      }
    });
  } catch (e) {
    showNotif('Error: ' + (e.message || e), 'err');
  }
}

async function loadAdminActivity() {
  if (!isAdmin()) return;
  var box = document.getElementById('adminActivityLog');
  if (!box) return;

  box.innerHTML = '<div style="color:var(--dim);text-align:center;padding:10px;">Cargando actividad...</div>';

  try {
    // 1. Aldeas recientes (Fundaciones)
    var { data: vills, error: vErr } = await sbClient.from('villages')
      .select('name,x,y,created_at,owner_id,profiles(username)')
      .order('created_at', { ascending: false })
      .limit(10);

    // 2. Mensajes de sistema (Batallas/Espionajes)
    var { data: msgs, error: mErr } = await sbClient.from('messages')
      .select('body,created_at,sender_id')
      .is('sender_id', null)
      .order('created_at', { ascending: false })
      .limit(15);

    if (vErr || mErr) throw (vErr || mErr);

    var events = [];

    (vills || []).forEach(v => {
      events.push({
        ts: new Date(v.created_at),
        type: '🏠',
        text: 'NUEVA ALDEA: "' + v.name + '" en [' + v.x + ',' + v.y + '] por ' + (v.profiles ? v.profiles.username : 'desconocido')
      });
    });

    (msgs || []).forEach(m => {
      var body = m.body || '';
      var title = body.split('\n')[0] || 'Evento de sistema';
      var type = '🔔';
      if (title.includes('BATALLA') || title.includes('⚔️')) type = '⚔️';
      if (title.includes('ESPIONAJE') || title.includes('🔍')) type = '🔍';

      events.push({
        ts: new Date(m.created_at),
        type: type,
        text: title
      });
    });

    events.sort((a, b) => b.ts - a.ts);

    if (events.length === 0) {
      box.innerHTML = '<div style="color:var(--dim);text-align:center;padding:10px;">No hay actividad reciente.</div>';
      return;
    }

    box.innerHTML = events.slice(0, 20).map(e => {
      var time = e.ts.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      return '<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + escapeAttr(e.text) + '">'
        + '<span style="color:var(--dim);margin-right:6px;">[' + time + ']</span> '
        + '<span>' + e.type + '</span> '
        + '<span style="color:var(--text);">' + escapeHtml(e.text) + '</span>'
        + '</div>';
    }).join('');

  } catch (e) {
    showNotif('Error: ' + (e.message || e), 'err');
  }
}

// ============================================================
// ADMIN — DÍA DE CAZA (SIMULADOR DE ATAQUES)
// ============================================================

function toggleAdminHuntForm() {
  if (!isAdmin()) return;
  var form = document.getElementById('adminHuntForm');
  if (!form) return;

  var isHidden = form.style.display === 'none';
  form.style.display = isHidden ? 'block' : 'none';

  if (isHidden) {
    var list = document.getElementById('huntTroopsList');
    if (list && list.children.length === 0) {
      var html = '';
      Object.keys(TROOP_TYPES).forEach(k => {
        if (k === 'aldeano') return;
        var t = TROOP_TYPES[k];
        html += '<div style="display:flex;align-items:center;gap:4px;background:rgba(255,255,255,0.03);padding:4px;border-radius:4px;">' +
          '<span style="font-size:0.9rem;">' + t.icon + '</span>' +
          '<input type="number" id="hunt_t_' + k + '" placeholder="0" min="0" style="width:100%;background:transparent;border:none;color:var(--text);font-size:0.8rem;text-align:right;">' +
          '</div>';
      });
      Object.keys(CREATURE_TYPES).forEach(k => {
        var t = CREATURE_TYPES[k];
        html += '<div style="display:flex;align-items:center;gap:4px;background:rgba(255,210,0,0.05);padding:4px;border-radius:4px;">' +
          '<span style="font-size:0.9rem;">' + t.icon + '</span>' +
          '<input type="number" id="hunt_t_' + k + '" placeholder="0" min="0" style="width:100%;background:transparent;border:none;color:var(--gold);font-size:0.8rem;text-align:right;">' +
          '</div>';
      });
      list.innerHTML = html;
    }
  }
}

async function adminLaunchHunt() {
  if (!isAdmin()) return;

  var ox = parseInt(document.getElementById('huntOrigX').value);
  var oy = parseInt(document.getElementById('huntOrigY').value);
  var dx = parseInt(document.getElementById('huntDestX').value);
  var dy = parseInt(document.getElementById('huntDestY').value);

  if (isNaN(ox) || isNaN(oy) || isNaN(dx) || isNaN(dy)) {
    showNotif('Coordenadas inválidas.', 'err');
    return;
  }

  // Recopilar tropas
  var troops = {};
  var total = 0;
  Object.keys(TROOP_TYPES).concat(Object.keys(CREATURE_TYPES)).forEach(k => {
    if (k === 'aldeano') return;
    var el = document.getElementById('hunt_t_' + k);
    if (el) {
      var n = parseInt(el.value) || 0;
      if (n > 0) {
        troops[k] = n;
        total += n;
      }
    }
  });

  if (total === 0) {
    showNotif('Debes enviar al menos una unidad.', 'err');
    return;
  }

  var lvlTroop = parseInt(document.getElementById('huntLvlTroop').value) || 1;
  var lvlWeapon = parseInt(document.getElementById('huntLvlWeapon').value) || 0;
  var lvlArmor = parseInt(document.getElementById('huntLvlArmor').value) || 0;

  if (!confirm('¿Lanzar invasión de ' + total + ' unidades desde [' + ox + ',' + oy + '] hacia [' + dx + ',' + dy + ']?')) return;

  try {
    // 1. Verificar DESTINO (Prioridad: Jugador/Fantasma > Cueva > NPC)
    var targetId = null;
    var targetName = 'Objetivo Desconocido';

    // Buscar en villages
    var { data: destVill } = await sbClient.from('villages').select('id,name').eq('cx', dx).eq('cy', dy).maybeSingle();
    if (destVill) {
      targetId = destVill.id;
      targetName = destVill.name;
    } else {
      // Buscar en caves
      var { data: destCave } = await sbClient.from('caves').select('id,cx,cy').eq('cx', dx).eq('cy', dy).maybeSingle();
      if (destCave) {
        targetId = destCave.id;
        targetName = 'Cueva Salvaje [' + dx + ',' + dy + ']';
      } else {
        // Buscar en NPC_CASTLES (si está cargado en el cliente)
        var npcList = (typeof NPC_CASTLES !== 'undefined') ? NPC_CASTLES : [];
        var targetNPC = npcList.find(c => c.cx === dx && c.cy === dy);
        if (targetNPC) {
          targetId = targetNPC.id;
          targetName = targetNPC.name;
        }
      }
    }

    if (!targetId) {
      showNotif('No hay un objetivo válido en [' + dx + ',' + dy + '].', 'err');
      return;
    }

    // 2. Verificar o crear ORIGEN
    var { data: origVill } = await sbClient.from('villages').select('id,name').eq('cx', ox).eq('cy', oy).maybeSingle();
    var originId = origVill ? origVill.id : null;

    if (!originId) {
      showNotif('Creando punto de invasión en [' + ox + ',' + oy + ']...', 'ok');
      var ir = await sbClient.rpc('admin_ghost_create', {
        p_name: 'Punto de Invasión Admin',
        p_cx: ox, p_cy: oy,
        p_wall: 1, p_troops: {}, p_creatures: {}
      });
      if (ir.error) throw ir.error;

      // Intentar obtener el ID de nuevo
      var { data: newOrig } = await sbClient.from('villages').select('id,state').eq('cx', ox).eq('cy', oy).maybeSingle();
      if (!newOrig) throw new Error('Error al generar la base de invasión.');
      originId = newOrig.id;

      // Marcar como temporal
      var sTmp = typeof newOrig.state === 'string' ? JSON.parse(newOrig.state) : newOrig.state;
      if (!sTmp) sTmp = {};
      sTmp.is_temp = true;
      await sbClient.from('villages').update({ state: sTmp }).eq('id', originId);
    }

    // Calcular velocidad y llegada
    var minSpeed = 999;
    Object.keys(troops).forEach(k => {
      var td = TROOP_TYPES[k] || CREATURE_TYPES[k];
      if (td && td.speed < minSpeed) minSpeed = td.speed;
    });
    var dist = Math.max(Math.abs(dx - ox), Math.abs(dy - oy));
    var seconds = (dist / minSpeed) * (typeof MISSION_FACTOR !== 'undefined' ? MISSION_FACTOR : 3600);
    var finishAt = new Date(Date.now() + seconds * 1000).toISOString();

    // 3. Preparar estado completo del origen
    var { data: oStateData } = await sbClient.from('villages').select('state').eq('id', originId).single();
    if (!oStateData) throw new Error('No se pudo acceder al estado del origen.');

    var s = typeof oStateData.state === 'string' ? JSON.parse(oStateData.state) : oStateData.state;
    if (!s) s = {};
    if (!s.troops) s.troops = {};
    if (!s.creatures) s.creatures = {};
    if (!s.mission_queue) s.mission_queue = [];
    if (!s.resources) s.resources = { madera: 0, piedra: 0, hierro: 0, provisiones: 0, esencia: 0 };

    // Inyectar magicamente las tropas en la base para que sean "válidas" antes de mandarlas
    Object.keys(troops).forEach(k => {
      if (TROOP_TYPES[k]) s.troops[k] = (s.troops[k] || 0) + troops[k];
      else if (CREATURE_TYPES[k]) s.creatures[k] = (s.creatures[k] || 0) + troops[k];
    });

    // Crear la misión
    var missionEntry = {
      mid: 'hunt_' + Math.random().toString(36).slice(2, 6) + Date.now().toString(36),
      type: 'attack',
      tx: dx, ty: dy,
      targetId: targetId,
      targetName: targetName,
      troops: JSON.parse(JSON.stringify(troops)), // Evitar referencias
      finish_at: finishAt,
      start_at: new Date().toISOString(),
      admin_test: true,
      god_levels: { troop: lvlTroop, weapon: lvlWeapon, armor: lvlArmor },
      origin_village_id: originId // Para rastreo
    };

    // Descontar inmediatamente las tropas (porque se van de misión)
    Object.keys(troops).forEach(k => {
      if (TROOP_TYPES[k]) s.troops[k] = Math.max(0, (s.troops[k] || 0) - troops[k]);
      else if (CREATURE_TYPES[k]) s.creatures[k] = Math.max(0, (s.creatures[k] || 0) - troops[k]);
    });

    s.mission_queue.push(missionEntry);

    // v1.62: Actualizar AMBAS columnas (state y mission_queue) porque la DB las tiene separadas
    var { error: upErr } = await sbClient.from('villages').update({
      state: s,
      mission_queue: s.mission_queue || []
    }).eq('id', originId);

    if (upErr) throw upErr;

    showNotif('🚀 Invasión lanzada contra ' + targetName + '. Llegada en ' + fmtTime(Math.ceil(seconds)), 'ok');

    // Si somos nosotros mismos o estamos viendo, forzar actualización
    if (activeVillage && activeVillage.id === originId) {
      activeVillage.state = s;
      if (typeof updateResourceUI === 'function') updateResourceUI();
    }
    if (typeof loadMyVillages === 'function') await loadMyVillages();
    // v1.62b: Recargar allVillages para que el Global Admin Tick pueda encontrar el nuevo fantasma
    if (typeof loadAllVillages === 'function') await loadAllVillages();
    if (typeof renderMap === 'function') renderMap();

    // No cerramos el formulario para que pueda lanzar más ataques
  } catch (e) {
    showNotif('Error: ' + (e.message || e), 'err');
  }
}

async function adminFastBuildAll() {
  if (!isAdmin()) return;
  if (!confirm('⚡ ADVERTENCIA: Esta acción completará INSTANTÁNEAMENTE todas las construcciones en curso de TODOS los jugadores activos.\n\n¿Proceder?')) return;

  try {
    showNotif('⏳ Procesando construcciones globales...', 'info');

    // v1.52: Usamos un RPC para procesar esto de forma atómica en el servidor si existe,
    // o iteramos por las aldeas cargadas (fallback local).
    // Nota: En un entorno real, esto debería ser un comando de servidor.

    var { data: vills, error: vErr } = await sbClient.from('villages').select('id,state');
    if (vErr) throw vErr;

    var count = 0;
    for (var v of vills) {
      var s = v.state;
      if (s && s.build_queue) {
        // Mover de cola a edificios
        var q = s.build_queue;
        if (!s.buildings) s.buildings = {};
        if (!s.buildings[q.id]) s.buildings[q.id] = { level: 0 };
        s.buildings[q.id].level = (s.buildings[q.id].level || 0) + 1;
        delete s.build_queue;

        await sbClient.from('villages').update({ state: s }).eq('id', v.id);
        count++;
      }
    }

    showNotif('✅ Se han completado ' + count + ' construcciones en el servidor.', 'ok');
    if (typeof tick === 'function') tick();
  } catch (e) {
    showNotif('Error: ' + (e.message || e), 'err');
  }
}

function adminResetMapCache() {
  if (!isAdmin()) return;
  if (!confirm('¿Deseas forzar la recarga de todos los datos del mapa?')) return;

  try {
    allVillages = [];
    _lastMapLoad = 0;
    if (typeof loadAllVillages === 'function') {
      loadAllVillages().then(() => {
        if (typeof renderMap === 'function') renderMap();
        showNotif('🔄 Cache del mapa reseteada.', 'ok');
      });
    } else {
      if (typeof renderMap === 'function') renderMap();
      showNotif('🔄 Mapa refrescado.', 'ok');
    }
  } catch (e) {
    showNotif('Error: ' + (e.message || e), 'err');
  }
}




