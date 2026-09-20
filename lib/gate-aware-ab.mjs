#!/usr/bin/env node
/**
 * gate-aware-ab.mjs — A/B Testing with Statsig Feature Gate Awareness
 * Innovation 6 for prompt-studio
 *
 * Enhances A/B testing by capturing Statsig feature gate state at test start
 * and each result recording. If gates change mid-test, results are flagged
 * as potentially confounded.
 *
 * Exports:
 *   captureGateState()                -> object of current gate values
 *   startTest(name, variants, opts)   -> testId
 *   recordResult(testId, variant, m)  -> void
 *   analyzeResults(testId)            -> analysis object
 *   getTestHistory()                  -> list of tests
 */

import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STUDIO_DIR = process.env.PROMPT_STUDIO_DIR || join(process.env.HOME, '.claude', 'prompt-studio');
const STATSIG_DIR = join(process.env.HOME, '.claude', 'statsig');
const DB_PATH = join(STUDIO_DIR, 'gate_ab_results.db');

// ─── Database ────────────────────────────────────────────────────

let _db = null;

function getDb() {
  try {
    if (_db) return _db;

    // Ensure directory exists
    const dbDir = dirname(DB_PATH);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    _db = new DatabaseSync(DB_PATH);
    _db.exec('PRAGMA journal_mode=WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS tests (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        variants_json TEXT NOT NULL,
        options_json TEXT NOT NULL,
        gate_state_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        created TEXT NOT NULL DEFAULT (datetime('now')),
        updated TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id TEXT NOT NULL,
        variant TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        gate_state_json TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (test_id) REFERENCES tests(id)
      )
    `);
    return _db;
  } catch (error) {
    throw new Error(`Failed to initialize database: ${error.message}`);
  }
}

// ─── Gate State Capture ──────────────────────────────────────────

/**
 * Read all Statsig cached evaluation files and extract feature gate values.
 * Captures current feature gate state for correlation with A/B test results.
 * @returns {Object} Map of gate name/id -> { value, rule_id }
 * @example
 * const gates = captureGateState();
 * console.log(gates);
 * // { "prompt_caching": { value: true, rule_id: "rollout_50" },
 * //   "thinking_mode": { value: false, rule_id: "default" } }
 */
export function captureGateState() {
  try {
    const gates = {};

    // Handle missing statsig directory gracefully
    if (!existsSync(STATSIG_DIR)) {
      return gates;
    }

    let files;
    try {
      files = readdirSync(STATSIG_DIR).filter(f =>
        f.startsWith('statsig.cached.evaluations.')
      );
    } catch (error) {
      // Directory exists but can't be read (permissions issue)
      return gates;
    }

    for (const file of files) {
      try {
        const raw = readFileSync(join(STATSIG_DIR, file), 'utf-8');
        const parsed = JSON.parse(raw);
        let data = parsed.data || {};
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }

        const featureGates = data.feature_gates || {};
        for (const [gateId, gateInfo] of Object.entries(featureGates)) {
          gates[gateId] = {
            value: gateInfo.value,
            rule_id: gateInfo.rule_id || 'unknown',
          };
        }
      } catch {
        // Skip unparseable files
      }
    }

    return gates;
  } catch (error) {
    // Any unexpected error - return empty gates object
    return {};
  }
}

// ─── Test Management ─────────────────────────────────────────────

/**
 * Generate a unique test ID.
 */
function generateTestId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `gab_${ts}_${rand}`;
}

/**
 * Start a new gate-aware A/B test.
 * @param {string} testName - Human-readable test name
 * @param {string[]} variants - List of variant names
 * @param {Object} [options] - Test options
 * @param {boolean} [options.gateAware=true] - Track gate state
 * @param {number} [options.minRuns=50] - Minimum runs per variant for significance
 * @param {number} [options.confidenceLevel=0.95] - Required confidence level
 * @returns {string} testId
 * @example
 * const testId = startTest('prompt-verbosity-test', ['concise', 'detailed'], {
 *   minRuns: 30,
 *   confidenceLevel: 0.95,
 *   gateAware: true
 * });
 * console.log(`Test started: ${testId}`);
 */
export function startTest(testName, variants, options = {}) {
  try {
    const opts = {
      gateAware: true,
      minRuns: 50,
      confidenceLevel: 0.95,
      ...options,
    };

    if (!testName || typeof testName !== 'string') {
      throw new Error('testName must be a non-empty string');
    }
    if (!Array.isArray(variants) || variants.length < 2) {
      throw new Error('variants must be an array with at least 2 entries');
    }

    const testId = generateTestId();
    const gateState = opts.gateAware ? captureGateState() : {};

    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO tests (id, name, variants_json, options_json, gate_state_json, status)
       VALUES (?, ?, ?, ?, ?, 'running')`
    );
    stmt.run(
      testId,
      testName,
      JSON.stringify(variants),
      JSON.stringify(opts),
      JSON.stringify(gateState)
    );

    return testId;
  } catch (error) {
    throw new Error(`startTest failed: ${error.message}`);
  }
}

/**
 * Record a result for a running test.
 * @param {string} testId
 * @param {string} variant - Which variant produced this result
 * @param {Object} metrics - { quality: 1-10, cost: number, tokens: number, duration: ms }
 * @example
 * recordResult(testId, 'concise', {
 *   quality: 8.5,
 *   cost: 0.002,
 *   tokens: 450,
 *   duration: 1200
 * });
 */
export function recordResult(testId, variant, metrics) {
  try {
    if (!testId || !variant) {
      throw new Error('testId and variant are required');
    }
    if (!metrics || typeof metrics !== 'object') {
      throw new Error('metrics must be an object');
    }

    const db = getDb();

    // Verify test exists
    const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(testId);
    if (!test) {
      throw new Error(`Test not found: ${testId}`);
    }

    const opts = JSON.parse(test.options_json);
    const gateState = opts.gateAware ? captureGateState() : {};

    const stmt = db.prepare(
      `INSERT INTO results (test_id, variant, metrics_json, gate_state_json)
       VALUES (?, ?, ?, ?)`
    );
    stmt.run(testId, variant, JSON.stringify(metrics), JSON.stringify(gateState));

    // Update test timestamp
    db.prepare(`UPDATE tests SET updated = datetime('now') WHERE id = ?`).run(testId);
  } catch (error) {
    throw new Error(`recordResult failed: ${error.message}`);
  }
}

/**
 * Analyze results for a test.
 * @param {string} testId
 * @returns {Object} { winner, confidence, gateImpact, invalidated, variantStats, totalRuns }
 * @example
 * const analysis = analyzeResults(testId);
 * console.log(`Winner: ${analysis.winner || 'No clear winner'}`);
 * console.log(`Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
 * if (analysis.gateImpact.changed) {
 *   console.log('Warning: Feature gates changed during test');
 * }
 */
export function analyzeResults(testId) {
  try {
    if (!testId || typeof testId !== 'string') {
      throw new Error('testId must be a non-empty string');
    }

    const db = getDb();

    const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(testId);
    if (!test) {
      throw new Error(`Test not found: ${testId}`);
    }

  const opts = JSON.parse(test.options_json);
  const variants = JSON.parse(test.variants_json);
  const startGateState = JSON.parse(test.gate_state_json);

  const rows = db.prepare(
    'SELECT * FROM results WHERE test_id = ? ORDER BY timestamp'
  ).all(testId);

  // Group results by variant
  const byVariant = {};
  for (const v of variants) {
    byVariant[v] = [];
  }
  for (const row of rows) {
    const m = JSON.parse(row.metrics_json);
    if (!byVariant[row.variant]) {
      byVariant[row.variant] = [];
    }
    byVariant[row.variant].push(m);
  }

  // Compute per-variant stats
  const variantStats = {};
  for (const [v, results] of Object.entries(byVariant)) {
    if (results.length === 0) {
      variantStats[v] = { count: 0, avgQuality: 0, avgCost: 0, avgTokens: 0, avgDuration: 0 };
      continue;
    }
    const avg = (arr, key) => {
      const vals = arr.map(r => r[key]).filter(x => x !== undefined && x !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    variantStats[v] = {
      count: results.length,
      avgQuality: avg(results, 'quality'),
      avgCost: avg(results, 'cost'),
      avgTokens: avg(results, 'tokens'),
      avgDuration: avg(results, 'duration'),
    };
  }

  // Check gate changes (confounding)
  let gateImpact = { changed: false, changedGates: [], details: '' };
  if (opts.gateAware && Object.keys(startGateState).length > 0) {
    const changedGates = [];
    for (const row of rows) {
      const rowGates = JSON.parse(row.gate_state_json);
      for (const [gateId, startVal] of Object.entries(startGateState)) {
        if (rowGates[gateId] && rowGates[gateId].value !== startVal.value) {
          if (!changedGates.includes(gateId)) {
            changedGates.push(gateId);
          }
        }
      }
    }
    if (changedGates.length > 0) {
      gateImpact = {
        changed: true,
        changedGates,
        details: `${changedGates.length} gate(s) changed during test — results may be confounded`,
      };
    }
  }

  // Statistical significance via Welch's t-test on quality scores
  const totalRuns = rows.length;
  let winner = null;
  let confidence = 0;
  let invalidated = false;
  let significanceNote = '';

  const variantNames = Object.keys(variantStats).filter(v => variantStats[v].count > 0);

  if (variantNames.length >= 2) {
    // Find top two by average quality
    const sorted = [...variantNames].sort(
      (a, b) => variantStats[b].avgQuality - variantStats[a].avgQuality
    );
    const best = sorted[0];
    const second = sorted[1];

    const bestResults = byVariant[best].map(r => r.quality).filter(x => x != null);
    const secondResults = byVariant[second].map(r => r.quality).filter(x => x != null);

    if (bestResults.length >= 2 && secondResults.length >= 2) {
      const tResult = welchTTest(bestResults, secondResults);
      confidence = 1 - tResult.pValue;

      if (confidence >= opts.confidenceLevel && bestResults.length >= opts.minRuns) {
        winner = best;
      } else if (bestResults.length < opts.minRuns) {
        significanceNote = `Insufficient runs: ${bestResults.length}/${opts.minRuns} required per variant`;
      } else {
        significanceNote = `Confidence ${(confidence * 100).toFixed(1)}% below threshold ${(opts.confidenceLevel * 100).toFixed(1)}%`;
      }
    } else {
      significanceNote = 'Not enough data points for statistical test (need >= 2 per variant)';
    }
  } else {
    significanceNote = 'Need results for at least 2 variants';
  }

  // Gate changes invalidate results
  if (gateImpact.changed) {
    invalidated = true;
  }

    // Mark test as analyzed
    db.prepare(`UPDATE tests SET status = 'analyzed', updated = datetime('now') WHERE id = ?`).run(testId);

    return {
      testId,
      testName: test.name,
      winner,
      confidence,
      significanceNote,
      gateImpact,
      invalidated,
      variantStats,
      totalRuns,
      options: opts,
    };
  } catch (error) {
    throw new Error(`analyzeResults failed: ${error.message}`);
  }
}

/**
 * Get history of all tests.
 * @returns {Array} List of test objects with summary stats
 * @example
 * const tests = getTestHistory();
 * tests.forEach(t => {
 *   console.log(`${t.name}: ${t.resultCount} results, status: ${t.status}`);
 * });
 */
export function getTestHistory() {
  try {
    const db = getDb();

    const tests = db.prepare('SELECT * FROM tests ORDER BY created DESC').all();

    return tests.map(t => {
      const resultCount = db.prepare(
        'SELECT COUNT(*) as cnt FROM results WHERE test_id = ?'
      ).get(t.id);

      return {
        id: t.id,
        name: t.name,
        status: t.status,
        variants: JSON.parse(t.variants_json),
        options: JSON.parse(t.options_json),
        gateStateAtStart: JSON.parse(t.gate_state_json),
        resultCount: resultCount.cnt,
        created: t.created,
        updated: t.updated,
      };
    });
  } catch (error) {
    throw new Error(`getTestHistory failed: ${error.message}`);
  }
}

// ─── Statistical Helpers ─────────────────────────────────────────

/**
 * Welch's t-test for two independent samples.
 * Returns { tStatistic, degreesOfFreedom, pValue }.
 */
function welchTTest(sample1, sample2) {
  const n1 = sample1.length;
  const n2 = sample2.length;

  const mean1 = sample1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = sample2.reduce((a, b) => a + b, 0) / n2;

  const var1 = sample1.reduce((s, x) => s + (x - mean1) ** 2, 0) / (n1 - 1);
  const var2 = sample2.reduce((s, x) => s + (x - mean2) ** 2, 0) / (n2 - 1);

  const se = Math.sqrt(var1 / n1 + var2 / n2);

  if (se === 0) {
    return { tStatistic: 0, degreesOfFreedom: n1 + n2 - 2, pValue: 1 };
  }

  const t = (mean1 - mean2) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = (var1 / n1 + var2 / n2) ** 2;
  const denom =
    (var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1);
  const df = num / denom;

  // Approximate p-value using the t-distribution via regularized incomplete beta
  const pValue = tDistPValue(Math.abs(t), df);

  return { tStatistic: t, degreesOfFreedom: df, pValue };
}

/**
 * Two-tailed p-value from t-distribution.
 * Uses approximation via the regularized incomplete beta function.
 */
function tDistPValue(t, df) {
  const x = df / (df + t * t);
  return regularizedIncompleteBeta(x, df / 2, 0.5);
}

/**
 * Regularized incomplete beta function I_x(a, b) via continued fraction.
 * Adequate for t-test p-value approximation.
 */
function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use the continued fraction representation (Lentz's method)
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b - lnBeta
  ) / a;

  // Continued fraction via modified Lentz's method
  let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= 200; m++) {
    // Even step
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= d * c;

    // Odd step
    numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    f *= delta;

    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return front * f;
}

/**
 * Log-gamma function using Stirling's approximation (Lanczos).
 */
function lnGamma(z) {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }

  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// ─── Chi-Squared Test ────────────────────────────────────────────

/**
 * Chi-squared test for categorical data (e.g., success/failure rates).
 * Tests whether observed frequencies differ significantly from expected frequencies.
 * @param {number[]} observed - Observed frequencies for each category
 * @param {number[]} expected - Expected frequencies for each category
 * @returns {{ chiSquared: number, degreesOfFreedom: number, pValue: number }}
 * @example
 * const observed = [45, 55];
 * const expected = [50, 50];
 * const result = chiSquaredTest(observed, expected);
 * console.log(`Chi-squared: ${result.chiSquared.toFixed(2)}, p-value: ${result.pValue.toFixed(4)}`);
 */
export function chiSquaredTest(observed, expected) {
  try {
    if (!Array.isArray(observed) || !Array.isArray(expected)) {
      throw new Error('observed and expected must be arrays');
    }
    if (observed.length !== expected.length) {
      throw new Error('observed and expected must have the same length');
    }
    if (observed.length === 0) {
      throw new Error('arrays must not be empty');
    }

    let chiSquared = 0;
    for (let i = 0; i < observed.length; i++) {
      const o = observed[i];
      const e = expected[i];
      if (e === 0) {
        throw new Error('expected frequencies must be > 0');
      }
      chiSquared += ((o - e) ** 2) / e;
    }

    const df = observed.length - 1;
    const pValue = chiSquaredPValue(chiSquared, df);

    return {
      chiSquared,
      degreesOfFreedom: df,
      pValue
    };
  } catch (error) {
    throw new Error(`chiSquaredTest failed: ${error.message}`);
  }
}

/**
 * Calculate p-value for chi-squared distribution.
 * Uses regularized incomplete gamma function.
 */
function chiSquaredPValue(chiSq, df) {
  if (chiSq < 0 || df < 1) return 1;
  // P(X > chiSq) = 1 - P(X <= chiSq)
  // For chi-squared: P(X <= x) = P(Gamma(df/2, x/2))
  // = regularizedGamma(df/2, x/2)
  return 1 - regularizedGamma(df / 2, chiSq / 2);
}

/**
 * Regularized lower incomplete gamma function γ(a, x) / Γ(a).
 */
function regularizedGamma(a, x) {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;
  if (x > a + 1) {
    // Use continued fraction for upper incomplete gamma
    return 1 - regularizedGammaUpper(a, x);
  }
  // Use series expansion for lower incomplete gamma
  return regularizedGammaLower(a, x);
}

function regularizedGammaLower(a, x) {
  const logGamma = lnGamma(a);
  const front = Math.exp(a * Math.log(x) - x - logGamma);

  let sum = 1 / a;
  let term = 1 / a;
  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < 1e-10 * Math.abs(sum)) break;
  }

  return front * sum;
}

function regularizedGammaUpper(a, x) {
  const logGamma = lnGamma(a);
  const front = Math.exp(a * Math.log(x) - x - logGamma);

  // Continued fraction
  let a0 = 1, a1 = x;
  let b0 = 0, b1 = 1;
  let f = a1 / b1;

  for (let n = 1; n < 200; n++) {
    const an = n * (a - n);
    const bn = (2 * n + 1) - a + x;

    const a2 = bn * a1 + an * a0;
    const b2 = bn * b1 + an * b0;

    if (b2 !== 0) {
      const fNew = a2 / b2;
      if (Math.abs(fNew - f) < 1e-10 * Math.abs(f)) {
        return front * fNew;
      }
      f = fNew;
    }

    a0 = a1; a1 = a2;
    b0 = b1; b1 = b2;

    // Rescale to prevent overflow
    if (Math.abs(a1) > 1e100) {
      a0 /= 1e100; a1 /= 1e100;
      b0 /= 1e100; b1 /= 1e100;
    }
  }

  return front * f;
}

/**
 * Convenience function: chi-squared test for A/B test success rates.
 * @param {Object} variantA - { trials: number, successes: number }
 * @param {Object} variantB - { trials: number, successes: number }
 * @returns {{ chiSquared: number, pValue: number, significant: boolean, confidenceLevel: number }}
 * @example
 * const result = abTestChiSquared(
 *   { trials: 100, successes: 65 },
 *   { trials: 100, successes: 75 }
 * );
 * console.log(`Significant: ${result.significant}, confidence: ${result.confidenceLevel}`);
 */
export function abTestChiSquared(variantA, variantB) {
  try {
    if (!variantA || !variantB) {
      throw new Error('Both variants required');
    }
    if (typeof variantA.trials !== 'number' || typeof variantA.successes !== 'number') {
      throw new Error('variantA must have trials and successes');
    }
    if (typeof variantB.trials !== 'number' || typeof variantB.successes !== 'number') {
      throw new Error('variantB must have trials and successes');
    }

    const totalTrials = variantA.trials + variantB.trials;
    const totalSuccesses = variantA.successes + variantB.successes;
    const totalFailures = totalTrials - totalSuccesses;

    if (totalTrials === 0) {
      throw new Error('No trials recorded');
    }

    const successRate = totalSuccesses / totalTrials;
    const failureRate = totalFailures / totalTrials;

    // Expected frequencies under null hypothesis (no difference)
    const expectedA = [
      variantA.trials * successRate,
      variantA.trials * failureRate
    ];
    const expectedB = [
      variantB.trials * successRate,
      variantB.trials * failureRate
    ];

    // Observed frequencies
    const observedA = [
      variantA.successes,
      variantA.trials - variantA.successes
    ];
    const observedB = [
      variantB.successes,
      variantB.trials - variantB.successes
    ];

    // Combine into single arrays
    const observed = [...observedA, ...observedB];
    const expected = [...expectedA, ...expectedB];

    const result = chiSquaredTest(observed, expected);
    const significant = result.pValue < 0.05;
    const confidenceLevel = 1 - result.pValue;

    return {
      chiSquared: result.chiSquared,
      pValue: result.pValue,
      significant,
      confidenceLevel: Math.round(confidenceLevel * 1000) / 1000
    };
  } catch (error) {
    throw new Error(`abTestChiSquared failed: ${error.message}`);
  }
}
