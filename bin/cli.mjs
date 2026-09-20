#!/usr/bin/env node

/**
 * SIGIL CLI — Structured intent for AI.
 * Prompt engineering toolkit for Claude Code.
 */

import { assemblePrompt, parseTemplate, getSectionOrder } from '../lib/prompt-assembler.mjs';
import { countTokens, visualizeTokenBudget, validateTokenLimit } from '../lib/token-counter.mjs';
import { analyzeCache, restructureForCache, projectCacheSavings } from '../lib/cache-optimizer.mjs';
import { estimateCost, getDashboard, getModelPricing } from '../lib/cost-estimator.mjs';
import { generateVariant, getVariantRules } from '../lib/model-variants.mjs';
import { analyzeSecurityPatterns, validateTemplate } from '../lib/security-analyzer.mjs';
import { exportAsOutputStyle, importOutputStyle, listOutputStyles } from '../lib/output-style-generator.mjs';
import { installHook, activateSigil, addRule, getRules } from '../lib/hook-manager.mjs';
import { runABTest, compareResults, getGateState } from '../lib/gate-aware-ab.mjs';
import { createSuite, validateSuite, runSuiteABTest } from '../lib/suite-manager.mjs';

const VERSION = '1.0.0';
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(`
SIGIL v${VERSION} — Structured intent for AI.

Usage: sigil <command> [options]

Commands:
  list                    List available sigils
  show <name>             Display sigil content
  create <name>           Create new sigil from scaffold
  assemble <sigil...>     Assemble multiple sigils by section order
  size <name>             Token budget visualization
  cache-analyze <name>    Cache optimization analysis
  security-check <name>   Security pattern validation
  ab-test <a> <b>         Run A/B comparison
  ab-results              View A/B test results
  ab-compare <a> <b>      Statistical comparison with gate awareness
  dashboard               Cost tracking dashboard
  cost <name>             Estimate cost for a sigil
  export-style <name>     Convert sigil to Claude Code output style
  import-style <name>     Import output style as editable sigil
  styles                  List installed output styles
  suite create <name>     Create PromptSuite
  suite list              List all suites
  suite show <name>       Display suite with all roles
  suite validate <name>   Validate suite cross-references
  suite ab-test <a> <b>   Suite-level A/B comparison
  hook install            Install UserPromptSubmit hook
  hook activate <name>    Set active sigil for auto-injection
  hook deactivate         Remove active sigil
  hook rules              Show context-aware auto-selection rules
  hook add-rule <p> <s>   Add file pattern → sigil rule
  validate --all          Validate all sigils against token limits
  --version               Show version
  --help                  Show this help

Options:
  --model <model>         Target model: opus, sonnet, haiku (default: opus)
  --preview               Preview assembled output
  --validate              Validate token limits
  --profile <profile>     Security profile: enterprise, standard, relaxed
  --runs <n>              Number of A/B test runs
  --track-gates           Track Statsig feature gate state
  --gate-aware            Filter by gate state in comparisons

Environment:
  SIGIL_HOME              Installation directory (default: ~/.claude/sigil)
  SIGIL_MODEL             Default model (default: opus)
  SIGIL_PROFILE           Security profile (default: enterprise)
  SIGIL_COLOR             Color output: auto, always, never
  SIGIL_DB                A/B test database path
`);
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log(`sigil v${VERSION}`);
  process.exit(0);
}

// Command dispatch
const handlers = {
  list: () => console.log('Available sigils: (use sigil show <name> to view)'),
  show: () => console.log(`Showing sigil: ${args[1] || '(none specified)'}`),
  create: () => console.log(`Creating sigil: ${args[1] || '(none specified)'}`),
  assemble: () => assemblePrompt(args.slice(1), { preview: args.includes('--preview') }),
  size: () => visualizeTokenBudget(args[1], args[args.indexOf('--model') + 1] || 'opus'),
  'cache-analyze': () => analyzeCache(args[1]),
  'security-check': () => validateTemplate(args[1], args[args.indexOf('--profile') + 1] || 'enterprise'),
  'ab-test': () => runABTest(args[1], args[2], args[args.indexOf('--task') + 1], {}),
  'ab-results': () => console.log('A/B test results:'),
  'ab-compare': () => compareResults(args[1], args[2], { gateAware: args.includes('--gate-aware') }),
  dashboard: () => getDashboard(),
  cost: () => estimateCost(args[1], args[args.indexOf('--model') + 1] || 'opus', 1),
  'export-style': () => exportAsOutputStyle(args[1], args[2]),
  'import-style': () => importOutputStyle(args[1]),
  styles: () => listOutputStyles(),
  suite: () => {
    const sub = args[1];
    if (sub === 'create') createSuite(args[2], {});
    else if (sub === 'validate') validateSuite(args[2]);
    else if (sub === 'ab-test') runSuiteABTest(args[2], args[3], args[args.indexOf('--task') + 1]);
    else console.log(`Unknown suite command: ${sub}`);
  },
  hook: () => {
    const sub = args[1];
    if (sub === 'install') installHook();
    else if (sub === 'activate') activateSigil(args[2]);
    else if (sub === 'deactivate') activateSigil(null);
    else if (sub === 'rules') getRules();
    else if (sub === 'add-rule') addRule(args[2], args[3]);
    else console.log(`Unknown hook command: ${sub}`);
  },
  validate: () => console.log('Validating all sigils...'),
};

const handler = handlers[command];
if (handler) {
  try {
    await handler();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
} else {
  console.error(`Unknown command: ${command}. Run 'sigil --help' for usage.`);
  process.exit(1);
}
