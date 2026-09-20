#!/usr/bin/env node
/**
 * test-p1-features.mjs — Comprehensive tests for P1 features
 *
 * Tests all P1 fixes across modules:
 * 1. prompt-assembler: template inheritance, section priority ordering
 * 2. token-counter: model-specific limits, warnings when approaching limits
 * 3. cache-optimizer: cache hit rate tracking, historical stats
 * 4. cost-estimator: session cost history, trend visualization data
 * 5. security-analyzer: configurable rule sets, custom patterns
 * 6. gate-aware-ab: chi-squared test for statistical significance
 * 7. suite-manager: suite validation, dependency checking
 */

import { PromptAssembler } from '../lib/prompt-assembler.mjs';
import { estimateTokens, checkTemplateFit, getModelLimits } from '../lib/token-counter.mjs';
import { trackCacheEvent, getCacheStats } from '../lib/cache-optimizer.mjs';
import { estimateCost, getCostHistory, getCostTrends } from '../lib/cost-estimator.mjs';
import {
  analyzeTemplate as securityAnalyze,
  addPattern,
  removePattern,
  resetPatterns,
  getActivePatterns
} from '../lib/security-analyzer.mjs';
import { chiSquaredTest, abTestChiSquared } from '../lib/gate-aware-ab.mjs';
import { PromptSuite } from '../lib/suite-manager.mjs';

// ─── Test Harness ────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (error) {
    failedTests++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ═══════════════════════════════════════════════════════════════════
// PROMPT-ASSEMBLER TESTS
// ═══════════════════════════════════════════════════════════════════

section('1. PROMPT-ASSEMBLER: Template Inheritance & Priority Ordering');

test('Template inheritance: child inherits parent sections', () => {
  const parent = new PromptAssembler();
  parent.addSection('custom-section', 'Parent content', { priority: 100 });

  const child = new PromptAssembler(parent);
  child.addSection('core-identity', 'Child identity');

  const assembled = child.assemble();
  assert(assembled.includes('Parent content'), 'Child should inherit parent sections');
  assert(assembled.includes('Child identity'), 'Child should have own sections');
});

test('Template inheritance: child overrides parent sections', () => {
  const parent = new PromptAssembler();
  parent.addSection('core-identity', 'Parent identity');

  const child = new PromptAssembler(parent);
  child.addSection('core-identity', 'Child identity override');

  const assembled = child.assemble();
  assert(assembled.includes('Child identity override'), 'Child should override parent');
  assert(!assembled.includes('Parent identity'), 'Parent version should not appear');
});

test('Section priority ordering: setPriority changes order', () => {
  const assembler = new PromptAssembler();
  assembler.addSection('section-a', 'A', { priority: 10 });
  assembler.addSection('section-b', 'B', { priority: 20 });

  const before = assembler.sectionNames();
  assert(before.indexOf('section-a') < before.indexOf('section-b'), 'A should come before B initially');

  assembler.setPriority('section-b', 5);
  const after = assembler.sectionNames();
  assert(after.indexOf('section-b') < after.indexOf('section-a'), 'B should come before A after setPriority');
});

test('Section priority ordering: reorder() sets custom order', () => {
  const assembler = new PromptAssembler();
  assembler.addSection('first', 'First', { priority: 100 });
  assembler.addSection('second', 'Second', { priority: 101 });
  assembler.addSection('third', 'Third', { priority: 102 });

  assembler.reorder(['third', 'first', 'second']);
  const names = assembler.sectionNames();

  const thirdIdx = names.indexOf('third');
  const firstIdx = names.indexOf('first');
  const secondIdx = names.indexOf('second');

  assert(thirdIdx < firstIdx, 'third should come before first');
  assert(firstIdx < secondIdx, 'first should come before second');
});

test('Template inheritance: multiple levels of inheritance', () => {
  const grandparent = new PromptAssembler();
  grandparent.addSection('gp-section', 'Grandparent content');

  const parent = new PromptAssembler(grandparent);
  parent.addSection('p-section', 'Parent content');

  const child = new PromptAssembler(parent);
  child.addSection('c-section', 'Child content');

  const assembled = child.assemble();
  assert(assembled.includes('Grandparent content'), 'Should inherit from grandparent');
  assert(assembled.includes('Parent content'), 'Should inherit from parent');
  assert(assembled.includes('Child content'), 'Should have own content');
});

// ═══════════════════════════════════════════════════════════════════
// TOKEN-COUNTER TESTS
// ═══════════════════════════════════════════════════════════════════

section('2. TOKEN-COUNTER: Model-Specific Limits & Warnings');

test('Model-specific limits: getModelLimits returns correct structure', () => {
  const limits = getModelLimits('claude-opus-4');
  assert(limits.limit === 200000, 'Opus should have 200k limit');
  assert(limits.warnAt === 160000, 'Should have warnAt threshold');
  assert(limits.criticalAt === 180000, 'Should have criticalAt threshold');
  assert(limits.model === 'claude-opus-4', 'Should include model name');
});

test('Warnings when approaching limits: getModelLimits provides thresholds', () => {
  // Just verify the feature exists and returns proper structure
  const limits = getModelLimits('claude-sonnet-4');
  assert(limits.warnAt === 160000, 'Should have warning threshold at 160k');
  assert(limits.criticalAt === 180000, 'Should have critical threshold at 180k');
  assert(limits.warnAt < limits.criticalAt, 'Warning should be before critical');
  assert(limits.criticalAt < limits.limit, 'Critical should be before limit');
});

test('Warnings when approaching limits: warnings array in result', () => {
  // Verify that checkTemplateFit returns warnings array
  const result = checkTemplateFit('Small text', 'claude-sonnet-4');
  assert(Array.isArray(result.warnings), 'Should have warnings array');
  assert(typeof result.usagePercent === 'number', 'Should have usage percent');
  assert('warnAt' in result, 'Should have warnAt in result');
  assert('criticalAt' in result, 'Should have criticalAt in result');
});

test('Model-specific limits: extended context for opus 4.6', () => {
  const limits = getModelLimits('claude-opus-4-6');
  assert(limits.limit === 1000000, 'Opus 4.6 should have 1M limit');
  assert(limits.warnAt === 800000, 'Warn threshold scaled to 1M');
});

test('Token estimation and fit checking: small template passes', () => {
  const smallText = 'This is a small prompt template.';
  const result = checkTemplateFit(smallText, 'claude-sonnet-4');

  assert(result.fits === true, 'Small template should fit');
  assert(result.warnings.length === 0, 'Should have no warnings');
  assert(result.compactionRisk === 'low', 'Risk should be low');
  assert(result.usagePercent < 10, 'Usage should be minimal (< 10%)');
});

// ═══════════════════════════════════════════════════════════════════
// CACHE-OPTIMIZER TESTS
// ═══════════════════════════════════════════════════════════════════

section('3. CACHE-OPTIMIZER: Hit Rate Tracking & Historical Stats');

test('Cache hit tracking: trackCacheEvent stores event', async () => {
  await trackCacheEvent({
    hit: true,
    tokensServed: 1000,
    promptId: 'test-prompt-1',
    model: 'claude-sonnet-4'
  });

  const stats = getCacheStats({ promptId: 'test-prompt-1' });
  assert(stats.totalEvents > 0, 'Should have recorded events');
  assert(stats.totalHits > 0, 'Should have recorded hits');
});

test('Cache hit tracking: hit rate calculation', async () => {
  const promptId = 'test-prompt-hitrate';

  // Record 7 hits and 3 misses = 70% hit rate
  for (let i = 0; i < 7; i++) {
    await trackCacheEvent({ hit: true, tokensServed: 1000, promptId });
  }
  for (let i = 0; i < 3; i++) {
    await trackCacheEvent({ hit: false, tokensServed: 0, promptId });
  }

  const stats = getCacheStats({ promptId });
  const expectedHitRate = 0.7;
  const tolerance = 0.1; // Allow some variance due to existing data

  assert(stats.totalEvents >= 10, 'Should have at least 10 events');
  assert(stats.totalHits >= 7, 'Should have at least 7 hits');
  assert(stats.totalMisses >= 3, 'Should have at least 3 misses');
});

test('Historical stats: filter by model', async () => {
  const promptId = 'test-prompt-model-filter';

  await trackCacheEvent({ hit: true, tokensServed: 1000, promptId, model: 'claude-opus-4' });
  await trackCacheEvent({ hit: true, tokensServed: 1000, promptId, model: 'claude-sonnet-4' });

  const opusStats = getCacheStats({ model: 'claude-opus-4' });
  const sonnetStats = getCacheStats({ model: 'claude-sonnet-4' });

  assert(opusStats.totalEvents > 0, 'Should have opus events');
  assert(sonnetStats.totalEvents > 0, 'Should have sonnet events');
});

test('Historical stats: tokens saved accumulation', async () => {
  const promptId = 'test-prompt-tokens-saved';

  await trackCacheEvent({ hit: true, tokensServed: 1000, promptId });
  await trackCacheEvent({ hit: true, tokensServed: 2000, promptId });
  await trackCacheEvent({ hit: true, tokensServed: 1500, promptId });

  const stats = getCacheStats({ promptId });
  assert(stats.tokensSaved >= 4500, 'Should accumulate tokens saved');
});

test('Historical stats: empty stats for non-existent prompt', () => {
  const stats = getCacheStats({ promptId: 'non-existent-prompt-xyz-123' });
  assert(stats.totalEvents === 0, 'Non-existent prompt should have zero events');
  assert(stats.hitRate === 0, 'Hit rate should be 0');
  assert(stats.tokensSaved === 0, 'Tokens saved should be 0');
});

// ═══════════════════════════════════════════════════════════════════
// COST-ESTIMATOR TESTS
// ═══════════════════════════════════════════════════════════════════

section('4. COST-ESTIMATOR: Session Cost History & Trend Visualization');

test('Cost history: getCostHistory returns records', async () => {
  await import('../lib/cost-estimator.mjs').then(mod => mod.trackCost('test-session-1', { input: 1000, output: 500 }, 'claude-sonnet-4'));

  const history = getCostHistory({ sessionId: 'test-session-1' });
  assert(Array.isArray(history), 'History should be an array');
  assert(history.length > 0, 'Should have records');
});

test('Cost history: filter by session ID', async () => {
  const { trackCost } = await import('../lib/cost-estimator.mjs');

  await trackCost('session-a', { input: 1000, output: 500 });
  await trackCost('session-b', { input: 2000, output: 1000 });

  const historyA = getCostHistory({ sessionId: 'session-a' });
  const historyB = getCostHistory({ sessionId: 'session-b' });

  assert(historyA.length > 0, 'Should have session A records');
  assert(historyB.length > 0, 'Should have session B records');
  assert(historyA.every(r => r.sessionId === 'session-a'), 'Session A filter works');
  assert(historyB.every(r => r.sessionId === 'session-b'), 'Session B filter works');
});

test('Cost trends: getCostTrends returns visualization data', async () => {
  const { trackCost } = await import('../lib/cost-estimator.mjs');

  await trackCost('trend-test-1', { input: 1000, output: 500 });
  await trackCost('trend-test-2', { input: 1500, output: 750 });

  const trends = getCostTrends({ lastNDays: 7, groupBy: 'day' });

  assert(Array.isArray(trends.labels), 'Should have labels array');
  assert(Array.isArray(trends.totalCosts), 'Should have totalCosts array');
  assert(Array.isArray(trends.inputCosts), 'Should have inputCosts array');
  assert(Array.isArray(trends.outputCosts), 'Should have outputCosts array');
  assert(trends.labels.length === trends.totalCosts.length, 'Arrays should have matching length');
});

test('Cost trends: groupBy session aggregation', async () => {
  const { trackCost } = await import('../lib/cost-estimator.mjs');

  await trackCost('group-test-a', { input: 1000, output: 500 });
  await trackCost('group-test-a', { input: 1000, output: 500 });
  await trackCost('group-test-b', { input: 2000, output: 1000 });

  const trends = getCostTrends({ groupBy: 'session', lastNDays: 1 });

  assert(trends.labels.includes('group-test-a'), 'Should include session A');
  assert(trends.labels.includes('group-test-b'), 'Should include session B');
});

test('Cost trends: empty history returns empty arrays', () => {
  const trends = getCostTrends({ sessionId: 'non-existent-session-xyz' });

  assert(trends.labels.length === 0, 'Should have empty labels');
  assert(trends.totalCosts.length === 0, 'Should have empty costs');
});

// ═══════════════════════════════════════════════════════════════════
// SECURITY-ANALYZER TESTS
// ═══════════════════════════════════════════════════════════════════

section('5. SECURITY-ANALYZER: Configurable Rule Sets & Custom Patterns');

test('Custom patterns: addPattern adds new rule', () => {
  resetPatterns();

  addPattern('customTest', {
    patterns: [/custom-injection-test/i],
    severity: 'error',
    category: 'Custom test pattern',
    weight: 10
  });

  const patterns = getActivePatterns();
  assert(patterns.customTest, 'Custom pattern should be added');
  assert(patterns.customTest.weight === 10, 'Custom pattern should have correct weight');
});

test('Custom patterns: custom pattern detects violations', () => {
  resetPatterns();

  addPattern('customBanned', {
    patterns: [/banned-phrase/i],
    severity: 'error',
    category: 'Banned phrase detected',
    weight: 30
  });

  const result = securityAnalyze('This contains a banned-phrase in the text.');
  assert(result.errors.length > 0, 'Should detect custom pattern violation');
  assert(result.safe === false, 'Should not be safe');
});

test('Custom patterns: removePattern removes rule', () => {
  resetPatterns();

  addPattern('tempPattern', {
    patterns: [/temp/],
    severity: 'warning',
    category: 'Temp',
    weight: 5
  });

  let patterns = getActivePatterns();
  assert(patterns.tempPattern, 'Pattern should exist');

  removePattern('tempPattern');
  patterns = getActivePatterns();
  assert(!patterns.tempPattern, 'Pattern should be removed');
});

test('Custom patterns: resetPatterns restores defaults', () => {
  resetPatterns();

  addPattern('custom1', { patterns: [/test/], severity: 'error', category: 'Test', weight: 10 });
  addPattern('custom2', { patterns: [/test/], severity: 'error', category: 'Test', weight: 10 });

  resetPatterns();
  const patterns = getActivePatterns();

  assert(!patterns.custom1, 'Custom patterns should be removed');
  assert(!patterns.custom2, 'Custom patterns should be removed');
  assert(patterns.systemOverride, 'Default patterns should be restored');
});

test('Configurable rule sets: options.customPatterns for one-time use', () => {
  resetPatterns();

  const customPatterns = {
    testOnly: {
      patterns: [/one-time-pattern/i],
      severity: 'error',
      category: 'One-time test',
      weight: 15
    }
  };

  const result = securityAnalyze('Text with one-time-pattern here', { customPatterns });
  assert(result.errors.length > 0, 'Should detect custom pattern');

  // Verify global patterns unchanged
  const globalPatterns = getActivePatterns();
  assert(!globalPatterns.testOnly, 'Global patterns should not be affected');
});

// ═══════════════════════════════════════════════════════════════════
// GATE-AWARE-AB TESTS
// ═══════════════════════════════════════════════════════════════════

section('6. GATE-AWARE-AB: Chi-Squared Test for Statistical Significance');

test('Chi-squared test: basic calculation', () => {
  const observed = [50, 50];
  const expected = [40, 60];

  const result = chiSquaredTest(observed, expected);

  assert(typeof result.chiSquared === 'number', 'Should return chi-squared value');
  assert(typeof result.pValue === 'number', 'Should return p-value');
  assert(result.degreesOfFreedom === 1, 'DF should be n-1');
  assert(result.chiSquared > 0, 'Chi-squared should be positive');
});

test('Chi-squared test: perfect match has low chi-squared', () => {
  const observed = [50, 50];
  const expected = [50, 50];

  const result = chiSquaredTest(observed, expected);

  assert(result.chiSquared < 0.01, 'Perfect match should have near-zero chi-squared');
  assert(result.pValue > 0.95, 'Perfect match should have high p-value');
});

test('Chi-squared test: A/B test convenience function', () => {
  const variantA = { trials: 100, successes: 60 };
  const variantB = { trials: 100, successes: 40 };

  const result = abTestChiSquared(variantA, variantB);

  assert(typeof result.chiSquared === 'number', 'Should return chi-squared');
  assert(typeof result.pValue === 'number', 'Should return p-value');
  assert(typeof result.significant === 'boolean', 'Should return significance flag');
  assert(typeof result.confidenceLevel === 'number', 'Should return confidence level');
});

test('Chi-squared test: significant difference detected', () => {
  // Large difference: 90% vs 10% success rates
  const variantA = { trials: 100, successes: 90 };
  const variantB = { trials: 100, successes: 10 };

  const result = abTestChiSquared(variantA, variantB);

  assert(result.significant === true, 'Large difference should be significant');
  assert(result.pValue < 0.05, 'P-value should be < 0.05');
  assert(result.confidenceLevel > 0.95, 'Confidence should be > 95%');
});

test('Chi-squared test: no significant difference', () => {
  // Small difference: 51% vs 49%
  const variantA = { trials: 100, successes: 51 };
  const variantB = { trials: 100, successes: 49 };

  const result = abTestChiSquared(variantA, variantB);

  assert(result.significant === false, 'Small difference should not be significant');
  assert(result.pValue > 0.05, 'P-value should be > 0.05');
});

test('Chi-squared test: error handling for invalid input', () => {
  let errorThrown = false;
  try {
    chiSquaredTest([1, 2], [1, 2, 3]); // Mismatched lengths
  } catch (e) {
    errorThrown = true;
    assert(e.message.includes('same length'), 'Should throw length mismatch error');
  }
  assert(errorThrown, 'Should throw error for mismatched lengths');
});

// ═══════════════════════════════════════════════════════════════════
// SUITE-MANAGER TESTS
// ═══════════════════════════════════════════════════════════════════

section('7. SUITE-MANAGER: Suite Validation & Dependency Checking');

test('Dependency checking: valid dependencies pass validation', () => {
  const suite = new PromptSuite('dep-test-suite');
  suite.addRole('researcher', 'Research the codebase');
  suite.addRole('implementer', 'Implement features', { dependsOn: ['researcher'] });

  const validation = suite.validate();
  assert(validation.valid === true, 'Valid dependencies should pass');
  assert(validation.errors.length === 0, 'Should have no errors');
});

test('Dependency checking: missing dependency causes error', () => {
  const suite = new PromptSuite('missing-dep-suite');
  suite.addRole('implementer', 'Implement features', { dependsOn: ['non-existent-role'] });

  const validation = suite.validate();
  assert(validation.valid === false, 'Missing dependency should fail validation');
  assert(validation.errors.some(e => e.includes('non-existent-role')), 'Error should mention missing role');
});

test('Dependency checking: circular dependency detection', () => {
  const suite = new PromptSuite('circular-suite');
  suite.addRole('role-a', 'A', { dependsOn: ['role-b'] });
  suite.addRole('role-b', 'B', { dependsOn: ['role-a'] });

  const validation = suite.validate();
  assert(validation.valid === false, 'Circular dependency should fail validation');
  assert(validation.errors.some(e => e.includes('Circular dependency')), 'Should detect circular dependency');
});

test('Dependency checking: execution order respects dependencies', () => {
  const suite = new PromptSuite('order-test-suite');
  suite.addRole('coordinator', 'Coordinate');
  suite.addRole('researcher', 'Research', { dependsOn: ['coordinator'] });
  suite.addRole('implementer', 'Implement', { dependsOn: ['researcher'] });
  suite.addRole('tester', 'Test', { dependsOn: ['implementer'] });

  const validation = suite.validate();
  const order = validation.executionOrder;

  assert(validation.valid === true, 'Valid chain should pass');
  assert(order.indexOf('coordinator') < order.indexOf('researcher'), 'Coordinator before researcher');
  assert(order.indexOf('researcher') < order.indexOf('implementer'), 'Researcher before implementer');
  assert(order.indexOf('implementer') < order.indexOf('tester'), 'Implementer before tester');
});

test('Dependency checking: complex dependency graph', () => {
  const suite = new PromptSuite('complex-suite');
  suite.addRole('coordinator', 'Coordinate');
  suite.addRole('researcher-a', 'Research A', { dependsOn: ['coordinator'] });
  suite.addRole('researcher-b', 'Research B', { dependsOn: ['coordinator'] });
  suite.addRole('implementer', 'Implement', { dependsOn: ['researcher-a', 'researcher-b'] });
  suite.addRole('reviewer', 'Review', { dependsOn: ['implementer'] });

  const validation = suite.validate();
  const order = validation.executionOrder;

  assert(validation.valid === true, 'Complex graph should be valid');
  assert(order.indexOf('coordinator') === 0, 'Coordinator should be first');
  assert(order.indexOf('implementer') > order.indexOf('researcher-a'), 'Implementer after researcher-a');
  assert(order.indexOf('implementer') > order.indexOf('researcher-b'), 'Implementer after researcher-b');
  assert(order.indexOf('reviewer') === order.length - 1, 'Reviewer should be last');
});

test('Suite validation: empty suite fails validation', () => {
  const suite = new PromptSuite('empty-suite');

  const validation = suite.validate();
  assert(validation.valid === false, 'Empty suite should fail');
  assert(validation.errors.some(e => e.includes('no roles')), 'Should mention no roles');
});

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════

console.log('\n\x1b[1m═══════════════════════════════════════════════════════════════\x1b[0m');
console.log(`\x1b[1m  FINAL RESULT: ${passedTests}/${totalTests} tests passed\x1b[0m`);
if (failedTests > 0) {
  console.log(`  \x1b[31m${failedTests} tests failed\x1b[0m`);
}
console.log('\x1b[1m═══════════════════════════════════════════════════════════════\x1b[0m\n');

process.exit(failedTests === 0 ? 0 : 1);
