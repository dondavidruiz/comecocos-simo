-- ============================================================================
--  Formación Educacyl - SIMO 26 · Base de datos de puntuaciones (Supabase)
--  Pega TODO este archivo en  Supabase > SQL Editor > New query  y pulsa RUN.
--  Se puede ejecutar varias veces. Sirve para crear la base desde cero y para
--  ACTUALIZAR la versión anterior (con correos): elimina las columnas de correo.
--
--  Cómo funciona el concurso
--   · NO se guardan datos personales: solo nick, puntos, nivel, aciertos y un
--     código de partida que el jugador ve en su pantalla al terminar.
--   · Hay un ranking por DÍA (hora de España). Premio: los 3 primeros de cada día.
--   · Solo cuentan las partidas hechas dentro del horario de cada día (tabla horario).
--   · En cada día solo cuenta la mejor partida de cada nick.
--   · Orden: más puntos; si empatan, más respuestas acertadas; si aún empatan, quien lo logró antes.
--   · Entrega: el ganador enseña su código (o una captura) y el personal lo comprueba en
--     verificar.html (protegida con una clave) y lo marca como entregado.
--
--  Seguridad: la tabla tiene RLS y NINGÚN permiso para el navegador. El juego solo puede
--  llamar a las funciones de abajo. La verificación exige la clave del personal.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  Limpieza previa (se recrean vistas y funciones porque cambian)
-- ---------------------------------------------------------------------------
drop view if exists public.ganadores;
drop view if exists public.podio_dia;
drop view if exists public.mejores_dia;
drop view if exists public.mejores_general;
drop view if exists public.mejores;
drop function if exists public.enviar_puntuacion(text, text, int, int, int, boolean);
drop function if exists public.enviar_puntuacion(text, text, int, int, int, int, boolean);
drop function if exists public.enviar_puntuacion(text, int, int, int, int);
drop function if exists public.ranking_top(int);
drop function if exists public.ranking_top(int, text);
drop function if exists public.ganadores_dia(text, date);
drop function if exists public.verificar_codigo(text, text, boolean);

-- ---------------------------------------------------------------------------
--  Tabla de partidas
-- ---------------------------------------------------------------------------
create table if not exists public.puntuaciones (
  id          bigint generated always as identity primary key,
  creado      timestamptz not null default now(),
  nick        text        not null check (char_length(nick) between 2 and 14),
  puntos      integer     not null check (puntos >= 0),
  nivel       integer     not null check (nivel >= 1),
  duracion_s  integer     not null check (duracion_s >= 0)
);
alter table public.puntuaciones add column if not exists aciertos integer not null default 0 check (aciertos >= 0);
alter table public.puntuaciones add column if not exists codigo text;
alter table public.puntuaciones add column if not exists cuenta boolean not null default true;      -- dentro del horario del concurso
alter table public.puntuaciones add column if not exists entregado boolean not null default false;
alter table public.puntuaciones add column if not exists entregado_en timestamptz;
-- Fuera los datos personales de la versión anterior
alter table public.puntuaciones drop column if exists email;
alter table public.puntuaciones drop column if exists consentimiento;
-- Día natural en hora de España
alter table public.puntuaciones add column if not exists dia date
  generated always as ((creado at time zone 'Europe/Madrid')::date) stored;

create unique index if not exists puntuaciones_codigo_uq on public.puntuaciones (codigo);
create index if not exists puntuaciones_dia_idx  on public.puntuaciones (dia, puntos desc, aciertos desc);
create index if not exists puntuaciones_nick_idx on public.puntuaciones (lower(nick));
drop index if exists puntuaciones_email_idx;

alter table public.puntuaciones enable row level security;
revoke all on public.puntuaciones from anon, authenticated;

-- ---------------------------------------------------------------------------
--  Ajustes del concurso: clave del personal (una sola fila) y horario de cada día
-- ---------------------------------------------------------------------------
create table if not exists public.ajustes (
  id             int primary key default 1 check (id = 1),
  clave_hash     text
);
-- Versiones anteriores tenían un horario único: se sustituye por la tabla horario
alter table public.ajustes drop column if exists hora_apertura;
alter table public.ajustes drop column if exists hora_cierre;
alter table public.ajustes drop column if exists concurso_desde;
alter table public.ajustes drop column if exists concurso_hasta;
insert into public.ajustes (id) values (1) on conflict (id) do nothing;
alter table public.ajustes enable row level security;
revoke all on public.ajustes from anon, authenticated;

-- Un día sin fila en esta tabla = no hay concurso ese día. Horas en hora de España.
create table if not exists public.horario (
  dia      date primary key,
  apertura time not null,
  cierre   time not null
);
alter table public.horario enable row level security;
revoke all on public.horario from anon, authenticated;

-- Calendario de SIMO 26 (editable: insert ... on conflict (dia) do update ...)
insert into public.horario (dia, apertura, cierre) values
  ('2026-11-11', '10:00', '18:00'),   -- miércoles
  ('2026-11-12', '10:00', '18:00'),   -- jueves
  ('2026-11-13', '10:00', '14:00')    -- viernes
on conflict (dia) do update set apertura = excluded.apertura, cierre = excluded.cierre;

-- ---------------------------------------------------------------------------
--  Vistas (solo para el panel de Supabase; el navegador no tiene acceso)
-- ---------------------------------------------------------------------------
-- Mejor partida de cada nick en cada día (solo partidas dentro del horario)
create view public.mejores_dia as
  select distinct on (dia, lower(nick))
         id, dia, creado, nick, puntos, aciertos, nivel, codigo, entregado
    from public.puntuaciones
   where cuenta
   order by dia, lower(nick), puntos desc, aciertos desc, creado asc;

-- Podio de cada día con su puesto
create view public.podio_dia as
  select row_number() over (partition by dia order by puntos desc, aciertos desc, creado asc) as puesto,
         id, dia, creado, nick, puntos, aciertos, nivel, codigo, entregado
    from public.mejores_dia;

-- Mejor partida de cada nick en todo el concurso (clasificación general, informativa)
create view public.mejores_general as
  select distinct on (lower(nick)) id, dia, creado, nick, puntos, aciertos, nivel
    from public.puntuaciones
   where cuenta
   order by lower(nick), puntos desc, aciertos desc, creado asc;

-- Para vosotros: los 3 ganadores de cada día.   select * from ganadores;
create view public.ganadores as
  select dia, puesto, nick, puntos, aciertos, codigo, entregado
    from public.podio_dia
   where puesto <= 3
   order by dia desc, puesto;

alter view public.mejores_dia set (security_invoker = true);
alter view public.podio_dia set (security_invoker = true);
alter view public.mejores_general set (security_invoker = true);
alter view public.ganadores set (security_invoker = true);
revoke all on public.mejores_dia, public.podio_dia, public.mejores_general, public.ganadores from anon, authenticated;

-- ---------------------------------------------------------------------------
--  Función: ¿está abierto el concurso ahora?
-- ---------------------------------------------------------------------------
create or replace function public.estado_concurso()
returns json
language plpgsql security definer set search_path = public stable
as $$
declare h horario%rowtype; v_dia date := (now() at time zone 'Europe/Madrid')::date;
begin
  select * into h from horario where dia = v_dia;
  if not found then
    return json_build_object('hoy', v_dia, 'hay_concurso', false, 'abierto', false);
  end if;
  return json_build_object('hoy', v_dia, 'hay_concurso', true,
    'apertura', to_char(h.apertura, 'HH24:MI'), 'cierre', to_char(h.cierre, 'HH24:MI'),
    'abierto', (now() at time zone 'Europe/Madrid')::time between h.apertura and h.cierre);
end $$;

-- ---------------------------------------------------------------------------
--  Función: guardar una partida (la usa el juego al terminar)
-- ---------------------------------------------------------------------------
create function public.enviar_puntuacion(
  p_nick text, p_puntos int, p_nivel int, p_duracion int, p_aciertos int
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_nick   text := btrim(coalesce(p_nick, ''));
  v_norm   text;
  v_ahora  timestamp := now() at time zone 'Europe/Madrid';
  v_dia    date := (now() at time zone 'Europe/Madrid')::date;
  v_cuenta boolean;
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- sin 0/O, 1/I/L
  v_codigo text;
  v_id     bigint;
  v_mejor  record;
  v_pos    int;
  v_total  int;
  v_top    json;
  h        horario%rowtype;
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

  -- Limitador: como mucho una partida cada 15 s con el mismo nick
  if exists (select 1 from puntuaciones where lower(nick) = lower(v_nick) and creado > now() - interval '15 seconds') then
    raise exception 'demasiado rápido';
  end if;

  -- ¿Cuenta para el concurso? (horario del stand y fechas del concurso)
  select * into h from horario where dia = v_dia;
  v_cuenta := found and v_ahora::time between h.apertura and h.cierre;

  -- Código único de 6 caracteres
  for i in 1..20 loop
    v_codigo := '';
    for k in 1..6 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from puntuaciones where codigo = v_codigo);
    v_codigo := null;
  end loop;
  if v_codigo is null then raise exception 'no se pudo generar el código'; end if;

  insert into puntuaciones (nick, puntos, nivel, duracion_s, aciertos, codigo, cuenta)
  values (v_nick, p_puntos, greatest(p_nivel, 1), p_duracion, coalesce(p_aciertos, 0), v_codigo, v_cuenta)
  returning id into v_id;

  -- Posición en el podio de HOY (mejor partida de este nick hoy)
  select puesto, puntos, aciertos, (id = v_id) as es_esta into v_mejor
    from podio_dia where dia = v_dia and lower(nick) = lower(v_nick);
  select count(*) into v_total from mejores_dia where dia = v_dia;
  select coalesce(json_agg(t), '[]'::json) into v_top from (
    select nick, puntos, aciertos from podio_dia where dia = v_dia and puesto <= 3 order by puesto) t;

  return json_build_object(
    'codigo', v_codigo, 'cuenta', v_cuenta, 'dia', v_dia,
    'posicion', v_mejor.puesto, 'total', v_total,
    'mejor', v_mejor.puntos, 'mejor_aciertos', v_mejor.aciertos, 'es_la_mejor', coalesce(v_mejor.es_esta, false),
    'top3', v_top);
end $$;

-- ---------------------------------------------------------------------------
--  Función: ranking público.  p_modo = 'hoy' (podio del día) o 'general'
-- ---------------------------------------------------------------------------
create function public.ranking_top(p_n int default 10, p_modo text default 'hoy')
returns json
language plpgsql security definer set search_path = public stable
as $$
declare v json; v_dia date := (now() at time zone 'Europe/Madrid')::date; n int := least(greatest(p_n, 1), 50);
begin
  if p_modo = 'general' then
    select coalesce(json_agg(t), '[]'::json) into v from (
      select nick, puntos, aciertos, nivel, dia from mejores_general
       order by puntos desc, aciertos desc, creado asc limit n) t;
  else
    select coalesce(json_agg(t), '[]'::json) into v from (
      select nick, puntos, aciertos, nivel, dia from podio_dia
       where dia = v_dia order by puesto limit n) t;
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
--  Funciones para el personal (exigen la clave)
-- ---------------------------------------------------------------------------
-- Define o cambia la clave. Solo se puede ejecutar desde el SQL Editor (no desde la web):
--     select definir_clave('UnaClaveLargaYSecreta');
create or replace function public.definir_clave(p_clave text)
returns void
language sql security definer set search_path = public
as $$
  update ajustes set clave_hash = encode(sha256(convert_to(p_clave, 'utf8')), 'hex') where id = 1;
$$;

create or replace function public.comprobar_clave(p_clave text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from ajustes where id = 1 and clave_hash is not null
                 and clave_hash = encode(sha256(convert_to(coalesce(p_clave, ''), 'utf8')), 'hex')) then
    perform pg_sleep(1.5);                      -- frena los intentos de adivinar la clave
    raise exception 'clave incorrecta';
  end if;
end $$;

-- Ganadores del día (por defecto hoy), con su estado de entrega
create function public.ganadores_dia(p_clave text, p_dia date default null)
returns json
language plpgsql security definer set search_path = public
as $$
declare v json; v_dia date := coalesce(p_dia, (now() at time zone 'Europe/Madrid')::date);
begin
  perform comprobar_clave(p_clave);
  select coalesce(json_agg(t), '[]'::json) into v from (
    select puesto, nick, puntos, aciertos, entregado from podio_dia
     where dia = v_dia and puesto <= 10 order by puesto) t;
  return json_build_object('dia', v_dia, 'ganadores', v,
    'entregados', (select count(*) from podio_dia where dia = v_dia and entregado));
end $$;

-- Comprueba un código y, si p_entregar = true y es ganador, lo marca como entregado
create function public.verificar_codigo(p_clave text, p_codigo text, p_entregar boolean default false)
returns json
language plpgsql security definer set search_path = public
as $$
declare r puntuaciones%rowtype; pd record; v_ganador boolean := false; v_suplente boolean := false; v_entregados int;
begin
  perform comprobar_clave(p_clave);
  select * into r from puntuaciones where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then return json_build_object('encontrado', false); end if;
  select puesto into pd from podio_dia where id = r.id;       -- solo la mejor partida de ese nick ese día
  select count(*) into v_entregados from podio_dia where dia = r.dia and entregado;
  -- Ganador: puestos 1-3. Suplente: puestos 4-10, solo si ese día aún no se han entregado los 3 premios
  v_ganador  := r.cuenta and pd.puesto is not null and pd.puesto <= 3;
  v_suplente := r.cuenta and pd.puesto is not null and pd.puesto between 4 and 10 and v_entregados < 3;
  if p_entregar and (v_ganador or v_suplente) and not r.entregado then
    update puntuaciones set entregado = true, entregado_en = now() where id = r.id;
    r.entregado := true; v_entregados := v_entregados + 1;
  end if;
  return json_build_object('encontrado', true, 'nick', r.nick, 'puntos', r.puntos, 'aciertos', r.aciertos,
    'nivel', r.nivel, 'dia', r.dia, 'cuenta', r.cuenta, 'puesto', pd.puesto,
    'es_ganador', v_ganador, 'es_suplente', v_suplente, 'entregado', r.entregado, 'entregados_dia', v_entregados);
end $$;

-- ---------------------------------------------------------------------------
--  Permisos: por defecto nadie puede ejecutar nada; se concede solo lo necesario
-- ---------------------------------------------------------------------------
revoke all on function public.estado_concurso()                           from public, anon, authenticated;
revoke all on function public.enviar_puntuacion(text, int, int, int, int) from public, anon, authenticated;
revoke all on function public.ranking_top(int, text)                      from public, anon, authenticated;
revoke all on function public.definir_clave(text)                         from public, anon, authenticated;
revoke all on function public.comprobar_clave(text)                       from public, anon, authenticated;
revoke all on function public.ganadores_dia(text, date)                   from public, anon, authenticated;
revoke all on function public.verificar_codigo(text, text, boolean)       from public, anon, authenticated;

grant execute on function public.estado_concurso()                           to anon;
grant execute on function public.enviar_puntuacion(text, int, int, int, int) to anon;
grant execute on function public.ranking_top(int, text)                      to anon;
grant execute on function public.ganadores_dia(text, date)                   to anon;
grant execute on function public.verificar_codigo(text, text, boolean)       to anon;

-- ---------------------------------------------------------------------------
--  DESPUÉS DE EJECUTAR ESTE ARCHIVO (consultas sueltas, adaptando los valores)
-- ---------------------------------------------------------------------------
--  1) Clave del personal para verificar.html (NO la guardes en este archivo ni en GitHub):
--       select definir_clave('PON-AQUI-TU-CLAVE');
--  2) Horario: ya está cargado el de SIMO 26 (arriba). Para cambiar o añadir un día:
--       insert into horario (dia, apertura, cierre) values ('2026-11-13', '10:00', '14:00')
--         on conflict (dia) do update set apertura = excluded.apertura, cierre = excluded.cierre;
--     Para quitar un día:  delete from horario where dia = '2026-11-13';
--  3) Ver ganadores:               select * from ganadores;
--  4) Exportar a Excel:            Table editor > puntuaciones > Export > CSV
--  5) Borrar pruebas antes de la feria:   truncate table puntuaciones restart identity;
