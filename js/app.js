/* js/app.js — Router, views, event binding */

// ── Navigation config ────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { hash: '#home',        label: 'Home',        icon: iconHome() },
  { hash: '#leaderboard', label: 'Standings',   icon: iconTrophy() },
  { hash: '#payouts',     label: 'Payouts',     icon: iconMoney() },
  { hash: '#rounds',      label: 'Rounds',      icon: iconFlag() },
  { hash: '#rules',       label: 'Rules',       icon: iconBook() },
];

const ROUND_NAV = [
  { hash: '#round1', label: 'Round 1' },
  { hash: '#round2', label: 'Round 2' },
  { hash: '#round3', label: 'Round 3' },
  { hash: '#setup',  label: 'Setup' },
];

// ── Router ───────────────────────────────────────────────────────────────────
const ROUTES = {
  '#home':        showHome,
  '#setup':       showSetup,
  '#round1':      () => showRound(1),
  '#round2':      showRound2,
  '#round3':      () => showRound(3),
  '#leaderboard': showLeaderboard,
  '#payouts':     showPayouts,
  '#rules':       showRules,
  '#rounds':      showRoundsMenu,
};

// Viewer mode: stored in sessionStorage so it persists across in-app navigation
// but resets when the browser/tab is closed (each session picks a role)
const IS_VIEWER = sessionStorage.getItem('bbc_role') === 'view';
let _viewerListenerRef = null;
let _viewerListenerFn  = null;

function attachViewerListener(hash) {
  if (!IS_VIEWER || typeof firebase === 'undefined') return;
  if (_viewerListenerRef && _viewerListenerFn) {
    _viewerListenerRef.off('value', _viewerListenerFn);
  }
  _viewerListenerRef = firebase.database().ref('bbc2026');
  _viewerListenerFn  = function(snap) {
    hydrateFromFirebase(snap.val() || {});
    const fn = ROUTES[hash] || showHome;
    fn();
  };
  _viewerListenerRef.on('value', _viewerListenerFn);
}

function route() {
  const hash = location.hash || '#home';
  const fn = ROUTES[hash] || showHome;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  fn();
  updateNav(hash);
  attachViewerListener(hash);
}

window.addEventListener('hashchange', route);
window.addEventListener('load', () => {
  buildNav();
  if (sessionStorage.getItem('bbc_role')) {
    route();
  } else {
    showRoleSelect();
  }
});

function showRoleSelect() {
  const currentRole = sessionStorage.getItem('bbc_role');
  const overlay = document.createElement('div');
  overlay.id = 'role-select';
  overlay.className = 'role-select-overlay';
  overlay.innerHTML = `
    <div class="role-select-card">
      <img src="assets/logo.jpeg" alt="BBC 2026" class="role-select-logo">
      <h1 class="role-select-title">Breakfast Ball Club</h1>
      <p class="role-select-subtitle">2026 Victoria Invitational</p>
      <p class="role-select-prompt">${currentRole ? 'Switch role' : 'How are you joining?'}</p>
      <div class="role-select-btns">
        <button class="btn role-btn role-btn-score ${currentRole === 'score' ? 'role-btn-active' : ''}" onclick="selectRole('score')">
          ${iconFlag()}
          <span class="role-btn-label">Scorekeeper</span>
          <span class="role-btn-desc">Enter scores for all players</span>
        </button>
        <button class="btn role-btn role-btn-view ${currentRole === 'view' ? 'role-btn-active' : ''}" onclick="selectRole('view')">
          ${iconTrophy()}
          <span class="role-btn-label">Viewer</span>
          <span class="role-btn-desc">Watch live scores &amp; standings</span>
        </button>
      </div>
      ${currentRole ? `<button class="btn btn-outline role-btn-cancel" onclick="document.getElementById('role-select').remove()">Cancel</button>` : ''}
    </div>
  `;
  document.getElementById('app').prepend(overlay);
}

function selectRole(role) {
  sessionStorage.setItem('bbc_role', role);
  const overlay = document.getElementById('role-select');
  if (overlay) overlay.remove();
  // Re-evaluate IS_VIEWER by reloading — simplest way to ensure all
  // downstream code sees the correct role without a full refactor
  location.reload();
}

function navigate(hash) { location.hash = hash; }

function updateNav(hash) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.hash === hash || (hash.startsWith('#round') && el.dataset.hash === '#rounds'));
  });
}

function buildNav() {
  const bottomNav = document.getElementById('bottom-nav');
  const sidebarNav = document.getElementById('sidebar-nav');
  const allItems = [...NAV_ITEMS];
  const role = sessionStorage.getItem('bbc_role');
  const roleLabel = role === 'view' ? 'Viewer' : 'Scorekeeper';
  const roleIcon = role === 'view' ? iconTrophy() : iconFlag();

  bottomNav.innerHTML = allItems.map(item => `
    <button class="nav-item" data-hash="${item.hash}" onclick="navigate('${item.hash}')">
      ${item.icon}
      <span>${item.label}</span>
    </button>
  `).join('');

  const sidebarItems = [
    ...NAV_ITEMS,
    ...ROUND_NAV.map(r => ({ ...r, icon: iconFlag(), sub: true })),
  ];
  sidebarNav.innerHTML = sidebarItems.map(item => `
    <button class="nav-item${item.sub ? ' sub' : ''}" data-hash="${item.hash}" onclick="navigate('${item.hash}')">
      ${item.icon || ''}
      <span>${item.label}</span>
    </button>
  `).join('') + `
    <button class="nav-item role-switch-btn" onclick="showRoleSelect()">
      ${roleIcon}
      <span>${roleLabel}</span>
    </button>
  `;
}

// ── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Home View ────────────────────────────────────────────────────────────────
function showHome() {
  const view = document.getElementById('view-home');
  view.classList.add('active');

  const players = loadPlayers();
  const r1 = loadRound(1), r2 = loadRound(2), r3 = loadRound(3);
  const overall = computeOverall(r1, r2, r3, players, loadRoundCourses());
  const setupDone = players.filter(p => p.name.trim()).length === 8;

  const rounds = [
    { num: 1, label: 'Round 1', format: 'Individual Net Stableford', data: r1 },
    { num: 2, label: 'Round 2', format: '2-Man Best Ball (Net)',      data: r2 },
    { num: 3, label: 'Round 3', format: 'Individual Net Stroke Play', data: r3 },
  ];

  const topStandings = overall.slice(0, 3);

  view.innerHTML = `
    <div class="tournament-banner">
      <div class="banner-eyebrow">Breakfast Ball Club</div>
      <div class="banner-title">Victoria Invitational 2026</div>
      <div class="banner-subtitle">Good golf. Great company.</div>
      <div class="banner-stats">
        <div>
          <div class="banner-stat-value">8</div>
          <div class="banner-stat-label">Players</div>
        </div>
        <div>
          <div class="banner-stat-value">$1,200</div>
          <div class="banner-stat-label">Total Pot</div>
        </div>
        <div>
          <div class="banner-stat-value">3</div>
          <div class="banner-stat-label">Rounds</div>
        </div>
      </div>
    </div>

    <div class="page-body">
      ${!setupDone ? `
        <div class="card" style="margin-bottom:var(--space-lg);border-top-color:var(--color-birdie)">
          <div class="card-body" style="text-align:center;padding:var(--space-lg)">
            <div style="font-size:32px;margin-bottom:8px">⛳</div>
            <div class="font-heading" style="font-size:18px;color:var(--color-green-dark);margin-bottom:8px">Welcome! Let's get set up.</div>
            <p style="color:var(--color-gray);font-size:14px;margin-bottom:var(--space-md)">Enter player names, handicaps, and course details before scoring begins.</p>
            <button class="btn btn-primary btn-lg" onclick="navigate('#setup')">Set Up Tournament</button>
          </div>
        </div>
      ` : ''}

      <div class="section-title">${iconFlag()} Rounds</div>
      <div class="card-grid" style="margin-bottom:var(--space-xl)">
        ${rounds.map(r => {
          const statusClass = r.data.status === 'complete' ? 'complete-round' : r.data.status === 'in_progress' ? 'active-round' : '';
          const statusBadge = r.data.status === 'complete'
            ? `<span class="round-card-status status-complete">✓ Complete</span>`
            : r.data.status === 'in_progress'
            ? `<span class="round-card-status status-in-progress">● In Progress</span>`
            : `<span class="round-card-status status-not-started">○ Not Started</span>`;
          return `
            <div class="round-card ${statusClass}" onclick="navigate('#round${r.num}')">
              <div class="round-card-label">Round ${r.num}</div>
              <div class="round-card-title">${r.format}</div>
              ${statusBadge}
            </div>
          `;
        }).join('')}
      </div>

      ${overall.length > 0 ? `
        <div class="section-title">${iconTrophy()} Current Standings</div>
        <div class="card" style="margin-bottom:var(--space-xl)">
          <table class="standings-table">
            <thead>
              <tr>
                <th style="width:40px"></th>
                <th>Player</th>
                <th style="text-align:right">R1</th>
                <th style="text-align:right">R2</th>
                <th style="text-align:right">R3</th>
                <th style="text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${overall.map((s, idx) => {
                const p = getPlayer(players, s.playerId);
                const podiumClass = idx === 0 ? 'podium-1' : idx === 1 ? 'podium-2' : idx === 2 ? 'podium-3' : '';
                const lastClass = idx === overall.length - 1 ? 'last-place' : '';
                const badge = idx < 3
                  ? `<span class="place-badge place-${idx+1}">${idx+1}</span>`
                  : `<span class="place-badge place-other">${idx+1}</span>`;
                return `
                  <tr class="${podiumClass} ${lastClass}">
                    <td style="text-align:center">${badge}</td>
                    <td class="player-name-cell">${p.name || 'Player ' + (p.id+1)}${lastClass ? '<span class="last-place-badge">🍺</span>' : ''}</td>
                    <td class="round-pts-cell">${fmtPts(s.r1)}</td>
                    <td class="round-pts-cell">${fmtPts(s.r2)}</td>
                    <td class="round-pts-cell">${fmtPts(s.r3)}</td>
                    <td class="points-cell">${fmtPts(s.total)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <div class="section-title">Quick Links</div>
      <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-bottom:var(--space-xl)">
        <button class="btn btn-outline" onclick="navigate('#setup')">⚙ Setup</button>
        <button class="btn btn-outline" onclick="navigate('#leaderboard')">🏆 Leaderboard</button>
        <button class="btn btn-outline" onclick="navigate('#payouts')">💰 Payouts</button>
        <button class="btn btn-outline" onclick="navigate('#rules')">📖 Rules</button>
      </div>

      <div class="role-home-card" onclick="showRoleSelect()">
        <div class="role-home-icon">${IS_VIEWER ? iconTrophy() : iconFlag()}</div>
        <div class="role-home-text">
          <div class="role-home-label">You are: <strong>${IS_VIEWER ? 'Viewer' : 'Scorekeeper'}</strong></div>
          <div class="role-home-hint">Tap to switch role</div>
        </div>
        <div class="role-home-arrow">›</div>
      </div>

    </div>
  `;
}

// ── Rounds Menu (mobile "Rounds" nav tab) ────────────────────────────────────
function showRoundsMenu() {
  const view = document.getElementById('view-home');
  view.classList.add('active');

  view.innerHTML = `
    <div class="tournament-banner">
      <div class="banner-eyebrow">Breakfast Ball Club 2026</div>
      <div class="banner-title">Scorecard Entry</div>
    </div>
    <div class="page-body">
      <div class="card-grid">
        ${[1,2,3].map(n => `
          <div class="round-card" onclick="navigate('#round${n}')">
            <div class="round-card-label">Round ${n}</div>
            <div class="round-card-title">${['Individual Net Stableford','2-Man Best Ball (Net)','Individual Net Stroke Play'][n-1]}</div>
            <div style="margin-top:8px"><span class="btn btn-primary btn-sm">Enter Scores →</span></div>
          </div>
        `).join('')}
        <div class="round-card" onclick="navigate('#setup')">
          <div class="round-card-label">Admin</div>
          <div class="round-card-title">Tournament Setup</div>
          <div style="margin-top:8px"><span class="btn btn-outline btn-sm">Open Setup →</span></div>
        </div>
      </div>
    </div>
  `;
}

// ── Setup View ───────────────────────────────────────────────────────────────
function showSetup() {
  const view = document.getElementById('view-setup');
  view.classList.add('active');

  const players = loadPlayers();
  const courses = loadRoundCourses();

  // Build course editor for one round
  function courseEditor(roundNum) {
    const c = courses[roundNum - 1];
    const presetOpts = COURSE_PRESETS.map(p =>
      `<option value="${p.id}" ${c.presetId === p.id ? 'selected' : ''}>${p.name}${p.location ? ' — ' + p.location : ''}</option>`
    ).join('');

    return `
      <div class="card" style="margin-bottom:var(--space-lg)" id="course-card-r${roundNum}">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <span>Round ${roundNum} Course</span>
          <span style="font-weight:400;font-size:11px;opacity:0.8">${['Stableford','Best Ball','Stroke Play'][roundNum-1]}</span>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Select Course</label>
            <select class="form-input" id="preset-r${roundNum}" data-round="${roundNum}">
              ${presetOpts}
            </select>
          </div>
          ${c.presetId === 'bear-mountain' ? `<p class="badge badge-gold" style="margin-bottom:var(--space-sm);display:inline-block">⚠ Estimated layout — verify par &amp; SI before play</p>` : ''}
          <div class="form-group">
            <label class="form-label">Course Name <span style="font-weight:400;font-style:italic">(editable)</span></label>
            <input class="form-input" type="text" id="course-name-r${roundNum}" value="${escHtml(c.name)}" placeholder="Course name">
          </div>
          <details>
            <summary style="cursor:pointer;font-size:13px;color:var(--color-green);font-weight:600;margin-bottom:var(--space-sm)">
              Edit Par &amp; Stroke Index ▾
            </summary>
            <div class="scorecard-wrapper" style="margin-top:var(--space-sm)">
              <table class="course-table" id="course-table-r${roundNum}">
                <thead>
                  <tr>
                    <th>Hole</th><th>Par</th><th>SI</th>
                    <th>Hole</th><th>Par</th><th>SI</th>
                  </tr>
                </thead>
                <tbody>
                  ${Array.from({length: 9}, (_, i) => `
                    <tr>
                      <td class="hole-num">${i+1}</td>
                      <td><input class="par-input" type="number" inputmode="numeric" min="3" max="5" value="${c.pars[i]}" data-round="${roundNum}" data-hole="${i}" data-field="par"></td>
                      <td><input class="si-input" type="number" inputmode="numeric" min="1" max="18" value="${c.strokeIndexes[i]}" data-round="${roundNum}" data-hole="${i}" data-field="si"></td>
                      <td class="hole-num">${i+10}</td>
                      <td><input class="par-input" type="number" inputmode="numeric" min="3" max="5" value="${c.pars[i+9]}" data-round="${roundNum}" data-hole="${i+9}" data-field="par"></td>
                      <td><input class="si-input" type="number" inputmode="numeric" min="1" max="18" value="${c.strokeIndexes[i+9]}" data-round="${roundNum}" data-hole="${i+9}" data-field="si"></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </details>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);margin-top:var(--space-md)">
            <div>
              <label class="form-label">CTP Hole (par 3)</label>
              <select class="form-input form-input-sm" id="ctp-r${roundNum}">
                ${Array.from({length:18}, (_,h) => `<option value="${h+1}" ${c.ctpHoles?.[0] === h+1 ? 'selected' : ''}>Hole ${h+1} (par ${c.pars[h]})</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="form-label">Long Drive Hole</label>
              <select class="form-input form-input-sm" id="ld-r${roundNum}">
                ${Array.from({length:18}, (_,h) => `<option value="${h+1}" ${c.longDriveHoles?.[0] === h+1 ? 'selected' : ''}>Hole ${h+1}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  view.innerHTML = `
    <div class="tournament-banner">
      <div class="banner-eyebrow">Admin</div>
      <div class="banner-title">Tournament Setup</div>
    </div>
    <div class="page-body">

      <!-- Players -->
      <div class="section-title">${iconPlayers()} Players &amp; Handicaps</div>
      <div class="card" style="margin-bottom:var(--space-xl)">
        <div class="card-body">
          <p style="font-size:13px;color:var(--color-gray);margin-bottom:var(--space-md)">Enter each player's name and their <strong>course handicap</strong> (already adjusted for slope/rating).</p>
          <div id="players-form">
            ${players.map((p, i) => `
              <div class="player-row">
                <span class="player-num">${i + 1}</span>
                <input class="form-input" type="text" placeholder="Player ${i+1} name" value="${escHtml(p.name)}" data-player-name="${i}" autocomplete="off" autocorrect="off" spellcheck="false">
                <input class="form-input handicap-input" type="number" inputmode="numeric" min="0" max="54" value="${p.handicap}" data-player-hcp="${i}" title="Course handicap">
              </div>
            `).join('')}
          </div>
          <div style="margin-top:var(--space-md)">
            <button class="btn btn-primary" id="save-players-btn">Save Players</button>
          </div>
        </div>
      </div>

      <!-- Courses (one per round) -->
      <div class="section-title">⛳ Courses</div>
      <p style="font-size:13px;color:var(--color-gray);margin-bottom:var(--space-md)">Each round can be played on a different course. Select a preset to auto-fill par and stroke index, then adjust if needed.</p>
      ${courseEditor(1)}
      ${courseEditor(2)}
      ${courseEditor(3)}

      <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-bottom:var(--space-xl)">
        <button class="btn btn-gold btn-lg" id="save-all-btn">Save All Settings</button>
        <button class="btn btn-outline" onclick="navigate('#home')">← Back to Home</button>
      </div>

      <div class="card" style="border-top-color:var(--color-birdie);margin-bottom:var(--space-xl)">
        <div class="card-header" style="background:#8B0000">⚠ Danger Zone</div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--color-gray);margin-bottom:var(--space-md)">This will permanently delete all scores and reset the tournament.</p>
          <button class="btn btn-danger" id="reset-btn">Reset All Data</button>
        </div>
      </div>
    </div>
  `;

  // Preset picker — repopulate par/SI table when preset changes
  [1,2,3].forEach(n => {
    const sel = document.getElementById(`preset-r${n}`);
    sel.addEventListener('change', () => {
      const preset = COURSE_PRESETS.find(p => p.id === sel.value);
      if (!preset) return;
      document.getElementById(`course-name-r${n}`).value = preset.name;
      document.querySelectorAll(`[data-round="${n}"][data-field="par"]`).forEach(el => {
        el.value = preset.pars[+el.dataset.hole];
      });
      document.querySelectorAll(`[data-round="${n}"][data-field="si"]`).forEach(el => {
        el.value = preset.strokeIndexes[+el.dataset.hole];
      });
      // Update CTP/LD dropdowns with new pars
      const ctpSel = document.getElementById(`ctp-r${n}`);
      const ldSel  = document.getElementById(`ld-r${n}`);
      if (ctpSel) {
        const firstP3 = preset.pars.findIndex(p => p === 3);
        Array.from(ctpSel.options).forEach((opt, h) => {
          opt.text = `Hole ${h+1} (par ${preset.pars[h]})`;
        });
        ctpSel.value = firstP3 >= 0 ? firstP3 + 1 : 2;
      }
      if (ldSel) ldSel.value = 1;
    });
  });

  // Save players
  document.getElementById('save-players-btn').addEventListener('click', () => {
    const updated = players.map((p, i) => ({
      ...p,
      name: document.querySelector(`[data-player-name="${i}"]`).value.trim(),
      handicap: parseInt(document.querySelector(`[data-player-hcp="${i}"]`).value) || 0,
    }));
    savePlayers(updated);
    showToast('Players saved!');
  });

  // Save everything
  document.getElementById('save-all-btn').addEventListener('click', () => {
    // Players
    const updatedPlayers = players.map((p, i) => ({
      ...p,
      name: document.querySelector(`[data-player-name="${i}"]`).value.trim(),
      handicap: parseInt(document.querySelector(`[data-player-hcp="${i}"]`).value) || 0,
    }));
    savePlayers(updatedPlayers);

    // Per-round courses
    const updatedCourses = [1,2,3].map(n => {
      const pars = new Array(18);
      const sis  = new Array(18);
      document.querySelectorAll(`[data-round="${n}"][data-field="par"]`).forEach(el => { pars[+el.dataset.hole] = +el.value || 4; });
      document.querySelectorAll(`[data-round="${n}"][data-field="si"]`).forEach(el  => { sis[+el.dataset.hole]  = +el.value || 1; });
      const ctp = parseInt(document.getElementById(`ctp-r${n}`)?.value) || 1;
      const ld  = parseInt(document.getElementById(`ld-r${n}`)?.value)  || 1;
      return {
        presetId:      document.getElementById(`preset-r${n}`)?.value || 'custom',
        name:          document.getElementById(`course-name-r${n}`)?.value.trim() || 'Course',
        pars,
        strokeIndexes: sis,
        ctpHoles:      [ctp, ctp, ctp],
        longDriveHoles:[ld,  ld,  ld],
      };
    });
    saveRoundCourses(updatedCourses);
    // Keep legacy key in sync with round 1 for any fallback callers
    saveCourse(updatedCourses[0]);
    showToast('Settings saved!');
  });

  // Reset
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Delete ALL scores and reset the tournament? This cannot be undone.')) {
      clearAll();
      showToast('Tournament reset.');
      navigate('#home');
    }
  });
}

// ── Round 1 & 3 Scorecard ────────────────────────────────────────────────────
function showRound(num) {
  const viewId = `view-round${num}`;
  const view = document.getElementById(viewId);
  view.classList.add('active');

  const players      = loadPlayers();
  const course       = loadCourseForRound(num);
  const isStableford = num === 1;
  const namedPlayers = players.filter(p => p.name.trim());

  // Start on first incomplete hole, or hole 1
  function firstIncompleteHole() {
    const rd = loadRound(num);
    for (let h = 0; h < 18; h++) {
      const anyMissing = namedPlayers.some(p => {
        const ps = rd.scores.find(s => s.playerId === p.id);
        return !ps || !ps.gross[h];
      });
      if (anyMissing) return h;
    }
    return 0;
  }

  let currentHole = firstIncompleteHole();

  function render() {
    const rd   = loadRound(num);
    const h    = currentHole;
    const par  = course.pars[h];
    const si   = course.strokeIndexes[h];

    // Build one row per player
    const playerRows = namedPlayers.map(p => {
      const ps     = rd.scores.find(s => s.playerId === p.id);
      const gross  = ps?.gross?.[h] || '';
      const strokes = getStrokesReceived(p.handicap, si);
      const net    = gross ? cappedNet(gross, p.handicap, si, par) : null;
      const result = scoreResult(net, par);
      const metric = isStableford
        ? (net != null ? stablefordPoints(net, par) : null)
        : net;

      let metricHtml = '–';
      if (metric != null) {
        if (isStableford) {
          metricHtml = `<span class="stableford-pts pts-${metric}">${metric}</span>`;
        } else {
          metricHtml = `<span class="score-badge ${result}">${metric}</span>`;
        }
      }

      return `
        <tr class="hbh-player-row" data-player-id="${p.id}">
          <td class="hbh-name">${p.name || 'P'+(p.id+1)}</td>
          <td class="hbh-hdcp">${strokes > 0 ? '+'.repeat(strokes) : '–'}</td>
          <td class="hbh-gross-cell">
            <input class="score-input hbh-input" type="number" inputmode="numeric"
              pattern="[0-9]*" min="1" max="15"
              value="${gross}" placeholder="–"
              data-hole="${h}" data-round="${num}" data-player-id="${p.id}"
              data-handicap="${p.handicap}">
          </td>
          <td class="hbh-net-cell" data-player-id="${p.id}">${net != null ? `<span class="score-badge ${result}">${net}</span>` : '–'}</td>
          <td class="hbh-metric-cell" data-player-id="${p.id}">${metricHtml}</td>
        </tr>
      `;
    }).join('');

    // Progress: count holes where ALL players have a score
    const filledHoles = Array.from({length:18}, (_,i) =>
      namedPlayers.every(p => {
        const ps = rd.scores.find(s => s.playerId === p.id);
        return ps?.gross?.[i] > 0;
      })
    );
    const filled = filledHoles.filter(Boolean).length;

    // Hole progress dots
    const dots = Array.from({length:18}, (_,i) => {
      const done = filledHoles[i];
      const active = i === h;
      return `<span class="hole-dot ${done?'done':''} ${active?'current':''}" onclick="goToHole_R${num}(${i})" title="Hole ${i+1}"></span>`;
    }).join('');

    view.innerHTML = `
      <div class="tournament-banner">
        <div class="banner-eyebrow">Round ${num} — ${isStableford ? 'Stableford' : 'Stroke Play'}</div>
        <div class="banner-title">Hole ${h+1} of 18</div>
        <div class="banner-subtitle">${course.name}</div>
      </div>
      <div class="page-body" style="padding-top:var(--space-md)">

        <!-- Hole dots nav -->
        <div class="hole-dots">${dots}</div>
        <div style="font-size:12px;color:var(--color-gray);text-align:center;margin-bottom:var(--space-md)">${filled}/18 holes complete</div>

        <!-- Hole info card -->
        <div class="hbh-hole-card">
          <div class="hbh-hole-stat">
            <div class="hbh-hole-num">${h+1}</div>
            <div class="hbh-hole-label">HOLE</div>
          </div>
          <div class="hbh-hole-stat">
            <div class="hbh-hole-num">${par}</div>
            <div class="hbh-hole-label">PAR</div>
          </div>
          <div class="hbh-hole-stat">
            <div class="hbh-hole-num">${si}</div>
            <div class="hbh-hole-label">SI</div>
          </div>
          <div class="hbh-hole-stat" style="font-size:11px;color:var(--color-gray-light)">
            ${course.ctpHoles?.[0] === h+1 ? '<span class="badge badge-gold">CTP</span>' : ''}
            ${course.longDriveHoles?.[0] === h+1 ? '<span class="badge badge-green">LD</span>' : ''}
          </div>
        </div>

        <!-- Score entry table -->
        <div class="card" style="margin-bottom:var(--space-md)">
          <div class="card-header">
            <span>Enter Gross Scores</span>
            <span style="font-weight:400;font-size:11px">${isStableford ? 'Net Stableford Points' : 'Net Score'}</span>
          </div>
          <div class="card-body" style="padding:0">
            <table class="hbh-table" id="hbh-table-r${num}">
              <thead>
                <tr>
                  <th style="text-align:left">Player</th>
                  <th>Hdp</th>
                  <th>Gross</th>
                  <th>Net</th>
                  <th>${isStableford ? 'Pts' : 'Score'}</th>
                </tr>
              </thead>
              <tbody>${playerRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Prev / Next navigation -->
        <div class="hbh-nav">
          <button class="btn btn-outline hbh-nav-btn" ${h === 0 ? 'disabled' : ''} onclick="goToHole_R${num}(${h-1})">
            ← Hole ${h}
          </button>
          <button class="btn btn-gold hbh-nav-btn" ${h === 17 ? '' : ''} onclick="goToHole_R${num}(${h+1 < 18 ? h+1 : h})" ${h===17?'style="opacity:0.4"':''}>
            ${h < 17 ? `Hole ${h+2} →` : 'Last Hole'}
          </button>
        </div>

        <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-top:var(--space-md);margin-bottom:var(--space-xl)">
          ${rd.status !== 'complete'
            ? `<button class="btn btn-primary" id="finalize-r${num}">Finalize Round ${num}</button>`
            : `<span class="badge badge-green">✓ Round ${num} Complete</span>`}
          <button class="btn btn-outline" onclick="navigate('#home')">← Home</button>
        </div>
      </div>
    `;

    bindHoleInputs(num, h, namedPlayers, course, isStableford);

    const finalizeBtn = document.getElementById(`finalize-r${num}`);
    if (finalizeBtn) {
      finalizeBtn.addEventListener('click', () => {
        const rd2 = loadRound(num);
        rd2.status = 'complete';
        saveRound(num, rd2);
        showToast(`Round ${num} finalized!`);
        navigate('#leaderboard');
      });
    }

    // Auto-focus first empty input
    const firstEmpty = view.querySelector('.hbh-input:not([value]):not([value="0"]), .hbh-input[value=""]');
    if (firstEmpty) setTimeout(() => firstEmpty.focus(), 80);
  }

  window[`goToHole_R${num}`] = (h) => {
    if (h >= 0 && h < 18) { currentHole = h; render(); }
  };

  render();
}

function bindHoleInputs(roundNum, holeIndex, namedPlayers, course, isStableford) {
  document.querySelectorAll(`.hbh-input[data-round="${roundNum}"]`).forEach(input => {
    // Save on input (debounced) and update cells inline
    input.addEventListener('input', () => {
      const pid      = +input.dataset.playerId;
      const handicap = +input.dataset.handicap;
      const gross    = parseInt(input.value) || null;
      const h        = +input.dataset.hole;
      const par      = course.pars[h];
      const si       = course.strokeIndexes[h];

      // Update net + metric cell immediately (no debounce needed for display)
      const net    = gross ? cappedNet(gross, handicap, si, par) : null;
      const result = scoreResult(net, par);
      const netCell    = document.querySelector(`#view-round${roundNum} .hbh-net-cell[data-player-id="${pid}"]`);
      const metricCell = document.querySelector(`#view-round${roundNum} .hbh-metric-cell[data-player-id="${pid}"]`);

      if (netCell) {
        netCell.innerHTML = net != null ? `<span class="score-badge ${result}">${net}</span>` : '–';
      }
      if (metricCell) {
        if (net != null) {
          if (isStableford) {
            const pts = stablefordPoints(net, par);
            metricCell.innerHTML = `<span class="stableford-pts pts-${pts}">${pts}</span>`;
          } else {
            metricCell.innerHTML = `<span class="score-badge ${result}">${net}</span>`;
          }
        } else {
          metricCell.innerHTML = '–';
        }
      }

      // Debounce the localStorage write
      clearTimeout(scoreDebounceTimers[`${roundNum}-${pid}-${h}`]);
      scoreDebounceTimers[`${roundNum}-${pid}-${h}`] = setTimeout(() => {
        saveHoleScore(roundNum, pid, h, gross, handicap);
        // Update hole dot
        updateHoleDot(roundNum, h, namedPlayers);
      }, 400);
    });

    // On Enter / Tab — move to next player row or next hole
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const rows = [...document.querySelectorAll(`#view-round${roundNum} .hbh-input`)];
        const idx  = rows.indexOf(input);
        if (idx < rows.length - 1) {
          rows[idx + 1].focus();
          rows[idx + 1].select();
        } else if (holeIndex < 17) {
          window[`goToHole_R${roundNum}`](holeIndex + 1);
        }
      }
    });
  });
}

function updateHoleDot(roundNum, holeIndex, namedPlayers) {
  const rd = loadRound(roundNum);
  const allFilled = namedPlayers.every(p => {
    const ps = rd.scores.find(s => s.playerId === p.id);
    return ps?.gross?.[holeIndex] > 0;
  });
  const dot = document.querySelector(`#view-round${roundNum} .hole-dot:nth-child(${holeIndex + 1})`);
  if (dot) dot.classList.toggle('done', allFilled);
}

function buildScorecardTable(computed, grossScores, course, handicap, isStableford, roundNum, playerId) {
  const { pars, strokeIndexes } = course;

  function holeRows(start, end) {
    return Array.from({ length: end - start }, (_, i) => {
      const h = start + i;
      const gross = grossScores[h] || '';
      const net   = computed.net[h];
      const isCapped = gross && net !== null && (gross - getStrokesReceived(handicap, strokeIndexes[h])) > net;
      const result = scoreResult(net, pars[h]);
      const strokes = getStrokesReceived(handicap, strokeIndexes[h]);
      const metric = isStableford
        ? (computed.stableford[h] != null ? `<span class="stableford-pts pts-${computed.stableford[h]}">${computed.stableford[h]}</span>` : '–')
        : (net != null ? `<span class="score-badge ${result}${isCapped ? ' capped' : ''}">${net}</span>` : '–');

      return `
        <tr>
          <td class="hole-num">${h + 1}</td>
          <td>${pars[h]}</td>
          <td style="color:var(--color-gray);font-size:11px">${strokeIndexes[h]}</td>
          <td style="font-size:12px;color:var(--color-green-dark)">${strokes > 0 ? '+'.repeat(strokes) : '–'}</td>
          <td><input class="score-input" type="number" inputmode="numeric" pattern="[0-9]*" min="1" max="15"
               value="${gross}" data-hole="${h}" data-round="${roundNum}" data-player="${playerId}"
               placeholder="–"></td>
          <td>${net != null ? `<span class="score-badge ${result}${isCapped ? ' capped' : ''}">${net}</span>` : '–'}</td>
          <td>${metric}</td>
        </tr>
      `;
    }).join('');
  }

  const frontNet   = computed.net.slice(0,9).filter(n => n!=null).reduce((a,b)=>a+b,0);
  const backNet    = computed.net.slice(9).filter(n => n!=null).reduce((a,b)=>a+b,0);
  const frontPts   = computed.stableford.slice(0,9).filter(n => n!=null).reduce((a,b)=>a+b,0);
  const backPts    = computed.stableford.slice(9).filter(n => n!=null).reduce((a,b)=>a+b,0);
  const frontGross = grossScores.slice(0,9).filter(n => n>0).reduce((a,b)=>a+b,0);
  const backGross  = grossScores.slice(9).filter(n => n>0).reduce((a,b)=>a+b,0);
  const frontPar   = course.pars.slice(0,9).reduce((a,b)=>a+b,0);
  const backPar    = course.pars.slice(9).reduce((a,b)=>a+b,0);

  const metricLabel = isStableford ? 'Pts' : 'Net';

  return `
    <table class="scorecard-table">
      <thead>
        <tr>
          <th class="th-hole">Hole</th>
          <th>Par</th>
          <th>SI</th>
          <th>Hdp</th>
          <th>Gross</th>
          <th>Net</th>
          <th>${metricLabel}</th>
        </tr>
      </thead>
      <tbody>
        ${holeRows(0, 9)}
        <tr class="subtotal">
          <td colspan="1" style="text-align:left;padding-left:8px">OUT</td>
          <td>${frontPar}</td>
          <td></td>
          <td></td>
          <td>${frontGross || '–'}</td>
          <td>${computed.net.slice(0,9).some(n=>n!=null) ? frontNet : '–'}</td>
          <td>${isStableford ? (computed.stableford.slice(0,9).some(n=>n!=null) ? frontPts : '–') : (computed.net.slice(0,9).some(n=>n!=null) ? frontNet : '–')}</td>
        </tr>
        ${holeRows(9, 18)}
        <tr class="subtotal">
          <td colspan="1" style="text-align:left;padding-left:8px">IN</td>
          <td>${backPar}</td>
          <td></td>
          <td></td>
          <td>${backGross || '–'}</td>
          <td>${computed.net.slice(9).some(n=>n!=null) ? backNet : '–'}</td>
          <td>${isStableford ? (computed.stableford.slice(9).some(n=>n!=null) ? backPts : '–') : (computed.net.slice(9).some(n=>n!=null) ? backNet : '–')}</td>
        </tr>
        <tr class="total-row">
          <td colspan="4" style="text-align:left;padding-left:8px">TOTAL</td>
          <td>${(frontGross + backGross) || '–'}</td>
          <td>${computed.netTotal != null ? computed.netTotal : '–'}</td>
          <td style="font-size:17px">${isStableford ? (computed.stablefordTotal != null ? computed.stablefordTotal : '–') : (computed.netTotal != null ? computed.netTotal : '–')}</td>
        </tr>
      </tbody>
    </table>
  `;
}

let scoreDebounceTimers = {};

function bindScorecardEvents(roundNum, playerId, player, course, isStableford) {
  document.querySelectorAll(`.score-input[data-round="${roundNum}"][data-player="${playerId}"]`).forEach(input => {
    input.addEventListener('input', () => {
      const hole = +input.dataset.hole;
      clearTimeout(scoreDebounceTimers[`${roundNum}-${playerId}-${hole}`]);
      scoreDebounceTimers[`${roundNum}-${playerId}-${hole}`] = setTimeout(() => {
        saveHoleScore(roundNum, playerId, hole, parseInt(input.value) || null, player.handicap);
      }, 400);
    });
  });
}

function saveHoleScore(roundNum, playerId, holeIndex, gross, handicap) {
  const round = loadRound(roundNum);
  let ps = round.scores.find(s => s.playerId === playerId);
  if (!ps) {
    ps = { playerId, handicap, gross: new Array(18).fill(null) };
    round.scores.push(ps);
  }
  ps.handicap = handicap;
  ps.gross[holeIndex] = gross;
  if (round.status === 'not_started') round.status = 'in_progress';
  saveRound(roundNum, round);

  // Update computed cells live
  const course = loadCourseForRound(roundNum);
  const players = loadPlayers();
  const player = getPlayer(players, playerId);
  const computed = computePlayerRound(ps.gross, player.handicap, course.pars, course.strokeIndexes);
  updateComputedCells(roundNum, playerId, computed, ps.gross, course, player.handicap, roundNum === 1);
}

function updateComputedCells(roundNum, playerId, computed, grossScores, course, handicap, isStableford) {
  // Rebuild the table rather than patching individual cells to keep it simple
  const wrapper = document.querySelector(`#view-round${roundNum} .scorecard-wrapper`);
  if (!wrapper) return;
  const ps = { gross: grossScores };
  wrapper.innerHTML = buildScorecardTable(computed, grossScores, course, handicap, isStableford, roundNum, playerId);
  bindScorecardEvents(roundNum, playerId, { handicap }, course, isStableford);
}

function finalizeRound(num, namedPlayers, course, isStableford) {
  const round = loadRound(num);
  round.status = 'complete';
  saveRound(num, round);
  showToast(`Round ${num} finalized!`);
  navigate('#leaderboard');
}

// ── Round 2 View ─────────────────────────────────────────────────────────────
function showRound2() {
  const view = document.getElementById('view-round2');
  view.classList.add('active');

  const players      = loadPlayers();
  const course       = loadCourseForRound(2);
  const round        = loadRound(2);
  const namedPlayers = players.filter(p => p.name.trim());

  let subView = round.status !== 'not_started' ? 'scorecard' : 'teams';

  function firstIncompleteHole() {
    const rd = loadRound(2);
    for (let h = 0; h < 18; h++) {
      const anyMissing = rd.teams.some(team => {
        const ts = rd.scores.find(s => s.teamId === team.id);
        return !ts || !ts.playerScores[0]?.gross?.[h] || !ts.playerScores[1]?.gross?.[h];
      });
      if (anyMissing) return h;
    }
    return 0;
  }

  let currentHole = firstIncompleteHole();

  // ── Team Setup ──
  function renderTeamSetup() {
    const rd = loadRound(2);
    view.innerHTML = `
      <div class="tournament-banner">
        <div class="banner-eyebrow">Round 2</div>
        <div class="banner-title">2-Man Best Ball</div>
        <div class="banner-subtitle">Set up teams, then enter scores</div>
      </div>
      <div class="page-body">
        <div class="section-title">Team Pairings</div>
        <p style="font-size:13px;color:var(--color-gray);margin-bottom:var(--space-md)">Assign two players to each team. Use the random draw button or select manually.</p>
        <div style="margin-bottom:var(--space-md)">
          <button class="btn btn-outline" id="random-draw-btn">🎲 Random Draw</button>
        </div>
        <div class="teams-grid" id="teams-grid">
          ${rd.teams.map(team => buildTeamSlot(team, namedPlayers)).join('')}
        </div>
        <div style="margin-top:var(--space-lg);display:flex;gap:var(--space-sm);flex-wrap:wrap">
          <button class="btn btn-gold btn-lg" id="lock-teams-btn">Lock Teams & Enter Scores →</button>
          <button class="btn btn-outline" onclick="navigate('#home')">← Home</button>
        </div>
      </div>
    `;

    document.getElementById('random-draw-btn').addEventListener('click', () => {
      const shuffled = [...namedPlayers].sort(() => Math.random() - 0.5);
      const newTeams = [0,1,2,3].map(i => ({ id: i, players: [shuffled[i*2]?.id ?? i*2, shuffled[i*2+1]?.id ?? i*2+1] }));
      const rd2 = loadRound(2);
      rd2.teams = newTeams;
      saveRound(2, rd2);
      renderTeamSetup();
    });

    document.getElementById('lock-teams-btn').addEventListener('click', () => {
      const rd2 = loadRound(2);
      [0,1,2,3].forEach(i => {
        const selA = document.getElementById(`team-${i}-p0`);
        const selB = document.getElementById(`team-${i}-p1`);
        if (selA && selB) rd2.teams[i] = { id: i, players: [+selA.value, +selB.value] };
      });
      if (rd2.status === 'not_started') rd2.status = 'in_progress';
      saveRound(2, rd2);
      subView = 'scorecard';
      currentHole = 0;
      renderScorecard();
    });

    document.querySelectorAll('.team-player-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const rd2 = loadRound(2);
        rd2.teams[+sel.dataset.team].players[+sel.dataset.slot] = +sel.value;
        saveRound(2, rd2);
      });
    });
  }

  function buildTeamSlot(team, players) {
    return `
      <div class="team-card">
        <div class="team-card-label">Team ${team.id + 1}</div>
        <div class="team-player-slot">
          <select class="team-player-select" id="team-${team.id}-p0" data-team="${team.id}" data-slot="0">
            ${players.map(p => `<option value="${p.id}" ${team.players[0] === p.id ? 'selected' : ''}>${p.name || 'Player '+(p.id+1)}</option>`).join('')}
          </select>
        </div>
        <div class="team-player-slot">
          <select class="team-player-select" id="team-${team.id}-p1" data-team="${team.id}" data-slot="1">
            ${players.map(p => `<option value="${p.id}" ${team.players[1] === p.id ? 'selected' : ''}>${p.name || 'Player '+(p.id+1)}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
  }

  // ── Hole-by-hole scorecard ──
  function renderScorecard() {
    const rd  = loadRound(2);
    const h   = currentHole;
    const par = course.pars[h];
    const si  = course.strokeIndexes[h];

    // Build 2 rows per team (player A + player B) plus a best ball row
    const teamRows = rd.teams.map(team => {
      const pA = getPlayer(namedPlayers, team.players[0]);
      const pB = getPlayer(namedPlayers, team.players[1]);
      const ts = rd.scores.find(s => s.teamId === team.id);
      const gA = ts?.playerScores[0]?.gross?.[h] || '';
      const gB = ts?.playerScores[1]?.gross?.[h] || '';
      const stA = getStrokesReceived(pA.handicap, si);
      const stB = getStrokesReceived(pB.handicap, si);
      const nA  = gA ? cappedNet(gA, pA.handicap, si, par) : null;
      const nB  = gB ? cappedNet(gB, pB.handicap, si, par) : null;
      const bb  = (nA != null && nB != null) ? Math.min(nA, nB) : (nA ?? nB);
      const resA  = scoreResult(nA, par);
      const resB  = scoreResult(nB, par);
      const resBB = scoreResult(bb, par);

      return `
        <tr class="best-ball-row-a">
          <td rowspan="3" class="hbh-name" style="font-size:12px;font-weight:700;color:var(--color-gold)">T${team.id+1}</td>
          <td class="hbh-name" style="font-size:13px">${pA.name||'P'+(pA.id+1)}</td>
          <td class="hbh-hdcp">${stA > 0 ? '+'.repeat(stA) : '–'}</td>
          <td class="hbh-gross-cell">
            <input class="score-input hbh-input" type="number" inputmode="numeric" pattern="[0-9]*" min="1" max="15"
              value="${gA}" placeholder="–"
              data-hole="${h}" data-team-id="${team.id}" data-slot="0"
              data-handicap="${pA.handicap}" data-par="${par}" data-si="${si}">
          </td>
          <td class="hbh-net-cell r2-net-cell" data-team-id="${team.id}" data-slot="0">${nA != null ? `<span class="score-badge ${resA}">${nA}</span>` : '–'}</td>
        </tr>
        <tr class="best-ball-row-b">
          <td class="hbh-name" style="font-size:13px">${pB.name||'P'+(pB.id+1)}</td>
          <td class="hbh-hdcp">${stB > 0 ? '+'.repeat(stB) : '–'}</td>
          <td class="hbh-gross-cell">
            <input class="score-input hbh-input" type="number" inputmode="numeric" pattern="[0-9]*" min="1" max="15"
              value="${gB}" placeholder="–"
              data-hole="${h}" data-team-id="${team.id}" data-slot="1"
              data-handicap="${pB.handicap}" data-par="${par}" data-si="${si}">
          </td>
          <td class="hbh-net-cell r2-net-cell" data-team-id="${team.id}" data-slot="1">${nB != null ? `<span class="score-badge ${resB}">${nB}</span>` : '–'}</td>
        </tr>
        <tr class="best-ball-row-best">
          <td colspan="3" style="font-size:11px;letter-spacing:1px;padding-left:8px">BEST BALL</td>
          <td class="r2-bb-cell" data-team-id="${team.id}">${bb != null ? `<span class="score-badge ${resBB}" style="color:var(--color-gold-light)">${bb}</span>` : '–'}</td>
        </tr>
      `;
    }).join('');

    // Hole progress dots
    const filledHoles = Array.from({length:18}, (_,i) =>
      rd.teams.every(team => {
        const ts = rd.scores.find(s => s.teamId === team.id);
        return ts?.playerScores[0]?.gross?.[i] > 0 && ts?.playerScores[1]?.gross?.[i] > 0;
      })
    );
    const filled = filledHoles.filter(Boolean).length;
    const dots = Array.from({length:18}, (_,i) => {
      return `<span class="hole-dot ${filledHoles[i]?'done':''} ${i===h?'current':''}" onclick="goToHoleR2(${i})" title="Hole ${i+1}"></span>`;
    }).join('');

    view.innerHTML = `
      <div class="tournament-banner">
        <div class="banner-eyebrow">Round 2 — Best Ball</div>
        <div class="banner-title">Hole ${h+1} of 18</div>
        <div class="banner-subtitle">${course.name}</div>
      </div>
      <div class="page-body" style="padding-top:var(--space-md)">

        <div class="hole-dots">${dots}</div>
        <div style="font-size:12px;color:var(--color-gray);text-align:center;margin-bottom:var(--space-md)">${filled}/18 holes complete</div>

        <div class="hbh-hole-card">
          <div class="hbh-hole-stat"><div class="hbh-hole-num">${h+1}</div><div class="hbh-hole-label">HOLE</div></div>
          <div class="hbh-hole-stat"><div class="hbh-hole-num">${par}</div><div class="hbh-hole-label">PAR</div></div>
          <div class="hbh-hole-stat"><div class="hbh-hole-num">${si}</div><div class="hbh-hole-label">SI</div></div>
          <div class="hbh-hole-stat" style="font-size:11px">
            ${course.ctpHoles?.[0] === h+1 ? '<span class="badge badge-gold">CTP</span>' : ''}
            ${course.longDriveHoles?.[0] === h+1 ? '<span class="badge badge-green">LD</span>' : ''}
          </div>
        </div>

        <div class="card" style="margin-bottom:var(--space-md)">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <span>Enter Scores</span>
            <button class="btn btn-sm btn-outline" onclick="showRound2TeamSetup()">Edit Teams</button>
          </div>
          <div class="card-body" style="padding:0">
            <table class="hbh-table">
              <thead>
                <tr>
                  <th></th>
                  <th style="text-align:left">Player</th>
                  <th>Hdp</th>
                  <th>Gross</th>
                  <th>Net / BB</th>
                </tr>
              </thead>
              <tbody>${teamRows}</tbody>
            </table>
          </div>
        </div>

        <div class="hbh-nav">
          <button class="btn btn-outline hbh-nav-btn" ${h===0?'disabled':''} onclick="goToHoleR2(${h-1})">
            ← Hole ${h}
          </button>
          <button class="btn btn-gold hbh-nav-btn" onclick="goToHoleR2(${h<17?h+1:h})" ${h===17?'style="opacity:0.4"':''}>
            ${h < 17 ? `Hole ${h+2} →` : 'Last Hole'}
          </button>
        </div>

        <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-top:var(--space-md);margin-bottom:var(--space-xl)">
          ${rd.status !== 'complete'
            ? `<button class="btn btn-primary" id="finalize-r2">Finalize Round 2</button>`
            : `<span class="badge badge-green">✓ Round 2 Complete</span>`}
          <button class="btn btn-outline" onclick="navigate('#home')">← Home</button>
        </div>
      </div>
    `;

    bindR2HoleInputs(h, rd.teams, course);

    const finBtn = document.getElementById('finalize-r2');
    if (finBtn) finBtn.addEventListener('click', () => {
      const rd2 = loadRound(2);
      rd2.status = 'complete';
      saveRound(2, rd2);
      showToast('Round 2 finalized!');
      navigate('#leaderboard');
    });

    const firstEmpty = view.querySelector('.hbh-input[value=""]');
    if (firstEmpty) setTimeout(() => firstEmpty.focus(), 80);
  }

  function bindR2HoleInputs(holeIndex, teams, course) {
    document.querySelectorAll('#view-round2 .hbh-input').forEach(input => {
      input.addEventListener('input', () => {
        const teamId  = +input.dataset.teamId;
        const slot    = +input.dataset.slot;
        const h       = +input.dataset.hole;
        const gross   = parseInt(input.value) || null;
        const handicap= +input.dataset.handicap;
        const par     = +input.dataset.par;
        const si      = +input.dataset.si;

        // Live update net cell
        const net    = gross ? cappedNet(gross, handicap, si, par) : null;
        const result = scoreResult(net, par);
        const netCell = document.querySelector(`#view-round2 .r2-net-cell[data-team-id="${teamId}"][data-slot="${slot}"]`);
        if (netCell) netCell.innerHTML = net != null ? `<span class="score-badge ${result}">${net}</span>` : '–';

        // Live update best ball cell using latest inputs
        const team   = teams.find(t => t.id === teamId);
        const inputs = document.querySelectorAll(`#view-round2 .hbh-input[data-team-id="${teamId}"]`);
        const gA     = parseInt(inputs[0]?.value) || null;
        const gB     = parseInt(inputs[1]?.value) || null;
        const hcpA   = +inputs[0]?.dataset.handicap || 0;
        const hcpB   = +inputs[1]?.dataset.handicap || 0;
        const nA     = gA ? cappedNet(gA, hcpA, si, par) : null;
        const nB     = gB ? cappedNet(gB, hcpB, si, par) : null;
        const bb     = (nA != null && nB != null) ? Math.min(nA, nB) : (nA ?? nB);
        const resBB  = scoreResult(bb, par);
        const bbCell = document.querySelector(`#view-round2 .r2-bb-cell[data-team-id="${teamId}"]`);
        if (bbCell) bbCell.innerHTML = bb != null ? `<span class="score-badge ${resBB}" style="color:var(--color-gold-light)">${bb}</span>` : '–';

        // Debounced save
        clearTimeout(scoreDebounceTimers[`r2-${teamId}-${slot}-${h}`]);
        scoreDebounceTimers[`r2-${teamId}-${slot}-${h}`] = setTimeout(() => {
          const round = loadRound(2);
          let ts = round.scores.find(s => s.teamId === teamId);
          if (!ts) {
            ts = { teamId, playerScores: [
              { playerId: team.players[0], gross: new Array(18).fill(null) },
              { playerId: team.players[1], gross: new Array(18).fill(null) },
            ]};
            round.scores.push(ts);
          }
          if (!ts.playerScores[slot]) ts.playerScores[slot] = { playerId: team.players[slot], gross: new Array(18).fill(null) };
          if (!ts.playerScores[slot].gross || ts.playerScores[slot].gross.length < 18) ts.playerScores[slot].gross = new Array(18).fill(null);
          ts.playerScores[slot].gross[h] = gross;
          if (round.status === 'not_started') round.status = 'in_progress';
          saveRound(2, round);
          updateR2HoleDot(holeIndex, teams);
        }, 400);
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const all = [...document.querySelectorAll('#view-round2 .hbh-input')];
          const idx = all.indexOf(input);
          if (idx < all.length - 1) {
            all[idx + 1].focus();
            all[idx + 1].select();
          } else if (holeIndex < 17) {
            goToHoleR2(holeIndex + 1);
          }
        }
      });
    });
  }

  function updateR2HoleDot(h, teams) {
    const rd = loadRound(2);
    const allFilled = teams.every(team => {
      const ts = rd.scores.find(s => s.teamId === team.id);
      return ts?.playerScores[0]?.gross?.[h] > 0 && ts?.playerScores[1]?.gross?.[h] > 0;
    });
    const dot = document.querySelector(`#view-round2 .hole-dot:nth-child(${h+1})`);
    if (dot) dot.classList.toggle('done', allFilled);
  }

  window.goToHoleR2 = (h) => { if (h >= 0 && h < 18) { currentHole = h; renderScorecard(); } };
  window.showRound2TeamSetup = () => { subView = 'teams'; renderTeamSetup(); };

  if (subView === 'teams') renderTeamSetup(); else renderScorecard();
}


function saveBestBallScore(teamId, team, holeIndex, side, gross, playerA, playerB, course) {
  const round = loadRound(2);
  let ts = round.scores.find(s => s.teamId === teamId);
  if (!ts) {
    ts = {
      teamId,
      playerScores: [
        { playerId: team.players[0], gross: new Array(18).fill(null) },
        { playerId: team.players[1], gross: new Array(18).fill(null) },
      ],
    };
    round.scores.push(ts);
  }
  const psIdx = side === 'a' ? 0 : 1;
  if (!ts.playerScores[psIdx]) {
    ts.playerScores[psIdx] = { playerId: team.players[psIdx], gross: new Array(18).fill(null) };
  }
  if (!ts.playerScores[psIdx].gross || ts.playerScores[psIdx].gross.length < 18) {
    ts.playerScores[psIdx].gross = new Array(18).fill(null);
  }
  ts.playerScores[psIdx].gross[holeIndex] = gross;
  if (round.status === 'not_started') round.status = 'in_progress';
  saveRound(2, round);

  // Recompute with fresh handicap lookups
  const grossA = ts.playerScores[0]?.gross || new Array(18).fill(null);
  const grossB = ts.playerScores[1]?.gross || new Array(18).fill(null);
  const computedA = computePlayerRound(grossA, playerA.handicap, course.pars, course.strokeIndexes);
  const computedB = computePlayerRound(grossB, playerB.handicap, course.pars, course.strokeIndexes);

  // Update only output cells — don't replace inputs (avoids focus loss & re-bind issues)
  updateBestBallOutputCells(holeIndex, computedA, computedB, playerA, playerB, course);
}

function updateBestBallOutputCells(changedHole, computedA, computedB, playerA, playerB, course) {
  const { pars } = course;

  // Update all 18 holes' output cells (net + best ball)
  for (let h = 0; h < 18; h++) {
    const na = computedA.net[h];
    const nb = computedB.net[h];
    const bb = (na != null && nb != null) ? Math.min(na, nb)
             : (na != null ? na : nb);
    const resA  = scoreResult(na, pars[h]);
    const resB  = scoreResult(nb, pars[h]);
    const resBB = scoreResult(bb, pars[h]);

    const netCellA  = document.querySelector(`#view-round2 .net-cell-a[data-hole="${h}"]`);
    const netCellB  = document.querySelector(`#view-round2 .net-cell-b[data-hole="${h}"]`);
    const bbCell    = document.querySelector(`#view-round2 .bb-cell[data-hole="${h}"]`);

    if (netCellA) netCellA.innerHTML = na != null ? `<span class="score-badge ${resA}">${na}</span>` : '–';
    if (netCellB) netCellB.innerHTML = nb != null ? `<span class="score-badge ${resB}">${nb}</span>` : '–';
    if (bbCell)   bbCell.innerHTML   = bb != null ? `<span class="score-badge ${resBB}" style="color:var(--color-gold-light)">${bb}</span>` : '–';
  }

  // Update totals
  const bbFront = computedA.net.slice(0,9).map((na,i) => {
    const nb = computedB.net[i];
    return (na != null && nb != null) ? Math.min(na,nb) : (na ?? nb);
  }).filter(n=>n!=null).reduce((a,b)=>a+b,0);
  const bbBack = computedA.net.slice(9).map((na,i) => {
    const nb = computedB.net[i+9];
    return (na != null && nb != null) ? Math.min(na,nb) : (na ?? nb);
  }).filter(n=>n!=null).reduce((a,b)=>a+b,0);
  const bbTotal = bbFront + bbBack;

  const frontCell = document.querySelector('#view-round2 .bb-total-front');
  const backCell  = document.querySelector('#view-round2 .bb-total-back');
  const totalCell = document.querySelector('#view-round2 .bb-total-all');

  const hasFront = computedA.net.slice(0,9).some(n=>n!=null) || computedB.net.slice(0,9).some(n=>n!=null);
  const hasBack  = computedA.net.slice(9).some(n=>n!=null)   || computedB.net.slice(9).some(n=>n!=null);

  if (frontCell) frontCell.textContent = hasFront ? bbFront : '–';
  if (backCell)  backCell.textContent  = hasBack  ? bbBack  : '–';
  if (totalCell) totalCell.textContent = (hasFront || hasBack) ? bbTotal : '–';
}

// ── Leaderboard View ─────────────────────────────────────────────────────────
function showLeaderboard() {
  const view = document.getElementById('view-leaderboard');
  view.classList.add('active');

  const players = loadPlayers();
  const courses = loadRoundCourses();
  const r1 = loadRound(1), r2 = loadRound(2), r3 = loadRound(3);
  const namedPlayers = players.filter(p => p.name.trim());

  let activeTab = 'overall';

  function render() {
    const overall = computeOverall(r1, r2, r3, players, courses);

    function overallTable() {
      if (overall.length === 0) return `<div class="empty-state"><div class="empty-state-icon">🏆</div><div class="empty-state-title">No scores yet</div><p>Enter scores in the rounds to see standings.</p></div>`;
      return `
        <div class="card">
          <table class="standings-table">
            <thead><tr>
              <th style="width:40px"></th>
              <th>Player</th>
              <th style="text-align:right">R1</th>
              <th style="text-align:right">R2</th>
              <th style="text-align:right">R3</th>
              <th style="text-align:right">Total</th>
            </tr></thead>
            <tbody>
              ${overall.map((s, idx) => {
                const p = getPlayer(namedPlayers, s.playerId);
                const podiumClass = idx === 0 ? 'podium-1' : idx === 1 ? 'podium-2' : idx === 2 ? 'podium-3' : '';
                const lastClass   = idx === overall.length - 1 ? 'last-place' : '';
                const badge = idx < 3
                  ? `<span class="place-badge place-${idx+1}">${idx+1}</span>`
                  : `<span class="place-badge place-other">${idx+1}</span>`;
                return `
                  <tr class="${podiumClass} ${lastClass}">
                    <td style="text-align:center">${badge}</td>
                    <td class="player-name-cell">${p.name||'P'+(p.id+1)}${lastClass ? '<span class="last-place-badge" title="Buys drinks!">🍺</span>' : ''}</td>
                    <td class="round-pts-cell">${fmtPts(s.r1)}</td>
                    <td class="round-pts-cell">${fmtPts(s.r2)}</td>
                    <td class="round-pts-cell">${fmtPts(s.r3)}</td>
                    <td class="points-cell">${fmtPts(s.total)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function roundTable(num) {
      const rd = loadRound(num);
      if (rd.status === 'not_started' || rd.scores.length === 0) {
        return `<div class="empty-state"><div class="empty-state-title">Round ${num} not started</div></div>`;
      }
      const isStableford = num === 1;
      const rc = courses[num - 1];

      if (num === 2) {
        const teamScores = rd.scores.map(ts => {
          const computed = computeTeamRound(ts, namedPlayers, rc.pars, rc.strokeIndexes);
          return { ts, computed };
        }).sort((a,b) => (a.computed.total??999) - (b.computed.total??999));

        return `
          <div class="card">
            <table class="standings-table">
              <thead><tr><th></th><th>Team</th><th style="text-align:right">Net Total</th></tr></thead>
              <tbody>
                ${teamScores.map(({ ts, computed }, idx) => {
                  const team = rd.teams.find(t => t.id === ts.teamId);
                  const names = team?.players.map(pid => getPlayer(namedPlayers, pid).name || 'P'+(pid+1)).join(' / ') || 'Team';
                  const badge = idx < 3
                    ? `<span class="place-badge place-${idx+1}">${idx+1}</span>`
                    : `<span class="place-badge place-other">${idx+1}</span>`;
                  return `
                    <tr class="${idx===0?'podium-1':idx===1?'podium-2':idx===2?'podium-3':''}">
                      <td style="text-align:center">${badge}</td>
                      <td class="player-name-cell">${names}</td>
                      <td class="points-cell">${computed.total ?? '–'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      const playerScores = rd.scores.map(s => {
        const p = getPlayer(namedPlayers, s.playerId);
        const computed = computePlayerRound(s.gross||[], p.handicap, rc.pars, rc.strokeIndexes);
        return { s, p, computed, metric: isStableford ? computed.stablefordTotal : computed.netTotal };
      }).sort((a,b) => isStableford ? (b.metric??-1)-(a.metric??-1) : (a.metric??999)-(b.metric??999));

      return `
        <div class="card">
          <table class="standings-table">
            <thead><tr><th></th><th>Player</th><th style="text-align:right">Gross</th><th style="text-align:right">Net</th><th style="text-align:right">${isStableford?'Pts':'Net Total'}</th></tr></thead>
            <tbody>
              ${playerScores.map(({ s, p, computed, metric }, idx) => {
                const gross = (s.gross||[]).filter(g=>g>0).reduce((a,b)=>a+b,0);
                const badge = idx < 3
                  ? `<span class="place-badge place-${idx+1}">${idx+1}</span>`
                  : `<span class="place-badge place-other">${idx+1}</span>`;
                return `
                  <tr class="${idx===0?'podium-1':idx===1?'podium-2':idx===2?'podium-3':''}">
                    <td style="text-align:center">${badge}</td>
                    <td class="player-name-cell">${p.name||'P'+(p.id+1)}</td>
                    <td style="text-align:right;color:var(--color-gray)">${gross||'–'}</td>
                    <td style="text-align:right;color:var(--color-gray)">${computed.netTotal??'–'}</td>
                    <td class="points-cell">${metric??'–'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    view.innerHTML = `
      <div class="tournament-banner">
        <div class="banner-eyebrow">BBC 2026</div>
        <div class="banner-title">Leaderboard</div>
      </div>
      <div class="page-body">
        <div class="leaderboard-tabs">
          ${['overall','r1','r2','r3'].map(t => `
            <button class="lb-tab ${activeTab===t?'active':''}" onclick="setLBTab('${t}')">${t==='overall'?'Overall':'Round '+t[1]}</button>
          `).join('')}
        </div>
        <div id="lb-content">
          ${activeTab === 'overall' ? overallTable() : roundTable(+activeTab[1])}
        </div>
      </div>
    `;
  }

  window.setLBTab = (tab) => { activeTab = tab; render(); };
  render();
}

// ── Payouts View ─────────────────────────────────────────────────────────────
function showPayouts() {
  const view = document.getElementById('view-payouts');
  view.classList.add('active');

  const players  = loadPlayers();
  const courses  = loadRoundCourses();
  const r1 = loadRound(1), r2 = loadRound(2), r3 = loadRound(3);
  const overall  = computeOverall(r1, r2, r3, players, courses);
  const payouts  = computePayouts(overall, r1, r2, r3, players, courses);
  const namedPlayers = players.filter(p => p.name.trim());

  function playerOpts(selected) {
    return `<option value="">— Select —</option>` +
      namedPlayers.map(p => `<option value="${p.id}" ${selected==p.id?'selected':''}>${p.name||'P'+(p.id+1)}</option>`).join('');
  }

  function roundPayoutBlock(rNum, rd) {
    const label = ['Individual Stableford','Team Best Ball','Individual Stroke Play'][rNum-1];
    const pool  = [70,60,70][rNum-1];
    return `
      <div class="payout-section">
        <div class="payout-pool-header">
          <span class="payout-pool-title">Round ${rNum} Winner — ${label}</span>
          <span class="payout-pool-total">$${pool}</span>
        </div>
        ${rd.status === 'complete'
          ? buildRoundWinnerBlock(rNum, rd, players, courses[rNum-1], pool)
          : `<div class="payout-row"><span class="payout-label">Not finalized</span><span class="payout-amount unclaimed">–</span></div>`}
      </div>
    `;
  }

  view.innerHTML = `
    <div class="tournament-banner">
      <div class="banner-eyebrow">BBC 2026</div>
      <div class="banner-title">Payouts</div>
      <div class="banner-subtitle">Total Pot: $1,200</div>
    </div>
    <div class="page-body">

      <!-- Overall -->
      <div class="payout-section">
        <div class="payout-pool-header">
          <span class="payout-pool-title">Overall Winners</span>
          <span class="payout-pool-total">$760</span>
        </div>
        ${overall.length > 0 ? buildOverallPayoutRows(overall, players) : `<div class="payout-row"><span class="payout-label">No scores yet</span><span class="payout-amount unclaimed">–</span></div>`}
      </div>

      <!-- Round winners -->
      ${roundPayoutBlock(1, r1)}
      ${roundPayoutBlock(2, r2)}
      ${roundPayoutBlock(3, r3)}

      <!-- Side Games -->
      <div class="payout-section">
        <div class="payout-pool-header">
          <span class="payout-pool-title">Side Games</span>
          <span class="payout-pool-total">$240</span>
        </div>
        ${[1,2,3].map(n => {
          const rd = [r1,r2,r3][n-1];
          const rc = courses[n-1];
          return `
            <div class="payout-row">
              <div>
                <div class="payout-label">R${n} Closest to Pin (Hole ${rc.ctpHoles?.[0] ?? '?'})</div>
                <select class="side-game-select" id="ctp-winner-r${n}" data-round="${n}" data-type="ctp">
                  ${playerOpts(rd.ctpWinner)}
                </select>
              </div>
              <span class="payout-amount ${rd.ctpWinner==null?'unclaimed':''}">$40</span>
            </div>
            <div class="payout-row">
              <div>
                <div class="payout-label">R${n} Long Drive (Hole ${rc.longDriveHoles?.[0] ?? '?'})</div>
                <select class="side-game-select" id="ld-winner-r${n}" data-round="${n}" data-type="ld">
                  ${playerOpts(rd.longDriveWinner)}
                </select>
              </div>
              <span class="payout-amount ${rd.longDriveWinner==null?'unclaimed':''}">$40</span>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Summary by player -->
      ${buildPayoutSummaryTable(overall, payouts, namedPlayers)}

      <div style="margin-top:var(--space-lg);display:flex;gap:var(--space-sm)">
        <button class="btn btn-gold no-print" id="save-sidegames-btn">Save Side Game Winners</button>
        <button class="btn btn-outline no-print" onclick="window.print()">🖨 Print</button>
      </div>
    </div>
  `;

  document.getElementById('save-sidegames-btn').addEventListener('click', () => {
    [1,2,3].forEach(n => {
      const rd = loadRound(n);
      const ctpSel = document.getElementById(`ctp-winner-r${n}`);
      const ldSel  = document.getElementById(`ld-winner-r${n}`);
      rd.ctpWinner = ctpSel?.value !== '' ? +ctpSel.value : null;
      rd.longDriveWinner = ldSel?.value !== '' ? +ldSel.value : null;
      saveRound(n, rd);
    });
    showToast('Side game winners saved!');
    showPayouts();
  });
}

function buildOverallPayoutRows(overall, players) {
  const prizes = [400, 220, 140];
  const groups = [];
  let i = 0;
  while (i < overall.length) {
    let j = i + 1;
    while (j < overall.length && overall[j].total === overall[i].total) j++;
    groups.push(overall.slice(i, j));
    i = j;
  }

  let pos = 0;
  return groups.map(group => {
    const poolSlice = prizes.slice(pos, pos + group.length);
    const total = poolSlice.reduce((a,b)=>a+b,0);
    const split = total / group.length;
    pos += group.length;
    if (pos > prizes.length) return '';
    return group.map(s => {
      const p = getPlayer(players, s.playerId);
      const isTie = group.length > 1;
      return `
        <div class="payout-row payout-winner">
          <div>
            <div class="payout-label">${pos <= 1 ? '🥇' : pos <= 2 ? '🥈' : '🥉'} ${p.name||'P'+(p.id+1)}</div>
            ${isTie ? `<div class="payout-name">Tied — split of $${total}</div>` : ''}
          </div>
          <span class="payout-amount">$${split % 1 === 0 ? split : split.toFixed(2)}</span>
        </div>
      `;
    }).join('');
  }).join('');
}

function buildRoundWinnerBlock(rNum, rd, players, course, pool) {
  const namedPlayers = players.filter(p => p.name.trim());
  if (rNum === 2) {
    const teamScores = rd.scores.map(ts => {
      const computed = computeTeamRound(ts, namedPlayers, course.pars, course.strokeIndexes);
      return { ts, total: computed.total };
    }).filter(t => t.total != null).sort((a,b) => a.total - b.total);
    if (teamScores.length === 0) return `<div class="payout-row"><span class="payout-label">No scores</span><span class="payout-amount unclaimed">–</span></div>`;
    const minScore = teamScores[0].total;
    const winners = teamScores.filter(t => t.total === minScore);
    const perTeam = pool / winners.length;
    return winners.map(w => {
      const team = rd.teams.find(t => t.id === w.ts.teamId);
      const names = team?.players.map(pid => getPlayer(namedPlayers, pid).name||'P'+(pid+1)).join(' & ')||'Team';
      const perPlayer = perTeam / (team?.players.length || 2);
      return `
        <div class="payout-row payout-winner">
          <div><div class="payout-label">🏆 ${names}</div><div class="payout-name">$${perPlayer}/player</div></div>
          <span class="payout-amount">$${perTeam}</span>
        </div>
      `;
    }).join('');
  }

  const isStableford = rNum === 1;
  const scores = rd.scores.map(s => {
    const p = getPlayer(namedPlayers, s.playerId);
    const computed = computePlayerRound(s.gross||[], p.handicap, course.pars, course.strokeIndexes);
    return { s, p, metric: isStableford ? computed.stablefordTotal : computed.netTotal };
  }).filter(s => s.metric != null);
  if (scores.length === 0) return `<div class="payout-row"><span class="payout-label">No scores</span></div>`;
  scores.sort((a,b) => isStableford ? b.metric-a.metric : a.metric-b.metric);
  const best = scores[0].metric;
  const winners = scores.filter(s => s.metric === best);
  const perWinner = pool / winners.length;
  return winners.map(w => `
    <div class="payout-row payout-winner">
      <div><div class="payout-label">🏆 ${w.p.name||'P'+(w.p.id+1)}</div><div class="payout-name">${isStableford?w.metric+' pts':w.metric+' net'}</div></div>
      <span class="payout-amount">$${perWinner % 1 === 0 ? perWinner : perWinner.toFixed(2)}</span>
    </div>
  `).join('');
}

function buildPayoutSummaryTable(overall, payouts, namedPlayers) {
  const totalPot = 1200;
  return `
    <div class="section-title" style="margin-top:var(--space-xl)">💰 Player Summary</div>
    <div class="card">
      <table class="standings-table">
        <thead><tr><th>Player</th><th style="text-align:right">Overall</th><th style="text-align:right">Rounds</th><th style="text-align:right">Side Games</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${namedPlayers.map(p => {
            const po = payouts[p.id] || { overall:0, rounds:0, sidegames:0, total:0 };
            const fmt = v => v > 0 ? `$${v % 1 === 0 ? v : v.toFixed(2)}` : '–';
            return `
              <tr>
                <td class="player-name-cell">${p.name||'P'+(p.id+1)}</td>
                <td style="text-align:right">${fmt(po.overall)}</td>
                <td style="text-align:right">${fmt(po.rounds)}</td>
                <td style="text-align:right">${fmt(po.sidegames)}</td>
                <td class="points-cell">${fmt(po.total)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Rules View ───────────────────────────────────────────────────────────────
function showRules() {
  const view = document.getElementById('view-rules');
  view.classList.add('active');

  view.innerHTML = `
    <div class="tournament-banner">
      <div class="banner-eyebrow">BBC 2026</div>
      <div class="banner-title">Tournament Rules</div>
      <div class="banner-subtitle">Official Format Guide</div>
    </div>
    <div class="page-body rules-section">

      <details open>
        <summary>Overview</summary>
        <div class="rules-content">
          <table>
            <tr><td><strong>Event</strong></td><td>Breakfast Ball Club 2026 Victoria Invitational</td></tr>
            <tr><td><strong>Players</strong></td><td>8</td></tr>
            <tr><td><strong>Buy-In</strong></td><td>$150 per person</td></tr>
            <tr><td><strong>Total Pot</strong></td><td>$1,200</td></tr>
            <tr><td><strong>Rounds</strong></td><td>3 rounds over the weekend</td></tr>
          </table>
        </div>
      </details>

      <details>
        <summary>Round 1 — Individual Net Stableford</summary>
        <div class="rules-content">
          <p>Each player plays their own ball. Handicaps applied per hole. Points awarded:</p>
          <table>
            <tr><th>Result</th><th>Points</th></tr>
            <tr><td>Eagle or better</td><td><strong>4</strong></td></tr>
            <tr><td>Birdie</td><td><strong>3</strong></td></tr>
            <tr><td>Par</td><td><strong>2</strong></td></tr>
            <tr><td>Bogey</td><td><strong>1</strong></td></tr>
            <tr><td>Double bogey or worse</td><td><strong>0</strong></td></tr>
          </table>
          <p style="margin-top:8px">Maximum score per hole: <strong>Net Double Bogey</strong>. Most total Stableford points wins.</p>
        </div>
      </details>

      <details>
        <summary>Round 2 — 2-Man Best Ball (Net)</summary>
        <div class="rules-content">
          <p>Players divided into 4 teams of 2. Both players play their own ball on every hole. Handicaps applied individually. The <strong>lower net score</strong> between partners counts as the team score for each hole. Team with the lowest total best ball net score wins.</p>
          <p style="margin-top:8px">Maximum score per hole per player: Net Double Bogey.</p>
        </div>
      </details>

      <details>
        <summary>Round 3 — Individual Net Stroke Play</summary>
        <div class="rules-content">
          <p>Each player plays their own ball. Handicap applied to produce a final net score. Lowest net total wins. Final round tee times in <strong>reverse standings order</strong> — leaders go last.</p>
          <p style="margin-top:8px">Maximum score per hole: Net Double Bogey.</p>
        </div>
      </details>

      <details>
        <summary>Overall Points System</summary>
        <div class="rules-content">
          <p><strong>Individual Rounds (R1 &amp; R3):</strong></p>
          <table>
            <tr><th>Finish</th><th>Points</th></tr>
            <tr><td>1st</td><td>8</td></tr>
            <tr><td>2nd</td><td>7</td></tr>
            <tr><td>3rd</td><td>6</td></tr>
            <tr><td>4th</td><td>5</td></tr>
            <tr><td>5th</td><td>4</td></tr>
            <tr><td>6th</td><td>3</td></tr>
            <tr><td>7th</td><td>2</td></tr>
            <tr><td>8th</td><td>1</td></tr>
          </table>
          <p style="margin-top:8px"><strong>Round 2 (Team):</strong></p>
          <table>
            <tr><th>Finish</th><th>Points (each player)</th></tr>
            <tr><td>1st</td><td>8</td></tr>
            <tr><td>2nd</td><td>6</td></tr>
            <tr><td>3rd</td><td>4</td></tr>
            <tr><td>4th</td><td>2</td></tr>
          </table>
          <p style="margin-top:8px"><strong>Ties:</strong> average the points for the tied positions. Overall winner = most total points after all 3 rounds.</p>
        </div>
      </details>

      <details>
        <summary>Payouts — $1,200 Total</summary>
        <div class="rules-content">
          <p><strong>Overall ($760):</strong> 1st $400 / 2nd $220 / 3rd $140</p>
          <p><strong>Round Winners ($200):</strong> R1 $70 / R2 $60 ($30 each) / R3 $70</p>
          <p><strong>Side Games ($240):</strong> Closest to Pin $40/round · Long Drive (fairway only) $40/round</p>
          <p style="margin-top:8px">Ties in payouts are split evenly unless all players unanimously agree otherwise.</p>
        </div>
      </details>

      <details>
        <summary>Handicaps &amp; Max Score</summary>
        <div class="rules-content">
          <ul>
            <li>Handicaps applied to all net scoring (100% course handicap).</li>
            <li>Enter your <strong>course handicap</strong> in Setup (already adjusted for slope/rating).</li>
            <li>Maximum score per hole: <strong>Net Double Bogey</strong> (par + 2, net).</li>
            <li>Pick up once max is reached to keep pace of play.</li>
          </ul>
        </div>
      </details>

      <details>
        <summary>General Rules &amp; Traditions</summary>
        <div class="rules-content">
          <ul>
            <li>Play governed by the Rules of Golf (USGA/R&amp;A), with host course local rules.</li>
            <li>Ready golf encouraged throughout.</li>
            <li>All disputes settled by majority ruling; commissioner has final say.</li>
            <li><strong>Last place overall</strong> buys drinks or dinner on the final night. No exceptions.</li>
            <li><strong>Trash talk is mandatory.</strong></li>
          </ul>
        </div>
      </details>

    </div>
  `;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtPts(v) {
  if (v === 0 && v !== undefined) return '0';
  if (!v) return '–';
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── SVG Icons ────────────────────────────────────────────────────────────────
function iconHome()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`; }
function iconTrophy()  { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 21 12 17 16 21"/><line x1="12" y1="17" x2="12" y2="11"/><path d="M7 4h10l1 7a5 5 0 0 1-10 0l1-7z"/><path d="M4 7h3M17 7h3"/></svg>`; }
function iconMoney()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`; }
function iconFlag()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="15" x2="4" y2="21"/><path d="M4 3 L20 9 L4 15"/></svg>`; }
function iconBook()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`; }
function iconPlayers() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`; }
