/**
 * app.js — Controlador principal de RFEF Live
 *
 * Responsabilidades:
 *  — Estado de la app (tab, liga, grupo) con persistencia en localStorage
 *  — Caché de cliente de 2 min: respuesta instantánea en recargas
 *  — Fallback a datos obsoletos cuando la cuota de la API se agota
 *  — Polling de 60s solo en "En Directo" (con limpieza correcta)
 *  — Contador de llamadas API en el footer
 *  — Badge con número de partidos activos en la tab "En Directo"
 */

// ═══════════════════════════════════════════════════════════════════
//  ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════════════

const state = {
  tab:    'standings',
  league: 'primera',
  group:  '1',
};

const GROUPS_BY_LEAGUE = {
  primera: ['1', '2'],
  segunda: ['1', '2', '3', '4', '5'],
};

let livePollingInterval = null;

// ═══════════════════════════════════════════════════════════════════
//  ARRANQUE
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  loadStateFromStorage();
  setupTabListeners();
  setupLeagueListeners();
  setupGroupListeners();
  setupRetryListener();      // Delegación de eventos para el botón "Reintentar"
  setupImageErrorHandler();  // Fallback global para logos rotos (evita onerror inline)
  renderGroupButtons();
  fetchAndUpdateQuota();
  loadContent();
});

// ═══════════════════════════════════════════════════════════════════
//  PERSISTENCIA DE ESTADO (liga / grupo / tab activos)
// ═══════════════════════════════════════════════════════════════════

function loadStateFromStorage() {
  try {
    const saved = localStorage.getItem('rfef-live-state');
    if (!saved) return;

    const parsed = JSON.parse(saved);
    state.tab    = parsed.tab    || 'standings';
    state.league = parsed.league || 'primera';
    state.group  = parsed.group  || '1';

    // Sanity check: el grupo guardado debe ser válido para la liga guardada
    const validGroups = GROUPS_BY_LEAGUE[state.league] || ['1'];
    if (!validGroups.includes(state.group)) state.group = '1';
  } catch {
    // JSON inválido — usar defaults
  }
  applyStateToUI();
}

function saveStateToStorage() {
  localStorage.setItem('rfef-live-state', JSON.stringify(state));
}

function applyStateToUI() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === state.tab;
    btn.classList.toggle('tab-btn--active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-league]').forEach(btn => {
    btn.classList.toggle('filter-btn--active', btn.dataset.league === state.league);
  });
  setFiltersVisible(state.tab !== 'live');
}

// ═══════════════════════════════════════════════════════════════════
//  LISTENERS
// ═══════════════════════════════════════════════════════════════════

function setupTabListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === state.tab) return;

      state.tab = btn.dataset.tab;

      document.querySelectorAll('.tab-btn').forEach(b => {
        const active = b.dataset.tab === state.tab;
        b.classList.toggle('tab-btn--active', active);
        b.setAttribute('aria-selected', String(active));
      });

      stopPolling();
      setFiltersVisible(state.tab !== 'live');
      saveStateToStorage();
      loadContent();
    });
  });
}

function setupLeagueListeners() {
  document.querySelectorAll('[data-league]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.league === state.league) return;

      state.league = btn.dataset.league;
      state.group  = '1';

      document.querySelectorAll('[data-league]').forEach(b => {
        b.classList.toggle('filter-btn--active', b.dataset.league === state.league);
      });

      renderGroupButtons();
      saveStateToStorage();
      loadContent();
    });
  });
}

/**
 * Delegación de eventos para el botón "Reintentar" en el mensaje de error.
 * Evita usar onclick="loadContent()" inline (viola CSP script-src 'self').
 */
function setupRetryListener() {
  document.addEventListener('click', e => {
    if (e.target.classList.contains('btn-retry')) {
      loadContent();
    }
  });
}

/**
 * Fallback global para logos de equipo rotos.
 * Escucha eventos 'error' en fase de captura (necesario para <img>).
 * Sustituye al atributo onerror inline, compatible con CSP script-src 'self'.
 */
function setupImageErrorHandler() {
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;

    const size = parseInt(img.dataset.fallbackSize, 10) || 32;
    // Elimina el listener temporal para evitar bucles si el SVG también fallara
    img.dataset.fallbackSize = '';
    img.src = teamFallbackSvg(size);
  }, true); // true = fase de captura (los errores de img no burbujean)
}

function setupGroupListeners() {
  document.getElementById('group-buttons').addEventListener('click', e => {
    const btn = e.target.closest('[data-group]');
    if (!btn || btn.dataset.group === state.group) return;

    state.group = btn.dataset.group;

    document.querySelectorAll('[data-group]').forEach(b => {
      b.classList.toggle('filter-btn--active', b.dataset.group === state.group);
    });

    saveStateToStorage();
    loadContent();
  });
}

// ═══════════════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════════════

function renderGroupButtons() {
  const groups    = GROUPS_BY_LEAGUE[state.league] || ['1'];
  const container = document.getElementById('group-buttons');

  container.innerHTML = groups
    .map(g => `
      <button
        class="filter-btn ${g === state.group ? 'filter-btn--active' : ''}"
        data-group="${g}"
        aria-pressed="${g === state.group}"
      >Grupo ${g}</button>
    `)
    .join('');
}

function setFiltersVisible(visible) {
  document.getElementById('filters-bar').style.display = visible ? '' : 'none';
}

function getContentContainer() {
  return document.getElementById('content-area');
}

function showSkeleton(type) {
  const container = getContentContainer();
  const count     = type === 'standings' ? 12 : 6;
  const itemClass = type === 'standings' ? 'skeleton-row' : 'skeleton-card';

  container.innerHTML = `
    <div class="skeleton-wrapper" aria-busy="true" aria-label="Cargando...">
      ${Array(count).fill(`<div class="skeleton ${itemClass}"></div>`).join('')}
    </div>
  `;
}

function showError(message, detail = '') {
  getContentContainer().innerHTML = `
    <div class="error-message" role="alert">
      <p class="error-message__title">${escapeHtml(message)}</p>
      ${detail ? `<p class="error-message__details">${escapeHtml(detail)}</p>` : ''}
      <button class="btn-retry">Reintentar</button>
    </div>
  `;
}

/** Banner para cuota totalmente agotada sin datos locales disponibles */
function showQuotaExhaustedBanner() {
  getContentContainer().innerHTML = `
    <div class="error-message" role="alert">
      <p class="error-message__title">Cuota diaria agotada</p>
      <p class="error-message__details">
        Se han consumido las 100 llamadas diarias disponibles a la API.<br>
        Los datos volverán a actualizarse <strong>mañana a medianoche (UTC)</strong>.
      </p>
      <p class="error-message__details" style="margin-top:8px;font-size:11px;">
        Estado del servidor:
        <a href="/api/health" target="_blank" style="color:var(--color-accent)">/api/health</a>
      </p>
    </div>
  `;
}

/**
 * Banner informativo superpuesto encima del contenido (no lo reemplaza).
 * Se muestra cuando se sirven datos obsoletos tras agotar la cuota.
 * @param {string} savedAt - Timestamp ISO de cuándo se guardaron los datos
 */
function showStaleBanner(savedAt) {
  const container = getContentContainer();
  const time = new Date(savedAt).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  });

  const banner = document.createElement('div');
  banner.className = 'stale-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = `
    <span class="stale-banner__icon">⚠</span>
    Mostrando datos guardados (${time}) — límite diario de la API alcanzado
  `;
  container.insertBefore(banner, container.firstChild);
}

/**
 * Añade al pie del contenido la hora de la última actualización.
 * @param {boolean} cached   - true si los datos vienen de caché (servidor o cliente)
 * @param {string}  cachedAt - Timestamp ISO
 * @param {string}  [source] - 'servidor' | 'cliente'
 */
function appendCacheInfo(cached, cachedAt, source = 'servidor') {
  if (!cachedAt) return;

  const container = getContentContainer();
  const info      = document.createElement('div');
  info.className  = 'cache-info';

  const time = new Date(cachedAt).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Europe/Madrid',
  });

  if (!cached) {
    info.textContent = `Actualizado · ${time}`;
  } else if (source === 'cliente') {
    info.textContent = `Caché local · ${time}`;
  } else {
    info.textContent = `Caché servidor · ${time}`;
  }

  container.appendChild(info);
}

// ═══════════════════════════════════════════════════════════════════
//  BADGE DE PARTIDOS EN DIRECTO (tab "En Directo")
// ═══════════════════════════════════════════════════════════════════

/**
 * Actualiza el badge rojo con el número de partidos activos en la tab.
 * Si count === 0 oculta el badge.
 * @param {number} count
 */
function updateLiveCountBadge(count) {
  const badge = document.getElementById('live-count-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.removeAttribute('hidden');
  } else {
    badge.setAttribute('hidden', '');
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CONTADOR DE CUOTA EN EL FOOTER
// ═══════════════════════════════════════════════════════════════════

/** Consulta /api/health y actualiza el display del footer. */
async function fetchAndUpdateQuota() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return;
    const health = await res.json();
    updateQuotaDisplay(health.quota?.callsToday, health.quota?.limit || 100);
  } catch {
    // No crítico — silencioso
  }
}

/**
 * Actualiza el texto del contador en el footer.
 * Cambia de color cuando la cuota se acerca al límite.
 */
function updateQuotaDisplay(calls, limit = 100) {
  const el = document.getElementById('api-quota-display');
  if (!el) return;

  if (calls === null || calls === undefined) {
    el.textContent = 'Llamadas API hoy: —/100';
    return;
  }

  el.textContent = `Llamadas API hoy: ${calls}/${limit}`;
  el.classList.toggle('quota-warning',  calls > limit * 0.80);  // >80% → naranja
  el.classList.toggle('quota-critical', calls > limit * 0.95);  // >95% → rojo
}

// ═══════════════════════════════════════════════════════════════════
//  FETCH HACIA NUESTRO BACKEND
// ═══════════════════════════════════════════════════════════════════

/**
 * Wrapper de fetch con manejo explícito de errores HTTP y cuota agotada.
 * Lanza Error('QUOTA_EXCEEDED') cuando el servidor devuelve HTTP 429.
 *
 * @param {string} path - Ruta relativa del backend
 * @returns {Promise<Object>}
 */
async function fetchAPI(path) {
  const response = await fetch(path);

  if (!response.ok) {
    let errorMsg = `Error del servidor (HTTP ${response.status})`;
    try {
      const body = await response.json();
      if (response.status === 429 || body.quotaInfo?.exhausted) {
        errorMsg = 'QUOTA_EXCEEDED';
      } else if (body.error) {
        errorMsg = body.error;
      }
    } catch {
      // Body no es JSON — usar mensaje genérico
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════
//  CARGA DE CONTENIDO
// ═══════════════════════════════════════════════════════════════════

async function loadContent() {
  stopPolling();

  const { tab, league, group } = state;

  switch (tab) {
    case 'standings': await loadStandings(league, group); break;
    case 'fixtures':  await loadFixtures(league, group);  break;
    case 'results':   await loadResults(league, group);   break;
    case 'live':
      showSkeleton('live');
      await loadLive(false);                      // false = usar caché de cliente si existe
      if (state.tab === 'live') startPolling();   // Guardia: evita race condition
      break;
  }
}

// ─── Patrón común para las 3 secciones con caché de cliente ─────────────────

/**
 * Carga una sección con 3 niveles de resiliencia:
 *  1. Caché en cliente (TTL 2 min) → respuesta instantánea, sin red
 *  2. Fetch al servidor → guarda en caché de cliente
 *  3. Cuota agotada (429) → sirve datos obsoletos del cliente con aviso
 *
 * @param {string}   cacheKey    - Clave de caché del cliente
 * @param {string}   apiPath     - Ruta del backend
 * @param {string}   skeletonType - 'standings' | 'fixtures'
 * @param {Function} renderFn    - Función de render recibe (container, data)
 * @param {string}   errorMsg    - Mensaje de error para el usuario
 */
async function loadSection(cacheKey, apiPath, skeletonType, renderFn, errorMsg) {
  const container = getContentContainer();

  // Nivel 1: caché de cliente (2 min)
  const clientHit = loadFromClientCache(cacheKey);
  if (clientHit) {
    renderFn(container, clientHit.data);
    appendCacheInfo(true, clientHit.savedAt, 'cliente');
    return;
  }

  // Nivel 2: fetch al servidor
  showSkeleton(skeletonType);
  try {
    const res = await fetchAPI(apiPath);
    saveToClientCache(cacheKey, res.data);
    renderFn(container, res.data);
    appendCacheInfo(res.cached, res.cachedAt);
    fetchAndUpdateQuota();   // Actualiza el footer en cada llamada real
  } catch (err) {
    if (err.message === 'QUOTA_EXCEEDED') {
      // Nivel 3: datos obsoletos del cliente como fallback
      const stale = loadStaleFromClientCache(cacheKey);
      if (stale) {
        renderFn(container, stale.data);
        showStaleBanner(stale.savedAt);
        updateQuotaDisplay(100, 100);
        return;
      }
      return showQuotaExhaustedBanner();
    }
    showError(errorMsg, err.message);
  }
}

async function loadStandings(league, group) {
  await loadSection(
    `standings-${league}-${group}`,
    `/api/standings/${league}/${group}`,
    'standings',
    (container, data) => renderStandings(container, data, league),
    'No se pudo cargar la clasificación.'
  );
}

async function loadFixtures(league, group) {
  await loadSection(
    `fixtures-${league}-${group}`,
    `/api/fixtures/${league}/${group}`,
    'fixtures',
    renderFixtures,
    'No se pudieron cargar los próximos partidos.'
  );
}

async function loadResults(league, group) {
  await loadSection(
    `results-${league}-${group}`,
    `/api/results/${league}/${group}`,
    'fixtures',
    renderResults,
    'No se pudieron cargar los resultados.'
  );
}

/**
 * Carga los partidos en directo.
 * @param {boolean} skipClientCache - true durante el polling para obtener siempre datos frescos
 */
async function loadLive(skipClientCache = false) {
  if (state.tab !== 'live') return;  // Guardia para llamadas de polling tardías

  const container = getContentContainer();
  const cacheKey  = 'live';

  // Caché de cliente (solo en carga inicial, no en polling)
  if (!skipClientCache) {
    const clientHit = loadFromClientCache(cacheKey);
    if (clientHit) {
      renderLive(container, clientHit.data);
      updateLiveCountBadge(clientHit.data?.length || 0);
      appendCacheInfo(true, clientHit.savedAt, 'cliente');
      return;
    }
  }

  try {
    const res = await fetchAPI('/api/live');
    saveToClientCache(cacheKey, res.data);
    renderLive(container, res.data);
    updateLiveCountBadge(res.data?.length || 0);
    appendCacheInfo(res.cached, res.cachedAt);
    if (!skipClientCache) fetchAndUpdateQuota();
  } catch (err) {
    if (err.message === 'QUOTA_EXCEEDED') {
      const stale = loadStaleFromClientCache(cacheKey);
      if (stale) {
        renderLive(container, stale.data);
        updateLiveCountBadge(stale.data?.length || 0);
        showStaleBanner(stale.savedAt);
        updateQuotaDisplay(100, 100);
        return;
      }
      return showQuotaExhaustedBanner();
    }
    // En polling: no sobreescribir contenido válido existente
    if (!container.querySelector('.live-card, .empty-live')) {
      showError('No se pudieron cargar los partidos en directo.', err.message);
    } else {
      console.warn('[RFEF Live] Error en polling (no crítico):', err.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  POLLING
// ═══════════════════════════════════════════════════════════════════

function startPolling() {
  stopPolling();
  livePollingInterval = setInterval(async () => {
    await loadLive(true);  // skipClientCache = true → siempre pide datos frescos
  }, 60_000);
}

function stopPolling() {
  if (livePollingInterval !== null) {
    clearInterval(livePollingInterval);
    livePollingInterval = null;
  }
}
