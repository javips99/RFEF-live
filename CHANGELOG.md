# Changelog

Todos los cambios notables de este proyecto se documentan en este fichero.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

---

## [1.0.0] — 2025-03-20

### Añadido

#### Backend
- Servidor Express con arranque en `server/index.js`.
- Seguridad con **Helmet** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
- **CORS** con allowlist configurable por entorno mediante `ALLOWED_ORIGIN`.
- **Rate Limiting** con `express-rate-limit`: máx. 30 peticiones/minuto por IP en `/api/*`.
- Logger de peticiones HTTP con timestamp, método, ruta y duración.
- Error handler global sin exposición de stack traces en producción.
- Cron job diario (node-cron) para resetear el contador de llamadas API a medianoche UTC.
- Servido de SPA con fallback a `public/index.html` para rutas no reconocidas.

#### Servicio API-Sports (`server/services/apiFootball.js`)
- Cliente Axios contra la API v3 de api-sports.io con autenticación por header.
- Soporte para Primera RFEF (grupos 1-2, IDs 775-776) y Segunda RFEF (grupos 1-5, IDs 940-944), temporada 2025.
- Caché en memoria con TTL diferenciado:
  - Clasificaciones: 10 minutos.
  - Próximos partidos: 30 minutos.
  - Resultados recientes: 10 minutos.
  - Partidos en directo: 60 segundos.
- Contador de llamadas diarias con límite en 100. Bloqueo automático al alcanzarlo.
- Detección de cuota agotada desde el header `x-ratelimit-requests-remaining`.
- Manejo de errores de api-sports devueltos en body con status 200.

#### Rutas de la API (`server/routes/rfef.js`)
- `GET /api/standings/:league/:group` — Clasificación de liga y grupo.
- `GET /api/fixtures/:league/:group` — Próximos partidos (param `?next=N`, default 15, máx 30).
- `GET /api/results/:league/:group` — Últimos resultados (param `?last=N`, default 15, máx 30).
- `GET /api/live` — Partidos en directo, filtrable por `?league=primera|segunda`.
- `GET /api/health` — Estado del servidor, cuota API y estadísticas de caché.
- Validación de inputs: allowlists para `league`, regex numérico para `group`.
- Respuesta HTTP 400 para parámetros inválidos y HTTP 429 cuando se agota la cuota.

#### Frontend (SPA Vanilla JS)
- HTML5 semántico con navegación por tabs (Clasificación, Próximos, Resultados, En Directo).
- Barra de filtros: selector de liga (Primera / Segunda) y grupo (1-5).
- Footer con contador de cuota API en tiempo real y advertencias visuales (naranja >80%, rojo >95%).
- Diseño responsivo mobile-first con paleta oficial RFEF: `#0D1B2A` (fondo) y `#CC0000` (acento).
- Variables CSS para coherencia de colores, espaciados y fuentes.
- Skeleton loaders durante la carga de datos.
- Banners de estado: datos obsoletos, error de red, cuota agotada.

#### Controlador principal (`public/js/app.js`)
- Estado global de aplicación (tab, liga, grupo) persistido en `localStorage`.
- **3 niveles de resiliencia**:
  1. Caché de cliente en `localStorage` (TTL 2 minutos).
  2. Fetch al servidor Express.
  3. Fallback a datos obsoletos del `localStorage` si el servidor devuelve HTTP 429.
- Polling automático cada 60 segundos, activo solo en la pestaña "En Directo".
- Badge dinámico con número de partidos activos en la tab "En Directo".
- Manejador global de errores de carga de logos con SVG de fallback.
- Event delegation para botones de reintento.

#### Módulos de renderizado
- `standings.js`: tabla de clasificación con colores por posición (promoción, playoff, descenso).
- `fixtures.js`: cards de próximos partidos con fecha, hora y estadio.
- `live.js`: tarjetas de partidos en directo con minuto actual destacado.
- `utils.js`: caché localStorage, formato de fechas en horario España, escapado HTML, SVG fallback.

---

[1.0.0]: https://github.com/javips99/rfef-live/releases/tag/v1.0.0
