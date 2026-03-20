/**
 * Servicio híbrido de datos RFEF — 100% gratuito.
 *
 * - Clasificación, Próximos, Resultados → TheSportsDB (sin key, gratuita)
 *   https://www.thesportsdb.com/api.php
 *
 * - Partidos en directo → api-sports v3 (plan gratuito, 100 calls/día)
 *   https://dashboard.api-football.com/
 *
 * TheSportsDB no requiere API Key (se usa la key pública "3").
 * api-sports requiere API_KEY en .env solo para el endpoint de en directo.
 */

require('dotenv').config();
const axios = require('axios');

// ─── IDs TheSportsDB (clasificación, fixtures, resultados) ───────────────────
const TSDB_IDS = {
  primera: {
    1: 5086, // Spanish Primera RFEF Group 1
    2: 5088, // Spanish Primera RFEF Group 2
  },
  segunda: {
    1: 5087, // Spanish Segunda RFEF Group 1
    2: 5089, // Spanish Segunda RFEF Group 2
    3: 5090, // Spanish Segunda RFEF Group 3
    4: 5091, // Spanish Segunda RFEF Group 4
    5: 5092, // Spanish Segunda RFEF Group 5
  },
};

// ─── IDs api-sports (solo para en directo) ───────────────────────────────────
const APISPORTS_IDS = {
  primera: { 1: 435, 2: 436 },
  segunda: { 1: 875, 2: 876, 3: 877, 4: 878, 5: 879 },
};
const ALL_APISPORTS_IDS = [435, 436, 875, 876, 877, 878, 879];

// LEAGUE_IDS exportado es el de TheSportsDB (lo usan las rutas)
const LEAGUE_IDS = TSDB_IDS;
const ALL_RFEF_IDS = Object.values(TSDB_IDS).flatMap(g => Object.values(g));

const SEASON      = '2025-2026';
const SEASON_APISPORTS = 2024; // plan gratuito: máx 2024

// ─── TTLs en segundos ───────────────────────────────────────────────────────
const TTL = {
  standings: 10 * 60,
  fixtures:  30 * 60,
  results:   10 * 60,
  live:      60,
};

// ─── Caché en memoria ───────────────────────────────────────────────────────
const cache = new Map();
let apiCallsToday = 0;   // llamadas reales a api-sports (cuota 100/día)
let quotaRemaining = 100;

function getCached(key) {
  if (!cache.has(key)) return null;
  const entry = cache.get(key);
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry;
}

function setCache(key, data, ttlSeconds) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
    cachedAt:  new Date().toISOString(),
  });
}

function getCacheStats() {
  return { keys: cache.size, entries: [...cache.keys()] };
}

// ─── Cliente TheSportsDB (sin key) ──────────────────────────────────────────
const tsdbClient = axios.create({
  baseURL: 'https://www.thesportsdb.com/api/v1/json/123',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept':     'application/json',
  },
  timeout: 10_000,
});

// ─── Cliente api-sports (con key, solo para live) ────────────────────────────
const apiSportsClient = axios.create({
  baseURL: 'https://v3.football.api-sports.io',
  headers: { 'x-apisports-key': process.env.API_KEY },
  timeout: 10_000,
});

async function tsdbGet(endpoint, params = {}) {
  const response = await tsdbClient.get(endpoint, { params });
  return response.data;
}

async function apiSportsGet(endpoint, params = {}) {
  apiCallsToday++;
  console.log(`[API-SPORTS] Llamada #${apiCallsToday} → ${endpoint}`);
  const response = await apiSportsClient.get(endpoint, { params });
  const data = response.data;

  const remaining = response.headers['x-ratelimit-requests-remaining'];
  if (remaining !== undefined) {
    quotaRemaining = parseInt(remaining, 10);
    if (quotaRemaining <= 10) {
      console.warn(`[API-SPORTS] ⚠️  Cuota baja: ${quotaRemaining} restantes`);
    }
  }

  if (data.errors && Object.keys(data.errors).length > 0) {
    const errorMsg = Object.values(data.errors).join(', ');
    const isQuotaError = /request limit|rate limit|quota/i.test(errorMsg);
    const err = new Error(isQuotaError ? 'QUOTA_EXCEEDED' : `api-sports: ${errorMsg}`);
    err.isQuotaExhausted = isQuotaError;
    throw err;
  }

  return data;
}

// ─── Helpers de transformación ───────────────────────────────────────────────

function mapStandingRow(row) {
  return {
    rank:        parseInt(row.intRank, 10),
    team: {
      id:   parseInt(row.idTeam, 10),
      name: row.strTeam,
      logo: row.strBadge ? row.strBadge.replace('/tiny', '') : null,
    },
    points:      parseInt(row.intPoints, 10),
    goalsDiff:   parseInt(row.intGoalDifference, 10),
    group:       row.strLeague,
    form:        row.strForm || '',
    status:      'same',
    description: row.strDescription || '',
    all: {
      played: parseInt(row.intPlayed, 10),
      win:    parseInt(row.intWin, 10),
      draw:   parseInt(row.intDraw, 10),
      lose:   parseInt(row.intLoss, 10),
      goals: {
        for:     parseInt(row.intGoalsFor, 10),
        against: parseInt(row.intGoalsAgainst, 10),
      },
    },
  };
}

function mapFixture(event) {
  const hasScore   = event.intHomeScore !== null && event.intHomeScore !== '' && event.intHomeScore !== undefined;
  const statusShort = hasScore ? 'FT' : 'NS';
  const dateStr    = event.strTimestamp
    ? event.strTimestamp + 'Z'
    : (event.dateEvent || '') + 'T' + (event.strTime || '00:00:00') + 'Z';

  return {
    fixture: {
      id:   parseInt(event.idEvent, 10),
      date: dateStr,
      status: {
        short:   statusShort,
        long:    hasScore ? 'Match Finished' : 'Not Started',
        elapsed: null,
      },
      venue: { name: event.strVenue || null },
    },
    league: {
      id:     parseInt(event.idLeague, 10),
      name:   event.strLeague,
      logo:   event.strLeagueBadge || null,
      season: SEASON,
      round:  event.intRound ? `Jornada ${event.intRound}` : '',
    },
    teams: {
      home: {
        id:     parseInt(event.idHomeTeam, 10),
        name:   event.strHomeTeam,
        logo:   event.strHomeTeamBadge || null,
        winner: hasScore ? parseInt(event.intHomeScore, 10) > parseInt(event.intAwayScore, 10) : null,
      },
      away: {
        id:     parseInt(event.idAwayTeam, 10),
        name:   event.strAwayTeam,
        logo:   event.strAwayTeamBadge || null,
        winner: hasScore ? parseInt(event.intAwayScore, 10) > parseInt(event.intHomeScore, 10) : null,
      },
    },
    goals: {
      home: hasScore ? parseInt(event.intHomeScore, 10) : null,
      away: hasScore ? parseInt(event.intAwayScore, 10) : null,
    },
  };
}

// ─── Funciones públicas ─────────────────────────────────────────────────────

async function getStandings(leagueId) {
  const key = `standings:${leagueId}`;
  const cached = getCached(key);
  if (cached) {
    console.log(`[CACHE HIT] ${key}`);
    return { data: cached.data, cached: true, cachedAt: cached.cachedAt };
  }

  console.log(`[TSDB] GET /lookuptable league=${leagueId} season=${SEASON}`);
  const raw  = await tsdbGet('/lookuptable.php', { l: leagueId, s: SEASON });
  const data = (raw.table || []).map(mapStandingRow);

  setCache(key, data, TTL.standings);
  return { data, cached: false, cachedAt: getCached(key).cachedAt };
}

async function getFixtures(leagueId, next = 15) {
  const key = `fixtures:${leagueId}`;
  const cached = getCached(key);
  if (cached) {
    console.log(`[CACHE HIT] ${key}`);
    return { data: cached.data, cached: true, cachedAt: cached.cachedAt };
  }

  console.log(`[TSDB] GET /eventsseason league=${leagueId} season=${SEASON}`);
  const raw = await tsdbGet('/eventsseason.php', { id: leagueId, s: SEASON });
  const now = new Date().toISOString();

  const data = (raw.events || [])
    .filter(e => {
      const noScore = e.intHomeScore === null || e.intHomeScore === '' || e.intHomeScore === undefined;
      const inFuture = e.strTimestamp && (e.strTimestamp + 'Z') >= now;
      return noScore && inFuture;
    })
    .sort((a, b) => a.strTimestamp.localeCompare(b.strTimestamp))
    .slice(0, next)
    .map(mapFixture);

  setCache(key, data, TTL.fixtures);
  return { data, cached: false, cachedAt: getCached(key).cachedAt };
}

async function getRecentResults(leagueId, last = 15) {
  const key = `results:${leagueId}`;
  const cached = getCached(key);
  if (cached) {
    console.log(`[CACHE HIT] ${key}`);
    return { data: cached.data, cached: true, cachedAt: cached.cachedAt };
  }

  console.log(`[TSDB] GET /eventsseason league=${leagueId} season=${SEASON}`);
  const raw = await tsdbGet('/eventsseason.php', { id: leagueId, s: SEASON });

  const data = (raw.events || [])
    .filter(e => e.intHomeScore !== null && e.intHomeScore !== '' && e.intHomeScore !== undefined)
    .sort((a, b) => b.strTimestamp.localeCompare(a.strTimestamp))
    .slice(0, last)
    .map(mapFixture);

  setCache(key, data, TTL.results);
  return { data, cached: false, cachedAt: getCached(key).cachedAt };
}

/**
 * Partidos en directo vía api-sports (funciona en plan gratuito).
 * Filtra server-side por los IDs RFEF de api-sports.
 */
async function getLiveFixtures(leagueIds) {
  const key = `live:all`;
  const cached = getCached(key);
  if (cached) {
    console.log(`[CACHE HIT] ${key}`);
    const filtered = cached.data.filter(f => ALL_APISPORTS_IDS.includes(f.league?.id));
    return { data: filtered, cached: true, cachedAt: cached.cachedAt };
  }

  console.log(`[API-SPORTS] GET /fixtures live=all`);
  const raw    = await apiSportsGet('/fixtures', { live: 'all' });
  const allLive = raw.response || [];

  setCache(key, allLive, TTL.live);
  const data = allLive.filter(f => ALL_APISPORTS_IDS.includes(f.league?.id));
  return { data, cached: false, cachedAt: getCached(key).cachedAt };
}

function resetApiCallsCounter() {
  apiCallsToday = 0;
  console.log('[CRON] Contador de llamadas api-sports reseteado a 0');
}

module.exports = {
  getStandings,
  getFixtures,
  getRecentResults,
  getLiveFixtures,
  LEAGUE_IDS,
  ALL_RFEF_IDS,
  SEASON,
  getCacheStats,
  getQuotaRemaining:   () => quotaRemaining,
  getApiCallsToday:    () => apiCallsToday,
  resetApiCallsCounter,
};
