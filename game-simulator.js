// game-simulator.js — Simulador de batalla Epic Warriors v1.37
// Depende de: TROOP_TYPES, CREATURE_TYPES (definidos en el HTML principal)
// Reglas idénticas al motor de combate real del juego

function renderSimulator() {
  var box = document.getElementById('simulatorContent');
  if (!box) return;

  // Convertir TROOP_TYPES del juego al formato que espera el simulador
  var simTroops = {};
  Object.keys(TROOP_TYPES).forEach(function(k) {
    var t = TROOP_TYPES[k];
    simTroops[k] = {
      name:           t.name,
      icon:           t.icon,
      hp:             t.hp,
      damage:         t.damage,
      defense:        t.defense,
      dexterity:      t.dexterity || 10,
      attackChance:   t.attackChance || 12,
      attacksPerTurn: t.attacksPerTurn || 1,
      baseWpn:        t.weapon || 0,
      baseArm:        t.armor  || 0,
    };
  });
  var simCreatures = {};
  Object.keys(CREATURE_TYPES).forEach(function(k) {
    var c = CREATURE_TYPES[k];
    simCreatures[k] = {
      name:           c.name,
      icon:           c.icon,
      hp:             c.hp,
      damage:         c.damage,
      defense:        c.defense,
      dexterity:      c.dexterity || 10,
      attackChance:   c.attackChance || 12,
      attacksPerTurn: c.attacksPerTurn || 1,
    };
  });

  var troopsJson    = JSON.stringify(simTroops);
  var creaturesJson = JSON.stringify(simCreatures);

  // CSS del simulador standalone
  var simCSS = `
:root {
  --bg:      #07060a;
  --panel:   #110f1a;
  --panel2:  #1a1726;
  --panel3:  #211d30;
  --border:  #2e2a42;
  --accent:  #c8a0ff;
  --gold:    #f0c040;
  --text:    #d8cef0;
  --dim:     #6a6080;
  --danger:  #e05060;
  --ok:      #50d090;
  --atk:     #ff7050;
  --def:     #60b0ff;
}
* { margin:0; padding:0; box-sizing:border-box; }
body { background:var(--bg); color:var(--text); font-family:'Share Tech Mono','VT323',monospace; min-height:100vh; }

.header {
  text-align:center; padding:22px 20px 10px;
  background: linear-gradient(180deg, rgba(200,160,255,.05) 0%, transparent 100%);
  border-bottom: 1px solid var(--border);
}
.header h1 {
  font-family:'VT323',monospace; font-size:3rem; color:var(--gold);
  text-shadow:0 0 30px rgba(240,192,64,.4); letter-spacing:.1em;
}
.header-meta { color:var(--dim); font-size:.75rem; margin-top:3px; letter-spacing:.15em; }
.workspace { max-width:1600px; margin:0 auto; padding:14px; display:flex; gap:14px; }
.col-armies { flex:1; display:flex; flex-direction:column; gap:10px; min-width:0; }
.col-log    { width:460px; flex-shrink:0; display:flex; flex-direction:column; gap:10px; }
.sec-label {
  font-size:.62rem; color:var(--dim); letter-spacing:.14em; text-transform:uppercase;
  padding:3px 0 7px; border-bottom:1px solid var(--border); margin:10px 0 8px;
}
.sec-label:first-child { margin-top:0; }
.contingent-band {
  padding:8px 14px 0; margin-bottom:6px; border-radius:6px; border:1px solid var(--border);
  background:var(--panel); position:relative; overflow:hidden;
}
.contingent-band::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
.contingent-band.atk::before { background:var(--atk); }
.contingent-band.def::before { background:var(--def); }
.contingent-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.c-badge {
  font-size:.6rem; padding:2px 7px; border-radius:2px; letter-spacing:.1em;
  font-family:'VT323',monospace; font-size:.75rem;
}
.c-badge.atk { background:rgba(255,112,80,.12); border:1px solid rgba(255,112,80,.35); color:var(--atk); }
.c-badge.def { background:rgba(96,176,255,.12); border:1px solid rgba(96,176,255,.35); color:var(--def); }
.c-name {
  flex:1; background:transparent; border:none; border-bottom:1px solid var(--border);
  color:var(--text); font-family:'VT323',monospace; font-size:1.05rem; outline:none; padding:2px 4px;
}
.c-name:focus { border-color:var(--accent); }
.c-summary { font-size:.65rem; color:var(--dim); margin-left:auto; white-space:nowrap; }
.btn-remove {
  background:rgba(224,80,96,.1); border:1px solid rgba(224,80,96,.25);
  color:var(--danger); padding:2px 8px; border-radius:3px; font-size:.65rem;
  cursor:pointer; font-family:'VT323',monospace; letter-spacing:.05em; transition:all .12s;
}
.btn-remove:hover { background:rgba(224,80,96,.2); }
.troop-table { width:100%; border-collapse:collapse; }
.troop-table th {
  font-size:.6rem; color:var(--dim); letter-spacing:.08em; text-align:right; padding:2px 5px 6px; font-weight:normal; white-space:nowrap;
}
.troop-table th:first-child, .troop-table th:nth-child(2) { text-align:left; }
.troop-table td { padding:2px 3px; vertical-align:middle; }
.troop-table tr:hover td { background:rgba(255,255,255,.02); }
.t-icon { font-size:.95rem; width:26px; text-align:center; }
.t-name { font-size:.72rem; color:var(--text); white-space:nowrap; padding:0 4px; min-width:72px; }
.t-creature { color:var(--accent) !important; }
.t-input {
  background:rgba(255,255,255,.04); border:1px solid var(--border);
  border-radius:3px; color:var(--gold); font-family:'VT323',monospace;
  font-size:.88rem; padding:2px 4px; text-align:right; outline:none; transition:border-color .1s;
}
.t-input:focus  { border-color:var(--accent); background:rgba(200,160,255,.06); }
.t-input.qty    { width:58px; color:var(--gold); }
.t-input.lvl    { width:42px; color:var(--accent); }
.t-input.wpn    { width:42px; color:#90d0ff; }
.t-input.arm    { width:42px; color:#90ffb0; }
.t-input.c-only { width:58px; }
.t-input[disabled] { opacity:.25; cursor:not-allowed; }
.col-h-qty { color:var(--gold) !important; }
.col-h-lvl { color:var(--accent) !important; }
.col-h-wpn { color:#90d0ff !important; }
.col-h-arm { color:#90ffb0 !important; }
.formula-hint { font-size:.58rem; color:var(--dim); padding:4px 0 6px; line-height:1.7; }
.c-totals {
  display:flex; gap:16px; padding:7px 0 10px; font-size:.68rem; color:var(--dim);
  border-top:1px solid rgba(255,255,255,.04); margin-top:4px;
}
.c-totals span { color:var(--gold); }
.add-row { display:flex; gap:8px; }
.btn-add {
  flex:1; padding:9px 0; border-radius:4px; cursor:pointer;
  font-family:'VT323',monospace; font-size:.95rem; letter-spacing:.08em; transition:all .12s;
}
.btn-add.atk { background:rgba(255,112,80,.07); border:1px dashed rgba(255,112,80,.35); color:var(--atk); }
.btn-add.atk:hover { background:rgba(255,112,80,.14); }
.btn-add.def { background:rgba(96,176,255,.07); border:1px dashed rgba(96,176,255,.35); color:var(--def); }
.btn-add.def:hover { background:rgba(96,176,255,.14); }
.wall-panel {
  background:var(--panel); border:1px solid var(--border); border-radius:6px;
  padding:11px 16px; display:flex; align-items:center; gap:16px; flex-wrap:wrap;
}
.wall-panel label { color:var(--dim); font-size:.82rem; }
.wall-input {
  width:60px; background:var(--panel2); border:1px solid var(--border);
  border-radius:3px; color:var(--text); font-family:'VT323',monospace;
  font-size:1.1rem; padding:3px 7px; outline:none;
}
.wall-input:focus { border-color:var(--accent); }
.wall-info { color:var(--ok); font-size:.8rem; }
.btn-row { display:flex; gap:8px; align-items:center; }
.btn-sim {
  flex:1; background:linear-gradient(135deg,var(--gold),#b06800); color:#000; border:none; padding:13px 0;
  font-family:'VT323',monospace; font-size:1.35rem; border-radius:5px; cursor:pointer; letter-spacing:.07em;
  box-shadow:0 4px 20px rgba(240,192,64,.2); transition:all .15s;
}
.btn-sim:hover  { transform:translateY(-2px); box-shadow:0 6px 26px rgba(240,192,64,.32); }
.btn-sim:active { transform:translateY(1px); }
.btn-clr {
  background:transparent; color:var(--dim); border:1px solid var(--border);
  padding:13px 20px; font-family:'VT323',monospace; font-size:1rem;
  border-radius:5px; cursor:pointer; transition:all .12s;
}
.btn-clr:hover { color:var(--text); border-color:var(--dim); }
.log-panel { background:var(--panel); border:1px solid var(--border); border-radius:6px; overflow:hidden; flex:1; min-height:0; }
.log-head {
  padding:9px 14px; background:var(--panel2); border-bottom:1px solid var(--border);
  font-size:.95rem; color:var(--accent); display:flex; justify-content:space-between; align-items:center;
}
.log-body { max-height:640px; overflow-y:auto; padding:6px; font-size:.7rem; line-height:1.55; font-family:'Share Tech Mono',monospace; }
.log-body::-webkit-scrollbar { width:4px; }
.log-body::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }
.le  { padding:2px 8px; margin:1px 0; border-left:3px solid transparent; border-radius:0 3px 3px 0; }
.la  { border-color:var(--atk); color:#ffb090; background:rgba(255,112,80,.035); }
.ld  { border-color:var(--def); color:#a0ccff; background:rgba(96,176,255,.035); }
.lm  { border-color:var(--border); color:var(--dim); }
.lx  { border-color:var(--danger); color:var(--danger); }
.lt  { border-color:var(--accent); color:var(--accent); padding:5px 8px; margin:7px 0 1px; background:rgba(200,160,255,.04); font-size:.78rem; }
.ls  { color:rgba(255,255,255,.08); font-size:.62rem; padding:1px 8px; }
.lv  { border-color:var(--ok); color:var(--ok); font-size:.9rem; padding:8px 14px; margin:10px 0; background:rgba(80,208,144,.06); text-align:center; }
.li  { border-color:var(--dim); color:var(--dim); }
.empty-log { text-align:center; color:var(--dim); padding:48px 0; font-size:.85rem; }
.res-card { margin:8px 4px; background:var(--panel2); border:1px solid var(--border); border-radius:5px; overflow:hidden; }
.res-winner-banner { text-align:center; padding:10px 16px; font-size:1.05rem; font-weight:bold; font-family:'VT323',monospace; letter-spacing:.08em; }
.res-winner-banner.atk  { background:rgba(255,112,80,.12); color:var(--atk); border-bottom:1px solid rgba(255,112,80,.25); }
.res-winner-banner.def  { background:rgba(96,176,255,.12); color:var(--def); border-bottom:1px solid rgba(96,176,255,.25); }
.res-winner-banner.draw { background:rgba(200,160,255,.1); color:var(--accent); border-bottom:1px solid rgba(200,160,255,.2); }
.res-contingents { display:grid; grid-template-columns:1fr 1fr; }
.res-contingent { padding:10px 13px; border-right:1px solid var(--border); }
.res-contingent:last-child { border-right:none; }
.res-contingent:nth-child(2n) { border-right:none; }
.res-title { font-size:.82rem; margin-bottom:7px; padding-bottom:4px; border-bottom:1px solid rgba(255,255,255,.05); font-family:'VT323',monospace; }
.res-title.atk { color:var(--atk); }
.res-title.def { color:var(--def); }
.res-troop-table { width:100%; border-collapse:collapse; font-size:.65rem; }
.res-troop-table th { color:var(--dim); text-align:right; padding:2px 5px 5px; font-weight:normal; font-size:.58rem; letter-spacing:.07em; }
.res-troop-table th:first-child { text-align:left; }
.res-troop-table td { padding:2px 5px; text-align:right; border-top:1px solid rgba(255,255,255,.03); }
.res-troop-table td:first-child { text-align:left; color:var(--text); }
.rc-ini { color:var(--dim); }
.rc-fin { color:var(--ok); }
.rc-rec { color:#90d0ff; }
.rc-tot { color:var(--gold); font-weight:bold; }
.res-totals { border-top:1px solid rgba(255,255,255,.05); padding:5px 13px; display:flex; justify-content:space-between; font-size:.62rem; color:var(--dim); background:rgba(255,255,255,.015); }
.res-totals span { color:var(--gold); }
.wall-tag { display:inline-block; font-size:.58rem; padding:1px 6px; background:rgba(80,208,144,.08); border:1px solid rgba(80,208,144,.25); color:var(--ok); border-radius:2px; margin-left:6px; vertical-align:middle; }
.wall-tag.resisted { background:rgba(96,176,255,.1); border-color:rgba(96,176,255,.3); color:var(--def); }
@media (max-width:900px) { .workspace { flex-direction:column; } .col-log { width:100%; } .res-contingents { grid-template-columns:1fr; } }
  `;

  // ============================================================
  // JS del simulador embebido — reglas v1.37
  // ============================================================
  var simJS_template = `
// ============================================================
// FORMULAS STAT identicas al juego real v1.37
// Arma: impares +1 Danio, pares +1 AtkChance
//   danioBonus = ceil(wpn/2), chanceBonus = floor(wpn/2)
// Armadura: impares +1 Def, pares +2 HP
//   defBonus = ceil(arm/2), hpBonus = floor(arm/2)*2
// Nivel tropa: HP/Dmg x(1+(lvl-1)x0.04), AtkChance/Def/Dex +(lvl-1)x0.5
// ============================================================
function calcStats(base, lvl, wpn, arm) {
  const growth = 1 + (lvl - 1) * 0.04;
  return {
    hp:             Math.floor(base.hp * growth) + Math.floor(arm / 2) * 2,
    damage:         Math.floor(base.damage * growth) + Math.ceil(wpn / 2),
    attackChance:   base.attackChance + (lvl - 1) * 0.5 + Math.floor(wpn / 2),
    defense:        base.defense + (lvl - 1) * 0.5 + Math.ceil(arm / 2),
    dexterity:      base.dexterity + (lvl - 1) * 0.5,
    attacksPerTurn: base.attacksPerTurn,
    icon:           base.icon,
    name:           base.name,
  };
}

let contingents = [];
let nextId = 1;

function addContingent(side) {
  const idx = contingents.filter(c => c.side === side).length + 1;
  const label = side === 'atk' ? 'Atacante' : 'Defensor';
  contingents.push({ id: 'c' + (nextId++), side, name: label + ' ' + idx });
  renderContingents();
}

function removeContingent(id) {
  contingents = contingents.filter(c => c.id !== id);
  renderContingents();
}

function renderContingents() {
  const area = document.getElementById('contingentsArea');
  if (contingents.length === 0) {
    area.innerHTML = '<div style="text-align:center;color:var(--dim);padding:20px;font-size:.8rem;border:1px dashed var(--border);border-radius:5px;">Añade al menos un atacante y un defensor para simular</div>';
    return;
  }
  const sorted = [...contingents.filter(c => c.side === 'atk'), ...contingents.filter(c => c.side === 'def')];
  area.innerHTML = sorted.map(c => contingentCardHTML(c)).join('');
}

function contingentCardHTML(c) {
  const sideLabel = c.side === 'atk' ? '⚔ ATACANTE' : '🛡 DEFENSOR';
  const troopRows = Object.keys(TROOPS).map(k => {
    const t = TROOPS[k];
    return \`<tr>
      <td class="t-icon">\${t.icon}</td><td class="t-name">\${t.name}</td>
      <td><input class="t-input qty" type="number" id="\${c.id}_qty_\${k}" value="0" min="0" oninput="updateContingentSummary('\${c.id}')"></td>
      <td><input class="t-input lvl" type="number" id="\${c.id}_lvl_\${k}" value="1" min="1" max="30" oninput="updateContingentSummary('\${c.id}')"></td>
      <td><input class="t-input wpn" type="number" id="\${c.id}_wpn_\${k}" value="0" min="0" max="30" oninput="updateContingentSummary('\${c.id}')"></td>
      <td><input class="t-input arm" type="number" id="\${c.id}_arm_\${k}" value="0" min="0" max="30" oninput="updateContingentSummary('\${c.id}')"></td>
    </tr>\`;
  }).join('');

  const creatureRows = Object.keys(CREATURES).map(k => {
    const t = CREATURES[k];
    return \`<tr>
      <td class="t-icon">\${t.icon}</td><td class="t-name t-creature">\${t.name}</td>
      <td><input class="t-input c-only" type="number" id="\${c.id}_qty_\${k}" value="0" min="0" oninput="updateContingentSummary('\${c.id}')"></td>
      <td><input class="t-input" disabled value="—"></td>
      <td><input class="t-input" disabled value="—"></td>
      <td><input class="t-input" disabled value="—"></td>
    </tr>\`;
  }).join('');

  return \`<div class="contingent-band \${c.side}" id="band_\${c.id}">
    <div class="contingent-head">
      <span class="c-badge \${c.side}">\${sideLabel}</span>
      <input class="c-name" id="name_\${c.id}" value="\${escAttr(c.name)}" placeholder="Nombre del contingente" oninput="contingents.find(x=>x.id==='\${c.id}').name=this.value">
      <span class="c-summary" id="sum_\${c.id}">0 uds</span>
      <button class="btn-remove" onclick="removeContingent('\${c.id}')">✗ Eliminar</button>
    </div>
    <table class="troop-table">
      <thead><tr><th></th><th></th><th class="col-h-qty">Cant.</th><th class="col-h-lvl">Niv</th><th class="col-h-wpn">Arma</th><th class="col-h-arm">Arm.</th></tr></thead>
      <tbody>\${troopRows}</tbody>
    </table>
    <div class="sec-label" style="margin-top:10px;">CRIATURAS — stats fijos</div>
    <table class="troop-table">
      <thead><tr><th></th><th></th><th class="col-h-qty">Cant.</th><th></th><th></th><th></th></tr></thead>
      <tbody>\${creatureRows}</tbody>
    </table>
    <div class="formula-hint">Arma: impares +1 Daño, pares +1 AtkChance &nbsp;|&nbsp; Armadura: impares +1 Def, pares +2 HP</div>
    <div class="c-totals" id="ctot_\${c.id}"><span>Total: <span>0</span> unidades</span><span>Poder: <span>0</span></span></div>
  </div>\`;
}

function escAttr(s) { return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function getContingentComp(cid) {
  const comp = [];
  Object.keys(TROOPS).forEach(k => {
    const qty = parseInt(document.getElementById(\`\${cid}_qty_\${k}\`)?.value) || 0;
    if (!qty) return;
    comp.push({
      key:k, data:TROOPS[k], qty, isCreature:false,
      lvl: parseInt(document.getElementById(\`\${cid}_lvl_\${k}\`)?.value) || 1,
      wpn: parseInt(document.getElementById(\`\${cid}_wpn_\${k}\`)?.value) || 0,
      arm: parseInt(document.getElementById(\`\${cid}_arm_\${k}\`)?.value) || 0
    });
  });
  Object.keys(CREATURES).forEach(k => {
    const qty = parseInt(document.getElementById(\`\${cid}_qty_\${k}\`)?.value) || 0;
    if (qty) comp.push({ key:k, data:CREATURES[k], qty, lvl:1, wpn:0, arm:0, isCreature:true });
  });
  return comp;
}

function updateContingentSummary(cid) {
  const comp = getContingentComp(cid);
  const total = comp.reduce((s,c)=>s+c.qty, 0);
  let power = 0;
  comp.forEach(({data,qty,lvl,wpn,arm,isCreature}) => {
    const s = isCreature ? data : calcStats(data, lvl, wpn, arm);
    power += qty * (s.hp * 0.5 + s.damage * (data.attacksPerTurn||1) * 3 + s.defense * 0.5);
  });
  const sumEl = document.getElementById(\`sum_\${cid}\`);
  if (sumEl) sumEl.textContent = \`\${total.toLocaleString()} uds · \${Math.round(power).toLocaleString()} pwr\`;
  const totEl = document.getElementById(\`ctot_\${cid}\`);
  if (totEl) totEl.innerHTML = \`<span>Total: <span>\${total.toLocaleString()}</span> unidades</span><span>Poder: <span>\${Math.round(power).toLocaleString()}</span></span>\`;
}

function updateWallInfo() {
  const lvl = parseInt(document.getElementById('wallLevel').value) || 0;
  document.getElementById('wallInfo').textContent = lvl === 0
    ? 'Sin muralla'
    : \`Nivel \${lvl} → \${(lvl*500).toLocaleString()} HP — Atacantes la golpean mientras defensores contraatacan\`;
}

function divGroups(qty) {
  // Grupos por cubos: bucket1 hasta 10 (cap 10), bucket2 hasta 100 (cap 90),
  // bucket3 hasta 1000 (cap 900), etc.
  // Ej: 50 → [10, 40] | 1001 → [10, 90, 900, 1]
  const g = []; let r = qty, bucketMax = 10, prevMax = 0;
  while (r > 0) {
    const fill = Math.min(r, bucketMax - prevMax);
    g.push(fill); r -= fill; prevMax = bucketMax; bucketMax *= 10;
  }
  return g;
}

function buildGroups(comp, side, contingentId) {
  const groups = [];
  let gid = 1;
  comp.forEach(({ key, data, qty, lvl, wpn, arm, isCreature }) => {
    const eff = isCreature ? { ...data } : calcStats(data, lvl, wpn, arm);
    divGroups(qty).forEach(size => {
      groups.push({
        gid: gid++, side, key, contingentId, name: data.name, icon: data.icon,
        stats: eff,
        count: size, startCount: size, totalHP: size * eff.hp,
      });
    });
  });
  return groups;
}

function armyAlive(army) { return army.some(g => g.count > 0); }

const logEl = () => document.getElementById('battleLog');
function addLog(msg, cls = '') {
  const d = document.createElement('div');
  d.className = \`le \${cls}\`; d.textContent = msg;
  logEl().appendChild(d);
  logEl().scrollTop = logEl().scrollHeight;
}
function clearLog() {
  logEl().innerHTML = '<div class="empty-log">Log limpiado.</div>';
  document.getElementById('logStats').textContent = '';
}

// ============================================================
// executeTurn v1.37 — referencias directas, muralla tactica
// Atacantes: golpean muralla mientras aguante (consume el ataque);
//            si cae a mitad de turno, ataques siguientes van a tropas.
// Defensores: siempre atacan tropas enemigas desde el turno 1.
// ============================================================
function executeTurn(atk, def, wallObj) {
  // Referencias DIRECTAS al objeto original — sin { ...g } para que count sea compartido
  const all = [];
  atk.forEach(g => { if (g.count > 0) all.push({ group: g, isAtk: true  }); });
  def.forEach(g => { if (g.count > 0) all.push({ group: g, isAtk: false }); });

  all.sort((a, b) => {
    if (b.group.stats.dexterity !== a.group.stats.dexterity) return b.group.stats.dexterity - a.group.stats.dexterity;
    if (a.group.count !== b.group.count) return a.group.count - b.group.count;
    return Math.random() - 0.5;
  });

  all.forEach(item => {
    const group = item.group;
    // Referencia directa: si count===0 fue eliminado este mismo turno → no actua
    if (group.count <= 0) return;

    const enemies = item.isAtk ? def : atk;

    for (let i = 0; i < (group.stats.attacksPerTurn || 1); i++) {
      if (group.count <= 0) break;

      // ATACANTE con muralla en pie: la golpea (consume este ataque)
      if (item.isAtk && wallObj && wallObj.hp > 0) {
        const dmg = group.count * (group.stats.damage || 0);
        wallObj.hp = Math.max(0, wallObj.hp - dmg);
        addLog(
          \`⚔️\${group.icon}\${group.count}×\${group.name} golpea la muralla: \${dmg} daño → \${wallObj.hp} HP\`,
          'la'
        );
        if (wallObj.hp <= 0) addLog('💥 ¡Muralla destruida! Atacantes más lentos avanzarán sobre las tropas.', 'lv');
        continue; // si cayo, el siguiente ataque (i++) ya va a tropas
      }

      // DEFENSOR o ATACANTE con muralla caida: atacar tropas
      const aliveEnemies = enemies.filter(e => e.count > 0);
      if (aliveEnemies.length === 0) break;

      const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      // attackChance + floor(random*20) + 1 vs defense
      const roll = group.stats.attackChance + Math.floor(Math.random() * 20) + 1;
      const gIcon = item.isAtk ? '⚔️' : '🛡️';
      const tIcon = item.isAtk ? '🛡️' : '⚔️';

      if (roll > target.stats.defense) {
        const dmg = group.count * group.stats.damage;
        target.totalHP -= dmg;
        const newCount = Math.max(0, Math.floor(target.totalHP / target.stats.hp + 0.0001));
        const killed = target.count - newCount;
        target.count = newCount;

        addLog(
          \`\${gIcon}\${group.icon}\${group.count}×\${group.name} → \${tIcon}\${target.icon}\${target.name}: tirada \${Math.floor(roll)} vs DEF \${Math.floor(target.stats.defense)} → \${dmg} dmg → \${killed} bajas\`,
          item.isAtk ? 'la' : 'ld'
        );

        if (target.count <= 0) {
          const idx = enemies.indexOf(target);
          if (idx !== -1) enemies.splice(idx, 1);
          addLog(\`💀 \${tIcon}\${target.icon}\${target.name} (Grp \${target.gid}) eliminado\`, 'lx');
        }
      } else {
        addLog(
          \`\${gIcon}\${group.icon}\${group.count}×\${group.name} falla vs \${tIcon}\${target.icon}\${target.name}: \${Math.floor(roll)} vs DEF \${Math.floor(target.stats.defense)}\`,
          'lm'
        );
      }
    }
  });
}

function runSimulation() {
  logEl().innerHTML = '';

  const wallLvl = parseInt(document.getElementById('wallLevel').value) || 0;
  const wallObj = { hp: wallLvl > 0 ? wallLvl * 500 : 0 };

  const atkConts = contingents.filter(c => c.side === 'atk');
  const defConts = contingents.filter(c => c.side === 'def');

  if (!atkConts.length) { addLog('⚠️ Añade al menos un contingente atacante.', 'lm'); return; }
  if (!defConts.length) { addLog('⚠️ Añade al menos un contingente defensor.', 'lm'); return; }

  contingents.forEach(c => { const el = document.getElementById('name_' + c.id); if (el) c.name = el.value || c.name; });

  let atk = [], def = [];
  atkConts.forEach(c => { atk = atk.concat(buildGroups(getContingentComp(c.id), 'atk', c.id)); });
  defConts.forEach(c => { def = def.concat(buildGroups(getContingentComp(c.id), 'def', c.id)); });

  if (!atk.length) { addLog('⚠️ Los atacantes no tienen tropas.', 'lm'); return; }
  if (!def.length) { addLog('⚠️ Los defensores no tienen tropas.', 'lm'); return; }

  const atkSnap = atk.map(g => ({ name:g.name, icon:g.icon, count:g.count, contingentId:g.contingentId }));
  const defSnap = def.map(g => ({ name:g.name, icon:g.icon, count:g.count, contingentId:g.contingentId }));

  if (wallObj.hp > 0) {
    addLog(\`🏰 MURALLA NIVEL \${wallLvl}: \${wallObj.hp.toLocaleString()} HP — Defensores contraatacan desde el turno 1\`, 'li');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'ls');
  }

  atkConts.forEach(c => {
    const comp = getContingentComp(c.id);
    const total = comp.reduce((s,x)=>s+x.qty,0);
    if (!total) return;
    addLog(\`⚔️ \${c.name}: \${total} unidades\`, 'li');
    const byName = {}; comp.forEach(x => { byName[x.data.name] = (byName[x.data.name]||0) + x.qty; });
    Object.entries(byName).forEach(([n,q]) => addLog(\`   · \${q}× \${n}\`, 'li'));
  });
  defConts.forEach(c => {
    const comp = getContingentComp(c.id);
    const total = comp.reduce((s,x)=>s+x.qty,0);
    if (!total) return;
    addLog(\`🛡️ \${c.name}: \${total} unidades\`, 'li');
    const byName = {}; comp.forEach(x => { byName[x.data.name] = (byName[x.data.name]||0) + x.qty; });
    Object.entries(byName).forEach(([n,q]) => addLog(\`   · \${q}× \${n}\`, 'li'));
  });
  addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'ls');

  let turn = 1;

  while (armyAlive(atk) && armyAlive(def)) {
    addLog(\`🎯 TURNO \${turn}\`, 'lt');
    executeTurn(atk, def, wallObj);
    turn++;
    if (turn > 300) { addLog('⚠️ Batalla detenida — límite de turnos alcanzado.', 'lm'); break; }
  }

  const wallResisted = wallObj.hp > 0;
  addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'ls');

  const atkSurv = atk.reduce((s,g) => s + g.count, 0);
  const defSurv = def.reduce((s,g) => s + g.count, 0);

  let winSide;
  if (wallResisted) {
    winSide = 'def';
    addLog(\`🛡️ VICTORIA DEL DEFENSOR — La muralla resistió. \${defSurv} tropas intactas (\${turn-1} turnos)\`, 'lv');
  } else if (atkSurv > 0 && defSurv === 0) {
    winSide = 'atk';
    addLog(\`🎉 VICTORIA DEL ATACANTE — \${atkSurv} supervivientes (\${turn-1} turnos)\`, 'lv');
  } else if (defSurv > 0 && atkSurv === 0) {
    winSide = 'def';
    addLog(\`🛡️ VICTORIA DEL DEFENSOR — \${defSurv} supervivientes (\${turn-1} turnos)\`, 'lv');
  } else {
    winSide = 'draw';
    addLog(\`⚔️ EMPATE — Ambos ejércitos eliminados (\${turn-1} turnos)\`, 'lv');
  }

  showResult(atk, def, atkSnap, defSnap, winSide, wallLvl, wallResisted, atkConts, defConts);
  document.getElementById('logStats').textContent = \`\${turn-1} turnos\`;
}

function showResult(atk, def, atkSnap, defSnap, winSide, wallLvl, wallResisted, atkConts, defConts) {
  function mergeByCont(groups) {
    const m = {};
    groups.forEach(g => {
      if (!m[g.contingentId]) m[g.contingentId] = {};
      m[g.contingentId][g.name] = (m[g.contingentId][g.name] || 0) + g.count;
    });
    return m;
  }
  function mergeSnapByCont(snap) {
    const m = {};
    snap.forEach(g => {
      if (!m[g.contingentId]) m[g.contingentId] = {};
      if (!m[g.contingentId][g.name]) m[g.contingentId][g.name] = { icon: g.icon, count: 0 };
      m[g.contingentId][g.name].count += g.count;
    });
    return m;
  }

  const atkSurv = mergeByCont(atk);
  const defSurv = mergeByCont(def);
  const atkSt   = mergeSnapByCont(atkSnap);
  const defSt   = mergeSnapByCont(defSnap);

  const recRates = {};
  [...atkConts, ...defConts].forEach(c => { recRates[c.id] = 0.10 + Math.random() * 0.20; });

  const buildRows = (cid, st, surv, wallResisted, side) => {
    const names = Object.keys(st[cid] || {}).filter(n => st[cid][n].count > 0);
    if (!names.length) return '<tr><td colspan="5" style="color:var(--dim);text-align:center;padding:6px;">Sin tropas</td></tr>';
    const recRate = (side === 'atk' && wallResisted) ? 0 : recRates[cid];
    return names.map(name => {
      const ini  = st[cid][name].count;
      const fin  = (surv[cid] && surv[cid][name]) || 0;
      const dead = ini - fin;
      const rec  = Math.floor(dead * recRate);
      const tot  = fin + rec;
      return \`<tr>
        <td>\${st[cid][name].icon} \${name}</td><td class="rc-ini">\${ini.toLocaleString()}</td>
        <td class="rc-fin">\${fin.toLocaleString()}</td><td class="rc-rec">+\${rec.toLocaleString()}</td>
        <td class="rc-tot">\${tot.toLocaleString()}</td>
      </tr>\`;
    }).join('');
  };

  const calcTotals = (cid, st, surv, wallResisted, side) => {
    let ini=0, fin=0, rec=0;
    const recRate = (side === 'atk' && wallResisted) ? 0 : recRates[cid];
    Object.keys(st[cid] || {}).forEach(n => {
      const i = st[cid][n].count, f = (surv[cid] && surv[cid][n]) || 0, d = i - f;
      ini += i; fin += f; rec += Math.floor(d * recRate);
    });
    return { ini, fin, rec, total: fin + rec };
  };

  const thead = \`<thead><tr><th>Tropa</th><th class="rc-ini">Inicio</th><th class="rc-fin">Final</th><th class="rc-rec">Recup.</th><th class="rc-tot">Total</th></tr></thead>\`;

  const bannerCls = winSide === 'draw' ? 'draw' : winSide;
  const bannerTxt = winSide === 'atk'
    ? '⚔️ VICTORIA DEL BANDO ATACANTE'
    : winSide === 'def'
    ? (wallResisted ? '🏰 VICTORIA DEL DEFENSOR — MURALLA INTACTA' : '🛡️ VICTORIA DEL BANDO DEFENSOR')
    : '⚔️ EMPATE — Ambos ejércitos eliminados';

  const wallTag = wallLvl > 0
    ? \`<span class="wall-tag \${wallResisted ? 'resisted' : ''}">🏰 Muralla nv.\${wallLvl} — \${wallResisted ? 'resistió' : 'destruida'}</span>\`
    : '';

  const atkCards = atkConts.map(c => {
    const comp = getContingentComp(c.id); if (!comp.length) return '';
    const t = calcTotals(c.id, atkSt, atkSurv, wallResisted, 'atk');
    const recRate = wallResisted ? 0 : recRates[c.id];
    return \`<div class="res-contingent"><div class="res-title atk">⚔️ \${c.name} <span style="font-size:.65rem;color:var(--dim);">recupera \${Math.round(recRate*100)}%</span></div>
      <table class="res-troop-table">\${thead}<tbody>\${buildRows(c.id, atkSt, atkSurv, wallResisted, 'atk')}</tbody></table>
      <div class="res-totals">ini <span>\${t.ini.toLocaleString()}</span> · fin <span>\${t.fin.toLocaleString()}</span> · rec <span>+\${t.rec.toLocaleString()}</span> · total <span>\${t.total.toLocaleString()}</span></div></div>\`;
  }).join('');

  const defCards = defConts.map(c => {
    const comp = getContingentComp(c.id); if (!comp.length) return '';
    const t = calcTotals(c.id, defSt, defSurv, false, 'def');
    return \`<div class="res-contingent"><div class="res-title def">🛡️ \${c.name} <span style="font-size:.65rem;color:var(--dim);">recupera \${Math.round(recRates[c.id]*100)}%</span></div>
      <table class="res-troop-table">\${thead}<tbody>\${buildRows(c.id, defSt, defSurv, false, 'def')}</tbody></table>
      <div class="res-totals">ini <span>\${t.ini.toLocaleString()}</span> · fin <span>\${t.fin.toLocaleString()}</span> · rec <span>+\${t.rec.toLocaleString()}</span> · total <span>\${t.total.toLocaleString()}</span></div></div>\`;
  }).join('');

  const card = document.createElement('div');
  card.className = 'res-card';
  card.innerHTML = \`<div class="res-winner-banner \${bannerCls}">\${bannerTxt} \${wallTag}</div>
    <div style="padding:8px 13px;font-size:.62rem;color:var(--dim);border-bottom:1px solid var(--border);letter-spacing:.08em;">⚔ ATACANTES</div>
    <div class="res-contingents">\${atkCards || '<div style="padding:12px;color:var(--dim);">—</div>'}</div>
    <div style="padding:8px 13px;font-size:.62rem;color:var(--dim);border-top:1px solid var(--border);border-bottom:1px solid var(--border);letter-spacing:.08em;">🛡 DEFENSORES</div>
    <div class="res-contingents">\${defCards || '<div style="padding:12px;color:var(--dim);">—</div>'}</div>\`;
  logEl().appendChild(card);
  logEl().scrollTop = logEl().scrollHeight;
}

addContingent('atk'); addContingent('def'); updateWallInfo();
  `;

  var dataJS = 'const TROOPS = ' + troopsJson + ';\nconst CREATURES = ' + creaturesJson + ';\n';
  var fullHTML = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap" rel="stylesheet">' +
    '<style>' + simCSS + '</style><style>body{margin:0;}.workspace{max-width:100%;padding:10px;}.col-log{width:400px;}</style></head><body>' +
    '<div class="workspace"><div class="col-armies"><div class="wall-panel"><label>🏰 Nivel de Muralla (Defensor):</label>' +
    '<input class="wall-input" type="number" id="wallLevel" value="0" min="0" max="20" oninput="updateWallInfo()">' +
    '<div class="wall-info" id="wallInfo">Sin muralla</div></div><div id="contingentsArea"></div><div class="add-row">' +
    '<button class="btn-add atk" onclick="addContingent(\'atk\')">⚔ + Añadir Atacante</button>' +
    '<button class="btn-add def" onclick="addContingent(\'def\')">🛡 + Añadir Defensor</button></div><div class="btn-row">' +
    '<button class="btn-sim" onclick="runSimulation()">⚔️ INICIAR BATALLA</button><button class="btn-clr" onclick="clearLog()">Limpiar</button>' +
    '</div></div><div class="col-log"><div class="log-panel"><div class="log-head"><span>📜 Registro</span><span id="logStats" style="font-size:.72rem;color:var(--dim);"></span></div>' +
    '<div class="log-body" id="battleLog"><div class="empty-log">Configura y pulsa Iniciar</div></div></div></div></div>' +
    '<script>' + dataJS + simJS_template + '<\/script></body></html>';

  box.innerHTML = '<iframe id="simFrame" style="width:100%;height:820px;border:none;background:var(--bg);" frameborder="0"></iframe>';
  var iframe = document.getElementById('simFrame');
  setTimeout(function() {
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(fullHTML); doc.close();
  }, 30);
}
