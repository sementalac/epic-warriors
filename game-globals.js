// ============================================================
// EPIC WARRIORS — game-globals.js  (v1.70)
// Cargado en <head> ANTES que cualquier otro módulo.
// Define sbClient y todos los globals compartidos.
// ⚠️ NUNCA referenciar DOM aquí — el body no existe aún.
// ============================================================

var SUPABASE_URL = 'https://plrsfepvdgxlaxzejfbu.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscnNmZXB2ZGd4bGF4emVqZmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMjIzNjksImV4cCI6MjA4NjU5ODM2OX0.7ypfPPSwvNCyU-QdQe-58gjBYV7glm3fD9yPLHQstTc';

var GAME_VERSION = '1.71';
var MAP_SIZE = 380;
var MAP_VIEW = 7;
var GHOST_OWNER_ID = '00000000-0000-0000-0000-000000000000';

var sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

// ── Estado del jugador ─────────────────────────────────────
var currentUser = null;
var myVillages = [];
var activeVillage = null;
var activeVillageId = null;
var allVillages = [];

// ── Timers ─────────────────────────────────────────────────
var uiTimer = null;
var autoSaveTimer = null;
var _lastResourceSync = 0;   // ms desde último sync con servidor (tick 60s)
var _lastMapLoad = 0;        // ms desde última carga del mapa (cache)

// ── Guardado ───────────────────────────────────────────────
var isFlushing = false;
var pendingFlush = false;
var _stateDirty = false;
var _missionWatchScheduled = false;

// ── Misc ───────────────────────────────────────────────────
var playerObjectives = [];
var _guestTroopsTableExists = null; // null=sin verificar, true/false=resultado
var profileCache = {};              // { [userId]: { username, ... } } — cache de perfiles
