/**
 * live.js — Renderizado de partidos en directo
 *
 * Función expuesta globalmente:
 *   renderLive(container, fixtures)
 *
 * @param {HTMLElement} container - Nodo donde se inyecta el HTML
 * @param {Array}       fixtures  - Array de partidos en directo (formato api-sports)
 */

// formatLiveMinute viene de utils.js (cargado antes en index.html)

/**
 * Construye el HTML de una tarjeta de partido en directo.
 *
 * @param {Object} fixture - Objeto fixture de api-sports (endpoint live)
 * @returns {string} HTML de la tarjeta
 */
function buildLiveCard(fixture) {
  const info     = fixture.fixture  || {};
  const teams    = fixture.teams    || {};
  const goals    = fixture.goals    || {};
  const league   = fixture.league   || {};
  const status   = info.status      || {};
  const homeTeam = teams.home       || {};
  const awayTeam = teams.away       || {};

  const homeGoals = goals.home !== null && goals.home !== undefined ? goals.home : 0;
  const awayGoals = goals.away !== null && goals.away !== undefined ? goals.away : 0;

  const minuteDisplay = formatLiveMinute(status.short, status.elapsed);

  return `
    <article class="live-card" aria-label="Partido en directo: ${escapeHtml(homeTeam.name)} vs ${escapeHtml(awayTeam.name)}">

      <div class="live-card__header">
        <div class="live-badge" role="status" aria-live="polite">
          <span class="live-badge__dot" aria-hidden="true"></span>
          EN VIVO
        </div>
        <span class="live-league">${escapeHtml(league.name)}</span>
        <span class="live-minute" aria-label="Minuto ${minuteDisplay}">${minuteDisplay}</span>
      </div>

      <div class="live-card__body">

        <div class="live-team live-team--home">
          ${createTeamImg(homeTeam.logo, homeTeam.name || 'Local', 'team-logo--lg', 48)}
          <span class="live-team__name">${escapeHtml(homeTeam.name) || '—'}</span>
        </div>

        <div class="live-scoreboard" aria-label="Marcador ${homeGoals} a ${awayGoals}">
          <span class="live-score live-score--home">${homeGoals}</span>
          <span class="live-score__separator" aria-hidden="true">:</span>
          <span class="live-score live-score--away">${awayGoals}</span>
        </div>

        <div class="live-team live-team--away">
          <span class="live-team__name">${escapeHtml(awayTeam.name) || '—'}</span>
          ${createTeamImg(awayTeam.logo, awayTeam.name || 'Visitante', 'team-logo--lg', 48)}
        </div>

      </div>
    </article>
  `;
}

/**
 * Renderiza la sección de partidos en directo.
 *
 * @param {HTMLElement} container
 * @param {Array}       fixtures  - Partidos en directo. Array vacío = no hay partidos.
 */
function renderLive(container, fixtures) {
  if (!fixtures || fixtures.length === 0) {
    container.innerHTML = `
      <div class="empty-live">
        <div class="empty-live__icon" aria-hidden="true">⚽</div>
        <h2 class="empty-live__title">No hay partidos en directo</h2>
        <p class="empty-live__subtitle">
          La página se actualiza automáticamente cada 60 segundos.
        </p>
      </div>
    `;
    return;
  }

  const cards = fixtures.map(f => buildLiveCard(f)).join('');
  container.innerHTML = `
    <div class="live-list">
      ${cards}
    </div>
  `;
}
