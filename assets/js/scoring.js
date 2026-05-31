/*
 * scoring.js — Motor de puntuación de la Polla Mundialista 2026 (Serviplagas)
 *
 * Implementa exactamente las reglas del documento
 * "Sistema de Puntuacion - Polla Mundialista 2026".
 *
 * Reglas resumidas:
 *   Fase de grupos (por cada uno de los 72 partidos):
 *     - Acertar ganador/empate ......... 6
 *     - Acertar total de goles ......... 4
 *     - Acertar marcador exacto ........ 10
 *   Clasificación a la Ronda de 32:
 *     - Cada equipo que clasifica ...... 10
 *     - Además su puesto exacto ........ +5
 *   Equipos que avanzan de ronda (por equipo):
 *     - Octavos ........................ 15
 *     - Cuartos ........................ 20
 *     - Semifinal ...................... 35
 *     - Final .......................... 50
 *   Cada partido de eliminación (lado de la llave):
 *     - Acertar ganador (lado) ......... 3
 *     - Acertar total de goles ......... 2
 *     - Acertar total goles de penales . 2
 *   Podio:
 *     - Tercer lugar ................... 75
 *     - Subcampeón ..................... 100
 *     - Campeón ........................ 150
 *
 * Todo se suma. Se puntúa solo lo que ya tiene resultado real cargado
 * (los campos en null en results.json se ignoran), de modo que durante
 * el torneo los puntajes parciales funcionan correctamente.
 */
(function (global) {
  "use strict";

  var P = {
    GRP_WINNER: 6, GRP_TOTAL: 4, GRP_EXACT: 10,
    CLASS_TEAM: 10, CLASS_POS: 5,
    ADV: { OCT: 15, CUA: 20, SEM: 35, FIN: 50 },
    KO_SIDE: 3, KO_TOTAL: 2, KO_PEN: 2,
    PODIO: { campeon: 150, subcampeon: 100, tercero: 75 }
  };

  // Rondas cuyos partidos definen "llegar a" la ronda siguiente:
  //  ganadores R32 -> llegan a Octavos ; ganadores Octavos -> Cuartos ; etc.
  var REACH = {
    OCT: { from: range(73, 88), pts: P.ADV.OCT },
    CUA: { from: range(89, 96), pts: P.ADV.CUA },
    SEM: { from: range(97, 100), pts: P.ADV.SEM },
    FIN: { from: range(101, 102), pts: P.ADV.FIN }
  };

  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function isNum(v) { return typeof v === "number" && !isNaN(v); }
  function norm(t) { return (t == null ? "" : String(t)).trim(); }
  function teamEq(a, b) { a = norm(a); b = norm(b); return a !== "" && a === b; }

  // Lado ganador de un partido a partir del marcador (incluye penales).
  // Devuelve "H", "A" o null (si faltan datos o quedó indefinido).
  function winningSide(hg, ag, ph, pa) {
    if (!isNum(hg) || !isNum(ag)) return null;
    if (hg > ag) return "H";
    if (ag > hg) return "A";
    // empate en 120' -> penales
    if (isNum(ph) && isNum(pa)) {
      if (ph > pa) return "H";
      if (pa > ph) return "A";
    }
    return null;
  }

  // Equipo que ganó realmente un partido de eliminación (nombre).
  function actualWinnerTeam(m) {
    var s = winningSide(m.hg, m.ag, m.ph, m.pa);
    if (s === "H") return norm(m.home);
    if (s === "A") return norm(m.away);
    return null;
  }

  // ---------------------------------------------------------------
  // FASE DE GRUPOS
  // ---------------------------------------------------------------
  function scoreGroups(entry, results) {
    var total = 0;
    var perGroup = {};
    Object.keys(results.groups).forEach(function (L) {
      var actG = results.groups[L];
      var predG = entry.groups ? entry.groups[L] : null;
      var matches = [];
      var gPts = 0;
      actG.matches.forEach(function (am, i) {
        var pm = predG && predG.matches ? predG.matches[i] : null;
        var row = { home: am.home, away: am.away, actual: am, pred: pm,
                    pts: 0, winner: false, totalGoals: false, exact: false, played: false };
        if (isNum(am.hg) && isNum(am.ag)) {
          row.played = true;
          if (pm && isNum(pm.hg) && isNum(pm.ag)) {
            if (sign(pm.hg - pm.ag) === sign(am.hg - am.ag)) { row.winner = true; row.pts += P.GRP_WINNER; }
            if (pm.hg + pm.ag === am.hg + am.ag) { row.totalGoals = true; row.pts += P.GRP_TOTAL; }
            if (pm.hg === am.hg && pm.ag === am.ag) { row.exact = true; row.pts += P.GRP_EXACT; }
          }
        }
        gPts += row.pts;
        matches.push(row);
      });
      perGroup[L] = { points: gPts, matches: matches };
      total += gPts;
    });
    return { points: total, perGroup: perGroup };
  }
  function sign(x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }

  // ---------------------------------------------------------------
  // CLASIFICACIÓN A LA RONDA DE 32  (10 por clasificar + 5 por puesto)
  // ---------------------------------------------------------------
  function scoreClassification(entry, results) {
    // Mapas reales: equipo -> {group, pos(1..4)}  a partir de standings reales.
    // Clasificados reales = pos1 y pos2 de cada grupo + 8 mejores terceros.
    var actualRank = {};      // team -> pos number within its group (1..4)
    var actualGroup = {};     // team -> group letter
    var actualQualified = {}; // team -> true
    Object.keys(results.groups).forEach(function (L) {
      var st = results.groups[L].standings || [];
      st.forEach(function (team, idx) {
        if (norm(team)) { actualRank[norm(team)] = idx + 1; actualGroup[norm(team)] = L; }
      });
      [0, 1].forEach(function (idx) { if (norm(st[idx])) actualQualified[norm(st[idx])] = true; });
    });
    (results.thirdsQualified || []).forEach(function (t) { if (norm(t)) actualQualified[norm(t)] = true; });

    // ¿Ya hay datos de clasificación cargados? Si no, no puntuamos esta sección.
    var hasData = Object.keys(actualQualified).length > 0;

    // Predicción del participante: pos1, pos2 de cada grupo + sus terceros asignados.
    // predicted entry: team -> {group, pos}
    var predicted = []; // {team, group, pos}
    if (entry.groups) {
      Object.keys(entry.groups).forEach(function (L) {
        var st = (entry.groups[L] && entry.groups[L].standings) || [];
        if (norm(st[0])) predicted.push({ team: norm(st[0]), group: L, pos: 1 });
        if (norm(st[1])) predicted.push({ team: norm(st[1]), group: L, pos: 2 });
      });
    }
    // terceros pronosticados que el formulario marcó como clasificados (los 8 asignados)
    var predThirds = entry.thirds ? Object.keys(entry.thirds).map(function (k) { return norm(entry.thirds[k]); }) : [];
    predThirds.forEach(function (t) {
      if (!t) return;
      // grupo donde el participante lo puso de 3º
      var grp = null;
      if (entry.groups) {
        Object.keys(entry.groups).forEach(function (L) {
          var st = entry.groups[L].standings || [];
          if (teamEq(st[2], t)) grp = L;
        });
      }
      predicted.push({ team: t, group: grp, pos: 3 });
    });

    var items = [], total = 0;
    predicted.forEach(function (p) {
      var qualified = !!actualQualified[p.team];
      var posExact = qualified && actualRank[p.team] === p.pos;
      var pts = 0;
      if (qualified) { pts += P.CLASS_TEAM; if (posExact) pts += P.CLASS_POS; }
      total += pts;
      items.push({ team: p.team, group: p.group, predPos: p.pos,
                   qualified: qualified, posExact: posExact, pts: pts });
    });
    return { points: total, items: items, hasData: hasData };
  }

  // ---------------------------------------------------------------
  // EQUIPOS QUE AVANZAN DE RONDA
  // ---------------------------------------------------------------
  function scoreAdvancement(entry, results) {
    var byRound = {}, total = 0;
    Object.keys(REACH).forEach(function (rk) {
      var cfg = REACH[rk];
      // equipos que el participante pronosticó que llegan a esa ronda
      var predTeams = {};
      cfg.from.forEach(function (n) {
        var m = entry.knockout && entry.knockout[String(n)];
        if (m && norm(m.winner)) predTeams[norm(m.winner)] = true;
      });
      // equipos que realmente llegaron (ganadores reales de esos partidos)
      var actTeams = {}; var anyActual = false; var allDecided = true;
      cfg.from.forEach(function (n) {
        var rm = results.knockout && results.knockout[String(n)];
        var w = rm ? actualWinnerTeam(rm) : null;
        if (w) { actTeams[w] = true; anyActual = true; }
        else allDecided = false;
      });
      // detalle por equipo pronosticado: acertado (llegó), fallado (ya se sabe
      // que no llegó) o pendiente (la ronda aún no se ha definido por completo).
      var hits = [], items = [];
      Object.keys(predTeams).forEach(function (t) {
        var reached = !!actTeams[t];
        if (reached) hits.push(t);
        items.push({ team: t, status: reached ? "hit" : (allDecided ? "miss" : "pending") });
      });
      var pts = hits.length * cfg.pts;
      total += pts;
      byRound[rk] = { points: pts, perTeam: cfg.pts, teams: hits, items: items,
                      hasData: anyActual, allDecided: allDecided };
    });
    return { points: total, byRound: byRound };
  }

  // ---------------------------------------------------------------
  // CADA PARTIDO DE ELIMINACIÓN (lado de la llave)
  // ---------------------------------------------------------------
  function scoreKnockoutMatches(entry, results, fixtures) {
    var items = [], total = 0;
    fixtures.knockout.forEach(function (fx) {
      var n = String(fx.n);
      var act = results.knockout && results.knockout[n];
      var pred = entry.knockout && entry.knockout[n];
      if (!act || !isNum(act.hg) || !isNum(act.ag)) return; // no jugado
      var row = { n: fx.n, round: fx.round, pred: pred, actual: act,
                  pts: 0, side: false, totalGoals: false, penalties: false, played: true };
      if (pred && isNum(pred.hg) && isNum(pred.ag)) {
        var pSide = winningSide(pred.hg, pred.ag, pred.ph, pred.pa);
        var aSide = winningSide(act.hg, act.ag, act.ph, act.pa);
        if (pSide && aSide && pSide === aSide) { row.side = true; row.pts += P.KO_SIDE; }
        if (pred.hg + pred.ag === act.hg + act.ag) { row.totalGoals = true; row.pts += P.KO_TOTAL; }
        // penales: solo si el partido real fue a penales y el participante también pronosticó empate
        var actPens = act.hg === act.ag && isNum(act.ph) && isNum(act.pa);
        var predPens = pred.hg === pred.ag && isNum(pred.ph) && isNum(pred.pa);
        if (actPens && predPens && (pred.ph + pred.pa === act.ph + act.pa)) {
          row.penalties = true; row.pts += P.KO_PEN;
        }
      }
      total += row.pts;
      items.push(row);
    });
    return { points: total, items: items };
  }

  // ---------------------------------------------------------------
  // PODIO
  // ---------------------------------------------------------------
  function scorePodio(entry, results) {
    var items = [], total = 0;
    var rp = results.podio || {}, ep = entry.podio || {};
    [["campeon", "Campeón", P.PODIO.campeon],
     ["subcampeon", "Subcampeón", P.PODIO.subcampeon],
     ["tercero", "Tercer lugar", P.PODIO.tercero]].forEach(function (x) {
      var key = x[0], label = x[1], pval = x[2];
      var hasData = !!norm(rp[key]);
      var hit = hasData && teamEq(ep[key], rp[key]);
      var pts = hit ? pval : 0;
      total += pts;
      items.push({ key: key, label: label, pred: norm(ep[key]), actual: norm(rp[key]),
                   hit: hit, pts: pts, hasData: hasData });
    });
    return { points: total, items: items };
  }

  // ---------------------------------------------------------------
  // API principal
  // ---------------------------------------------------------------
  function scoreEntry(entry, results, fixtures) {
    var groups = scoreGroups(entry, results);
    var classification = scoreClassification(entry, results);
    var advancement = scoreAdvancement(entry, results);
    var knockoutMatches = scoreKnockoutMatches(entry, results, fixtures);
    var podio = scorePodio(entry, results);
    var total = groups.points + classification.points + advancement.points +
                knockoutMatches.points + podio.points;
    return {
      total: total,
      groups: groups,
      classification: classification,
      advancement: advancement,
      knockoutMatches: knockoutMatches,
      podio: podio
    };
  }

  global.WCScoring = {
    scoreEntry: scoreEntry,
    winningSide: winningSide,
    actualWinnerTeam: actualWinnerTeam,
    POINTS: P
  };
})(typeof window !== "undefined" ? window : globalThis);
