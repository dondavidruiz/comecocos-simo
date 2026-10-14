/* ============================================================================
 *  Motor del juego (estilo comecocos clásico)  ·  Formación Educacyl - SIMO 26
 *  ----------------------------------------------------------------------------
 *  - Coordenadas en "casillas": el centro de la casilla (c,r) es (c,r).
 *  - Direcciones: 0 = arriba, 1 = izquierda, 2 = abajo, 3 = derecha, -1 = parado.
 *  - Todo se dibuja en un lienzo lógico de 448x496 que se escala a la pantalla.
 *  - Este módulo no toca el HTML: se comunica con la interfaz mediante callbacks
 *    (hud, pregunta, fin) que le pasa ui.js.
 * ========================================================================== */
(function (global) {
  'use strict';

  const T = 16, COLS = 28, ROWS = 31, W = COLS * T, H = ROWS * T;
  const DX = [0, -1, 0, 1], DY = [-1, 0, 1, 0];
  const BASE = 8.6;            // casillas por segundo al 100 % de velocidad
  const FILA_TUNEL = 14;
  const VIDAS_INICIALES = 3;   // la que juega + 2 extra
  const TIEMPO_INVULNERABLE = 3;
  const PUERTA = { x: 13, y: 11 };   // casilla justo encima de la puerta de la casa

  /* ----------------------------- tablas por nivel --------------------------- */
  const FRUTAS = [['cereza', 100], ['fresa', 300], ['naranja', 500], ['naranja', 500], ['manzana', 700],
    ['manzana', 700], ['melon', 1000], ['melon', 1000], ['estrella', 2000], ['estrella', 2000],
    ['campana', 3000], ['campana', 3000], ['llave', 5000]];
  const DUR_SUSTO = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];
  const fFruta = (n) => FRUTAS[Math.min(n, 13) - 1];
  const durSusto = (n) => (n > 18 ? 0 : DUR_SUSTO[n - 1]);
  const fPac = (n) => (n === 1 ? 0.8 : n <= 4 ? 0.9 : n <= 20 ? 1.0 : 0.9);
  const fPacSusto = (n) => (n === 1 ? 0.9 : n <= 4 ? 0.95 : 1.0);
  const fFan = (n) => (n === 1 ? 0.75 : n <= 4 ? 0.85 : 0.95);
  const fSusto = (n) => (n === 1 ? 0.5 : n <= 4 ? 0.55 : 0.6);
  const fTunel = (n) => (n === 1 ? 0.4 : n <= 4 ? 0.45 : 0.5);
  function umbralesElroy(n) {
    return n === 1 ? [20, 10] : n === 2 ? [30, 15] : n <= 5 ? [40, 20] : n <= 8 ? [50, 25] : [60, 30];
  }
  function calendarioModos(n) {   // segundos: scatter, chase, scatter, chase...
    if (n === 1) return [7, 20, 7, 20, 5, 20, 5, Infinity];
    if (n <= 4) return [7, 20, 7, 20, 5, 1033, 0.02, Infinity];
    return [5, 20, 5, 20, 5, 1037, 0.02, Infinity];
  }
  // Fantasmas que salen según los puntos comidos: [Pinky, Inky, Clyde]
  function limitesSalida(n) { return n === 1 ? [0, 30, 60] : n === 2 ? [0, 0, 50] : [0, 0, 0]; }

  const FANTASMAS = [
    { id: 'blinky', color: '#ff2a2a', esquina: [25, -2], casa: [13.5, 11], salida: 0 },
    { id: 'pinky',  color: '#ffb8de', esquina: [2, -2],  casa: [13.5, 14], salida: 1 },
    { id: 'inky',   color: '#00e5ff', esquina: [27, 32], casa: [11.5, 14], salida: 2 },
    { id: 'clyde',  color: '#ffb852', esquina: [0, 32],  casa: [15.5, 14], salida: 3 }
  ];

  /* --------------------------------- estado --------------------------------- */
  let canvas, ctx, escala = 1, cb = {};
  let lab = null, muro, puerta, pellets, distMeta, mazeCache = null, mazeCacheFlash = null;
  let estado = 'inicio', estadoT = 0, pausado = false, raf = 0, ultimo = 0, reloj = 0;
  let nivel = 1, puntos = 0, vidas = VIDAS_INICIALES, vidaExtraDada = false;
  let comidos = 0, totalPellets = 0, restantes = 0, sinComer = 0, ultimaSalida = 0;
  let tiempoNivel = 0, tiempoPartida = 0, inicioPartida = 0;
  let modoIdx = 0, modoT = 0, asustadoT = 0, comboFantasmas = 0, ultimoSonidoWaka = 0;
  let pac, fantasmas = [], fruta = null, popups = [], frutasSalidas = 0;
  let finEnviado = false, invulnerable = 0, ultimoCapturador = -1, aciertos = 0;

  /* ------------------------------- utilidades ------------------------------- */
  const rnd = (n) => Math.floor(Math.random() * n);
  const inver = (d) => (d + 2) % 4;
  function libre(c, r) {
    if (r === FILA_TUNEL && (c < 0 || c >= COLS)) return true;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    return !muro[r][c] && !puerta[r][c];
  }

  function cargarLaberinto(def) {
    lab = def;
    muro = []; puerta = []; pellets = [];
    totalPellets = 0;
    for (let r = 0; r < ROWS; r++) {
      muro.push([]); puerta.push([]); pellets.push([]);
      for (let c = 0; c < COLS; c++) {
        const ch = def.filas[r][c];
        muro[r][c] = ch === '#';
        puerta[r][c] = ch === '-';
        pellets[r][c] = ch === '.' ? 1 : ch === 'o' ? 2 : 0;
        if (pellets[r][c]) totalPellets++;
      }
    }
    restantes = totalPellets;
    // Mapa de distancias a la puerta (para los fantasmas "ojos" que vuelven a casa)
    distMeta = [];
    for (let r = 0; r < ROWS; r++) distMeta.push(new Array(COLS).fill(1e9));
    const cola = [[PUERTA.x, PUERTA.y]]; distMeta[PUERTA.y][PUERTA.x] = 0;
    while (cola.length) {
      const [c, r] = cola.shift();
      for (let d = 0; d < 4; d++) {
        let nc = c + DX[d]; const nr = r + DY[d];
        if (r === FILA_TUNEL) { if (nc < 0) nc = COLS - 1; else if (nc >= COLS) nc = 0; }
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS || muro[nr][nc] || puerta[nr][nc]) continue;
        if (distMeta[nr][nc] > distMeta[r][c] + 1) { distMeta[nr][nc] = distMeta[r][c] + 1; cola.push([nc, nr]); }
      }
    }
    mazeCache = null; mazeCacheFlash = null;
  }
  const laberintoDeNivel = (n) => global.LABERINTOS[Math.floor((n - 1) / 2) % global.LABERINTOS.length];

  /* ----------------------------- inicio de nivel ---------------------------- */
  function prepararNivel(conIntro) {
    cargarLaberinto(laberintoDeNivel(nivel));
    comidos = 0; sinComer = 0; ultimaSalida = 0; frutasSalidas = 0; fruta = null; popups = [];
    modoIdx = 0; modoT = calendarioModos(nivel)[0]; asustadoT = 0; comboFantasmas = 0;
    tiempoNivel = 0; invulnerable = 0; ultimoCapturador = -1;
    colocarEntidades();
    if (cb.hud) cb.hud(datosHud());
    setEstado('listo');
    if (global.Sonido) { global.Sonido.parar(); if (conIntro) global.Sonido.intro(); }
  }

  /* Pac-Man en la salida y los fantasmas en su casa (no toca los puntos del tablero) */
  function colocarEntidades() {
    const antes = pac ? pac.desired : -1;
    pac = { x: 13.5, y: 23, dir: 1, desired: antes, stall: 0, ultimaDir: 1, boca: 0, muerte: 0 };
    fantasmas = FANTASMAS.map((f, i) => ({
      i, def: f, x: f.casa[0], y: f.casa[1], y0: f.casa[1],
      dir: i === 0 ? 1 : 0, estado: i === 0 ? 'activo' : 'casa',
      asustado: false, invertir: false, fase: 0, bob: i * 1.3
    }));
  }

  /* Tras acertar la pregunta: se conserva el tablero tal cual (puntos comidos, marcador, vidas)
     pero se vuelve a empezar desde la salida, con los fantasmas otra vez en su casa. */
  function reaparecerEnLaSalida() {
    colocarEntidades();
    fruta = null; popups = []; comboFantasmas = 0; asustadoT = 0;
    modoIdx = 0; modoT = calendarioModos(nivel)[0];
    sinComer = 0; ultimaSalida = 0; ultimoCapturador = -1;
    global.Sonido && global.Sonido.parar();
    setEstado('listo');
    invulnerable = TIEMPO_INVULNERABLE;     // se descuenta cuando vuelve a jugarse
  }

  function setEstado(e) { estado = e; estadoT = 0; }
  function datosHud() { return { puntos, vidas, nivel, fruta: fFruta(nivel)[0] }; }

  /* -------------------------------- movimiento ------------------------------ */
  function distSiguienteCentro(e) {
    if (e.dir === 1 || e.dir === 3) {
      return e.dir === 3 ? Math.floor(e.x + 1e-7) + 1 - e.x : e.x - (Math.ceil(e.x - 1e-7) - 1);
    }
    return e.dir === 2 ? Math.floor(e.y + 1e-7) + 1 - e.y : e.y - (Math.ceil(e.y - 1e-7) - 1);
  }

  /* Mueve la entidad "dist" casillas. Cuando llega al centro de una casilla llama a elegir(). */
  function avanzar(e, dist, elegir) {
    let guardia = 0;
    while (dist > 1e-9 && guardia++ < 12) {
      const cx = Math.round(e.x), cy = Math.round(e.y);
      const centro = Math.abs(e.x - cx) < 1e-7 && Math.abs(e.y - cy) < 1e-7;
      if (centro) {
        e.x = cx; e.y = cy;
        if (cx < 0 || cx >= COLS) {          // casillas "fantasma" fuera del mapa: teletransporte
          if (cx < 0 && e.dir === 1) { e.x = COLS; continue; }
          if (cx >= COLS && e.dir === 3) { e.x = -1; continue; }
        } else {
          elegir(e, cx, cy);
        }
        if (e.dir < 0 || !libre(cx + DX[e.dir], cy + DY[e.dir])) { if (e.dir >= 0 && e === pac) e.dir = -1; break; }
        const paso = Math.min(dist, 1);
        e.x += DX[e.dir] * paso; e.y += DY[e.dir] * paso; dist -= paso;
        if (paso === 1) { e.x = Math.round(e.x); e.y = Math.round(e.y); }
      } else {
        if (e.dir < 0) { e.x = cx; e.y = cy; continue; }      // parado a medias: se recoloca en el centro
        const d = distSiguienteCentro(e);
        const paso = Math.min(dist, d);
        e.x += DX[e.dir] * paso; e.y += DY[e.dir] * paso; dist -= paso;
        if (paso >= d - 1e-9) { e.x = Math.round(e.x); e.y = Math.round(e.y); }
      }
    }
  }

  function elegirPac(e, cx, cy) {
    if (e.desired >= 0 && libre(cx + DX[e.desired], cy + DY[e.desired])) e.dir = e.desired;
    else if (e.dir >= 0 && !libre(cx + DX[e.dir], cy + DY[e.dir])) e.dir = -1;
    if (e.dir >= 0) e.ultimaDir = e.dir;
  }

  const SIN_SUBIR = { '12,11': 1, '15,11': 1, '12,23': 1, '15,23': 1 };

  function objetivoFantasma(g) {
    const p = { x: Math.round(pac.x), y: Math.round(pac.y) }, d = pac.ultimaDir;
    switch (g.def.id) {
      case 'blinky': return [p.x, p.y];
      case 'pinky': return [p.x + DX[d] * 4 + (d === 0 ? -4 : 0), p.y + DY[d] * 4];
      case 'inky': {
        const px = p.x + DX[d] * 2 + (d === 0 ? -2 : 0), py = p.y + DY[d] * 2;
        const b = fantasmas[0];
        return [2 * px - Math.round(b.x), 2 * py - Math.round(b.y)];
      }
      default: {  // clyde
        const dx = Math.round(g.x) - p.x, dy = Math.round(g.y) - p.y;
        return dx * dx + dy * dy > 64 ? [p.x, p.y] : g.def.esquina;
      }
    }
  }

  function enModoDispersion() { return modoIdx % 2 === 0; }

  function elegirFantasma(g, cx, cy) {
    if (g.estado === 'comido') {            // vuelve a casa por el camino más corto
      let mejor = -1, md = 1e9;
      for (let d = 0; d < 4; d++) {
        let nc = cx + DX[d]; const nr = cy + DY[d];
        if (!libre(nc, nr)) continue;
        if (nr === FILA_TUNEL) { if (nc < 0) nc = COLS - 1; else if (nc >= COLS) nc = 0; }
        const dm = distMeta[nr][nc];
        if (dm < md) { md = dm; mejor = d; }
      }
      if (cx === PUERTA.x && cy === PUERTA.y) { g.estado = 'entrando'; g.fase = 0; g.dir = -1; return; }
      g.dir = mejor; return;
    }
    if (g.invertir) {
      g.invertir = false;
      if (libre(cx + DX[inver(g.dir)], cy + DY[inver(g.dir)])) { g.dir = inver(g.dir); return; }
    }
    const opciones = [];
    for (let d = 0; d < 4; d++) {
      if (d === inver(g.dir)) continue;
      if (!libre(cx + DX[d], cy + DY[d])) continue;
      opciones.push(d);
    }
    if (!opciones.length) { g.dir = inver(g.dir); return; }
    if (g.asustado) { g.dir = opciones[rnd(opciones.length)]; return; }
    let objetivo;
    const elroy = g.def.id === 'blinky' && elroyEtapa() > 0;
    objetivo = (enModoDispersion() && !elroy) ? g.def.esquina : objetivoFantasma(g);
    const sinSubir = SIN_SUBIR[cx + ',' + cy];
    let mejor = -1, md = 1e12;
    for (const d of opciones) {                    // orden de desempate: arriba, izq., abajo, dcha.
      if (d === 0 && sinSubir) continue;
      const nx = cx + DX[d] - objetivo[0], ny = cy + DY[d] - objetivo[1];
      const dist = nx * nx + ny * ny;
      if (dist < md) { md = dist; mejor = d; }
    }
    g.dir = mejor >= 0 ? mejor : opciones[0];
  }

  function elroyEtapa() {
    const [u1, u2] = umbralesElroy(nivel);
    return restantes <= u2 ? 2 : restantes <= u1 ? 1 : 0;
  }

  function velocidadFantasma(g) {
    if (g.estado === 'comido' || g.estado === 'entrando') return BASE * 1.9;
    if (g.estado === 'saliendo') return BASE * 0.5;
    const enTunel = Math.abs(g.y - FILA_TUNEL) < 0.01 && (g.x < 5.5 || g.x > 22.5);
    if (enTunel) return BASE * fTunel(nivel);
    if (g.asustado) return BASE * fSusto(nivel);
    // La dificultad crece con el nivel y también con el tiempo de partida (hasta +12 %)
    const rampa = 1 + Math.min(0.12, tiempoPartida / 2500);
    let f = fFan(nivel);
    if (g.def.id === 'blinky') f += 0.05 * elroyEtapa();
    return BASE * f * rampa;
  }

  /* ------------------------------ lógica de juego --------------------------- */
  function cambiarModo() {
    modoIdx++;
    const cal = calendarioModos(nivel);
    modoT = cal[Math.min(modoIdx, cal.length - 1)];
    fantasmas.forEach((g) => { if (g.estado === 'activo') g.invertir = true; });
  }

  function asustar() {
    comboFantasmas = 0;
    const dur = durSusto(nivel);
    fantasmas.forEach((g) => {
      if (g.estado === 'comido' || g.estado === 'entrando') return;
      if (dur > 0) g.asustado = true;
      if (g.estado === 'activo') g.invertir = true;
    });
    if (dur > 0) { asustadoT = dur; global.Sonido && global.Sonido.asustado(true); }
  }

  function puntosMas(n) {
    puntos += n;
    if (!vidaExtraDada && puntos >= 10000) {     // vida extra a los 10.000 puntos, como el original
      vidaExtraDada = true; vidas++; popup('¡VIDA EXTRA!', 13.5, 17, '#7dff7d');
      global.Sonido && global.Sonido.vidaExtra();
    }
    if (cb.hud) cb.hud(datosHud());
  }

  function popup(texto, x, y, color) { popups.push({ texto, x, y, t: 1.2, color: color || '#00ffff' }); }

  function comer() {
    const tx = Math.round(pac.x), ty = Math.round(pac.y);
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return;
    const p = pellets[ty][tx];
    if (!p) return;
    pellets[ty][tx] = 0; restantes--; comidos++; sinComer = 0;
    if (p === 1) { puntosMas(10); pac.stall = 1 / 60; global.Sonido && global.Sonido.waka(); }
    else { puntosMas(50); pac.stall = 3 / 60; asustar(); global.Sonido && global.Sonido.pildora(); }
    if ((comidos === 70 || comidos === 170) && !fruta) {
      const f = fFruta(nivel); fruta = { tipo: f[0], puntos: f[1], x: 13.5, y: 17, t: 9.5 };
    }
  }

  function liberarFantasmas(h) {
    ultimaSalida += h;
    const lim = limitesSalida(nivel);
    const espera = nivel < 5 ? 4 : 3;
    for (let k = 1; k <= 3; k++) {
      const g = fantasmas[k];
      if (g.estado !== 'casa') continue;
      // el primero de la cola (por orden) es el único que puede salir
      if (comidos >= lim[k - 1] || sinComer > espera) {
        if (ultimaSalida >= 0.9 || (k === 1 && estadoT < 0.1)) {
          g.estado = 'saliendo'; g.fase = 0; ultimaSalida = 0; sinComer = 0;
        }
      }
      break;
    }
  }

  function moverGuion(g, h) {   // movimientos "de guion" dentro y alrededor de la casa
    const v = velocidadFantasma(g) * h;
    if (g.estado === 'saliendo') {
      if (g.fase === 0) {                                 // centrar en x y subir hasta la puerta
        const dx = 13.5 - g.x;
        if (Math.abs(dx) > 1e-6) { g.x += Math.sign(dx) * Math.min(Math.abs(dx), v); g.y += (14 - g.y) * 0.3; return; }
        g.x = 13.5; g.fase = 1;
      }
      if (g.fase === 1) {
        g.y -= v; if (g.y <= 11) { g.y = 11; g.fase = 2; }
        return;
      }
      if (g.fase === 2) {
        g.x -= v; if (g.x <= 13) { g.x = 13; g.estado = 'activo'; g.dir = 1; g.invertir = false; }
      }
    } else if (g.estado === 'entrando') {
      if (g.fase === 0) {
        g.x += Math.min(13.5 - g.x, v); if (g.x >= 13.5) g.fase = 1; return;
      }
      g.y += v; if (g.y >= 14) { g.y = 14; g.asustado = false; g.estado = 'saliendo'; g.fase = 0; ultimaSalida = 0.5; }
    }
  }

  function mover(h) {
    // Pac-Man
    if (pac.stall > 0) pac.stall -= h;
    else {
      const f = asustadoT > 0 ? fPacSusto(nivel) : fPac(nivel);
      avanzar(pac, BASE * f * h, elegirPac);
    }
    if (pac.dir >= 0 && pac.stall <= 0) pac.boca += h * 14;
    comer();
    // Fantasmas
    for (const g of fantasmas) {
      if (g.estado === 'casa') { g.bob += h * 6; g.y = g.y0 + Math.sin(g.bob) * 0.22; continue; }
      if (g.estado === 'saliendo' || g.estado === 'entrando') { moverGuion(g, h); continue; }
      avanzar(g, velocidadFantasma(g) * h, elegirFantasma);
    }
  }

  function colisiones() {
    for (const g of fantasmas) {
      if (g.estado !== 'activo') continue;
      const dx = g.x - pac.x, dy = g.y - pac.y;
      if (dx * dx + dy * dy > 0.42) continue;
      if (g.asustado) {                       // ¡le toca al fantasma!
        comboFantasmas++;
        const pts = 100 * Math.pow(2, comboFantasmas);
        puntosMas(pts);
        popup(String(pts), g.x, g.y);
        g.estado = 'comido'; g.asustado = false;
        global.Sonido && global.Sonido.comerFantasma();
        setEstado('congelado');
        return;
      }
      if (invulnerable > 0) continue;
      capturado(g);
      return;
    }
  }

  function capturado(g) {
    ultimoCapturador = g.i;
    setEstado('atrapado');
    if (global.Sonido) { global.Sonido.parar(); global.Sonido.atrapado(); }
  }

  /* ---- respuesta a la pregunta: acierto => reaparece en la salida sin perder vida; fallo => pierde una vida y reinicia el nivel ---- */
  function resolverPregunta(ok) {
    if (estado !== 'pregunta') return;
    if (ok) {
      aciertos++;
      reaparecerEnLaSalida();
    } else {
      vidas--;
      if (cb.hud) cb.hud(datosHud());
      pac.muerte = 0;
      setEstado('muerte');
      global.Sonido && global.Sonido.morir();
    }
  }

  function siguienteNivel() {
    nivel++;
    prepararNivel(false);
  }

  function terminarPartida() {
    if (finEnviado) return;
    finEnviado = true;
    setEstado('fin');
    global.Sonido && global.Sonido.parar();
    const duracion = Math.max(5, Math.round((performance.now() - inicioPartida) / 1000));
    if (cb.fin) cb.fin({ puntos, nivel, duracion, aciertos });
  }

  function pasoJuego(h) {
    tiempoNivel += h; tiempoPartida += h; sinComer += h;
    if (invulnerable > 0) invulnerable -= h;
    if (asustadoT > 0) {
      asustadoT -= h;
      if (asustadoT <= 0) {
        asustadoT = 0; fantasmas.forEach((g) => { g.asustado = false; });
        global.Sonido && global.Sonido.asustado(false);
      }
    } else {
      modoT -= h; if (modoT <= 0) cambiarModo();
    }
    liberarFantasmas(h);
    mover(h);
    if (fruta) {
      fruta.t -= h;
      const dx = fruta.x - pac.x, dy = fruta.y - pac.y;
      if (dx * dx + dy * dy < 0.7) {
        puntosMas(fruta.puntos); popup(String(fruta.puntos), fruta.x, fruta.y, '#ff9cff'); fruta = null;
        global.Sonido && global.Sonido.fruta();
      } else if (fruta.t <= 0) fruta = null;
    }
    if (estado === 'jugando') colisiones();
    if (estado === 'jugando' && restantes <= 0) {
      setEstado('nivelOk');
      global.Sonido && (global.Sonido.parar(), global.Sonido.nivelSuperado());
    }
  }

  function actualizar(dt) {
    reloj += dt; estadoT += dt;
    for (let i = popups.length - 1; i >= 0; i--) { popups[i].t -= dt; if (popups[i].t <= 0) popups.splice(i, 1); }
    switch (estado) {
      case 'listo':
        fantasmas.forEach((g) => { if (g.estado === 'casa') { g.bob += dt * 6; g.y = g.y0 + Math.sin(g.bob) * 0.22; } });
        if (estadoT >= (nivel === 1 && tiempoPartida === 0 ? 2.6 : 1.8)) { setEstado('jugando'); }
        break;
      case 'jugando': {
        const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
        for (let i = 0; i < n && estado === 'jugando'; i++) pasoJuego(h);
        if (global.Sonido && estado === 'jugando') {
          if (asustadoT > 0) global.Sonido.asustado(true);
          else global.Sonido.sirena(restantes < totalPellets * 0.25 ? 3 : restantes < totalPellets * 0.5 ? 2 : restantes < totalPellets * 0.75 ? 1 : 0);
        }
        break;
      }
      case 'congelado':
        if (estadoT >= 0.5) setEstado('jugando');
        break;
      case 'atrapado':
        if (estadoT >= 1.1) {
          setEstado('pregunta');
          if (cb.pregunta) cb.pregunta(resolverPregunta, nivel); else resolverPregunta(false);
        }
        break;
      case 'muerte':
        pac.muerte = Math.min(1, estadoT / 1.6);
        if (estadoT >= 2.2) {
          if (vidas <= 0) terminarPartida();
          else prepararNivel(false);
        }
        break;
      case 'nivelOk':
        if (estadoT >= 2.6) siguienteNivel();
        break;
      default: break;
    }
  }

  /* --------------------------------- dibujo --------------------------------- */
  function colorLaberinto() { return lab.color || '#2f4bff'; }

  function dibujarLaberintoEn(c2, color, relleno) {
    c2.fillStyle = '#000'; c2.fillRect(0, 0, W, H);
    c2.fillStyle = relleno;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (muro[r][c]) c2.fillRect(c * T, r * T, T, T);
    c2.strokeStyle = color; c2.lineWidth = 2.2; c2.lineCap = 'round'; c2.lineJoin = 'round';
    c2.beginPath();
    const noMuro = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS) ? (r === FILA_TUNEL) : !muro[r][c];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!muro[r][c]) continue;
      const x = c * T, y = r * T;
      if (noMuro(c, r - 1)) { c2.moveTo(x, y); c2.lineTo(x + T, y); }
      if (noMuro(c, r + 1)) { c2.moveTo(x, y + T); c2.lineTo(x + T, y + T); }
      if (noMuro(c - 1, r)) { c2.moveTo(x, y); c2.lineTo(x, y + T); }
      if (noMuro(c + 1, r)) { c2.moveTo(x + T, y); c2.lineTo(x + T, y + T); }
    }
    c2.stroke();
    c2.fillStyle = '#ffb8de';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (puerta[r][c]) c2.fillRect(c * T, r * T + T / 2 - 1.5, T, 3);
  }

  function laberintoCache(flash) {
    const key = flash ? 'f' : 'n';
    if (!lab._cache) lab._cache = {};
    const cv = lab._cache[key + canvas.width];
    if (cv) return cv;
    const oc = document.createElement('canvas');
    oc.width = canvas.width; oc.height = canvas.height;
    const o = oc.getContext('2d');
    o.setTransform(escala, 0, 0, escala, 0, 0);
    dibujarLaberintoEn(o, flash ? '#ffffff' : colorLaberinto(), flash ? 'rgba(255,255,255,.12)' : (lab.relleno || 'rgba(47,75,255,.16)'));
    lab._cache[key + canvas.width] = oc;
    return oc;
  }

  const px = (v) => (v + 0.5) * T;

  function dibujarTexto(txt, x, y, color, tam) {
    ctx.font = 'bold ' + (tam || 14) + 'px "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; ctx.fillText(txt, x + 1, y + 1);
    ctx.fillStyle = color; ctx.fillText(txt, x, y);
  }

  function dibujarPac() {
    const x = px(pac.x), y = px(pac.y), r = T * 0.68;
    const dir = pac.dir >= 0 ? pac.dir : pac.ultimaDir;
    const ang = [1.5 * Math.PI, Math.PI, 0.5 * Math.PI, 0][dir];
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    if (estado === 'muerte') {
      const a = pac.muerte * Math.PI;
      if (pac.muerte < 1) {
        ctx.moveTo(x, y);
        ctx.arc(x, y, r, -Math.PI / 2 + a, -Math.PI / 2 + 2 * Math.PI - a);
        ctx.closePath(); ctx.fill();
      }
      return;
    }
    const m = (estado === 'jugando' || estado === 'congelado') ? Math.abs(Math.sin(pac.boca)) * 0.28 * Math.PI + 0.03 : 0.12 * Math.PI;
    if (estado === 'listo') { ctx.arc(x, y, r, 0, Math.PI * 2); }
    else { ctx.moveTo(x, y); ctx.arc(x, y, r, ang + m, ang + 2 * Math.PI - m); ctx.closePath(); }
    if (invulnerable > 0 && Math.floor(reloj * 10) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.fill(); ctx.globalAlpha = 1;
  }

  function dibujarFantasma(g) {
    const x = px(g.x), y = px(g.y), r = T * 0.7;
    const visibleCuerpo = g.estado !== 'comido' && g.estado !== 'entrando';
    let color = g.def.color;
    if (g.asustado) {
      const parpadeo = asustadoT < 2 && Math.floor(reloj * 5) % 2 === 0;
      color = parpadeo ? '#ffffff' : '#2121ff';
    }
    if (visibleCuerpo) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.1, r, Math.PI, 0);
      const base = y + r * 0.9, pata = (2 * r) / 3;
      const fase = Math.floor(reloj * 8) % 2;
      ctx.lineTo(x + r, base);
      for (let k = 0; k < 3; k++) {
        const x0 = x + r - k * pata;
        ctx.lineTo(x0 - pata * 0.5, base - (fase === (k % 2) ? r * 0.28 : 0));
        ctx.lineTo(x0 - pata, base);
      }
      ctx.closePath(); ctx.fill();
    }
    // ojos
    if (g.asustado && visibleCuerpo) {
      const col = (asustadoT < 2 && Math.floor(reloj * 5) % 2 === 0) ? '#ff0000' : '#ffd0a0';
      ctx.fillStyle = col;
      ctx.fillRect(x - r * 0.42, y - r * 0.3, r * 0.26, r * 0.26);
      ctx.fillRect(x + r * 0.16, y - r * 0.3, r * 0.26, r * 0.26);
      ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let k = 0; k < 6; k++) ctx.lineTo(x - r * 0.6 + k * r * 0.24, y + r * (k % 2 ? 0.34 : 0.5));
      ctx.stroke();
    } else {
      const d = g.dir >= 0 ? g.dir : 1, ox = DX[d] * r * 0.16, oy = DY[d] * r * 0.16;
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x + s * r * 0.36, y - r * 0.2, r * 0.26, r * 0.34, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#1428ff'; ctx.beginPath(); ctx.arc(x + s * r * 0.36 + ox * 1.6, y - r * 0.2 + oy * 1.6, r * 0.14, 0, 7); ctx.fill();
      }
    }
  }

  function dibujarFruta(tipo, x, y, s) {
    const c = ctx; c.save(); c.translate(x, y); c.scale(s / 14, s / 14); c.lineCap = 'round';
    const bola = (bx, by, rr, col) => { c.fillStyle = col; c.beginPath(); c.arc(bx, by, rr, 0, 7); c.fill(); };
    switch (tipo) {
      case 'cereza':
        c.strokeStyle = '#2bd62b'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-4, 3); c.quadraticCurveTo(-2, -6, 3, -8); c.moveTo(4, 4); c.quadraticCurveTo(3, -4, 3, -8); c.stroke();
        bola(-4, 4, 3.6, '#ff1c1c'); bola(4, 5, 3.6, '#ff1c1c'); break;
      case 'fresa':
        c.fillStyle = '#ff2a2a'; c.beginPath(); c.moveTo(-6, -3); c.quadraticCurveTo(0, -7, 6, -3); c.quadraticCurveTo(4, 6, 0, 8); c.quadraticCurveTo(-4, 6, -6, -3); c.fill();
        c.fillStyle = '#35e035'; c.fillRect(-4, -6, 8, 2.4); c.fillStyle = '#ffe600'; [[-2, 0], [2, 1], [0, 4], [-3, 3], [3, -1]].forEach(([a, b]) => c.fillRect(a, b, 1, 1)); break;
      case 'naranja': bola(0, 1, 6.2, '#ff9d00'); c.fillStyle = '#2bd62b'; c.fillRect(-1, -6, 2, 3); c.fillRect(1, -6, 3, 2); break;
      case 'manzana': bola(-2, 1, 4.6, '#ff1c1c'); bola(2, 1, 4.6, '#ff1c1c'); c.strokeStyle = '#2bd62b'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -3); c.lineTo(2, -7); c.stroke(); break;
      case 'melon': bola(0, 1, 6.4, '#4ee04e'); c.strokeStyle = '#1b8a1b'; c.lineWidth = 1; c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 3); c.moveTo(-3, -4); c.lineTo(5, -1); c.moveTo(-5, 4); c.lineTo(3, 6); c.stroke(); break;
      case 'estrella':
        c.fillStyle = '#ffe600'; c.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? 3 : 7, a = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + 1); } c.closePath(); c.fill(); break;
      case 'campana':
        c.fillStyle = '#ffd800'; c.beginPath(); c.moveTo(-6, 5); c.quadraticCurveTo(-6, -6, 0, -6); c.quadraticCurveTo(6, -6, 6, 5); c.closePath(); c.fill(); bola(0, 6, 1.8, '#fff'); break;
      default: // llave
        c.strokeStyle = '#7ee8ff'; c.lineWidth = 2; c.beginPath(); c.arc(0, -4, 2.8, 0, 7); c.moveTo(0, -1); c.lineTo(0, 8); c.moveTo(0, 5); c.lineTo(3, 5); c.moveTo(0, 8); c.lineTo(3, 8); c.stroke();
    }
    c.restore();
  }
  global.dibujarFrutaEn = function (c2d, tipo, x, y, s) { const prev = ctx; ctx = c2d; dibujarFruta(tipo, x, y, s); ctx = prev; };

  function dibujar() {
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    const flash = estado === 'nivelOk' && Math.floor(estadoT * 5) % 2 === 1;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(laberintoCache(flash), 0, 0);
    ctx.restore();
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    // puntos
    if (estado !== 'nivelOk' || !flash) {
      const encendida = Math.floor(reloj * 4) % 2 === 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const p = pellets[r][c]; if (!p) continue;
        if (p === 1) { ctx.fillStyle = '#ffd9a8'; ctx.fillRect(c * T + T / 2 - 1.5, r * T + T / 2 - 1.5, 3, 3); }
        else if (encendida || estado === 'listo') { ctx.fillStyle = '#ffd9a8'; ctx.beginPath(); ctx.arc(px(c), px(r), 5.2, 0, 7); ctx.fill(); }
      }
    }
    if (fruta) dibujarFruta(fruta.tipo, px(fruta.x), px(fruta.y), T * 1.15);
    if (estado === 'nivelOk') { dibujarPac(); dibujarPopups(); return; }
    if (estado !== 'muerte') fantasmas.forEach((g) => { if (!(estado === 'atrapado' && estadoT > 0.5 && g.i !== ultimoCapturador && false)) dibujarFantasma(g); });
    dibujarPac();
    if (estado === 'atrapado') {         // destello rojo alrededor de Pac-Man
      ctx.strokeStyle = 'rgba(255,60,60,' + (0.9 - estadoT * 0.6) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px(pac.x), px(pac.y), T * (0.9 + estadoT * 1.6), 0, 7); ctx.stroke();
      dibujarTexto('¡PILLADO!', W / 2, px(17), '#ff5a5a', 15);
    }
    if (estado === 'listo') dibujarTexto('¡LISTO!', W / 2, px(17), '#ffe600', 16);
    dibujarPopups();
  }

  function dibujarPopups() {
    popups.forEach((p) => dibujarTexto(p.texto, px(p.x), px(p.y) - (1.2 - p.t) * 8, p.color, 11));
  }

  /* -------------------------------- bucle ----------------------------------- */
  function bucle(ts) {
    raf = requestAnimationFrame(bucle);
    if (!ultimo) ultimo = ts;
    let dt = (ts - ultimo) / 1000; ultimo = ts;
    if (dt > 0.1) dt = 0.1;
    if (!pausado && lab) { actualizar(dt); }
    if (lab) dibujar();
  }

  function redimensionar() {
    const wrap = canvas.parentElement;
    const r = wrap.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const ratio = W / H;
    let w = r.width, h = r.width / ratio;
    if (h > r.height) { h = r.height; w = h * ratio; }
    w = Math.floor(w); h = Math.floor(h);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    escala = canvas.width / W;
    if (lab) lab._cache = null;
  }

  /* --------------------------------- API ------------------------------------ */
  const Juego = {
    init(cv, callbacks) {
      canvas = cv; ctx = canvas.getContext('2d'); cb = callbacks || {};
      redimensionar();
      window.addEventListener('resize', redimensionar);
      window.addEventListener('orientationchange', () => setTimeout(redimensionar, 250));
      if (window.ResizeObserver) new ResizeObserver(redimensionar).observe(canvas.parentElement);
      if (!raf) raf = requestAnimationFrame(bucle);
      // Fondo de portada: laberinto 1 sin partida
      cargarLaberinto(global.LABERINTOS[0]);
      pac = { x: 13.5, y: 23, dir: 1, desired: -1, stall: 0, ultimaDir: 1, boca: 0, muerte: 0 };
      fantasmas = [];
    },
    nuevaPartida() {
      nivel = 1; puntos = 0; vidas = VIDAS_INICIALES; vidaExtraDada = false; finEnviado = false; aciertos = 0;
      tiempoPartida = 0; inicioPartida = performance.now(); ultimo = 0; pausado = false;
      if (pac) pac.desired = -1;
      redimensionar();
      prepararNivel(true);
    },
    setDir(d) {
      if (!pac || d < 0) return;
      pac.desired = d;
      if (pac.dir >= 0 && d === inver(pac.dir) && estado === 'jugando') { pac.dir = d; pac.ultimaDir = d; }  // media vuelta inmediata
    },
    pausar() { pausado = true; global.Sonido && global.Sonido.parar(); },
    reanudar() { pausado = false; ultimo = 0; },
    redimensionar,
    get estado() { return estado; },
    get datos() { return { puntos, nivel, vidas, restantes, estado, comidos, aciertos }; },
    _debug: {
      get pac() { return pac; }, get fantasmas() { return fantasmas; },
      set puntos(v) { puntos = v; if (cb.hud) cb.hud(datosHud()); },
      set restantes(v) { restantes = v; }, set nivel(v) { nivel = v; },
      vaciarCasi() { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (pellets[r][c] === 1 && restantes > 3) { pellets[r][c] = 0; restantes--; } },
      capturar() { if (estado === 'jugando') capturado(fantasmas[0]); },
      set invulnerable(v) { invulnerable = v; }, set vidas(v) { vidas = v; },
      asustar() { asustar(); },
      irANivel(n) { nivel = n; prepararNivel(false); },
      simular(seg) { for (let i = 0; i < seg * 60; i++) actualizar(1 / 60); dibujar(); }   // para pruebas sin pantalla
    }
  };
  // Las herramientas de prueba (_debug) solo existen en local, no en la versión publicada
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) delete Juego._debug;
  global.Juego = Juego;
})(window);
