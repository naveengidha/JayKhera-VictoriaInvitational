/* js/storage.js — localStorage helpers */
const KEYS = {
  PLAYERS:  'bbc2026_players',
  COURSE:   'bbc2026_course',   // legacy / fallback
  COURSES:  'bbc2026_courses',  // per-round courses [r1, r2, r3]
  ROUND1:   'bbc2026_round1',
  ROUND2:   'bbc2026_round2',
  ROUND3:   'bbc2026_round3',
};

// In-memory cache — hydrated from Firebase on load and on remote updates
const _cache = {};

// ── Course Presets ────────────────────────────────────────────────────────────
const COURSE_PRESETS = [
  {
    id: 'bear-mountain',
    name: 'Bear Mountain — Mountain Course',
    location: 'Victoria, BC',
    par: 71,
    // Best-guess par-71 layout (Jack Nicklaus design). Correct any holes in Setup.
    pars:         [4,4,3,4,5,3,4,4,4, 4,4,3,5,4,4,3,5,4],
    strokeIndexes:[3,11,17,7,1,15,5,13,9, 4,12,18,2,10,6,16,8,14],
    note: '⚠ Estimated layout — verify par/SI before play',
  },
  {
    id: 'highland-pacific',
    name: 'Highland Pacific Golf Course',
    location: 'Victoria, BC',
    par: 71,
    pars:         [4,3,4,5,4,4,4,3,4, 4,4,3,5,4,5,4,3,3],
    strokeIndexes:[8,16,12,2,18,10,4,6,14, 13,9,11,5,1,3,7,15,17],
  },
  {
    id: 'bear-valley',
    name: 'Bear Mountain — Valley Course',
    location: 'Victoria, BC',
    par: 71,
    pars:         [5,3,4,4,4,3,4,4,4, 3,4,5,4,3,5,3,4,5],
    strokeIndexes:[17,15,5,1,13,9,7,11,3, 12,6,10,2,18,8,16,4,14],
  },
  {
    id: 'custom',
    name: 'Custom Course',
    location: '',
    par: 72,
    pars:         [4,3,5,4,4,3,4,5,4, 4,4,3,5,4,4,3,5,4],
    strokeIndexes:[7,15,1,11,5,17,3,13,9, 8,16,2,12,6,18,4,14,10],
  },
];

function _save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  if (window._fbSave) window._fbSave(key, data);
}

function _load(key) {
  const v = localStorage.getItem(key);
  return v ? JSON.parse(v) : null;
}

function defaultCourse() {
  return presetToStoredCourse('bear-mountain');
}

function defaultPlayers() {
  return Array.from({ length: 8 }, (_, i) => ({
    id: i,
    name: '',
    handicap: 0,
  }));
}

function emptyRoundData(num) {
  const base = {
    status: 'not_started',
    ctpWinner: null,
    longDriveWinner: null,
    rankings: [],
  };
  if (num === 2) {
    return {
      ...base,
      teams: [
        { id: 0, players: [0, 1] },
        { id: 1, players: [2, 3] },
        { id: 2, players: [4, 5] },
        { id: 3, players: [6, 7] },
      ],
      scores: [],
    };
  }
  return { ...base, scores: [] };
}

// Players
function savePlayers(arr) { _save(KEYS.PLAYERS, arr); }
function loadPlayers() { return _cache.players || _load(KEYS.PLAYERS) || defaultPlayers(); }

// Course (legacy single-course helpers kept for compatibility)
function saveCourse(obj) { _save(KEYS.COURSE, obj); }
function loadCourse() { return _load(KEYS.COURSE) || defaultCourse(); }

// Per-round courses: array of 3 objects [round1, round2, round3]
function saveRoundCourses(arr) { _save(KEYS.COURSES, arr); }
function loadRoundCourses() {
  return _cache.courses || _load(KEYS.COURSES) || [
    presetToStoredCourse('bear-mountain'),
    presetToStoredCourse('highland-pacific'),
    presetToStoredCourse('bear-valley'),
  ];
}
function loadCourseForRound(n) {
  const courses = loadRoundCourses();
  return courses[n - 1] || loadCourse();
}

function presetToStoredCourse(presetId) {
  const p = COURSE_PRESETS.find(c => c.id === presetId) || COURSE_PRESETS[3];
  return {
    presetId:     p.id,
    name:         p.name,
    pars:         [...p.pars],
    strokeIndexes:[...p.strokeIndexes],
    ctpHoles:     [firstPar3(p.pars), firstPar3(p.pars), firstPar3(p.pars)],
    longDriveHoles:[1, 1, 1],
  };
}

function firstPar3(pars) {
  const idx = pars.findIndex(p => p === 3);
  return idx >= 0 ? idx + 1 : 2;
}

// Rounds
function saveRound(n, obj) { _save(KEYS['ROUND' + n], obj); }
function loadRound(n) { return _cache['round' + n] || _load(KEYS['ROUND' + n]) || emptyRoundData(n); }

function clearAll() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  Object.keys(_cache).forEach(k => delete _cache[k]);
  if (window._fbClear) window._fbClear();
}

// Normalize a Firebase value back to a JS array (Firebase may return sparse objects)
function _normArray(v, len) {
  if (Array.isArray(v)) return v;
  return Array.from({ length: len }, (_, i) => (v && v[i] !== undefined) ? v[i] : null);
}

// Hydrate in-memory cache from a Firebase snapshot value
function hydrateFromFirebase(data) {
  if (!data) return;
  if (data.players) _cache.players = data.players;
  if (data.courses) _cache.courses = data.courses;
  ['round1', 'round2', 'round3'].forEach(k => {
    if (!data[k]) return;
    const rd = JSON.parse(JSON.stringify(data[k]));
    (rd.scores || []).forEach(s => {
      if (s.gross) s.gross = _normArray(s.gross, 18);
      (s.playerScores || []).forEach(ps => {
        if (ps.gross) ps.gross = _normArray(ps.gross, 18);
      });
    });
    _cache[k] = rd;
  });
}

// Convenience: get a player by id
function getPlayer(players, id) {
  return players.find(p => p.id === id) || { id, name: 'Unknown', handicap: 0 };
}
