/* js/storage.js — localStorage helpers */
const KEYS = {
  PLAYERS: 'bbc2026_players',
  COURSE:  'bbc2026_course',
  ROUND1:  'bbc2026_round1',
  ROUND2:  'bbc2026_round2',
  ROUND3:  'bbc2026_round3',
};

function _save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function _load(key) {
  const v = localStorage.getItem(key);
  return v ? JSON.parse(v) : null;
}

function defaultCourse() {
  return {
    name: 'Victoria Golf Club',
    pars: [4,3,5,4,4,3,4,5,4, 4,4,3,5,4,4,3,5,4],
    strokeIndexes: [7,15,1,11,5,17,3,13,9, 8,16,2,12,6,18,4,14,10],
    ctpHoles: [6, 6, 6],
    longDriveHoles: [1, 10, 18],
  };
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
function loadPlayers() { return _load(KEYS.PLAYERS) || defaultPlayers(); }

// Course
function saveCourse(obj) { _save(KEYS.COURSE, obj); }
function loadCourse() { return _load(KEYS.COURSE) || defaultCourse(); }

// Rounds
function saveRound(n, obj) { _save(KEYS['ROUND' + n], obj); }
function loadRound(n) { return _load(KEYS['ROUND' + n]) || emptyRoundData(n); }

function clearAll() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}

// Convenience: get a player by id
function getPlayer(players, id) {
  return players.find(p => p.id === id) || { id, name: 'Unknown', handicap: 0 };
}
