# Formación Educacyl · SIMO 26 — Comecocos con preguntas

Videojuego web (HTML + JavaScript puro, sin instalar nada) para el stand de SIMO 26.
Funciona en móvil, tableta y ordenador. Se publica gratis en GitHub Pages.

## Qué incluye

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El juego: portada con instrucciones, formulario, partida y resultados |
| `ranking.html` | Clasificación en directo (para proyectar en el stand): top 10 con ✉️ si tiene correo |
| `preguntas.csv` | Las preguntas (editable con Excel) |
| `js/config.js` | **Único archivo a tocar para publicar** (claves de Supabase y tiempos) |
| `supabase/setup.sql` | Crea la base de datos de puntuaciones |
| `js/game.js`, `mazes.js`, `audio.js`, `ui.js`… | Motor, laberintos, sonido, interfaz |
| `tools/` | Utilidades de desarrollo (servidor local, generador de laberintos…) |

## 1 · Probarlo en tu ordenador

```powershell
powershell -ExecutionPolicy Bypass -File tools\servidor-local.ps1
```

Abre <http://localhost:8080/>. Sin configurar nada funciona en **modo local**: las puntuaciones se guardan solo en ese navegador (útil para probar).
Para probarlo en el móvil, conéctalo a la misma wifi y abre `http://IP-DE-TU-PC:8080/`
(la IP sale con `ipconfig`; puede que Windows pida permiso en el cortafuegos, y para escuchar fuera de `localhost` hay que ejecutar PowerShell como administrador).

## 2 · Crear la base de datos (Supabase, gratis)

1. Entra en <https://supabase.com> → **Sign in with GitHub**.
2. **New project**. Elige región **Frankfurt (eu-central-1)** o cualquier otra de la UE (los correos se guardarán allí). Anota la contraseña de la base de datos.
3. Cuando termine de crearse: **SQL Editor → New query**, pega todo `supabase/setup.sql` y pulsa **Run**.
4. **Project Settings → API**: copia la **Project URL** y la clave **anon public**.
5. Pégalas en `js/config.js`:
   ```js
   SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJ...',
   ```
   La clave *anon* es pública por diseño; la seguridad la dan las reglas de la base de datos (nadie puede leer correos desde la web).

### ¿Cómo se ven los datos? (tu "Excel")
- **Todas las partidas:** Supabase → *Table Editor* → `puntuaciones` → **Export → CSV** (se abre directamente en Excel).
- **Los 3 ganadores con correo:** SQL Editor → `select * from ganadores;`
- **Borrar las pruebas antes de la feria:** SQL Editor → `truncate table puntuaciones restart identity;`

### Reglas del ranking
- Cada persona cuenta **una vez, con su mejor puntuación**: se identifica por su correo (si lo dio). Sin correo, cada partida cuenta por separado.
- La clasificación es la misma para todos; el **premio** es para los 3 primeros **con correo** (`ganadores`).
- Antitrampas básicas en el servidor: puntuación plausible respecto al nivel y a la duración, y una partida cada 20 s por correo como máximo.
- Filtro de nicknames ofensivos en el navegador y en el servidor.

## 3 · Publicar en GitHub Pages

1. Crea un repositorio en tu GitHub y sube **todo el contenido de esta carpeta** (menos `tools/` si quieres).
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save.**
3. En un minuto estará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.
4. Prueba una partida desde el móvil y comprueba en Supabase que aparece la fila.

> Cada vez que subas cambios, el navegador usa primero la red y la copia guardada solo si no hay conexión, así que los cambios se ven al momento.

## 4 · Preguntas (`preguntas.csv`)

Columnas separadas por `;` (así lo guarda Excel en español; también vale `,`):

```
pregunta;correcta;falsa1;falsa2;disparatada;dato;dificultad
```

- **disparatada**: la respuesta falsa absurda que hace gracia.
- **dato** (opcional): curiosidad que sale tras responder.
- **dificultad**: `facil`, `media` o `dificil`. Nivel 1: fáciles y medias · nivel 2: solo medias · nivel 3: medias y difíciles · nivel 4 en adelante: solo difíciles. Conviene tener bastantes difíciles (a partir del nivel 4 solo salen esas, sin repetir hasta agotarlas).
- No uses `;` dentro de un campo (o enciérralo entre comillas).
- En Excel: *Guardar como → CSV UTF-8 (delimitado por comas)*. Mantiene las tildes.
- Salen en **orden aleatorio sin repetir** hasta agotarlas; luego se vuelven a barajar.
- Opcional: ejecuta `tools\actualizar-embebidas.ps1` para refrescar la copia de seguridad `js/preguntas-embebidas.js` (solo se usa si el navegador no puede leer el CSV, p. ej. abriendo `index.html` con doble clic).

## 5 · Reglas implementadas

- 3 vidas (la que juega + 2 extra). Vida extra a los 10.000 puntos (como el original).
- **Fantasma te atrapa → pregunta de 4 opciones, 20 s.**
  - Acierto: **reapareces en la salida** (con los puntos del tablero ya comidos, el marcador y las vidas intactos), con 3 s de invulnerabilidad.
  - Fallo o tiempo agotado: pierdes una vida y **reinicias el nivel**. Los puntos se mantienen siempre.
- Puntuación del original: punto 10, píldora 50, fantasmas 200-400-800-1600, frutas 100-5000.
- IA de fantasmas clásica (Blinky persigue, Pinky embosca, Inky usa a Blinky, Clyde duda), modos dispersión/persecución, Blinky se acelera al final, túneles laterales, fruta bonus a los 70 y 170 puntos comidos.
- **Tiempo para responder**: 20 s en el nivel 1, 17 s en el 2, 14 s en el 3 y 2 s menos en cada nivel siguiente, con un mínimo de 4 s (`TIEMPO_PREGUNTA` y `TIEMPO_MINIMO_PREGUNTA` en `js/config.js`).
- **Respuestas acertadas**: se muestran entre paréntesis junto a los puntos y **desempatan** la clasificación (a igualdad de puntos, más aciertos = mejor puesto).
- **Dificultad creciente**: más velocidad y menos tiempo de susto por nivel, y un aumento progresivo (hasta +12 %) de la velocidad de los fantasmas según pasa el tiempo de partida.
- Laberinto clásico en los niveles 1-2 y tres diseños nuevos (3-4, 5-6, 7-8), que se repiten después.
- Controles: deslizar el dedo, cruceta en pantalla, flechas/WASD, pausa con `P`/`Esc`. En las preguntas se puede responder con 1-4 o A-D.
- Sonidos sintetizados propios (sin archivos) con botón de silencio.
- Se adapta a vertical y horizontal; el logo está siempre en la parte inferior.
- Si se corta internet: la partida se guarda en el dispositivo y se envía sola al volver la conexión. Instalable como app (PWA).
- Modo kiosco: la pantalla de resultados vuelve sola a la portada a los 90 s y los campos se borran.

## 6 · Pendiente / a validar antes de la feria

- [ ] Texto legal definitivo (hay uno **provisional**: ver ventana "información sobre protección de datos" en `index.html`) y bases del concurso. Que lo valide el delegado de protección de datos de la Consejería.
- [ ] Preguntas definitivas (las actuales son de prueba, sobre curiosidades de Castilla y León).
- [ ] Código QR del stand con la URL final (cuando la tengamos).
- [ ] Probar en los dispositivos reales del stand (tableta y móviles) y con la wifi de la feria.
- [ ] Vaciar la tabla de pruebas (`truncate`) justo antes de abrir.

## Nota sobre derechos

El juego está inspirado en el clásico, pero **todos los gráficos, sonidos y melodías son propios**: no incluye sprites, música ni efectos de Namco. Se recomienda no usar la marca «Pac-Man» en la cartelería.
