// Dipsea Split Calculator — Test Suite
// Run: node test.js
// Tests core logic functions without DOM dependencies.

// ── Load data.js and app.js pure functions via vm ─────────────
const vm = require("vm");
const fs = require("fs");

const ctx = vm.createContext({ console, Math, String, parseInt, parseFloat, isNaN, Number });
// Replace const with var so declarations become context properties
const dataSrc = fs.readFileSync("js/data.js", "utf8").replace(/^const /gm, "var ");
vm.runInContext(dataSrc, ctx);

// Extract pure functions from app.js (skip DOM-dependent code)
const appSrc = fs.readFileSync("js/app.js", "utf8");
function extractFn(name) {
  const re = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}`, "m");
  const m = appSrc.match(re);
  if (!m) throw new Error(`Could not extract function: ${name}`);
  return m[0];
}

const fnNames = ["fmt","fmtDelta","startTime","biasProps","clockToPlace","getPropsForPlace","segFrac","placeToClock","getBadge"];
for (const fn of fnNames) vm.runInContext(extractFn(fn), ctx);

// Pull everything into local scope
const { D, CHECKPOINTS } = ctx;
const fmt = ctx.fmt, fmtDelta = ctx.fmtDelta, startTime = ctx.startTime;
const biasProps = ctx.biasProps, clockToPlace = ctx.clockToPlace;
const getPropsForPlace = ctx.getPropsForPlace, segFrac = ctx.segFrac;
const placeToClock = ctx.placeToClock, getBadge = ctx.getBadge;

// ── Test harness ──────────────────────────────────────────────
let passed = 0, failed = 0, errors = [];

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; errors.push(msg); }
}

function approx(a, b, tol, msg) {
  const diff = Math.abs(a - b);
  if (diff <= tol) { passed++; }
  else { failed++; errors.push(`${msg}: expected ~${b}, got ${a} (diff=${diff.toFixed(6)}, tol=${tol})`); }
}

// ═══════════════════════════════════════════════════════════════
// 1. DATA INTEGRITY
// ═══════════════════════════════════════════════════════════════

console.log("── Data integrity ──");

// Head start tables cover ages 6-100
assert(Object.keys(D.hs_m).length === 95, "hs_m covers 95 ages (6-100)");
assert(Object.keys(D.hs_f).length === 95, "hs_f covers 95 ages (6-100)");
assert(Object.keys(D.grp_m).length === 95, "grp_m covers 95 ages (6-100)");
assert(Object.keys(D.grp_f).length === 95, "grp_f covers 95 ages (6-100)");

// SCR group (scratch = 0 min head start) for prime male ages
assert(D.hs_m[20] === 0, "M20 head start = 0 (scratch)");
assert(D.hs_m[25] === 0, "M25 head start = 0 (scratch)");
assert(D.grp_m[21] === "SCR", "M21 group = SCR");

// Max head start is 25 min
assert(D.hs_m[6] === 25, "M6 head start = 25 (max)");
assert(D.hs_f[6] === 25, "F6 head start = 25 (max)");
assert(D.hs_m[75] === 25, "M75 head start = 25 (max)");

// Props sum to 1.0 for each key
for (const [key, p] of Object.entries(D.props)) {
  const sum = p.p1 + p.p2 + p.p3 + p.p4;
  approx(sum, 1.0, 0.002, `props["${key}"] sums to 1.0`);
}

// Tier props sum to 1.0
for (const tp of D.tier_props) {
  const sum = tp.p1 + tp.p2 + tp.p3 + tp.p4;
  approx(sum, 1.0, 0.002, `tier_props[place=${tp.place}] sums to 1.0`);
}

// Curve arrays are same length and monotonically increasing
assert(D.curve_c.length === D.curve_p.length, "curve_c and curve_p same length");
for (let i = 1; i < D.curve_c.length; i++) {
  assert(D.curve_c[i] >= D.curve_c[i-1], `curve_c monotonic at index ${i}`);
  assert(D.curve_p[i] >= D.curve_p[i-1], `curve_p monotonic at index ${i}`);
}

// CHECKPOINTS has 9 entries
assert(CHECKPOINTS.length === 9, "CHECKPOINTS has 9 entries");

// CHECKPOINTS cumFn values are monotonically increasing
const testProps = { p1: 0.29, p2: 0.37, p3: 0.31, p4: 0.03 };
let prevCum = 0;
for (const cp of CHECKPOINTS) {
  const cum = cp.cumFn(testProps);
  assert(cum > prevCum, `CHECKPOINT ${cp.key} cumFn (${cum.toFixed(3)}) > prev (${prevCum.toFixed(3)})`);
  prevCum = cum;
}
approx(CHECKPOINTS[CHECKPOINTS.length - 1].cumFn(testProps), 1.0, 0.0001, "Last checkpoint cumFn = 1.0");

// Sub-split proportions are between 0 and 1
for (const [key, val] of Object.entries(D.sub)) {
  assert(val > 0 && val < 1, `sub.${key} = ${val} is between 0 and 1`);
}

// ═══════════════════════════════════════════════════════════════
// 2. FORMATTING
// ═══════════════════════════════════════════════════════════════

console.log("── Formatting ──");

assert(fmt(0) === "---", "fmt(0) = ---");
assert(fmt(null) === "---", "fmt(null) = ---");
assert(fmt(65) === "1:05", "fmt(65) = 1:05");
assert(fmt(3661) === "1:01:01", "fmt(3661) = 1:01:01");
assert(fmt(2788) === "46:28", "fmt(2788) = 46:28 (winner clock)");

assert(fmtDelta(0) === "0:00", "fmtDelta(0) = 0:00");
assert(fmtDelta(65) === "+1:05", "fmtDelta(65) = +1:05");
assert(fmtDelta(-65) === "-1:05", "fmtDelta(-65) = -1:05");

// ═══════════════════════════════════════════════════════════════
// 3. HANDICAP HELPERS
// ═══════════════════════════════════════════════════════════════

console.log("── Handicap helpers ──");

assert(startTime(0, "INV") === "8:25", "SCR INV start = 8:25");
assert(startTime(25, "INV") === "8:00", "Max HS INV start = 8:00");
assert(startTime(0, "DR") === "8:52", "SCR DR start = 8:52");

// ═══════════════════════════════════════════════════════════════
// 4. BIAS PROPS
// ═══════════════════════════════════════════════════════════════

console.log("── Bias props ──");

const base = { p1: 0.29, p2: 0.37, p3: 0.31, p4: 0.03 };

// Zero bias = no change
const b0 = biasProps(base, 0);
approx(b0.p1, 0.29, 0.0001, "bias=0: p1 unchanged");
approx(b0.p2, 0.37, 0.0001, "bias=0: p2 unchanged");
approx(b0.p3, 0.31, 0.0001, "bias=0: p3 unchanged");

// Positive bias (downhill strength): p2 increases, p3 decreases
const b1 = biasProps(base, 1);
assert(b1.p2 > base.p2, "bias=+1: p2 increases (slower uphill)");
assert(b1.p3 < base.p3, "bias=+1: p3 decreases (faster downhill)");
assert(b1.p1 === base.p1, "bias=+1: p1 unchanged");

// Negative bias (uphill strength): p2 decreases, p3 increases
const bn1 = biasProps(base, -1);
assert(bn1.p2 < base.p2, "bias=-1: p2 decreases (faster uphill)");
assert(bn1.p3 > base.p3, "bias=-1: p3 increases (slower downhill)");

// ═══════════════════════════════════════════════════════════════
// 5. CLOCK-TO-PLACE / PLACE-TO-CLOCK
// ═══════════════════════════════════════════════════════════════

console.log("── Clock/Place conversion ──");

// Known values from 2025 data
assert(clockToPlace(2788) === 1, "clockToPlace(2788) = 1 (winner)");
approx(clockToPlace(3198), 35, 3, "clockToPlace(3198) ≈ 35");
approx(clockToPlace(3531), 100, 3, "clockToPlace(3531) ≈ 100");
approx(clockToPlace(4270), 450, 3, "clockToPlace(4270) ≈ 450");

// Boundary: below minimum → place 1
assert(clockToPlace(2000) === 1, "clockToPlace(2000) = 1 (below min)");

// Boundary: above maximum → last place
assert(clockToPlace(99999) === D.curve_p[D.curve_p.length - 1], "clockToPlace(99999) = last place");

// placeToClock roundtrip consistency
assert(placeToClock(1) === 2788, "placeToClock(1) = 2788");
const rt100 = clockToPlace(placeToClock(100));
approx(rt100, 100, 5, "placeToClock→clockToPlace roundtrip at 100");
const rt450 = clockToPlace(placeToClock(450));
approx(rt450, 450, 5, "placeToClock→clockToPlace roundtrip at 450");

// Monotonic: higher clock → higher place
assert(clockToPlace(3000) < clockToPlace(4000), "Higher clock time → higher (worse) place");
assert(clockToPlace(4000) < clockToPlace(5000), "Higher clock time → higher (worse) place (2)");

// ═══════════════════════════════════════════════════════════════
// 6. GET PROPS FOR PLACE (interpolation)
// ═══════════════════════════════════════════════════════════════

console.log("── Tier interpolation ──");

// At anchor points, should match exactly
for (const tp of D.tier_props) {
  const pr = getPropsForPlace(tp.place);
  approx(pr.p1, tp.p1, 0.0001, `getPropsForPlace(${tp.place}).p1`);
  approx(pr.p2, tp.p2, 0.0001, `getPropsForPlace(${tp.place}).p2`);
}

// Below minimum → clamp to first tier
const prLow = getPropsForPlace(0);
approx(prLow.p1, D.tier_props[0].p1, 0.0001, "place=0 clamps to first tier");

// Above maximum → clamp to last tier
const prHigh = getPropsForPlace(9999);
approx(prHigh.p1, D.tier_props[D.tier_props.length - 1].p1, 0.0001, "place=9999 clamps to last tier");

// Interpolated props should sum to ~1.0
for (const place of [50, 200, 350, 500, 800, 1100]) {
  const pr = getPropsForPlace(place);
  const sum = pr.p1 + pr.p2 + pr.p3 + pr.p4;
  approx(sum, 1.0, 0.002, `interpolated props at place ${place} sum to 1.0`);
}

// ═══════════════════════════════════════════════════════════════
// 7. SEGMENT FRACTIONS
// ═══════════════════════════════════════════════════════════════

console.log("── Segment fractions ──");

const sp = { p1: 0.29, p2: 0.37, p3: 0.31, p4: 0.03 };

// Full segments
approx(segFrac(sp, "seg_s_m"), 0.29, 0.0001, "seg_s_m = p1");
approx(segFrac(sp, "seg_m_c"), 0.37, 0.0001, "seg_m_c = p2");
approx(segFrac(sp, "seg_c_s"), 0.31, 0.0001, "seg_c_s = p3");
approx(segFrac(sp, "seg_s_f"), 0.03, 0.0001, "seg_s_f = p4");

// Sub-segments within p1 should sum to p1
const s_ts = segFrac(sp, "s_ts");
const ts_wg = segFrac(sp, "ts_wg");
const wg_mw = segFrac(sp, "wg_mw");
approx(s_ts + ts_wg + wg_mw, sp.p1, 0.0001, "p1 sub-segments sum to p1");

// Sub-segments within p2 should sum to p2
const mw_dy = segFrac(sp, "mw_dy");
const dy_bc = segFrac(sp, "dy_bc");
const bc_ca = segFrac(sp, "bc_ca");
approx(mw_dy + dy_bc + bc_ca, sp.p2, 0.0001, "p2 sub-segments sum to p2");

// Sub-segments within p3 should sum to p3
const ca_sr = segFrac(sp, "ca_sr");
const sr_st = segFrac(sp, "sr_st");
approx(ca_sr + sr_st, sp.p3, 0.0001, "p3 sub-segments sum to p3");

// Cumulative segments
approx(segFrac(sp, "cum_s_pan"), sp.p1 * D.sub.windy_gap_in_p1, 0.0001, "cum_s_pan = p1 * windy_gap");
approx(segFrac(sp, "cum_s_mw"), sp.p1, 0.0001, "cum_s_mw = p1");
approx(segFrac(sp, "cum_s_ca"), sp.p1 + sp.p2, 0.0001, "cum_s_ca = p1 + p2");
approx(segFrac(sp, "cum_s_sr"), sp.p1 + sp.p2 + sp.p3 * D.sub.steep_ravine_in_p3, 0.0001, "cum_s_sr = p1 + p2 + p3*sr");
approx(segFrac(sp, "cum_s_st"), sp.p1 + sp.p2 + sp.p3, 0.0001, "cum_s_st = p1 + p2 + p3");

// All fractions should be positive
const allSegKeys = ["s_ts","ts_wg","s_wg","wg_mw","mw_dy","dy_bc","bc_ca","ca_sr","sr_st","st_fi",
  "seg_s_m","seg_m_c","seg_c_s","seg_s_f","cum_s_pan","cum_s_mw","cum_s_ca","cum_s_sr","cum_s_st"];
for (const key of allSegKeys) {
  const val = segFrac(sp, key);
  assert(val > 0, `segFrac("${key}") = ${val} > 0`);
}

// Cumulative segments must be strictly increasing
const cumKeys = ["cum_s_pan", "cum_s_mw", "cum_s_ca", "cum_s_sr", "cum_s_st"];
for (let i = 1; i < cumKeys.length; i++) {
  const prev = segFrac(sp, cumKeys[i-1]);
  const curr = segFrac(sp, cumKeys[i]);
  assert(curr > prev, `cumulative ordering: ${cumKeys[i]} (${curr.toFixed(4)}) > ${cumKeys[i-1]} (${prev.toFixed(4)})`);
}

// REGRESSION: cum_s_ca must return p1+p2, NOT just p1
// Bug: default fallback was returning p1 (Start→MW) for unrecognized keys
assert(segFrac(sp, "cum_s_ca") > sp.p1 + 0.1,
  `REGRESSION: cum_s_ca (${segFrac(sp, "cum_s_ca").toFixed(4)}) must be much larger than p1 (${sp.p1})`);
approx(segFrac(sp, "cum_s_ca") / segFrac(sp, "cum_s_mw"), (sp.p1 + sp.p2) / sp.p1, 0.001,
  "REGRESSION: cum_s_ca/cum_s_mw ratio = (p1+p2)/p1");

// REGRESSION: 1:00:00 Start→Cardiac should NOT predict last place
// This was the reported bug: 1h split on cum_s_ca produced ~4h clock time
{
  const splitSecs = 3600; // 1:00:00
  const pr = getPropsForPlace(500);
  const bp = biasProps(pr, 0);
  const frac = segFrac(bp, "cum_s_ca");
  const actualEst = splitSecs / frac;
  const clockEst = actualEst; // hs=0 for SCR
  const place = clockToPlace(clockEst);
  assert(frac > 0.6, `cum_s_ca frac (${frac.toFixed(4)}) should be >0.6 (p1+p2)`);
  assert(actualEst < 7000, `1h Cardiac split → actual ${Math.round(actualEst)}s should be <7000s`);
  assert(place < 1000, `1h Cardiac split → place ${place} should be <1000 (not last place)`);
}

// ═══════════════════════════════════════════════════════════════
// 8. BADGES
// ═══════════════════════════════════════════════════════════════

console.log("── Badges ──");

assert(getBadge("INV", 1).includes("Winner"), "INV place 1 → Winner");
assert(getBadge("INV", 35).includes("Black Shirt"), "INV place 35 → Black Shirt");
assert(getBadge("INV", 100).includes("Top 100"), "INV place 100 → Top 100");
assert(getBadge("INV", 450).includes("INV Qualifying"), "INV place 450 → Qualifying");
assert(getBadge("INV", 500).includes("Does not qualify"), "INV place 500 → DNQ");
assert(getBadge("DR", 540).includes("Winner"), "DR place 540 → Winner pace");
assert(getBadge("DR", 750).includes("Qualifying"), "DR place 750 → Qualifying");
assert(getBadge("DR", 800).includes("Does not qualify"), "DR place 800 → DNQ");

// ═══════════════════════════════════════════════════════════════
// 9. END-TO-END: SPLIT TARGET SIMULATION
// ═══════════════════════════════════════════════════════════════

console.log("── E2E: Split targets ──");

// M21 SCR (hs=0) INV: 1st place
{
  const clock = D.clocks["1"]; // 2788
  const hs = D.hs_m[21]; // 0
  const actual = clock + hs * 60; // 2788
  const p = D.props["1"];
  const mw = actual * p.p1;
  const ca = actual * (p.p1 + p.p2);
  const st = actual * (p.p1 + p.p2 + p.p3);
  assert(actual === 2788, "M21 SCR INV 1st: actual = 2788s (46:28)");
  assert(mw > 0 && mw < actual, "MW split within total time");
  assert(ca > mw && ca < actual, "Cardiac split > MW, < total");
  assert(st > ca && st < actual, "Stile split > Cardiac, < total");
  approx(actual - st, actual * p.p4, 1, "Stile→Finish = p4 * actual");
}

// F19 (hs=11, group N) INV: 1st place → actual = 2788 + 660 = 3448
{
  const clock = D.clocks["1"];
  const hs = D.hs_f[19]; // 11
  const actual = clock + hs * 60; // 3448
  assert(actual === 3448, "F19 INV 1st: actual = 3448s (57:28)");
  assert(hs === 11, "F19 head start = 11 min");
}

// DR section: actual = clock + hs*60 - dr_offset
{
  const clock = D.clocks["dr_winner"]; // 4636
  const hs = 2; // example: 2 min HS
  const actual = clock + hs * 60 - D.dr_offset;
  assert(actual === 4636 + 120 - 1621, "DR actual = clock + hs*60 - dr_offset");
  assert(actual > 0, "DR actual time is positive");
}

// ═══════════════════════════════════════════════════════════════
// 10. E2E: PREDICTION CONVERGENCE
// ═══════════════════════════════════════════════════════════════

console.log("── E2E: Prediction convergence ──");

// Simulate computeFromSplit: M21 SCR (hs=0), segment Start→MW, split=18:00
{
  const splitSecs = 18 * 60;
  const hs = 0;
  const bias = 0;
  const checkpoint = "cum_s_mw";

  let place = 500;
  for (let iter = 0; iter < 3; iter++) {
    const pr = getPropsForPlace(place);
    const bp = biasProps(pr, bias);
    const frac = segFrac(bp, checkpoint);
    const actualEst = splitSecs / frac;
    const clockEst = actualEst - hs * 60;
    place = clockToPlace(clockEst);
  }

  const pr = getPropsForPlace(place);
  const bp = biasProps(pr, bias);
  const frac = segFrac(bp, checkpoint);
  const actualFinal = splitSecs / frac;
  const clockFinal = actualFinal - hs * 60;
  const placeFinal = clockToPlace(clockFinal);

  assert(placeFinal > 0 && placeFinal < 1502, `Prediction converged to place ${placeFinal}`);
  assert(actualFinal > 2500 && actualFinal < 8000, `Actual time ${fmt(actualFinal)} is reasonable`);
  // MW split should reconstruct to ~18:00
  approx(actualFinal * segFrac(bp, "cum_s_mw"), splitSecs, 5, "MW split reconstructs to ~18:00");
}

// Simulate computeFromPlace: target place 35
{
  const hs = 0;
  const bias = 0;
  const place = 35;
  const clockFinal = placeToClock(place);
  const actualFinal = clockFinal + hs * 60;
  const pr = getPropsForPlace(place);
  const bp = biasProps(pr, bias);

  approx(clockFinal, D.clocks["35"], 20, "placeToClock(35) ≈ known clock time");
  assert(actualFinal > 0, "Actual time is positive");
  // Splits should be reasonable
  const mw = actualFinal * bp.p1;
  assert(mw > 600 && mw < 2000, `MW split ${fmt(mw)} is reasonable for 35th place`);
}

// Simulate computeFromActual: actual = 1:00:00 for M21 SCR
{
  const actualSecs = 3600;
  const hs = 0;
  const bias = 0;
  const clockFinal = actualSecs - hs * 60;
  const placeFinal = clockToPlace(clockFinal);
  const pr = getPropsForPlace(placeFinal);

  assert(placeFinal > 0 && placeFinal < 1502, `1:00:00 actual → place ${placeFinal}`);
  // 1 hour actual for scratch runner → should be solidly mid-pack
  assert(placeFinal > 30 && placeFinal < 500, "1:00:00 SCR is mid-pack");
}

// ═══════════════════════════════════════════════════════════════
// 11. EDGE CASES
// ═══════════════════════════════════════════════════════════════

console.log("── Edge cases ──");

// Very fast clock
assert(clockToPlace(1000) === 1, "Very fast clock → place 1");

// Very slow clock
const lastPlace = D.curve_p[D.curve_p.length - 1];
assert(clockToPlace(999999) === lastPlace, "Very slow clock → last place");

// DR with large head start: actual could go negative
{
  const clock = D.clocks["dr_winner"];
  const hs = 25; // max HS
  const actual = clock + hs * 60 - D.dr_offset;
  assert(actual > 0, "DR with max HS still has positive actual time");
}

// Bias at extremes
{
  const bp2 = biasProps(base, 2);
  const bpn2 = biasProps(base, -2);
  assert(bp2.p2 > base.p2, "Strong downhill bias: p2 increases");
  assert(bpn2.p2 < base.p2, "Strong uphill bias: p2 decreases");
  // Proportions should still be positive
  assert(bp2.p2 > 0 && bp2.p3 > 0, "Extreme bias still has positive props");
  assert(bpn2.p2 > 0 && bpn2.p3 > 0, "Extreme negative bias still has positive props");
}

// ═══════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(60));
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log("═".repeat(60));

if (errors.length > 0) {
  console.log("\nFAILURES:");
  for (const e of errors) console.log(`  ✗ ${e}`);
}

process.exit(failed > 0 ? 1 : 0);
