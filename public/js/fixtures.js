/**
 * fixtures.js — Renderizado de próximos partidos y resultados recientes
 *
 * Funciones expuestas globalmente:
 *   renderFixtures(container, fixtures)   — próximos partidos
 *   renderResults(container, fixtures)    — resultados recientes
 *
 * @param {HTMLElement} container - Nodo donde se inyecta el HTML
 * @param {Array}       fixtures  - Array de fixtures (formato api-sports)
 */

// ─── Labels de estado del partido ────────────────────────────────────────────
const STATUS_LABELS = {
  FT:   'Final',
  AET:  'Prórroga',
  PEN:  'Penaltis',
  CANC: 'Cancelado',
  PST:  'Aplazado',
  ABD:  'Abandonado',
  AWD:  'W/O',
  WO:   'W/O',
  NS:   'No iniciado',
};

// formatMatchDate viene de utils.js (cargado antes en index.html)

/**
 * Genera el badge de estado (solo para resultados).
 * @param {string} statusShort - Código de estado ('FT', 'CANC', etc.)
 * @returns {string} HTML del badge
 */
function buildStatusBadge(statusShort) {
  const label = STATUS_LABELS[statusShort] || statusShort || '';
  if (!label) return '';
  return `<span class="status-badge status-${statusShort.toLowerCase()}">${label}</span>`;
}

/**
 * Construye el HTML de una tarjeta de partido.
 *
 * @param {Object}  fixture   - Objeto fixture de api-sports
 * @param {boolean} isResult  - true = mostrar marcador; false = mostrar "VS"
 * @returns {string} HTML de la tarjeta
 */
function buildFixtureCard(fixture, isResult) {
  const info    = fixture.fixture || {};
  const teams   = fixture.teams   || {};
  const goals   = fixture.goals   || {};
  const homeTeam = teams.home     || {};
  const awayTeam = teams.away     || {};
  const status   = info.status?.short || '';

  const dateHTML = formatMatchDate(info.date);

  // Marcador o "VS"
  let centerHTML;
  if (isResult) {
    const homeGoals = goals.home !== null && goals.home !== undefined ? goals.home : '?';
    const awayGoals = goals.away !== null && goals.away !== undefined ? goals.away : '?';
    centerHTML = `
      <div class="fixture-score" aria-label="${homeGoals} a ${awayGoals}">
        <span class="score-home">${homeGoals}</span>
        <span class="score-separator">–</span>
        <span class="score-away">${awayGoals}</span>
      </div>
    `;
  } else {
    centerHTML = `<div class="fixture-vs" aria-label="contra">VS</div>`;
  }

  const statusBadge = isResult ? buildStatusBadge(status) : '';

  return `
    <article class="fixture-card ${isResult ? 'fixture-card--result' : ''}">
      <div class="fixture-header">
        <span class="fixture-date">${dateHTML}</span>
        ${statusBadge}
      </div>
      <div class="fixture-body">
        <div class="fixture-team fixture-team--home">
          ${createTeamImg(homeTeam.logo, homeTeam.name, 'team-logo--md', 32)}
          <span class="team-name">${escapeHtml(homeTeam.name) || '—'}</span>
        </div>

        ${centerHTML}

        <div class="fixture-team fixture-team--away">
          <span class="team-name">${escapeHtml(awayTeam.name) || '—'}</span>
          ${createTeamImg(awayTeam.logo, awayTeam.name, 'team-logo--md', 32)}
        </div>
      </div>
      ${info.venue?.name
        ? `<div class="fixture-venue">${escapeHtml(info.venue.name)}${info.venue.city ? `, ${escapeHtml(info.venue.city)}` : ''}</div>`
        : ''}
    </article>
  `;
}

/**
 * Renderiza la lista de próximos partidos.
 *
 * @param {HTMLElement} container
 * @param {Array}       fixtures
 */
function renderFixtures(container, fixtures) {
  if (!fixtures || fixtures.length === 0) {
    container.innerHTML = `
      <p class="empty-message">No hay próximos partidos programados para este grupo.</p>
    `;
    return;
  }

  const cards = fixtures.map(f => buildFixtureCard(f, false)).join('');
  container.innerHTML = `<div class="fixtures-list">${cards}</div>`;
}

/**
 * Renderiza la lista de resultados recientes.
 *
 * @param {HTMLElement} container
 * @param {Array}       fixtures
 */
function renderResults(container, fixtures) {
  if (!fixtures || fixtures.length === 0) {
    container.innerHTML = `
      <p class="empty-message">No hay resultados recientes disponibles para este grupo.</p>
    `;
    return;
  }

  // Más recientes primero
  const sorted = fixtures.slice().sort(
    (a, b) => new Date(b.fixture?.date) - new Date(a.fixture?.date)
  );

  const cards = sorted.map(f => buildFixtureCard(f, true)).join('');
  container.innerHTML = `<div class="fixtures-list">${cards}</div>`;
}
