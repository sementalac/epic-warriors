// ============================================================
// EPIC WARRIORS — game-globals.js  (v1.39)
// Cargado en <head> ANTES que cualquier otro módulo.
// Define sbClient y todos los globals compartidos.
// ⚠️ NUNCA referenciar DOM aquí — el body no existe aún.
// ============================================================

var SUPABASE_URL = 'https://plrsfepvdgxlaxzejfbu.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscnNmZXB2ZGd4bGF4emVqZmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMjIzNjksImV4cCI6MjA4NjU5ODM2OX0.7ypfPPSwvNCyU-QdQe-58gjBYV7glm3fD9yPLHQstTc';

try {
  var _lsUrl = localStorage.getItem('EW_SUPABASE_URL');
  var _lsKey = localStorage.getItem('EW_SUPABASE_KEY');
  if (_lsUrl && _lsKey) { SUPABASE_URL = _lsUrl; SUPABASE_KEY = _lsKey; }
} catch(e) {}

var GAME_VERSION  = '0.71';
var MAP_SIZE      = 380;
var MAP_VIEW      = 7;
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
var currentUser      = null;
var myVillages       = [];
var activeVillage    = null;
var activeVillageId  = null;
var allVillages      = [];

// ── Timers ─────────────────────────────────────────────────
var uiTimer         = null;
var autoSaveTimer   = null;

// ── Guardado ───────────────────────────────────────────────
var isFlushing             = false;
var pendingFlush           = false;
var _stateDirty            = false;
var _missionWatchScheduled = false;

// ── Misc ───────────────────────────────────────────────────
var playerObjectives = [];
