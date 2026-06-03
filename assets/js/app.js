/* ============================================================
   app.js — Polla Mundialista 2026 (Serviplagas)
   Interfaz pública: tabla de posiciones + búsqueda de pronósticos
   + comparación pronóstico vs. resultado real y puntos.
   ============================================================ */
(function () {
  "use strict";

  var DATA = { fixtures: null, predictions: null, results: null };
  var STATE = { view: "browse", detailEntry: null, detailTab: "grupos" };

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
      if (!openFromHash()) showView("browse");
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
    var m = /^#\/e\/([^/]+)(?:\/([\w-]+))?$/.exec(location.hash || "");
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
    var pdfBtn = el("button", "btn-pdf", '<span class="btn-pdf__ic">⬇</span> Descargar pronóstico (PDF)');
    pdfBtn.addEventListener("click", function () {
      if (!window.WCPdf) { alert("No se pudo cargar el generador de PDF. Revisa tu conexión a internet."); return; }
      var orig = pdfBtn.innerHTML;
      pdfBtn.disabled = true;
      pdfBtn.innerHTML = '<span class="btn-pdf__ic">⏳</span> Generando…';
      WCPdf.download(e, DATA.fixtures, DATA.results).catch(function (err) {
        alert("No se pudo generar el PDF: " + (err && err.message ? err.message : err));
      }).then(function () {
        pdfBtn.disabled = false;
        pdfBtn.innerHTML = orig;
      });
    });
    var head = el("div", "detail-head");
    head.appendChild(back);
    head.appendChild(pdfBtn);
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

    // sub-pestañas — orden cronológico del torneo: cada fase y cada
    // "clasificados a…" tiene su propia pestaña.
    var tabs = [
      ["grupos", "⚽ Fase de grupos"],
      ["clasif-r32", "📊 Clasificados a 2.ª ronda"],
      ["elim-r32", "🏆 Eliminación directa 2.ª ronda"],
      ["clasif-oct", "📊 Clasificados a octavos"],
      ["oct", "🏆 Octavos de final"],
      ["clasif-cua", "📊 Clasificados a cuartos"],
      ["cua", "🏆 Cuartos de final"],
      ["clasif-sem", "📊 Clasificados a la semifinal"],
      ["sem", "🏆 Semifinal"],
      ["clasif-fin", "📊 Clasificados a la final"],
      ["final", "🏆 Final"],
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
    // Cada pestaña reutiliza un renderizador existente, filtrando por la
    // ronda que corresponde a esa fase cronológica.
    var map = {
      grupos: function (p) { renderGroups(p); },
      "clasif-r32": function (p) { renderClassification(p); },
      "elim-r32": function (p) { renderKnockout(p, ["R32"]); },
      "clasif-oct": function (p) { renderAdvancement(p, "OCT"); },
      oct: function (p) { renderKnockout(p, ["OCT"]); },
      "clasif-cua": function (p) { renderAdvancement(p, "CUA"); },
      cua: function (p) { renderKnockout(p, ["CUA"]); },
      "clasif-sem": function (p) { renderAdvancement(p, "SEM"); },
      sem: function (p) { renderKnockout(p, ["SEM"]); },
      "clasif-fin": function (p) { renderAdvancement(p, "FIN"); },
      final: function (p) { renderKnockout(p, ["TP", "FIN"]); },
      podio: function (p) { renderPodio(p); }
    };
    (map[STATE.detailTab] || map.grupos)(panel);
  }

  // ============================================================
  //  PRIMITIVAS DE DISEÑO "CLARO"  (azul=pronóstico, carbón=real,
  //  dorado=puntos, verde ✓=acierto / gris ✗=fallo)
  // ============================================================
  var SVG = {
    check: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    dash: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>'
  };
  function icon(name) { return SVG[name] || ""; }
  function ruleIcon(state) { // 'ok' | 'no' | 'na'
    var cls = state === "ok" ? "ri-ok" : state === "na" ? "ri-na" : "ri-no";
    var ic = state === "ok" ? SVG.check : state === "na" ? SVG.dash : SVG.x;
    return '<span class="ri ' + cls + '">' + ic + "</span>";
  }
  function flagEmoji(teamStr, size) {
    var f = splitTeam(teamStr).flag;
    return f ? '<span class="flagemoji" style="font-size:' + (size || 18) + 'px">' + esc(f) + "</span>" : "";
  }
  function teamName(teamStr) { return esc(splitTeam(teamStr).name); }
  function teamCl(teamStr, sideCls) {
    return '<span class="team ' + (sideCls || "") + '">' + flagEmoji(teamStr, 18) +
      '<span class="team-name">' + teamName(teamStr) + "</span></span>";
  }
  function scorePair(hg, ag, tone) {
    var a = isN(hg) ? hg : "–", b = isN(ag) ? ag : "–";
    return '<span class="scorepair tone-' + tone + '"><b>' + a + '</b><span class="sp-dash">–</span><b>' + b + "</b></span>";
  }
  function ptsPill(value, size) {
    return '<span class="pts ' + (value > 0 ? "pts-win" : "pts-zero") + " pts-" + (size || "sm") +
      '">' + value + '<span class="pts-u">pts</span></span>';
  }
  function whySeg(label, state, val) { // state: ok | no | na
    var segCls = state === "ok" ? "is-ok" : state === "na" ? "is-na" : "is-no";
    var ptsTxt = state === "ok" ? "+" + val : state === "na" ? "—" : "+0";
    return '<div class="why-seg ' + segCls + '">' + ruleIcon(state) +
      '<span class="why-lbl">' + esc(label) + '</span><span class="why-pts">' + ptsTxt + "</span></div>";
  }
  function boolPill(ok, yes, no, muted) {
    var cls = ok ? "bp-yes" : muted ? "bp-muted" : "bp-no";
    return '<span class="boolpill ' + cls + '"><span class="bp-dot"></span>' + (ok ? yes : no) + "</span>";
  }
  function appendHTML(panel, html) { var w = el("div"); w.innerHTML = html; panel.appendChild(w); }

  // ---------- GRUPOS (Claro) ----------
  function renderGroups(panel) {
    var e = STATE.detailEntry, s = e._score;
    var html = '<div class="grupos-claro">';
    Object.keys(DATA.fixtures.groups).forEach(function (L) {
      var fx = DATA.fixtures.groups[L], sc = s.groups.perGroup[L];
      html += '<div class="gcol"><div class="gcol-h"><h3>Grupo ' + L +
        '</h3><span class="gcol-pts">+' + fmtNum(sc.points) + ' pts</span></div><div class="gcol-body">';
      sc.matches.forEach(function (row, i) {
        var m = fx.matches[i], pred = row.pred || {};
        var played = row.played;
        var perfect = played && row.pts === 20;
        var st = function (b) { return !played ? "na" : (b ? "ok" : "no"); };
        // Estructura fija: pronóstico + real + desglose siempre presentes,
        // así la tarjeta mantiene el mismo tamaño esté o no jugado el partido.
        html += '<div class="gm1' + (perfect ? " gm1-perfect" : "") + (played ? "" : " is-pending") + '">';
        if (!played) html += '<span class="pend-badge">⏳ Por jugar</span>';
        html += '<div class="gm1-rows">';
        html += '<div class="gm1-row gm1-pred"><span class="gm1-tag tag-pred">Tu pronóstico</span>' +
          teamCl(m.home, "team-left") + scorePair(pred.hg, pred.ag, "pred") + teamCl(m.away, "team-right") + "</div>";
        html += '<div class="gm1-row gm1-real"><span class="gm1-tag tag-real">' +
          (played ? "Resultado real" : "Sin resultado aún") + "</span>" +
          teamCl(m.home, "team-left team-dim") + scorePair(row.actual.hg, row.actual.ag, "real") +
          teamCl(m.away, "team-right team-dim") + "</div>";
        html += "</div>"; // gm1-rows
        html += '<div class="gm1-why">' +
          whySeg("Ganador", st(row.winner), 6) +
          whySeg("Total de goles", st(row.totalGoals), 4) +
          whySeg("Marcador exacto", st(row.exact), 10) +
          '<div class="gm1-tot' + (played && row.pts ? "" : " is-zero") + '">' +
            (perfect ? '<span class="perfbadge">PLENO</span>' : "") +
            '<span class="gm1-tot-n">' + (played ? row.pts : "—") + '</span><span class="gm1-tot-u">pts</span></div></div>';
        html += "</div>"; // gm1
      });
      html += "</div></div>"; // gcol-body, gcol
    });
    html += "</div>";
    appendHTML(panel, html);
  }

  // ---------- CLASIFICACIÓN R32 (Claro) ----------
  function renderClassification(panel) {
    var s = STATE.detailEntry._score.classification;
    var html = '<div class="clasif-claro"><p class="phase-legend"><b>10 puntos</b> por cada equipo que ' +
      'pronosticaste y de verdad clasifica · <b>+5</b> si además acertaste su puesto (1.º, 2.º o 3.º del grupo).</p>';
    if (!s.hasData) {
      html += '<p class="phase-legend phase-legend-accent">Aún no se ha definido la clasificación a la Ronda de 32. ' +
        "Esta tabla se completará cuando carguen las posiciones finales de los grupos.</p>";
    }
    html += '<div class="cl1-table"><div class="cl1-head"><span>Equipo</span><span>Grupo</span>' +
      '<span>Tu puesto</span><span>Clasificó</span><span>Puesto exacto</span><span class="ta-r">Puntos</span></div>';
    s.items.slice().sort(function (a, b) {
      // ordena por grupo (A, B, C…) y, dentro del grupo, por puesto pronosticado.
      var ga = a.group || "ZZ", gb = b.group || "ZZ";
      if (ga !== gb) return ga < gb ? -1 : 1;
      return a.predPos - b.predPos;
    }).forEach(function (it) {
      var q = it.qualified, p = it.posExact;
      html += '<div class="cl1-row' + (q ? "" : " cl1-out") + '">' +
        '<span class="cl1-team">' + flagEmoji(it.team, 20) + teamName(it.team) + "</span>" +
        '<span class="cl1-grp">' + esc(it.group || "—") + "</span>" +
        '<span class="cl1-pos">' + it.predPos + ".º</span>" +
        '<span class="cl1-q">' + boolPill(q, "Sí", "No", false) + "</span>" +
        '<span class="cl1-pe">' + boolPill(p, "Sí", q ? "No" : "—", !q) + "</span>" +
        '<span class="ta-r cl1-pts"><span class="cl1-break"><i class="' + (q ? "on" : "") + '">+10</i>' +
        '<i class="' + (p ? "on" : "off") + '">+5</i></span><b class="' + (it.pts > 0 ? "win" : "zero") +
        '">' + it.pts + "</b></span></div>";
    });
    html += "</div></div>";
    appendHTML(panel, html);
  }

  // ---------- AVANCE DE RONDAS (Claro) ----------
  function renderAdvancement(panel, roundKey) {
    var s = STATE.detailEntry._score.advancement;
    var meta = { OCT: { lbl: "Octavos de final", cls: "" }, CUA: { lbl: "Cuartos de final", cls: "av1-cua" },
                 SEM: { lbl: "Semifinal", cls: "av1-sem" }, FIN: { lbl: "Final", cls: "av1-fin" } };
    var r = s.byRound[roundKey], M = meta[roundKey];
    var items = r.items || [], empty = items.length === 0;
    var html = '<div class="avance-claro"><p class="phase-legend">Aquí están <b>todos los equipos</b> que ' +
      'pronosticaste para esta ronda. En <b class="lg-hit">verde</b> los que acertaste (suman <b>+' + r.perTeam +
      '</b> cada uno) y en <b class="lg-miss">rojo</b> los que pronosticaste pero no llegaron (no suman). ' +
      "No importa contra quién juegue cada equipo.</p>";
    html += '<div class="av1-band ' + M.cls + (empty ? " av1-empty" : "") + '">' +
      '<div class="av1-meta"><h3>' + M.lbl + '</h3><span class="av1-per">+' + r.perTeam +
      ' <i>por equipo</i></span></div><div class="av1-teams">';
    if (empty) html += '<span class="av1-none">No pronosticaste equipos para esta ronda</span>';
    else items.forEach(function (it) {
      var ic = it.status === "hit" ? icon("check") : it.status === "miss" ? icon("x") : "";
      html += '<span class="av1-chip av1-' + it.status + '">' + flagEmoji(it.team, 18) +
        '<span class="av1-cn">' + teamName(it.team) + "</span>" +
        (ic ? '<span class="av1-ci">' + ic + "</span>" : "") + "</span>";
    });
    html += '</div><div class="av1-tot ' + (r.points > 0 ? "win" : "zero") + '"><b>' + r.points +
      "</b><span>pts</span>" + (r.teams.length > 0 ? "<em>" + r.teams.length + " × " + r.perTeam + "</em>" : "") +
      "</div></div>";
    html += "</div>";
    appendHTML(panel, html);
  }

  // ---------- LLAVE / eliminación (Claro) ----------
  function koCell(teamStr, goals, win) {
    return '<div class="lv1-cell' + (win ? " is-win" : "") + '">' + flagEmoji(teamStr, 20) +
      '<span class="lv1-tn">' + teamName(teamStr) + '</span><span class="lv1-g">' +
      (isN(goals) ? goals : "–") + "</span>" + (win ? '<span class="lv1-wtag">gana</span>' : "") + "</div>";
  }
  function renderKnockout(panel, rounds) {
    var e = STATE.detailEntry, s = e._score.knockoutMatches;
    var byN = {};
    s.items.forEach(function (it) { byN[it.n] = it; });
    var roundMatches = {};
    DATA.fixtures.knockout.forEach(function (fx) {
      (roundMatches[fx.round] = roundMatches[fx.round] || []).push(fx);
    });
    var html = '<div class="llave-claro"><p class="phase-legend phase-legend-accent">En la eliminación los ' +
      "puntos se dan por el <b>lado de la llave</b> (local/visitante), no por el equipo. Por eso tu equipo " +
      "pronosticado puede ser distinto al real: lo que cuenta es qué <b>lado</b> gana. &nbsp;Ganador <b>+3</b> · " +
      "Total de goles <b>+2</b> · Penales <b>+2</b>.</p>";
    (rounds || ["R32", "OCT", "CUA", "SEM", "TP", "FIN"]).forEach(function (rk) {
      var fxs = roundMatches[rk] || [];
      if (!fxs.length) return;
      html += '<h3 class="lv1-round">' + esc(DATA.fixtures.rounds[rk]) + '</h3><div class="lv1-list">';
      fxs.forEach(function (fx) {
        var n = fx.n;
        var pred = (e.knockout && e.knockout[String(n)]) || {};
        var act = (DATA.results.knockout && DATA.results.knockout[String(n)]) || {};
        var sc = byN[n];
        var played = !!(sc && sc.played);
        var pSide = WCScoring.winningSide(pred.hg, pred.ag, pred.ph, pred.pa);
        var rSide = WCScoring.winningSide(act.hg, act.ag, act.ph, act.pa);
        var ptsHtml = played ? ptsPill(sc.pts, "sm")
          : '<span class="pend-badge">⏳ Por jugar</span>';
        html += '<div class="lv1-card' + (played ? "" : " is-pending") + '"><div class="lv1-h"><span class="lv1-num">Partido ' + n + "</span>" +
          ptsHtml + "</div>";
        // Estructura fija (pronóstico + real + desglose) -> mismo tamaño jugado o no.
        html += '<div class="lv1-grid"><span class="lv1-colh">Lado local</span><span class="lv1-colh">Lado visitante</span>';
        html += '<span class="lv1-rowtag tag-pred">Tu pronóstico</span>' +
          koCell(pred.home, pred.hg, pSide === "H") + koCell(pred.away, pred.ag, pSide === "A");
        html += '<span class="lv1-rowtag tag-real">' + (played ? "Resultado real" : "Sin resultado aún") + "</span>" +
          koCell(act.home, act.hg, played && rSide === "H") + koCell(act.away, act.ag, played && rSide === "A");
        html += "</div>"; // lv1-grid
        var actPens = played && act.hg === act.ag && isN(act.ph) && isN(act.pa);
        html += '<div class="lv1-why">' +
          whySeg("Ganador del lado", played ? (sc.side ? "ok" : "no") : "na", 3) +
          whySeg("Total de goles", played ? (sc.totalGoals ? "ok" : "no") : "na", 2) +
          whySeg("Goles en penales", actPens ? (sc.penalties ? "ok" : "no") : "na", 2) + "</div>";
        html += "</div>"; // lv1-card
      });
      html += "</div>";
    });
    html += "</div>";
    appendHTML(panel, html);
  }

  // ---------- PODIO (Claro) ----------
  function renderPodio(panel) {
    var s = STATE.detailEntry._score.podio;
    var medalColor = { campeon: "#E8920E", subcampeon: "#9aa3ad", tercero: "#b87333" };
    var medalNum = { campeon: "1", subcampeon: "2", tercero: "3" };
    var html = '<div class="podio-claro"><p class="phase-legend">Los tres primeros lugares son los premios más ' +
      "grandes de la polla. Estos puntos se suman a todo lo que esos equipos ya te dieron por avanzar ronda tras ronda.</p>" +
      '<div class="pd1-grid">';
    s.items.forEach(function (it) {
      html += '<div class="pd1-card ' + (it.hit ? "hit" : "miss") + '">' +
        '<div class="pd1-medal" style="--mc:' + medalColor[it.key] + '"><span>' + medalNum[it.key] + "</span></div>" +
        '<div class="pd1-label">' + esc(it.label) + " · <b>" + WCScoring.POINTS.PODIO[it.key] + " pts</b></div>" +
        '<div class="pd1-pick">' + flagEmoji(it.pred, 30) + "<b>" + teamName(it.pred) + "</b></div>";
      if (it.hasData) {
        html += it.hit
          ? '<div class="pd1-real ok"><span class="pd1-chk">' + icon("check") + "</span> ¡Acertaste! Real: " + teamName(it.actual) + "</div>"
          : '<div class="pd1-real no">Real: ' + flagEmoji(it.actual, 16) + " " + teamName(it.actual) + "</div>";
        html += '<div class="pd1-pts ' + (it.hit ? "win" : "zero") + '">' + (it.hit ? "+" + it.pts : "+0") + " <i>pts</i></div>";
      } else {
        html += '<div class="pd1-real no">Aún no definido</div><div class="pd1-pts zero">— <i>pts</i></div>';
      }
      html += "</div>";
    });
    html += "</div></div>";
    appendHTML(panel, html);
  }

  // arranque
  document.addEventListener("DOMContentLoaded", load);
})();
