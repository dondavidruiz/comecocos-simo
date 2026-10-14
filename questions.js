/* ============================================================================
 *  Preguntas: se leen de preguntas.csv (separador ; o , con cabecera):
 *     pregunta;correcta;falsa1;falsa2;disparatada;dato;dificultad
 *  - "disparatada" es la respuesta falsa absurda (la que hace gracia).
 *  - "dato" es opcional: curiosidad que se muestra tras responder.
 *  - "dificultad": facil, media o dificil (si falta, se considera media).
 *  Qué preguntas salen en cada nivel:
 *     nivel 1: fáciles y medias  ·  nivel 2: solo medias
 *     nivel 3: medias y difíciles ·  nivel 4 en adelante: solo difíciles
 *  Dentro de cada grupo salen en orden aleatorio y sin repetir hasta agotarlas.
 *  Si no se puede leer el CSV (p. ej. abriendo index.html con doble clic),
 *  se usa la copia de js/preguntas-embebidas.js.
 * ========================================================================== */
(function (global) {
  'use strict';
  let banco = [];
  const colas = {};            // una cola barajada por grupo de nivel

  const GRUPOS = { 1: ['facil', 'media'], 2: ['media'], 3: ['media', 'dificil'], 4: ['dificil'] };

  function normalizar(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function nivelDificultad(txt) {
    const t = normalizar(txt);
    if (t.startsWith('fac') || t === '1') return 'facil';
    if (t.startsWith('dif') || t === '3') return 'dificil';
    return 'media';
  }

  function parsearCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    const primera = texto.split(/\r?\n/)[0] || '';
    const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
    const filas = []; let fila = [], campo = '', comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (comillas) {
        if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') comillas = false;
        else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); campo = ''; if (fila.some((c) => c.trim())) filas.push(fila); fila = [];
      } else campo += ch;
    }
    fila.push(campo); if (fila.some((c) => c.trim())) filas.push(fila);
    if (!filas.length) return [];
    // Las columnas se localizan por el nombre de la cabecera (y si no, por posición)
    const cab = filas[0].map(normalizar);
    const col = (nombre, pos) => { const i = cab.indexOf(nombre); return i >= 0 ? i : pos; };
    const c = { p: col('pregunta', 0), ok: col('correcta', 1), f1: col('falsa1', 2), f2: col('falsa2', 3),
      d: col('disparatada', 4), dato: col('dato', 5), dif: col('dificultad', 6) };
    return filas.slice(1).map((f) => f.map((x) => x.trim()))
      .filter((f) => f[c.p] && f[c.ok] && f[c.f1] && f[c.f2] && f[c.d])
      .map((f) => ({ texto: f[c.p], correcta: f[c.ok], falsa1: f[c.f1], falsa2: f[c.f2], disparatada: f[c.d],
        dato: f[c.dato] || '', dificultad: nivelDificultad(f[c.dif]) }));
  }

  function barajar(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const Preguntas = {
    async cargar(url) {
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        banco = parsearCSV(await r.text());
      } catch (e) {
        banco = parsearCSV(global.PREGUNTAS_CSV_EMBEBIDAS || '');
      }
      if (!banco.length) banco = parsearCSV(global.PREGUNTAS_CSV_EMBEBIDAS || '');
      Object.keys(colas).forEach((k) => delete colas[k]);
      return banco.length;
    },
    get total() { return banco.length; },
    /* Recuento por dificultad (útil para comprobar que hay preguntas suficientes) */
    recuento() {
      const r = { facil: 0, media: 0, dificil: 0 };
      banco.forEach((q) => { r[q.dificultad]++; });
      return r;
    },
    /* Devuelve { texto, dato, dificultad, opciones:[{texto, correcta, disparatada}] } según el nivel */
    siguiente(nivel) {
      if (!banco.length) return null;
      const clave = Math.min(Math.max(nivel || 1, 1), 4);
      if (!colas[clave] || !colas[clave].length) {
        let idx = banco.map((q, i) => i).filter((i) => GRUPOS[clave].includes(banco[i].dificultad));
        if (!idx.length) idx = banco.map((q, i) => i);   // si no hay de ese grupo, vale cualquiera
        colas[clave] = barajar(idx);
      }
      const q = banco[colas[clave].pop()];
      const opciones = barajar([
        { texto: q.correcta, correcta: true }, { texto: q.falsa1 }, { texto: q.falsa2 }, { texto: q.disparatada, disparatada: true }
      ]);
      return { texto: q.texto, dato: q.dato, dificultad: q.dificultad, opciones };
    },
    parsearCSV
  };
  global.Preguntas = Preguntas;
})(window);
