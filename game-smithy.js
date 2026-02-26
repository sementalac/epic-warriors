// ============================================================
// EPIC WARRIORS — game-smithy.js  (v1.39)
// Herrería: mejora de armas y armaduras individuales por tropa.
// Los niveles se guardan en profiles.weapon_levels / armor_levels.
// Nivel máximo de mejora: limitado por nivel de la Herrería (máx 15).
// Bonificación en combate: +1 stat weapon / +1 stat armor por nivel.
// ============================================================

// ── Nombres y costes multiplicadores por tropa ─────────────
// costMult: escala el coste base. Tropas elite = más caro.
// magical: usa esencia en lugar de parte de madera/piedra.
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
// phasedVal(nivel, base, ×2 hasta nv10, ×1.3 hasta nv15, ×1.05 más allá)
// Armas: hierro (primario) + madera (mangos/astiles)
// Armaduras: hierro + piedra (temple y refuerzo)
// Mágicos: hierro reducido + esencia (en lugar de madera/piedra)

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
      + label + ' ' + fmt(cost[k]) + '</span>';
  }).join('');
}

// ── Upgrade ────────────────────────────────────────────────

async function upgradeSmithyItem(troopKey, type) {
  if (!activeVillage || !currentUser) return;
  var vs = activeVillage.state;
  var bldLvl = (vs.buildings['herreria'] && vs.buildings['herreria'].level) || 0;
  if (bldLvl === 0) { showNotif('Construye la Herrería primero.', 'err'); return; }

  var rd = await loadResearchData();
  var key = type === 'weapon' ? 'weapon_levels' : 'armor_levels';
  var currentLvl = (rd[key] && rd[key][troopKey]) || 0;
  var nextLvl = currentLvl + 1;

  if (nextLvl > SMITHY_MAX_LEVEL) { showNotif('Ya está al nivel máximo.', 'err'); return; }
  if (nextLvl > bldLvl) {
    showNotif('La Herrería (nv.' + bldLvl + ') limita las mejoras a nv.' + bldLvl + '. Sube la Herrería primero.', 'err'); return;
  }

  var cost = type === 'weapon' ? smithyWeaponCost(troopKey, nextLvl) : smithyArmorCost(troopKey, nextLvl);
  if (!cost) return;
  var res = calcRes(vs);
  if (!smithyCanAfford(cost, res)) {
    var needed = Object.keys(cost).map(function(k){ return fmt(cost[k]) + ' ' + k; }).join(', ');
    showNotif('Faltan recursos: ' + needed, 'err'); return;
  }

  // Descontar recursos del estado
  snapshotResources(vs);
  for (var rk in cost) vs.resources[rk] = Math.max(0, (vs.resources[rk] || 0) - cost[rk]);
  scheduleSave();

  // Guardar en profiles
  var newLevels = Object.assign({}, rd[key]);
  newLevels[troopKey] = nextLvl;
  var upd = {};
  upd[key] = newLevels;
  var { error } = await sbClient.from('profiles').update(upd).eq('id', currentUser.id);
  if (error) { showNotif('Error al guardar mejora.', 'err'); console.error(error); return; }

  // Actualizar cache local
  rd[key] = newLevels;

  var d = SMITHY_DATA[troopKey];
  var icon = d[type].icon;
  var name = d[type].name;
  showNotif(icon + ' ' + name + ' → Nv.' + nextLvl + '!', 'ok');
  renderSmithy();
}

// ── Render ─────────────────────────────────────────────────

async function renderSmithy() {
  var box = document.getElementById('smithyContent');
  if (!box) return;
  if (!activeVillage) { box.innerHTML = '<div class="muted">Cargando…</div>'; return; }

  var vs  = activeVillage.state;
  var res = calcRes(vs);
  var bldLvl = (vs.buildings['herreria'] && vs.buildings['herreria'].level) || 0;

  if (bldLvl === 0) {
    box.innerHTML = '<div class="card" style="text-align:center;padding:36px 20px;color:var(--dim);">'
      + '<div style="font-size:3rem;margin-bottom:14px;">🔨</div>'
      + '<div style="font-size:.85rem;max-width:340px;margin:auto;line-height:1.7;">'
      + 'Construye la <b style="color:var(--accent)">Herrería</b> desde el panel de Edificios para desbloquear '
      + 'las mejoras de armas y armaduras de tus tropas.</div></div>';
    return;
  }

  var rd = await loadResearchData();
  var wLvls = rd.weapon_levels || {};
  var aLvls = rd.armor_levels  || {};

  var html = '';

  // Cabecera estado herrería
  html += '<div class="card" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
    + '<div><div class="muted" style="font-size:.68rem;letter-spacing:.08em;margin-bottom:4px;">HERRERÍA — NIVEL</div>'
    + '<div style="font-size:1.5rem;color:var(--accent);font-family:VT323,monospace;">Nv. ' + bldLvl + ' / 15</div>'
    + '<div class="muted" style="font-size:.62rem;margin-top:2px;">Mejoras desbloqueadas hasta Nv.' + bldLvl + ' — sube la Herrería para acceder a niveles superiores</div></div>'
    + '<div style="font-size:.7rem;color:var(--dim);line-height:2;text-align:right;">'
    + '⚔️ Cada nivel de <b style="color:var(--text)">arma</b> → +1 stat <span style="color:#f4c430;">weapon</span> en combate<br>'
    + '🛡️ Cada nivel de <b style="color:var(--text)">armadura</b> → +1 stat <span style="color:#7ec8e3;">armor</span> en combate</div></div>';

  // Grid
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;">';

  Object.keys(SMITHY_DATA).forEach(function(tKey) {
    var d = SMITHY_DATA[tKey];
    var troop = TROOP_TYPES[tKey];
    if (!troop) return;

    var wLvl  = wLvls[tKey] || 0;
    var aLvl  = aLvls[tKey] || 0;
    var wNext = wLvl + 1;
    var aNxt  = aLvl + 1;
    var wCost = (wLvl < SMITHY_MAX_LEVEL) ? smithyWeaponCost(tKey, wNext) : null;
    var aCost = (aLvl < SMITHY_MAX_LEVEL) ? smithyArmorCost(tKey, aNxt)  : null;
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
    function itemBlock(type, itemD, lvl, nextLvl, cost, canBuy, locked, maxed) {
      var col = type === 'weapon' ? 'var(--ok)' : 'var(--accent)';
      var bdr = type === 'weapon' ? 'rgba(79,255,176,.15)' : 'rgba(0,212,255,.12)';
      var html = '<div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '<span style="font-size:.95rem;">' + itemD.icon + '</span>'
        + '<span style="font-size:.8rem;color:var(--text);margin:0 6px;">' + itemD.name + '</span>'
        + '<span style="font-size:.65rem;color:var(--dim);flex:1;">(+' + lvl + ' ' + type + ')</span>'
        + '<span style="font-size:.7rem;color:' + (maxed ? 'var(--gold)' : col) + ';">Nv.' + lvl + '/' + SMITHY_MAX_LEVEL + '</span></div>';
      html += bar(lvl);
      if (maxed) {
        html += '<div style="font-size:.65rem;color:var(--gold);text-align:center;">★ MÁXIMO ALCANZADO</div>';
      } else if (locked) {
        html += '<div class="muted" style="font-size:.63rem;text-align:center;">🔒 Requiere Herrería Nv.' + nextLvl + '</div>';
      } else if (cost) {
        html += '<div style="font-size:.62rem;margin-bottom:6px;">' + smithyCostHtml(cost, res) + '</div>';
        html += '<button onclick="upgradeSmithyItem(\'' + escapeJs(tKey) + '\',\'' + type + '\')"'
          + ' style="width:100%;padding:5px 0;border-radius:4px;font-family:VT323,monospace;font-size:.82rem;cursor:pointer;'
          + 'background:' + (canBuy ? bdr : 'rgba(255,255,255,.03)') + ';'
          + 'border:1px solid ' + (canBuy ? col : 'var(--border)') + ';'
          + 'color:' + (canBuy ? col : 'var(--dim)') + ';">'
          + '⬆ Mejorar a Nv.' + nextLvl + '</button>';
      }
      html += '</div>';
      return html;
    }

    html += '<div class="card" style="padding:14px;">';
    // Cabecera tropa
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);">'
      + '<span style="font-size:1.8rem;">' + troop.icon + '</span>'
      + '<div style="flex:1;">'
      + '<div style="font-size:.88rem;color:var(--accent);font-family:VT323,monospace;">' + troop.name.toUpperCase() + '</div>'
      + '<div class="muted" style="font-size:.6rem;">Base weapon: ' + troop.weapon + ' · Base armor: ' + troop.armor + '</div>'
      + (d.magical ? '<div style="font-size:.58rem;color:var(--esencia,#c084fc);margin-top:1px;">✨ Tropa mágica — usa Esencia</div>' : '')
      + '</div>'
      + '<div style="text-align:right;font-size:.68rem;color:var(--dim);line-height:1.8;">'
      + '⚔️ ' + (wLvl > 0 ? '<b style="color:var(--ok);">+' + wLvl + '</b>' : '—') + '<br>'
      + '🛡️ ' + (aLvl > 0 ? '<b style="color:var(--accent);">+' + aLvl + '</b>' : '—')
      + '</div></div>';
    html += itemBlock('weapon', d.weapon, wLvl, wNext, wCost, wCanBuy, wLocked, wMaxed);
    html += itemBlock('armor',  d.armor,  aLvl, aNxt,  aCost, aCanBuy, aLocked, aMaxed);
    html += '</div>';
  });

  html += '</div>';
  box.innerHTML = html;
}
