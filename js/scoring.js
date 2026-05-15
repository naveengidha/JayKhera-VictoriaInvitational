/* js/scoring.js — pure scoring functions */

// How many strokes a player receives on a given hole
function getStrokesReceived(handicap, holeStrokeIndex) {
  const full = Math.floor(handicap / 18);
  const remainder = handicap % 18;
  return holeStrokeIndex <= remainder ? full + 1 : full;
}

// Net score on a hole, capped at Net Double Bogey
function cappedNet(gross, handicap, holeStrokeIndex, par) {
  if (gross == null || gross === 0) return null;
  const strokes = getStrokesReceived(handicap, holeStrokeIndex);
  const net = gross - strokes;
  const maxNet = par + 2;
  return Math.min(net, maxNet);
}

// Stableford points from a capped net score
function stablefordPoints(net, par) {
  if (net == null) return null;
  const diff = net - par;
  if (diff <= -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0)  return 2;
  if (diff === 1)  return 1;
  return 0;
}

// Score result classification for display
function scoreResult(net, par) {
  if (net == null) return '';
  const diff = net - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0)  return 'par';
  if (diff === 1)  return 'bogey';
  return 'double';
}

// Compute full scorecard for one player (R1 or R3)
function computePlayerRound(grossScores, handicap, pars, strokeIndexes) {
  const net = [];
  const stableford = [];
  let netTotal = 0;
  let stablefordTotal = 0;
  let hasAnyScore = false;

  for (let i = 0; i < 18; i++) {
    const g = grossScores[i];
    const cn = cappedNet(g, handicap, strokeIndexes[i], pars[i]);
    const pts = stablefordPoints(cn, pars[i]);
    net.push(cn);
    stableford.push(pts);
    if (cn != null) {
      netTotal += cn;
      stablefordTotal += pts;
      hasAnyScore = true;
    }
  }

  return {
    net,
    stableford,
    netTotal: hasAnyScore ? netTotal : null,
    stablefordTotal: hasAnyScore ? stablefordTotal : null,
    isComplete: grossScores.every(g => g != null && g > 0),
  };
}

// Compute best ball for one team hole-by-hole
function computeTeamRound(teamScore, players, pars, strokeIndexes) {
  const [pA, pB] = teamScore.playerScores;
  const playerA = players.find(p => p.id === pA.playerId);
  const playerB = players.find(p => p.id === pB.playerId);

  const resultA = computePlayerRound(pA.gross || new Array(18).fill(null), playerA?.handicap || 0, pars, strokeIndexes);
  const resultB = computePlayerRound(pB.gross || new Array(18).fill(null), playerB?.handicap || 0, pars, strokeIndexes);

  const bestBall = [];
  let total = 0;
  let hasAny = false;

  for (let i = 0; i < 18; i++) {
    const a = resultA.net[i];
    const b = resultB.net[i];
    if (a != null && b != null) {
      const bb = Math.min(a, b);
      bestBall.push(bb);
      total += bb;
      hasAny = true;
    } else if (a != null) {
      bestBall.push(a);
      total += a;
      hasAny = true;
    } else if (b != null) {
      bestBall.push(b);
      total += b;
      hasAny = true;
    } else {
      bestBall.push(null);
    }
  }

  return {
    playerA: resultA,
    playerB: resultB,
    bestBall,
    total: hasAny ? total : null,
    isComplete: resultA.isComplete && resultB.isComplete,
  };
}

// Rank players by score (ascending for stroke play, descending for Stableford)
function rankPlayers(scores, key, ascending = true) {
  const sorted = [...scores].sort((a, b) =>
    ascending ? (a[key] ?? Infinity) - (b[key] ?? Infinity)
              : (b[key] ?? -Infinity) - (a[key] ?? -Infinity)
  );

  // Group ties
  const groups = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j][key] === sorted[i][key] && sorted[i][key] != null) j++;
    groups.push(sorted.slice(i, j));
    i = j;
  }

  return { sorted, groups };
}

// Points scale for individual rounds
const INDIVIDUAL_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const TEAM_POINTS       = [8, 6, 4, 2];

// Assign points to players from ranked groups (handles ties via averaging)
function assignPoints(groups, pointsScale) {
  const result = {}; // playerId -> points
  let pos = 0;
  for (const group of groups) {
    const pts = pointsScale.slice(pos, pos + group.length);
    const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
    for (const entry of group) {
      result[entry.playerId] = avg;
    }
    pos += group.length;
  }
  return result;
}

// Assign points for round 2 teams, then map back to players
function assignTeamPoints(teamGroups, teams, pointsScale) {
  const teamResult = {};
  let pos = 0;
  for (const group of teamGroups) {
    const pts = pointsScale.slice(pos, pos + group.length);
    const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
    for (const entry of group) {
      teamResult[entry.teamId] = avg;
    }
    pos += group.length;
  }

  // Map to players
  const playerResult = {};
  for (const team of teams) {
    for (const pid of team.players) {
      playerResult[pid] = teamResult[team.id] ?? 0;
    }
  }
  return playerResult;
}

// Compute overall standings from round data
function computeOverall(round1, round2, round3, players, coursesOrCourse) {
  // Accept either a single course object or an array of 3 [r1, r2, r3]
  const c1 = Array.isArray(coursesOrCourse) ? coursesOrCourse[0] : coursesOrCourse;
  const c2 = Array.isArray(coursesOrCourse) ? coursesOrCourse[1] : coursesOrCourse;
  const c3 = Array.isArray(coursesOrCourse) ? coursesOrCourse[2] : coursesOrCourse;
  const playerIds = players.map(p => p.id);

  // R1 — stableford, highest wins
  let r1Points = {};
  if (round1.status !== 'not_started' && round1.scores.length > 0) {
    const r1Scores = round1.scores.map(s => {
      const computed = computePlayerRound(s.gross || [], s.handicap ?? getPlayerHandicap(players, s.playerId), c1.pars, c1.strokeIndexes);
      return { playerId: s.playerId, total: computed.stablefordTotal };
    }).filter(s => s.total != null);
    const { groups } = rankPlayers(r1Scores, 'total', false);
    r1Points = assignPoints(groups, INDIVIDUAL_POINTS);
  }

  // R2 — best ball, lowest wins
  let r2Points = {};
  if (round2.status !== 'not_started' && round2.scores.length > 0) {
    const r2Scores = round2.scores.map(ts => {
      const computed = computeTeamRound(ts, players, c2.pars, c2.strokeIndexes);
      return { teamId: ts.teamId, total: computed.total };
    }).filter(s => s.total != null);
    const { groups } = rankPlayers(r2Scores, 'total', true);
    r2Points = assignTeamPoints(groups, round2.teams, TEAM_POINTS);
  }

  // R3 — stroke play, lowest net wins (net = grossTotal - handicap)
  let r3Points = {};
  if (round3.status !== 'not_started' && round3.scores.length > 0) {
    const r3Scores = round3.scores.map(s => {
      if (s.grossTotal == null) return null;
      const handicap = s.handicap ?? getPlayerHandicap(players, s.playerId);
      return { playerId: s.playerId, total: s.grossTotal - handicap };
    }).filter(Boolean);
    const { groups } = rankPlayers(r3Scores, 'total', true);
    r3Points = assignPoints(groups, INDIVIDUAL_POINTS);
  }

  const standings = playerIds.map(pid => ({
    playerId: pid,
    r1: r1Points[pid] ?? 0,
    r2: r2Points[pid] ?? 0,
    r3: r3Points[pid] ?? 0,
    total: (r1Points[pid] ?? 0) + (r2Points[pid] ?? 0) + (r3Points[pid] ?? 0),
  }));

  standings.sort((a, b) => b.total - a.total);
  return standings;
}

function getPlayerHandicap(players, id) {
  return players.find(p => p.id === id)?.handicap ?? 0;
}

// Compute payout from overall standings
function computePayouts(overallStandings, round1, round2, round3, players, coursesOrCourse) {
  const c1 = Array.isArray(coursesOrCourse) ? coursesOrCourse[0] : coursesOrCourse;
  const c2 = Array.isArray(coursesOrCourse) ? coursesOrCourse[1] : coursesOrCourse;
  const c3 = Array.isArray(coursesOrCourse) ? coursesOrCourse[2] : coursesOrCourse;
  const OVERALL_POOL   = [400, 220, 140];
  const ROUND_POOL     = [70, 60, 70]; // R1, R2, R3
  const CTP_PER_ROUND  = 40;
  const LD_PER_ROUND   = 40;

  const payouts = {};
  const initPlayer = (pid) => {
    if (!payouts[pid]) payouts[pid] = { overall: 0, rounds: 0, sidegames: 0, total: 0 };
  };

  // Overall payouts (handle ties by splitting combined prizes)
  let pos = 0;
  const groups = [];
  let i = 0;
  while (i < overallStandings.length) {
    let j = i + 1;
    while (j < overallStandings.length && overallStandings[j].total === overallStandings[i].total) j++;
    groups.push(overallStandings.slice(i, j));
    i = j;
  }

  for (const group of groups) {
    const poolSlice = OVERALL_POOL.slice(pos, pos + group.length);
    const split = poolSlice.reduce((a, b) => a + b, 0) / group.length;
    for (const entry of group) {
      if (pos < OVERALL_POOL.length) {
        initPlayer(entry.playerId);
        payouts[entry.playerId].overall += split;
      }
    }
    pos += group.length;
  }

  // Round winner payouts
  [round1, round2, round3].forEach((round, idx) => {
    if (!round || round.status !== 'complete') return;
    const pool = ROUND_POOL[idx];

    if (idx === 1) {
      // R2 — team round, winning team splits $60 ($30 each)
      const { pars, strokeIndexes } = c2;
      const teamScores = round.scores.map(ts => {
        const computed = computeTeamRound(ts, players, pars, strokeIndexes);
        return { teamId: ts.teamId, total: computed.total };
      }).filter(s => s.total != null);
      if (teamScores.length === 0) return;
      teamScores.sort((a, b) => a.total - b.total);
      const minScore = teamScores[0].total;
      const winners = teamScores.filter(t => t.total === minScore);
      const perTeam = pool / winners.length;
      for (const w of winners) {
        const team = round.teams.find(t => t.id === w.teamId);
        if (!team) continue;
        const perPlayer = perTeam / team.players.length;
        for (const pid of team.players) {
          initPlayer(pid);
          payouts[pid].rounds += perPlayer;
        }
      }
    } else {
      // R1 (Stableford) or R3 (stroke play)
      let roundScores;
      if (idx === 0) {
        // R1 — hole-by-hole, use stableford total
        const { pars, strokeIndexes } = c1;
        roundScores = round.scores.map(s => {
          const computed = computePlayerRound(s.gross || [], s.handicap ?? getPlayerHandicap(players, s.playerId), pars, strokeIndexes);
          return { playerId: s.playerId, total: computed.stablefordTotal };
        }).filter(s => s.total != null);
      } else {
        // R3 — single gross total, net = gross - handicap
        roundScores = round.scores.map(s => {
          if (s.grossTotal == null) return null;
          const handicap = s.handicap ?? getPlayerHandicap(players, s.playerId);
          return { playerId: s.playerId, total: s.grossTotal - handicap };
        }).filter(Boolean);
      }
      if (roundScores.length === 0) return;
      const asc = idx !== 0;
      roundScores.sort((a, b) => asc ? a.total - b.total : b.total - a.total);
      const best = roundScores[0].total;
      const winners = roundScores.filter(r => r.total === best);
      const perWinner = pool / winners.length;
      for (const w of winners) {
        initPlayer(w.playerId);
        payouts[w.playerId].rounds += perWinner;
      }
    }
  });

  // Side games
  [round1, round2, round3].forEach((round) => {
    if (!round) return;
    if (round.ctpWinner != null) {
      initPlayer(round.ctpWinner);
      payouts[round.ctpWinner].sidegames += CTP_PER_ROUND;
    }
    if (round.longDriveWinner != null) {
      initPlayer(round.longDriveWinner);
      payouts[round.longDriveWinner].sidegames += LD_PER_ROUND;
    }
  });

  // Total
  for (const pid of Object.keys(payouts)) {
    const p = payouts[pid];
    p.total = p.overall + p.rounds + p.sidegames;
  }

  return payouts;
}
