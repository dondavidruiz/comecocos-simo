/* ============================================================================
 *  Almacén de puntuaciones.
 *   · Con SUPABASE_URL configurado: guarda en Supabase llamando a dos funciones SQL
 *     (enviar_puntuacion y ranking_top). El correo nunca vuelve al navegador.
 *   · Sin configurar: MODO LOCAL en localStorage (solo para pruebas).
 *   · Si falla la red, la partida se guarda en una cola local y se reintenta sola.
 * ========================================================================== */
(function (global) {
  'use strict';
  const CFG = global.SIMO_CONFIG;
  const CLAVE_LOCAL = 'simo26_local_scores', CLAVE_COLA = 'simo26_pendientes';
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
  function validarEmail(e) {
    e = (e || '').trim();
    if (!e) return '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120 ? '' : 'El correo no parece válido.';
  }

  /* --------------------------------- modo local ------------------------------ */
  function mejoresLocal() {
    const todas = leer(CLAVE_LOCAL, []), m = new Map();
    todas.forEach((p) => {
      const clave = p.email ? p.email.toLowerCase() : 'anon-' + p.id;
      const a = m.get(clave);
      if (!a || p.puntos > a.puntos || (p.puntos === a.puntos && p.creado < a.creado)) m.set(clave, p);
    });
    return [...m.values()].sort((a, b) => b.puntos - a.puntos || a.creado - b.creado);
  }
  function enviarLocal(d) {
    const todas = leer(CLAVE_LOCAL, []);
    const id = Date.now() + Math.random();
    todas.push({ id, creado: Date.now(), nick: d.nick, email: d.email || null, puntos: d.puntos, nivel: d.nivel });
    guardar(CLAVE_LOCAL, todas);
    const mej = mejoresLocal();
    const clave = d.email ? d.email.toLowerCase() : 'anon-' + id;
    const yo = mej.find((p) => (p.email ? p.email.toLowerCase() : 'anon-' + p.id) === clave);
    return {
      posicion: mej.filter((p) => p.puntos > yo.puntos).length + 1, total: mej.length, mejor: yo.puntos,
      top3: mej.slice(0, 3).map((p) => ({ nick: p.nick, puntos: p.puntos, correo: !!p.email }))
    };
  }

  /* -------------------------------- modo remoto ------------------------------ */
  async function rpc(nombre, cuerpo) {
    const r = await fetch(CFG.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + nombre, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY },
      body: JSON.stringify(cuerpo)
    });
    if (!r.ok) {
      let msg = ''; try { msg = (await r.json()).message || ''; } catch (e) { /* sin cuerpo */ }
      const err = new Error(msg || 'HTTP ' + r.status); err.http = r.status; throw err;
    }
    return r.json();
  }
  const aPeticion = (d) => ({
    p_nick: d.nick, p_email: d.email || null, p_puntos: d.puntos, p_nivel: d.nivel, p_duracion: d.duracion, p_consentimiento: !!d.consentimiento
  });

  /* ------------------------------------ API ---------------------------------- */
  const Almacen = {
    remoto, validarNick, validarEmail,
    /* Devuelve { posicion, total, top3, pendiente? } — nunca rechaza: si no hay red, encola. */
    async enviar(d) {
      try {
        const res = remoto ? await rpc('enviar_puntuacion', aPeticion(d)) : enviarLocal(d);
        this.reintentarPendientes();
        return res;
      } catch (e) {
        const sinRed = !e.http || e.http >= 500;
        if (sinRed) {
          const cola = leer(CLAVE_COLA, []); cola.push(d); guardar(CLAVE_COLA, cola);
          return { pendiente: true };
        }
        return { error: e.message };      // rechazo del servidor (nick no permitido, etc.)
      }
    },
    async ranking(n) {
      if (!remoto) return mejoresLocal().slice(0, n || 10).map((p) => ({ nick: p.nick, puntos: p.puntos, nivel: p.nivel, correo: !!p.email }));
      return rpc('ranking_top', { p_n: n || 10 });
    },
    get pendientes() { return leer(CLAVE_COLA, []).length; },
    async reintentarPendientes() {
      if (!remoto) return;
      let cola = leer(CLAVE_COLA, []);
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
