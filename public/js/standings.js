/**
 * standings.js — Renderizado de la tabla de clasificación
 *
 * Función expuesta globalmente:
 *   renderStandings(container, standings, league)
 *
 * @param {HTMLElement} container  - Nodo donde se inyecta el HTML
 * @param {Array}       standings  - Array de objetos de equipo (formato api-sports)
 * @param {string}      league     - 'primera' | 'segunda'
 */

// ─── Configuración de zonas por liga ─────────────────────────────────────────
const ZONE_CONFIG = {
  primera: {
    directPromotion: 2,   // Ascenso directo a Segunda División
    playoff:         5,   // Playoff de ascenso (hasta posición 5)
    relegation:      3,   // Últimos 3 descienden a Segunda RFEF
  },
  segunda: {
    directPromotion: 1,   // Ascenso directo a Primera RFEF
    playoff:         4,   // Playoff de ascenso (hasta posición 4)
    relegation:      3,   // Últimos 3 descienden a Tercera RFEF
  },
};

/**
 * Determina la clase CSS de zona según el ranking y el total de equipos.
 * @param {number} rank       - Posición (1-based)
 * @param {number} totalTeams - Total de equipos en el grupo
 * @param {Object} config     - Configuración de zonas para esta liga
 * @returns {string} Clase CSS ('zone-promotion' | 'zone-playoff' | 'zone-relegation' | '')
 */
function getZoneClass(rank, totalTeams, config) {
  if (rank <= config.directPromotion)                   return 'zone-promotion';
  if (rank <= config.playoff)                           return 'zone-playoff';
  if (rank > totalTeams - config.relegation)            return 'zone-relegation';
  return '';
}

/**
 * Renderiza los puntos de forma (últimos 5 partidos).
 * @param {string} form - Cadena tipo "WWDLW"
 * @returns {string} HTML con los indicadores de forma
 */
function renderFormIndicators(form) {
  if (!form) return '<span style="color: var(--color-text-secondary)">—</span>';

  const map = {
    W: { cls: 'form-win',  label: 'V', title: 'Victoria' },
    D: { cls: 'form-draw', label: 'E', title: 'Empate' },
    L: { cls: 'form-loss', label: 'D', title: 'Derrota' },
  };

  return form.split('').slice(-5).map(r => {
    const info = map[r] || { cls: '', label: r, title: r };
    return `<span class="form-dot ${info.cls}" title="${info.title}">${info.label}</span>`;
  }).join('');
}

/**
 * Genera el HTML de una fila de la tabla.
 */
function buildTableRow(entry, totalTeams, config) {
  const zoneClass = getZoneClass(entry.rank, totalTeams, config);
  const team      = entry.team || {};
  const all       = entry.all  || {};
  const goals     = all.goals  || {};

  return `
    <tr class="${zoneClass}">
      <td class="col-rank">
        <span class="rank-indicator ${zoneClass}-indicator" aria-hidden="true"></span>
        ${entry.rank}
      </td>
      <td class="col-team">
        <div class="team-info">
          ${createTeamImg(team.logo, '', '', 22)}
          <span class="team-name">${escapeHtml(team.name) || '—'}</span>
        </div>
      </td>
      <td class="col-stat">${all.played   ?? '—'}</td>
      <td class="col-stat">${all.win      ?? '—'}</td>
      <td class="col-stat">${all.draw     ?? '—'}</td>
      <td class="col-stat">${all.lose     ?? '—'}</td>
      <td class="col-stat">${goals.for    ?? '—'}</td>
      <td class="col-stat">${goals.against ?? '—'}</td>
      <td class="col-stat">${entry.goalsDiff ?? '—'}</td>
      <td class="col-pts"><strong>${entry.points ?? '—'}</strong></td>
      <td class="col-form">
        <div class="form-indicators">
          ${renderFormIndicators(entry.form)}
        </div>
      </td>
    </tr>
  `;
}

/**
 * Renderiza la tabla de clasificación completa en el contenedor dado.
 *
 * @param {HTMLElement} container  - Nodo destino
 * @param {Array}       standings  - Array de standings (formato api-sports)
 * @param {string}      league     - 'primera' | 'segunda'
 */
function renderStandings(container, standings, league) {
  if (!standings || standings.length === 0) {
    container.innerHTML = `
      <p class="empty-message">No hay datos de clasificación disponibles para este grupo.</p>
    `;
    return;
  }

  const config     = ZONE_CONFIG[league] || ZONE_CONFIG.primera;
  const totalTeams = standings.length;

  const rows = standings
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map(entry => buildTableRow(entry, totalTeams, config))
    .join('');

  container.innerHTML = `
    <div class="standings-wrapper">
      <table class="standings-table" aria-label="Clasificación">
        <thead>
          <tr>
            <th class="col-rank">#</th>
            <th class="col-team">Equipo</th>
            <th class="col-stat" title="Partidos jugados">PJ</th>
            <th class="col-stat" title="Ganados">G</th>
            <th class="col-stat" title="Empatados">E</th>
            <th class="col-stat" title="Perdidos">P</th>
            <th class="col-stat" title="Goles a favor">GF</th>
            <th class="col-stat" title="Goles en contra">GC</th>
            <th class="col-stat" title="Diferencia de goles">DG</th>
            <th class="col-pts">Pts</th>
            <th class="col-form">Forma</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div class="standings-legend" aria-label="Leyenda de zonas">
        <span class="legend-item legend-promotion">Ascenso directo</span>
        <span class="legend-item legend-playoff">Playoff de ascenso</span>
        <span class="legend-item legend-relegation">Descenso</span>
      </div>
    </div>
  `;
}
