-- ============================================================================
--  Formación Educacyl - SIMO 26 · Base de datos de puntuaciones (Supabase)
--  Pega TODO este archivo en  Supabase > SQL Editor > New query  y pulsa RUN.
--  Se puede ejecutar varias veces sin romper nada ni perder datos
--  (también sirve para ACTUALIZAR una base creada con la versión anterior).
--
--  Ranking: se ordena por puntos y, en caso de empate, por respuestas acertadas
--  (más aciertos = mejor puesto); si aún empatan, quien lo logró antes.
--
--  Seguridad:
--   · La tabla tiene RLS activado y NINGÚN permiso para el navegador: nadie puede
--     leer correos desde la web. El juego solo habla con las dos funciones de abajo.
--   · Los correos solo se ven en el panel de Supabase (Table editor / vista ganadores).
-- ============================================================================

create table if not exists public.puntuaciones (
  id          bigint generated always as identity primary key,
  creado      timestamptz not null default now(),
  nick        text        not null check (char_length(nick) between 2 and 14),
  email       text                 check (email is null or char_length(email) <= 120),
  puntos      integer     not null check (puntos >= 0),
  nivel       integer     not null check (nivel >= 1),
  duracion_s  integer     not null check (duracion_s >= 0),
  consentimiento boolean  not null default false
);
-- Respuestas acertadas (desempate). En bases anteriores se añade con 0.
alter table public.puntuaciones add column if not exists aciertos integer not null default 0 check (aciertos >= 0);

alter table public.puntuaciones enable row level security;
revoke all on public.puntuaciones from anon, authenticated;

create index if not exists puntuaciones_puntos_idx on public.puntuaciones (puntos desc, aciertos desc);
create index if not exists puntuaciones_email_idx  on public.puntuaciones (lower(email));

-- Las vistas y la función se recrean porque cambian sus columnas
drop view if exists public.ganadores;
drop view if exists public.mejores;
drop function if exists public.enviar_puntuacion(text, text, int, int, int, boolean);
drop function if exists public.enviar_puntuacion(text, text, int, int, int, int, boolean);
drop function if exists public.ranking_top(int);

-- Identidad de un jugador: su correo (si lo dio) o la propia partida (si no).
-- El ranking cuenta la MEJOR partida de cada identidad (más puntos; con igualdad, más aciertos).
create view public.mejores as
  select distinct on (coalesce(lower(email), 'anon-' || id::text))
         id, creado, nick, email, puntos, aciertos, nivel
    from public.puntuaciones
   order by coalesce(lower(email), 'anon-' || id::text), puntos desc, aciertos desc, creado asc;
alter view public.mejores set (security_invoker = true);
revoke all on public.mejores from anon, authenticated;

-- Vista para vosotros: los 3 primeros CON correo (los ganadores del premio).
create view public.ganadores as
  select row_number() over (order by puntos desc, aciertos desc, creado asc) as puesto,
         nick, email, puntos, aciertos, nivel, creado
    from public.mejores
   where email is not null
   order by puntos desc, aciertos desc, creado asc
   limit 3;
alter view public.ganadores set (security_invoker = true);
revoke all on public.ganadores from anon, authenticated;

-- ---------------------------------------------------------------------------
--  Función 1: guardar una partida (la usa el juego al terminar)
--  Devuelve la posición del jugador, el total de jugadores y el top 3.
-- ---------------------------------------------------------------------------
create function public.enviar_puntuacion(
  p_nick text, p_email text, p_puntos int, p_nivel int, p_duracion int, p_aciertos int, p_consentimiento boolean
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_nick   text := btrim(coalesce(p_nick, ''));
  v_email  text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_norm   text;
  v_id     bigint;
  v_mejor  int;
  v_mejor_ac int;
  v_pos    int;
  v_total  int;
  v_top    json;
begin
  -- Validación del nick y filtro básico de palabras malsonantes
  if char_length(v_nick) < 2 or char_length(v_nick) > 14 then
    raise exception 'nick no válido';
  end if;
  -- normaliza: minúsculas, sin tildes, "leet" (0→o 1→i 3→e 4→a @→a 5→s $→s 7→t) y solo letras
  v_norm := translate(lower(v_nick), 'áéíóúüñ0134@5$7', 'aeiouunoieaasst');
  v_norm := regexp_replace(v_norm, '[^a-z]', '', 'g');
  -- palabras largas: se rechazan aunque vayan dentro de otra
  -- palabras cortas: solo si el nick es esa palabra (con hasta 3 letras de más), para no bloquear "computer"
  if v_norm ~ '(mierda|gilipollas|cabron|follar|hitler|maricon|subnormal|imbecil|pendejo|porno|negrata|sudaca|violador|pedofil|nigger|fuck|bitch|capullo|cojones)'
     or v_norm ~ '^(puta|puto|polla|culo|zorra|joder|jodete|cono|nazi|verga|tetas|marica|cagar|shit|cunt|dick|mongolo|bollera|retrasado|follo)[a-z]{0,3}$' then
    raise exception 'nick no permitido';
  end if;

  -- Validación del correo (solo si lo han puesto) y consentimiento
  if v_email is not null then
    if v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then
      raise exception 'correo no válido';
    end if;
    if not coalesce(p_consentimiento, false) then
      raise exception 'falta el consentimiento';
    end if;
  end if;

  -- Antitrampas básicas: puntuación y aciertos plausibles para el nivel y la duración
  if p_puntos < 0 or p_puntos > 40000 * greatest(p_nivel, 1) then
    raise exception 'puntuación no plausible';
  end if;
  if p_duracion < 5 or p_puntos > p_duracion * 400 + 500 then
    raise exception 'duración no plausible';
  end if;
  if coalesce(p_aciertos, 0) < 0 or coalesce(p_aciertos, 0) > 200 or coalesce(p_aciertos, 0) * 3 > p_duracion + 6 then
    raise exception 'aciertos no plausibles';
  end if;

  -- Limitador: como mucho una partida cada 20 s con el mismo correo
  if v_email is not null and exists (
       select 1 from puntuaciones where lower(email) = v_email and creado > now() - interval '20 seconds') then
    raise exception 'demasiado rápido';
  end if;

  insert into puntuaciones (nick, email, puntos, nivel, duracion_s, aciertos, consentimiento)
  values (v_nick, v_email, p_puntos, greatest(p_nivel, 1), p_duracion, coalesce(p_aciertos, 0), coalesce(p_consentimiento, false))
  returning id into v_id;

  -- Mejor partida de esta identidad y posición en el ranking (puntos y, si empatan, aciertos)
  select puntos, aciertos into v_mejor, v_mejor_ac from mejores
   where coalesce(lower(email), 'anon-' || id::text) = coalesce(v_email, 'anon-' || v_id::text);
  select count(*) + 1 into v_pos from mejores
   where puntos > v_mejor or (puntos = v_mejor and aciertos > v_mejor_ac);
  select count(*) into v_total from mejores;

  select coalesce(json_agg(t), '[]'::json) into v_top from (
    select nick, puntos, aciertos, (email is not null) as correo
      from mejores order by puntos desc, aciertos desc, creado asc limit 3) t;

  return json_build_object('posicion', v_pos, 'total', v_total, 'mejor', v_mejor, 'mejor_aciertos', v_mejor_ac, 'top3', v_top);
end $$;

-- ---------------------------------------------------------------------------
--  Función 2: ranking público (sin correos, solo si tienen o no)
-- ---------------------------------------------------------------------------
create function public.ranking_top(p_n int default 10)
returns json
language sql security definer set search_path = public stable
as $$
  select coalesce(json_agg(t), '[]'::json) from (
    select nick, puntos, aciertos, nivel, (email is not null) as correo
      from mejores order by puntos desc, aciertos desc, creado asc
     limit least(greatest(p_n, 1), 50)) t;
$$;

grant execute on function public.enviar_puntuacion(text, text, int, int, int, int, boolean) to anon;
grant execute on function public.ranking_top(int) to anon;

-- ---------------------------------------------------------------------------
--  Utilidades para vosotros (ejecutar sueltas en el SQL Editor cuando haga falta)
-- ---------------------------------------------------------------------------
--  Ver ganadores:             select * from ganadores;
--  Exportar todo a Excel:     Table editor > puntuaciones > Export > CSV
--  Borrar pruebas antes de la feria:   truncate table puntuaciones restart identity;
