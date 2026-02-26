// ============================================================
// EPIC WARRIORS — game-auth.js
// Auth: doLogin, doRegister, doLogout, ensureProfile, getMyPlayerData
// Username: normUsername, isUsernameShapeValid, isUsernameAvailable
// Profile: openProfile, closeProfile, doChangeUsername
//          doDeleteVillage, doDeleteAccount
// Admin MOTD: loadUserRole, saveMOTD, clearMOTD
// ============================================================

function normUsername(u) {
  return (u || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin acentos
    .replace(/[^a-z0-9_-]/g, '') // solo permitido
    .replace(/([a-z0-9_-])\1{2,}/g, '$1$1') // colapsa repeticiones largas (aaaa->aa)
    ;
}
function isUsernameShapeValid(raw) {
  if (!raw) return { ok: false, msg: 'Escribe un nombre de usuario.' };
  if (raw.length < 4 || raw.length > 15) return { ok: false, msg: 'Debe tener entre 4 y 15 caracteres.' };
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return { ok: false, msg: 'Solo letras, numeros, "_" y "-".' };
  return { ok: true, msg: '' };
}
function setUserMsg(t, type) {
  var el = document.getElementById('userMsg');
  if (!el) return;
  el.textContent = t || '';
  el.className = 'auth-msg ' + (type || '');
}
async function fetchBannedTerms() {
  // Mantener pequeño: en prod, cachea y pagina si hace falta
  var r = await sbClient.from('banned_terms').select('term').limit(1000);
  if (r.error || !r.data) return [];
  return r.data.map(function (x) { return String(x.term || '').toLowerCase(); }).filter(Boolean);
}
async function isUsernameBanned(normalized) {
  // Comprueba si contiene cualquier termino prohibido
  // (Esto detecta muchos "derivados" simples porque normalizamos antes)
  var terms = await fetchBannedTerms();
  for (var i = 0; i < terms.length; i++) {
    var t = terms[i];
    if (t && normalized.includes(t)) return true;
  }
  return false;
}
async function isUsernameAvailable(normalized) {
  var r = await sbClient.from('profiles').select('id').eq('normalized_username', normalized).limit(1);
  if (r.error) return { ok: false, msg: 'No se pudo comprobar disponibilidad.' };
  if (r.data && r.data.length > 0) return { ok: false, msg: 'Ese nombre ya existe.' };
  return { ok: true, msg: '' };
}

// ============================================================
// AUTH
// ============================================================
function switchTab(tab) {
  document.getElementById('tabL').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('tabR').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('btnTL').classList.toggle('active', tab === 'login');
  document.getElementById('btnTR').classList.toggle('active', tab === 'register');
  setMsg('', '');
}
function setMsg(t, type) { var el = document.getElementById('authMsg'); el.textContent = t; el.className = 'auth-msg ' + type; }

// Username live check (solo UX; el backend manda)
var userCheckTimer = null;
async function onUserInput() {
  var raw = (document.getElementById('rUser') || {}).value || '';
  setUserMsg('', '');
  var shape = isUsernameShapeValid(raw);
  if (!shape.ok) { setUserMsg(shape.msg, 'err'); return; }
  var normalized = normUsername(raw);
  clearTimeout(userCheckTimer);
  userCheckTimer = setTimeout(async function () {
    setUserMsg('Comprobando...', '');
    if (await isUsernameBanned(normalized)) { setUserMsg('Nombre no permitido.', 'err'); return; }
    setUserMsg(av.ok ? 'Disponible ✅' : 'No disponible ❌', av.ok ? 'ok' : 'err');
  }, 250);
}

// ============================================================
// AUTH & NETWORK
// ============================================================

// ============================================================
// AUTH & NETWORK
// ============================================================

async function doLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const pass = document.getElementById('lPass').value;
  if (!email || !pass) { setMsg('Rellena email y contraseña.', 'err'); return; }

  document.getElementById('lBtn').disabled = true;
  document.getElementById('lBtn').textContent = 'Conectando...';

  const { data, error } = await sbClient.auth.signInWithPassword({ email, password: pass });

  if (error) {
    setMsg('Error: ' + error.message, 'err');
    document.getElementById('lBtn').disabled = false;
    document.getElementById('lBtn').textContent = 'Entrar';
    return;
  }

  currentUser = data.user;
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('gameWrapper').classList.add('visible');
  await initGame();
}

async function doRegister() {
  const userRaw = (document.getElementById('rUser').value || '').trim();
  const email = document.getElementById('rEmail').value.trim();
  const pass = document.getElementById('rPass').value;

  if (!userRaw) { setUserMsg('El nombre de usuario es obligatorio.', 'err'); return; }
  if (!email || !pass) { setMsg('Rellena email y contraseña.', 'err'); return; }
  if (pass.length < 6) { setMsg('La contraseña debe tener al menos 6 caracteres.', 'err'); return; }

  document.getElementById('rBtn').disabled = true;
  document.getElementById('rBtn').textContent = 'Creando cuenta...';

  // 1. Sign Up
  const { data, error } = await sbClient.auth.signUp({
    email,
    password: pass,
    options: { data: { username: userRaw } }
  });

  if (error) {
    setMsg('Error: ' + error.message, 'err');
    document.getElementById('rBtn').disabled = false;
    document.getElementById('rBtn').textContent = 'Crear Cuenta';
    return;
  }

  if (data.session) {
    currentUser = data.user;
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('gameWrapper').classList.add('visible');
    // Ensure profile exists (trigger might have failed or be slow)
    await ensureProfile(currentUser.id, userRaw);
    await initGame();
  } else {
    setMsg('Revisa tu email para confirmar o inicia sesión.', 'ok');
    switchTab('login');
    document.getElementById('lEmail').value = email;
    document.getElementById('rBtn').disabled = false;
    document.getElementById('rBtn').textContent = 'Crear Cuenta';
  }
}

async function ensureProfile(uid, username) {
  // Just in case the trigger didn't fire or we want to force username
  await sbClient.from('profiles').upsert({ id: uid, username: username }, { onConflict: 'id' });
}

async function getMyPlayerData() {
  if (!currentUser) return null;
  try {
    // Try full select first (requires migration columns to exist)
    const { data, error } = await sbClient
      .from('profiles')
      .select('id, username, experience, role, military_score, alliance_tag, battles_won_pvp, battles_lost_pvp, battles_won_npc, troop_levels, weapon_levels, armor_levels')
      .eq('id', currentUser.id)
      .single();
    if (!error) return data;
    // Fallback: columns may not exist yet — fetch only guaranteed columns
    console.warn('getMyPlayerData full select failed, trying fallback:', error.message);
    const { data: d2, error: e2 } = await sbClient
      .from('profiles')
      .select('id, username, role')
      .eq('id', currentUser.id)
      .single();
    if (e2) { console.warn('getMyPlayerData fallback error:', e2.message); return null; }
    return { ...d2, experience: 0, military_score: 0, alliance_tag: null };
  } catch (e) {
    console.warn('getMyPlayerData exception:', e);
    return null;
  }
}

async function doLogout() {
  await flushVillage();
  // Clean up local state
  if (typeof realtimeChannel !== 'undefined' && realtimeChannel) {
    sbClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  await sbClient.auth.signOut();
  currentUser = null;
  myVillages = [];
  activeVillage = null;
  activeVillageId = null;
  rankingCache = null;
  clearInterval(uiTimer);
  clearInterval(autoSaveTimer);
  document.getElementById('gameWrapper').classList.remove('visible');
  document.getElementById('authScreen').style.display = 'flex';
  location.reload(); // Hard reload to ensure clean slate
}



// ── Perfil, rol, MOTD (continúa del mismo módulo auth) ──

let currentUserRole = 'player';
let _usernameChanged = false;

async function loadUserRole() {
  if (!currentUser) return;
  try {
    // Usamos maybeSingle para no crashear si RLS bloquea o no existe fila
    const r = await sbClient
      .from('profiles')
      .select('role, username_changed')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (r.data) {
      currentUserRole = r.data.role || 'player';
      _usernameChanged = r.data.username_changed || false;
    } else {
      // Columna role puede no existir en instancias antiguas — fallback a player
      currentUserRole = 'player';
    }
  } catch (e) {
    console.warn('loadUserRole error:', e);
    currentUserRole = 'player';
  }
  checkAdminButton();
}

// ADMIN - ACCESO EXCLUSIVO: sementalac@gmail.com
// Triple verificación: email del objeto currentUser + email del JWT de Supabase + no nulo
// Cualquier intento de falsificación desde consola fallará porque currentUser
// viene directamente de sbClient.auth.getUser() y se sobreescribe en cada login.

// ============================================================
// v1.30: MOTD — Mensaje del día del administrador
// Guardado en tabla 'config' (clave 'motd') en Supabase
// ============================================================
async function saveMOTD() {
  if (!isAdmin()) return;
  var text = (document.getElementById('motdInput').value || '').trim().slice(0, 1000);
  var msg = document.getElementById('motdSaveMsg');
  msg.textContent = '';
  var r = await sbClient.from('config').upsert({ key: 'motd', value: text }, { onConflict: 'key' });
  if (r.error) {
    msg.style.color = 'var(--danger)';
    msg.textContent = 'Error: ' + r.error.message;
    return;
  }
  msg.style.color = 'var(--ok)';
  msg.textContent = '✅ Guardado';
  setTimeout(function () { msg.textContent = ''; }, 3000);
}

async function clearMOTD() {
  if (!isAdmin()) return;
  if (!confirm('¿Borrar el mensaje del día?')) return;
  await sbClient.from('config').upsert({ key: 'motd', value: '' }, { onConflict: 'key' });
  document.getElementById('motdInput').value = '';
  var msg = document.getElementById('motdSaveMsg');
  msg.style.color = 'var(--ok)';
  msg.textContent = '✅ Borrado';
  setTimeout(function () { msg.textContent = ''; }, 2000);
}

// Admin cargado desde game-admin.js
// ============================================================
// PERFIL DE USUARIO — cambio de nombre (1 vez) + eliminar cuenta
// ============================================================
function openProfile() {
  if (!currentUser) return;
  var myUser = document.getElementById('ovUser') ? document.getElementById('ovUser').textContent : currentUser.email;
  document.getElementById('profUsername').textContent = myUser;
  document.getElementById('profEmail').textContent = currentUser.email;
  document.getElementById('profRole').textContent = currentUserRole;
  document.getElementById('profNewName').value = '';
  document.getElementById('profMsg').textContent = '';
  document.getElementById('profMsg').className = 'profile-msg';
  // Mostrar nombre de la aldea activa en el botón de borrar
  var pvn = document.getElementById('profVillageName');
  if (pvn && activeVillage) pvn.textContent = '("' + activeVillage.name + '")';      // Deshabilitar borrar aldea si solo tienen 1
  var dvBtn = document.querySelector('button[onclick="doDeleteVillage()"]');
  if (dvBtn) {
    var canDel = myVillages && myVillages.length > 1;
    dvBtn.disabled = !canDel;
    dvBtn.title = canDel ? 'Borra la aldea activa permanentemente' : 'No puedes borrar tu única aldea';
  }
  // Botón cambiar nombre: solo si no lo ha cambiado aún
  var changBtn = document.getElementById('profChangeNameBtn');
  if (changBtn) {
    changBtn.disabled = _usernameChanged;
    changBtn.title = _usernameChanged ? 'Ya has usado tu cambio de nombre' : 'Cambiar nombre (1 vez)';
  }
  document.getElementById('profileOverlay').classList.remove('hidden');
}
function closeProfile() { document.getElementById('profileOverlay').classList.add('hidden'); }

async function doChangeUsername() {
  if (_usernameChanged) { showNotif('Ya usaste tu cambio de nombre.', 'err'); return; }
  var raw = (document.getElementById('profNewName').value || '').trim();
  var msg = document.getElementById('profMsg');
  msg.className = 'profile-msg';

  var shape = isUsernameShapeValid(raw);
  if (!shape.ok) { msg.textContent = shape.msg; msg.className = 'profile-msg err'; return; }
  var normalized = normUsername(raw);
  if (await isUsernameBanned(normalized)) { msg.textContent = 'Nombre no permitido.'; msg.className = 'profile-msg err'; return; }
  var av = await isUsernameAvailable(normalized);
  if (!av.ok) { msg.textContent = av.msg || 'No disponible.'; msg.className = 'profile-msg err'; return; }

  const r = await sbClient.from('profiles').update({
    username: raw,
    normalized_username: normalized,
    username_changed: true
  }).eq('id', currentUser.id);

  if (r.error) { msg.textContent = 'Error: ' + r.error.message; msg.className = 'profile-msg err'; return; }

  _usernameChanged = true;
  document.getElementById('profUsername').textContent = raw;
  document.getElementById('ovUser').textContent = raw;
  var tu = document.getElementById('topbarUsername');
  if (tu) tu.textContent = raw;
  document.getElementById('profChangeNameBtn').disabled = true;
  msg.textContent = '✓ Nombre cambiado a ' + raw + '. No podrás volver a cambiarlo.';
  msg.className = 'profile-msg ok';
  showNotif('Nombre actualizado: ' + raw, 'ok');
}

async function doDeleteVillage() {
  if (!activeVillage || !currentUser) return;
  // Solo se puede borrar si tienes más de 1 aldea
  if (myVillages.length <= 1) {
    showNotif('No puedes borrar tu única aldea.', 'err');
    return;
  }
  var vilName = activeVillage.name;
  var input = (document.getElementById('profNewName').value || '').trim();
  var msg = document.getElementById('profMsg');
  // Pedir que escriban el nombre de la aldea exacto
  if (input !== vilName) {
    msg.textContent = 'Escribe exactamente el nombre de tu aldea activa ("' + vilName + '") para confirmar.';
    msg.className = 'profile-msg err';
    document.getElementById('profNewName').placeholder = 'Escribe: ' + vilName;
    return;
  }
  if (!confirm('¿Borrar la aldea "' + vilName + '" y todo su contenido?\nTropas, edificios y recursos se perderán.\nEsta acción no se puede deshacer.')) return;

  try {
    await sbClient.from('buildings').delete().eq('village_id', activeVillage.id);
    await sbClient.from('troops').delete().eq('village_id', activeVillage.id);
    await sbClient.from('creatures').delete().eq('village_id', activeVillage.id);
    await sbClient.from('villages').delete().eq('id', activeVillage.id);

    // Recargar localmente
    myVillages = myVillages.filter(function (v) { return v.id !== activeVillage.id; });
    activeVillage = myVillages[0];
    activeVillageId = activeVillage.id;
    populateVillageSel();
    closeProfile();
    showNotif('Aldea "' + vilName + '" eliminada.', 'ok');
    switchVillage(activeVillage.id);
  } catch (e) {
    showNotif('Error al borrar la aldea: ' + (e.message || e), 'err');
  }
}

async function doDeleteAccount() {
  var raw = (document.getElementById('profNewName').value || '').trim();
  var myName = document.getElementById('profUsername').textContent;
  var msg = document.getElementById('profMsg');
  if (raw !== myName) {
    msg.textContent = 'Escribe exactamente tu nombre de usuario para confirmar.';
    msg.className = 'profile-msg err';
    document.getElementById('profNewName').placeholder = 'Escribe: ' + myName;
    return;
  }
  if (!confirm('¿Estás SEGURO de que quieres eliminar tu cuenta? Todos tus datos se perderán.')) return;
  await sbClient.from('villages').delete().eq('user_id', currentUser.id);
  await sbClient.from('profiles').delete().eq('id', currentUser.id);
  // Cerrar sesión (el usuario de auth.users queda; si quieres borrarlo del todo necesitas el trigger)
  await sbClient.auth.signOut();
  location.reload();
}

// Guardar inmediatamente antes de cerrar/recargar — protege misiones en curso
window.addEventListener('beforeunload', function () {
  if (activeVillage && currentUser) {
    // Sync save (no await — beforeunload no permite async)
    try {
      var s = activeVillage.state;
      sbClient.from('villages').update({
        build_queue: s.build_queue,
        mission_queue: s.mission_queue || [],
        last_aldeano_at: s.last_aldeano_at || null
      }).eq('id', activeVillage.id);
    } catch (e) { }
  }
});

(async function () {
  var r = await sbClient.auth.getSession();
  if (r.data && r.data.session) {
    currentUser = r.data.session.user;
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('gameWrapper').classList.add('visible');
    await initGame();
  }
})();

// ── Visibilitychange: guardar al ocultar, nada al volver ────────────────
// No hacemos query a Supabase al volver a la pestaña — los recursos se
// calculan localmente con calcRes() desde last_updated + producción.
// Esto evita queries cada vez que el usuario enfoca la pestaña o devtools.
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    // Al ocultar: guardar estado actual (mejor esfuerzo)
    try { flushVillage(); } catch (e) { }
  }
  // Al volver: no hacemos nada — el tick sigue corriendo con cálculo local
});

/* --- TRANSPORTE UI — helpers llamados desde HTML inline --- */
function updateTransportUI() {
  let totalCap = 0;
  let totalTroops = 0;
  Object.keys(TROOP_TYPES).forEach(id => {
    const input = document.getElementById('mUnits_' + id);
    if (input) {
      const val = parseInt(input.value) || 0;
      totalCap += val * (TROOP_TYPES[id].capacity || 0);
      totalTroops += val;
    }
  });
  const capSpan = document.getElementById('displayCap');
  const costSpan = document.getElementById('displayCost');
  if (capSpan) capSpan.innerText = totalCap;
  if (costSpan) costSpan.innerText = totalTroops;
  validateTransportRes();
}

function validateTransportRes() {
  const cap = parseInt(document.getElementById('displayCap')?.innerText) || 0;
  const w = parseInt(document.getElementById('mWood')?.value) || 0;
  const s = parseInt(document.getElementById('mStone')?.value) || 0;
  const i = parseInt(document.getElementById('mIron')?.value) || 0;
  const btn = document.getElementById('btnSendMission');
  if (btn) {
    if ((w + s + i) > cap) {
      btn.innerText = "¡EXCESO CARGA!";
      btn.disabled = true;
    } else {
      btn.innerText = "¡Enviar!";
      btn.disabled = false;
    }
  }
}
// processMissions eliminado: resolveMissions (tick cada segundo) gestiona todos los tipos de misión incluyendo transport.


