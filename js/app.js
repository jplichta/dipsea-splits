// Dipsea Split Calculator — Application Logic
// Depends on: D, CHECKPOINTS from data.js (loaded before this script)

// ── Formatting ──────────────────────────────────────────────

function fmt(secs) {
  if (secs == null || secs <= 0) return "---";
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtDelta(secs) {
  const abs = Math.abs(Math.round(secs));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const sign = secs < -2 ? "-" : secs > 2 ? "+" : "";
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}

// ── Handicap helpers ────────────────────────────────────────

function startTime(hs, section) {
  const base = section === "INV" ? 25 : 52;
  return `8:${String(base - hs).padStart(2, "0")}`;
}

function getHsGrp() {
  const sex = document.getElementById("sex").value;
  const age = parseInt(document.getElementById("age").value);
  if (isNaN(age) || age < 6 || age > 100) return null;
  const hsMap = sex === "M" ? D.hs_m : D.hs_f;
  const grpMap = sex === "M" ? D.grp_m : D.grp_f;
  return { hs: hsMap[age], grp: grpMap[age] };
}

// ── Shared UI state ─────────────────────────────────────────

function updateShared() {
  const info = getHsGrp();
  const section = document.getElementById("section").value;
  const groupInfo = document.getElementById("group-info");
  const startInfo = document.getElementById("start-info");

  if (!info || info.hs == null) {
    groupInfo.innerHTML = "";
    startInfo.innerHTML = "";
    return;
  }

  groupInfo.innerHTML =
    `Group <strong>${info.grp}</strong> &middot; <span class="hs">+${info.hs} min</span>`;

  const st = startTime(info.hs, section);
  const sectionLabel = section === "INV" ? "Invitational" : "Dipsea Runner";
  startInfo.innerHTML =
    `<div class="chip">Start time: <span>${st}</span></div>` +
    `<div class="chip">Section: <span>${sectionLabel}</span></div>`;
}

// ── Proportion math ─────────────────────────────────────────

function biasProps(baseProps, bias) {
  return {
    p1: baseProps.p1,
    p2: baseProps.p2 + bias * D.bias_p2_sd,
    p3: baseProps.p3 - bias * D.bias_p3_sd,
    p4: baseProps.p4
  };
}

function clockToPlace(clockSecs) {
  const { curve_c: cc, curve_p: pp } = D;
  if (clockSecs <= cc[0]) return pp[0];
  if (clockSecs >= cc[cc.length - 1]) return pp[pp.length - 1];
  for (let i = 0; i < cc.length - 1; i++) {
    if (clockSecs >= cc[i] && clockSecs <= cc[i + 1]) {
      const frac = (clockSecs - cc[i]) / (cc[i + 1] - cc[i]);
      return Math.round(pp[i] + frac * (pp[i + 1] - pp[i]));
    }
  }
  return pp[pp.length - 1];
}

function getPropsForPlace(place) {
  const tp = D.tier_props;
  if (place <= tp[0].place) return tp[0];
  if (place >= tp[tp.length - 1].place) return tp[tp.length - 1];
  for (let i = 0; i < tp.length - 1; i++) {
    if (place >= tp[i].place && place <= tp[i + 1].place) {
      const f = (place - tp[i].place) / (tp[i + 1].place - tp[i].place);
      return {
        p1: tp[i].p1 + f * (tp[i + 1].p1 - tp[i].p1),
        p2: tp[i].p2 + f * (tp[i + 1].p2 - tp[i].p2),
        p3: tp[i].p3 + f * (tp[i + 1].p3 - tp[i].p3),
        p4: tp[i].p4 + f * (tp[i + 1].p4 - tp[i].p4),
      };
    }
  }
  return tp[tp.length - 1];
}

/** Fraction of total time for a given segment key. */
function segFrac(props, segKey) {
  const S = D.sub;
  switch (segKey) {
    case "s_wg":    return props.p1 * S.windy_gap_in_p1;
    case "wg_mw":   return props.p1 * (1 - S.windy_gap_in_p1);
    case "mw_dy":   return props.p2 * S.dynamite_in_p2;
    case "dy_bc":   return props.p2 * (S.bottom_cardiac_in_p2 - S.dynamite_in_p2);
    case "bc_ca":   return props.p2 * (1 - S.bottom_cardiac_in_p2);
    case "ca_sr":   return props.p3 * S.steep_ravine_in_p3;
    case "sr_st":   return props.p3 * (1 - S.steep_ravine_in_p3);
    case "st_fi":   return props.p4;
    case "seg_s_m": return props.p1;
    case "seg_m_c": return props.p2;
    case "seg_c_s": return props.p3;
    case "seg_s_f": return props.p4;
    default:        return props.p1;
  }
}

// ── Tab switching ───────────────────────────────────────────

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Split Targets tab ───────────────────────────────────────

function updateBiasLabel() {
  const bias = parseFloat(document.getElementById("bias").value);
  const valueEl = document.getElementById("bias-value");
  const descEl = document.getElementById("bias-desc");

  if (bias === 0) {
    valueEl.innerHTML = "Neutral";
    descEl.innerHTML = "";
    return;
  }

  const abs = Math.abs(bias);
  const strength = abs >= 2 ? "Strong" : abs >= 1 ? "Moderate" : "Slight";
  const dir = bias < 0 ? "uphill" : "downhill";
  valueEl.innerHTML = `<span>${strength} ${dir}</span>`;

  const [fast, slow] = bias < 0
    ? ["Faster", "Slower"]
    : ["Slower", "Faster"];
  descEl.innerHTML = `<em>${fast}</em> Muir\u2192Cardiac, <em>${slow}</em> Cardiac\u2192Stile`;
}

const INV_TARGETS = [
  { key: "1",   label: "1st Place (Winner)",           cls: "winner" },
  { key: "35",  label: "35th Place (Black Shirt)",     cls: "blackshirt" },
  { key: "100", label: "100th Place",                  cls: "" },
  { key: "450", label: "450th Place (INV Qualifying)", cls: "qualify" },
];

const DR_TARGETS = [
  { key: "dr_winner", label: "DR Section Winner (Place ~540)", cls: "winner" },
  { key: "750",       label: "750th Place (Qualifying)",       cls: "qualify" },
];

function deltaHtml(d) {
  if (Math.abs(d) < 3) return `<div class="delta neutral">&mdash;</div>`;
  const cls = d < 0 ? "faster" : "slower";
  const prefix = d < 0 ? "" : "+";
  return `<div class="delta ${cls}">${prefix}${fmtDelta(d)}</div>`;
}

function buildSplitRow(checkpoints, elapsed, segs, deltas, start, end) {
  let cells = "";
  for (let i = start; i < end; i++) {
    cells += `
      <div class="split-cell">
        <div class="label">${checkpoints[i].short}</div>
        <div class="time">${fmt(elapsed[i])}</div>
        <div class="seg">${fmt(segs[i])} seg</div>
        ${deltaHtml(deltas[i])}
      </div>`;
  }
  return cells;
}

function computeTargets() {
  const info = getHsGrp();
  const section = document.getElementById("section").value;
  const bias = parseFloat(document.getElementById("bias").value);
  const resultsEl = document.getElementById("results");
  const noResults = document.getElementById("no-results");

  updateBiasLabel();
  updateShared();

  if (!info || info.hs == null) {
    resultsEl.innerHTML = "";
    noResults.style.display = "block";
    return;
  }
  noResults.style.display = "none";

  const hs = info.hs;
  const targets = section === "INV" ? INV_TARGETS : DR_TARGETS;

  let html = "";
  for (const t of targets) {
    const clock = D.clocks[t.key];
    const baseProps = D.props[t.key];
    const actual = section === "INV"
      ? clock + hs * 60
      : clock + hs * 60 - D.dr_offset;

    if (actual <= 0) {
      html += `<div class="card ${t.cls}"><div class="card-header">
        <span class="place">${t.label}</span>
        <span class="actual">Not achievable from this group</span>
      </div></div>`;
      continue;
    }

    const bp = biasProps(baseProps, bias);
    const elapsed_b = CHECKPOINTS.map((cp) => actual * cp.cumFn(bp));
    const elapsed_n = CHECKPOINTS.map((cp) => actual * cp.cumFn(baseProps));
    const segs_b = elapsed_b.map((e, i) => (i === 0 ? e : e - elapsed_b[i - 1]));
    const segs_n = elapsed_n.map((e, i) => (i === 0 ? e : e - elapsed_n[i - 1]));
    const deltas = segs_b.map((s, i) => s - segs_n[i]);

    html += `
      <div class="card ${t.cls}">
        <div class="card-header">
          <span class="place">${t.label}</span>
          <span class="actual">Actual time: <span>${fmt(actual)}</span></span>
        </div>
        <div class="splits-row elapsed-row">${buildSplitRow(CHECKPOINTS, elapsed_b, segs_b, deltas, 0, 4)}</div>
        <div class="row-divider"></div>
        <div class="splits-row elapsed-row">${buildSplitRow(CHECKPOINTS, elapsed_b, segs_b, deltas, 4, 8)}</div>
      </div>`;
  }
  resultsEl.innerHTML = html;
}

// ── Predict Placement tab ───────────────────────────────────

function computePredict() {
  const info = getHsGrp();
  const section = document.getElementById("section").value;
  const output = document.getElementById("predict-output");
  const empty = document.getElementById("predict-empty");

  updateShared();

  if (!info || info.hs == null) {
    output.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  const h = parseInt(document.getElementById("split-h").value) || 0;
  const m = parseInt(document.getElementById("split-m").value) || 0;
  const s = parseInt(document.getElementById("split-s").value) || 0;
  const splitSecs = h * 3600 + m * 60 + s;

  if (splitSecs <= 0) {
    output.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const hs = info.hs;
  const checkpoint = document.getElementById("checkpoint").value;
  const bias = parseFloat(document.getElementById("bias").value);

  // Iterative convergence: estimate actual → get placement → refine proportions
  let place = 500;
  for (let iter = 0; iter < 3; iter++) {
    const pr = getPropsForPlace(place);
    const bp = biasProps(pr, bias);
    const frac = segFrac(bp, checkpoint);
    const actualEst = splitSecs / frac;
    const clockEst = section === "INV"
      ? actualEst - hs * 60
      : actualEst - hs * 60 + D.dr_offset;
    place = clockToPlace(clockEst);
  }

  // Final values with converged placement
  const pr = getPropsForPlace(place);
  const bp = biasProps(pr, bias);
  const frac = segFrac(bp, checkpoint);
  const actualFinal = splitSecs / frac;
  const clockFinal = section === "INV"
    ? actualFinal - hs * 60
    : actualFinal - hs * 60 + D.dr_offset;
  const placeFinal = clockToPlace(clockFinal);

  const elapsed = CHECKPOINTS.map((cp) => actualFinal * cp.cumFn(bp));

  // Badge
  const badge = getBadge(section, placeFinal);

  output.innerHTML = `
    <div class="predict-result">
      <div class="predict-place"><span class="approx">~</span>${placeFinal} <span class="approx">/ 1502</span></div>
      ${badge}
      <div class="predict-detail">
        <div class="predict-row"><span class="lbl">Predicted finish (actual)</span><span class="val">${fmt(actualFinal)}</span></div>
        <div class="predict-row"><span class="lbl">Predicted clock time</span><span class="val">${fmt(clockFinal)}</span></div>
      </div>
      <div style="margin-top:16px; border-top:1px solid var(--border); padding-top:12px;">
        <div class="predict-splits-label">Predicted Splits</div>
        <div class="splits-row elapsed-row" style="border-radius:8px 8px 0 0; overflow:hidden;">
          ${buildPredRow(elapsed, 0, 4)}
        </div>
        <div class="row-divider"></div>
        <div class="splits-row elapsed-row" style="border-radius:0 0 8px 8px; overflow:hidden;">
          ${buildPredRow(elapsed, 4, 8)}
        </div>
      </div>
    </div>`;
}

function buildPredRow(elapsed, start, end) {
  let cells = "";
  for (let i = start; i < end; i++) {
    cells += `<div class="split-cell">
      <div class="label">${CHECKPOINTS[i].short}</div>
      <div class="time">${fmt(elapsed[i])}</div>
    </div>`;
  }
  return cells;
}

function getBadge(section, place) {
  if (section === "INV") {
    if (place <= 1)   return `<span class="predict-badge win">Winner</span>`;
    if (place <= 35)  return `<span class="predict-badge black">Black Shirt</span>`;
    if (place <= 100) return `<span class="predict-badge qual">Top 100</span>`;
    if (place <= 450) return `<span class="predict-badge qual">INV Qualifying</span>`;
    return `<span class="predict-badge miss">Does not qualify (INV top 450)</span>`;
  }
  if (place <= 540) return `<span class="predict-badge win">DR Section Winner pace</span>`;
  if (place <= 750) return `<span class="predict-badge qual">Qualifying</span>`;
  return `<span class="predict-badge miss">Does not qualify (top 750)</span>`;
}

// ── Event wiring ────────────────────────────────────────────

function computeAll() {
  computeTargets();
  computePredict();
}

document.getElementById("sex").addEventListener("change", computeAll);
document.getElementById("age").addEventListener("input", computeAll);
document.getElementById("section").addEventListener("change", computeAll);
document.getElementById("bias").addEventListener("input", computeAll);
document.getElementById("checkpoint").addEventListener("change", computePredict);
document.getElementById("split-h").addEventListener("input", computePredict);
document.getElementById("split-m").addEventListener("input", computePredict);
document.getElementById("split-s").addEventListener("input", computePredict);

// Initial render
computeAll();
