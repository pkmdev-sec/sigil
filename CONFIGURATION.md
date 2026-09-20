# Sigil Configuration Guide

This document describes all configurable options across Sigil modules.

## Table of Contents

- [PromptAssembler Configuration](#promptassembler-configuration)
- [Model Context Limits](#model-context-limits)
- [Token Counter Configuration](#token-counter-configuration)
- [Cache Optimizer Settings](#cache-optimizer-settings)
- [Cost Estimator Model Pricing](#cost-estimator-model-pricing)
- [Security Analyzer Patterns](#security-analyzer-patterns)
- [A/B Testing Options](#ab-testing-options)
- [Suite Manager Configuration](#suite-manager-configuration)
- [Hook Manager Configuration](#hook-manager-configuration)
- [Output Style Paths](#output-style-paths)

---

## PromptAssembler Configuration

### Section Ordering

The PromptAssembler uses a predefined 10-section structure matching Claude Code's internal prompt assembly:

```javascript
const SECTION_ORDER = [
  'core-identity',         // Priority: 0
  'system-instructions',   // Priority: 1
  'tool-definitions',      // Priority: 2
  'permission-mode',       // Priority: 3
  'claude-md',             // Priority: 4
  'environment',           // Priority: 5
  'output-style',          // Priority: 6
  'system-reminders',      // Priority: 7
  'few-shot-examples',     // Priority: 8
  'anti-pattern-rules',    // Priority: 9
];
```

**Customization:**
```javascript
// Override priority for custom ordering
prompt.setPriority('task', 5);

// Or reorder multiple sections at once
prompt.reorder(['core-identity', 'task', 'system-instructions', 'constraints']);
```

### Stability Levels

Stability scores (0.0 - 1.0) determine caching potential:

```javascript
const STABILITY = {
  'core-identity': 1.0,        // Never changes
  'system-instructions': 1.0,   // Never changes
  'tool-definitions': 1.0,      // Never changes
  'permission-mode': 0.95,      // Rarely changes
  'claude-md': 0.95,            // Rarely changes
  'environment': 0.5,           // Changes per session
  'output-style': 0.9,          // Rarely changes
  'system-reminders': 0.3,      // Changes frequently
  'few-shot-examples': 0.8,     // Occasionally changes
  'anti-pattern-rules': 1.0,    // Never changes
};
```

**Usage:**
- Sections with stability ≥ 0.8 are marked as cacheable by default
- Custom sections default to 0.5 stability
- Override with `addSection(name, content, { stability: 0.9 })`

---

## Model Context Limits

### Default Limits

```javascript
const MODEL_CONTEXTS = {
  'claude-opus-4': 200000,
  'claude-opus-4-20250514': 200000,
  'claude-sonnet-4': 200000,
  'claude-sonnet-4-20250514': 200000,
  'claude-sonnet-4-5': 200000,
  'claude-haiku-3.5': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-opus-4-fast': 200000,
};
```

### Token Counter Model Limits

```javascript
const MODEL_LIMITS = {
  'claude-opus-4': {
    limit: 200000,
    warnAt: 160000,      // 80% threshold
    criticalAt: 180000   // 90% threshold
  },
  'claude-sonnet-4': {
    limit: 200000,
    warnAt: 160000,
    criticalAt: 180000
  },
  'claude-haiku-3.5': {
    limit: 200000,
    warnAt: 160000,
    criticalAt: 180000
  },
  'claude-opus-4-fast': {
    limit: 200000,
    warnAt: 160000,
    criticalAt: 180000
  },
  'claude-sonnet-4-5': {
    limit: 200000,
    warnAt: 160000,
    criticalAt: 180000
  },
  'claude-opus-4-6': {
    limit: 1000000,      // 1M context for Opus 4.6
    warnAt: 800000,
    criticalAt: 900000
  },
};
```

### System Prompt Baseline

```javascript
const SYSTEM_PROMPT_BASELINE = 4500;  // Base Claude Code system prompt tokens
const CLAUDE_MD_AVERAGE = 800;         // Average CLAUDE.md size
```

**Environment Variable Override:**
```bash
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=85  # Default: 80%
```

---

## Token Counter Configuration

### Warning Thresholds

```javascript
const WARNING_THRESHOLD = 0.80;    // 80% of context limit
const CRITICAL_THRESHOLD = 0.90;   // 90% of context limit
const DEFAULT_COMPACTION_PCT = 80; // Auto-compaction trigger
```

### Token Estimation

Uses hybrid character + word-based estimation:
- **Character estimate:** chars / 4.0
- **Word estimate:** words × 1.3
- **Final:** Average of both

**Override example:**
```javascript
import { estimateTokens } from './lib/token-counter.mjs';

// Estimate any text
const tokens = estimateTokens("Your prompt text here");
```

---

## Cache Optimizer Settings

### Minimum Cache Requirements

```javascript
const MIN_CACHE_TOKENS = 1024;      // Anthropic's minimum for caching
const CACHE_TTL_SECONDS = 300;      // 5 minutes (Anthropic default)
```

### Cache Pricing (per million tokens)

```javascript
const CACHE_PRICING = {
  'claude-opus-4': {
    input: 15,
    output: 75,
    cacheWrite: 18.75,  // 25% surcharge on first write
    cacheRead: 1.50     // 90% cheaper than fresh input
  },
  'claude-sonnet-4': {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.30
  },
  'claude-sonnet-4-5': {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.30
  },
  'claude-haiku-3.5': {
    input: 0.25,
    output: 1.25,
    cacheWrite: 0.30,
    cacheRead: 0.025
  },
  'claude-opus-4-fast': {
    input: 30,
    output: 150,
    cacheWrite: 37.50,
    cacheRead: 3.00
  },
};
```

### Content Classification Patterns

Used to identify stable vs variable content:

```javascript
const CONTENT_PATTERNS = {
  systemInstruction: { stability: 1.0 },
  toolDefinition: { stability: 1.0 },
  claudeMd: { stability: 0.95 },
  environment: { stability: 0.5 },
  userMessage: { stability: 0.0 },
  outputStyle: { stability: 0.9 },
  fewShot: { stability: 0.8 },
  antiPattern: { stability: 1.0 },
};
```

---

## Cost Estimator Model Pricing

### Per Million Token Pricing

```javascript
const PRICING = {
  'claude-opus-4': {
    input: 15,
    output: 75,
    cachedInput: 1.50,
  },
  'claude-sonnet-4': {
    input: 3,
    output: 15,
    cachedInput: 0.30,
  },
  'claude-haiku-3.5': {
    input: 0.25,
    output: 4,
    cachedInput: 0.08,
  },
  'claude-opus-4-fast': {
    input: 30,
    output: 150,
    cachedInput: 3.00,
  },
  'claude-sonnet-4-5': {
    input: 3,
    output: 15,
    cachedInput: 0.30,
  },
};
```

### Results Directory

```javascript
const RESULTS_DIR = join(homedir(), '.claude', 'prompt-studio', 'results');
```

Cost tracking data is stored in `cost-tracking.jsonl` (JSON Lines format).

---

## Security Analyzer Patterns

### Built-in Pattern Categories

```javascript
const DEFAULT_PATTERNS = {
  systemOverride: {
    severity: "error",
    weight: 30,
    // Patterns: "ignore previous instructions", "disregard instructions", etc.
  },
  rolePlayInjection: {
    severity: "warning",
    weight: 20,
    // Patterns: "you are now", "pretend to be", etc.
  },
  hiddenInjection: {
    severity: "error",
    weight: 25,
    // Patterns: <system>, <|im_start|>, [INST], etc.
  },
  encodedContent: {
    severity: "warning",
    weight: 15,
    // Patterns: Base64, hex encoding, URL encoding
  },
  urgencyManipulation: {
    severity: "info",
    weight: 5,
    // Patterns: URGENT, CRITICAL, excessive caps/exclamation
  },
  unicodeHomoglyphs: {
    severity: "error",
    weight: 25,
    // Patterns: Cyrillic lookalikes, zero-width chars, RTL override
  },
};
```

### Customization

```javascript
import { addPattern, removePattern, resetPatterns } from './lib/security-analyzer.mjs';

// Add custom pattern
addPattern('customPattern', {
  patterns: [/your-regex-here/i],
  severity: 'warning',
  category: 'Your category',
  weight: 15
});

// Remove a pattern
removePattern('urgencyManipulation');

// Reset to defaults
resetPatterns();
```

---

## A/B Testing Options

### Test Configuration

```javascript
const testId = startTest('test-name', ['variantA', 'variantB'], {
  gateAware: true,          // Track Statsig feature gates (default: true)
  minRuns: 50,              // Minimum samples per variant (default: 50)
  confidenceLevel: 0.95,    // Required confidence level (default: 0.95)
});
```

### Database Location

```bash
~/.claude/prompt-studio/gate_ab_results.db
```

SQLite database with tables:
- `tests` - Test metadata and configuration
- `results` - Individual result records with gate state snapshots

### Statsig Integration

Gate state captured from:
```bash
~/.claude/statsig/statsig.cached.evaluations.*
```

If directory doesn't exist, gate awareness degrades gracefully.

---

## Suite Manager Configuration

### Predefined Roles

```javascript
const PREDEFINED_ROLES = {
  researcher: {
    defaultModel: 'claude-sonnet-4',
    defaultThinkingBudget: 10000,
  },
  implementer: {
    defaultModel: 'claude-sonnet-4',
    defaultThinkingBudget: 15000,
  },
  reviewer: {
    defaultModel: 'claude-opus-4',
    defaultThinkingBudget: 20000,
  },
  tester: {
    defaultModel: 'claude-sonnet-4',
    defaultThinkingBudget: 10000,
  },
  coordinator: {
    defaultModel: 'claude-opus-4',
    defaultThinkingBudget: 25000,
  },
  debugger: {
    defaultModel: 'claude-opus-4',
    defaultThinkingBudget: 20000,
  },
};
```

### Model Pricing for Suites

```javascript
const MODEL_PRICING = {
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-3.5': { input: 0.80, output: 4 },
};
```

### Suites Directory

```bash
~/.claude/prompt-studio/suites/
```

Suite files stored as JSON with `.json` extension.

---

## Hook Manager Configuration

### Paths

```javascript
const STUDIO_DIR = process.env.STUDIO_DIR ||
  join(homedir(), '.claude', 'prompt-studio');
const SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');
const ACTIVE_TEMPLATE_FILE = join(STUDIO_DIR, '.active-template');
const TEMPLATES_DIR = join(STUDIO_DIR, 'templates');
const HOOK_SCRIPT = join(STUDIO_DIR, 'hooks', 'prompt-studio-inject.py');
```

### Hook Command

```python
python3 ~/.claude/prompt-studio/hooks/prompt-studio-inject.py
```

Injected into `~/.claude/settings.json` under `hooks.UserPromptSubmit`.

### Environment Variable Override

```bash
export STUDIO_DIR=/custom/path/to/prompt-studio
```

---

## Output Style Paths

### Output Styles Directory

```bash
~/.claude/output-styles/
```

Output styles are markdown files (`.md` extension) that Claude Code loads natively.

### Generated Style Format

```markdown
# Style Name Output Style

> Generated by prompt-studio from template: template-name
> Category: category-name

[Style instructions...]
```

---

## Environment Variables Summary

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMPT_STUDIO_DIR` | `~/.claude/prompt-studio` | Base directory for Sigil data |
| `STUDIO_DIR` | Same as above | Alias for hook manager |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | `80` | Context compaction threshold % |

---

## File Structure

```
~/.claude/
├── prompt-studio/
│   ├── templates/           # Template markdown files
│   ├── suites/              # PromptSuite JSON files
│   ├── results/
│   │   ├── cost-tracking.jsonl
│   │   └── cache-stats.jsonl
│   ├── hooks/
│   │   └── prompt-studio-inject.py
│   ├── gate_ab_results.db  # A/B test SQLite database
│   └── .active-template     # Currently active template name
├── output-styles/           # Native Claude Code output styles
├── statsig/                 # Statsig feature gate cache (Claude Code managed)
└── settings.json            # Claude Code settings with hooks
```

---

For more examples and usage patterns, see the [examples/](examples/) directory.
