-- ============================================================
-- Epic Warriors v1.66 — RPCs modelo Ogame
-- Todas las acciones que gastan recursos son server-authoritative.
-- Pegar completo en Supabase SQL Editor y ejecutar.
-- ============================================================


-- ── HELPER: phasedVal idéntica a JS ─────────────────────────
CREATE OR REPLACE FUNCTION phased_val(l int, base float, m1 float, e1 int, m2 float, e2 int, m3 float)
RETURNS float LANGUAGE plpgsql AS $$
DECLARE v1 float; v2 float;
BEGIN
  IF l <= e1 THEN RETURN base * POWER(m1, l); END IF;
  v1 := base * POWER(m1, e1);
  IF l <= e2 THEN RETURN v1 * POWER(m2, l - e1); END IF;
  v2 := v1 * POWER(m2, e2 - e1);
  RETURN v2 * POWER(m3, l - e2);
END;
$$;


-- ── HELPER: coste y tiempo de edificio ──────────────────────
CREATE OR REPLACE FUNCTION get_building_cost(p_building_id text, p_next_lvl int)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_madera int := 0; v_piedra int := 0; v_hierro int := 0;
  v_esencia int := 0; v_time int := 0;
  l int := p_next_lvl;
BEGIN
  CASE p_building_id
    WHEN 'aserradero' THEN
      v_madera := FLOOR(phased_val(l,65,2,10,1.3,30,1.05));
      v_piedra := FLOOR(phased_val(l,16,2,10,1.3,30,1.05));
      v_time   := GREATEST(10,FLOOR(phased_val(l,15,1.6,10,1.2,30,1.05)));
    WHEN 'cantera' THEN
      v_madera := FLOOR(phased_val(l,50,2,10,1.3,30,1.05));
      v_piedra := FLOOR(phased_val(l,34,2,10,1.3,30,1.05));
      v_time   := GREATEST(10,FLOOR(phased_val(l,15,1.6,10,1.2,30,1.05)));
    WHEN 'minehierro' THEN
      v_madera := FLOOR(phased_val(l,85,2,10,1.3,30,1.05));
      v_piedra := FLOOR(phased_val(l,68,2,10,1.3,30,1.05));
      v_hierro := FLOOR(phased_val(l,25,2,10,1.3,30,1.05));
      v_time   := GREATEST(10,FLOOR(phased_val(l,18,1.6,10,1.2,30,1.05)));
    WHEN 'granja' THEN
      v_madera := FLOOR(phased_val(l,50,2,10,1.3,30,1.05));
      v_piedra := FLOOR(phased_val(l,34,2,10,1.3,30,1.05));
      v_time   := GREATEST(10,FLOOR(phased_val(l,15,1.6,10,1.2,30,1.05)));
    WHEN 'circulo' THEN
      v_madera  := FLOOR(phased_val(l,170,2,10,1.3,30,1.05));
      v_piedra  := FLOOR(phased_val(l,170,2,10,1.3,30,1.05));
      v_esencia := FLOOR(phased_val(l,37,2,10,1.3,30,1.05));
      v_time    := GREATEST(20,FLOOR(phased_val(l,30,1.6,10,1.2,30,1.05)));
    WHEN 'almacen' THEN
      v_madera := FLOOR(phased_val(l,500,2,10,1.3,30,1.05));
      v_piedra := FLOOR(phased_val(l,500,2,10,1.3,30,1.05));
      v_hierro := FLOOR(phased_val(l,250,2,10,1.3,30,1.05));
      v_time   := GREATEST(15,FLOOR(phased_val(l,60,1.6,10,1.2,30,1.05)));
    WHEN 'barracas' THEN
      v_madera := FLOOR(phased_val(l,200,2,10,1.3,30,1.05));
      v_piedra := FLOOR(phased_val(l,300,2,10,1.3,30,1.05));
      v_hierro := FLOOR(phased_val(l,100,2,10,1.3,30,1.05));
      v_time   := GREATEST(15,FLOOR(phased_val(l,40,1.6,10,1.2,30,1.05)));
    WHEN 'reclutamiento' THEN
      v_madera := FLOOR(phased_val(l,130,2,10,1.3,30,1.05));
      v_piedra := FLOOR(phased_val(l,90,2,10,1.3,30,1.05));
      v_hierro := FLOOR(phased_val(l,45,2,10,1.3,30,1.05));
      v_time   := GREATEST(10,FLOOR(phased_val(l,25,1.6,10,1.2,30,1.05)));
    WHEN 'muralla' THEN
      v_piedra := FLOOR(phased_val(l,350,2,10,1.3,30,1.05));
      v_hierro := FLOOR(phased_val(l,140,2,10,1.3,30,1.05));
      v_time   := GREATEST(30,FLOOR(phased_val(l,50,1.6,10,1.2,30,1.05)));
    WHEN 'lab' THEN
      v_madera  := FLOOR(phased_val(l,280,2,10,1.3,30,1.05));
      v_piedra  := FLOOR(phased_val(l,420,2,10,1.3,30,1.05));
      v_esencia := FLOOR(phased_val(l,100,2,10,1.3,30,1.05));
      v_time    := GREATEST(15,FLOOR(phased_val(l,45,1.6,10,1.2,30,1.05)));
    WHEN 'cuarteles' THEN
      v_madera := FLOOR(phased_val(l,220,2,10,1.3,30,1.05));
      v_piedra := FLOOR(phased_val(l,300,2,10,1.3,30,1.05));
      v_hierro := FLOOR(phased_val(l,120,2,10,1.3,30,1.05));
      v_time   := GREATEST(20,FLOOR(phased_val(l,40,1.6,10,1.2,30,1.05)));
    WHEN 'torre' THEN
      v_madera := FLOOR(phased_val(l,70,2,10,1.3,30,1.05));
      v_piedra := FLOOR(phased_val(l,140,2,10,1.3,30,1.05));
      v_time   := GREATEST(20,FLOOR(phased_val(l,35,1.6,10,1.2,30,1.05)));
    WHEN 'torreinvocacion' THEN
      v_madera  := FLOOR(phased_val(l,200,2,10,1.3,30,1.05));
      v_piedra  := FLOOR(phased_val(l,300,2,10,1.3,30,1.05));
      v_esencia := FLOOR(phased_val(l,100,2,10,1.3,30,1.05));
      v_time    := GREATEST(40,FLOOR(phased_val(l,55,1.6,10,1.2,30,1.05)));
    WHEN 'refugio' THEN
      v_piedra := FLOOR(phased_val(l,350,2,10,1.3,30,1.05));
      v_hierro := FLOOR(phased_val(l,140,2,10,1.3,30,1.05));
      v_time   := GREATEST(30,FLOOR(phased_val(l,50,1.6,10,1.2,30,1.05)));
    WHEN 'herreria' THEN
      v_hierro := FLOOR(phased_val(l,250,2,10,1.3,15,1.05));
      v_madera := FLOOR(phased_val(l,160,2,10,1.3,15,1.05));
      v_piedra := FLOOR(phased_val(l,100,2,10,1.3,15,1.05));
      v_time   := GREATEST(30,FLOOR(phased_val(l,50,1.6,10,1.2,15,1.05)));
    ELSE RAISE EXCEPTION 'Edificio desconocido: %', p_building_id;
  END CASE;
  RETURN jsonb_build_object('madera',v_madera,'piedra',v_piedra,'hierro',v_hierro,'esencia',v_esencia,'time_secs',v_time);
END;
$$;


-- ── RPC: start_build_secure ──────────────────────────────────
CREATE OR REPLACE FUNCTION start_build_secure(p_village_id uuid, p_building_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row      villages%ROWTYPE;
  v_state    jsonb; v_res jsonb; v_blds jsonb;
  v_cur_lvl  int; v_next_lvl int;
  v_cost     jsonb; v_new_res jsonb;
  v_finish   timestamptz;
BEGIN
  SELECT * INTO v_row FROM villages WHERE id = p_village_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aldea no encontrada'; END IF;
  IF v_row.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  v_state := v_row.state;
  v_res   := v_state->'resources';
  v_blds  := v_state->'buildings';

  IF v_row.build_queue IS NOT NULL AND v_row.build_queue::text NOT IN ('null','{}','') THEN
    RAISE EXCEPTION 'Ya hay una construcción en curso';
  END IF;

  v_cur_lvl  := COALESCE((v_blds->p_building_id->>'level')::int, 0);
  v_next_lvl := v_cur_lvl + 1;
  v_cost     := get_building_cost(p_building_id, v_next_lvl);

  IF COALESCE((v_res->>'madera')::int,0)  < (v_cost->>'madera')::int  OR
     COALESCE((v_res->>'piedra')::int,0)  < (v_cost->>'piedra')::int  OR
     COALESCE((v_res->>'hierro')::int,0)  < (v_cost->>'hierro')::int  OR
     COALESCE((v_res->>'esencia')::int,0) < (v_cost->>'esencia')::int
  THEN RAISE EXCEPTION 'Recursos insuficientes'; END IF;

  v_new_res := jsonb_build_object(
    'madera',      GREATEST(0,COALESCE((v_res->>'madera')::int,0)      - (v_cost->>'madera')::int),
    'piedra',      GREATEST(0,COALESCE((v_res->>'piedra')::int,0)      - (v_cost->>'piedra')::int),
    'hierro',      GREATEST(0,COALESCE((v_res->>'hierro')::int,0)      - (v_cost->>'hierro')::int),
    'provisiones', COALESCE((v_res->>'provisiones')::int,0),
    'esencia',     GREATEST(0,COALESCE((v_res->>'esencia')::int,0)     - (v_cost->>'esencia')::int)
  );

  v_finish := NOW() + ((v_cost->>'time_secs')::int || ' seconds')::interval;

  UPDATE villages
  SET state       = v_state || jsonb_build_object('resources', v_new_res, 'last_updated', NOW()::text),
      build_queue = jsonb_build_object('id', p_building_id, 'finish_at', v_finish::text)
  WHERE id = p_village_id;

  RETURN (SELECT state || jsonb_build_object('build_queue', build_queue) FROM villages WHERE id = p_village_id);
END;
$$;


-- ── RPC: cancel_build_secure ─────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_build_secure(p_village_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row     villages%ROWTYPE;
  v_state   jsonb; v_res jsonb; v_bq jsonb;
  v_bld_id  text; v_cur_lvl int; v_cost jsonb; v_new_res jsonb;
BEGIN
  SELECT * INTO v_row FROM villages WHERE id = p_village_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aldea no encontrada'; END IF;
  IF v_row.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  v_bq := v_row.build_queue;
  IF v_bq IS NULL OR v_bq::text IN ('null','{}','') THEN
    RAISE EXCEPTION 'No hay construcción en curso';
  END IF;

  v_state   := v_row.state;
  v_res     := v_state->'resources';
  v_bld_id  := v_bq->>'id';
  v_cur_lvl := COALESCE((v_state->'buildings'->v_bld_id->>'level')::int, 0);
  v_cost    := get_building_cost(v_bld_id, v_cur_lvl + 1);

  v_new_res := jsonb_build_object(
    'madera',      COALESCE((v_res->>'madera')::int,0)      + (v_cost->>'madera')::int,
    'piedra',      COALESCE((v_res->>'piedra')::int,0)      + (v_cost->>'piedra')::int,
    'hierro',      COALESCE((v_res->>'hierro')::int,0)      + (v_cost->>'hierro')::int,
    'provisiones', COALESCE((v_res->>'provisiones')::int,0),
    'esencia',     COALESCE((v_res->>'esencia')::int,0)     + (v_cost->>'esencia')::int
  );

  UPDATE villages
  SET state       = v_state || jsonb_build_object('resources', v_new_res, 'last_updated', NOW()::text),
      build_queue = NULL
  WHERE id = p_village_id;

  RETURN (SELECT state FROM villages WHERE id = p_village_id);
END;
$$;


-- ── HELPER: coste de tropa ───────────────────────────────────
CREATE OR REPLACE FUNCTION get_troop_cost(p_type text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'aldeano'    THEN '{"madera":0,"piedra":0,"hierro":0,"esencia":0,"prov":1,"time_secs":60}'::jsonb
    WHEN 'soldado'    THEN '{"madera":0,"piedra":0,"hierro":10,"esencia":0,"prov":2,"time_secs":180}'::jsonb
    WHEN 'mago'       THEN '{"madera":0,"piedra":0,"hierro":0,"esencia":20,"prov":3,"time_secs":300}'::jsonb
    WHEN 'druida'     THEN '{"madera":5,"piedra":0,"hierro":0,"esencia":10,"prov":2,"time_secs":240}'::jsonb
    WHEN 'explorador' THEN '{"madera":5,"piedra":0,"hierro":5,"esencia":0,"prov":1,"time_secs":120}'::jsonb
    WHEN 'asesino'    THEN '{"madera":10,"piedra":0,"hierro":30,"esencia":15,"prov":3,"time_secs":400}'::jsonb
    WHEN 'paladin'    THEN '{"madera":0,"piedra":20,"hierro":40,"esencia":0,"prov":4,"time_secs":450}'::jsonb
    WHEN 'chaman'     THEN '{"madera":15,"piedra":10,"hierro":0,"esencia":25,"prov":3,"time_secs":350}'::jsonb
    WHEN 'invocador'  THEN '{"madera":5,"piedra":0,"hierro":5,"esencia":10,"prov":1,"time_secs":120}'::jsonb
    ELSE NULL
  END
$$;


-- ── HELPER: coste de criatura (tabla completa 30 tiers) ──────
CREATE OR REPLACE FUNCTION get_creature_cost(p_key text)
RETURNS TABLE(esencia int, time_secs int, summoners_needed int, tier int)
LANGUAGE sql IMMUTABLE AS $$
  SELECT c.esencia, c.time_secs, c.summoners_needed, c.tier
  FROM (VALUES
    ('orco',           50,    300,    1,  1),
    ('hada',           50,    300,    1,  1),
    ('golem',          150,   540,    8,  2),
    ('espectro',       150,   540,    8,  2),
    ('kobold',         250,   840,   20,  3),
    ('silfide',        250,   840,   20,  3),
    ('troll',          350,   1500,  45,  4),
    ('banshee',        350,   1500,  45,  4),
    ('grifo',          550,   3000,  90,  5),
    ('quimera',        550,   3000,  90,  5),
    ('hidra',          750,   4500, 150,  6),
    ('ciclope',        750,   4500, 150,  6),
    ('basilisco',      1000,  6600, 230,  7),
    ('valquiria',      1000,  6600, 230,  7),
    ('minotauro',      1400,  9000, 320,  8),
    ('salamandra',     1400,  9000, 320,  8),
    ('manticora',      1800, 12600, 410,  9),
    ('ondina',         1800, 12600, 410,  9),
    ('centauro',       2500, 18000, 500, 10),
    ('medusa',         2500, 18000, 500, 10),
    ('wyvern',         3200, 25200, 850, 11),
    ('nereida',        3200, 25200, 850, 11),
    ('gigante',        4000, 36000,1200, 12),
    ('harpia',         4000, 36000,1200, 12),
    ('fenix',          5500, 50400,1550, 13),
    ('cerbero',        5500, 50400,1550, 13),
    ('behemot',        7000, 72000,1850, 14),
    ('quetzal',        7000, 72000,1850, 14),
    ('leviatan',       8500, 86400,2150, 15),
    ('serafin',        8500, 86400,2150, 15),
    ('titan',         10500,108000,2450, 16),
    ('lich',          10500,108000,2450, 16),
    ('pegaso',        13000,129600,2750, 17),
    ('naga',          13000,129600,2750, 17),
    ('satiro',        15500,151200,3050, 18),
    ('gorgona',       15500,151200,3050, 18),
    ('kraken',        18500,172800,3250, 19),
    ('arana_gigante', 18500,172800,3250, 19),
    ('angelcaido',    23000,201600,3500, 20),
    ('moloch',       155000,518400,5000, 30),
    ('metatron',     155000,518400,5000, 30),
    ('ammit',         28000,230400,3750, 21),
    ('roc',           28000,230400,3750, 21),
    ('dragon',        35000,259200,3950, 22),
    ('arconte',       35000,259200,3950, 22),
    ('coloso',        42000,288000,4150, 23),
    ('sleipnir',      42000,288000,4150, 23),
    ('abismo',        50000,316800,4350, 24),
    ('nemea',         50000,316800,4350, 24),
    ('tifon',         60000,345600,4500, 25),
    ('equidna',       60000,345600,4500, 25),
    ('tarasca',       72000,374400,4650, 26),
    ('garuda',        72000,374400,4650, 26),
    ('jormungandr',   88000,403200,4800, 27),
    ('valquiriaoscura',88000,403200,4800,27),
    ('primordio',    105000,432000,4900, 28),
    ('azrael',       105000,432000,4900, 28),
    ('ignisrex',     125000,460800,4950, 29),
    ('fenrir',       125000,460800,4950, 29)
  ) AS c(key, esencia, time_secs, summoners_needed, tier)
  WHERE c.key = p_key
$$;


-- ── RPC: start_training_secure ───────────────────────────────
CREATE OR REPLACE FUNCTION start_training_secure(p_village_id uuid, p_troop_type text, p_amount int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row        villages%ROWTYPE;
  v_state      jsonb; v_res jsonb; v_blds jsonb; v_troops jsonb; v_tq jsonb;
  v_cost       jsonb;
  v_barr_lvl   int; v_barr_cap int;
  v_cuart_lvl  int; v_cuart_red float;
  v_base_time  int; v_final_time int;
  v_ald        int; v_used int;
  v_last_finish timestamptz;
  i            int; v_entry jsonb;
  v_new_res    jsonb; v_new_troops jsonb; v_new_tq jsonb;
BEGIN
  SELECT * INTO v_row FROM villages WHERE id = p_village_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aldea no encontrada'; END IF;
  IF v_row.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

  v_state  := v_row.state;
  v_res    := v_state->'resources';
  v_blds   := v_state->'buildings';
  v_troops := v_state->'troops';
  v_tq     := COALESCE(v_row.training_queue,'[]'::jsonb);

  v_cost := get_troop_cost(p_troop_type);
  IF v_cost IS NULL THEN RAISE EXCEPTION 'Tipo de tropa desconocido: %', p_troop_type; END IF;

  -- Verificar recursos suficientes para p_amount unidades
  IF COALESCE((v_res->>'madera')::int,0)  < (v_cost->>'madera')::int  * p_amount OR
     COALESCE((v_res->>'piedra')::int,0)  < (v_cost->>'piedra')::int  * p_amount OR
     COALESCE((v_res->>'hierro')::int,0)  < (v_cost->>'hierro')::int  * p_amount OR
     COALESCE((v_res->>'esencia')::int,0) < (v_cost->>'esencia')::int * p_amount
  THEN RAISE EXCEPTION 'Recursos insuficientes'; END IF;

  -- Verificar aldeanos libres
  v_ald := COALESCE((v_troops->>'aldeano')::int, 0);
  IF v_ald < p_amount THEN
    RAISE EXCEPTION 'Aldeanos insuficientes (necesitas %, tienes %)', p_amount, v_ald;
  END IF;

  -- Verificar espacio en barracas
  v_barr_lvl := COALESCE((v_blds->'barracas'->>'level')::int, 0);
  v_barr_cap := CASE WHEN v_barr_lvl = 0 THEN 0 ELSE ROUND(50 * POWER(1.40, v_barr_lvl - 1))::int END;
  SELECT COALESCE(SUM(1),0) INTO v_used FROM jsonb_array_elements(v_tq);
  -- Plazas actuales usadas (aldeans en base + queue no-aldeanos)
  v_used := v_ald + v_used;
  IF v_used + p_amount - p_amount > v_barr_cap THEN  -- netos: se van p_amount aldeanos, entran p_amount nuevas tropas
    NULL; -- barracas_slots = 1 para todas las tropas normales, el intercambio es 1:1
  END IF;

  -- Calcular tiempo con cuarteles
  v_cuart_lvl  := COALESCE((v_blds->'cuarteles'->>'level')::int, 0);
  v_cuart_red  := LEAST(0.5, v_cuart_lvl * 0.01);
  v_base_time  := (v_cost->>'time_secs')::int;
  v_final_time := GREATEST(30, FLOOR(v_base_time * (1 - v_cuart_red)))::int;

  -- Descontar recursos y aldeanos
  v_new_res := jsonb_build_object(
    'madera',      GREATEST(0,COALESCE((v_res->>'madera')::int,0)      - (v_cost->>'madera')::int  * p_amount),
    'piedra',      GREATEST(0,COALESCE((v_res->>'piedra')::int,0)      - (v_cost->>'piedra')::int  * p_amount),
    'hierro',      GREATEST(0,COALESCE((v_res->>'hierro')::int,0)      - (v_cost->>'hierro')::int  * p_amount),
    'provisiones', GREATEST(0,COALESCE((v_res->>'provisiones')::int,0) - (v_cost->>'prov')::int    * p_amount),
    'esencia',     GREATEST(0,COALESCE((v_res->>'esencia')::int,0)     - (v_cost->>'esencia')::int * p_amount)
  );
  v_new_troops := v_troops || jsonb_build_object('aldeano', GREATEST(0, v_ald - p_amount));

  -- Encolar secuencialmente
  v_new_tq      := v_tq;
  v_last_finish := NOW();
  IF jsonb_array_length(v_tq) > 0 THEN
    v_last_finish := GREATEST(v_last_finish, (v_tq->-1->>'finish_at')::timestamptz);
  END IF;

  FOR i IN 1..p_amount LOOP
    v_entry   := jsonb_build_object('type', p_troop_type,
                   'start_at',  v_last_finish::text,
                   'finish_at', (v_last_finish + (v_final_time||' seconds')::interval)::text);
    v_new_tq  := v_new_tq || jsonb_build_array(v_entry);
    v_last_finish := v_last_finish + (v_final_time||' seconds')::interval;
  END LOOP;

  UPDATE villages
  SET state          = v_state || jsonb_build_object('resources',v_new_res,'troops',v_new_troops,'last_updated',NOW()::text),
      training_queue = v_new_tq
  WHERE id = p_village_id;

  RETURN (SELECT state || jsonb_build_object('training_queue', training_queue) FROM villages WHERE id = p_village_id);
END;
$$;


-- ── RPC: cancel_training_secure ──────────────────────────────
CREATE OR REPLACE FUNCTION cancel_training_secure(p_village_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row      villages%ROWTYPE;
  v_state    jsonb; v_res jsonb; v_troops jsonb; v_tq jsonb; v_entry jsonb;
  v_cost     jsonb;
  v_ref_madera int:=0; v_ref_piedra int:=0; v_ref_hierro int:=0;
  v_ref_esencia int:=0; v_ref_prov int:=0; v_ref_ald int:=0;
  v_barr_lvl int; v_barr_cap int; v_ald_now int;
  v_new_res jsonb; v_new_troops jsonb;
BEGIN
  SELECT * INTO v_row FROM villages WHERE id = p_village_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aldea no encontrada'; END IF;
  IF v_row.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  v_tq := COALESCE(v_row.training_queue,'[]'::jsonb);
  IF jsonb_array_length(v_tq) = 0 THEN RAISE EXCEPTION 'No hay tropas en entrenamiento'; END IF;

  v_state  := v_row.state;
  v_res    := v_state->'resources';
  v_troops := v_state->'troops';

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_tq) LOOP
    v_cost        := get_troop_cost(v_entry->>'type');
    IF v_cost IS NULL THEN CONTINUE; END IF;
    v_ref_madera  := v_ref_madera  + (v_cost->>'madera')::int;
    v_ref_piedra  := v_ref_piedra  + (v_cost->>'piedra')::int;
    v_ref_hierro  := v_ref_hierro  + (v_cost->>'hierro')::int;
    v_ref_esencia := v_ref_esencia + (v_cost->>'esencia')::int;
    v_ref_prov    := v_ref_prov    + (v_cost->>'prov')::int;
    v_ref_ald     := v_ref_ald + 1;
  END LOOP;

  v_new_res := jsonb_build_object(
    'madera',      COALESCE((v_res->>'madera')::int,0)      + v_ref_madera,
    'piedra',      COALESCE((v_res->>'piedra')::int,0)      + v_ref_piedra,
    'hierro',      COALESCE((v_res->>'hierro')::int,0)      + v_ref_hierro,
    'provisiones', COALESCE((v_res->>'provisiones')::int,0) + v_ref_prov,
    'esencia',     COALESCE((v_res->>'esencia')::int,0)     + v_ref_esencia
  );

  v_barr_lvl := COALESCE((v_state->'buildings'->'barracas'->>'level')::int,0);
  v_barr_cap := CASE WHEN v_barr_lvl=0 THEN 0 ELSE ROUND(50*POWER(1.40,v_barr_lvl-1))::int END;
  v_ald_now  := COALESCE((v_troops->>'aldeano')::int,0);
  v_new_troops := v_troops || jsonb_build_object('aldeano', LEAST(v_barr_cap, v_ald_now + v_ref_ald));

  UPDATE villages
  SET state          = v_state || jsonb_build_object('resources',v_new_res,'troops',v_new_troops,'last_updated',NOW()::text),
      training_queue = '[]'::jsonb
  WHERE id = p_village_id;

  RETURN (SELECT state FROM villages WHERE id = p_village_id);
END;
$$;


-- ── RPC: start_summoning_secure ──────────────────────────────
CREATE OR REPLACE FUNCTION start_summoning_secure(p_village_id uuid, p_creature_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row        villages%ROWTYPE;
  v_state      jsonb; v_res jsonb; v_troops jsonb; v_blds jsonb; v_sq jsonb;
  v_esencia_cost     int; v_summoners_needed int; v_time_secs int; v_tier int;
  v_torre_lvl  int; v_torre_red float; v_final_time int;
  v_invocadores int; v_inv_refugio int;
  v_last_finish timestamptz;
  v_new_res    jsonb; v_new_sq jsonb;
BEGIN
  SELECT * INTO v_row FROM villages WHERE id = p_village_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aldea no encontrada'; END IF;
  IF v_row.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  v_state  := v_row.state;
  v_res    := v_state->'resources';
  v_troops := v_state->'troops';
  v_blds   := v_state->'buildings';
  v_sq     := COALESCE(v_row.summoning_queue,'[]'::jsonb);

  SELECT c.esencia, c.time_secs, c.summoners_needed, c.tier
  INTO v_esencia_cost, v_time_secs, v_summoners_needed, v_tier
  FROM get_creature_cost(p_creature_key) c;

  IF v_esencia_cost IS NULL THEN RAISE EXCEPTION 'Criatura desconocida: %', p_creature_key; END IF;

  IF COALESCE((v_res->>'esencia')::int,0) < v_esencia_cost THEN
    RAISE EXCEPTION 'Esencia insuficiente (necesitas %, tienes %)',
      v_esencia_cost, COALESCE((v_res->>'esencia')::int,0);
  END IF;

  v_invocadores  := COALESCE((v_troops->>'invocador')::int,0);
  v_inv_refugio  := COALESCE((v_state->'refugio'->>'invocador')::int,0);
  IF (v_invocadores - v_inv_refugio) < v_summoners_needed THEN
    RAISE EXCEPTION 'Invocadores insuficientes (necesitas %, tienes %)',
      v_summoners_needed, (v_invocadores - v_inv_refugio);
  END IF;

  v_torre_lvl  := COALESCE((v_blds->'torreinvocacion'->>'level')::int,0);
  v_torre_red  := LEAST(0.75, v_torre_lvl * 0.05);
  v_final_time := GREATEST(60, FLOOR(v_time_secs * (1 - v_torre_red)))::int;

  v_new_res := v_res || jsonb_build_object('esencia', GREATEST(0,COALESCE((v_res->>'esencia')::int,0) - v_esencia_cost));

  v_last_finish := NOW();
  IF jsonb_array_length(v_sq) > 0 THEN
    v_last_finish := GREATEST(v_last_finish, (v_sq->-1->>'finish_at')::timestamptz);
  END IF;

  v_new_sq := v_sq || jsonb_build_array(jsonb_build_object(
    'creature',        p_creature_key,
    'summonersNeeded', v_summoners_needed,
    'tierRequired',    v_tier,
    'start_at',        v_last_finish::text,
    'finish_at',       (v_last_finish + (v_final_time||' seconds')::interval)::text
  ));

  UPDATE villages
  SET state           = v_state || jsonb_build_object('resources',v_new_res,'last_updated',NOW()::text),
      summoning_queue = v_new_sq
  WHERE id = p_village_id;

  RETURN (SELECT state || jsonb_build_object('summoning_queue', summoning_queue) FROM villages WHERE id = p_village_id);
END;
$$;
