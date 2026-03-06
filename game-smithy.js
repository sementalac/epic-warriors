// ============================================================
// EPIC WARRIORS — game-smithy.js  (v1.81)
// Herrería: mejora de armas y armaduras individuales por tropa.
// Los niveles se guardan en profiles.weapon_levels / armor_levels.
// Nivel máximo de mejora: limitado por nivel de la Herrería (máx 15).
// Bonificación en combate: +1 stat weapon / +1 stat armor por nivel.
// ============================================================
// FIX SUMMARY (2 issues → 1 RPC) [v1.74]
// [CRÍTICO-1] upgradeSmithyItem: ahora llama upgrade_smithy_secure en vez de:
//   - descontar recursos en cliente (manipulable en consola)
//   - dos escrituras no atómicas (profiles + scheduleSave)
//   - validar nivel herrería desde cliente (manipulable)
// [MEDIO-2]   nivel herrería validado en servidor dentro de la misma RPC
// ============================================================
// FIX SUMMARY (3 issues) [v1.80 — 2 pasadas de auditoría]
// [CRÍTICO-3] upgradeSmithyItem: null-guard en data antes de data.ok
// [MEDIO-4]   upgradeSmithyItem: last_updated reseteado tras aplicar new_resources
// [MENOR-5]   renderSmithy: escapeHtml() en nombres y iconos de tropa/item
// ============================================================
// FIX SUMMARY [v1.81]
// [MENOR-6]   renderSmithy: eliminados todos los onclick inline — reemplazados
//   por data-attributes (data-troop, data-type) + un único listener de evento
//   en el contenedor smithyContent. Elimina el falso positivo
//   Trojan:JS/FakeUpdate.B de Microsoft Defender y es más limpio:
//   el listener sobrevive re-renders y no depende de globals de string.
// ============================================================

// ── Nombres y costes multiplicadores por tropa ─────────────
var SMITHY_DATA = {
  aldeano: {
    costMult: 1.0,
    weapon: { name: 'Guadaña Reforzada',    icon: '🌾', desc: 'Hoja de acero rústico remachada al mango. Más mortal que la hoz original.' },
    armor:  { name: 'Escudo de Cuero',       icon: '🪵', desc: 'Piel de buey curtida y cosida sobre armazón de madera. Ligero, básico.' }
  },
  soldado: {
    costMult: 2.5,
    weapon: { name: 'Espada de Hierro',      icon: '⚔️',  desc: 'Hoja templada en fragua de campaña. Filo que no cede bajo armaduras ligeras.' },
    armor:  { name: 'Cota de Mallas',        icon: '🔩', desc: 'Anillas de hierro remachadas a mano. Clásica protección de infantería.' }
  },
  mago: {
    costMult: 3.0, magical: true,
    weapon: { name: 'Báculo Arcano',         icon: '🪄', desc: 'Canal de madera estelar grabado con runas de amplificación. Concentra la esencia.' },
    armor:  { name: 'Túnica Lunar',          icon: '✨', desc: 'Seda imbuida con hilos de esencia solidificada. Barrera invisible ante ataques físicos.' }
  },
  druida: {
    costMult: 2.8, magical: true,
    weapon: { name: 'Báculo de Roble',       icon: '🌿', desc: 'Madera del bosque primigenio, reforzada por el propio espíritu del árbol.' },
    armor:  { name: 'Coraza de Raíces',      icon: '🌲', desc: 'Raíces vivas entrelazadas que se endurecen con el flujo de esencia de la tierra.' }
  },
  explorador: {
    costMult: 2.2,
    weapon: { name: 'Arco de Caza',          icon: '🏹', desc: 'Madera de tejo curvada en frío y tendón de bestia. Alcance y precisión superiores.' },
    armor:  { name: 'Cuero Endurecido',      icon: '🦺', desc: 'Capas dobles de cuero animal con placas de hueso cosidas al interior. Ligero y resistente.' }
  },
  asesino: {
    costMult: 4.0,
    weapon: { name: 'Daga de Sombra',        icon: '🗡️', desc: 'Acero ennegrecido con veneno de araña de caverna. Un rasguño puede ser letal.' },
    armor:  { name: 'Capucha de Sombras',    icon: '🎭', desc: 'Tejido ocultador tratado con resinas de cueva. Desvía miradas y golpes por igual.' }
  },
  paladin: {
    costMult: 5.0,
    weapon: { name: 'Martillo de Guerra',    icon: '🔨', desc: 'Mazo de acero macizo forjado a golpe sagrado. Aplasta escudos y corazas de un impacto.' },
    armor:  { name: 'Escudo Templario',      icon: '🛡️', desc: 'Plancha de acero grabada con sellos de protección divina. La muralla del campo de batalla.' }
  },
  chaman: {
    costMult: 4.0, magical: true,
    weapon: { name: 'Tótem del Trueno',      icon: '⚡', desc: 'Bastón ritual tallado en hueso de criatura ancestral, cargado con el relámpago tribal.' },
    armor:  { name: 'Pelaje Sagrado',        icon: '🐾', desc: 'Piel de bestia mítica engarzada con amuletos de guerra. Protege cuerpo y espíritu.' }
  },
  invocador: {
    costMult: 2.0, magical: true,
    weapon: { name: 'Orbe de Invocación',    icon: '🔮', desc: 'Esfera de cristal etéreo. Amplifica el poder de mando sobre las criaturas invocadas.' },
    armor:  { name: 'Velo Etéreo',           icon: '💫', desc: 'Barrera de esencia comprimida. Desvía los impactos físicos antes de que toquen el cuerpo.' }
  }
};

var SMITHY_MAX_LEVEL = 15;

// ── Fórmulas de coste ──────────────────────────────────────

function smithyWeaponCost(troopKey, level) {
  var d = SMITHY_DATA[troopKey]; if (!d) return null;
  var m = d.costMult;
  var h = Math.floor(phasedVal(level, 80 * m,  2, 10, 1.3, 15, 1.05));
  var w = Math.floor(phasedVal(level, 50 * m,  2, 10, 1.3, 15, 1.05));
  if (d.magical) {
    return { hierro: Math.floor(h * 0.45), esencia: Math.floor(w * 1.2) };
  }
  return { hierro: h, madera: w };
}

function smithyArmorCost(troopKey, level) {
  var d = SMITHY_DATA[troopKey]; if (!d) return null;
  var m = d.costMult;
  var h = Math.floor(phasedVal(level, 60 * m,  2, 10, 1.3, 15, 1.05));
  var p = Math.floor(phasedVal(level, 100 * m, 2, 10, 1.3, 15, 1.05));
  if (d.magical) {
    return { hierro: Math.floor(h * 0.4), esencia: Math.floor(p * 1.1) };
  }
  return { hierro: h, piedra: p };
}

// ── Helpers ────────────────────────────────────────────────

function smithyCanAfford(cost, res) {
  for (var k in cost) {
    if ((res[k] || 0) < cost[k]) return false;
  }
  return true;
}

function smithyCostHtml(cost, res) {
  return Object.keys(cost).map(function(k) {
    var ok = (res[k] || 0) >= cost[k];
    var label = { madera:'🌲', piedra:'🪨', hierro:'⚙️', esencia:'✨' }[k] || k;
    return '<span style="color:' + (ok ? 'var(--ok)' : 'var(--danger)') + ';margin-right:8px;">'
      + label + ' ' + fmtCost(cost[k]) + '</span>'; // v1.82: fmtCost — exacto hasta 9.999 (regla v1.73)
  }).join('');
}

// ── Upgrade ────────────────────────────────────────────────
// Toda la validación y escritura ocurre en upgrade_smithy_secure.
// El cliente solo calcula el coste para mostrarlo en la UI;
// el servidor lo verifica de forma independiente.
async function upgradeSmithyItem(troopKey, type) {
  if (!activeVillage || !currentUser) return;

  // Validar que troopKey y type son valores conocidos antes de cualquier RPC
  if (!SMITHY_DATA[troopKey]) return;
  if (type !== 'weapon' && type !== 'armor') return;

  var rd = await loadResearchData();
  var key = type === 'weapon' ? 'weapon_levels' : 'armor_levels';
  var currentLvl = (rd[key] && rd[key][troopKey]) || 0;
  var nextLvl = currentLvl + 1;

  // Calcular coste para pasarlo a la RPC (que lo verificará en servidor)
  var cost = type === 'weapon' ? smithyWeaponCost(troopKey, nextLvl) : smithyArmorCost(troopKey, nextLvl);
  if (!cost) return;

  // Validación UI rápida (no de seguridad — la seguridad está en el servidor)
  var vs = activeVillage.state;
  var bldLvl = (vs.buildings['herreria'] && vs.buildings['herreria'].level) || 0;
  if (bldLvl === 0) { showNotif('Construye la Herrería primero.', 'err'); return; }
  if (nextLvl > SMITHY_MAX_LEVEL) { showNotif('Ya está al nivel máximo.', 'err'); return; }

  setSave('saving');
  try {
    var { data, error } = await sbClient.rpc('upgrade_smithy_secure', {
      p_village_id: activeVillage.id,
      p_troop_key:  troopKey,
      p_type:       type,
      p_cost:       cost
    });

    if (error) throw error;
    if (!data || !data.ok) {
      var msgs = {
        'village_not_found':      'Aldea no encontrada.',
        'herreria_not_built':     'Construye la Herrería primero.',
        'already_max_level':      'Ya está al nivel máximo.',
        'herreria_level_too_low': 'La Herrería (nv.' + bldLvl + ') no es suficiente. Sube la Herrería primero.',
        'insufficient_resources': 'Recursos insuficientes.',
        'invalid_type':           'Tipo inválido.'
      };
      showNotif((data && msgs[data.error]) || ('Error: ' + (data && data.error)), 'err');
      setSave('error');
      return;
    }

    // Aplicar estado devuelto por servidor
    if (data.new_resources) {
      activeVillage.state.resources = data.new_resources;
      // Resetar last_updated para que calcRes() no acumule producción desde el
      // timestamp anterior — el servidor ya contabilizó todo hasta este momento.
      activeVillage.state.last_updated = new Date().toISOString();
    }

    // Actualizar cache local de investigación
    rd[key] = rd[key] || {};
    rd[key][troopKey] = data.new_level;

    var d = SMITHY_DATA[troopKey];
    showNotif(d[type].icon + ' ' + d[type].name + ' → Nv.' + data.new_level + '!', 'ok');
    setSave('saved');
    // Pasar rd precargado para que renderSmithy no haga otra query a Supabase
    renderSmithy(rd);
  } catch (e) {
    setSave('error');
    showNotif('Error: ' + (e.message || 'No se pudo mejorar'), 'err');
    console.error('upgradeSmithyItem error:', e);
  }
}

// ── Render ─────────────────────────────────────────────────
// FIX [v1.81]: los botones de mejora ya NO usan onclick inline.
// En su lugar llevan data-troop y data-type. Un único listener
// delegado en el contenedor captura todos los clicks — sin
// interpolación de strings en atributos de evento.

async function renderSmithy(preloadedRd) {
  var box = document.getElementById('smithyContent');
  if (!box) return;
  if (!activeVillage) { box.innerHTML = '<div class="muted">Cargando…</div>'; return; }

  var vs     = activeVillage.state;
  var res    = calcRes(vs);
  var bldLvl = (vs.buildings['herreria'] && vs.buildings['herreria'].level) || 0;

  if (bldLvl === 0) {
    box.innerHTML = '<div class="card" style="text-align:center;padding:36px 20px;color:var(--dim);">'
      + '<div style="font-size:3rem;margin-bottom:14px;">🔨</div>'
      + '<div style="font-size:.85rem;max-width:340px;margin:auto;line-height:1.7;">'
      + 'Construye la <b style="color:var(--accent)">Herrería</b> desde el panel de Edificios para desbloquear '
      + 'las mejoras de armas y armaduras de tus tropas.</div></div>';
    return;
  }

  var rd    = preloadedRd || await loadResearchData();
  var wLvls = rd.weapon_levels || {};
  var aLvls = rd.armor_levels  || {};

  var html = '';

  // Cabecera estado herrería
  var smithyPct = Math.round(bldLvl / 15 * 100);
  html += '<div class="card" style="margin-bottom:14px;">'
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
    + '<div style="flex:1;">'
    + '<div class="muted" style="font-size:.65rem;letter-spacing:.1em;margin-bottom:6px;">HERRERÍA</div>'
    + '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:5px;">'
    + '<span style="font-size:1.4rem;color:var(--accent);font-family:VT323,monospace;">Nv. ' + bldLvl + '</span>'
    + '<span style="font-size:.7rem;color:var(--dim);">/ 15</span>'
    + '</div>'
    + '<div style="height:4px;background:rgba(255,255,255,.07);border-radius:2px;max-width:200px;">'
    + '<div style="height:4px;width:' + smithyPct + '%;background:var(--ok);border-radius:2px;"></div>'
    + '</div>'
    + '<div class="muted" style="font-size:.6rem;margin-top:4px;">Mejoras hasta Nv.' + bldLvl + ' desbloqueadas</div>'
    + '</div>'
    + '<div style="font-size:.68rem;color:var(--dim);line-height:2;text-align:right;flex-shrink:0;">'
    + '<span style="color:var(--ok);">⚔️ +arma</span> en combate<br>'
    + '<span style="color:var(--accent);">🛡️ +armor</span> en combate'
    + '</div></div></div>';

  // Grid de tropas
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;">';

  Object.keys(SMITHY_DATA).forEach(function(tKey) {
    var d     = SMITHY_DATA[tKey];
    var troop = TROOP_TYPES[tKey];
    if (!troop) return;

    var wLvl    = wLvls[tKey] || 0;
    var aLvl    = aLvls[tKey] || 0;
    var wNext   = wLvl + 1;
    var aNxt    = aLvl + 1;
    var wCost   = (wLvl < SMITHY_MAX_LEVEL) ? smithyWeaponCost(tKey, wNext) : null;
    var aCost   = (aLvl < SMITHY_MAX_LEVEL) ? smithyArmorCost(tKey, aNxt)  : null;
    var wLocked = wLvl >= bldLvl && wLvl < SMITHY_MAX_LEVEL;
    var aLocked = aLvl >= bldLvl && aLvl < SMITHY_MAX_LEVEL;
    var wMaxed  = wLvl >= SMITHY_MAX_LEVEL;
    var aMaxed  = aLvl >= SMITHY_MAX_LEVEL;
    var wCanBuy = wCost && !wLocked && !wMaxed && smithyCanAfford(wCost, res);
    var aCanBuy = aCost && !aLocked && !aMaxed && smithyCanAfford(aCost, res);

    function bar(lvl) {
      var pct = Math.round(lvl / SMITHY_MAX_LEVEL * 100);
      return '<div style="height:3px;background:rgba(255,255,255,.08);border-radius:2px;margin:4px 0 8px;">'
        + '<div style="height:3px;border-radius:2px;width:' + pct + '%;background:var(--accent2);"></div></div>';
    }

    // FIX [v1.81]: botón con data-troop + data-type en lugar de onclick inline.
    // El listener delegado en el contenedor lee estos atributos al hacer click.
    function itemBlock(type, itemD, lvl, nextLvl, cost, canBuy, locked, maxed) {
      var col = type === 'weapon' ? 'var(--ok)' : 'var(--accent)';
      var bdr = type === 'weapon' ? 'rgba(79,255,176,.15)' : 'rgba(0,212,255,.12)';
      var h = '<div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px;">';
      h += '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '<span style="font-size:.95rem;">'  + escapeHtml(itemD.icon) + '</span>'
        + '<span style="font-size:.8rem;color:var(--text);margin:0 6px;">' + escapeHtml(itemD.name) + '</span>'
        + '<span style="font-size:.65rem;color:var(--dim);flex:1;">(+' + lvl + ' ' + type + ')</span>'
        + '<span style="font-size:.7rem;color:' + (maxed ? 'var(--gold)' : col) + ';">Nv.' + lvl + '/' + SMITHY_MAX_LEVEL + '</span></div>';
      h += bar(lvl);
      if (maxed) {
        h += '<div style="font-size:.65rem;color:var(--gold);text-align:center;">★ MÁXIMO ALCANZADO</div>';
      } else if (locked) {
        h += '<div class="muted" style="font-size:.63rem;text-align:center;">🔒 Requiere Herrería Nv.' + nextLvl + '</div>';
      } else if (cost) {
        h += '<div style="font-size:.62rem;margin-bottom:6px;">' + smithyCostHtml(cost, res) + '</div>';
        h += '<button'
          + ' data-troop="' + escapeHtml(tKey) + '"'
          + ' data-type="'  + escapeHtml(type) + '"'
          + ' style="width:100%;padding:5px 0;border-radius:4px;font-family:VT323,monospace;font-size:.82rem;cursor:pointer;'
          + 'background:' + (canBuy ? bdr : 'rgba(255,255,255,.03)') + ';'
          + 'border:1px solid ' + (canBuy ? col : 'var(--border)') + ';'
          + 'color:' + (canBuy ? col : 'var(--dim)') + ';">'
          + '⬆ Mejorar a Nv.' + nextLvl + '</button>';
      }
      h += '</div>';
      return h;
    }

    html += '<div class="card" style="padding:14px;">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);">'
      + '<span style="font-size:1.8rem;">' + escapeHtml(troop.icon) + '</span>'
      + '<div style="flex:1;">'
      + '<div style="font-size:.88rem;color:var(--accent);font-family:VT323,monospace;">' + escapeHtml(troop.name).toUpperCase() + '</div>'
      + '<div class="muted" style="font-size:.6rem;">Ataque base: ' + troop.weapon + ' · Defensa base: ' + troop.armor + '</div>'
      + (d.magical ? '<div style="font-size:.58rem;color:var(--esencia,#c084fc);margin-top:1px;">✨ Tropa mágica — usa Esencia</div>' : '')
      + '</div>'
      + '<div style="text-align:right;font-size:.68rem;color:var(--dim);line-height:1.9;">'
      + '<span style="font-size:.55rem;letter-spacing:.08em;opacity:.6;">ARMA</span> '
      + (wLvl > 0 ? '<b style="color:var(--ok);">+' + wLvl + '</b>' : '<span style="opacity:.4;">—</span>') + '<br>'
      + '<span style="font-size:.55rem;letter-spacing:.08em;opacity:.6;">ARMOR</span> '
      + (aLvl > 0 ? '<b style="color:var(--accent);">+' + aLvl + '</b>' : '<span style="opacity:.4;">—</span>')
      + '</div></div>';
    html += itemBlock('weapon', d.weapon, wLvl, wNext, wCost, wCanBuy, wLocked, wMaxed);
    html += itemBlock('armor',  d.armor,  aLvl, aNxt,  aCost, aCanBuy, aLocked, aMaxed);
    html += '</div>';
  });

  html += '</div>';

  // Escribir el HTML y enganchar el listener delegado.
  // Se reemplaza el nodo entero para eliminar listeners anteriores
  // y evitar que se acumulen en re-renders sucesivos.
  var fresh = box.cloneNode(false);
  fresh.innerHTML = html;
  fresh.addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-troop]');
    if (!btn) return;
    var troop = btn.getAttribute('data-troop');
    var type  = btn.getAttribute('data-type');
    // Doble validación: solo keys conocidos llegan a la RPC
    if (troop && type && SMITHY_DATA[troop] && (type === 'weapon' || type === 'armor')) {
      upgradeSmithyItem(troop, type);
    }
  });
  box.parentNode.replaceChild(fresh, box);
}
