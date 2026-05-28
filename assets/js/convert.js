/* ============================================================
   convert.js — Convierte el Excel exportado de KoboToolbox en
   data/predictions.json, sin instalar nada (corre en el navegador).
   La misma lógica del extractor en Python (tools/_extract.py).
   ============================================================ */
(function (global) {
  "use strict";

  var LETTERS = "ABCDEFGHIJKL".split("");
  function roundOf(n) {
    if (n >= 73 && n <= 88) return "R32";
    if (n >= 89 && n <= 96) return "OCT";
    if (n >= 97 && n <= 100) return "CUA";
    if (n === 101 || n === 102) return "SEM";
    if (n === 103) return "TP";
    return "FIN"; // 104
  }
  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return isNaN(n) ? null : n;
  }
  function str(v) { return (v === null || v === undefined || v === "") ? null : String(v).trim(); }
  function iso(v) {
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
    return (v === null || v === undefined || v === "") ? null : String(v);
  }
  function tmplVar(h) { var m = /\$\{(.+?)\}/.exec(h || ""); return m ? m[1] : null; }

  // rows: array de filas (cada fila = array de celdas). rows[0] = encabezados.
  function extractPredictions(rows) {
    var H = rows[0];
    var hdr2col = {};
    H.forEach(function (h, c) { if (typeof h === "string" && !(h in hdr2col)) hdr2col[h] = c; });

    // ---- columnas de la fase de grupos ("Goles de TEAM", sin plantilla) ----
    var golesGroup = [];
    H.forEach(function (h, c) {
      if (typeof h === "string" && h.indexOf("Goles de ") === 0 && h.indexOf("${") === -1) golesGroup.push(c);
    });
    if (golesGroup.length !== 144) {
      throw new Error("Se esperaban 144 columnas de goles de grupos y se encontraron " + golesGroup.length +
        ". ¿El Excel es el export correcto de la Polla?");
    }
    var groupCols = {}; // L -> {mcols:[[a,b]x6], stand:[c1..c4]}
    LETTERS.forEach(function (L, gi) {
      var cols = golesGroup.slice(gi * 12, gi * 12 + 12);
      var mcols = [];
      for (var m = 0; m < 6; m++) mcols.push([cols[2 * m], cols[2 * m + 1]]);
      var stand = [];
      for (var p = 1; p <= 4; p++) stand.push(hdr2col["grp_" + L.toLowerCase() + "_pos" + p + "_name"]);
      groupCols[L] = { mcols: mcols, stand: stand };
    });

    // ---- columnas de eliminación (bloques de 8, desde la primera "Goles de ${...}") ----
    var koStart = -1;
    for (var c = 0; c < H.length; c++) {
      if (typeof H[c] === "string" && /^Goles de \$\{/.test(H[c])) { koStart = c; break; }
    }
    if (koStart === -1) throw new Error("No se encontró la fase de eliminación en el Excel.");
    var koCols = {}, koFeeders = {};
    for (var i = 0; i < 32; i++) {
      var n = 73 + i, g0 = koStart + i * 8;
      koCols[n] = { gh: g0, ga: g0 + 1, ph: g0 + 3, pa: g0 + 4, gan: g0 + 5, per: g0 + 6 };
      koFeeders[n] = { home: tmplVar(H[g0]), away: tmplVar(H[g0 + 1]) };
    }

    // ---- columnas de terceros ----
    var terCols = {};
    H.forEach(function (h, c2) {
      if (typeof h === "string" && h.indexOf("tercero_name_p") === 0) {
        terCols[h.replace("tercero_name_", "")] = c2; // pNN -> col
      }
    });

    // índices de identidad (NO extraemos el celular: es información personal)
    var C = { start: 0, end: 1, contacto: 6, codigo: 8, nombre: 9 };

    var entries = [];
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      var cod = row[C.codigo], nom = row[C.nombre];
      if ((cod === null || cod === undefined || cod === "") &&
          (nom === null || nom === undefined || nom === "")) continue;

      function resolve(varName) {
        var col = hdr2col[varName];
        return col === undefined ? null : str(row[col]);
      }

      var groups = {};
      LETTERS.forEach(function (L) {
        var gc = groupCols[L];
        var matches = gc.mcols.map(function (mc) { return { hg: num(row[mc[0]]), ag: num(row[mc[1]]) }; });
        var standings = gc.stand.map(function (col) { return str(row[col]); });
        groups[L] = { matches: matches, standings: standings };
      });

      var thirds = {};
      Object.keys(terCols).forEach(function (pk) { thirds[pk] = str(row[terCols[pk]]); });

      var knockout = {};
      for (var nn = 73; nn <= 104; nn++) {
        var cc = koCols[nn], fd = koFeeders[nn];
        knockout[nn] = {
          home: resolve(fd.home), away: resolve(fd.away),
          hg: num(row[cc.gh]), ag: num(row[cc.ga]),
          ph: num(row[cc.ph]), pa: num(row[cc.pa]),
          winner: str(row[cc.gan]), loser: str(row[cc.per])
        };
      }

      entries.push({
        id: "r" + (r + 1),
        contacto: str(row[C.contacto]),
        codigo: cod === null || cod === undefined ? null : String(cod).trim(),
        nombre: str(row[C.nombre]),
        start: iso(row[C.start]), end: iso(row[C.end]),
        groups: groups, thirds: thirds, knockout: knockout,
        podio: {
          campeon: resolve("podio_campeon"), subcampeon: resolve("podio_subcampeon"),
          tercero: resolve("podio_tercero"), cuarto: resolve("podio_cuarto")
        }
      });
    }

    return { generated: new Date().toISOString(), count: entries.length, entries: entries };
  }

  global.PollaConvert = { extractPredictions: extractPredictions };
})(typeof window !== "undefined" ? window : globalThis);
