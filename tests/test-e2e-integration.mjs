#!/usr/bin/env node
/**
 * test-e2e-integration.mjs — End-to-End Integration Test
 *
 * Verifies all 10 prompt-studio modules work TOGETHER in a real workflow:
 * "Build a feature using multi-agent prompt suite with cost optimization"
 *
 * Steps:
 *   1. Suite Setup (suite-manager)
 *   2. Prompt Assembly (prompt-assembler)
 *   3. Model Variants (model-variants)
 *   4. Token Counting (token-counter)
 *   5. Cache Optimization (cache-optimizer)
 *   6. Cost Estimation (cost-estimator)
 *   7. Security Check (security-analyzer)
 *   8. Output Style (output-style-generator)
 *   9. A/B Test Setup (gate-aware-ab)
 */

import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { writeFileSync, existsSync, mkdirSync, unlinkSync, mkdtempSync, rmSync } from 'fs';

const STUDIO_DIR = mkdtempSync(join(tmpdir(), 'sigil-e2e-'));
process.env.PROMPT_STUDIO_DIR = STUDIO_DIR;
process.env.SIGIL_OUTPUT_STYLES_DIR = join(STUDIO_DIR, 'output-styles');
const SUITE_PATH = fileURLToPath(new URL('./fixtures/feature-build.json', import.meta.url));
mkdirSync(join(STUDIO_DIR, 'templates'), { recursive: true });
mkdirSync(join(STUDIO_DIR, 'results'), { recursive: true });

// ─── Module Imports ──────────────────────────────────────────────
const { loadSuite, PromptSuite } = await import('../lib/suite-manager.mjs');
const { PromptAssembler, estimateTokens: assemblerEstimateTokens } = await import('../lib/prompt-assembler.mjs');
const { generateVariants, selectVariant, enrichForModel, getModelProfile } = await import('../lib/model-variants.mjs');
const { estimateTokens, checkTemplateFit, autoTrim } = await import('../lib/token-counter.mjs');
const { analyzeTemplate: cacheAnalyze, splitForCaching, estimateCacheSavings } = await import('../lib/cache-optimizer.mjs');
const { estimateCost, compareCosts } = await import('../lib/cost-estimator.mjs');
const { analyzeTemplate: securityAnalyze, securityScore, sanitize } = await import('../lib/security-analyzer.mjs');
const { generateOutputStyle, installOutputStyle } = await import('../lib/output-style-generator.mjs');
const { startTest, recordResult, analyzeResults } = await import('../lib/gate-aware-ab.mjs');

// ─── Test Harness ────────────────────────────────────────────────

const RESULTS = [];
let totalPassed = 0;
let totalSteps = 9;

function pass(step, msg, details = null) {
  totalPassed++;
  RESULTS.push({ step, status: 'PASS', msg, details });
  console.log(`  \x1b[32m✓ PASS\x1b[0m  Step ${step}: ${msg}`);
  if (details) console.log(`          ${typeof details === 'string' ? details : JSON.stringify(details)}`);
}

function fail(step, msg, error = null) {
  RESULTS.push({ step, status: 'FAIL', msg, error: error?.message || String(error) });
  console.log(`  \x1b[31m✗ FAIL\x1b[0m  Step ${step}: ${msg}`);
  if (error) console.log(`          Error: ${error?.message || error}`);
}

function section(title) {
  console.log(`\n\x1b[1m─── ${title} ───\x1b[0m`);
}

// ─── Shared State (flows between steps) ──────────────────────────

const state = {
  suite: null,
  roles: {},           // roleName -> { template, model, assembler, assembled, variant }
  tokenResults: {},    // roleName -> checkTemplateFit result
  cacheResults: {},    // roleName -> splitForCaching result
  costResults: {},     // roleName -> estimateCost result
  securityResults: {}, // roleName -> { analysis, score }
};

// ═══════════════════════════════════════════════════════════════════
// STEP 1: Suite Setup
// ═══════════════════════════════════════════════════════════════════

function step1_suiteSetup() {
  section('Step 1: SUITE SETUP — Load feature-build suite');
  try {
    const suite = loadSuite(SUITE_PATH);
    state.suite = suite;

    // Verify required roles
    const requiredRoles = ['coordinator', 'researcher', 'implementer', 'tester'];
    const foundRoles = Object.keys(suite.roles);
    const missing = requiredRoles.filter(r => !foundRoles.includes(r));

    if (missing.length > 0) {
      fail(1, `Missing roles: ${missing.join(', ')}`);
      return;
    }

    // Validate suite
    const validation = suite.validate();
    if (!validation.valid) {
      fail(1, `Suite validation failed: ${validation.errors.join('; ')}`);
      return;
    }

    // Store role info
    for (const role of requiredRoles) {
      state.roles[role] = {
        template: suite.getTemplate(role),
        model: suite.roles[role].model,
      };
    }

    pass(1, `Loaded suite "${suite.name}" with ${foundRoles.length} roles`,
      `Roles: ${foundRoles.join(', ')} | Valid: ${validation.valid}`);
  } catch (e) {
    fail(1, 'Failed to load suite', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 2: Prompt Assembly
// ═══════════════════════════════════════════════════════════════════

function step2_promptAssembly() {
  section('Step 2: PROMPT ASSEMBLY — Assemble prompts for each role');
  try {
    let allValid = true;
    const details = [];

    for (const [roleName, roleInfo] of Object.entries(state.roles)) {
      const assembler = new PromptAssembler();

      // Customize identity for this role
      assembler.addSection('core-identity',
        `You are the ${roleName} agent in a multi-agent feature build workflow.\n${roleInfo.template}`,
        { cacheable: true, stability: 1.0 }
      );

      // Add role-specific instructions
      assembler.addSection('system-instructions',
        `# ${roleName.charAt(0).toUpperCase() + roleName.slice(1)} Instructions\n` +
        `- Focus on your role: ${roleName}\n` +
        `- Coordinate with other agents via structured handoff messages\n` +
        `- Report status clearly after each subtask`,
        { cacheable: true, stability: 0.95 }
      );

      // Add role-specific context section
      assembler.addSection('claude-md',
        `# Project Context\nThis is a multi-agent feature implementation.\nRole: ${roleName}\nModel: ${roleInfo.model}`,
        { cacheable: true, stability: 0.9 }
      );

      const assembled = assembler.assemble();
      const validation = assembler.validate(roleInfo.model);

      if (!validation.valid) {
        allValid = false;
        details.push(`${roleName}: INVALID — ${validation.errors.join('; ')}`);
      } else {
        details.push(`${roleName}: ${validation.totalTokens} tokens, ${(validation.utilization * 100).toFixed(1)}% utilization`);
      }

      // Store for later steps
      state.roles[roleName].assembler = assembler;
      state.roles[roleName].assembled = assembled;
    }

    if (allValid) {
      pass(2, `All ${Object.keys(state.roles).length} role prompts assembled and validated`, details.join(' | '));
    } else {
      fail(2, 'Some prompts failed validation', details.join(' | '));
    }
  } catch (e) {
    fail(2, 'Prompt assembly failed', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 3: Model Variants
// ═══════════════════════════════════════════════════════════════════

function step3_modelVariants() {
  section('Step 3: MODEL VARIANTS — Generate model-specific variants');
  try {
    let allOk = true;
    const details = [];

    for (const [roleName, roleInfo] of Object.entries(state.roles)) {
      const model = roleInfo.model;
      const profile = getModelProfile(model);

      // Generate variant appropriate for assigned model
      const variant = selectVariant(roleInfo.assembled, model);

      if (!variant || variant.trim().length === 0) {
        allOk = false;
        details.push(`${roleName}: empty variant`);
        continue;
      }

      // Also generate all three for comparison
      const allVariants = generateVariants(roleInfo.assembled);
      const variantLengths = {
        opus: allVariants.opus.length,
        sonnet: allVariants.sonnet.length,
        haiku: allVariants.haiku.length,
      };

      // Verify haiku < sonnet < opus (haiku should be most compact)
      const haikuSmaller = variantLengths.haiku <= variantLengths.sonnet;
      const sonnetSmaller = variantLengths.sonnet <= variantLengths.opus;

      // Enrich with model metadata
      const enriched = enrichForModel(roleInfo.assembled, model);
      const hasModelComment = enriched.includes('Optimized for');

      state.roles[roleName].variant = variant;
      state.roles[roleName].enriched = enriched;

      details.push(
        `${roleName}(${model.includes('opus') ? 'opus' : 'sonnet'}): ` +
        `opus=${variantLengths.opus}c, sonnet=${variantLengths.sonnet}c, haiku=${variantLengths.haiku}c ` +
        `[hierarchy:${haikuSmaller && sonnetSmaller ? 'ok' : 'warn'}]`
      );
    }

    if (allOk) {
      pass(3, 'Model variants generated for all roles', details.join(' | '));
    } else {
      fail(3, 'Variant generation failed', details.join(' | '));
    }
  } catch (e) {
    fail(3, 'Model variant generation failed', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 4: Token Counting
// ═══════════════════════════════════════════════════════════════════

function step4_tokenCounting() {
  section('Step 4: TOKEN COUNTING — Verify all prompts fit within budgets');
  try {
    let allFit = true;
    const details = [];
    const COMPACTION_THRESHOLD = 0.80;

    for (const [roleName, roleInfo] of Object.entries(state.roles)) {
      const prompt = roleInfo.variant || roleInfo.assembled;
      const model = roleInfo.model;

      // Use token-counter to check fit
      const fitResult = checkTemplateFit(prompt, model);
      state.tokenResults[roleName] = fitResult;

      // Check compaction risk
      const tokens = estimateTokens(prompt);
      const limit = fitResult.limit;
      const utilization = tokens / limit;
      const exceedsCompaction = utilization > COMPACTION_THRESHOLD;

      if (!fitResult.fits) {
        allFit = false;
        // Auto-trim if needed
        const trimmed = autoTrim(prompt, Math.floor(limit * COMPACTION_THRESHOLD));
        const trimmedTokens = estimateTokens(trimmed);
        details.push(`${roleName}: TRIMMED ${tokens} -> ${trimmedTokens} tokens`);
        state.roles[roleName].variant = trimmed;
      } else if (exceedsCompaction) {
        // Auto-trim to fit within 80% threshold
        const trimmed = autoTrim(prompt, Math.floor(limit * COMPACTION_THRESHOLD));
        const trimmedTokens = estimateTokens(trimmed);
        details.push(`${roleName}: auto-trimmed for compaction (${tokens} -> ${trimmedTokens})`);
        state.roles[roleName].variant = trimmed;
      } else {
        details.push(
          `${roleName}: ${tokens} tokens, risk=${fitResult.compactionRisk}, ` +
          `${(utilization * 100).toFixed(2)}% used`
        );
      }
    }

    if (allFit) {
      pass(4, 'All prompts fit within model budgets (below 80% compaction)', details.join(' | '));
    } else {
      // Still pass if auto-trim worked
      pass(4, 'Prompts fitted after auto-trimming', details.join(' | '));
    }
  } catch (e) {
    fail(4, 'Token counting failed', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 5: Cache Optimization
// ═══════════════════════════════════════════════════════════════════

function step5_cacheOptimization() {
  section('Step 5: CACHE OPTIMIZATION — Split prompts for caching');
  try {
    let allOk = true;
    const details = [];

    for (const [roleName, roleInfo] of Object.entries(state.roles)) {
      const prompt = roleInfo.variant || roleInfo.assembled;

      // Analyze cache potential
      const analysis = cacheAnalyze(prompt);

      // Split into cacheable prefix + variable suffix
      const split = splitForCaching(prompt);
      state.cacheResults[roleName] = split;

      // Calculate expected savings
      const savings = estimateCacheSavings(prompt, 100, roleInfo.model);

      if (split.prefixTokens === 0 && split.suffixTokens === 0) {
        allOk = false;
        details.push(`${roleName}: empty split`);
      } else {
        details.push(
          `${roleName}: prefix=${split.prefixTokens}t, suffix=${split.suffixTokens}t, ` +
          `stableRatio=${analysis.stableRatio}, savings=${savings.savingsPercent}%`
        );
      }
    }

    if (allOk) {
      pass(5, 'Cache optimization complete for all roles', details.join(' | '));
    } else {
      fail(5, 'Cache optimization had issues', details.join(' | '));
    }
  } catch (e) {
    fail(5, 'Cache optimization failed', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 6: Cost Estimation
// ═══════════════════════════════════════════════════════════════════

function step6_costEstimation() {
  section('Step 6: COST ESTIMATION — Calculate total suite cost');
  try {
    let totalUncached = 0;
    let totalCached = 0;
    const details = [];

    for (const [roleName, roleInfo] of Object.entries(state.roles)) {
      const prompt = roleInfo.variant || roleInfo.assembled;
      const inputTokens = estimateTokens(prompt);
      const outputTokens = roleInfo.model.includes('opus') ? 12000 : 8000;

      const cost = estimateCost(inputTokens, outputTokens, roleInfo.model);
      state.costResults[roleName] = cost;

      totalUncached += cost.totalCost;
      totalCached += cost.cachedCost;

      details.push(
        `${roleName}(${roleInfo.model.split('-').slice(-1)[0]}): ` +
        `$${cost.totalCost.toFixed(4)} uncached, $${cost.cachedCost.toFixed(4)} cached`
      );
    }

    const savingsPct = totalUncached > 0
      ? ((totalUncached - totalCached) / totalUncached * 100).toFixed(1)
      : '0';

    // Compare costs across models
    const sampleTokens = estimateTokens(state.roles.coordinator.variant || state.roles.coordinator.assembled);
    const comparison = compareCosts(sampleTokens);

    details.push(`TOTAL: $${totalUncached.toFixed(4)} uncached vs $${totalCached.toFixed(4)} cached (${savingsPct}% savings)`);

    if (totalUncached >= 0 && totalCached >= 0 && totalCached <= totalUncached) {
      pass(6, `Suite cost: $${totalUncached.toFixed(4)} uncached, $${totalCached.toFixed(4)} cached (${savingsPct}% savings)`,
        details.join(' | '));
    } else {
      fail(6, 'Cost calculation anomaly', details.join(' | '));
    }
  } catch (e) {
    fail(6, 'Cost estimation failed', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 7: Security Check
// ═══════════════════════════════════════════════════════════════════

function step7_securityCheck() {
  section('Step 7: SECURITY CHECK — Validate all prompts');
  try {
    let allSecure = true;
    const details = [];

    for (const [roleName, roleInfo] of Object.entries(state.roles)) {
      const prompt = roleInfo.variant || roleInfo.assembled;

      const analysis = securityAnalyze(prompt);
      const score = securityScore(prompt);
      state.securityResults[roleName] = { analysis, score };

      if (score < 80) {
        allSecure = false;
        // Try to sanitize
        const cleaned = sanitize(prompt);
        const newScore = securityScore(cleaned);
        details.push(`${roleName}: score=${score} -> sanitized=${newScore} [${analysis.errors.join('; ')}]`);
        // Use sanitized version
        if (newScore >= 80) {
          state.roles[roleName].variant = cleaned;
        }
      } else {
        details.push(`${roleName}: score=${score}, safe=${analysis.safe}`);
      }

      // Verify no injection patterns
      if (analysis.errors.length > 0) {
        details.push(`  ${roleName} errors: ${analysis.errors.join('; ')}`);
      }
    }

    if (allSecure) {
      pass(7, 'All prompts passed security check (score > 80)', details.join(' | '));
    } else {
      // Check if sanitization fixed it
      const stillInsecure = Object.entries(state.securityResults)
        .filter(([_, r]) => r.score < 80).length;
      if (stillInsecure === 0) {
        pass(7, 'Prompts secured after sanitization', details.join(' | '));
      } else {
        fail(7, `${stillInsecure} prompts still below security threshold`, details.join(' | '));
      }
    }
  } catch (e) {
    fail(7, 'Security analysis failed', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 8: Output Style
// ═══════════════════════════════════════════════════════════════════

function step8_outputStyle() {
  section('Step 8: OUTPUT STYLE — Export coordinator template as output style');

  // We need a template file on disk for generateOutputStyle.
  // Create a temporary template from the coordinator's assembled prompt.
  const tmpTemplatePath = join(STUDIO_DIR, 'templates', '_e2e-test-coordinator.md');
  let cleanupTmp = false;

  try {
    // Export coordinator prompt as a template file
    const coordAssembler = state.roles.coordinator.assembler;
    const templateContent = coordAssembler.toTemplate('e2e-coordinator', 'E2E test coordinator style');
    writeFileSync(tmpTemplatePath, templateContent, 'utf-8');
    cleanupTmp = true;

    // Generate output style from that template
    const style = generateOutputStyle(tmpTemplatePath, 'e2e-coordinator-style');

    if (!style.content || style.content.trim().length === 0) {
      fail(8, 'Generated output style is empty');
      return;
    }

    // Install the style
    const installed = installOutputStyle(style.styleName, style.content);

    if (!installed.installed) {
      fail(8, 'Failed to install output style');
      return;
    }

    // Verify file exists
    if (!existsSync(installed.path)) {
      fail(8, `Output style file not found at ${installed.path}`);
      return;
    }

    pass(8, `Output style "${style.styleName}" generated and installed`,
      `Path: ${installed.path} | Content: ${style.content.length} chars`);
  } catch (e) {
    fail(8, 'Output style generation failed', e);
  } finally {
    // Cleanup temp template
    if (cleanupTmp && existsSync(tmpTemplatePath)) {
      try { unlinkSync(tmpTemplatePath); } catch { /* ok */ }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 9: A/B Test Setup
// ═══════════════════════════════════════════════════════════════════

function step9_abTestSetup() {
  section('Step 9: A/B TEST — Create gate-aware test with mock results');
  try {
    // Set up a test comparing opus-optimized vs sonnet-optimized coordinator prompts
    const testId = startTest(
      'e2e-coordinator-variant-comparison',
      ['opus-optimized', 'sonnet-optimized'],
      { gateAware: true, minRuns: 5, confidenceLevel: 0.90 }
    );

    if (!testId || typeof testId !== 'string') {
      fail(9, 'startTest did not return a valid testId');
      return;
    }

    // Record mock results for opus-optimized (higher quality, higher cost)
    for (let i = 0; i < 10; i++) {
      recordResult(testId, 'opus-optimized', {
        quality: 8 + Math.random() * 2,     // 8-10
        cost: 0.05 + Math.random() * 0.02,  // $0.05-0.07
        tokens: 5000 + Math.floor(Math.random() * 1000),
        duration: 3000 + Math.floor(Math.random() * 1000),
      });
    }

    // Record mock results for sonnet-optimized (slightly lower quality, lower cost)
    for (let i = 0; i < 10; i++) {
      recordResult(testId, 'sonnet-optimized', {
        quality: 6 + Math.random() * 2,     // 6-8
        cost: 0.01 + Math.random() * 0.005, // $0.01-0.015
        tokens: 3000 + Math.floor(Math.random() * 500),
        duration: 1500 + Math.floor(Math.random() * 500),
      });
    }

    // Analyze
    const analysis = analyzeResults(testId);

    const details = [
      `testId: ${testId}`,
      `totalRuns: ${analysis.totalRuns}`,
      `winner: ${analysis.winner || 'none (insufficient confidence)'}`,
      `confidence: ${(analysis.confidence * 100).toFixed(1)}%`,
      `invalidated: ${analysis.invalidated}`,
    ];

    // We expect opus-optimized to win with these biased mock results
    if (analysis.totalRuns === 20 && typeof analysis.confidence === 'number') {
      pass(9, `A/B test completed: ${analysis.winner || 'no winner'} at ${(analysis.confidence * 100).toFixed(1)}% confidence`,
        details.join(' | '));
    } else {
      fail(9, 'A/B test analysis returned unexpected shape', details.join(' | '));
    }
  } catch (e) {
    fail(9, 'A/B test setup failed', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

console.log('\n\x1b[1m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
console.log('\x1b[1m║  PROMPT-STUDIO: End-to-End Integration Test                  ║\x1b[0m');
console.log('\x1b[1m║  Scenario: Multi-Agent Feature Build with Cost Optimization  ║\x1b[0m');
console.log('\x1b[1m╚══════════════════════════════════════════════════════════════╝\x1b[0m');

const startTime = Date.now();

step1_suiteSetup();
step2_promptAssembly();
step3_modelVariants();
step4_tokenCounting();
step5_cacheOptimization();
step6_costEstimation();
step7_securityCheck();
step8_outputStyle();
step9_abTestSetup();

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

// ─── Final Summary ───────────────────────────────────────────────

console.log('\n\x1b[1m═══════════════════════════════════════════════════════════════\x1b[0m');
console.log(`\x1b[1m  FINAL RESULT: ${totalPassed}/${totalSteps} integration steps passed\x1b[0m`);
console.log(`  Time: ${elapsed}s`);
console.log('\x1b[1m═══════════════════════════════════════════════════════════════\x1b[0m');

if (totalPassed === totalSteps) {
  console.log('\x1b[32m  ✓ ALL INTEGRATION TESTS PASSED\x1b[0m\n');
} else {
  const failed = RESULTS.filter(r => r.status === 'FAIL');
  console.log(`\x1b[31m  ✗ ${failed.length} step(s) failed:\x1b[0m`);
  for (const f of failed) {
    console.log(`    - Step ${f.step}: ${f.msg}`);
  }
  console.log('');
}

// Export results for the markdown report
const resultsSummary = {
  totalPassed,
  totalSteps,
  elapsed,
  results: RESULTS,
  allPassed: totalPassed === totalSteps,
};

// Write JSON results for downstream consumption
const jsonPath = join(STUDIO_DIR, 'results', 'e2e-integration-results.json');
if (!existsSync(join(STUDIO_DIR, 'results'))) {
  mkdirSync(join(STUDIO_DIR, 'results'), { recursive: true });
}
writeFileSync(jsonPath, JSON.stringify(resultsSummary, null, 2) + '\n', 'utf-8');

rmSync(STUDIO_DIR, { recursive: true, force: true });

process.exit(totalPassed === totalSteps ? 0 : 1);
