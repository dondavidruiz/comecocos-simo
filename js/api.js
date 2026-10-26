/* ============================================================================
 *  Almacén de puntuaciones. NO se guardan datos personales: solo nick, puntos,
 *  nivel, respuestas acertadas y un código de partida.
 *   · Con SUPABASE_URL configurado: guarda en Supabase llamando a funciones SQL.
 *   · Sin configurar: MODO LOCAL en localStorage (solo para pruebas).
 *   · Si falla la red, la partida se guarda en una cola local y se reintenta sola
 *     (en ese caso el código solo se genera cuando el servidor la recibe).
 * ========================================================================== */
(function (global) {
  'use strict';
  const CFG = global.SIMO_CONFIG;
  const CLAVE_LOCAL = 'simo26_local_scores_v2', CLAVE_COLA = 'simo26_pendientes_v2';
  const remoto = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

  const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio / modo privado */ } };

  /* ------------------------------- validaciones ------------------------------ */
  const FUERTES = /(mierda|gilipollas|cabron|follar|hitler|maricon|subnormal|imbecil|pendejo|porno|negrata|sudaca|violador|pedofil|nigger|fuck|bitch|capullo|cojones)/;
  const CORTAS = /^(puta|puto|polla|culo|zorra|joder|jodete|cono|nazi|verga|tetas|marica|cagar|shit|cunt|dick|mongolo|bollera|retrasado|follo)[a-z]{0,3}$/;
  function normalizarNick(n) {
    const mapa = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't' };
    return n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin tildes (ñ→n)
      .replace(/[013457@$]/g, (c) => mapa[c]).replace(/[^a-z]/g, '');
  }
  function validarNick(n) {
    n = (n || '').trim();
    if (n.length < 2 || n.length > 14) return 'El nickname debe tener entre 2 y 14 caracteres.';
    if (!/^[\p{L}\p{N} _.\-]+$/u.test(n)) return 'Usa solo letras, números, espacios, guion o punto.';
    const x = normalizarNick(n);
    if (FUERTES.test(x) || CORTAS.test(x)) return 'Ese nickname no está permitido. Elige otro.';
    return '';
  }

  /* --------------------------------- modo local ------------------------------ */
  const diaHoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());   // AAAA-MM-DD
  const mejor = (a, b) => b.puntos > a.puntos || (b.puntos === a.puntos && (b.aciertos > a.aciertos || (b.aciertos === a.aciertos && b.creado < a.creado)));
  function mejoresLocal(dia) {
    const m = new Map();
    leer(CLAVE_LOCAL, []).filter((p) => !dia || p.dia === dia).forEach((p) => {
      const k = (dia ? p.dia + '|' : '') + p.nick.toLowerCase(), a = m.get(k);
      if (!a || mejor(a, p)) m.set(k, p);
    });
    return [...m.values()].sort((a, b) => (mejor(a, b) ? 1 : -1));
  }
  function codigoLocal() {
    const al = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = '';
    for (let i = 0; i < 6; i++) c += al[Math.floor(Math.random() * al.length)];
    return c;
  }
  function enviarLocal(d) {
    const todas = leer(CLAVE_LOCAL, []), dia = diaHoy();
    const reg = { id: Date.now() + Math.random(), creado: Date.now(), dia, nick: d.nick, puntos: d.puntos, nivel: d.nivel, aciertos: d.aciertos || 0, codigo: codigoLocal() };
    todas.push(reg); guardar(CLAVE_LOCAL, todas);
    const mej = mejoresLocal(dia), yo = mej.find((p) => p.nick.toLowerCase() === d.nick.toLowerCase());
    return {
      codigo: reg.codigo, cuenta: true, dia, posicion: mej.indexOf(yo) + 1, total: mej.length,
      mejor: yo.puntos, mejor_aciertos: yo.aciertos, es_la_mejor: yo.id === reg.id,
      top3: mej.slice(0, 3).map((p) => ({ nick: p.nick, puntos: p.puntos, aciertos: p.aciertos }))
    };
  }

  /* -------------------------------- modo remoto ------------------------------ */
  async function rpc(nombre, cuerpo) {
    const r = await fetch(CFG.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + nombre, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY },
      body: JSON.stringify(cuerpo || {})
    });
    if (!r.ok) {
      let msg = ''; try { msg = (await r.json()).message || ''; } catch (e) { /* sin cuerpo */ }
      const err = new Error(msg || 'HTTP ' + r.status); err.http = r.status; throw err;
    }
    return r.json();
  }
  const aPeticion = (d) => ({ p_nick: d.nick, p_puntos: d.puntos, p_nivel: d.nivel, p_duracion: d.duracion, p_aciertos: d.aciertos || 0 });

  /* ------------------------------------ API ---------------------------------- */
  const Almacen = {
    remoto, validarNick, llamar: rpc,
    /* Devuelve { codigo, cuenta, posicion, total, top3, ... } — nunca rechaza.
       Si no hay red hace hasta `intentos` intentos (cada 4 s) y, si no hay forma, deja la partida en cola. */
    async enviar(d, intentos) {
      intentos = intentos || 1;
      for (let i = 1; i <= intentos; i++) {
        try {
          const res = remoto ? await rpc('enviar_puntuacion', aPeticion(d)) : enviarLocal(d);
          this.reintentarPendientes();
          return res;
        } catch (e) {
          if (e.http && e.http < 500) return { error: e.message };      // rechazo del servidor (nick no permitido, etc.)
          if (i < intentos) await new Promise((r) => setTimeout(r, 4000));   // sin red o servidor caído: reintenta
        }
      }
      const cola = leer(CLAVE_COLA, []); cola.push(d); guardar(CLAVE_COLA, cola);
      return { pendiente: true };
    },
    /* modo: 'hoy' (podio del día) o 'general' */
    async ranking(n, modo) {
      modo = modo || 'hoy';
      if (!remoto) return mejoresLocal(modo === 'hoy' ? diaHoy() : null).slice(0, n || 10);
      return rpc('ranking_top', { p_n: n || 10, p_modo: modo });
    },
    /* { abierto, apertura, cierre, hoy } — si no se puede consultar, se asume abierto */
    async estado() {
      if (!remoto) return { abierto: true, hoy: diaHoy(), apertura: '', cierre: '', local: true };
      try { return await rpc('estado_concurso'); } catch (e) { return null; }
    },
    get pendientes() { return leer(CLAVE_COLA, []).length; },
    async reintentarPendientes() {
      if (!remoto) return;
      const cola = leer(CLAVE_COLA, []);
      if (!cola.length) return;
      const resto = [];
      for (const d of cola) {
        try { await rpc('enviar_puntuacion', aPeticion(d)); }
        catch (e) { if (!e.http || e.http >= 500) resto.push(d); /* si el servidor la rechaza, se descarta */ }
      }
      guardar(CLAVE_COLA, resto);
    }
  };
  global.addEventListener('online', () => Almacen.reintentarPendientes());
  global.Almacen = Almacen;
})(window);
