/* One-page deal summary PDFs for clients. Built in the browser with jsPDF (vendor/jspdf.umd.min.js, loaded on first use).
   It only ever receives the "client safe" model from BLD.dealPdfModel, so internal notes (commission, builder contacts' private
   details, where we found the email) can not reach a PDF. Standard Helvetica only: text is cleaned to characters it can print. */
(function (root) {
  "use strict";
  var loading = null;
  function ensure() {
    if (root.jspdf && root.jspdf.jsPDF) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = "vendor/jspdf.umd.min.js";
      s.onload = function () { (root.jspdf && root.jspdf.jsPDF) ? res() : rej(new Error("PDF tool did not start.")); };
      s.onerror = function () { loading = null; rej(new Error("Could not load the PDF tool. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
    return loading;
  }
  /* Helvetica prints Latin-1. Map common typography to plain characters and drop anything else. */
  function clean(s) {
    return String(s == null ? "" : s)
      .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—−]/g, "-").replace(/…/g, "...")
      .replace(/[•●◦‣]/g, "-").replace(/[     ]/g, " ").replace(/✓|✔/g, "").replace(/[\r\t]+/g, " ")
      .replace(/[^\x20-\x7E¡-ÿ\n]/g, "");
  }
  var C = { ink: [20, 23, 31], mut: [91, 99, 114], gold: [130, 96, 15], line: [214, 208, 194], soft: [250, 244, 224] };
  function page(doc, m, i, n, brokerage) {
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 54, y = M;
    doc.setFillColor.apply(doc, C.gold); doc.rect(0, 0, W, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, C.mut);
    doc.text(clean(brokerage || "").toUpperCase(), M, y + 6, { charSpace: 1 });
    y += 40;
    doc.setFontSize(10); doc.setTextColor.apply(doc, C.gold); doc.text(clean(m.title).toUpperCase(), M, y, { charSpace: 1.2 }); y += 8;
    doc.setFontSize(25); doc.setTextColor.apply(doc, C.ink);
    var hl = doc.splitTextToSize(clean(m.headline || "Home details"), W - 2 * M).slice(0, 2);
    y += 28; doc.text(hl, M, y); y += (hl.length - 1) * 28 + 14;
    if (m.price) { doc.setFontSize(28); doc.setTextColor.apply(doc, C.gold); doc.text(clean(m.price), M, y + 14); y += 22; }
    if (m.priceNote) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor.apply(doc, C.mut); var pn = doc.splitTextToSize(clean(m.priceNote), W - 2 * M); doc.text(pn, M, y + 14); y += pn.length * 14 + 2; }
    y += 14; doc.setDrawColor.apply(doc, C.line); doc.setLineWidth(.8); doc.line(M, y, W - M, y); y += 6;
    m.rows.forEach(function (r) {
      var val = doc.splitTextToSize(clean(r[1]), W - 2 * M - 130);
      if (y + val.length * 15 + 12 > H - 190) { doc.addPage(); y = M; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, C.mut); doc.text(clean(r[0]).toUpperCase(), M, y + 17, { charSpace: .8 });
      doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor.apply(doc, C.ink); doc.text(val, M + 130, y + 17);
      y += val.length * 15 + 11; doc.line(M, y, W - M, y);
    });
    if (m.incentives.length) {
      y += 24; doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor.apply(doc, C.gold); doc.text("WHAT THE BUILDER SAYS IS INCLUDED", M, y, { charSpace: 1 }); y += 6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor.apply(doc, C.ink);
      m.incentives.forEach(function (t) {
        var ls = doc.splitTextToSize(clean(t), W - 2 * M - 16);
        if (y + ls.length * 15 + 8 > H - 150) { doc.addPage(); y = M; }
        doc.text("-", M + 2, y + 16); doc.text(ls, M + 16, y + 16); y += ls.length * 15 + 4;
      });
    }
    /* footer block, pinned to the bottom of the page */
    var fy = H - 132;
    doc.setDrawColor.apply(doc, C.line); doc.line(M, fy, W - M, fy);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, C.mut); doc.text("PREPARED BY", M, fy + 20, { charSpace: 1 });
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor.apply(doc, C.ink);
    var who = (m.agent ? [m.agent] : []).concat(m.prepared || []).map(clean).filter(Boolean);
    doc.text(who.slice(0, 4), M, fy + 36, { lineHeightFactor: 1.35 });
    doc.setFontSize(8); doc.setTextColor.apply(doc, C.mut);
    var dis = doc.splitTextToSize(clean(m.disclaimer), W - 2 * M);
    doc.text(dis, M, H - 52, { lineHeightFactor: 1.35 });
    doc.text("As of " + clean(m.asOfLabel) + "   |   " + (i + 1) + " of " + n, W - M, H - 26, { align: "right" });
  }
  /* models: array of BLD.dealPdfModel results. Returns { blob, name }. */
  function make(models, opts) {
    opts = opts || {};
    return ensure().then(function () {
      var J = root.jspdf.jsPDF, doc = new J({ unit: "pt", format: "letter", compress: true });
      doc.setProperties({ title: models.length === 1 ? clean(models[0].headline) : "Builder homes shortlist", subject: "Builder home details", creator: "Realtor OS" });
      models.forEach(function (m, i) { if (i) doc.addPage(); page(doc, m, i, models.length, opts.brokerage); });
      var d = (models[0] && models[0].asOf) || "", base = models.length === 1 ? (models[0].headline || "home") : "shortlist-" + models.length + "-homes";
      var name = clean(base).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) + (d ? "-" + d : "") + ".pdf";
      return { blob: doc.output("blob"), name: name, pages: doc.getNumberOfPages() };
    });
  }
  /* Phone: share sheet with the file. Otherwise download. */
  function deliver(res) {
    var file; try { file = new File([res.blob], res.name, { type: "application/pdf" }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      return navigator.share({ files: [file], title: res.name }).then(function () { return "shared"; }, function (e) { if (e && e.name === "AbortError") return "cancelled"; return download(res); });
    }
    return Promise.resolve(download(res));
  }
  function download(res) {
    var u = URL.createObjectURL(res.blob), a = document.createElement("a"); a.href = u; a.download = res.name; a.rel = "noopener"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000); return "downloaded";
  }
  root.BLDPDF = { ensure: ensure, make: make, deliver: deliver, download: download, clean: clean };
})(window);
