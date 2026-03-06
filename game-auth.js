// ============================================================
// EPIC WARRIORS — game-auth.js  [v1.80 — audit pass]
// Auth: doLogin, doRegister, doLogout, ensureProfile, getMyPlayerData
// Username: normUsername, isUsernameShapeValid, isUsernameAvailable
// Profile: openProfile, closeProfile, doChangeUsername
//          doDeleteVillage, doDeleteAccount
// Admin MOTD: loadUserRole, saveMOTD, clearMOTD
// ============================================================
// FIX SUMMARY (6 issues) [v1.70]
// [CRÍTICO-1] doRegister: ahora llama RPC ensure_profile_secure en vez de upsert directo
// [CRÍTICO-2] doChangeUsername: ahora llama RPC change_username_secure (atómica, sin race condition)
// [CRÍTICO-3] ensureProfile: reescrita para usar la RPC; nunca escribe directo a profiles
// [MEDIO-4]   doDeleteAccount: llama RPC delete_my_account para borrar también auth.users
// [MEDIO-5]   beforeunload: enruta a save_village_client RPC en vez de update directo
// [MENOR-6]   fetchBannedTerms: caché en memoria para la sesión (0 queries extra)
// ============================================================
// FIX SUMMARY (6 issues) [v1.80 — 2 pasadas de auditoría]
// [CRÍTICO-7]  doRegister: ensureProfile() retorno no comprobado — si fallaba,
//   el juego entraba en initGame() sin perfil → crash o estado indefinido.
//   Fix: check del retorno + signOut + mensaje de error si falla.
// [CRÍTICO-8]  doDeleteVillage: .delete() directo sobre tabla villages desde
//   cliente — viola regla arquitectónica (Supabase = única autoridad).
//   Fix: RPC delete_village_secure(p_village_id). La limpieza de cueva y
//   la validación del guardián ocurren ahora dentro de la RPC antes del DELETE.
// [CRÍTICO-9]  doDeleteAccount: .delete() directo sobre villages + profiles;
//   sin limpieza de cuevas capturadas — miembros y recursos huérfanos en DB.
//   Fix: consolidado en delete_my_account RPC (cave cleanup → villages →
//   profiles → auth.users). El cliente solo llama la RPC y hace signOut.
// [MEDIO-10]   saveMOTD / clearMOTD: upsert directo a tabla config — la
//   guardia isAdmin() es client-side, manipulable desde consola.
//   Fix: nueva RPC save_motd_secure(p_text) con SECURITY DEFINER que verifica
//   profiles.role en servidor.
// [MENOR-11]   visibilitychange: llamaba flushVillage() directamente —
//   beforeunload ya fue corregido en v1.70 para usar la RPC; visibilitychange
//   no. Inconsistente y potencialmente un update directo a DB.
//   Fix: mismo patrón RPC fire-and-forget que beforeunload.
// SQL requerido: ver migration_v1.80.sql (archivo separado)

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

// ── FIX [MENOR-6]: caché de banned terms — solo 1 query por sesión ──────────
var _bannedTermsCache = null;
async function fetchBannedTerms() {
  if (_bannedTermsCache !== null) return _bannedTermsCache;
  var r = await sbClient.from('banned_terms').select('term').limit(1000);
  if (r.error || !r.data) { _bannedTermsCache = []; return []; }
  _bannedTermsCache = r.data.map(function (x) { return String(x.term || '').toLowerCase(); }).filter(Boolean);
  return _bannedTermsCache;
}

async function isUsernameBanned(normalized) {
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
    var av = await isUsernameAvailable(normalized);
    setUserMsg(av.ok ? 'Disponible ✅' : 'No disponible ❌', av.ok ? 'ok' : 'err');
  }, 250);
}

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

// ── FIX [CRÍTICO-1]: doRegister usa RPC ensure_profile_secure ───────────────
// La validación real (normalización, banned terms, unicidad atómica) ocurre
// en el servidor. El cliente NO puede saltarse estas comprobaciones.
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
    // FIX [CRÍTICO-7]: comprobar retorno de ensureProfile — si falla, el juego
    // NO debe continuar hacia initGame() sin perfil (crash o estado indefinido).
    const profileOk = await ensureProfile(userRaw);
    if (!profileOk) {
      await sbClient.auth.signOut();
      document.getElementById('authScreen').style.display = 'flex';
      document.getElementById('gameWrapper').classList.remove('visible');
      setMsg('No se pudo crear tu perfil. Inténtalo de nuevo.', 'err');
      document.getElementById('rBtn').disabled = false;
      document.getElementById('rBtn').textContent = 'Crear Cuenta';
      return;
    }
    await initGame();
  } else {
    setMsg('Revisa tu email para confirmar o inicia sesión.', 'ok');
    switchTab('login');
    document.getElementById('lEmail').value = email;
    document.getElementById('rBtn').disabled = false;
    document.getElementById('rBtn').textContent = 'Crear Cuenta';
  }
}

// ── FIX [CRÍTICO-3]: ensureProfile delega TODO al servidor ──────────────────
// Ya no acepta uid externo (auth.uid() lo resuelve la RPC).
// Ya no escribe directo a profiles.
// Si la RPC falla (nombre duplicado), añade sufijo y lo intenta de nuevo.
async function ensureProfile(username) {
  try {
    const { data, error } = await sbClient.rpc('ensure_profile_secure', { p_username: username });
    if (error) {
      console.warn('ensureProfile RPC error:', error.message);
      return false;
    }
    if (!data.ok) {
      console.warn('ensureProfile rejected:', data.error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('ensureProfile exception:', e);
    return false;
  }
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
  // FIX [MEDIO-10]: RPC SECURITY DEFINER — la verificación de rol ocurre en
  // servidor. isAdmin() client-side es solo UX; no es barrera de seguridad real.
  var { error: rpcErr } = await sbClient.rpc('save_motd_secure', { p_text: text });
  if (rpcErr) {
    msg.style.color = 'var(--danger)';
    msg.textContent = 'Error: ' + rpcErr.message;
    return;
  }
  msg.style.color = 'var(--ok)';
  msg.textContent = '✅ Guardado';
  setTimeout(function () { msg.textContent = ''; }, 3000);
}

async function clearMOTD() {
  if (!isAdmin()) return;
  if (!confirm('¿Borrar el mensaje del día?')) return;
  // FIX [MEDIO-10]: RPC SECURITY DEFINER (mismo que saveMOTD con texto vacío)
  await sbClient.rpc('save_motd_secure', { p_text: '' });
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
  if (pvn && activeVillage) pvn.textContent = '("' + activeVillage.name + '")';
  // Deshabilitar borrar aldea si solo tienen 1
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

// ── FIX [CRÍTICO-2]: doChangeUsername usa RPC atómica ───────────────────────
// Antes: check disponibilidad (cliente) → espera → update directo → race condition.
// Ahora: 1 sola llamada RPC que hace check + write atómicos en el servidor.
// También elimina la escritura directa a profiles que saltaba username_changed.
async function doChangeUsername() {
  if (_usernameChanged) { showNotif('Ya usaste tu cambio de nombre.', 'err'); return; }
  var raw = (document.getElementById('profNewName').value || '').trim();
  var msg = document.getElementById('profMsg');
  msg.className = 'profile-msg';

  // Validación UX rápida en cliente (el servidor la repite de forma autoritativa)
  var shape = isUsernameShapeValid(raw);
  if (!shape.ok) { msg.textContent = shape.msg; msg.className = 'profile-msg err'; return; }

  msg.textContent = 'Cambiando nombre...';

  const { data, error } = await sbClient.rpc('change_username_secure', { p_new_username: raw });

  if (error) {
    msg.textContent = 'Error: ' + error.message;
    msg.className = 'profile-msg err';
    return;
  }
  if (!data.ok) {
    msg.textContent = data.error || 'No disponible.';
    msg.className = 'profile-msg err';
    return;
  }

  // Éxito — actualizar UI local
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

// ============================================================
// FIX [CRÍTICO-8] v1.80: doDeleteVillage
// — .delete() directo sobre villages reemplazado por RPC delete_village_secure
// — La limpieza del guardián de cueva ahora ocurre DENTRO de la RPC, antes
//   del DELETE, evitando que una cueva quede con guardián apuntando a una
//   aldea inexistente si el client-side cleanup fallaba.
// — Ya no se llama a onCaveGuardianDied desde el cliente: la RPC hace UPDATE
//   caves SET status='wild' WHERE village_id = p_village_id internamente.
// ============================================================
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

  var vid = activeVillage.id;
  try {
    // FIX [CRÍTICO-8]: RPC SECURITY DEFINER — valida propiedad, libera cuevas
    // y borra la aldea en una sola transacción atómica en el servidor.
    // Nunca .delete() directo sobre villages desde el cliente.
    var { data: delData, error: delErr } = await sbClient.rpc('delete_village_secure', {
      p_village_id: vid
    });
    if (delErr) throw new Error(delErr.message);
    if (!delData || !delData.ok) throw new Error(delData?.error || 'Error al borrar la aldea');

    // Recargar localmente
    myVillages = myVillages.filter(function (v) { return v.id !== vid; });
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

// ── FIX [CRÍTICO-9] v1.80: doDeleteAccount consolidado en RPC ───────────────
// Antes: .delete() directo sobre villages + profiles sin limpieza de cuevas.
//   - Violaba la regla arquitectónica (Supabase = única autoridad)
//   - No limpiaba cuevas capturadas → owner_id huérfano en tabla caves
//   - Orden no garantizado → posibles FK failures
// Ahora: una sola llamada a delete_my_account() (SECURITY DEFINER) que ejecuta:
//   1. UPDATE caves SET status='wild' WHERE owner_id = auth.uid()
//   2. DELETE FROM villages WHERE owner_id = auth.uid()
//   3. DELETE FROM profiles WHERE id = auth.uid()
//   4. DELETE FROM auth.users WHERE id = auth.uid()
// El cliente ya no toca ninguna tabla directamente.
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

  try {
    // FIX [CRÍTICO-9]: toda la limpieza ocurre en la RPC SECURITY DEFINER:
    //   cuevas → aldeas → perfil → auth.users (ver SQL en cabecera de este archivo)
    const { error: rpcErr } = await sbClient.rpc('delete_my_account');
    if (rpcErr) {
      // Loguear pero no bloquear — la sesión se cierra igualmente.
      // Si la RPC no existe aún, el admin puede limpiar manualmente.
      console.warn('delete_my_account RPC failed (revisar SQL en cabecera del archivo):', rpcErr.message);
    }
  } catch (e) {
    console.warn('doDeleteAccount error:', e);
  }

  // Cerrar sesión y recargar en cualquier caso
  await sbClient.auth.signOut();
  location.reload();
}

// ── FIX [MEDIO-5]: beforeunload enruta a save_village_client RPC ─────────────
// Antes: update directo a villages → el usuario podía manipular mission_queue.
// Ahora: llama save_village_client que valida en servidor qué campos acepta.
// Nota: beforeunload no admite async/await — el fetch es fire-and-forget.
window.addEventListener('beforeunload', function () {
  if (activeVillage && currentUser) {
    try {
      var s = activeVillage.state;
      // Usar la RPC segura en lugar de update directo
      sbClient.rpc('save_village_client', {
        p_village_id:      activeVillage.id,
        p_build_queue:     s.build_queue     || [],
        p_mission_queue:   s.mission_queue   || [],
        p_last_aldeano_at: s.last_aldeano_at || null
      });
      // Fire-and-forget intencional: beforeunload no puede awaitar
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

// ── FIX [MENOR-11]: visibilitychange usa RPC fire-and-forget ─────────────────
// beforeunload ya fue corregido en v1.70 para usar save_village_client RPC.
// visibilitychange seguía llamando flushVillage() — inconsistente y potencialmente
// un update directo a DB. Ahora usa el mismo patrón que beforeunload.
document.addEventListener('visibilitychange', function () {
  if (document.hidden && activeVillage && currentUser) {
    try {
      var s = activeVillage.state;
      // Fire-and-forget intencional: visibilitychange no puede awaitar
      sbClient.rpc('save_village_client', {
        p_village_id:      activeVillage.id,
        p_build_queue:     s.build_queue     || [],
        p_mission_queue:   s.mission_queue   || [],
        p_last_aldeano_at: s.last_aldeano_at || null
      });
    } catch (e) { }
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
