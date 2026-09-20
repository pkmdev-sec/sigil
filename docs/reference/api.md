# API Reference

Complete reference for all Sigil modules and their exported functions.

---

## prompt-assembler.mjs

Core module for parsing and assembling sigil templates into complete system prompts.

### `assemblePrompt(sigils, options)`

Assembles multiple sigils into ordered sections following Claude Code's internal structure.

**Parameters:**
- `sigils` (Array): Array of sigil objects (parsed templates)
- `options` (Object):
  - `sectionOrder` (Array): Custom section ordering (default: canonical order)
  - `includeMetadata` (Boolean): Include frontmatter metadata in output (default: false)
  - `optimizeCache` (Boolean): Apply cache optimization (default: true)

**Returns:** Object with structure:
```javascript
{
  sections: {
    'identity': '...',
    'system-instructions': '...',
    // ... other sections
  },
  metadata: {
    totalTokens: 4532,
    cacheableTokens: 3890,
    sigils: ['security-audit', 'code-review']
  }
}
```

**Example:**
```javascript
import { assemblePrompt } from './prompt-assembler.mjs';

const assembled = assemblePrompt(
  [securitySigil, reviewSigil],
  { optimizeCache: true }
);
```

### `parseTemplate(filepath)`

Parses a sigil markdown file with YAML frontmatter.

**Parameters:**
- `filepath` (String): Absolute path to sigil template file

**Returns:** Object with structure:
```javascript
{
  frontmatter: {
    name: 'security-audit',
    target_section: 'system-instructions',
    cache_strategy: 'prefix-stable',
    model_variants: true,
    token_budget: 1500
  },
  content: '# Security Analysis Instructions\n...',
  filepath: '/path/to/template.md'
}
```

**Throws:** Error if file doesn't exist or frontmatter is invalid

**Example:**
```javascript
import { parseTemplate } from './prompt-assembler.mjs';

const sigil = parseTemplate('/path/to/sigil/templates/security-audit.md');
console.log(sigil.frontmatter.name); // 'security-audit'
```

### `getSectionOrder()`

Returns the canonical section ordering used by Claude Code.

**Returns:** Array of section names in order:
```javascript
[
  'identity',
  'system-instructions',
  'tool-definitions',
  'permission-mode',
  'claude-md-injection',
  'environment-metadata',
  'output-style',
  'system-reminders',
  'examples',
  'anti-patterns'
]
```

**Example:**
```javascript
import { getSectionOrder } from './prompt-assembler.mjs';

const order = getSectionOrder();
console.log(order[0]); // 'identity'
```

---

## token-counter.mjs

Accurate token counting and budget visualization using BPE tokenization.

### `countTokens(text, model)`

Returns BPE-accurate token count for given text and model.

**Parameters:**
- `text` (String): Text to count tokens for
- `model` (String): Model name ('opus', 'sonnet', 'haiku', or full model ID)

**Returns:** Integer token count

**Example:**
```javascript
import { countTokens } from './token-counter.mjs';

const tokens = countTokens('Analyze this code for security issues', 'sonnet');
console.log(tokens); // 8
```

### `visualizeTokenBudget(sigil, model)`

Generates ASCII token budget visualization bar.

**Parameters:**
- `sigil` (Object): Parsed sigil object
- `model` (String): Target model name

**Returns:** String with ASCII visualization:
```
Token Budget: 1,234 / 200,000 (0.6%)
[████░░░░░░░░░░░░░░░░░░░░░░░░]
```

**Example:**
```javascript
import { visualizeTokenBudget } from './token-counter.mjs';

const sigil = parseTemplate('./templates/security-audit.md');
console.log(visualizeTokenBudget(sigil, 'opus'));
```

### `validateTokenLimit(sigils, model)`

Checks if combined sigils fit within model's context window.

**Parameters:**
- `sigils` (Array): Array of parsed sigil objects
- `model` (String): Target model name

**Returns:** Object:
```javascript
{
  valid: true,
  totalTokens: 45000,
  limit: 200000,
  utilizationPercent: 22.5,
  exceededBy: 0
}
```

**Example:**
```javascript
import { validateTokenLimit } from './token-counter.mjs';

const result = validateTokenLimit([sigil1, sigil2, sigil3], 'sonnet');
if (!result.valid) {
  console.error(`Exceeds limit by ${result.exceededBy} tokens`);
}
```

---

## cache-optimizer.mjs

Prompt cache analysis and optimization for cost reduction.

### `analyzeCache(sigil)`

Analyzes caching efficiency for a sigil.

**Parameters:**
- `sigil` (Object): Parsed sigil object

**Returns:** Object:
```javascript
{
  staticContent: {
    tokens: 3480,
    percent: 87
  },
  dynamicContent: {
    tokens: 520,
    percent: 13
  },
  currentStrategy: 'prefix-stable',
  recommendedStrategy: 'prefix-stable',
  cacheBreakpoint: 3480,
  optimal: true
}
```

### `restructureForCache(sigil)`

Rewrites sigil to maximize cacheable prefix.

**Parameters:**
- `sigil` (Object): Parsed sigil object

**Returns:** Restructured sigil object with optimized content ordering

**Example:**
```javascript
import { restructureForCache } from './cache-optimizer.mjs';

const optimized = restructureForCache(originalSigil);
// Static content moved to beginning, dynamic to end
```

### `projectCacheSavings(sigil, model, requestsPerMonth)`

Projects cost savings from caching over time.

**Parameters:**
- `sigil` (Object): Parsed sigil object
- `model` (String): Target model name
- `requestsPerMonth` (Integer): Expected monthly request volume

**Returns:** Object:
```javascript
{
  withoutCache: {
    monthlyCost: 12.50,
    perRequest: 0.125
  },
  withCache: {
    monthlyCost: 2.75,
    perRequest: 0.0275,
    cacheWriteCost: 0.50,
    cacheReadCost: 2.25
  },
  savings: {
    amount: 9.75,
    percent: 78
  }
}
```

---

## cost-estimator.mjs

Cost estimation and dashboard for multi-model comparison.

### `estimateCost(sigil, model, runs)`

Estimates per-request cost for a sigil.

**Parameters:**
- `sigil` (Object): Parsed sigil object
- `model` (String): Target model name
- `runs` (Integer): Number of requests (default: 1)

**Returns:** Object:
```javascript
{
  inputCost: 0.012,
  outputCost: 0.045,
  totalCost: 0.057,
  cacheSavings: 0.009,
  effectiveCost: 0.048,
  tokenBreakdown: {
    input: 4000,
    output: 1500,
    cached: 3000
  }
}
```

### `getDashboard()`

Returns comprehensive cost dashboard data.

**Returns:** Object with cost projections for all sigils across all models:
```javascript
{
  sigils: ['security-audit', 'code-review', ...],
  models: ['opus', 'sonnet', 'haiku'],
  costs: {
    'security-audit': {
      opus: { perRequest: 0.15, per1000: 150.00 },
      sonnet: { perRequest: 0.03, per1000: 30.00 },
      haiku: { perRequest: 0.008, per1000: 8.00 }
    },
    // ... other sigils
  },
  recommendations: {
    'security-audit': 'sonnet',
    'code-review': 'haiku'
  }
}
```

### `getModelPricing(model)`

Returns pricing table for a model.

**Parameters:**
- `model` (String): Model name

**Returns:** Object:
```javascript
{
  input: 15.00,        // per 1M tokens
  output: 75.00,       // per 1M tokens
  cacheWrite: 18.75,   // per 1M tokens
  cacheRead: 1.50      // per 1M tokens
}
```

---

## model-variants.mjs

Automatic generation of model-specific prompt variants.

### `generateVariant(sigil, model)`

Auto-generates model-specific variant of a sigil.

**Parameters:**
- `sigil` (Object): Parsed sigil object
- `model` (String): Target model name

**Returns:** Modified sigil object optimized for target model:
```javascript
{
  ...originalSigil,
  frontmatter: {
    ...originalSigil.frontmatter,
    model_variant: 'haiku',
    thinking_mode: 'concise'
  },
  content: '...' // Adapted content
}
```

**Example:**
```javascript
import { generateVariant } from './model-variants.mjs';

const haikuVersion = generateVariant(opusSigil, 'haiku');
// Simplified instructions, removed examples, concise language
```

### `getVariantRules(model)`

Returns model-specific optimization rules.

**Parameters:**
- `model` (String): Model name

**Returns:** Object:
```javascript
{
  strategy: 'simplify',
  maxTokens: 2000,
  thinkingHint: 'concise',
  examplesLimit: 2,
  removeAdvancedPatterns: true
}
```

---

## security-analyzer.mjs

Security pattern detection and validation for sigil templates.

### `analyzeSecurityPatterns(sigil, profile)`

Scans sigil for security anti-patterns and vulnerabilities.

**Parameters:**
- `sigil` (Object): Parsed sigil object
- `profile` (String): Security profile ('strict', 'standard', 'permissive')

**Returns:** Object:
```javascript
{
  findings: [
    {
      pattern: 'prompt-injection',
      severity: 'high',
      location: 'line 23',
      description: 'Unvalidated user input in system instruction',
      recommendation: 'Add input sanitization'
    }
  ],
  score: 85,
  passed: true
}
```

### `getPatternDatabase()`

Returns the full security pattern database.

**Returns:** Array of pattern objects:
```javascript
[
  {
    id: 'prompt-injection',
    pattern: /ignore previous instructions/i,
    severity: 'critical',
    category: 'injection'
  },
  // ... more patterns
]
```

### `validateTemplate(filepath, profile)`

CLI-friendly validation with formatted output.

**Parameters:**
- `filepath` (String): Path to sigil template
- `profile` (String): Security profile

**Returns:** Object with formatted validation results for CLI display

---

## output-style-generator.mjs

Convert sigils to/from Claude Code output styles.

### `exportAsOutputStyle(sigil, styleName)`

Converts sigil to Claude Code output style format.

**Parameters:**
- `sigil` (Object): Parsed sigil object
- `styleName` (String): Name for the output style

**Returns:** String with output style JSON ready for installation

**Example:**
```javascript
import { exportAsOutputStyle } from './output-style-generator.mjs';

const styleJson = exportAsOutputStyle(sigil, 'security-focused');
// Write to ~/.claude/output-styles/security-focused.json
```

### `importOutputStyle(styleName)`

Imports existing output style as a sigil.

**Parameters:**
- `styleName` (String): Name of installed output style

**Returns:** Parsed sigil object

### `listOutputStyles()`

Lists all installed Claude Code output styles.

**Returns:** Array of style names:
```javascript
['concise', 'detailed', 'security-focused', 'code-only']
```

---

## hook-manager.mjs

Manage Claude Code hooks for automatic sigil injection.

### `installHook()`

Installs UserPromptSubmit hook in settings.json.

**Returns:** Boolean indicating success

**Example:**
```javascript
import { installHook } from './hook-manager.mjs';

installHook();
// Adds Sigil hook to ~/.claude/settings.json
```

### `activateSigil(name)`

Sets the active sigil for auto-injection on all prompts.

**Parameters:**
- `name` (String): Sigil name to activate

**Example:**
```javascript
import { activateSigil } from './hook-manager.mjs';

activateSigil('security-audit');
// All subsequent prompts include security-audit sigil
```

### `addRule(pattern, sigilName)`

Adds context-aware file pattern rule.

**Parameters:**
- `pattern` (String): Glob pattern for file matching
- `sigilName` (String): Sigil to activate for matching files

**Example:**
```javascript
import { addRule } from './hook-manager.mjs';

addRule('**/*.{js,ts}', 'code-review');
addRule('**/test/**', 'test-focused');
// Auto-activates appropriate sigil based on files in context
```

### `getRules()`

Lists all active context-aware rules.

**Returns:** Array of rule objects:
```javascript
[
  { pattern: '**/*.{js,ts}', sigil: 'code-review', enabled: true },
  { pattern: '**/test/**', sigil: 'test-focused', enabled: true }
]
```

---

## gate-aware-ab.mjs

A/B testing with Statsig feature gate awareness.

### `runABTest(sigilA, sigilB, task, options)`

Runs gate-aware A/B test comparing two sigils.

**Parameters:**
- `sigilA` (String): First sigil name
- `sigilB` (String): Second sigil name
- `task` (String): Task to perform
- `options` (Object):
  - `runs` (Integer): Number of runs per sigil (default: 3)
  - `captureGates` (Boolean): Capture Statsig gate state (default: true)
  - `model` (String): Model to use (default: 'sonnet')

**Returns:** Object:
```javascript
{
  sigilA: {
    name: 'security-audit',
    avgTokens: 4532,
    avgLatency: 3.2,
    avgCost: 0.045,
    successRate: 100
  },
  sigilB: {
    name: 'security-audit-v2',
    avgTokens: 3890,
    avgLatency: 2.8,
    avgCost: 0.038,
    successRate: 100
  },
  comparison: {
    tokenDelta: -642,
    latencyDelta: -0.4,
    costDelta: -0.007,
    recommendation: 'sigilB'
  },
  gateState: {
    'enhanced-security': true,
    'code-analysis-v2': false
  }
}
```

### `compareResults(sigilA, sigilB, options)`

Statistical comparison of historical A/B test results.

**Parameters:**
- `sigilA` (String): First sigil name
- `sigilB` (String): Second sigil name
- `options` (Object):
  - `metric` (String): Primary metric to compare ('cost', 'latency', 'tokens')
  - `minRuns` (Integer): Minimum runs required for significance

**Returns:** Object with statistical analysis including p-values and confidence intervals

### `getGateState()`

Captures current Statsig feature gate state.

**Returns:** Object with all active feature gates and their values

---

## suite-manager.mjs

Create and manage PromptSuites for multi-agent workflows.

### `createSuite(name, roles)`

Creates a new PromptSuite.

**Parameters:**
- `name` (String): Suite name
- `roles` (Array): Array of role configurations

**Returns:** Path to created suite YAML file

**Example:**
```javascript
import { createSuite } from './suite-manager.mjs';

createSuite('my-workflow', [
  { name: 'scanner', model: 'haiku', sigils: ['pattern-detect'] },
  { name: 'analyzer', model: 'sonnet', sigils: ['deep-analysis'] }
]);
```

### `validateSuite(name)`

Validates PromptSuite configuration.

**Parameters:**
- `name` (String): Suite name

**Returns:** Object:
```javascript
{
  valid: true,
  errors: [],
  warnings: [
    'Role "scanner" token budget exceeds Haiku limit'
  ],
  tokenBudgets: {
    scanner: 1200,
    analyzer: 4500
  }
}
```

### `runSuiteABTest(suiteA, suiteB, task)`

Runs suite-level A/B test.

**Parameters:**
- `suiteA` (String): First suite name
- `suiteB` (String): Second suite name
- `task` (String): Task to perform

**Returns:** Comparison object with per-role and aggregate metrics

---

## Usage Patterns

### Basic Sigil Assembly

```javascript
import { parseTemplate, assemblePrompt } from './prompt-assembler.mjs';
import { countTokens } from './token-counter.mjs';

const sigil = parseTemplate('./templates/security-audit.md');
const assembled = assemblePrompt([sigil]);
const tokens = countTokens(assembled.sections['system-instructions'], 'sonnet');

console.log(`Assembled prompt: ${tokens} tokens`);
```

### Cost Optimization Workflow

```javascript
import { analyzeCache, projectCacheSavings } from './cache-optimizer.mjs';
import { estimateCost } from './cost-estimator.mjs';

const analysis = analyzeCache(sigil);
const savings = projectCacheSavings(sigil, 'sonnet', 1000);
const cost = estimateCost(sigil, 'sonnet', 1);

console.log(`Monthly savings: $${savings.savings.amount}`);
```

### Automated Hook Installation

```javascript
import { installHook, addRule, activateSigil } from './hook-manager.mjs';

installHook();
addRule('**/*.js', 'code-review');
addRule('**/auth/**', 'security-audit');
activateSigil('default-style');
```
