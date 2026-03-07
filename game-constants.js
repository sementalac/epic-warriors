// ============================================================
// EPIC WARRIORS — game-constants.js
// Datos estáticos: TROOP_TYPES, CREATURE_TYPES, BUILDINGS
// Cálculos puros: phasedVal, almacenCapForLevel, barracas helpers
// v1.44+: speed ahora en CASILLAS/HORA (antes era casillas/minuto)
//   Fórmula ETA: dist / speed * 3600 segundos
//   Ejemplos: speed 60 = 1 cas/min | speed 200 = 18s/casilla
//
// v1.83 — Fix capacidad almacén:
//   • almacenCapForLevel: capacity(L) = phasedVal(L+1, 500,...) × 1.20
//     El almacén de nivel L tiene la capacidad del nivel L+1 anterior,
//     garantizando que siempre puedes pagar la siguiente mejora.
//     Nv.1: 2.400 cap (coste nv.2 = 2.000) ✓  |  Nv.2: 4.800 (coste nv.3 = 4.000) ✓
//   • getBarracksCapacity: nueva curva 3 fases (100→5k→50k→5M en nv.50)
//   • Costes de edificios reequilibrados por jerarquía:
//       CARO   (85% almacén) base_max=425: muralla, lab, torreinvocacion
//       MEDIO  (70% almacén) base_max=350: barracas, cuarteles, refugio, herreria
//       BARATO (60% almacén) base_max=300: aserradero, cantera, minehierro,
//                                          granja, circulo, torre, reclutamiento
//     Solo el recurso MÁS CARO de cada edificio cae en ese %. Los demás
//     mantienen sus ratios originales relativos al recurso más caro.
//   IMPORTANTE: actualizar también get_building_cost RPC en Supabase.
// ============================================================

function getTorreRange(blds) {
  var lvl = (blds && blds.torre && blds.torre.level) || 0;
  return lvl * 10; // v1.21: nivel 1=10, +10 por nivel
}

// TROOP_TYPES — stats alineados con battle-simulator-v0_1
// type: 'normal' → ocupa barracas + consume provisiones al enviarse
// type: 'creature' → no ocupa barracas, no consume provisiones
// speed: casillas/hora (v1.44+)
const TROOP_TYPES = {
  aldeano: {
    name: 'Aldeano', icon: '👤', type: 'normal',
    attackChance: 8, hp: 10, attacksPerTurn: 1, damage: 2,
    defense: 10, armor: 0, weapon: 0, dexterity: 5,
    speed: 50, capacity: 10,
    cost: { madera: 0, hierro: 0, prov: 1 },
    time: 60, barracasSlots: 1,
    desc: 'Tropa básica. Ocupa 1 plaza en barracas y consume 1 provisión al enviarse.'
  },
  soldado: {
    name: 'Guerrero', icon: '⚔️', type: 'normal',
    attackChance: 12, hp: 25, attacksPerTurn: 1, damage: 8,
    defense: 14, armor: 0, weapon: 0, dexterity: 8,
    speed: 100, capacity: 20,
    cost: { madera: 0, hierro: 10, prov: 2 },
    time: 180, barracasSlots: 1,
    desc: 'Soldado de infantería. Más HP y daño que el aldeano. Requiere hierro.'
  },
  mago: {
    name: 'Mago', icon: '🧙', type: 'normal',
    attackChance: 15, hp: 15, attacksPerTurn: 2, damage: 12,
    defense: 10, armor: 0, weapon: 0, dexterity: 12,
    speed: 65, capacity: 5,
    cost: { madera: 0, hierro: 0, prov: 3, esencia: 20 },
    time: 300, barracasSlots: 1,
    desc: 'Ataca 2 veces por turno con magia. Daño alto, defensa baja.'
  },
  druida: {
    name: 'Druida', icon: '🌿', type: 'normal',
    attackChance: 14, hp: 20, attacksPerTurn: 1, damage: 6,
    defense: 12, armor: 0, weapon: 0, dexterity: 10,
    speed: 75, capacity: 15,
    cost: { madera: 5, hierro: 0, prov: 2, esencia: 10 },
    time: 240, barracasSlots: 1,
    desc: 'Equilibrado entre ataque y defensa. Gran capacidad de carga.'
  },
  explorador: {
    name: 'Explorador', icon: '🏹', type: 'normal',
    attackChance: 16, hp: 12, attacksPerTurn: 2, damage: 5,
    defense: 11, armor: 0, weapon: 0, dexterity: 15,
    speed: 200, capacity: 8,
    cost: { madera: 5, hierro: 5, prov: 1 },
    time: 120, barracasSlots: 1,
    desc: 'Muy rápido en el mapa. Ideal para saqueo y exploración.'
  },
  asesino: {
    name: 'Asesino', icon: '🎯', type: 'normal',
    attackChance: 18, hp: 8, attacksPerTurn: 1, damage: 14,
    defense: 9, armor: 0, weapon: 0, dexterity: 20,
    speed: 150, capacity: 5,
    cost: { madera: 10, hierro: 30, esencia: 15, prov: 3 },
    time: 400, barracasSlots: 1,
    desc: 'Especialista en eliminación. Daño y destreza extremos. Frágil.'
  },
  paladin: {
    name: 'Paladín', icon: '🛡️', type: 'normal',
    attackChance: 10, hp: 35, attacksPerTurn: 1, damage: 5,
    defense: 18, armor: 0, weapon: 0, dexterity: 6,
    speed: 55, capacity: 10,
    cost: { madera: 0, piedra: 20, hierro: 40, prov: 4 },
    time: 450, barracasSlots: 1,
    desc: 'Tanque pesado. Armadura y HP formidables. Lento pero resistente.'
  },
  chaman: {
    name: 'Chamán', icon: '🔮', type: 'normal',
    attackChance: 14, hp: 18, attacksPerTurn: 1, damage: 10,
    defense: 11, armor: 0, weapon: 0, dexterity: 11,
    speed: 70, capacity: 8,
    cost: { madera: 15, piedra: 10, esencia: 25, prov: 3 },
    time: 350, barracasSlots: 1,
    desc: 'Gala la fuerza de la naturaleza. Estadísticas mágicas equilibradas.'
  },
  invocador: {
    name: 'Invocador', icon: '🧙‍♂️', type: 'normal',
    attackChance: 6, hp: 7, attacksPerTurn: 1, damage: 1,
    defense: 7, armor: 0, weapon: 0, dexterity: 5,
    speed: 70, capacity: 8,
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
    speed: 90, capacity: 0,
    summonersNeeded: 1, cost: { esencia: 50 }, time: 300,
    desc: 'Guerrero brutal de primera línea. Tier 1.'
  },
  hada: {
    name: 'Hada', icon: '🧚', tier: 1,
    attackChance: 14, hp: 20, attacksPerTurn: 2, damage: 8,
    defense: 10, armor: 0, weapon: 0, dexterity: 15,
    speed: 130, capacity: 0,
    summonersNeeded: 1, cost: { esencia: 50 }, time: 300,
    desc: 'Criatura veloz con doble ataque. Tier 1.'
  },
  // ── TIER 2 — 8 invocadores ───────────────────────────────────
  golem: {
    name: 'Gólem', icon: '🗿', tier: 2,
    attackChance: 8, hp: 80, attacksPerTurn: 1, damage: 18,
    defense: 18, armor: 0, weapon: 0, dexterity: 4,
    speed: 55, capacity: 0,
    summonersNeeded: 8, cost: { esencia: 150 }, time: 540,
    desc: 'Tanque de piedra casi indestructible. Tier 2.'
  },
  espectro: {
    name: 'Espectro', icon: '👻', tier: 2,
    attackChance: 16, hp: 50, attacksPerTurn: 1, damage: 22,
    defense: 8, armor: 0, weapon: 0, dexterity: 18,
    speed: 90, capacity: 0,
    summonersNeeded: 8, cost: { esencia: 150 }, time: 540,
    desc: 'Asesino etéreo con alta precisión. Tier 2.'
  },
  // ── TIER 3 — 20 invocadores ──────────────────────────────────
  kobold: {
    name: 'Kobold', icon: '👺', tier: 3,
    attackChance: 15, hp: 40, attacksPerTurn: 1, damage: 12,
    defense: 10, armor: 0, weapon: 0, dexterity: 22,
    speed: 130, capacity: 0,
    summonersNeeded: 20, cost: { esencia: 250 }, time: 840,
    desc: 'Criatura ágil y escurridiza. Alta destreza. Tier 3.'
  },
  silfide: {
    name: 'Sílfide', icon: '🌬️', tier: 3,
    attackChance: 16, hp: 30, attacksPerTurn: 2, damage: 9,
    defense: 8, armor: 0, weapon: 0, dexterity: 24,
    speed: 130, capacity: 0,
    summonersNeeded: 20, cost: { esencia: 250 }, time: 840,
    desc: 'Espíritu del aire con doble ataque y extrema agilidad. Tier 3.'
  },
  // ── TIER 4 — 45 invocadores ──────────────────────────────────
  troll: {
    name: 'Troll', icon: '🧌', tier: 4,
    attackChance: 9, hp: 140, attacksPerTurn: 1, damage: 22,
    defense: 24, armor: 0, weapon: 0, dexterity: 5,
    speed: 60, capacity: 0,
    summonersNeeded: 45, cost: { esencia: 350 }, time: 1500,
    desc: 'Bestia montañesa de enorme resistencia. Tier 4.'
  },
  banshee: {
    name: 'Banshee', icon: '💀', tier: 4,
    attackChance: 19, hp: 75, attacksPerTurn: 1, damage: 32,
    defense: 10, armor: 0, weapon: 0, dexterity: 22,
    speed: 90, capacity: 0,
    summonersNeeded: 45, cost: { esencia: 350 }, time: 1500,
    desc: 'Espectro de alta precisión y daño devastador. Tier 4.'
  },
  // ── TIER 5 — 90 invocadores ──────────────────────────────────
  grifo: {
    name: 'Grifo', icon: '🦅', tier: 5,
    attackChance: 15, hp: 165, attacksPerTurn: 2, damage: 36,
    defense: 16, armor: 0, weapon: 0, dexterity: 18,
    speed: 220, capacity: 0,
    summonersNeeded: 90, cost: { esencia: 550 }, time: 3000,
    desc: 'Bestia alada con doble ataque y gran velocidad. Tier 5.'
  },
  quimera: {
    name: 'Quimera', icon: '🔥', tier: 5,
    attackChance: 14, hp: 130, attacksPerTurn: 2, damage: 32,
    defense: 15, armor: 0, weapon: 0, dexterity: 14,
    speed: 90, capacity: 0,
    summonersNeeded: 90, cost: { esencia: 550 }, time: 3000,
    desc: 'Bestia tricéfala de fuego con doble ataque. Tier 5.'
  },
  // ── TIER 6 — 150 invocadores ─────────────────────────────────
  hidra: {
    name: 'Hidra', icon: '🐉', tier: 6,
    attackChance: 13, hp: 250, attacksPerTurn: 3, damage: 27,
    defense: 18, armor: 0, weapon: 0, dexterity: 11,
    speed: 90, capacity: 0,
    summonersNeeded: 150, cost: { esencia: 750 }, time: 4500,
    desc: 'Monstruo de múltiples cabezas con triple ataque. Tier 6.'
  },
  ciclope: {
    name: 'Cíclope', icon: '👁️', tier: 6,
    attackChance: 10, hp: 210, attacksPerTurn: 1, damage: 55,
    defense: 20, armor: 0, weapon: 0, dexterity: 6,
    speed: 60, capacity: 0,
    summonersNeeded: 150, cost: { esencia: 750 }, time: 4500,
    desc: 'Gigante de un ojo con golpe devastador. Tier 6.'
  },
  // ── TIER 7 — 230 invocadores ─────────────────────────────────
  basilisco: {
    name: 'Basilisco', icon: '🐍', tier: 7,
    attackChance: 21, hp: 140, attacksPerTurn: 1, damage: 58,
    defense: 12, armor: 0, weapon: 0, dexterity: 20,
    speed: 130, capacity: 0,
    summonersNeeded: 230, cost: { esencia: 1000 }, time: 6600,
    desc: 'Serpiente letal de mirada paralizante y veneno mortal. Tier 7.'
  },
  valquiria: {
    name: 'Valquiria', icon: '⚔️', tier: 7,
    attackChance: 17, hp: 200, attacksPerTurn: 2, damage: 42,
    defense: 22, armor: 0, weapon: 0, dexterity: 20,
    speed: 150, capacity: 0,
    summonersNeeded: 230, cost: { esencia: 1000 }, time: 6600,
    desc: 'Guerrera divina equilibrada en ataque y defensa. Tier 7.'
  },
  // ── TIER 8 — 320 invocadores ─────────────────────────────────
  minotauro: {
    name: 'Minotauro', icon: '🐂', tier: 8,
    attackChance: 12, hp: 320, attacksPerTurn: 1, damage: 50,
    defense: 26, armor: 0, weapon: 0, dexterity: 8,
    speed: 60, capacity: 0,
    summonersNeeded: 320, cost: { esencia: 1400 }, time: 9000,
    desc: 'Bestia mitad hombre mitad toro, coloso imparable. Tier 8.'
  },
  salamandra: {
    name: 'Salamandra', icon: '🦎', tier: 8,
    attackChance: 15, hp: 220, attacksPerTurn: 2, damage: 65,
    defense: 15, armor: 0, weapon: 0, dexterity: 16,
    speed: 130, capacity: 0,
    summonersNeeded: 320, cost: { esencia: 1400 }, time: 9000,
    desc: 'Criatura ígnea con doble ataque abrasador. Tier 8.'
  },
  // ── TIER 9 — 410 invocadores ─────────────────────────────────
  manticora: {
    name: 'Manticora', icon: '🦁', tier: 9,
    attackChance: 17, hp: 270, attacksPerTurn: 3, damage: 48,
    defense: 18, armor: 0, weapon: 0, dexterity: 19,
    speed: 150, capacity: 0,
    summonersNeeded: 410, cost: { esencia: 1800 }, time: 12600,
    desc: 'León alado con cola de escorpión y triple ataque. Tier 9.'
  },
  ondina: {
    name: 'Ondina', icon: '💧', tier: 9,
    attackChance: 20, hp: 190, attacksPerTurn: 1, damage: 55,
    defense: 17, armor: 0, weapon: 0, dexterity: 26,
    speed: 150, capacity: 0,
    summonersNeeded: 410, cost: { esencia: 1800 }, time: 12600,
    desc: 'Espíritu del agua de extrema agilidad y precisión. Tier 9.'
  },
  // ── TIER 10 — 500 invocadores ────────────────────────────────
  centauro: {
    name: 'Centauro', icon: '🏇', tier: 10,
    attackChance: 16, hp: 350, attacksPerTurn: 2, damage: 60,
    defense: 22, armor: 0, weapon: 0, dexterity: 22,
    speed: 220, capacity: 0,
    summonersNeeded: 500, cost: { esencia: 2500 }, time: 18000,
    desc: 'Guerrero mitad hombre mitad caballo, rápido y poderoso. Tier 10.'
  },
  medusa: {
    name: 'Medusa', icon: '🌀', tier: 10,
    attackChance: 23, hp: 260, attacksPerTurn: 1, damage: 80,
    defense: 15, armor: 0, weapon: 0, dexterity: 22,
    speed: 130, capacity: 0,
    summonersNeeded: 500, cost: { esencia: 2500 }, time: 18000,
    desc: 'Gorgona de mirada letal y daño excepcional. Tier 10.'
  },
  // ── TIER 11 — 850 invocadores ────────────────────────────────
  wyvern: {
    name: 'Wyvern', icon: '🐲', tier: 11,
    attackChance: 17, hp: 380, attacksPerTurn: 2, damage: 75,
    defense: 21, armor: 0, weapon: 0, dexterity: 24,
    speed: 220, capacity: 0,
    summonersNeeded: 850, cost: { esencia: 3200 }, time: 25200,
    desc: 'Dragón menor de dos alas, rápido y letal. Tier 11.'
  },
  nereida: {
    name: 'Nereida', icon: '🧜', tier: 11,
    attackChance: 21, hp: 290, attacksPerTurn: 1, damage: 70,
    defense: 18, armor: 0, weapon: 0, dexterity: 28,
    speed: 170, capacity: 0,
    summonersNeeded: 850, cost: { esencia: 3200 }, time: 25200,
    desc: 'Ninfa marina de destreza sin igual. Tier 11.'
  },
  // ── TIER 12 — 1.200 invocadores ──────────────────────────────
  gigante: {
    name: 'Gigante', icon: '🏔️', tier: 12,
    attackChance: 10, hp: 650, attacksPerTurn: 1, damage: 75,
    defense: 38, armor: 0, weapon: 0, dexterity: 4,
    speed: 55, capacity: 0,
    summonersNeeded: 1200, cost: { esencia: 4000 }, time: 36000,
    desc: 'Colosal titan de roca y fuerza inmensurable. Tier 12.'
  },
  harpia: {
    name: 'Harpía', icon: '🦤', tier: 12,
    attackChance: 19, hp: 320, attacksPerTurn: 3, damage: 68,
    defense: 17, armor: 0, weapon: 0, dexterity: 26,
    speed: 170, capacity: 0,
    summonersNeeded: 1200, cost: { esencia: 4000 }, time: 36000,
    desc: 'Criatura alada con triple ataque devastador. Tier 12.'
  },
  // ── TIER 13 — 1.550 invocadores ──────────────────────────────
  fenix: {
    name: 'Fénix', icon: '🔥', tier: 13,
    attackChance: 18, hp: 460, attacksPerTurn: 2, damage: 62,
    defense: 16, armor: 0, weapon: 0, dexterity: 22,
    speed: 170, capacity: 0,
    summonersNeeded: 1550, cost: { esencia: 5500 }, time: 50400,
    desc: 'Ave inmortal de fuego que renace de sus cenizas. Tier 13.'
  },
  cerbero: {
    name: 'Cerbero', icon: '🐕', tier: 13,
    attackChance: 16, hp: 500, attacksPerTurn: 3, damage: 65,
    defense: 24, armor: 0, weapon: 0, dexterity: 14,
    speed: 90, capacity: 0,
    summonersNeeded: 1550, cost: { esencia: 5500 }, time: 50400,
    desc: 'Can tricéfalo guardián del inframundo. Triple ataque. Tier 13.'
  },
  // ── TIER 14 — 1.850 invocadores ──────────────────────────────
  behemot: {
    name: 'Behemot', icon: '🦏', tier: 14,
    attackChance: 11, hp: 760, attacksPerTurn: 1, damage: 98,
    defense: 33, armor: 0, weapon: 0, dexterity: 7,
    speed: 60, capacity: 0,
    summonersNeeded: 1850, cost: { esencia: 7000 }, time: 72000,
    desc: 'Coloso indestructible de fuerza primordial. Tier 14.'
  },
  quetzal: {
    name: 'Quetzal', icon: '🦜', tier: 14,
    attackChance: 19, hp: 430, attacksPerTurn: 2, damage: 90,
    defense: 18, armor: 0, weapon: 0, dexterity: 24,
    speed: 170, capacity: 0,
    summonersNeeded: 1850, cost: { esencia: 7000 }, time: 72000,
    desc: 'Serpiente emplumada sagrada, veloz y poderosa. Tier 14.'
  },
  // ── TIER 15 — 2.150 invocadores ──────────────────────────────
  leviatan: {
    name: 'Leviatán', icon: '🌊', tier: 15,
    attackChance: 12, hp: 920, attacksPerTurn: 1, damage: 105,
    defense: 40, armor: 0, weapon: 0, dexterity: 6,
    speed: 60, capacity: 0,
    summonersNeeded: 2150, cost: { esencia: 8500 }, time: 86400,
    desc: 'Serpiente marina primordial de tamaño colosal. Tier 15.'
  },
  serafin: {
    name: 'Serafín', icon: '😇', tier: 15,
    attackChance: 20, hp: 610, attacksPerTurn: 2, damage: 112,
    defense: 28, armor: 0, weapon: 0, dexterity: 22,
    speed: 150, capacity: 0,
    summonersNeeded: 2150, cost: { esencia: 8500 }, time: 86400,
    desc: 'Ángel de seis alas equilibrado en toda su magnificencia. Tier 15.'
  },
  // ── TIER 16 — 2.450 invocadores ──────────────────────────────
  titan: {
    name: 'Titán', icon: '⛰️', tier: 16,
    attackChance: 11, hp: 1100, attacksPerTurn: 1, damage: 115,
    defense: 45, armor: 0, weapon: 0, dexterity: 5,
    speed: 60, capacity: 0,
    summonersNeeded: 2450, cost: { esencia: 10500 }, time: 108000,
    desc: 'Dios primordial de fuerza inconmensurable. Tier 16.'
  },
  lich: {
    name: 'Lich', icon: '💀', tier: 16,
    attackChance: 24, hp: 560, attacksPerTurn: 1, damage: 145,
    defense: 16, armor: 0, weapon: 0, dexterity: 24,
    speed: 130, capacity: 0,
    summonersNeeded: 2450, cost: { esencia: 10500 }, time: 108000,
    desc: 'Archimago no-muerto de precisión y daño extremos. Tier 16.'
  },
  // ── TIER 17 — 2.750 invocadores ──────────────────────────────
  pegaso: {
    name: 'Pegaso', icon: '🐎', tier: 17,
    attackChance: 18, hp: 660, attacksPerTurn: 2, damage: 102,
    defense: 22, armor: 0, weapon: 0, dexterity: 28,
    speed: 350, capacity: 0,
    summonersNeeded: 2750, cost: { esencia: 13000 }, time: 129600,
    desc: 'Caballo alado divino, el más veloz de los cielos. Tier 17.'
  },
  naga: {
    name: 'Naga', icon: '🐍', tier: 17,
    attackChance: 16, hp: 760, attacksPerTurn: 3, damage: 92,
    defense: 26, armor: 0, weapon: 0, dexterity: 18,
    speed: 90, capacity: 0,
    summonersNeeded: 2750, cost: { esencia: 13000 }, time: 129600,
    desc: 'Serpiente divina de triple ataque y enorme resistencia. Tier 17.'
  },
  // ── TIER 18 — 3.000 invocadores ──────────────────────────────
  yeti: {
    name: 'Yeti', icon: '❄️', tier: 18,
    attackChance: 10, hp: 1320, attacksPerTurn: 1, damage: 125,
    defense: 48, armor: 0, weapon: 0, dexterity: 5,
    speed: 55, capacity: 0,
    summonersNeeded: 3000, cost: { esencia: 16000 }, time: 151200,
    desc: 'Bestia de las nieves eternas, tanque glacial supremo. Tier 18.'
  },
  satiro: {
    name: 'Sátiro', icon: '🎭', tier: 18,
    attackChance: 20, hp: 720, attacksPerTurn: 2, damage: 132,
    defense: 20, armor: 0, weapon: 0, dexterity: 28,
    speed: 220, capacity: 0,
    summonersNeeded: 3000, cost: { esencia: 16000 }, time: 151200,
    desc: 'Ser salvaje de gran agilidad y doble ataque certero. Tier 18.'
  },
  // ── TIER 19 — 3.250 invocadores ──────────────────────────────
  simurgh: {
    name: 'Simurgh', icon: '🦅', tier: 19,
    attackChance: 18, hp: 860, attacksPerTurn: 3, damage: 118,
    defense: 24, armor: 0, weapon: 0, dexterity: 26,
    speed: 150, capacity: 0,
    summonersNeeded: 3250, cost: { esencia: 19000 }, time: 172800,
    desc: 'Ave divina persa de triple ataque y gran sabiduría. Tier 19.'
  },
  gorgona: {
    name: 'Gorgona', icon: '🌑', tier: 19,
    attackChance: 25, hp: 720, attacksPerTurn: 1, damage: 168,
    defense: 18, armor: 0, weapon: 0, dexterity: 24,
    speed: 130, capacity: 0,
    summonersNeeded: 3250, cost: { esencia: 19000 }, time: 172800,
    desc: 'Hermana mayor de Medusa, precisión y daño legendarios. Tier 19.'
  },
  // ── TIER 20 — 3.500 invocadores ──────────────────────────────
  kraken: {
    name: 'Kraken', icon: '🦑', tier: 20,
    attackChance: 14, hp: 1240, attacksPerTurn: 4, damage: 135,
    defense: 35, armor: 0, weapon: 0, dexterity: 12,
    speed: 60, capacity: 0,
    summonersNeeded: 3500, cost: { esencia: 23000 }, time: 201600,
    desc: 'Bestia marina colosal con cuádruple ataque demoledor. Tier 20.'
  },
  angelcaido: {
    name: 'Ángel Caído', icon: '😈', tier: 20,
    attackChance: 22, hp: 920, attacksPerTurn: 2, damage: 188,
    defense: 22, armor: 0, weapon: 0, dexterity: 22,
    speed: 150, capacity: 0,
    summonersNeeded: 3500, cost: { esencia: 23000 }, time: 201600,
    desc: 'Ángel corrompido de poder oscuro equilibrado. Tier 20.'
  },
  // ── TIER 21 — 3.750 invocadores ──────────────────────────────
  ammit: {
    name: 'Ammit', icon: '⚖️', tier: 21,
    attackChance: 13, hp: 1520, attacksPerTurn: 1, damage: 158,
    defense: 42, armor: 0, weapon: 0, dexterity: 8,
    speed: 55, capacity: 0,
    summonersNeeded: 3750, cost: { esencia: 28000 }, time: 230400,
    desc: 'Devorador de almas egipcio, tanque del inframundo. Tier 21.'
  },
  roc: {
    name: 'Roc', icon: '🦅', tier: 21,
    attackChance: 19, hp: 970, attacksPerTurn: 2, damage: 148,
    defense: 24, armor: 0, weapon: 0, dexterity: 26,
    speed: 350, capacity: 0,
    summonersNeeded: 3750, cost: { esencia: 28000 }, time: 230400,
    desc: 'Ave colosal de los mares, la más veloz del mundo. Tier 21.'
  },
  // ── TIER 22 — 3.950 invocadores ──────────────────────────────
  dragon: {
    name: 'Dragón', icon: '🐲', tier: 22,
    attackChance: 20, hp: 1420, attacksPerTurn: 3, damage: 128,
    defense: 26, armor: 0, weapon: 0, dexterity: 16,
    speed: 150, capacity: 0,
    summonersNeeded: 3950, cost: { esencia: 35000 }, time: 259200,
    desc: 'Dragón antiguo de poder legendario. Tier 22.'
  },
  arconte: {
    name: 'Arconte', icon: '👼', tier: 22,
    attackChance: 22, hp: 1200, attacksPerTurn: 2, damage: 108,
    defense: 38, armor: 0, weapon: 0, dexterity: 20,
    speed: 90, capacity: 0,
    summonersNeeded: 3950, cost: { esencia: 35000 }, time: 259200,
    desc: 'Ser celestial supremo de poder equilibrado. Tier 22.'
  },
  // ── TIER 23 — 4.150 invocadores ──────────────────────────────
  coloso: {
    name: 'Coloso', icon: '⚙️', tier: 23,
    attackChance: 11, hp: 2050, attacksPerTurn: 1, damage: 175,
    defense: 55, armor: 0, weapon: 0, dexterity: 4,
    speed: 55, capacity: 0,
    summonersNeeded: 4150, cost: { esencia: 42000 }, time: 288000,
    desc: 'Gigante de metal y piedra, el mayor tanque conocido. Tier 23.'
  },
  sleipnir: {
    name: 'Sleipnir', icon: '🐴', tier: 23,
    attackChance: 21, hp: 1130, attacksPerTurn: 2, damage: 188,
    defense: 22, armor: 0, weapon: 0, dexterity: 30,
    speed: 220, capacity: 0,
    summonersNeeded: 4150, cost: { esencia: 42000 }, time: 288000,
    desc: 'Corcel de ocho patas de Odín, velocidad sobrenatural. Tier 23.'
  },
  // ── TIER 24 — 4.350 invocadores ──────────────────────────────
  abismo: {
    name: 'Abismo', icon: '🌑', tier: 24,
    attackChance: 12, hp: 2450, attacksPerTurn: 2, damage: 185,
    defense: 52, armor: 0, weapon: 0, dexterity: 5,
    speed: 55, capacity: 0,
    summonersNeeded: 4350, cost: { esencia: 50000 }, time: 316800,
    desc: 'Entidad del vacío eterno de resistencia absoluta. Tier 24.'
  },
  nemea: {
    name: 'Nemea', icon: '🦁', tier: 24,
    attackChance: 22, hp: 1340, attacksPerTurn: 2, damage: 235,
    defense: 24, armor: 0, weapon: 0, dexterity: 22,
    speed: 150, capacity: 0,
    summonersNeeded: 4350, cost: { esencia: 50000 }, time: 316800,
    desc: 'León de Nemea de piel invulnerable y zarpa mortal. Tier 24.'
  },
  // ── TIER 25 — 4.500 invocadores ──────────────────────────────
  tifon: {
    name: 'Tifón', icon: '🌪️', tier: 25,
    attackChance: 18, hp: 1850, attacksPerTurn: 4, damage: 215,
    defense: 32, armor: 0, weapon: 0, dexterity: 16,
    speed: 90, capacity: 0,
    summonersNeeded: 4500, cost: { esencia: 60000 }, time: 345600,
    desc: 'Padre de todos los monstruos, cuádruple ataque titánico. Tier 25.'
  },
  equidna: {
    name: 'Equidna', icon: '🐍', tier: 25,
    attackChance: 20, hp: 1650, attacksPerTurn: 2, damage: 225,
    defense: 36, armor: 0, weapon: 0, dexterity: 20,
    speed: 90, capacity: 0,
    summonersNeeded: 4500, cost: { esencia: 60000 }, time: 345600,
    desc: 'Madre de todos los monstruos, equilibrio supremo. Tier 25.'
  },
  // ── TIER 26 — 4.650 invocadores ──────────────────────────────
  tarasca: {
    name: 'Tarasca', icon: '🐊', tier: 26,
    attackChance: 12, hp: 2850, attacksPerTurn: 1, damage: 228,
    defense: 60, armor: 0, weapon: 0, dexterity: 4,
    speed: 55, capacity: 0,
    summonersNeeded: 4650, cost: { esencia: 72000 }, time: 374400,
    desc: 'Bestia medieval de coraza impenetrable. Tanque absoluto. Tier 26.'
  },
  garuda: {
    name: 'Garuda', icon: '🦅', tier: 26,
    attackChance: 21, hp: 1750, attacksPerTurn: 2, damage: 285,
    defense: 26, armor: 0, weapon: 0, dexterity: 26,
    speed: 350, capacity: 0,
    summonersNeeded: 4650, cost: { esencia: 72000 }, time: 374400,
    desc: 'Ave divina hinduista, señora de los cielos y la velocidad. Tier 26.'
  },
  // ── TIER 27 — 4.800 invocadores ──────────────────────────────
  jormungandr: {
    name: 'Jörmungandr', icon: '🐍', tier: 27,
    attackChance: 15, hp: 3050, attacksPerTurn: 3, damage: 248,
    defense: 44, armor: 0, weapon: 0, dexterity: 10,
    speed: 55, capacity: 0,
    summonersNeeded: 4800, cost: { esencia: 88000 }, time: 403200,
    desc: 'Serpiente del mundo nórdica que rodea los mares. Tier 27.'
  },
  valquiriaoscura: {
    name: 'Valquiria Oscura', icon: '🖤', tier: 27,
    attackChance: 25, hp: 1850, attacksPerTurn: 2, damage: 325,
    defense: 28, armor: 0, weapon: 0, dexterity: 24,
    speed: 170, capacity: 0,
    summonersNeeded: 4800, cost: { esencia: 88000 }, time: 403200,
    desc: 'Guerrera caída de precisión y daño legendarios. Tier 27.'
  },
  // ── TIER 28 — 4.900 invocadores ──────────────────────────────
  primordio: {
    name: 'Primordio', icon: '🪨', tier: 28,
    attackChance: 11, hp: 3550, attacksPerTurn: 1, damage: 268,
    defense: 65, armor: 0, weapon: 0, dexterity: 4,
    speed: 55, capacity: 0,
    summonersNeeded: 4900, cost: { esencia: 105000 }, time: 432000,
    desc: 'Entidad de la creación, resistencia más allá de lo comprensible. Tier 28.'
  },
  azrael: {
    name: 'Azrael', icon: '⚰️', tier: 28,
    attackChance: 26, hp: 2050, attacksPerTurn: 2, damage: 385,
    defense: 24, armor: 0, weapon: 0, dexterity: 26,
    speed: 170, capacity: 0,
    summonersNeeded: 4900, cost: { esencia: 105000 }, time: 432000,
    desc: 'Ángel de la muerte, precisión y daño absolutos. Tier 28.'
  },
  // ── TIER 29 — 4.950 invocadores ──────────────────────────────
  ignisrex: {
    name: 'Ignis Rex', icon: '🔴', tier: 29,
    attackChance: 20, hp: 2550, attacksPerTurn: 3, damage: 348,
    defense: 35, armor: 0, weapon: 0, dexterity: 18,
    speed: 130, capacity: 0,
    summonersNeeded: 4950, cost: { esencia: 125000 }, time: 460800,
    desc: 'Rey del fuego primordial, triple ataque devastador. Tier 29.'
  },
  fenrir: {
    name: 'Fenrir', icon: '🐺', tier: 29,
    attackChance: 22, hp: 2250, attacksPerTurn: 3, damage: 365,
    defense: 28, armor: 0, weapon: 0, dexterity: 28,
    speed: 130, capacity: 0,
    summonersNeeded: 4950, cost: { esencia: 125000 }, time: 460800,
    desc: 'Lobo apocalíptico nórdico que destrozará el mundo. Tier 29.'
  },
  // ── TIER 30 — 5.000 invocadores ──────────────────────────────
  moloch: {
    name: 'Moloch', icon: '🔱', tier: 30,
    attackChance: 18, hp: 4050, attacksPerTurn: 2, damage: 510,
    defense: 50, armor: 0, weapon: 0, dexterity: 12,
    speed: 90, capacity: 0,
    summonersNeeded: 5000, cost: { esencia: 155000 }, time: 518400,
    desc: 'Dios devorador del fuego eterno, destrucción encarnada. Tier 30.'
  },
  metatron: {
    name: 'Metatrón', icon: '✨', tier: 30,
    attackChance: 24, hp: 3100, attacksPerTurn: 3, damage: 462,
    defense: 44, armor: 0, weapon: 0, dexterity: 24,
    speed: 150, capacity: 0,
    summonersNeeded: 5000, cost: { esencia: 155000 }, time: 518400,
    desc: 'Arcángel supremo, equilibrio perfecto entre poder y divinidad. Tier 30.'
  }
};

// ============================================================
// SCALING LOGIC
// ============================================================
// ⚠️ DEUDA DE DISEÑO — DOS FUNCIONES DE STATS CON FÓRMULAS DISTINTAS:
//   • getTroopStatsWithLevel  (aquí)           → COMBATE REAL      (+4%/nivel)
//   • getTroopStatsAtLevel    (game-social.js) → UI Investigación  (+8%/nivel + spike ×5)
// Si se rebalancea una, ACTUALIZAR TAMBIÉN la otra.
// Objetivo futuro: unificar en una sola función con parámetro de contexto.
// ============================================================
function getTroopStatsWithLevel(type, level) {
  const base = TROOP_TYPES[type];
  if (!base) return null;
  if (!level || level < 1) level = 1;

  const growth = 1 + (level - 1) * 0.04;

  return {
    ...base,
    level: level,
    hp: Math.floor(base.hp * growth),
    damage: Math.floor(base.damage * growth),
    attackChance: base.attackChance + (level - 1) * 0.5,
    defense: base.defense + (level - 1) * 0.5,
    dexterity: base.dexterity + (level - 1) * 0.5,
    speed: base.speed,
    capacity: base.capacity + (level - 1) * 1
  };
}

// ============================================================
// BUILDINGS — todos empiezan en nivel 1, producen desde nivel 1
// ============================================================
function phasedVal(l, base, m1, e1, m2, e2, m3) {
  if (l <= e1) return base * Math.pow(m1, l);
  var v1 = base * Math.pow(m1, e1);
  if (l <= e2) return v1 * Math.pow(m2, l - e1);
  var v2 = v1 * Math.pow(m2, e2 - e1);
  return v2 * Math.pow(m3, l - e2);
}

// ============================================================
// JERARQUÍA DE COSTES v1.82
// El recurso MÁS CARO de cada edificio se define como % de la
// capacidad del almacén en ese nivel. Los demás recursos
// mantienen sus ratios originales relativos al más caro.
//
//   REFERENCIA (almacén): base_max = 500
//   CARO   (85%): base_max = 425  → muralla, lab, torreinvocacion
//   MEDIO  (70%): base_max = 350  → barracas, cuarteles, refugio, herreria
//   BARATO (60%): base_max = 300  → aserradero, cantera, minehierro,
//                                   granja, circulo, torre, reclutamiento
// ============================================================

const BUILDINGS = [
  // ── RECURSOS ─────────────────────────────────────────────
  {
    // BARATO — max=madera(300), piedra/madera=0.246
    id: 'aserradero', name: 'Aserradero', icon: '🌲',
    desc: 'Produce madera por hora de forma pasiva. Los aldeanos asignados multiplican la producción. Nivel 1 activo desde el inicio.',
    prod: function (l) { return { madera: Math.floor(30 + 40 * l * Math.pow(1.1, l)) }; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0 };
      return {
        madera: Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 74,  2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(10, phasedVal(l, 15, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // BARATO — max=madera(300), piedra/madera=0.68
    id: 'cantera', name: 'Cantera', icon: '⛰️',
    desc: 'Produce piedra por hora de forma pasiva. Los aldeanos asignados multiplican la producción. Nivel 1 activo desde el inicio.',
    prod: function (l) { return { piedra: Math.floor(20 + 30 * l * Math.pow(1.1, l)) }; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0 };
      return {
        madera: Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 204, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(10, phasedVal(l, 15, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // BARATO — max=madera(300), piedra/madera=0.80, hierro/madera=0.294
    id: 'minehierro', name: 'Mina de Hierro', icon: '⚒️',
    desc: 'Produce hierro por hora de forma pasiva. Los aldeanos asignados multiplican la producción. Nivel 1 activo desde el inicio.',
    prod: function (l) { return { hierro: Math.floor(10 + 20 * l * Math.pow(1.1, l)) }; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, hierro: 0 };
      return {
        madera: Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 240, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 88,  2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(10, phasedVal(l, 18, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // BARATO — max=madera(300), piedra/madera=0.68
    id: 'granja', name: 'Granja', icon: '🌾',
    desc: 'Aumenta las provisiones generadas por aldeano asignado. Nivel 1 = 6 prov./aldeano/h, +1 por nivel.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0 };
      return {
        madera: Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 204, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(10, phasedVal(l, 15, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // BARATO — max=madera(300)=piedra(300), esencia/madera=0.218
    id: 'circulo', name: 'Círculo Místico', icon: '✨',
    desc: 'Canaliza la Esencia. La Esencia no ocupa almacén.',
    prod: function (l) { return { esencia: Math.floor(5 + 15 * l * Math.pow(1.1, l)) }; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, esencia: 0 };
      return {
        madera:  Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05)),
        piedra:  Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05)),
        esencia: Math.floor(phasedVal(l, 65,  2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(20, phasedVal(l, 30, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // REFERENCIA — base_max=500 (madera=piedra), hierro/madera=0.50
    // capacity(L) = phasedVal(L+1, 500, ...) × 1.20  — ver almacenCapForLevel (v1.83 fix)
    id: 'almacen', name: 'Almacén', icon: '🏛️',
    desc: 'Aumenta la capacidad máxima de madera, piedra, hierro y provisiones.',
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

  {
    // MEDIO — max=piedra(350), madera/piedra=0.667, hierro/piedra=0.333
    id: 'barracas', name: 'Barracas', icon: '🏰',
    desc: 'Capacidad máxima de tropas normales (no criaturas).',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, hierro: 0 };
      return {
        madera: Math.floor(phasedVal(l, 233, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 350, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 117, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(15, phasedVal(l, 40, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // BARATO — max=madera(300), piedra/madera=0.692, hierro/madera=0.346
    id: 'reclutamiento', name: 'Reclutamiento', icon: '⚔️',
    desc: 'Genera aldeanos automáticamente. Nv.1 ≈ 9 min 54s por aldeano.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, hierro: 0 };
      return {
        madera: Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 208, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 104, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(10, phasedVal(l, 25, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // CARO — max=piedra(425), hierro/piedra=0.40
    id: 'muralla', name: 'Muralla', icon: '🏰',
    desc: 'Escudo de la aldea con HP propio. El atacante debe destruirla antes de dañar tus tropas. +500 HP por nivel.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { piedra: 0, hierro: 0 };
      return {
        piedra: Math.floor(phasedVal(l, 425, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 170, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(30, phasedVal(l, 50, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // CARO — max=piedra(425), madera/piedra=0.667, esencia/piedra=0.238
    id: 'lab', name: 'Laboratorio', icon: '📜',
    desc: 'Permite investigar nuevas tecnologías (próximamente activo).',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, esencia: 0 };
      return {
        madera:  Math.floor(phasedVal(l, 283, 2, 10, 1.3, 30, 1.05)),
        piedra:  Math.floor(phasedVal(l, 425, 2, 10, 1.3, 30, 1.05)),
        esencia: Math.floor(phasedVal(l, 101, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(15, phasedVal(l, 45, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // MEDIO — max=piedra(350), madera/piedra=0.733, hierro/piedra=0.40
    id: 'cuarteles', name: 'Cuarteles', icon: '🎖️',
    desc: 'Reduce el tiempo de entrenamiento de tropas (excepto aldeanos y criaturas) un 1% por nivel, hasta un máximo del 50% en nv.50.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, hierro: 0 };
      return {
        madera: Math.floor(phasedVal(l, 257, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 350, 2, 10, 1.3, 30, 1.05)),
        hierro: Math.floor(phasedVal(l, 140, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(20, phasedVal(l, 40, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // BARATO — max=piedra(300), madera/piedra=0.50
    id: 'torre', name: 'Torre de Vigía', icon: '🗼',
    desc: 'Controla el alcance de tu aldea. Nivel 1 = 10 casillas de alcance, +10 por nivel.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0 };
      return {
        madera: Math.floor(phasedVal(l, 150, 2, 10, 1.3, 30, 1.05)),
        piedra: Math.floor(phasedVal(l, 300, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(20, phasedVal(l, 35, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // CARO — max=piedra(425), madera/piedra=0.667, esencia/piedra=0.333
    id: 'torreinvocacion', name: 'Torre de Invocación', icon: '🔮',
    desc: 'Desbloquea la invocación de criaturas poderosas. Reduce un 5% el tiempo de invocación por nivel.',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { madera: 0, piedra: 0, esencia: 0 };
      return {
        madera:  Math.floor(phasedVal(l, 283, 2, 10, 1.3, 30, 1.05)),
        piedra:  Math.floor(phasedVal(l, 425, 2, 10, 1.3, 30, 1.05)),
        esencia: Math.floor(phasedVal(l, 141, 2, 10, 1.3, 30, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(40, phasedVal(l, 55, 1.6, 10, 1.2, 30, 1.05))); }
  },

  {
    // MEDIO — max=piedra(350), hierro/piedra=0.40
    id: 'refugio', name: 'Refugio', icon: '🕵️',
    desc: 'Esconde tropas propias (no criaturas, no aliados). Las tropas dentro son invisibles a espionajes y no participan en defensa.',
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
    // MEDIO — max=hierro(350), madera/hierro=0.64, piedra/hierro=0.40
    // Máx nv.15 — phasedVal usa e2=15 en lugar de 30
    id: 'herreria', name: 'Herrería', icon: '🔨',
    desc: 'Permite mejorar el arma y la armadura de cada tipo de tropa. Nivel de Herrería = nivel máximo de mejora de equipamiento (máx nv.15).',
    prod: function () { return {}; },
    cost: function (l) {
      if (l === 0) return { hierro: 0, madera: 0, piedra: 0 };
      return {
        hierro: Math.floor(phasedVal(l, 350, 2, 10, 1.3, 15, 1.05)),
        madera: Math.floor(phasedVal(l, 224, 2, 10, 1.3, 15, 1.05)),
        piedra: Math.floor(phasedVal(l, 140, 2, 10, 1.3, 15, 1.05))
      };
    },
    time: function (l) { return l === 0 ? 0 : Math.floor(Math.max(30, phasedVal(l, 50, 1.6, 10, 1.2, 15, 1.05))); }
  },
];

function getCuartelesReduction(blds) {
  var lvl = (blds && blds['cuarteles'] && blds['cuarteles'].level) || 0;
  return Math.min(0.5, lvl * 0.01);
}

// v1.82 — Nueva curva de capacidad en 3 fases:
//   Fase 1 (nv.1–10):  100 → 5.000   (×50 en 10 niveles)
//   Fase 2 (nv.11–20): 5.000 → 50.000 (×10 en 10 niveles)
//   Fase 3 (nv.21–50): 50.000 → 5.000.000 (×100 en 30 niveles)
// ACTUALIZAR TAMBIÉN: get_building_cost y secure_village_tick en Supabase.
function getBarracksCapacity(blds) {
  var lvl = (blds && blds['barracas'] && blds['barracas'].level) || 0;
  if (lvl <= 0) return 0;
  var base = 100;
  var m1 = Math.pow(50, 1 / 10);
  var m2 = Math.pow(10, 1 / 10);
  var m3 = Math.pow(10, 1 / 15);
  if (lvl <= 10) return Math.round(base * Math.pow(m1, lvl));
  var v10 = base * Math.pow(m1, 10);
  if (lvl <= 20) return Math.round(v10 * Math.pow(m2, lvl - 10));
  var v20 = v10 * Math.pow(m2, 10);
  return Math.round(v20 * Math.pow(m3, lvl - 20));
}

function getBarracksUsed(vs) {
  if (!vs) return 0;
  var troops = vs.troops || {};
  var missions = vs.mission_queue || [];

  var inMission = {};
  missions.forEach(function (m) {
    if (!m.troops) return;
    Object.keys(m.troops).forEach(function (k) {
      inMission[k] = (inMission[k] || 0) + (m.troops[k] || 0);
    });
  });

  var used = 0;
  var aldInBase = Math.max(0, (troops.aldeano || 0) - (inMission.aldeano || 0));
  used += aldInBase;

  Object.keys(TROOP_TYPES).forEach(function (k) {
    if (k === 'aldeano') return;
    var inBase = Math.max(0, (troops[k] || 0) - (inMission[k] || 0));
    used += inBase * (TROOP_TYPES[k].barracasSlots || 1);
  });

  var trainingQueue = vs.training_queue || [];
  trainingQueue.forEach(function (t) {
    if (t.type && TROOP_TYPES[t.type] && t.type !== 'aldeano') {
      used += (t.amount || 1) * (TROOP_TYPES[t.type].barracasSlots || 1);
    }
  });

  return used;
}

function getRefugioCapacity(blds) {
  var lvl = (blds && blds['refugio'] && blds['refugio'].level) || 0;
  if (lvl === 0) return 0;
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
  return 0;
}

function getAldeanosIntervalMs(blds) {
  var lvl = (blds && blds['reclutamiento'] && blds['reclutamiento'].level) || 0;
  if (lvl === 0) return Infinity;
  var baseMin = 10;
  var mins = baseMin * (1 - 0.01 * lvl);
  mins = Math.max(1, mins);
  return Math.round(mins * 60 * 1000);
}

// v1.71: calcAndApplyAldeanos eliminada — era código muerto.
// El servidor es la autoridad (secure_village_tick).
// El contador visual se actualiza desde syncVillageResourcesFromServer cada 60s.

// v1.83 fix — capacity(L) = phasedVal(L+1, 500, 2, 10, 1.3, 30, 1.05) × 1.20
// Usando L+1 en phasedVal, el almacén de nivel L tiene ya la capacidad que antes
// correspondía al nivel L+1, garantizando que siempre puedes costear tu propia
// siguiente mejora sin necesidad de acumular recursos de otro edificio primero.
//   Nv.1: cap=2.400  (cubre coste nv.2: 2.000 madera/piedra) ✓
//   Nv.2: cap=4.800  (cubre coste nv.3: 4.000 madera/piedra) ✓
// ACTUALIZAR TAMBIÉN: secure_village_tick y start_build_secure en Supabase.
function almacenCapForLevel(l) {
  if (l <= 0) return 0;
  return Math.floor(phasedVal(l + 1, 500, 2, 10, 1.3, 30, 1.05) * 1.20);
}

function getCapacity(blds) {
  var lvl = (blds && blds['almacen'] && blds['almacen'].level) || 0;
  return Math.floor(almacenCapForLevel(lvl));
}

function getStoredTotal(res) {
  return (res.madera || 0) + (res.piedra || 0) + (res.hierro || 0) + (res.provisiones || 0);
}

// ============================================================
// TROPAS
// ============================================================
