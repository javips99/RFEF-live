/**
 * utils.js — Utilidades compartidas por todos los módulos del frontend
 *
 * Cargado en primer lugar (ver orden en index.html).
 * Expone funciones globales:
 *   — Renderizado: teamFallbackSvg, createTeamImg, escapeHtml
 *   — Formateo:    formatMatchDate, formatScore, formatLiveMinute
 *   — Caché local: saveToClientCache, loadFromClientCache, loadStaleFromClientCache
 */

// ═══════════════════════════════════════════════════════════════════
//  CACHÉ EN CLIENTE (localStorage)
// ═══════════════════════════════════════════════════════════════════

/** TTL de 2 minutos: si el usuario recarga en menos de 2 min no se hace fetch */
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000;

/** Prefijo de clave para evitar colisiones con otras apps en el mismo origen */
const CLIENT_CACHE_PREFIX = 'rfef-data-';

/**
 * Guarda datos en localStorage con timestamp.
 * @param {string} key
 * @param {*}      data
 */
function saveToClientCache(key, data) {
  try {
    localStorage.setItem(CLIENT_CACHE_PREFIX + key, JSON.stringify({
      data,
      timestamp: Date.now(),
      savedAt:   new Date().toISOString(),
    }));
  } catch {
    // localStorage lleno o no disponible (modo privado estricto) — ignorar
  }
}

/**
 * Lee datos del localStorage si no han expirado (TTL 2 min).
 * @param {string} key
 * @returns {{ data, timestamp, savedAt } | null}
 */
function loadFromClientCache(key) {
  try {
    const raw = localStorage.getItem(CLIENT_CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CLIENT_CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Lee datos obsoletos del localStorage (ignora el TTL).
 * Usado como fallback cuando la cuota de la API está agotada.
 * @param {string} key
 * @returns {{ data, timestamp, savedAt } | null}
 */
function loadStaleFromClientCache(key) {
  try {
    const raw = localStorage.getItem(CLIENT_CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  RENDERIZADO DE LOGOS DE EQUIPO
// ═══════════════════════════════════════════════════════════════════

/**
 * Genera un Data URI SVG como placeholder para logos rotos.
 * @param {number} size - Lado en píxeles (22 | 32 | 48)
 * @returns {string} Data URI
 */
function teamFallbackSvg(size) {
  const half = size / 2;
  const r    = half - 2;
  return (
    `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'` +
    ` width='${size}' height='${size}'%3E` +
    `%3Ccircle cx='${half}' cy='${half}' r='${r}' fill='%23444'/%3E` +
    `%3C/svg%3E`
  );
}

/**
 * Genera el HTML completo de un <img> de logo con fallback automático.
 * El onerror se auto-desactiva (onerror=null) para evitar bucles infinitos
 * si el SVG inline también fallara.
 *
 * @param {string} logoUrl   - URL del logo (puede estar vacía o null)
 * @param {string} altText   - Texto alternativo (nombre del equipo)
 * @param {string} sizeClass - '' | 'team-logo--md' | 'team-logo--lg'
 * @param {number} pxSize    - Tamaño en px para el SVG fallback
 * @returns {string} HTML del <img>
 */
function createTeamImg(logoUrl, altText, sizeClass, pxSize) {
  const fallback = teamFallbackSvg(pxSize);
  const classes  = ['team-logo', sizeClass].filter(Boolean).join(' ');
  // Sin onerror inline (viola CSP script-src 'self').
  // El fallback se gestiona con el listener global en app.js (evento error, fase captura).
  return `<img
    class="${classes}"
    src="${logoUrl || fallback}"
    alt="${escapeHtml(altText) || ''}"
    loading="lazy"
    data-fallback-size="${pxSize}"
  />`;
}

// ═══════════════════════════════════════════════════════════════════
//  SEGURIDAD
// ═══════════════════════════════════════════════════════════════════

/**
 * Escapa caracteres HTML para evitar XSS al insertar en innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

// ═══════════════════════════════════════════════════════════════════
//  FORMATEO DE FECHAS Y MARCADORES
// ═══════════════════════════════════════════════════════════════════

/**
 * Formatea una fecha ISO a cadena legible en horario de España.
 * Ejemplo: "Sáb 23 mar · 17:00"
 *
 * Compartido entre fixtures.js y cualquier otro módulo que muestre fechas.
 *
 * @param {string} dateStr - Fecha ISO 8601
 * @returns {string} HTML con &middot; como separador
 */
function formatMatchDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return escapeHtml(dateStr);

  const opts = { timeZone: 'Europe/Madrid' };

  const weekday = date.toLocaleDateString('es-ES', { ...opts, weekday: 'short' });
  const day     = date.toLocaleDateString('es-ES', { ...opts, day: 'numeric', month: 'short' });
  const time    = date.toLocaleTimeString('es-ES', { ...opts, hour: '2-digit', minute: '2-digit' });

  // "sáb." → "Sáb" (capitaliza y quita el punto)
  const weekdayStr = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '');

  return `${weekdayStr} ${day} &middot; ${time}`;
}

/**
 * Formatea el marcador de un partido.
 * @param {number|null} home      - Goles local
 * @param {number|null} away      - Goles visitante
 * @param {string}      [sep='–'] - Separador visual
 * @returns {string}  ej. "2 – 1" o "? – ?"
 */
function formatScore(home, away, sep = '–') {
  const h = home !== null && home !== undefined ? home : '?';
  const a = away !== null && away !== undefined ? away : '?';
  return `${h} ${sep} ${a}`;
}

/**
 * Formatea el minuto de un partido en directo.
 *
 * @param {string}      statusShort - Código de estado ('1H', 'HT', '2H', 'ET', etc.)
 * @param {number|null} elapsed     - Minuto transcurrido
 * @returns {string}  ej. "67'" | "Descanso" | "Penaltis"
 */
function formatLiveMinute(statusShort, elapsed) {
  const STATUS_MAP = {
    '1H':   { label: null,                 suffix: "'" },
    'HT':   { label: 'Descanso',           suffix: ''  },
    '2H':   { label: null,                 suffix: "'" },
    'ET':   { label: 'Prórroga ',          suffix: "'" },
    'BT':   { label: 'Descanso prórroga',  suffix: ''  },
    'P':    { label: 'Penaltis',           suffix: ''  },
    'SUSP': { label: 'Suspendido',         suffix: ''  },
    'INT':  { label: 'Interrumpido',       suffix: ''  },
    'LIVE': { label: null,                 suffix: "'" },
  };

  const config = STATUS_MAP[statusShort];
  if (!config) return elapsed ? `${elapsed}'` : '—';

  // Estados sin minuto (Descanso, Penaltis, etc.)
  if (config.label && !config.suffix) return config.label;

  const min = elapsed !== null && elapsed !== undefined ? elapsed : '?';
  return config.label ? `${config.label}${min}${config.suffix}` : `${min}${config.suffix}`;
}
