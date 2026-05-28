/* ============================================================
   app.js — Polla Mundialista 2026 (Serviplagas)
   Interfaz pública: tabla de posiciones + búsqueda de pronósticos
   + comparación pronóstico vs. resultado real y puntos.
   ============================================================ */
(function () {
  "use strict";

  var DATA = { fixtures: null, predictions: null, results: null };
  var STATE = { view: "leaderboard", detailEntry: null, detailTab: "grupos" };

  // ---------- utilidades ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // separa "México 🇲🇽" -> {name:"México", flag:"🇲🇽"}
  function splitTeam(s) {
    s = (s == null ? "" : String(s)).trim();
    if (!s) return { name: "—", flag: "" };
    var i = s.lastIndexOf(" ");
    if (i > 0) {
      var tail = s.slice(i + 1);
      // si la cola tiene caracteres no-ASCII (bandera/emoji), sepárala
      if (/[^\x00-\x7F]/.test(tail)) return { name: s.slice(0, i), flag: tail };
    }
    return { name: s, flag: "" };
  }
  function teamSpan(s, side) {
    var t = splitTeam(s);
    var flag = t.flag ? '<span class="flag">' + esc(t.flag) + "</span>" : "";
    var name = '<span class="name">' + esc(t.name) + "</span>";
    return side === "home"
      ? '<div class="team home">' + name + flag + "</div>"
      : '<div class="team away">' + flag + name + "</div>";
  }
  function scoreBox(hg, ag, cls) {
    var txt = (isN(hg) && isN(ag)) ? (hg + "–" + ag) : "—";
    return '<div class="score ' + (cls || "") + '">' + txt + "</div>";
  }
  function isN(v) { return typeof v === "number" && !isNaN(v); }
  function fmtNum(n) { return (n || 0).toLocaleString("es-419"); }

  // ---------- carga ----------
  function load() {
    Promise.all([
      fetchJSON("data/fixtures.json"),
      fetchJSON("data/predictions.json"),
      fetchJSON("data/results.json")
    ]).then(function (res) {
      DATA.fixtures = res[0];
      DATA.predictions = res[1];
      DATA.results = res[2];
      computeAllScores();
      $("#loader").hidden = true;
      $("#updated-date").textContent = formatUpdated(DATA.results.actualizado);
      setupTabs();
      setupBrowse();
      renderLeaderboard("");
      if (!openFromHash()) showView("leaderboard");
      window.addEventListener("hashchange", function () {
        if (!openFromHash() && STATE.view === "detail") showView("leaderboard");
      });
    }).catch(function (err) {
      $("#loader").hidden = true;
      var box = $("#error");
      box.hidden = false;
      box.innerHTML = "<strong>No se pudieron cargar los datos.</strong><br>" +
        "Si estás abriendo el archivo directamente, usa un servidor local " +
        "(ver README) o publica en GitHub Pages.<br><small>" + esc(err.message) + "</small>";
    });
  }
  function fetchJSON(url) {
    return fetch(url + "?v=" + Date.now()).then(function (r) {
      if (!r.ok) throw new Error("No se encontró " + url + " (" + r.status + ")");
      return r.json();
    });
  }
  function formatUpdated(v) {
    if (!v) return "Sin resultados aún";
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("es-419", { day: "2-digit", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString("es-419", { hour: "2-digit", minute: "2-digit" });
  }

  function computeAllScores() {
    DATA.predictions.entries.forEach(function (e) {
      e._score = WCScoring.scoreEntry(e, DATA.results, DATA.fixtures);
    });
  }

  // ---------- navegación ----------
  function setupTabs() {
    $all("#main-tabs .tabs__btn").forEach(function (btn) {
      btn.addEventListener("click", function () { showView(btn.dataset.view); });
    });
  }
  function showView(view) {
    STATE.view = view;
    $all(".view").forEach(function (v) { v.hidden = true; });
    $all("#main-tabs .tabs__btn").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.view === view);
    });
    if (view === "detail") { $("#view-detail").hidden = false; return; }
    if (/^#\/e\//.test(location.hash || "")) { STATE._skipHash = true; location.hash = ""; }
    $("#view-" + view).hidden = false;
    window.scrollTo(0, 0);
  }

  // ---------- TABLA DE POSICIONES ----------
  function renderLeaderboard(filter) {
    var body = $("#lb-body");
    body.innerHTML = "";
    var q = (filter || "").toLowerCase().trim();
    var list = DATA.predictions.entries.slice().sort(function (a, b) {
      return b._score.total - a._score.total;
    });
    var shown = 0;
    list.forEach(function (e, idx) {
      var rank = idx + 1;
      var hay = ((e.nombre || "") + " " + (e.contacto || "") + " " + (e.codigo || "")).toLowerCase();
      if (q && hay.indexOf(q) === -1) return;
      shown++;
      var tr = el("tr");
      var rcls = rank <= 3 ? " r" + rank : "";
      tr.innerHTML =
        '<td class="col-rank"><span class="rank-badge' + rcls + '">' + rank + "</span></td>" +
        '<td><span class="lb-name">' + esc(e.nombre || "—") + "</span></td>" +
        '<td class="col-contact">' + esc(e.contacto || "—") + "</td>" +
        '<td class="col-code"><span class="code-pill">' + esc(e.codigo || "—") + "</span></td>" +
        '<td class="col-pts"><span class="lb-pts">' + fmtNum(e._score.total) + "</span></td>" +
        '<td class="col-go">›</td>';
      tr.addEventListener("click", function () { openDetail(e); });
      body.appendChild(tr);
    });
    $("#lb-count").textContent = shown + " participante" + (shown === 1 ? "" : "s");
  }

  // ---------- BUSCAR ----------
  function setupBrowse() {
    var selC = $("#f-contacto"), selK = $("#f-codigo");
    var contactos = [];
    DATA.predictions.entries.forEach(function (e) {
      if (contactos.indexOf(e.contacto) === -1) contactos.push(e.contacto);
    });
    contactos.sort(function (a, b) { return String(a).localeCompare(String(b), "es"); });
    selC.innerHTML = '<option value="">— Todos los contactos —</option>' +
      contactos.map(function (c) { return '<option>' + esc(c) + "</option>"; }).join("");

    function refreshCodes() {
      var c = selC.value;
      var entries = DATA.predictions.entries.filter(function (e) { return !c || e.contacto === c; });
      // código -> entradas (un código puede repetirse)
      var opts = ['<option value="">— Selecciona un código —</option>'];
      entries.forEach(function (e) {
        var label = (e.codigo || "—") + " · " + (e.nombre || "");
        opts.push('<option value="' + esc(e.id) + '">' + esc(label) + "</option>");
      });
      selK.innerHTML = opts.join("");
      $("#browse-result").innerHTML =
        '<p class="empty-note">Elige un contacto y un código para ver el pronóstico.</p>';
    }
    selC.addEventListener("change", refreshCodes);
    selK.addEventListener("change", function () {
      var e = DATA.predictions.entries.find(function (x) { return x.id === selK.value; });
      if (e) openDetail(e, true);
    });
    refreshCodes();

    $("#lb-search").addEventListener("input", function (ev) { renderLeaderboard(ev.target.value); });
  }

  // ============================================================
  //  DETALLE DE UN PRONÓSTICO
  // ============================================================
  function openDetail(entry, fromBrowse) {
    STATE.detailEntry = entry;
    STATE.detailTab = "grupos";
    STATE._fromBrowse = !!fromBrowse;
    if (location.hash !== "#/e/" + entry.id) {
      STATE._skipHash = true;
      location.hash = "#/e/" + entry.id;
    }
    renderDetail();
    showView("detail");
    window.scrollTo(0, 0);
  }

  // abre el detalle si la URL trae #/e/<id> (enlaces compartibles)
  function openFromHash() {
    var m = /^#\/e\/([^/]+)(?:\/(\w+))?$/.exec(location.hash || "");
    if (STATE._skipHash) { STATE._skipHash = false; return STATE.view === "detail"; }
    if (!m) return false;
    var e = DATA.predictions.entries.find(function (x) { return x.id === decodeURIComponent(m[1]); });
    if (!e) return false;
    openDetail(e, false);
    if (m[2]) { STATE.detailTab = m[2]; renderDetail(); }
    return true;
  }

  function renderDetail() {
    var e = STATE.detailEntry, s = e._score;
    var root = $("#view-detail");
    root.innerHTML = "";

    var back = el("button", "btn-back", "‹ Volver");
    back.addEventListener("click", function () { showView(STATE._fromBrowse ? "browse" : "leaderboard"); });
    var head = el("div", "detail-head");
    head.appendChild(back);
    root.appendChild(head);

    // tarjeta de persona
    var card = el("div", "person-card");
    card.innerHTML =
      '<div class="person-card__info">' +
        "<h2>" + esc(e.nombre || "—") + "</h2>" +
        '<div class="person-card__meta">' +
          "<span>👤 Contacto: " + esc(e.contacto || "—") + "</span>" +
          '<span>🔑 <span class="code-pill">' + esc(e.codigo || "—") + "</span></span>" +
        "</div>" +
      "</div>" +
      '<div class="person-card__total"><div class="num">' + fmtNum(s.total) +
        '</div><div class="lab">puntos</div></div>';
    root.appendChild(card);

    // desglose
    var bd = el("div", "breakdown");
    bd.innerHTML =
      bdChip("Fase de grupos", s.groups.points) +
      bdChip("Clasificación R32", s.classification.points) +
      bdChip("Avance de rondas", s.advancement.points) +
      bdChip("Partidos de llave", s.knockoutMatches.points) +
      bdChip("Podio", s.podio.points);
    root.appendChild(bd);

    // sub-pestañas
    var tabs = [
      ["grupos", "⚽ Grupos"],
      ["clasif", "📊 Clasificación"],
      ["avance", "📈 Avance"],
      ["llave", "🏆 Llave"],
      ["podio", "🥇 Podio"]
    ];
    var st = el("div", "subtabs");
    tabs.forEach(function (t) {
      var b = el("button", STATE.detailTab === t[0] ? "is-active" : "", t[1]);
      b.addEventListener("click", function () {
        STATE.detailTab = t[0];
        $all(".subtabs button", st).forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        renderDetailTab(panel);
      });
      st.appendChild(b);
    });
    root.appendChild(st);

    var panel = el("div", "detail-panel");
    root.appendChild(panel);
    renderDetailTab(panel);
  }

  function bdChip(label, pts) {
    return '<div class="bd-chip"><div class="lab">' + esc(label) +
      '</div><div class="num">' + fmtNum(pts) + "</div></div>";
  }

  function renderDetailTab(panel) {
    panel.innerHTML = "";
    var map = { grupos: renderGroups, clasif: renderClassification, avance: renderAdvancement,
                llave: renderKnockout, podio: renderPodio };
    map[STATE.detailTab](panel);
  }

  // ---------- GRUPOS ----------
  function renderGroups(panel) {
    var e = STATE.detailEntry, s = e._score;
    var grid = el("div", "group-grid");
    Object.keys(DATA.fixtures.groups).forEach(function (L) {
      var fx = DATA.fixtures.groups[L];
      var sc = s.groups.perGroup[L];
      var card = el("div", "gcard");
      var head = el("div", "gcard__head");
      head.innerHTML = "<span>Grupo " + L + '</span><span class="gcard__pts">+' +
        fmtNum(sc.points) + " pts</span>";
      card.appendChild(head);
      var bodyEl = el("div", "gcard__body");
      sc.matches.forEach(function (row, i) {
        var m = fx.matches[i];
        var pred = row.pred || {};
        var html = '<div class="mrow">' +
          teamSpan(m.home, "home") +
          scoreBox(pred.hg, pred.ag, "pred") +
          teamSpan(m.away, "away") + "</div>";
        if (row.played) {
          html += '<div class="mcompare">' +
            '<div class="label">Real</div>' +
            scoreBox(row.actual.hg, row.actual.ag, "actual") +
            '<div class="pbadge-row">' +
              pbadge("G", row.winner, "+6") +
              pbadge("T", row.totalGoals, "+4") +
              pbadge("E", row.exact, "+10") +
              '<span class="pbadge ' + (row.pts ? "win" : "zero") + '">= ' + row.pts + "</span>" +
            "</div></div>";
        }
        bodyEl.insertAdjacentHTML("beforeend", html);
      });
      card.appendChild(bodyEl);
      grid.appendChild(card);
    });
    panel.appendChild(grid);
  }
  function pbadge(letter, hit, val) {
    return '<span class="pbadge ' + (hit ? "win" : "zero") + '" title="' +
      ({ G: "Ganador/empate", T: "Total de goles", E: "Marcador exacto",
         L: "Lado de la llave", P: "Penales" }[letter] || "") + '">' +
      esc(letter) + " " + (hit ? val : "·") + "</span>";
  }

  // ---------- CLASIFICACIÓN R32 ----------
  function renderClassification(panel) {
    var s = STATE.detailEntry._score.classification;
    if (!s.hasData) {
      panel.appendChild(el("div", "section-note",
        "Aún no se ha definido la clasificación a la Ronda de 32. " +
        "Aquí verás qué equipos pronosticados clasificaron (10 pts) y cuáles quedaron en el puesto exacto (+5 pts)."));
    }
    panel.appendChild(el("p", "muted",
      "10 puntos por cada equipo pronosticado que clasifica · +5 si además acertaste su puesto (1.º, 2.º o 3.º del grupo)."));
    var t = el("table", "simple-table");
    t.innerHTML = "<thead><tr><th>Equipo</th><th>Grupo</th><th>Tu puesto</th>" +
      "<th>Clasificó</th><th>Puesto exacto</th><th class='num'>Pts</th></tr></thead>";
    var tb = el("tbody");
    s.items.sort(function (a, b) { return b.pts - a.pts; }).forEach(function (it) {
      var t2 = splitTeam(it.team);
      tb.insertAdjacentHTML("beforeend",
        "<tr><td>" + esc(t2.flag) + " " + esc(t2.name) + "</td>" +
        "<td>" + esc(it.group || "—") + "</td>" +
        "<td>" + it.predPos + ".º</td>" +
        "<td>" + dot(it.qualified) + (it.qualified ? "Sí" : "No") + "</td>" +
        "<td>" + dot(it.posExact) + (it.posExact ? "Sí" : "—") + "</td>" +
        "<td class='num'><strong>" + it.pts + "</strong></td></tr>");
    });
    t.appendChild(tb);
    panel.appendChild(t);
  }
  function dot(b) { return '<span class="dot ' + (b ? "yes" : "no") + '"></span>'; }

  // ---------- AVANCE DE RONDAS ----------
  function renderAdvancement(panel) {
    var s = STATE.detailEntry._score.advancement;
    var labels = { OCT: "Octavos de final", CUA: "Cuartos de final", SEM: "Semifinal", FIN: "Final" };
    panel.appendChild(el("p", "muted",
      "Puntos por cada equipo pronosticado que realmente llega a la ronda: " +
      "Octavos 15 · Cuartos 20 · Semifinal 35 · Final 50."));
    var t = el("table", "simple-table");
    t.innerHTML = "<thead><tr><th>Ronda</th><th>Pts/equipo</th><th>Equipos acertados</th><th class='num'>Pts</th></tr></thead>";
    var tb = el("tbody");
    ["OCT", "CUA", "SEM", "FIN"].forEach(function (rk) {
      var r = s.byRound[rk];
      var teams = r.teams.map(function (x) { var t2 = splitTeam(x); return t2.flag + " " + t2.name; }).join(", ");
      if (!r.hasData) teams = '<span class="muted">aún no jugado</span>';
      else if (!teams) teams = '<span class="muted">ninguno</span>';
      tb.insertAdjacentHTML("beforeend",
        "<tr><td><strong>" + labels[rk] + "</strong></td><td>" + r.perTeam + "</td>" +
        "<td>" + teams + "</td><td class='num'><strong>" + r.points + "</strong></td></tr>");
    });
    t.appendChild(tb);
    panel.appendChild(t);
  }

  // ---------- LLAVE (knockout) ----------
  function renderKnockout(panel) {
    var e = STATE.detailEntry, s = e._score.knockoutMatches;
    panel.appendChild(el("div", "section-note",
      "En la eliminación los puntos del partido se dan por el <strong>lado de la llave</strong> " +
      "(local/visitante), no por el equipo. Por eso tu equipo pronosticado puede ser distinto al real. " +
      "Lado 3 · Total de goles 2 · Goles de penales 2."));
    var byN = {};
    s.items.forEach(function (it) { byN[it.n] = it; });

    var roundsOrder = ["R32", "OCT", "CUA", "SEM", "TP", "FIN"];
    var roundMatches = {};
    DATA.fixtures.knockout.forEach(function (fx) {
      (roundMatches[fx.round] = roundMatches[fx.round] || []).push(fx);
    });

    roundsOrder.forEach(function (rk) {
      var fxs = roundMatches[rk] || [];
      var wrap = el("div", "ko-round");
      var title = el("h3", "ko-round__title");
      title.innerHTML = esc(DATA.fixtures.rounds[rk]);
      wrap.appendChild(title);
      var list = el("div", "ko-list");
      fxs.forEach(function (fx) {
        var n = fx.n;
        var pred = (e.knockout && e.knockout[String(n)]) || {};
        var act = (DATA.results.knockout && DATA.results.knockout[String(n)]) || {};
        var sc = byN[n];
        var m = el("div", "komatch");
        var ptsTag = sc ? '<span class="komatch__pts pbadge ' + (sc.pts ? "win" : "zero") + '">+' + sc.pts + " pts</span>" : "";
        var html = '<div class="komatch__no">Partido ' + n + ptsTag + "</div>";
        // tu pronóstico
        html += '<div class="mrow">' +
          teamSpan(pred.home, "home") + scoreBox(pred.hg, pred.ag, "pred") + teamSpan(pred.away, "away") + "</div>";
        if (isN(pred.ph) || isN(pred.pa)) {
          html += '<div class="mcompare"><div class="label">Penales (tú)</div>' +
            scoreBox(pred.ph, pred.pa, "pred") + "<div></div></div>";
        }
        // real
        if (sc && sc.played) {
          html += '<div class="mrow" style="margin-top:6px">' +
            teamSpan(act.home, "home") + scoreBox(act.hg, act.ag, "actual") + teamSpan(act.away, "away") + "</div>";
          if (isN(act.ph) || isN(act.pa)) {
            html += '<div class="mcompare"><div class="label">Penales (real)</div>' +
              scoreBox(act.ph, act.pa, "actual") + "<div></div></div>";
          }
          html += '<div class="pbadge-row" style="margin-top:6px">' +
            pbadge("L", sc.side, "+3") + pbadge("T", sc.totalGoals, "+2") + pbadge("P", sc.penalties, "+2") +
            "</div>";
        } else {
          html += '<p class="muted" style="margin:6px 0 0">Aún no jugado</p>';
        }
        m.innerHTML = html;
        list.appendChild(m);
      });
      wrap.appendChild(list);
      panel.appendChild(wrap);
    });
  }

  // ---------- PODIO ----------
  function renderPodio(panel) {
    var s = STATE.detailEntry._score.podio;
    var medals = { campeon: "🥇", subcampeon: "🥈", tercero: "🥉" };
    panel.appendChild(el("p", "muted", "Campeón 150 · Subcampeón 100 · Tercer lugar 75."));
    var grid = el("div", "podio-grid");
    s.items.forEach(function (it) {
      var t = splitTeam(it.pred);
      var card = el("div", "podio-card" + (it.hit ? " hit" : ""));
      card.innerHTML =
        '<div class="medal">' + medals[it.key] + "</div>" +
        '<div class="role">' + esc(it.label) + " · " + WCScoring.POINTS.PODIO[it.key] + " pts</div>" +
        '<div class="pred">' + esc(t.flag + " " + t.name) + "</div>" +
        (it.hasData
          ? '<div class="actual">Real: ' + esc(it.actual) + " · <strong>+" + it.pts + " pts</strong></div>"
          : '<div class="actual">Aún no definido</div>');
      grid.appendChild(card);
    });
    panel.appendChild(grid);
  }

  // arranque
  document.addEventListener("DOMContentLoaded", load);
})();
