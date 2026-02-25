// game-admin.js — Panel de administración Epic Warriors
// Depende de: sbClient, currentUser, activeVillage, showNotif, TROOP_TYPES,
//             escapeHtml, escapeJs, fmt, loadMyVillages, switchVillage

// Función local para escapar atributos HTML (onclick, etc.)
function escapeAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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
      logEl.innerHTML = log.map(function(l) {
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
      var stuck = mq.filter(function(m) {
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
      Object.keys(TROOP_TYPES).forEach(function(k) {
        if (k !== 'aldeano') otherSlots += (trpRow[k] || 0) * (TROOP_TYPES[k].barracasSlots || 1);
      });
      var maxAld = Math.max(0, barrCap - otherSlots);
      var currentAld = trpRow.aldeano || 0;
      var isOvercapped = currentAld > maxAld;

      var returningAld = 0;
      stuck.forEach(function(m) { returningAld += (m.troops && m.troops.aldeano) || 0; });

      if (stuck.length === 0 && !isOvercapped) continue;

      var playerName = row.username || (row.owner_id ? row.owner_id.substring(0, 8) + '…' : '?');
      var problems = [];
      if (stuck.length > 0) {
        var oldestStuck = stuck.reduce(function(min, m) {
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
      problems.forEach(function(p) { log.push('   → ' + p); });
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

  logEl.innerHTML = log.map(function(l) {
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
    Object.keys(TROOP_TYPES).forEach(function(k) {
      if (k !== 'aldeano') otherSlots += (trpRow[k] || 0) * (TROOP_TYPES[k].barracasSlots || 1);
    });

    var overcapFixed = 0;
    if (currentAld > maxAld) {
      overcapFixed = currentAld - maxAld;
      currentAld = maxAld;
    }

    var freeSlots = Math.max(0, barrCap - currentAld - otherSlots);
    var returningAld = 0;
    stuck.forEach(function(m) { returningAld += (m.troops && m.troops.aldeano) || 0; });

    var aldEntra = Math.min(returningAld, freeSlots);
    var newAld = currentAld + aldEntra;

    var newMq = mq.filter(function(m) {
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

  logEl.innerHTML = log.map(function(l) {
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
const GHOST_OWNER_ID = '00000000-0000-0000-0000-000000000000';

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
  var cx   = parseInt(document.getElementById('ghostX').value) || 100;
  var cy   = parseInt(document.getElementById('ghostY').value) || 100;
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
    p_name:      name,
    p_cx:        cx,
    p_cy:        cy,
    p_wall:      wall,
    p_troops:    troops,
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
  var r = await sbClient.rpc('admin_ghost_delete', { p_id: id });
  if (r.error) { showNotif('Error borrando: ' + r.error.message, 'err'); return; }
  showNotif('🗑️ Aldea "' + name + '" eliminada', 'ok');
  loadGhostList();
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
    if (r.error) {
      console.error('adminDeleteUserFromPage RPC error:', r.error);
      showNotif('Error: ' + r.error.message, 'err');
      return;
    }
    showNotif('✓ Usuario "' + username + '" eliminado completamente', 'ok');
    loadAdminUsersPage();
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
  const villages = await sbClient.from('villages').select('id,name,cx,cy,resources,last_updated').eq('owner_id', userId);
  const objectives = await sbClient.from('objectives').select('*').eq('user_id', userId);

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
      if (v.resources) {
        info += '     Recursos: 🌲' + Math.floor(v.resources.madera || 0) + ' ⛰️' + Math.floor(v.resources.piedra || 0) + ' ⚙️' + Math.floor(v.resources.hierro || 0) + ' 🌾' + Math.floor(v.resources.provisiones || 0) + ' ✨' + Math.floor(v.resources.esencia || 0) + '\n';
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
    const r = await sbClient.rpc('admin_delete_user', { target_user_id: userId });
    if (r.error) {
      console.error('adminDeleteUser RPC error:', r.error);
      showNotif('Error: ' + r.error.message, 'err');
      return;
    }
    showNotif('✓ Usuario "' + username + '" eliminado completamente', 'ok');
    await loadAdminUsers();
  } catch (e) {
    console.error('adminDeleteUser error:', e);
    showNotif('Error al eliminar: ' + e.message, 'err');
  }
}

