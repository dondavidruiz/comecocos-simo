/* ============================================================================
 *  Interfaz: portada, formulario, controles táctiles/teclado, preguntas y resultados.
 *  Une los módulos: Juego (motor), Preguntas, Almacen y Sonido.
 * ========================================================================== */
(function () {
  'use strict';
  const CFG = window.SIMO_CONFIG;
  const $ = (id) => document.getElementById(id);
  let jugador = { nick: '', email: '', consentimiento: false };
  let temporizadorFin = null, preguntaAbierta = null, ocultaDesde = 0;

  /* ------------------------------ pantallas ------------------------------ */
  function mostrar(id) {
    document.querySelectorAll('.pantalla').forEach((p) => p.classList.toggle('activa', p.id === id));
    if (id === 'pantalla-juego') { setTimeout(Juego.redimensionar, 30); setTimeout(Juego.redimensionar, 300); }
    clearTimeout(temporizadorFin);
    if (id === 'pantalla-fin') reiniciarTemporizadorFin();
  }
  function reiniciarTemporizadorFin() {
    clearTimeout(temporizadorFin);
    if (!$('pantalla-fin').classList.contains('activa')) return;
    temporizadorFin = setTimeout(volverAPortada, CFG.SEGUNDOS_PANTALLA_FINAL * 1000);
  }
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, reiniciarTemporizadorFin, { passive: true }));

  function volverAPortada() {
    $('form-inicio').reset();
    actualizarConsentimiento();
    $('error-form').hidden = true;
    jugador = { nick: '', email: '', consentimiento: false };
    mostrar('pantalla-inicio');
    document.querySelector('#pantalla-inicio .scroll').scrollTop = 0;
  }

  /* ------------------------------ portada ------------------------------- */
  function actualizarConsentimiento() {
    const hayCorreo = $('email').value.trim().length > 0;
    $('fila-consent').style.opacity = hayCorreo ? '1' : '.5';
    if (!hayCorreo) $('consent').checked = false;
  }
  $('email').addEventListener('input', actualizarConsentimiento);

  function errorForm(msg) { const e = $('error-form'); e.textContent = msg; e.hidden = !msg; }

  $('form-inicio').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const nick = $('nick').value.trim().replace(/\s+/g, ' '), email = $('email').value.trim();
    let msg = Almacen.validarNick(nick) || Almacen.validarEmail(email);
    if (!msg && email && !$('consent').checked) msg = 'Para usar tu correo debes aceptar la información de protección de datos.';
    if (msg) { errorForm(msg); return; }
    errorForm('');
    jugador = { nick, email, consentimiento: !!email && $('consent').checked };
    Sonido.activar(); Sonido.clic();
    if (Preguntas.total === 0) Preguntas.cargar(CFG.PREGUNTAS_URL);
    mostrar('pantalla-juego');
    Juego.nuevaPartida();
  });

  function abrirModal(id, v) { $(id).hidden = !v; }
  $('abrir-legal').addEventListener('click', (e) => { e.preventDefault(); abrirModal('modal-legal', true); });
  $('cerrar-legal').addEventListener('click', () => abrirModal('modal-legal', false));

  /* -------------------------------- HUD ---------------------------------- */
  function hud(d) {
    $('hud-puntos').textContent = d.puntos;
    $('hud-nivel').textContent = d.nivel;
    const v = $('hud-vidas');
    v.innerHTML = '';
    for (let i = 0; i < Math.max(0, d.vidas); i++) { const s = document.createElement('i'); s.className = 'vida'; v.appendChild(s); }
    v.setAttribute('aria-label', d.vidas + ' vidas');
  }

  /* ------------------------------ controles ------------------------------- */
  document.querySelectorAll('.dp[data-d]').forEach((b) => {
    const d = +b.dataset.d;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); Juego.setDir(d); b.classList.add('pulsado');
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => b.classList.remove('pulsado')));
  });

  const TECLAS = { ArrowUp: 0, ArrowLeft: 1, ArrowDown: 2, ArrowRight: 3, w: 0, a: 1, s: 2, d: 3, W: 0, A: 1, S: 2, D: 3 };
  document.addEventListener('keydown', (e) => {
    if (preguntaAbierta) {                                    // responder con 1-4 / A-D
      const k = e.key.toLowerCase(), i = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
      if (i >= 0 && k.length === 1) { preguntaAbierta.responder(i); e.preventDefault(); }
      return;
    }
    if (!$('pantalla-juego').classList.contains('activa')) return;
    if (e.key in TECLAS) { Juego.setDir(TECLAS[e.key]); e.preventDefault(); }
    else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') pausar();
  });

  // Deslizar el dedo sobre el tablero
  (function swipe() {
    const wrap = $('lienzo-wrap'); let ini = null;
    wrap.addEventListener('pointerdown', (e) => { ini = { x: e.clientX, y: e.clientY }; });
    wrap.addEventListener('pointermove', (e) => {
      if (!ini) return;
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
      Juego.setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 2 : 0));
      ini = { x: e.clientX, y: e.clientY };
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => wrap.addEventListener(ev, () => { ini = null; }));
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  })();
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  /* ------------------------------- sonido -------------------------------- */
  function iconoSonido() { $('btn-sonido').textContent = Sonido.silenciado ? '🔇' : '🔊'; }
  $('btn-sonido').addEventListener('click', () => { Sonido.activar(); Sonido.silenciar(!Sonido.silenciado); iconoSonido(); });
  iconoSonido();

  /* -------------------------------- pausa -------------------------------- */
  function pausar() {
    if (!$('pantalla-juego').classList.contains('activa') || preguntaAbierta || Juego.estado === 'fin') return;
    Juego.pausar(); abrirModal('modal-pausa', true);
  }
  $('btn-continuar').addEventListener('click', () => { abrirModal('modal-pausa', false); Sonido.activar(); Juego.reanudar(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ocultaDesde = performance.now(); pausar(); }
    else if (ocultaDesde && preguntaAbierta) { preguntaAbierta.compensar(performance.now() - ocultaDesde); }
  });

  /* ------------------------------- preguntas ------------------------------ */
  function preguntar(resolver) {
    const q = Preguntas.siguiente();
    if (!q) { resolver(false); return; }
    const total = CFG.TIEMPO_PREGUNTA * 1000;
    let t0 = performance.now(), contestada = false, ultimoTic = 99;
    $('pregunta-texto').textContent = q.texto;
    $('dato').hidden = true;
    const cont = $('opciones'); cont.innerHTML = '';
    const botones = q.opciones.map((o, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opcion';
      b.innerHTML = '<span class="letra">' + 'ABCD'[i] + '</span><span></span>';
      b.lastChild.textContent = o.texto;
      b.addEventListener('click', () => responder(i));
      cont.appendChild(b); return b;
    });
    abrirModal('modal-pregunta', true);
    $('barra').style.transform = 'scaleX(1)';

    function responder(i) {
      if (contestada) return;
      contestada = true; clearInterval(reloj);
      const ok = i >= 0 && !!q.opciones[i].correcta;
      botones.forEach((b, k) => {
        b.disabled = true;
        if (q.opciones[k].correcta) b.classList.add('correcta');
        else if (k === i) b.classList.add('incorrecta');
        else b.classList.add('apagada');
      });
      if (i < 0) $('seg').textContent = '¡Tiempo!';
      ok ? Sonido.acierto() : Sonido.fallo();
      const d = $('dato');
      d.innerHTML = '<b>' + (ok ? '✅ ¡Correcto! Sigues jugando.' : (i < 0 ? '⏱ Se acabó el tiempo.' : '❌ Respuesta incorrecta.') + ' Pierdes una vida.') + '</b>';
      if (q.dato) d.appendChild(document.createTextNode('💡 ' + q.dato));
      d.hidden = false;
      setTimeout(() => {
        abrirModal('modal-pregunta', false); preguntaAbierta = null;
        resolver(ok);
      }, q.dato ? 3000 : 2000);
    }
    const reloj = setInterval(() => {
      if (document.hidden) return;
      const restante = total - (performance.now() - t0);
      if (restante <= 0) { responder(-1); return; }
      $('barra').style.transform = 'scaleX(' + (restante / total).toFixed(3) + ')';
      const s = Math.ceil(restante / 1000);
      $('seg').textContent = s;
      if (s <= 5 && s !== ultimoTic) { ultimoTic = s; Sonido.tic(); }
    }, 100);
    $('seg').textContent = CFG.TIEMPO_PREGUNTA;
    preguntaAbierta = { responder, compensar: (ms) => { t0 += ms; } };
  }

  /* ------------------------------- resultados ------------------------------ */
  const MEDALLAS = ['🥇', '🥈', '🥉'];
  function enmascarar(e) { const [u, d] = e.split('@'); return u[0] + '***@' + d; }
  function pintarTop3(lista) {
    const ol = $('fin-top3'); ol.innerHTML = '';
    (lista || []).slice(0, 3).forEach((p, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="medalla">' + MEDALLAS[i] + '</span><span class="nombre"></span><span class="pts"></span>';
      li.querySelector('.nombre').textContent = p.nick + (p.correo ? ' ✉️' : '');
      li.querySelector('.pts').textContent = p.puntos;
      ol.appendChild(li);
    });
    if (!lista || !lista.length) ol.innerHTML = '<li>Aún no hay puntuaciones</li>';
  }

  async function fin(est) {
    mostrar('pantalla-fin');
    $('fin-nick').textContent = jugador.nick;
    $('fin-puntos').textContent = est.puntos;
    $('fin-nivel').textContent = est.nivel;
    $('fin-posicion').textContent = 'Calculando tu posición…';
    $('fin-top3').innerHTML = '';
    $('fin-premio').textContent = '';
    Sonido.finJuego();
    const res = await Almacen.enviar({ nick: jugador.nick, email: jugador.email, puntos: est.puntos, nivel: est.nivel, duracion: est.duracion, consentimiento: jugador.consentimiento });
    const pos = $('fin-posicion');
    if (res.error) pos.textContent = 'No se pudo guardar tu puntuación (' + res.error + ').';
    else if (res.pendiente) pos.textContent = '📡 Sin conexión: tu puntuación se enviará automáticamente cuando vuelva internet.';
    else {
      pos.innerHTML = 'Tu posición: <b>#' + res.posicion + '</b> de ' + res.total + ' jugadores';
      if (res.mejor > est.puntos) pos.innerHTML += '<br><small>(Tu mejor puntuación es ' + res.mejor + ')</small>';
      pintarTop3(res.top3);
    }
    $('fin-premio').textContent = jugador.email
      ? '✉️ Estás participando en el concurso. Si al terminar la feria estás entre los tres primeros con correo, escribiremos a ' + enmascarar(jugador.email) + ' para enviarte el premio.'
      : 'Esta partida no opta al premio porque no dejaste correo. Puedes volver a jugar e introducirlo.';
  }
  $('btn-repetir').addEventListener('click', volverAPortada);

  /* -------------------------------- arranque ------------------------------- */
  Juego.init($('lienzo'), { hud, pregunta: preguntar, fin });
  Preguntas.cargar(CFG.PREGUNTAS_URL);
  Almacen.reintentarPendientes();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin PWA, no pasa nada */ });
  }
})();
