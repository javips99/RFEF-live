const express = require('express');
const router  = express.Router();

// ─── Helper: convierte errores del servicio en respuestas HTTP ───────────────
function handleServiceError(err, res, genericMsg) {
  if (err.isQuotaExhausted) {
    return res.status(429).json({
      error:     'Cuota diaria agotada',
      details:   'Se han consumido las 100 llamadas diarias disponibles. Los datos volverán a actualizarse mañana a medianoche (UTC).',
      quotaInfo: { exhausted: true, resetsAt: 'Medianoche UTC' },
    });
  }
  console.error(`[ROUTE] ${genericMsg}:`, err.message);
  res.status(502).json({ error: genericMsg, details: err.message });
}
const {
  getStandings,
  getFixtures,
  getRecentResults,
  getLiveFixtures,
  LEAGUE_IDS,
  ALL_RFEF_IDS,
  getCacheStats,
  getQuotaRemaining,
  getApiCallsToday,
} = require('../services/apiFootball');

// ─── Allowlists para validación de inputs ────────────────────────────────────
// Solo se aceptan exactamente estos valores — cualquier otra cadena devuelve 400.
const VALID_LEAGUES = new Set(['primera', 'segunda']);
const GROUP_REGEX   = /^[1-5]$/;   // Un único dígito del 1 al 5, nada más

/**
 * Resuelve el ID de liga; retorna null si la combinación no existe en LEAGUE_IDS.
 * Solo se llama DESPUÉS de que VALID_LEAGUES y GROUP_REGEX hayan pasado.
 */
function resolveLeagueId(league, group) {
  const leagueMap = LEAGUE_IDS[league];                   // ya normalizado a minúsculas
  if (!leagueMap) return null;
  return leagueMap[parseInt(group, 10)] || null;
}

// ─── Middleware de validación estricta de parámetros ─────────────────────────
function validateLeagueGroup(req, res, next) {
  // Normalizar aquí —  nunca confiar en lo que llegue tal cual
  const league = req.params.league?.toLowerCase().trim();
  const group  = req.params.group?.trim();

  // 1. Verificar formato de :league contra allowlist
  if (!VALID_LEAGUES.has(league)) {
    return res.status(400).json({
      error: `Parámetro "league" no válido: "${req.params.league}"`,
      valid: [...VALID_LEAGUES],
    });
  }

  // 2. Verificar que :group es exactamente un dígito del 1 al 5
  if (!GROUP_REGEX.test(group)) {
    return res.status(400).json({
      error: `Parámetro "group" no válido: "${req.params.group}". Debe ser un número entero del 1 al 5.`,
      valid: [1, 2, 3, 4, 5],
    });
  }

  // 3. Verificar que la combinación liga+grupo existe en nuestra configuración
  const id = resolveLeagueId(league, group);
  if (!id) {
    return res.status(400).json({
      error: `El grupo "${group}" no existe en la liga "${league}".`,
      valid: { primera: [1, 2], segunda: [1, 2, 3, 4, 5] },
    });
  }

  // Adjuntar el ID normalizado al request para las rutas siguientes
  req.leagueId = id;
  next();
}

// ─── GET /api/standings/:league/:group ───────────────────────────────────────
// Ejemplo: GET /api/standings/primera/1
router.get('/standings/:league/:group', validateLeagueGroup, async (req, res) => {
  try {
    const result = await getStandings(req.leagueId);
    res.json(result);
  } catch (err) {
    handleServiceError(err, res, 'Error al obtener la clasificación');
  }
});

// ─── GET /api/fixtures/:league/:group ───────────────────────────────────────
// Devuelve los próximos partidos. Query param ?next=N (default 15)
router.get('/fixtures/:league/:group', validateLeagueGroup, async (req, res) => {
  const next = Math.min(parseInt(req.query.next, 10) || 15, 30);
  try {
    const result = await getFixtures(req.leagueId, next);
    res.json(result);
  } catch (err) {
    handleServiceError(err, res, 'Error al obtener los próximos partidos');
  }
});

// ─── GET /api/results/:league/:group ────────────────────────────────────────
// Devuelve los resultados recientes. Query param ?last=N (default 15)
router.get('/results/:league/:group', validateLeagueGroup, async (req, res) => {
  const last = Math.min(parseInt(req.query.last, 10) || 15, 30);
  try {
    const result = await getRecentResults(req.leagueId, last);
    res.json(result);
  } catch (err) {
    handleServiceError(err, res, 'Error al obtener los resultados recientes');
  }
});

// ─── GET /api/live ───────────────────────────────────────────────────────────
// Devuelve todos los partidos de las ligas RFEF que están en curso ahora mismo.
// Se puede filtrar por liga: GET /api/live?league=primera
router.get('/live', async (req, res) => {
  let leagueIds = ALL_RFEF_IDS;

  if (req.query.league !== undefined) {
    // Validar también el query param ?league= si se usa
    const ql = req.query.league?.toLowerCase().trim();
    if (!VALID_LEAGUES.has(ql)) {
      return res.status(400).json({
        error: `Query param "league" no válido: "${req.query.league}"`,
        valid: [...VALID_LEAGUES],
      });
    }
    leagueIds = Object.values(LEAGUE_IDS[ql]);
  }

  try {
    const result = await getLiveFixtures(leagueIds);
    res.json(result);
  } catch (err) {
    handleServiceError(err, res, 'Error al obtener partidos en directo');
  }
});

// ─── GET /api/health ─────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  const callsToday   = getApiCallsToday();
  const remaining    = getQuotaRemaining();
  const DAILY_LIMIT  = 100;

  res.json({
    status:    'ok',
    uptime:    Math.floor(process.uptime()),
    quota: {
      callsToday,
      limit:     DAILY_LIMIT,
      remaining: remaining !== null ? remaining : DAILY_LIMIT - callsToday,
      exhausted: callsToday >= DAILY_LIMIT,
    },
    cache:     getCacheStats(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
