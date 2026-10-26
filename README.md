# Formación Educacyl · SIMO 26 — Comecocos con preguntas

Videojuego web (HTML + JavaScript puro, sin instalar nada) para el stand de SIMO 26.
Funciona en móvil, tableta y ordenador. Se publica gratis en GitHub Pages.

**No se recogen datos personales**: solo nickname, puntuación, nivel, respuestas acertadas y un código de partida.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El juego: portada, partida y resultados (con el código de partida) |
| `ranking.html` | Clasificación en directo para proyectar: pestañas **Hoy · premios** y **General** |
| `verificar.html` | **Solo para el personal** (con clave): top 10 del día, comprobar códigos y marcar entregas |
| `preguntas.csv` | Las preguntas (editable con Excel) |
| `js/config.js` | Claves de Supabase y tiempos |
| `supabase/setup.sql` | Crea/actualiza la base de datos (se puede ejecutar varias veces) |
| `js/*.js`, `css/` | Motor, laberintos, sonido, interfaz |
| `tools/` | Utilidades de desarrollo (no hace falta subirla) |

## Cómo funcionan los premios

- **Premio diario:** los 3 primeros de **cada día** (hora de España).
- **Solo cuentan las partidas dentro del horario del stand** (tabla `horario` de la base de datos, ver abajo). Fuera de horario se puede jugar, pero no puntúa ni aparece en el podio.
- **Un puesto por nick y día:** en cada día solo cuenta la mejor partida de cada nick (sin distinguir mayúsculas).
- **Orden:** más puntos; en empate, más respuestas acertadas; si aún empatan, quien lo logró antes.
- **Código de partida:** al terminar, el jugador ve un código de 6 caracteres (p. ej. `K7M4QX`) y se le pide hacer una captura. Sin código no se puede reclamar el premio.
- **Entrega:** a última hora, el ganador enseña el código (o la captura) y el personal lo comprueba en `verificar.html`, que además lo marca como **entregado** para que no se reclame dos veces.
  - `verificar.html` muestra el **top 10**: los puestos 4-10 son **suplentes** por si algún ganador no viene. Como máximo se entregan **3 premios al día**.
  - Si alguien juega varias partidas, el código válido para el premio es el de su **mejor** partida del día.

## 1 · Probarlo en tu ordenador

```powershell
powershell -ExecutionPolicy Bypass -File tools\servidor-local.ps1
```

Abre <http://localhost:8080/>. Con `SUPABASE_URL` vacío en `js/config.js` funciona en **modo local** (las puntuaciones solo existen en ese navegador). `verificar.html` necesita Supabase.

## 2 · Base de datos (Supabase)

1. En Supabase → **SQL Editor → New query**, pega todo `supabase/setup.sql` y pulsa **Run**. Se puede repetir sin perder datos. *(La versión anterior guardaba correos: esta los elimina de la base.)*
2. **Pon la clave del personal** (elige una larga, no la compartas por chat):
   ```sql
   select definir_clave('PON-AQUI-TU-CLAVE');
   ```
3. **Horario:** ya está cargado el de SIMO 26 (tabla `horario`, hora de España): 11 y 12 de noviembre de 10:00 a 18:00 y 13 de noviembre de 10:00 a 14:00. Un día sin fila = no hay concurso ese día. Para cambiarlo:
   ```sql
   insert into horario (dia, apertura, cierre) values ('2026-11-13', '10:00', '14:00')
     on conflict (dia) do update set apertura = excluded.apertura, cierre = excluded.cierre;
   ```
4. En `js/config.js` van `SUPABASE_URL` y `SUPABASE_ANON_KEY` (Project Settings → API). La clave *anon* es pública por diseño; nadie puede leer la tabla desde la web.

Consultas útiles (SQL Editor):
- Ganadores de cada día: `select * from ganadores;`
- Todas las partidas a Excel: *Table Editor → puntuaciones → Export → CSV*
- **Borrar pruebas antes de la feria:** `truncate table puntuaciones restart identity;`

Protecciones del servidor: nick filtrado, puntuación y aciertos plausibles, una partida cada 15 s por nick como máximo, y la clave del personal (con retardo en los fallos para frenar adivinaciones).

## 3 · Publicar en GitHub Pages

Sube **todo el contenido** del repositorio (menos `tools/` si quieres) con la estructura de carpetas intacta (`js/`, `css/`, `img/`, `supabase/` y los HTML en la raíz). Después: *Settings → Pages → Deploy from a branch → `main` / `(root)`*. URL: `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

> Cuidado al subir por la web: los archivos de `js/` hay que subirlos **dentro** de la carpeta `js/`, no a la raíz.

## 4 · Preguntas (`preguntas.csv`)

Columnas separadas por `;` (así lo guarda Excel en español; también vale `,`):

```
pregunta;correcta;falsa1;falsa2;disparatada;dato;dificultad
```

- **disparatada**: la respuesta falsa absurda que hace gracia. **dato** (opcional): curiosidad que sale tras responder.
- **dificultad**: `facil`, `media` o `dificil`. Nivel 1: fáciles y medias · nivel 2: solo medias · nivel 3: medias y difíciles · nivel 4 en adelante: solo difíciles. Conviene tener **bastantes difíciles**: desde el nivel 4 solo salen esas, sin repetir hasta agotarlas.
- No uses `;` dentro de un campo. En Excel: *Guardar como → CSV UTF-8*.
- Opcional: `tools\actualizar-embebidas.ps1` refresca la copia de seguridad `js/preguntas-embebidas.js` (solo se usa si no se puede leer el CSV).

## 5 · Reglas del juego

- 3 vidas (la que juega + 2 extra); vida extra a los 10.000 puntos. Puntuación del original (punto 10, píldora 50, fantasmas 200-400-800-1600, frutas 100-5000).
- **Fantasma te atrapa → pregunta de 4 opciones** (una disparatada).
  - Acierto: **reapareces en la salida** con los puntos del tablero ya comidos, el marcador y las vidas intactos, y 3 s de invulnerabilidad.
  - Fallo o tiempo agotado: pierdes una vida y **reinicias el nivel**. Los puntos se mantienen siempre.
- **Tiempo para responder:** 20 s en el nivel 1, 17 s en el 2, 14 s en el 3 y 2 s menos en cada nivel siguiente, con un mínimo de 4 s (`TIEMPO_PREGUNTA` y `TIEMPO_MINIMO_PREGUNTA` en `js/config.js`).
- **Respuestas acertadas:** aparecen entre paréntesis junto a los puntos y desempatan.
- **Dificultad creciente:** más velocidad y menos tiempo de susto por nivel, y un aumento progresivo (hasta +12 %) de la velocidad de los fantasmas con el tiempo de partida. Laberinto clásico en niveles 1-2 y tres diseños nuevos después.
- Controles: deslizar el dedo, cruceta en pantalla, flechas/WASD, pausa con `P`/`Esc`; en las preguntas, 1-4 o A-D.
- Sonidos sintetizados propios con botón de silencio. Vertical y horizontal. Logo siempre abajo.
- Sin internet: al terminar reintenta el envío 6 veces (cada 4 s); si no hay forma, deja la partida en cola, pero **sin código no hay premio**. Instalable como app.
- Modo kiosco: la pantalla de resultados vuelve sola a la portada a los 90 s.

## 6 · Pendiente / a validar antes de la feria

- [ ] Ejecutar `setup.sql`, definir la clave del personal y el horario/fechas (paso 2).
- [ ] Preguntas definitivas, con su dificultad.
- [ ] Bases del concurso (premios diarios, horario, cómo se reclama) y comprobar con el CRFPTIC si hace falta algún aviso de privacidad, aunque no se guardan datos personales.
- [ ] Código QR del stand con la URL final.
- [ ] Probar en los dispositivos del stand y con la wifi de la feria.
- [ ] Vaciar la tabla de pruebas (`truncate`) justo antes de abrir.

## Nota sobre derechos

El juego está inspirado en el clásico, pero **todos los gráficos, sonidos y melodías son propios**. Se recomienda no usar la marca «Pac-Man» en la cartelería.
