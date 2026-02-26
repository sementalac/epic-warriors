// ============================================================
// EPIC WARRIORS — game-constants.js
// Datos estáticos: TROOP_TYPES, CREATURE_TYPES, BUILDINGS
// Cálculos puros: phasedVal, almacenCapForLevel, barracas helpers
// ============================================================

function getTorreRange(blds) {
  var lvl = (blds && blds.torre && blds.torre.level) || 0;
  return lvl * 10; // v1.21: nivel 1=10, +10 por nivel
}

// TROOP_TYPES — stats alineados con battle-simulator-v0_1
// type: 'normal' → ocupa barracas + consume provisiones al enviarse
// type: 'creature' → no ocupa barracas, no consume provisiones
const TROOP_TYPES = {
  aldeano: {
    name: 'Aldeano', icon: '👤', type: 'normal',
    attackChance: 8, hp: 10, attacksPerTurn: 1, damage: 2,
    defense: 10, armor: 0, weapon: 0, dexterity: 5,
    speed: 1, capacity: 10,
    cost: { madera: 0, hierro: 0, prov: 1 },
    time: 60, barracasSlots: 1,
    desc: 'Tropa básica. Ocupa 1 plaza en barracas y consume 1 provisión al enviarse.'
  },
  soldado: {
    name: 'Guerrero', icon: '⚔️', type: 'normal',
    attackChance: 12, hp: 25, attacksPerTurn: 1, damage: 8,
    defense: 14, armor: 0, weapon: 0, dexterity: 8,
    speed: 2, capacity: 20,
    cost: { madera: 0, hierro: 10, prov: 2 },
    time: 180, barracasSlots: 1,
    desc: 'Soldado de infantería. Más HP y daño que el aldeano. Requiere hierro.'
  },
  mago: {
    name: 'Mago', icon: '🧙', type: 'normal',
    attackChance: 15, hp: 15, attacksPerTurn: 2, damage: 12,
    defense: 10, armor: 0, weapon: 0, dexterity: 12,
    speed: 1, capacity: 5,
    cost: { madera: 0, hierro: 0, prov: 3, esencia: 20 },
    time: 300, barracasSlots: 1,
    desc: 'Ataca 2 veces por turno con magia. Daño alto, defensa baja.'
  },
  druida: {
    name: 'Druida', icon: '🌿', type: 'normal',
    attackChance: 14, hp: 20, attacksPerTurn: 1, damage: 6,
    defense: 12, armor: 0, weapon: 0, dexterity: 10,
    speed: 1, capacity: 15,
    cost: { madera: 5, hierro: 0, prov: 2, esencia: 10 },
    time: 240, barracasSlots: 1,
    desc: 'Equilibrado entre ataque y defensa. Gran capacidad de carga.'
  },
  explorador: {
    name: 'Explorador', icon: '🏹', type: 'normal',
    attackChance: 16, hp: 12, attacksPerTurn: 2, damage: 5,
    defense: 11, armor: 0, weapon: 0, dexterity: 15,
    speed: 4, capacity: 8,
    cost: { madera: 5, hierro: 5, prov: 1 },
    time: 120, barracasSlots: 1,
    desc: 'Muy rápido en el mapa. Ideal para saqueo y exploración.'
  },
  asesino: {
    name: 'Asesino', icon: '🎯', type: 'normal',
    attackChance: 18, hp: 8, attacksPerTurn: 1, damage: 14,
    defense: 9, armor: 0, weapon: 0, dexterity: 20,
    speed: 3, capacity: 5,
    cost: { madera: 10, hierro: 30, esencia: 15, prov: 3 },
    time: 400, barracasSlots: 1,
    desc: 'Especialista en eliminación. Daño y destreza extremos. Frágil.'
  },
  paladin: {
    name: 'Paladín', icon: '🛡️', type: 'normal',
    attackChance: 10, hp: 35, attacksPerTurn: 1, damage: 5,
    defense: 18, armor: 0, weapon: 0, dexterity: 6,
    speed: 1, capacity: 10,
    cost: { madera: 0, piedra: 20, hierro: 40, prov: 4 },
    time: 450, barracasSlots: 1,
    desc: 'Tanque pesado. Armadura y HP formidables. Lento pero resistente.'
  },
  chaman: {
    name: 'Chamán', icon: '🔮', type: 'normal',
    attackChance: 14, hp: 18, attacksPerTurn: 1, damage: 10,
    defense: 11, armor: 0, weapon: 0, dexterity: 11,
    speed: 1, capacity: 8,
    cost: { madera: 15, piedra: 10, esencia: 25, prov: 3 },
    time: 350, barracasSlots: 1,
    desc: 'Gala la fuerza de la naturaleza. Estadísticas mágicas equilibradas.'
  },
  invocador: {
    name: 'Invocador', icon: '🧙‍♂️', type: 'normal',
    attackChance: 6, hp: 7, attacksPerTurn: 1, damage: 1,
    defense: 7, armor: 0, weapon: 0, dexterity: 5,
    speed: 1, capacity: 8,
    cost: { madera: 5, hierro: 5, esencia: 10, prov: 1 },
    time: 120, barracasSlots: 1,
    desc: 'Tropa débil que permite invocar criaturas poderosas. Requisito para invocaciones.'
  }
};

const CREATURE_TYPES = {
  // ── TIER 1 — 1 invocador ─────────────────────────────────────
  orco: {
    name: 'Orco', icon: '👹', tier: 1,
    attackChance: 10, hp: 30, attacksPerTurn: 1, damage: 10,
    defense: 12, armor: 0, weapon: 0, dexterity: 6,
    speed: 2, capacity: 0,
    summonersNeeded: 1, cost: { esencia: 50 }, time: 300, // 5 min
    desc: 'Guerrero brutal de primera línea. Tier 1.'
  },
  hada: {
    name: 'Hada', icon: '🧚', tier: 1,
    attackChance: 14, hp: 20, attacksPerTurn: 2, damage: 8,
    defense: 10, armor: 0, weapon: 0, dexterity: 15,
    speed: 3, capacity: 0,
    summonersNeeded: 1, cost: { esencia: 50 }, time: 300,
    desc: 'Criatura veloz con doble ataque. Tier 1.'
  },
  // ── TIER 2 — 8 invocadores ───────────────────────────────────
  golem: {
    name: 'Gólem', icon: '🗿', tier: 2,
    attackChance: 8, hp: 80, attacksPerTurn: 1, damage: 18,
    defense: 18, armor: 0, weapon: 0, dexterity: 4,
    speed: 1, capacity: 0,
    summonersNeeded: 8, cost: { esencia: 150 }, time: 540, // 9 min
    desc: 'Tanque de piedra casi indestructible. Tier 2.'
  },
  espectro: {
    name: 'Espectro', icon: '👻', tier: 2,
    attackChance: 16, hp: 50, attacksPerTurn: 1, damage: 22,
    defense: 8, armor: 0, weapon: 0, dexterity: 18,
    speed: 2, capacity: 0,
    summonersNeeded: 8, cost: { esencia: 150 }, time: 540,
    desc: 'Asesino etéreo con alta precisión. Tier 2.'
  },
  // ── TIER 3 — 20 invocadores ──────────────────────────────────
  kobold: {
    name: 'Kobold', icon: '👺', tier: 3,
    attackChance: 15, hp: 40, attacksPerTurn: 1, damage: 12,
    defense: 10, armor: 0, weapon: 0, dexterity: 22,
    speed: 4, capacity: 0,
    summonersNeeded: 20, cost: { esencia: 250 }, time: 840, // 14 min
    desc: 'Criatura ágil y escurridiza. Alta destreza. Tier 3.'
  },
  silfide: {
    name: 'Sílfide', icon: '🌬️', tier: 3,
    attackChance: 16, hp: 30, attacksPerTurn: 2, damage: 9,
    defense: 8, armor: 0, weapon: 0, dexterity: 24,
    speed: 3, capacity: 0,
    summonersNeeded: 20, cost: { esencia: 250 }, time: 840,
    desc: 'Espíritu del aire con doble ataque y extrema agilidad. Tier 3.'
  },
  // ── TIER 4 — 45 invocadores ──────────────────────────────────
  troll: {
    name: 'Troll', icon: '🧌', tier: 4,
    attackChance: 9, hp: 140, attacksPerTurn: 1, damage: 22,
    defense: 24, armor: 0, weapon: 0, dexterity: 5,
    speed: 1, capacity: 0,
    summonersNeeded: 45, cost: { esencia: 350 }, time: 1500, // 25 min
    desc: 'Bestia montañesa de enorme resistencia. Tier 4.'
  },
  banshee: {
    name: 'Banshee', icon: '💀', tier: 4,
    attackChance: 19, hp: 75, attacksPerTurn: 1, damage: 32,
    defense: 10, armor: 0, weapon: 0, dexterity: 22,
    speed: 2, capacity: 0,
    summonersNeeded: 45, cost: { esencia: 350 }, time: 1500,
    desc: 'Espectro de alta precisión y daño devastador. Tier 4.'
  },
  // ── TIER 5 — 90 invocadores ──────────────────────────────────
  grifo: {
    name: 'Grifo', icon: '🦅', tier: 5,
    attackChance: 15, hp: 165, attacksPerTurn: 2, damage: 36,
    defense: 16, armor: 0, weapon: 0, dexterity: 18,
    speed: 4, capacity: 0,
    summonersNeeded: 90, cost: { esencia: 550 }, time: 3000, // 50 min
    desc: 'Bestia alada con doble ataque y gran velocidad. Tier 5.'
  },
  quimera: {
    name: 'Quimera', icon: '🔥', tier: 5,
    attackChance: 14, hp: 130, attacksPerTurn: 2, damage: 32,
    defense: 15, armor: 0, weapon: 0, dexterity: 14,
    speed: 2, capacity: 0,
    summonersNeeded: 90, cost: { esencia: 550 }, time: 3000,
    desc: 'Bestia tricéfala de fuego con doble ataque. Tier 5.'
  },
  // ── TIER 6 — 150 invocadores ─────────────────────────────────
  hidra: {
    name: 'Hidra', icon: '🐉', tier: 6,
    attackChance: 13, hp: 250, attacksPerTurn: 3, damage: 27,
    defense: 18, armor: 0, weapon: 0, dexterity: 11,
    speed: 2, capacity: 0,
    summonersNeeded: 150, cost: { esencia: 750 }, time: 4500, // 75 min
    desc: 'Monstruo de múltiples cabezas con triple ataque. Tier 6.'
  },
  ciclope: {
    name: 'Cíclope', icon: '👁️', tier: 6,
    attackChance: 10, hp: 210, attacksPerTurn: 1, damage: 55,
    defense: 20, armor: 0, weapon: 0, dexterity: 6,
    speed: 1, capacity: 0,
    summonersNeeded: 150, cost: { esencia: 750 }, time: 4500,
    desc: 'Gigante de un ojo con golpe devastador. Tier 6.'
  },
  // ── TIER 7 — 230 invocadores ─────────────────────────────────
  basilisco: {
    name: 'Basilisco', icon: '🐍', tier: 7,
    attackChance: 21, hp: 140, attacksPerTurn: 1, damage: 58,
    defense: 12, armor: 0, weapon: 0, dexterity: 20,
    speed: 2, capacity: 0,
    summonersNeeded: 230, cost: { esencia: 1000 }, time: 6600, // 110 min
    desc: 'Serpiente letal de mirada paralizante y veneno mortal. Tier 7.'
  },
  valquiria: {
    name: 'Valquiria', icon: '⚔️', tier: 7,
    attackChance: 17, hp: 200, attacksPerTurn: 2, damage: 42,
    defense: 22, armor: 0, weapon: 0, dexterity: 20,
    speed: 3, capacity: 0,
    summonersNeeded: 230, cost: { esencia: 1000 }, time: 6600,
    desc: 'Guerrera divina equilibrada en ataque y defensa. Tier 7.'
  },
  // ── TIER 8 — 320 invocadores ─────────────────────────────────
  minotauro: {
    name: 'Minotauro', icon: '🐂', tier: 8,
    attackChance: 12, hp: 320, attacksPerTurn: 1, damage: 50,
    defense: 26, armor: 0, weapon: 0, dexterity: 8,
    speed: 1, capacity: 0,
    summonersNeeded: 320, cost: { esencia: 1400 }, time: 9000, // 150 min
    desc: 'Bestia mitad hombre mitad toro, coloso imparable. Tier 8.'
  },
  salamandra: {
    name: 'Salamandra', icon: '🦎', tier: 8,
    attackChance: 15, hp: 220, attacksPerTurn: 2, damage: 65,
    defense: 15, armor: 0, weapon: 0, dexterity: 16,
    speed: 2, capacity: 0,
    summonersNeeded: 320, cost: { esencia: 1400 }, time: 9000,
    desc: 'Criatura ígnea con doble ataque abrasador. Tier 8.'
  },
  // ── TIER 9 — 410 invocadores ─────────────────────────────────
  manticora: {
    name: 'Manticora', icon: '🦁', tier: 9,
    attackChance: 17, hp: 270, attacksPerTurn: 3, damage: 48,
    defense: 18, armor: 0, weapon: 0, dexterity: 19,
    speed: 3, capacity: 0,
    summonersNeeded: 410, cost: { esencia: 1800 }, time: 12600, // 210 min
    desc: 'León alado con cola de escorpión y triple ataque. Tier 9.'
  },
  ondina: {
    name: 'Ondina', icon: '💧', tier: 9,
    attackChance: 20, hp: 190, attacksPerTurn: 1, damage: 55,
    defense: 17, armor: 0, weapon: 0, dexterity: 26,
    speed: 3, capacity: 0,
    summonersNeeded: 410, cost: { esencia: 1800 }, time: 12600,
    desc: 'Espíritu del agua de extrema agilidad y precisión. Tier 9.'
  },
  // ── TIER 10 — 500 invocadores ────────────────────────────────
  centauro: {
    name: 'Centauro', icon: '🏇', tier: 10,
    attackChance: 16, hp: 350, attacksPerTurn: 2, damage: 60,
    defense: 22, armor: 0, weapon: 0, dexterity: 22,
    speed: 4, capacity: 0,
    summonersNeeded: 500, cost: { esencia: 2500 }, time: 18000, // 300 min
    desc: 'Guerrero mitad hombre mitad caballo, rápido y poderoso. Tier 10.'
  },
  medusa: {
    name: 'Medusa', icon: '🌀', tier: 10,
    attackChance: 23, hp: 260, attacksPerTurn: 1, damage: 80,
    defense: 15, armor: 0, weapon: 0, dexterity: 22,
    speed: 2, capacity: 0,
    summonersNeeded: 500, cost: { esencia: 2500 }, time: 18000,
    desc: 'Gorgona de mirada letal y daño excepcional. Tier 10.'
  },
  // ── TIER 11 — 850 invocadores ────────────────────────────────
  wyvern: {
    name: 'Wyvern', icon: '🐲', tier: 11,
    attackChance: 17, hp: 380, attacksPerTurn: 2, damage: 75,
    defense: 21, armor: 0, weapon: 0, dexterity: 24,
    speed: 4, capacity: 0,
    summonersNeeded: 850, cost: { esencia: 3200 }, time: 25200, // 420 min
    desc: 'Dragón menor de dos alas, rápido y letal. Tier 11.'
  },
  nereida: {
    name: 'Nereida', icon: '🧜', tier: 11,
    attackChance: 21, hp: 290, attacksPerTurn: 1, damage: 70,
    defense: 18, armor: 0, weapon: 0, dexterity: 28,
    speed: 3, capacity: 0,
    summonersNeeded: 850, cost: { esencia: 3200 }, time: 25200,
    desc: 'Ninfa marina de destreza sin igual. Tier 11.'
  },
  // ── TIER 12 — 1.200 invocadores ──────────────────────────────
  gigante: {
    name: 'Gigante', icon: '🏔️', tier: 12,
    attackChance: 10, hp: 650, attacksPerTurn: 1, damage: 75,
    defense: 38, armor: 0, weapon: 0, dexterity: 4,
    speed: 1, capacity: 0,
    summonersNeeded: 1200, cost: { esencia: 4000 }, time: 36000, // 600 min
    desc: 'Colosal titan de roca y fuerza inmensurable. Tier 12.'
  },
  harpia: {
    name: 'Harpía', icon: '🦤', tier: 12,
    attackChance: 19, hp: 320, attacksPerTurn: 3, damage: 68,
    defense: 17, armor: 0, weapon: 0, dexterity: 26,
    speed: 4, capacity: 0,
    summonersNeeded: 1200, cost: { esencia: 4000 }, time: 36000,
    desc: 'Criatura alada con triple ataque devastador. Tier 12.'
  },
  // ── TIER 13 — 1.550 invocadores ──────────────────────────────
  fenix: {
    name: 'Fénix', icon: '🔥', tier: 13,
    attackChance: 18, hp: 460, attacksPerTurn: 2, damage: 62,
    defense: 16, armor: 0, weapon: 0, dexterity: 22,
    speed: 3, capacity: 0,
    summonersNeeded: 1550, cost: { esencia: 5500 }, time: 50400, // 840 min
    desc: 'Ave inmortal de fuego que renace de sus cenizas. Tier 13.'
  },
  cerbero: {
    name: 'Cerbero', icon: '🐕', tier: 13,
    attackChance: 16, hp: 500, attacksPerTurn: 3, damage: 65,
    defense: 24, armor: 0, weapon: 0, dexterity: 14,
    speed: 2, capacity: 0,
    summonersNeeded: 1550, cost: { esencia: 5500 }, time: 50400,
    desc: 'Can tricéfalo guardián del inframundo. Triple ataque. Tier 13.'
  },
  // ── TIER 14 — 1.850 invocadores ──────────────────────────────
  behemot: {
    name: 'Behemot', icon: '🦏', tier: 14,
    attackChance: 11, hp: 760, attacksPerTurn: 1, damage: 98,
    defense: 33, armor: 0, weapon: 0, dexterity: 7,
    speed: 1, capacity: 0,
    summonersNeeded: 1850, cost: { esencia: 7000 }, time: 72000, // 1200 min
    desc: 'Coloso indestructible de fuerza primordial. Tier 14.'
  },
  quetzal: {
    name: 'Quetzal', icon: '🦜', tier: 14,
    attackChance: 19, hp: 430, attacksPerTurn: 2, damage: 90,
    defense: 18, armor: 0, weapon: 0, dexterity: 24,
    speed: 4, capacity: 0,
    summonersNeeded: 1850, cost: { esencia: 7000 }, time: 72000,
    desc: 'Serpiente emplumada sagrada, veloz y poderosa. Tier 14.'
  },
  // ── TIER 15 — 2.150 invocadores ──────────────────────────────
  leviatan: {
    name: 'Leviatán', icon: '🌊', tier: 15,
    attackChance: 12, hp: 920, attacksPerTurn: 1, damage: 105,
    defense: 40, armor: 0, weapon: 0, dexterity: 6,
    speed: 1, capacity: 0,
    summonersNeeded: 2150, cost: { esencia: 8500 }, time: 86400, // 1440 min = 24h
    desc: 'Serpiente marina primordial de tamaño colosal. Tier 15.'
  },
  serafin: {
    name: 'Serafín', icon: '😇', tier: 15,
    attackChance: 20, hp: 610, attacksPerTurn: 2, damage: 112,
    defense: 28, armor: 0, weapon: 0, dexterity: 22,
    speed: 2, capacity: 0,
    summonersNeeded: 2150, cost: { esencia: 8500 }, time: 86400,
    desc: 'Ángel de seis alas equilibrado en toda su magnificencia. Tier 15.'
  },
  // ── TIER 16 — 2.450 invocadores ──────────────────────────────
  titan: {
    name: 'Titán', icon: '⛰️', tier: 16,
    attackChance: 11, hp: 1100, attacksPerTurn: 1, damage: 115,
    defense: 45, armor: 0, weapon: 0, dexterity: 5,
    speed: 1, capacity: 0,
    summonersNeeded: 2450, cost: { esencia: 10500 }, time: 108000, // 30h
    desc: 'Dios primordial de fuerza inconmensurable. Tier 16.'
  },
  lich: {
    name: 'Lich', icon: '💀', tier: 16,
    attackChance: 24, hp: 560, attacksPerTurn: 1, damage: 145,
    defense: 16, armor: 0, weapon: 0, dexterity: 24,
    speed: 2, capacity: 0,
    summonersNeeded: 2450, cost: { esencia: 10500 }, time: 108000,
    desc: 'Archimago no-muerto de precisión y daño extremos. Tier 16.'
  },
  // ── TIER 17 — 2.750 invocadores ──────────────────────────────
  pegaso: {
    name: 'Pegaso', icon: '🐎', tier: 17,
    attackChance: 18, hp: 660, attacksPerTurn: 2, damage: 102,
    defense: 22, armor: 0, weapon: 0, dexterity: 28,
    speed: 5, capacity: 0,
    summonersNeeded: 2750, cost: { esencia: 13000 }, time: 129600, // 36h
    desc: 'Caballo alado divino, el más veloz de los cielos. Tier 17.'
  },
  naga: {
    name: 'Naga', icon: '🐍', tier: 17,
    attackChance: 16, hp: 760, attacksPerTurn: 3, damage: 92,
    defense: 26, armor: 0, weapon: 0, dexterity: 18,
    speed: 2, capacity: 0,
    summonersNeeded: 2750, cost: { esencia: 13000 }, time: 129600,
    desc: 'Serpiente divina de triple ataque y enorme resistencia. Tier 17.'
  },
  // ── TIER 18 — 3.000 invocadores ──────────────────────────────
  yeti: {
    name: 'Yeti', icon: '❄️', tier: 18,
    attackChance: 10, hp: 1320, attacksPerTurn: 1, damage: 125,
    defense: 48, armor: 0, weapon: 0, dexterity: 5,
    speed: 1, capacity: 0,
    summonersNeeded: 3000, cost: { esencia: 16000 }, time: 151200, // 42h
    desc: 'Bestia de las nieves eternas, tanque glacial supremo. Tier 18.'
  },
  satiro: {
    name: 'Sátiro', icon: '🎭', tier: 18,
    attackChance: 20, hp: 720, attacksPerTurn: 2, damage: 132,
    defense: 20, armor: 0, weapon: 0, dexterity: 28,
    speed: 4, capacity: 0,
    summonersNeeded: 3000, cost: { esencia: 16000 }, time: 151200,
    desc: 'Ser salvaje de gran agilidad y doble ataque certero. Tier 18.'
  },
  // ── TIER 19 — 3.250 invocadores ──────────────────────────────
  simurgh: {
    name: 'Simurgh', icon: '🦅', tier: 19,
    attackChance: 18, hp: 860, attacksPerTurn: 3, damage: 118,
    defense: 24, armor: 0, weapon: 0, dexterity: 26,
    speed: 4, capacity: 0,
    summonersNeeded: 3250, cost: { esencia: 19000 }, time: 172800, // 48h
    desc: 'Ave divina persa de triple ataque y gran sabiduría. Tier 19.'
  },
  gorgona: {
    name: 'Gorgona', icon: '🌑', tier: 19,
    attackChance: 25, hp: 720, attacksPerTurn: 1, damage: 168,
    defense: 18, armor: 0, weapon: 0, dexterity: 24,
    speed: 2, capacity: 0,
    summonersNeeded: 3250, cost: { esencia: 19000 }, time: 172800,
    desc: 'Hermana mayor de Medusa, precisión y daño legendarios. Tier 19.'
  },
  // ── TIER 20 — 3.500 invocadores ──────────────────────────────
  kraken: {
    name: 'Kraken', icon: '🦑', tier: 20,
    attackChance: 14, hp: 1240, attacksPerTurn: 4, damage: 135,
    defense: 35, armor: 0, weapon: 0, dexterity: 12,
    speed: 1, capacity: 0,
    summonersNeeded: 3500, cost: { esencia: 23000 }, time: 201600, // 56h
    desc: 'Bestia marina colosal con cuádruple ataque demoledor. Tier 20.'
  },
  angelcaido: {
    name: 'Ángel Caído', icon: '😈', tier: 20,
    attackChance: 22, hp: 920, attacksPerTurn: 2, damage: 188,
    defense: 22, armor: 0, weapon: 0, dexterity: 22,
    speed: 3, capacity: 0,
    summonersNeeded: 3500, cost: { esencia: 23000 }, time: 201600,
    desc: 'Ángel corrompido de poder oscuro equilibrado. Tier 20.'
  },
  // ── TIER 21 — 3.750 invocadores ──────────────────────────────
  ammit: {
    name: 'Ammit', icon: '⚖️', tier: 21,
    attackChance: 13, hp: 1520, attacksPerTurn: 1, damage: 158,
    defense: 42, armor: 0, weapon: 0, dexterity: 8,
    speed: 1, capacity: 0,
    summonersNeeded: 3750, cost: { esencia: 28000 }, time: 230400, // 64h
    desc: 'Devorador de almas egipcio, tanque del inframundo. Tier 21.'
  },
  roc: {
    name: 'Roc', icon: '🦅', tier: 21,
    attackChance: 19, hp: 970, attacksPerTurn: 2, damage: 148,
    defense: 24, armor: 0, weapon: 0, dexterity: 26,
    speed: 5, capacity: 0,
    summonersNeeded: 3750, cost: { esencia: 28000 }, time: 230400,
    desc: 'Ave colosal de los mares, la más veloz del mundo. Tier 21.'
  },
  // ── TIER 22 — 3.950 invocadores ──────────────────────────────
  dragon: {
    name: 'Dragón', icon: '🐲', tier: 22,
    attackChance: 20, hp: 1420, attacksPerTurn: 3, damage: 128,
    defense: 26, armor: 0, weapon: 0, dexterity: 16,
    speed: 3, capacity: 0,
    summonersNeeded: 3950, cost: { esencia: 35000 }, time: 259200, // 72h
    desc: 'Dragón antiguo de poder legendario. Tier 22.'
  },
  arconte: {
    name: 'Arconte', icon: '👼', tier: 22,
    attackChance: 22, hp: 1200, attacksPerTurn: 2, damage: 108,
    defense: 38, armor: 0, weapon: 0, dexterity: 20,
    speed: 2, capacity: 0,
    summonersNeeded: 3950, cost: { esencia: 35000 }, time: 259200,
    desc: 'Ser celestial supremo de poder equilibrado. Tier 22.'
  },
  // ── TIER 23 — 4.150 invocadores ──────────────────────────────
  coloso: {
    name: 'Coloso', icon: '⚙️', tier: 23,
    attackChance: 11, hp: 2050, attacksPerTurn: 1, damage: 175,
    defense: 55, armor: 0, weapon: 0, dexterity: 4,
    speed: 1, capacity: 0,
    summonersNeeded: 4150, cost: { esencia: 42000 }, time: 288000, // 80h
    desc: 'Gigante de metal y piedra, el mayor tanque conocido. Tier 23.'
  },
  sleipnir: {
    name: 'Sleipnir', icon: '🐴', tier: 23,
    attackChance: 21, hp: 1130, attacksPerTurn: 2, damage: 188,
    defense: 22, armor: 0, weapon: 0, dexterity: 30,
    speed: 5, capacity: 0,
    summonersNeeded: 4150, cost: { esencia: 42000 }, time: 288000,
    desc: 'Corcel de ocho patas de Odín, velocidad sobrenatural. Tier 23.'
  },
  // ── TIER 24 — 4.350 invocadores ──────────────────────────────
  abismo: {
    name: 'Abismo', icon: '🌑', tier: 24,
    attackChance: 12, hp: 2450, attacksPerTurn: 2, damage: 185,
    defense: 52, armor: 0, weapon: 0, dexterity: 5,
    speed: 1, capacity: 0,
    summonersNeeded: 4350, cost: { esencia: 50000 }, time: 316800, // 88h
    desc: 'Entidad del vacío eterno de resistencia absoluta. Tier 24.'
  },
  nemea: {
    name: 'Nemea', icon: '🦁', tier: 24,
    attackChance: 22, hp: 1340, attacksPerTurn: 2, damage: 235,
    defense: 24, armor: 0, weapon: 0, dexterity: 22,
    speed: 3, capacity: 0,
    summonersNeeded: 4350, cost: { esencia: 50000 }, time: 316800,
    desc: 'León de Nemea de piel invulnerable y zarpa mortal. Tier 24.'
  },
  // ── TIER 25 — 4.500 invocadores ──────────────────────────────
  tifon: {
    name: 'Tifón', icon: '🌪️', tier: 25,
    attackChance: 18, hp: 1850, attacksPerTurn: 4, damage: 215,
    defense: 32, armor: 0, weapon: 0, dexterity: 16,
    speed: 2, capacity: 0,
    summonersNeeded: 4500, cost: { esencia: 60000 }, time: 345600, // 96h
    desc: 'Padre de todos los monstruos, cuádruple ataque titánico. Tier 25.'
  },
  equidna: {
    name: 'Equidna', icon: '🐍', tier: 25,
    attackChance: 20, hp: 1650, attacksPerTurn: 2, damage: 225,
    defense: 36, armor: 0, weapon: 0, dexterity: 20,
    speed: 2, capacity: 0,
    summonersNeeded: 4500, cost: { esencia: 60000 }, time: 345600,
    desc: 'Madre de todos los monstruos, equilibrio supremo. Tier 25.'
  },
  // ── TIER 26 — 4.650 invocadores ──────────────────────────────
  tarasca: {
    name: 'Tarasca', icon: '🐊', tier: 26,
    attackChance: 12, hp: 2850, attacksPerTurn: 1, damage: 228,
    defense: 60, armor: 0, weapon: 0, dexterity: 4,
    speed: 1, capacity: 0,
    summonersNeeded: 4650, cost: { esencia: 72000 }, time: 374400, // 104h
    desc: 'Bestia medieval de coraza impenetrable. Tanque absoluto. Tier 26.'
  },
  garuda: {
    name: 'Garuda', icon: '🦅', tier: 26,
    attackChance: 21, hp: 1750, attacksPerTurn: 2, damage: 285,
    defense: 26, armor: 0, weapon: 0, dexterity: 26,
    speed: 5, capacity: 0,
    summonersNeeded: 4650, cost: { esencia: 72000 }, time: 374400,
    desc: 'Ave divina hinduista, señora de los cielos y la velocidad. Tier 26.'
  },
  // ── TIER 27 — 4.800 invocadores ──────────────────────────────
  jormungandr: {
    name: 'Jörmungandr', icon: '🐍', tier: 27,
    attackChance: 15, hp: 3050, attacksPerTurn: 3, damage: 248,
    defense: 44, armor: 0, weapon: 0, dexterity: 10,
    speed: 1, capacity: 0,
    summonersNeeded: 4800, cost: { esencia: 88000 }, time: 403200, // 112h
    desc: 'Serpiente del mundo nórdica que rodea los mares. Tier 27.'
  },
  valquiriaoscura: {
    name: 'Valquiria Oscura', icon: '🖤', tier: 27,
    attackChance: 25, hp: 1850, attacksPerTurn: 2, damage: 325,
    defense: 28, armor: 0, weapon: 0, dexterity: 24,
    speed: 3, capacity: 0,
    summonersNeeded: 4800, cost: { esencia: 88000 }, time: 403200,
    desc: 'Guerrera caída de precisión y daño legendarios. Tier 27.'
  },
  // ── TIER 28 — 4.900 invocadores ──────────────────────────────
  primordio: {
    name: 'Primordio', icon: '🪨', tier: 28,
    attackChance: 11, hp: 3550, attacksPerTurn: 1, damage: 268,
    defense: 65, armor: 0, weapon: 0, dexterity: 4,
    speed: 1, capacity: 0,
    summonersNeeded: 4900, cost: { esencia: 105000 }, time: 432000, // 120h
    desc: 'Entidad de la creación, resistencia más allá de lo comprensible. Tier 28.'
  },
  azrael: {
    name: 'Azrael', icon: '⚰️', tier: 28,
    attackChance: 26, hp: 2050, attacksPerTurn: 2, damage: 385,
    defense: 24, armor: 0, weapon: 0, dexterity: 26,
    speed: 3, capacity: 0,
    summonersNeeded: 4900, cost: { esencia: 105000 }, time: 432000,
    desc: 'Ángel de la muerte, precisión y daño absolutos. Tier 28.'
  },
  // ── TIER 29 — 4.950 invocadores ──────────────────────────────
  ignisrex: {
    name: 'Ignis Rex', icon: '🔴', tier: 29,
    attackChance: 20, hp: 2550, attacksPerTurn: 3, damage: 348,
    defense: 35, armor: 0, weapon: 0, dexterity: 18,
    speed: 2, capacity: 0,
    summonersNeeded: 4950, cost: { esencia: 125000 }, time: 460800, // 128h
    desc: 'Rey del fuego primordial, triple ataque devastador. Tier 29.'
  },
  fenrir: {
    name: 'Fenrir', icon: '🐺', tier: 29,
    attackChance: 22, hp: 2250, attacksPerTurn: 3, damage: 365,
    defense: 28, armor: 0, weapon: 0, dexterity: 28,
    speed: 4, capacity: 0,
    summonersNeeded: 4950, cost: { esencia: 125000 }, time: 460800,
    desc: 'Lobo apocalíptico nórdico que destrozará el mundo. Tier 29.'
  },
  // ── TIER 30 — 5.000 invocadores ──────────────────────────────
  moloch: {
    name: 'Moloch', icon: '🔱', tier: 30,
    attackChance: 18, hp: 4050, attacksPerTurn: 2, damage: 510,
    defense: 50, armor: 0, weapon: 0, dexterity: 12,
    speed: 2, capacity: 0,
    summonersNeeded: 5000, cost: { esencia: 155000 }, time: 518400, // 144h
    desc: 'Dios devorador del fuego eterno, destrucción encarnada. Tier 30.'
  },
  metatron: {
    name: 'Metatrón', icon: '✨', tier: 30,
    attackChance: 24, hp: 3100, attacksPerTurn: 3, damage: 462,
    defense: 44, armor: 0, weapon: 0, dexterity: 24,
    speed: 3, capacity: 0,
    summonersNeeded: 5000, cost: { esencia: 155000 }, time: 518400,
    desc: 'Arcángel supremo, equilibrio perfecto entre poder y divinidad. Tier 30.'
  }
};

// ============================================================
// SCALING LOGIC
// ============================================================
function getTroopStatsWithLevel(type, level) {
  const base = TROOP_TYPES[type];
  if (!base) return null;
  if (!level || level < 1) level = 1;

  // New balanced scaling: ~4% bonus per level for HP/Damage
  // Fixed small increment for Chance/Defense/Dexterity
  const growth = 1 + (level - 1) * 0.04;

  return {
    ...base,
    level: level,
    hp: Math.floor(base.hp * growth),
    damage: Math.floor(base.damage * growth),
    attackChance: base.attackChance + (level - 1) * 0.5,
    defense: base.defense + (level - 1) * 0.5,
    dexterity: base.dexterity + (level - 1) * 0.5,
    // Speed remains constant, capacity scales slowly
    speed: base.speed,
    capacity: base.capacity + (level - 1) * 1
  };
}

// ============================================================
// BUILDINGS — todos empiezan en nivel 1, producen desde nivel 1
// Coste nivel 0 → 1 es muy barato (casi gratis, es la "mejora inicial")
// ── Fórmula unificada tres fases ─────────────────────────────
// COSTES:  ×2/nivel  hasta nv.10  |  ×1.30/nivel nv.11-30  |  ×1.05/nivel nv.31+
// TIEMPOS: ×1.6/nivel hasta nv.10 |  ×1.20/nivel nv.11-30  |  ×1.05/nivel nv.31+
// ============================================================
function phasedVal(l, base, m1, e1, m2, e2, m3) {
  if (l <= e1) return base * Math.pow(m1, l);
  var v1 = base * Math.pow(m1, e1);
  if (l <= e2) return v1 * Math.pow(m2, l - e1);
  var v2 = v1 * Math.pow(m2, e2 - e1);
  return v2 * Math.pow(m3, l - e2);
}

const BUILDINGS = [
  // ── RECURSOS ─────────────────────────────────────────────
  {
    id: 'aserradero', name: 'Aserradero', icon: '🌲',
    desc: 'Produce madera por hora de forma pasiva. Los aldeanos asignados multiplican la producción. Nivel 1 activo desde el inicio. Coste nv.10: ~67k madera / 16k piedra. Coste nv.30: ~13M madera / 3M piedra.',
    prod: function (l) { return { madera: Math.floor(30 + 40 * l * Math.pow(1.1, l)) }; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0 };
      return {
        madera: Math.floor(phasedVal(l, 65, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 16, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(10, phasedVal(l, 15, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    id: 'cantera', name: 'Cantera', icon: '⛰️',
    desc: 'Produce piedra por hora de forma pasiva. Los aldeanos asignados multiplican la producción. Nivel 1 activo desde el inicio. Coste nv.10: ~51k madera / 35k piedra. Coste nv.30: ~10M madera / 7M piedra.',
    prod: function (l) { return { piedra: Math.floor(20 + 30 * l * Math.pow(1.1, l)) }; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0 };
      return {
        madera: Math.floor(phasedVal(l, 50, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 34, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(10, phasedVal(l, 15, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    id: 'minehierro', name: 'Mina de Hierro', icon: '⚒️',
    desc: 'Produce hierro por hora de forma pasiva. Los aldeanos asignados multiplican la producción. Nivel 1 activo desde el inicio. Coste nv.10: ~87k madera / 70k piedra / 26k hierro. Coste nv.30: ~17M madera / 14M piedra / 5M hierro.',
    prod: function (l) { return { hierro: Math.floor(10 + 20 * l * Math.pow(1.1, l)) }; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, hierro: 0 };
      return {
        madera: Math.floor(phasedVal(l, 85, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 68, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 25, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(10, phasedVal(l, 18, 1.6, 10, 1.2, 30, 1.05))); }
  },

  // ── GRANJA ───────────────────────────────────────────────
  {
    id: 'granja', name: 'Granja', icon: '🌾',
    desc: 'Aumenta las provisiones generadas por aldeano asignado. Nivel 1 = 6 prov./aldeano/h, +1 por nivel. Las provisiones se consumen al enviar tropas en misión y no se recuperan al volver. Coste nv.10: ~51k madera / 35k piedra. Coste nv.30: ~10M madera / 7M piedra.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0 };
      return {
        madera: Math.floor(phasedVal(l, 50, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 34, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(10, phasedVal(l, 15, 1.6, 10, 1.2, 30, 1.05))); }
  },

  // ── MÁGICO ───────────────────────────────────────────────
  {
    id: 'circulo', name: 'Círculo Místico', icon: '✨',
    desc: 'Canaliza la Esencia. La Esencia no ocupa almacén. Requiere madera, piedra y Esencia para subir. Coste nv.10: ~174k madera+piedra / 38k esencia. Coste nv.30: ~34M madera+piedra / 7M esencia.',
    prod: function (l) { return { esencia: Math.floor(5 + 15 * l * Math.pow(1.1, l)) }; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, esencia: 0 };
      return {
        madera: Math.floor(phasedVal(l, 170, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 170, 2, 10, 1.3, 30, 1.05)),
        esencia: Math.floor(phasedVal(l, 37, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(20, phasedVal(l, 30, 1.6, 10, 1.2, 30, 1.05))); }
  },

  // ── ALMACENAMIENTO ───────────────────────────────────────
  {
    id: 'almacen', name: 'Almacén', icon: '🏛️',
    desc: 'Aumenta la capacidad máxima de madera, piedra, hierro y provisiones. Nv.0 = 1.000 | Nv.10 ≈ 1M | Nv.30 ≈ 195M. Es el edificio más caro de subir — debes priorizar el Almacén antes que el resto. La Esencia tiene límite separado.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, hierro: 0 };
      return {
        madera: Math.floor(phasedVal(l, 500, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 500, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 250, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(15, phasedVal(l, 60, 1.6, 10, 1.2, 30, 1.05))); }
  },

  // ── MILITAR ──────────────────────────────────────────────
  {
    id: 'barracas', name: 'Barracas', icon: '🏰',
    desc: 'Capacidad máxima de tropas normales (no criaturas). Nivel 1 = 50 plazas, ×1.40 por nivel. Las tropas en misión no ocupan plaza. Coste nv.10: ~205k madera / 307k piedra / 102k hierro. Coste nv.30: ~40M madera / 61M piedra / 20M hierro.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, hierro: 0 };
      return {
        madera: Math.floor(phasedVal(l, 200, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 100, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(15, phasedVal(l, 40, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    id: 'reclutamiento', name: 'Reclutamiento', icon: '⚔️',
    desc: 'Genera aldeanos automáticamente. Nv.1 ≈ 9 min 54s por aldeano. Cada nivel reduce el intervalo un 1% (nv.50 = 5 min, mínimo 1 min desde nv.90). Los aldeanos se pierden si las Barracas están llenas. Coste nv.10: ~133k madera / 92k piedra / 46k hierro. Coste nv.30: ~26M madera / 18M piedra / 9M hierro.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, hierro: 0 };
      return {
        madera: Math.floor(phasedVal(l, 130, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 90, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 45, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(10, phasedVal(l, 25, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    id: 'muralla', name: 'Muralla', icon: '🏰',
    desc: 'Escudo de la aldea con HP propio. El atacante debe destruirla antes de dañar tus tropas. +500 HP por nivel. Solo requiere piedra y hierro. Coste nv.10: ~358k piedra / 143k hierro. Coste nv.30: ~70M piedra / 28M hierro.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { piedra: 0, hierro: 0 };
      return {
        piedra: Math.floor(phasedVal(l, 350, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 140, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(30, phasedVal(l, 50, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    id: 'lab', name: 'Laboratorio', icon: '📜',
    desc: 'Permite investigar nuevas tecnologías (próximamente activo). Uno de los edificios más caros: requiere madera, piedra y Esencia. Coste nv.10: ~287k madera / 430k piedra / 102k esencia. Coste nv.30: ~56M madera / 84M piedra / 20M esencia.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, esencia: 0 };
      return {
        madera: Math.floor(phasedVal(l, 280, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 420, 2, 10, 1.3, 30, 1.05)),
        esencia: Math.floor(phasedVal(l, 100, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(15, phasedVal(l, 45, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    id: 'cuarteles', name: 'Cuarteles', icon: '🎖️',
    desc: 'Reduce el tiempo de entrenamiento de tropas (excepto aldeanos y criaturas) un 1% por nivel, hasta un máximo del 50% en nv.50. Coste nv.10: ~225k madera / 307k piedra / 123k hierro. Coste nv.30: ~44M madera / 61M piedra / 24M hierro.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, hierro: 0 };
      return {
        madera: Math.floor(phasedVal(l, 220, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 120, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(20, phasedVal(l, 40, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    id: 'torre', name: 'Torre de Vigía', icon: '🗼',
    desc: 'Controla el alcance de tu aldea. Nivel 1 = 10 casillas de alcance, +10 por nivel (radio circular real). Sin Torre no puedes atacar, espiar ni fundar nuevas aldeas. Coste nv.10: ~72k madera / 143k piedra. Coste nv.30: ~14M madera / 28M piedra.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0 };
      return {
        madera: Math.floor(phasedVal(l, 70, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 140, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(20, phasedVal(l, 35, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    id: 'torreinvocacion', name: 'Torre de Invocación', icon: '🔮',
    desc: 'Desbloquea la invocación de criaturas poderosas. Reduce un 5% el tiempo de invocación por nivel. Necesitas Invocadores entrenados. Requiere madera, piedra y Esencia. Coste nv.10: ~205k madera / 307k piedra / 102k esencia. Coste nv.30: ~40M madera / 61M piedra / 20M esencia.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, esencia: 0 };
      return {
        madera: Math.floor(phasedVal(l, 200, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05)),
        esencia: Math.floor(phasedVal(l, 100, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(40, phasedVal(l, 55, 1.6, 10, 1.2, 30, 1.05))); }
  },

  // ── REFUGIO ──────────────────────────────────────────────
  {
    id: 'refugio', name: 'Refugio', icon: '🕵️',
    desc: 'Esconde tropas propias (no criaturas, no aliados). Las tropas dentro son invisibles a espionajes y no participan en defensa. Capacidad = 10% de la capacidad de Barracas al mismo nivel (nv.1=5, nv.5=19, nv.10=103, nv.20=2.988). Las tropas dentro siguen ocupando plazas de barracas. Coste nv.10: ~358k piedra / 143k hierro. Coste nv.30: ~70M piedra / 28M hierro.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { piedra: 0, hierro: 0 };
      return {
        piedra: Math.floor(phasedVal(l, 350, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 140, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(30, phasedVal(l, 50, 1.6, 10, 1.2, 30, 1.05))); }
  },

  // ── HERRERÍA ─────────────────────────────────────────────
  {
    id: 'herreria', name: 'Herrería', icon: '🔨',
    desc: 'Permite mejorar el arma y la armadura de cada tipo de tropa. Nivel de Herrería = nivel máximo de mejora de equipamiento (máx nv.15). Cada mejora cuesta hierro + madera/piedra (o esencia para tropas mágicas). Coste nv.5: ~8k hierro / 5k madera. Coste nv.10: ~256k hierro / 160k madera. Coste nv.15: ~930k hierro / 580k madera.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { hierro: 0, madera: 0, piedra: 0 };
      return {
        hierro: Math.floor(phasedVal(l, 250, 2, 10, 1.3, 15, 1.05)),
        madera: Math.floor(phasedVal(l, 160, 2, 10, 1.3, 15, 1.05)),
        piedra: Math.floor(phasedVal(l, 100, 2, 10, 1.3, 15, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(30, phasedVal(l, 50, 1.6, 10, 1.2, 15, 1.05))); }
  },
];

// Capacidad barracas — lee el edificio 'barracas'
// Nivel 1: 50 plazas. +20 por cada nivel adicional.
function getCuartelesReduction(blds) {
  // Each level of Cuarteles = 1% faster training (max 50%)
  var lvl = (blds && blds['cuarteles'] && blds['cuarteles'].level) || 0;
  return Math.min(0.5, lvl * 0.01);
}

function getBarracksCapacity(blds) {
  var lvl = (blds['barracas'] && blds['barracas'].level) || 0;
  if (lvl === 0) return 0;
  // v1.30: fórmula exponencial base 1.40
  // lvl1=50, lvl5=192, lvl10=1.033, lvl15=5.556, lvl20=29.882
  return Math.round(50 * Math.pow(1.40, lvl - 1));
}

// ============================================================
// BARRACAS — fuente de verdad para plazas ocupadas
// Regla: plazas = aldeanos + tropas_militares - tropas_en_mision
// Las tropas en misión (ataque, espionaje, movimiento) NO ocupan plaza.
// ============================================================
function getBarracksUsed(vs) {
  if (!vs) return 0;
  var troops = vs.troops || {};
  var missions = vs.mission_queue || [];

  // Contar tropas actualmente EN MISIÓN (tipo attack, spy, o move/return saliente)
  var inMission = {};
  missions.forEach(function (m) {
    if (!m.troops) return;
    // Las misiones 'return' ya vienen hacia casa — aún están fuera, no ocupan plaza
    Object.keys(m.troops).forEach(function (k) {
      inMission[k] = (inMission[k] || 0) + (m.troops[k] || 0);
    });
  });

  var used = 0;
  // troops.aldeano = TOTAL de aldeanos en base (libres + trabajando).
  // Los trabajadores (aldeanos_assigned) son un SUBCONJUNTO de troops.aldeano, NO se suman aparte.
  var aldInBase = Math.max(0, (troops.aldeano || 0) - (inMission.aldeano || 0));
  used += aldInBase;

  // Tropas militares que NO son aldeano
  Object.keys(TROOP_TYPES).forEach(function (k) {
    if (k === 'aldeano') return;
    var inBase = Math.max(0, (troops[k] || 0) - (inMission[k] || 0));
    used += inBase * (TROOP_TYPES[k].barracasSlots || 1);
  });

  // v1.17: Tropas EN ENTRENAMIENTO reservan su espacio desde que entran en cola.
  // Así funciona en Ogame/Ikariam — el slot está ocupado durante toda la transformación.
  // Sin esto: aldeano se resta de troops pero el slot que va a ocupar la tropa
  // final no se reserva, producción de aldeanos lo llena, y al llegar la tropa → overflow.
  var trainingQueue = vs.training_queue || [];
  trainingQueue.forEach(function (t) {
    if (t.type && TROOP_TYPES[t.type] && t.type !== 'aldeano') {
      used += (TROOP_TYPES[t.type].barracasSlots || 1);
    }
  });

  return used;
}

// ============================================================
// REFUGIO — capacidad y uso
// Capacidad = 10% de barracas (en slots), mínimo 0 si no construido
// ============================================================
// ============================================================
// REFUGIO — capacidad y uso
// Capacidad = 10% de la capacidad de barracas AL MISMO NIVEL que el refugio.
// Ej: refugio nv.10 → barracas nv.10 = 1.033 → capacidad refugio = 103
// ============================================================
function getRefugioCapacity(blds) {
  var lvl = (blds && blds['refugio'] && blds['refugio'].level) || 0;
  if (lvl === 0) return 0;
  // Capacidad de barracas al nivel del refugio (fórmula independiente del nivel actual de barracas)
  var barrAtLevel = Math.round(50 * Math.pow(1.40, lvl - 1));
  return Math.max(1, Math.floor(barrAtLevel * 0.10));
}

function getRefugioUsed(vs) {
  var refugio = vs.refugio || {};
  var used = 0;
  Object.keys(refugio).forEach(function (k) {
    var slots = (TROOP_TYPES[k] && TROOP_TYPES[k].barracasSlots) || 1;
    used += (refugio[k] || 0) * slots;
  });
  return used;
}


function getAldeanosProd(blds) {
  // LEGACY: devuelve 0 — la producción de aldeanos ahora es discreta (ver calcAldeanosTick)
  return 0;
}

// Minutos entre un aldeano y el siguiente según nivel del edificio reclutamiento.
// v1.30: Fórmula: 10 * (1 - 0.01 * lvl). Mínimo: 1 min (a partir del nivel 90).
// Ejemplos: lvl1≈9:54, lvl25=7:30, lvl50=5:00, lvl90=1:00
function getAldeanosIntervalMs(blds) {
  var lvl = (blds['reclutamiento'] && blds['reclutamiento'].level) || 0;
  if (lvl === 0) return Infinity; // sin edificio = sin producción
  var baseMin = 10;
  var mins = baseMin * (1 - 0.01 * lvl);
  mins = Math.max(1, mins); // mínimo 1 minuto
  return Math.round(mins * 60 * 1000); // en milisegundos
}

// Calcula cuántos aldeanos se han producido desde last_aldeano_at
// y actualiza el estado. Llamar antes de cualquier acción que use aldeanos.
// Regla: si barracas llenas → aldeanos producidos se pierden (producción no se pausa).
function calcAndApplyAldeanos(vs) {
  var barrCap = getBarracksCapacity(vs.buildings);
  if (!vs.troops) vs.troops = {};

  var intervalMs = getAldeanosIntervalMs(vs.buildings);
  if (intervalMs === Infinity) return;

  var now = Date.now();
  var lastAld = vs.last_aldeano_at ? new Date(vs.last_aldeano_at).getTime() : now;
  var elapsed = now - lastAld;

  var newAldeanos = Math.floor(elapsed / intervalMs);
  if (newAldeanos <= 0) return;

  // Siempre avanzar el timer — la producción no se pausa aunque se pierdan aldeanos
  var remainder = elapsed - (newAldeanos * intervalMs);
  vs.last_aldeano_at = new Date(now - remainder).toISOString();

  // Calcular espacio disponible usando la fuente de verdad
  var used = getBarracksUsed(vs);
  var free = Math.max(0, barrCap - used);

  if (free <= 0) return; // barracas llenas — aldeanos producidos se pierden en silencio

  // Solo añadir los que caben
  var toAdd = Math.min(newAldeanos, free);
  vs.troops.aldeano = (vs.troops.aldeano || 0) + toAdd;
}

// Provisiones por aldeano en granja: base 5 + nivel granja (nivel 1 = 6/h por aldeano)

// Capacidad del almacen: tres fases
// nv.0=1.000 | nv.10≈1.024.000 | nv.30≈195M | nv.50≈517M
function almacenCapForLevel(l) {
  if (l <= 10) return 1000 * Math.pow(2, l);
  var v10 = 1000 * Math.pow(2, 10); // 1.024.000
  if (l <= 30) return v10 * Math.pow(1.3, l - 10);
  var v30 = v10 * Math.pow(1.3, 20); // ~194.6M
  return v30 * Math.pow(1.05, l - 30);
}
function getCapacity(blds) {
  var lvl = (blds['almacen'] && blds['almacen'].level) || 0;
  return Math.floor(almacenCapForLevel(lvl));
}

// Recursos que cuentan para el almacen
function getStoredTotal(res) {
  return (res.madera || 0) + (res.piedra || 0) + (res.hierro || 0) + (res.provisiones || 0);
}

// ============================================================
// TROPAS
// ============================================================
