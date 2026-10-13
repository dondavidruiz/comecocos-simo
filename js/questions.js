/* ============================================================================
 *  Preguntas: se leen de preguntas.csv (separador ; o , con cabecera):
 *     pregunta;correcta;falsa1;falsa2;disparatada;dato
 *  - "disparatada" es la respuesta falsa absurda (la que hace gracia).
 *  - "dato" es opcional: curiosidad que se muestra tras responder.
 *  Salen en orden aleatorio y sin repetir hasta agotar la lista.
 *  Si no se puede leer el CSV (p. ej. abriendo index.html con doble clic),
 *  se usa la copia de js/preguntas-embebidas.js.
 * ========================================================================== */
(function (global) {
  'use strict';
  let banco = [], cola = [];

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
    return filas.slice(1).map((f) => f.map((c) => c.trim()))
      .filter((f) => f.length >= 5 && f[0] && f[1] && f[2] && f[3] && f[4])
      .map((f) => ({ texto: f[0], correcta: f[1], falsa1: f[2], falsa2: f[3], disparatada: f[4], dato: f[5] || '' }));
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
      cola = [];
      return banco.length;
    },
    get total() { return banco.length; },
    /* Devuelve { texto, dato, opciones:[{texto, correcta, disparatada}] } con las opciones barajadas */
    siguiente() {
      if (!banco.length) return null;
      if (!cola.length) cola = barajar(banco.map((_, i) => i));
      const q = banco[cola.pop()];
      const opciones = barajar([
        { texto: q.correcta, correcta: true }, { texto: q.falsa1 }, { texto: q.falsa2 }, { texto: q.disparatada, disparatada: true }
      ]);
      return { texto: q.texto, dato: q.dato, opciones };
    },
    parsearCSV
  };
  global.Preguntas = Preguntas;
})(window);
