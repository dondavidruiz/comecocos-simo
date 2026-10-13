/* ============================================================================
 *  Configuración del juego.  Es el ÚNICO archivo que hay que tocar para publicar.
 * ========================================================================== */
window.SIMO_CONFIG = {
  NOMBRE_JUEGO: 'Formación Educacyl - SIMO 26',

  // Backend (Supabase). Mientras estén vacíos, el juego funciona en MODO LOCAL:
  // las puntuaciones se guardan solo en este navegador (sirve para pruebas).
  // Rellénalos siguiendo el README (paso 2). La "anon key" es pública por diseño.
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  PREGUNTAS_URL: 'preguntas.csv',
  TIEMPO_PREGUNTA: 20,          // segundos para responder
  RANKING_REFRESCO_S: 10,       // cada cuánto se actualiza ranking.html
  SEGUNDOS_PANTALLA_FINAL: 90   // vuelve sola a la portada si nadie toca (modo kiosco)
};
