/* ============================================================================
 *  Sonido sintetizado con Web Audio (sin archivos de audio; melodías propias).
 *  El navegador solo permite sonar tras un gesto del usuario: ui.js llama a
 *  Sonido.activar() al pulsar START.
 * ========================================================================== */
(function (global) {
  'use strict';
  let ac = null, master = null, silenciado = false, wakaAlt = false;
  let sirenaOsc = null, sirenaGain = null, sirenaNivel = -1;
  let asustadoOsc = null, asustadoGain = null;

  try { silenciado = localStorage.getItem('simo26_mute') === '1'; } catch (e) { /* sin almacenamiento */ }

  function activar() {
    if (!ac) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = silenciado ? 0 : 0.5;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function nota(freq, ini, dur, tipo, vol, fin) {
    if (!ac) return;
    const t0 = ac.currentTime + ini;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = tipo || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (fin) o.frequency.linearRampToValueAtTime(fin, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  const S = {
    activar,
    get silenciado() { return silenciado; },
    silenciar(v) {
      silenciado = !!v;
      try { localStorage.setItem('simo26_mute', silenciado ? '1' : '0'); } catch (e) { /* nada */ }
      if (master) master.gain.value = silenciado ? 0 : 0.5;
      if (silenciado) S.parar();
    },
    waka() { wakaAlt = !wakaAlt; nota(wakaAlt ? 520 : 330, 0, 0.07, 'triangle', 0.16, wakaAlt ? 330 : 520); },
    pildora() { nota(180, 0, 0.18, 'square', 0.12, 700); },
    comerFantasma() { nota(300, 0, 0.35, 'sawtooth', 0.12, 1400); },
    fruta() { nota(660, 0, 0.08, 'square', 0.12); nota(880, 0.08, 0.08, 'square', 0.12); nota(1320, 0.16, 0.14, 'square', 0.12); },
    vidaExtra() { [523, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.09, 0.12, 'square', 0.12)); },
    atrapado() { nota(900, 0, 0.5, 'sawtooth', 0.12, 120); },
    morir() { for (let i = 0; i < 10; i++) nota(700 - i * 55, i * 0.12, 0.12, 'triangle', 0.15); nota(90, 1.3, 0.4, 'sawtooth', 0.12); },
    intro() {   // fanfarria propia de 2,5 s
      const m = [392, 392, 523, 392, 659, 587, 523, 440, 440, 587, 440, 698, 659, 587, 494];
      m.forEach((f, i) => nota(f, i * 0.16, 0.14, 'square', 0.1));
      [196, 262, 196, 330].forEach((f, i) => nota(f, i * 0.6, 0.5, 'triangle', 0.1));
    },
    nivelSuperado() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.13, 0.16, 'square', 0.12)); },
    acierto() { [523, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.1, 0.15, 'square', 0.12)); nota(1047, 0.45, 0.4, 'triangle', 0.14); },
    fallo() { nota(220, 0, 0.25, 'sawtooth', 0.14); nota(165, 0.25, 0.25, 'sawtooth', 0.14); nota(110, 0.5, 0.5, 'sawtooth', 0.14); },
    tic() { nota(1000, 0, 0.05, 'square', 0.07); },
    clic() { nota(700, 0, 0.05, 'square', 0.07); },
    finJuego() { [392, 330, 262, 196].forEach((f, i) => nota(f, i * 0.22, 0.3, 'triangle', 0.15)); },
    // Sirena de fondo: tono suave que sube con los puntos comidos
    sirena(nivel) {
      if (!ac || silenciado) return;
      if (asustadoOsc) S.asustado(false);
      if (!sirenaOsc) {
        sirenaOsc = ac.createOscillator(); sirenaGain = ac.createGain();
        sirenaOsc.type = 'triangle'; sirenaGain.gain.value = 0.035;
        const lfo = ac.createOscillator(), lg = ac.createGain();
        lfo.frequency.value = 2.2; lg.gain.value = 40; lfo.connect(lg); lg.connect(sirenaOsc.frequency); lfo.start();
        sirenaOsc._lfo = lfo;
        sirenaOsc.connect(sirenaGain); sirenaGain.connect(master); sirenaOsc.start();
        sirenaNivel = -1;
      }
      if (nivel !== sirenaNivel) { sirenaNivel = nivel; sirenaOsc.frequency.setTargetAtTime(300 + nivel * 45, ac.currentTime, 0.05); }
    },
    asustado(on) {
      if (!ac || silenciado) return;
      if (on) {
        if (sirenaOsc) quitarSirena();
        if (!asustadoOsc) {
          asustadoOsc = ac.createOscillator(); asustadoGain = ac.createGain();
          asustadoOsc.type = 'square'; asustadoGain.gain.value = 0.03;
          const lfo = ac.createOscillator(), lg = ac.createGain();
          lfo.type = 'sawtooth'; lfo.frequency.value = 7; lg.gain.value = 120;
          lfo.connect(lg); lg.connect(asustadoOsc.frequency); lfo.start(); asustadoOsc._lfo = lfo;
          asustadoOsc.frequency.value = 420;
          asustadoOsc.connect(asustadoGain); asustadoGain.connect(master); asustadoOsc.start();
        }
      } else if (asustadoOsc) {
        try { asustadoOsc._lfo.stop(); asustadoOsc.stop(); } catch (e) { /* ya parado */ }
        asustadoOsc = null;
      }
    },
    parar() { quitarSirena(); S.asustado(false); }
  };

  function quitarSirena() {
    if (!sirenaOsc) return;
    try { sirenaOsc._lfo.stop(); sirenaOsc.stop(); } catch (e) { /* ya parado */ }
    sirenaOsc = null; sirenaNivel = -1;
  }

  global.Sonido = S;
})(window);
