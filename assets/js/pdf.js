/* ============================================================
   pdf.js — Descarga del pronóstico de un participante en PDF (1 hoja)
   Construye una "hoja" condensada en A4 horizontal (offscreen),
   la rasteriza con html2canvas y la coloca en una sola página con jsPDF.
   Expone: window.WCPdf.download(entry, fixtures, results) -> Promise
   No toca la UI principal; sólo se invoca desde el botón del detalle.
   ============================================================ */
(function () {
  "use strict";

  // ----- utilidades de equipo / formato -----
  function isN(v) { return typeof v === "number" && !isNaN(v); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function splitTeam(s) {
    s = (s == null ? "" : String(s)).trim();
    if (!s) return { name: "—", flag: "" };
    var i = s.lastIndexOf(" ");
    if (i > 0) {
      var tail = s.slice(i + 1);
      if (/[^\x00-\x7F]/.test(tail)) return { name: s.slice(0, i), flag: tail };
    }
    return { name: s, flag: "" };
  }
  function flag(s) { return splitTeam(s).flag || ""; }
  function name(s) { return splitTeam(s).name; }
  function trunc(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  // lado ganador a partir de goles (+ penales si hubo empate)
  function winSide(hg, ag, ph, pa) {
    if (!isN(hg) || !isN(ag)) return "";
    if (hg > ag) return "H";
    if (ag > hg) return "A";
    if (isN(ph) && isN(pa)) { if (ph > pa) return "H"; if (pa > ph) return "A"; }
    return "";
  }

  // ----- estilos compartidos -----
  var C = {
    green: "#157a43", greenDk: "#0c5b30", gold: "#d98a0b",
    ink: "#1f2a33", soft: "#6b7682", line: "#cfd6dc", bg: "#ffffff", panel: "#f3f6f4"
  };

  // ----- una jugada de grupo: banderas + marcador -----
  function groupMatchRow(homeTeam, awayTeam, pred) {
    var hg = pred ? pred.hg : null, ag = pred ? pred.ag : null;
    var hw = isN(hg) && isN(ag) && hg > ag, aw = isN(hg) && isN(ag) && ag > hg;
    var sc = (isN(hg) ? hg : "–") + "–" + (isN(ag) ? ag : "–");
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:3px;font-size:10.5px;line-height:1.3;padding:2.5px 0;">' +
      '<span style="flex:1;text-align:right;font-weight:' + (hw ? "800" : "500") + ';color:' + (hw ? C.ink : C.soft) + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
        esc(trunc(name(homeTeam), 11)) + ' <span style="font-size:12px">' + esc(flag(homeTeam)) + '</span></span>' +
      '<span style="font-weight:800;color:' + C.greenDk + ';min-width:30px;text-align:center;font-size:11px;">' + esc(sc) + '</span>' +
      '<span style="flex:1;text-align:left;font-weight:' + (aw ? "800" : "500") + ';color:' + (aw ? C.ink : C.soft) + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
        '<span style="font-size:12px">' + esc(flag(awayTeam)) + '</span> ' + esc(trunc(name(awayTeam), 11)) + '</span>' +
    '</div>';
  }

  function groupCard(L, fx, pred) {
    var html = '<div style="border:1px solid ' + C.line + ';border-radius:7px;overflow:hidden;background:#fff;">';
    html += '<div style="background:' + C.green + ';color:#fff;font-weight:800;font-size:11px;padding:2px 7px;display:flex;justify-content:space-between;align-items:center;">' +
      '<span>Grupo ' + esc(L) + '</span></div>';
    html += '<div style="padding:3px 6px;">';
    for (var i = 0; i < fx.matches.length; i++) {
      var m = fx.matches[i];
      var p = (pred && pred.matches && pred.matches[i]) || null;
      html += groupMatchRow(m.home, m.away, p);
    }
    // tabla de posiciones pronosticada
    var st = (pred && pred.standings) || [];
    if (st.length) {
      html += '<div style="margin-top:3px;border-top:1px dashed ' + C.line + ';padding-top:3px;display:flex;gap:3px;flex-wrap:wrap;font-size:9px;color:' + C.soft + ';">';
      for (var k = 0; k < st.length; k++) {
        html += '<span style="white-space:nowrap;"><b style="color:' + C.greenDk + '">' + (k + 1) + '.</b> ' +
          '<span style="font-size:11px">' + esc(flag(st[k])) + '</span></span>';
      }
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }

  // ----- una llave (lado local / visitante) -----
  function koSideLine(team, goals, pen, isWin, hasPens) {
    var sc = isN(goals) ? goals : "–";
    var penTxt = (hasPens && isN(pen)) ? ' <span style="color:' + C.gold + ';font-weight:800">(' + pen + ')</span>' : "";
    return '<div style="display:flex;align-items:center;gap:3px;font-size:9.5px;line-height:1.3;color:' + (isWin ? C.ink : C.soft) + ';font-weight:' + (isWin ? "800" : "500") + ';">' +
      '<span style="font-size:11px">' + esc(flag(team)) + '</span>' +
      '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(trunc(name(team), 13)) + '</span>' +
      '<span style="font-weight:800;color:' + C.greenDk + '">' + sc + penTxt + '</span>' +
    '</div>';
  }
  function koCard(n, pred) {
    pred = pred || {};
    var hasPens = isN(pred.hg) && isN(pred.ag) && pred.hg === pred.ag && isN(pred.ph) && isN(pred.pa);
    var side = winSide(pred.hg, pred.ag, pred.ph, pred.pa);
    var html = '<div style="border:1px solid ' + C.line + ';border-radius:5px;background:#fff;padding:3px 6px;">' +
      '<div style="font-size:7.5px;color:' + C.soft + ';font-weight:700;text-transform:uppercase;letter-spacing:.3px;">#' + n + '</div>' +
      koSideLine(pred.home, pred.hg, pred.ph, side === "H", hasPens) +
      koSideLine(pred.away, pred.ag, pred.pa, side === "A", hasPens) +
    '</div>';
    return html;
  }
  function koColumn(label, ns, knockout) {
    var html = '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;">' +
      '<div style="background:' + C.greenDk + ';color:#fff;font-size:9px;font-weight:800;text-align:center;padding:2px;border-radius:4px;text-transform:uppercase;letter-spacing:.3px;">' + esc(label) + '</div>';
    for (var i = 0; i < ns.length; i++) {
      html += koCard(ns[i], knockout && knockout[String(ns[i])]);
    }
    html += '</div>';
    return html;
  }

  // ----- podio -----
  function podioCard(podio) {
    var rows = [
      { k: "campeon", lbl: "Campeón", mc: "#d98a0b", em: "🥇" },
      { k: "subcampeon", lbl: "Subcampeón", mc: "#9aa3ad", em: "🥈" },
      { k: "tercero", lbl: "Tercer puesto", mc: "#b87333", em: "🥉" },
      { k: "cuarto", lbl: "Cuarto puesto", mc: "#6b7682", em: "4️⃣" }
    ];
    var html = '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;">' +
      '<div style="background:' + C.gold + ';color:#fff;font-size:9px;font-weight:800;text-align:center;padding:2px;border-radius:4px;text-transform:uppercase;letter-spacing:.3px;">🏅 Podio</div>';
    rows.forEach(function (r) {
      var t = (podio && podio[r.k]) || "";
      html += '<div style="border:1px solid ' + C.line + ';border-left:4px solid ' + r.mc + ';border-radius:5px;background:#fff;padding:3px 6px;">' +
        '<div style="font-size:8px;color:' + C.soft + ';font-weight:700;text-transform:uppercase;letter-spacing:.3px;">' + r.em + ' ' + esc(r.lbl) + '</div>' +
        '<div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:800;color:' + C.ink + ';">' +
          '<span style="font-size:14px">' + esc(flag(t)) + '</span>' +
          '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(name(t)) + '</span></div>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  // ----- arma la hoja completa -----
  function buildSheet(entry, fixtures) {
    var W = 1400; // px de diseño; jsPDF lo encaja en una página A4 horizontal
    var sheet = document.createElement("div");
    sheet.style.cssText = "position:fixed;left:-10000px;top:0;width:" + W + "px;background:" + C.bg +
      ";font-family:'Hanken Grotesk','Helvetica Neue',Arial,sans-serif;color:" + C.ink + ";box-sizing:border-box;padding:24px 26px;";

    // encabezado
    var head = '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:3px solid ' + C.green + ';padding-bottom:8px;margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        '<img src="logo.png" alt="" style="height:44px;width:auto;" crossorigin="anonymous"/>' +
        '<div><div style="font-size:20px;font-weight:800;color:' + C.greenDk + ';line-height:1.05;">Polla Mundialista 2026</div>' +
          '<div style="font-size:11px;color:' + C.soft + ';font-weight:600;">Mundial FIFA 2026 · Serviplagas · Pronóstico del participante</div></div>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div style="font-size:19px;font-weight:800;color:' + C.ink + ';line-height:1.1;">' + esc(entry.nombre || "—") + '</div>' +
        '<div style="font-size:11px;color:' + C.soft + ';font-weight:600;">Asociado: <b style="color:' + C.ink + '">' + esc(entry.contacto || "—") + '</b>' +
          ' &nbsp;·&nbsp; N.º de polla: <b style="color:' + C.green + '">' + esc(entry.codigo || "—") + '</b></div>' +
      '</div>' +
    '</div>';

    // sección grupos
    var groups = '<div style="font-size:12px;font-weight:800;color:' + C.greenDk + ';text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">⚽ Fase de grupos</div>' +
      '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:16px;">';
    Object.keys(fixtures.groups).forEach(function (L) {
      groups += groupCard(L, fixtures.groups[L], entry.groups && entry.groups[L]);
    });
    groups += '</div>';

    // sección eliminación + podio
    var ko = entry.knockout || {};
    var knock = '<div style="font-size:12px;font-weight:800;color:' + C.greenDk + ';text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">🏆 Fase de eliminación</div>' +
      '<div style="display:flex;gap:6px;align-items:flex-start;">' +
        koColumn("Ronda de 32", [73, 74, 75, 76, 77, 78, 79, 80], ko) +
        koColumn("Ronda de 32", [81, 82, 83, 84, 85, 86, 87, 88], ko) +
        koColumn("Octavos", [89, 90, 91, 92, 93, 94, 95, 96], ko) +
        koColumn("Cuartos", [97, 98, 99, 100], ko) +
        koColumn("Semifinal", [101, 102], ko) +
        koColumn("Final / 3.º", [104, 103], ko) +
        podioCard(entry.podio) +
      '</div>';

    sheet.innerHTML = head + groups + knock;
    return sheet;
  }

  // ----- render a PDF -----
  function download(entry, fixtures /*, results */) {
    if (!window.html2canvas || !(window.jspdf && window.jspdf.jsPDF)) {
      return Promise.reject(new Error("Librerías de PDF no disponibles"));
    }
    var sheet = buildSheet(entry, fixtures);
    document.body.appendChild(sheet);

    return new Promise(function (resolve) { setTimeout(resolve, 120); }) // deja pintar emojis/imagen
      .then(function () {
        return window.html2canvas(sheet, {
          scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
          windowWidth: sheet.offsetWidth, windowHeight: sheet.offsetHeight
        });
      })
      .then(function (canvas) {
        var jsPDF = window.jspdf.jsPDF;
        var pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        var pw = pdf.internal.pageSize.getWidth();   // 297
        var ph = pdf.internal.pageSize.getHeight();  // 210
        var margin = 5;
        var availW = pw - margin * 2, availH = ph - margin * 2;
        var ratio = canvas.width / canvas.height;
        var w = availW, h = w / ratio;
        if (h > availH) { h = availH; w = h * ratio; }   // encaja siempre en 1 página
        var x = (pw - w) / 2, y = (ph - h) / 2;
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", x, y, w, h);
        var fname = slug(entry.codigo || "") + "_" + slug(entry.nombre || "participante") + ".pdf";
        pdf.save(fname);
      })
      .then(function () { if (sheet.parentNode) sheet.parentNode.removeChild(sheet); })
      .catch(function (err) { if (sheet.parentNode) sheet.parentNode.removeChild(sheet); throw err; });
  }

  function slug(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
  }

  window.WCPdf = { download: download };
})();
