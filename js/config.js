/* ============================================================================
 *  Configuración del juego.  Es el ÚNICO archivo que hay que tocar para publicar.
 * ========================================================================== */
window.SIMO_CONFIG = {
  NOMBRE_JUEGO: 'Formación Educacyl - SIMO 26',

  // Backend (Supabase). Mientras estén vacíos, el juego funciona en MODO LOCAL:
  // las puntuaciones se guardan solo en este navegador (sirve para pruebas).
  // Rellénalos siguiendo el README (paso 2). La "anon key" es pública por diseño.
  SUPABASE_URL: 'https://ptkosbwzpooesvjywgmz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0a29zYnd6cG9vZXN2anl3Z216Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4ODMwMzksImV4cCI6MjEwNzQ1OTAzOX0.uembA4y-i5GAi2ouVLYiF-3uzx4cET91Ssiy8DizMfM',

  PREGUNTAS_URL: 'preguntas.csv',
  TIEMPO_PREGUNTA: 20,          // segundos para responder en el nivel 1 (nivel 2: -3 s, nivel 3: -6 s, luego -2 s por nivel)
  TIEMPO_MINIMO_PREGUNTA: 4,    // nunca baja de estos segundos
  RANKING_REFRESCO_S: 10,       // cada cuánto se actualiza ranking.html
  SEGUNDOS_PANTALLA_FINAL: 90   // vuelve sola a la portada si nadie toca (modo kiosco)
};
