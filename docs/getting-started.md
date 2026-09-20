# Getting Started with Sigil

Welcome to Sigil, the prompt engineering toolkit for Claude Code. This guide will help you install Sigil and create your first optimized prompts.

## Installation

Clone the Sigil repository and install dependencies:

```bash
git clone https://github.com/pkmdev-sec/sigil.git
cd sigil
npm install
```

## Your First Sigil

Sigil comes with pre-built prompt templates called "sigils" that you can browse, view, and customize.

### Browse Available Sigils

```bash
npx sigil list
```

This displays all available sigil templates organized by category (security, code-review, performance, etc.).

### View a Sigil

```bash
npx sigil show security-audit
```

This displays the full content of the `security-audit` sigil, including its frontmatter metadata and prompt content.

### Create a Custom Sigil

```bash
npx sigil create my-sigil
```

This creates a new sigil template at `templates/my-sigil.md` with boilerplate frontmatter. Edit the file to customize:

- **target_section**: Which Claude Code system prompt section this sigil targets
- **cache_strategy**: How to optimize for prompt caching (prefix-stable, dynamic, none)
- **model_variants**: Whether to generate model-specific variants
- **token_budget**: Maximum tokens for this sigil

## Run a Cost Estimate

Before deploying prompts at scale, estimate costs across models.

### View the Cost Dashboard

```bash
npx sigil dashboard
```

This displays a comprehensive dashboard showing cost estimates for all sigils across Claude models (Opus, Sonnet, Haiku).

### Estimate Cost for a Specific Sigil

```bash
npx sigil cost security-audit --model opus
```

This calculates per-request costs including cache write/read savings for the specified model.

## Basic A/B Test

Compare two sigils to determine which performs better for your use case.

```bash
npx sigil ab-test security-audit code-review --task "Review src/auth" --runs 3
```

This runs both sigils 3 times against the same task and provides statistical comparison of:

- Response quality
- Token usage
- Latency
- Cost efficiency

Results are stored in `ab_results.db` for long-term tracking.

## Next Steps

Now that you've installed Sigil and run your first commands, dive deeper into core concepts:

- [System Prompt Assembly](core-concepts/prompt-assembly.md) — How Claude Code constructs system prompts internally
- [Prompt Cache Optimization](core-concepts/cache-optimization.md) — Maximize cost savings with strategic caching
- [PromptSuites](core-concepts/prompt-suites.md) — Coordinate multi-agent workflows

Explore the full [API Reference](reference/api.md) to integrate Sigil into your own tools and workflows.
