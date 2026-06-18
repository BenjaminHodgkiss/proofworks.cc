/* ───────────────────────────────────────────────────────────────
   Proofworks · 100 Experts — front-end logic
   - 100-person budget allocated across categories (+ custom ones)
   - Live dot grid, sticky gauge, validation
   - Submits via the submit-experts edge function (keep-latest) or fakes it in DEMO_MODE
   ─────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  const CFG = window.PW_CONFIG || {};
  const TOTAL = 100;
  const CUSTOM_COLOR = "#59A14F";           // colour for user-added "Your additions"
  const groups = window.PW_GROUPS || [];
  const groupIds = groups.map(g => g.id);
  const groupColor = id => (groups.find(g => g.id === id) || {}).color || CUSTOM_COLOR;
  const groupOf = c => (groupIds.includes(c.group) ? c.group : "custom");

  // state: category list (clone so we can add custom), allocation map.
  // Each category inherits its group's colour, so dots/legend read by field.
  const cats = (window.PW_CATEGORIES || []).map(c => ({ ...c, color: groupColor(c.group) }));
  const alloc = Object.fromEntries(cats.map(c => [c.id, 0]));

  // Randomise display order on every page load so no field or expert type gets a
  // fixed-position bias: shuffle the 8 groups, then the expert types. renderCards()
  // pulls each group's cards via cats.filter (which preserves cats' relative order),
  // so one shuffle of cats randomises the order within every group. Fisher-Yates;
  // Math.random() reseeds per load, so each visit reorders afresh. The legend and
  // dot-grid layout read the same `groups`, so they stay consistent with the cards.
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  shuffle(groups);
  shuffle(cats);

  // A "field" is a group id (or "custom"); helpers for the hover-card + block layout.
  const fieldColor = key => key === "custom" ? CUSTOM_COLOR : groupColor(key);
  const fieldName  = key => key === "custom" ? "Your additions" : ((groups.find(g => g.id === key) || {}).name || key);
  const rolesOf    = key => cats.filter(c => groupOf(c) === key && alloc[c.id] > 0).sort((a, b) => alloc[b.id] - alloc[a.id]);

  // ── Supabase ──
  let sb = null;
  if (!CFG.DEMO_MODE && CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("YOUR-PROJECT")) {
    try { sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); }
    catch (e) { console.warn("Supabase init failed, falling back to demo:", e); }
  }
  const DEMO = !sb;

  // ── DOM refs ──
  const $ = s => document.querySelector(s);
  const cardsEl = $("#cards"), legendEl = $("#legend"), dotgridEl = $("#dotgrid");
  const placedEl = $("#placed"), barEl = $("#bar"), barFill = $("#barfill"), stateEl = $("#state");
  const submitBtn = $("#submit"), ctaText = $("#ctatext"), errEl = $("#err");
  const form = $("#form"), nameEl = $("#name"), emailEl = $("#email"), reasoningEl = $("#reasoning");
  const doneEl = $("#done"), builderEl = $("#builder"), doneMsgEl = $("#doneMsg");
  const heroEl = document.querySelector(".hero"), footerEl = document.querySelector("footer");

  // ── Build 100 dots ──
  const dots = [];
  for (let i = 0; i < TOTAL; i++) {
    const d = document.createElement("div");
    d.className = "dot";
    dotgridEl.appendChild(d);
    dots.push(d);
  }

  // ── Render category cards ──
  function makeCard(cat) {
    const el = document.createElement("div");
    el.className = "card";
    el.style.setProperty("--c", cat.color);
    el.dataset.id = cat.id;
    el.innerHTML = `
      <div class="top">
        <span class="swatch"></span>
        <div>
          <div class="name">${escapeHtml(cat.name)}</div>
          ${cat.blurb ? `<div class="blurb">${escapeHtml(cat.blurb)}</div>` : ""}
        </div>
        ${cat.custom ? `<button class="del" title="Remove" aria-label="Remove">×</button>` : ""}
      </div>
      <div class="stepper">
        <button class="step minus" type="button" aria-label="Decrease">−</button>
        <div class="qty">
          <input type="number" inputmode="numeric" min="0" max="100" value="0" aria-label="${escapeHtml(cat.name)} count" />
          <span class="pct">0%</span>
        </div>
        <button class="step plus" type="button" aria-label="Increase">+</button>
      </div>
      <p class="capmsg" aria-live="polite"></p>`;
    const input = el.querySelector("input");
    const pct = el.querySelector(".pct");
    const capmsg = el.querySelector(".capmsg");
    let prevVal = alloc[cat.id], capTimer = 0;
    const clearCap = () => { clearTimeout(capTimer); capmsg.textContent = ""; el.classList.remove("capped"); };
    const showCap = () => {
      const left = TOTAL - placed();
      capmsg.textContent = left === 0 ? "No spaces left" : left === 1 ? "Only 1 space left" : `Only ${left} spaces left`;
      el.classList.remove("capped"); void el.offsetWidth; el.classList.add("capped");
      clearTimeout(capTimer); capTimer = setTimeout(clearCap, 2600);
    };
    el.querySelector(".minus").onclick = () => { clearCap(); bump(cat.id, -1); };
    el.querySelector(".plus").onclick = () => { clearCap(); bump(cat.id, +1); };
    input.oninput = () => {
      if (input.value === "") return;                       // empty mid-edit: wait for a digit
      const typed = parseInt(input.value, 10);
      if (isNaN(typed)) return;
      // the most this field can hold without pushing the running total past 100
      const cap = TOTAL - (placed() - alloc[cat.id]);
      if (typed > cap) {                                    // would exceed the budget → reject it
        setVal(cat.id, prevVal);
        input.value = prevVal;
        showCap();
        return;
      }
      clearCap();
      setVal(cat.id, typed);
    };
    input.onblur = () => { input.value = alloc[cat.id]; clearCap(); };
    // Don't let the mouse wheel nudge a focused number field while scrolling the
    // page — blur it so the wheel scrolls the page instead of changing the value.
    input.addEventListener("wheel", () => input.blur(), { passive: true });
    // clear the field on focus — a blank box with a blinking cursor invites
    // typing; if nothing is typed, blur restores the previous value
    input.onfocus = () => { prevVal = alloc[cat.id]; input.value = ""; };
    const del = el.querySelector(".del");
    if (del) del.onclick = () => removeCat(cat.id);
    el._input = input; el._pct = pct;
    cat._el = el;
    return el;
  }

  function makeGroupHead(g, num) {
    const el = document.createElement("div");
    el.className = "group-head";
    el.dataset.group = g.id;
    el.innerHTML = `
      <span class="gsw" style="background:${g.color}"></span>
      <h3>${escapeHtml(g.name)}</h3>
      <span class="gtot"><b>0</b> chosen</span>`;
    return el;
  }

  function renderCards() {
    cardsEl.innerHTML = "";
    groups.forEach((g, i) => {
      const inGroup = cats.filter(c => c.group === g.id);
      if (!inGroup.length) return;
      cardsEl.appendChild(makeGroupHead(g, i + 1));
      inGroup.forEach(c => cardsEl.appendChild(makeCard(c)));
    });
    const custom = cats.filter(c => groupOf(c) === "custom");
    if (custom.length) {
      cardsEl.appendChild(makeGroupHead({ id: "custom", name: "Your additions", color: CUSTOM_COLOR }, null));
      custom.forEach(c => cardsEl.appendChild(makeCard(c)));
    }
    const sep = document.createElement("div");
    sep.className = "add-sep";
    cardsEl.appendChild(sep);
    cardsEl.appendChild(addCard());
    renderLegend();
  }

  // ── Add-your-own card ──
  function addCard() {
    const el = document.createElement("div");
    el.className = "card addcard";
    el.innerHTML = `
      <span class="label">+ Add a type</span>
      <div class="row">
        <input type="text" maxlength="60" placeholder="e.g. Optical imaging specialists" aria-label="New expert type" />
        <button class="addbtn" type="button">Add</button>
      </div>`;
    const input = el.querySelector("input");
    const btn = el.querySelector(".addbtn");
    const add = () => {
      const name = input.value.trim();
      if (!name) return;
      const id = "custom_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") + "_" + cats.length;
      const cat = { id, name, blurb: "", color: CUSTOM_COLOR, group: "custom", custom: true };
      cats.push(cat); alloc[id] = 0;
      input.value = "";
      renderCards(); update();
      // focus the new card's stepper input
      cat._el.querySelector("input").focus();
    };
    btn.onclick = add;
    input.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); add(); } };
    return el;
  }

  function removeCat(id) {
    const i = cats.findIndex(c => c.id === id);
    if (i < 0) return;
    delete alloc[id];
    cats.splice(i, 1);
    renderCards(); update();
  }

  // ── Allocation logic ──
  function placed() { return Object.values(alloc).reduce((a, b) => a + b, 0); }

  function bump(id, d) {
    setVal(id, alloc[id] + d);
  }
  function setVal(id, v) {
    if (isNaN(v)) v = 0;
    v = Math.max(0, Math.min(TOTAL, Math.round(v)));
    // cap so total never exceeds 100
    const others = placed() - alloc[id];
    v = Math.min(v, TOTAL - others);
    alloc[id] = v;
    update();
  }

  function update() {
    const p = placed();
    placedEl.textContent = p;
    // gauge
    barFill.style.width = Math.min(100, p) + "%";
    barEl.classList.toggle("over", p > TOTAL);
    const remaining = TOTAL - p;
    if (p === TOTAL) { stateEl.textContent = "ready ✓"; stateEl.className = "state ok"; }
    else if (p > TOTAL) { stateEl.textContent = (p - TOTAL) + " over"; stateEl.className = "state over"; }
    else { stateEl.textContent = remaining + " to place"; stateEl.className = "state"; }

    // cards: active state + inputs + pct
    cats.forEach(c => {
      const v = alloc[c.id];
      if (!c._el) return;
      c._el.classList.toggle("active", v > 0);
      if (document.activeElement !== c._el._input) c._el._input.value = v;
      c._el._pct.textContent = (p > 0 ? Math.round(v / p * 100) : 0) + "%";
      const minus = c._el.querySelector(".minus");
      if (minus) minus.disabled = v <= 0;
    });

    // group-head running totals
    const gt = groupTotals();
    cardsEl.querySelectorAll(".group-head").forEach(h => {
      const b = h.querySelector(".gtot b");
      if (b) b.textContent = gt[h.dataset.group] || 0;
    });

    paintDots();
    renderLegend();
    syncSpotlight();

    // submit gating
    const ready = p === TOTAL;
    submitBtn.disabled = !ready;
    ctaText.textContent = "Submit my choices";
  }

  // Lay the grid out as compact, near-square blocks per field (recursive
  // squarified bisection: cut the longer axis, split the head-count evenly).
  // Returns a TOTAL-length array of field key | null (empty) by cell y*10+x.
  function layoutGrid() {
    const t = groupTotals();
    const order = groups.map(g => g.id).concat(t.custom ? ["custom"] : []);
    const segs = order.map(k => ({ key: k, count: t[k] || 0 })).filter(s => s.count > 0);
    const p = segs.reduce((s, g) => s + g.count, 0);
    if (p < TOTAL) segs.push({ key: null, count: TOTAL - p });   // empties cluster into their own block
    const assign = new Array(TOTAL).fill(null);
    const cells = [];
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) cells.push({ x, y });

    (function rec(cells, segs) {
      if (!segs.length) return;
      if (segs.length === 1) { cells.forEach(c => assign[c.y * 10 + c.x] = segs[0].key); return; }
      let minx = 10, maxx = -1, miny = 10, maxy = -1;
      cells.forEach(c => { if (c.x < minx) minx = c.x; if (c.x > maxx) maxx = c.x; if (c.y < miny) miny = c.y; if (c.y > maxy) maxy = c.y; });
      if ((maxx - minx) >= (maxy - miny)) cells.sort((a, b) => a.x - b.x || a.y - b.y);
      else                                cells.sort((a, b) => a.y - b.y || a.x - b.x);
      const total = segs.reduce((s, g) => s + g.count, 0);
      let acc = 0, best = Infinity, bestk = 1, cut = segs[0].count;
      for (let i = 0; i < segs.length - 1; i++) { acc += segs[i].count; const d = Math.abs(acc - total / 2); if (d < best) { best = d; bestk = i + 1; cut = acc; } }
      rec(cells.slice(0, cut), segs.slice(0, bestk));
      rec(cells.slice(cut),  segs.slice(bestk));
    })(cells, segs);
    return assign;
  }

  // colour the dots, grouping each field into a compact block
  function paintDots() {
    const assign = layoutGrid();
    for (let i = 0; i < TOTAL; i++) {
      const d = dots[i], key = assign[i];
      if (key) {
        const wasEmpty = !d.classList.contains("filled");
        d.style.background = fieldColor(key);
        d.classList.add("filled");
        d.dataset.group = key;
        if (wasEmpty) { d.classList.remove("pop"); void d.offsetWidth; d.classList.add("pop"); }
      } else {
        d.classList.remove("filled", "pop", "hot");
        d.style.background = "transparent";
        delete d.dataset.group;
      }
    }
  }

  function groupTotals() {
    const t = {};
    cats.forEach(c => { const k = groupOf(c); t[k] = (t[k] || 0) + alloc[c.id]; });
    return t;
  }

  function renderLegend() {
    const t = groupTotals();
    const rows = groups.map(g => ({ key: g.id, name: g.name, color: g.color, n: t[g.id] || 0 }));
    if (t.custom) rows.push({ key: "custom", name: "Your additions", color: CUSTOM_COLOR, n: t.custom });
    legendEl.innerHTML = rows.map(r => {
      const live = r.n > 0
        ? ` data-group="${r.key}" tabindex="0" role="button" aria-label="${escapeHtml(r.name)}: ${r.n} of 100 experts. Show role breakdown."`
        : "";
      return `<div class="item ${r.n ? "" : "zero"}"${live}><span class="sw" style="background:${r.color}"></span><span class="nm">${escapeHtml(r.name)}</span> <b>${r.n}</b></div>`;
    }).join("");
  }

  // ── Submit ──
  form.addEventListener("submit", async e => {
    e.preventDefault();
    errEl.textContent = "";
    if (placed() !== TOTAL) { errEl.textContent = "Please allocate exactly 100 people."; return; }
    const name = nameEl.value.trim();
    const email = emailEl.value.trim().toLowerCase();
    const reasoning = reasoningEl.value.trim();
    if (!name) { errEl.textContent = "Please add your name."; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errEl.textContent = "Please enter a valid email."; return; }

    // Cloudflare Turnstile token (skipped in DEMO mode, which has no backend).
    // submit-experts verifies this server-side and rejects requests without it.
    let turnstileToken = "";
    if (!DEMO) {
      turnstileToken = (window.turnstile && window.turnstile.getResponse()) || "";
      if (!turnstileToken) { errEl.textContent = "Couldn't verify you're human just yet. Please wait a moment and try again."; return; }
    }

    submitBtn.classList.add("loading"); submitBtn.disabled = true; ctaText.textContent = "Submitting…";

    // build allocations payload: array of {id,label,group,count,custom}.
    // id = stable category id (survives renames); label = name as shown/typed.
    const allocations = cats
      .filter(c => alloc[c.id] > 0)
      .map(c => ({ id: c.id, label: c.name, group: groupOf(c), count: alloc[c.id], custom: !!c.custom }));
    const meta = { schema_version: "1", catalog_version: CFG.CATALOG_VERSION || null };

    try {
      if (DEMO) {
        await sleep(700);
      } else {
        const res = await fetch(`${CFG.SUPABASE_URL}/functions/v1/submit-experts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, allocations, reasoning: reasoning || null, meta, turnstileToken })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || "Submission failed");
      }
      showDone(email);
    } catch (err) {
      console.error(err);
      errEl.textContent = "Something went wrong submitting. " + (err.message || "Please try again.");
      submitBtn.classList.remove("loading"); submitBtn.disabled = false; ctaText.textContent = "Submit my choices";
      // Turnstile tokens are single-use; issue a fresh one for the retry.
      if (window.turnstile) window.turnstile.reset();
    }
  });

  // ── Post-submit acknowledgement ──
  // The entry is saved but, in the live flow, doesn't count until the emailed
  // confirmation link is clicked. Aggregate results are handled offline, so the
  // page just acknowledges the submission here.
  function showDone(email) {
    builderEl.classList.add("hidden");
    $("#sticky").classList.add("hidden");
    heroEl.classList.add("hidden");
    footerEl.classList.add("hidden");
    doneMsgEl.innerHTML = DEMO
      ? "Your picks are recorded. <em>(Demo mode: no email sent.)</em>"
      : "We&rsquo;ve emailed <strong>" + escapeHtml(maskEmail(email)) +
        "</strong> a link you need to click to confirm your choices.";
    doneEl.classList.add("show");
    doneEl.scrollIntoView({ behavior: "smooth" });
  }

  $("#again").onclick = () => {
    doneEl.classList.remove("show");
    builderEl.classList.remove("hidden");
    $("#sticky").classList.remove("hidden");
    heroEl.classList.remove("hidden");
    footerEl.classList.remove("hidden");
    submitBtn.classList.remove("loading");
    if (window.turnstile) window.turnstile.reset();   // fresh single-use token for a re-submit
    update();
    builderEl.scrollIntoView({ behavior: "smooth" });
  };

  // ── Sticky shadow on scroll ──
  const sticky = $("#sticky");
  const sentinel = document.createElement("div");
  document.querySelector(".hero").after(sentinel);
  new IntersectionObserver(([e]) => sticky.classList.toggle("stuck", !e.isIntersecting))
    .observe(sentinel);

  // ── helpers ──
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
  function maskEmail(e) { const [l, d] = String(e).split("@"); if (!d) return e; return (l.length <= 2 ? l[0] + "***" : l.slice(0, 2) + "***") + "@" + d; }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Field hover-card: spotlight the grid + show the role breakdown ──
  // Works from the grid dots OR the legend rows; mouse-hover follows the
  // cursor, keyboard-focus and tap anchor the card beside the row.
  const gridSection = document.querySelector(".gridwrap");
  const card = document.createElement("div");
  card.className = "card-pop";
  card.setAttribute("role", "tooltip");
  card.setAttribute("aria-live", "polite");
  document.body.appendChild(card);

  let activeField = null, pinned = false, anchored = false, lastEvt = null;

  function renderCard(key) {
    const list = rolesOf(key), col = fieldColor(key);
    card.style.setProperty("--gc", col);
    card.innerHTML =
      `<div class="cardhead"><span class="sw" style="background:${col}"></span><h4>${escapeHtml(fieldName(key))}</h4></div>`
      + list.map(c =>
          `<div class="urow"><div class="top"><span class="nm">${escapeHtml(c.name)}</span><span class="ct">${alloc[c.id]}</span></div>`
          + `<div class="pips" aria-hidden="true">${"<i></i>".repeat(alloc[c.id])}</div></div>`
        ).join("");
  }
  function applySpotlight(key) {
    activeField = key;
    dotgridEl.classList.add("dimming");
    dots.forEach(d => d.classList.toggle("hot", d.dataset.group === key));
    legendEl.querySelectorAll(".item").forEach(it => {
      const on = it.dataset.group === key;
      it.classList.toggle("active", on); it.classList.toggle("dim", !on);
    });
    renderCard(key);
    card.classList.add("show");
  }
  function clearSpotlight() {
    activeField = null; pinned = false; anchored = false;
    dotgridEl.classList.remove("dimming");
    dots.forEach(d => d.classList.remove("hot"));
    legendEl.querySelectorAll(".item").forEach(it => it.classList.remove("active", "dim"));
    card.classList.remove("show", "pinned");
  }
  // keep an open card correct when the allocation changes underneath it
  function syncSpotlight() {
    if (!activeField) return;
    if ((groupTotals()[activeField] || 0) === 0) { clearSpotlight(); return; }
    dots.forEach(d => d.classList.toggle("hot", d.dataset.group === activeField));
    legendEl.querySelectorAll(".item").forEach(it => {
      const on = it.dataset.group === activeField;
      it.classList.toggle("active", on); it.classList.toggle("dim", !on);
    });
    renderCard(activeField);
  }
  function placeAtCursor() {
    if (!lastEvt || !card.classList.contains("show")) return;
    const pad = 14, w = card.offsetWidth, h = card.offsetHeight;
    let x = lastEvt.clientX + 20, y = lastEvt.clientY + 20;
    if (x + w + pad > innerWidth) x = lastEvt.clientX - w - 20;
    if (y + h + pad > innerHeight) y = innerHeight - h - pad;
    if (y < pad) y = pad;
    card.style.left = x + "px"; card.style.top = y + "px";
  }
  function placeAtEl(el) {
    const pad = 14, r = el.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
    let x = r.left - w - 12;                       // prefer to the left (legend sits on the right)
    if (x < pad) x = r.right + 12;                 // else to the right of it
    if (x + w + pad > innerWidth) x = Math.max(pad, innerWidth - w - pad);
    let y = r.top;
    if (y + h + pad > innerHeight) y = innerHeight - h - pad;
    if (y < pad) y = pad;
    card.style.left = x + "px"; card.style.top = y + "px";
  }
  // Which cell of the 10×10 grid is the cursor over? Resolved by geometry so the
  // gaps between dots count too: each cell owns the half-gap around it, so the
  // boundary between two groups is the midline between their dots, not the dot.
  function dotIndexAt(x, y) {
    const r0 = dots[0].getBoundingClientRect();
    const px = (dots[1].getBoundingClientRect().left - r0.left) || r0.width;   // column pitch
    const py = (dots[10].getBoundingClientRect().top - r0.top) || r0.height;   // row pitch
    const col = Math.max(0, Math.min(9, Math.floor((x - r0.left + (px - r0.width) / 2) / px)));
    const row = Math.max(0, Math.min(9, Math.floor((y - r0.top + (py - r0.height) / 2) / py)));
    return row * 10 + col;
  }
  function fieldFrom(t, ev) {
    // legend rows are discrete elements — match them directly
    const item = t && t.closest(".item");
    if (item) return item.dataset.group ? { key: item.dataset.group, el: item } : null;
    // dot grid (gaps included): pick the field of the cell under the cursor
    if (ev && t && t.closest("#dotgrid")) {
      const d = dots[dotIndexAt(ev.clientX, ev.clientY)];
      if (d && d.classList.contains("filled") && d.dataset.group) return { key: d.dataset.group, el: d };
    }
    return null;
  }

  if (gridSection) {
    // resolve the field on every move (not just on enter) so crossing the midline
    // between two groups switches even while the cursor is in the gap between dots
    gridSection.addEventListener("mousemove", e => {
      lastEvt = e;
      if (pinned) return;
      const f = fieldFrom(e.target, e);
      if (f) {
        if (f.key !== activeField) applySpotlight(f.key);
        anchored = false; placeAtCursor();
      } else if (activeField && e.target.closest("#dotgrid")) {
        clearSpotlight();                            // moved onto empty cells
      }
    });
    gridSection.addEventListener("mouseleave", () => { if (!pinned) clearSpotlight(); });

    // While the card is pinned, any tap in the panel closes it (the card sits
    // outside .gridwrap and captures its own taps via .pinned, so taps on it
    // don't reach here). Otherwise a tap on a group opens it — touch has no
    // hover, so this is the only way the card opens on mobile.
    gridSection.addEventListener("click", e => {
      if (pinned) { clearSpotlight(); return; }
      const f = fieldFrom(e.target, e); if (!f) return;
      applySpotlight(f.key); pinned = true; anchored = true; placeAtEl(f.el);
      card.classList.add("pinned");
    });

    // keyboard: legend rows are focusable; show on focus, hide when focus leaves the legend
    legendEl.addEventListener("focusin", e => {
      const it = e.target.closest(".item"); if (!it || !it.dataset.group) return;
      applySpotlight(it.dataset.group); anchored = true; placeAtEl(it);
    });
    legendEl.addEventListener("focusout", e => {
      if (legendEl.contains(e.relatedTarget)) return;
      if (!pinned) clearSpotlight();
    });
  }
  // Close on any tap/click outside the card itself. Taps inside the panel are
  // handled by the grid click handler above (which closes when pinned); this
  // only needs to catch taps elsewhere on the page. pointerdown (not click)
  // because iOS Safari doesn't bubble taps on non-interactive body areas up to
  // document as clicks.
  document.addEventListener("pointerdown", e => {
    if (!card.classList.contains("show")) return;
    if (e.target.closest(".card-pop")) return;   // inside the modal → keep it open
    if (e.target.closest(".gridwrap")) return;   // inside the panel → grid click handler closes it
    clearSpotlight();                            // anywhere else → close
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && activeField) {
      const a = document.activeElement;
      clearSpotlight();
      if (a && a.closest && a.closest(".item") && a.blur) a.blur();
    }
  });

  // ── init ──
  renderCards();
  update();
})();
