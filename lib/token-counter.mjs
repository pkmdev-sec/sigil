#!/usr/bin/env node
// prompt-studio: Token-Aware Sizing (Innovation 2)
// Estimates token counts and checks template fit against model context windows

// ─── Model Context Limits ───────────────────────────────────────
const MODEL_LIMITS = {
  'claude-opus-4':       { limit: 200000, warnAt: 160000, criticalAt: 180000 },
  'claude-sonnet-4':     { limit: 200000, warnAt: 160000, criticalAt: 180000 },
  'claude-haiku-3.5':    { limit: 200000, warnAt: 160000, criticalAt: 180000 },
  'claude-opus-4-fast':  { limit: 200000, warnAt: 160000, criticalAt: 180000 },
  'claude-sonnet-4-5':   { limit: 200000, warnAt: 160000, criticalAt: 180000 },
  'claude-opus-4-6':     { limit: 1000000, warnAt: 800000, criticalAt: 900000 },
};

// Threshold percentages for warnings
const WARNING_THRESHOLD = 0.80;    // 80% of limit
const CRITICAL_THRESHOLD = 0.90;   // 90% of limit

// Claude Code system prompt baseline (from RE analysis)
const SYSTEM_PROMPT_BASELINE = 4500;
const CLAUDE_MD_AVERAGE = 800;

// Default compaction threshold percentage
const DEFAULT_COMPACTION_PCT = 80;

// ─── Token Estimation ───────────────────────────────────────────

/**
 * Estimate token count for text using cl100k_base approximation (~4 chars/token).
 * @param {string} text
 * @returns {number}
 * @example
 * const tokens = estimateTokens("Review this code for security vulnerabilities.");
 * console.log(`Estimated tokens: ${tokens}`);
 */
export function estimateTokens(text) {
  try {
    // Handle edge cases
    if (text === null || text === undefined) {
      return 0;
    }
    if (typeof text !== 'string') {
      throw new Error('text must be a string');
    }
    if (text.length === 0) {
      return 0;
    }

    // Handle very long strings (> 10MB) - prevent performance issues
    if (text.length > 10_000_000) {
      throw new Error('text is too long (> 10MB)');
    }

    // cl100k_base estimation: ~4 characters per token
    // Refined: account for whitespace, punctuation, and code patterns
    const chars = text.length;
    const words = text.split(/\s+/).filter(w => w.length > 0).length;

    // Hybrid: average of char-based and word-based estimates
    const charEstimate = chars / 4.0;
    const wordEstimate = words * 1.3;

    return Math.max(1, Math.round((charEstimate + wordEstimate) / 2));
  } catch (error) {
    throw new Error(`estimateTokens failed: ${error.message}`);
  }
}

// ─── Template Fit Check ─────────────────────────────────────────

/**
 * Check whether a template fits within a model's context window.
 * @param {string} templateText - The template content
 * @param {string} modelName - Model identifier
 * @returns {{ fits: boolean, tokens: number, limit: number, remaining: number, compactionRisk: string, warnings: string[], usagePercent: number }}
 * @example
 * const template = "Long system prompt...";
 * const fit = checkTemplateFit(template, 'claude-sonnet-4');
 * console.log(`Fits: ${fit.fits}, Usage: ${fit.usagePercent}%`);
 * fit.warnings.forEach(w => console.log(`Warning: ${w}`));
 */
export function checkTemplateFit(templateText, modelName = 'claude-opus-4') {
  try {
    // Validate inputs
    if (templateText === null || templateText === undefined) {
      throw new Error('templateText cannot be null or undefined');
    }
    if (typeof templateText !== 'string') {
      throw new Error('templateText must be a string');
    }
    if (!modelName || typeof modelName !== 'string') {
      throw new Error('modelName must be a non-empty string');
    }

    const tokens = estimateTokens(templateText);
    const modelConfig = MODEL_LIMITS[modelName] || MODEL_LIMITS['claude-sonnet-4'];
    const limit = modelConfig.limit;
    const warnAt = modelConfig.warnAt;
    const criticalAt = modelConfig.criticalAt;

    // Account for system prompt overhead
    const overhead = SYSTEM_PROMPT_BASELINE + CLAUDE_MD_AVERAGE;
    const effectiveLimit = limit - overhead;

    const remaining = effectiveLimit - tokens;
    const fits = remaining > 0;

    // Calculate usage percentage
    const usedWithOverhead = overhead + tokens;
    const usagePct = (usedWithOverhead / limit) * 100;

    // Generate warnings based on thresholds
    const warnings = [];
    if (tokens >= criticalAt) {
      warnings.push(`CRITICAL: Token count (${tokens}) exceeds critical threshold (${criticalAt}). Context window will be compacted frequently.`);
    } else if (tokens >= warnAt) {
      warnings.push(`WARNING: Token count (${tokens}) approaching limit. At ${usagePct.toFixed(1)}% of ${limit} token context window.`);
    }

    // Compaction risk assessment
    const compactPct = parseInt(
      process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE || String(DEFAULT_COMPACTION_PCT),
      10
    );
    const compactThreshold = limit * (compactPct / 100);

    let compactionRisk;
    if (usagePct >= compactPct) {
      compactionRisk = 'critical';
      if (!warnings.some(w => w.startsWith('CRITICAL'))) {
        warnings.push(`Exceeds auto-compaction threshold (${compactPct}%)`);
      }
    } else if (usagePct >= compactPct * 0.75) {
      compactionRisk = 'high';
    } else if (usagePct >= compactPct * 0.5) {
      compactionRisk = 'moderate';
    } else {
      compactionRisk = 'low';
    }

    return {
      fits,
      tokens,
      limit,
      warnAt,
      criticalAt,
      remaining: Math.max(0, remaining),
      compactionRisk,
      warnings,
      usagePercent: Math.round(usagePct * 10) / 10
    };
  } catch (error) {
    throw new Error(`checkTemplateFit failed: ${error.message}`);
  }
}

// ─── Priority-Based Auto-Trimming ───────────────────────────────

/**
 * Auto-trim text to fit within maxTokens, removing lowest priority sections first.
 * @param {string} text - Full text with markdown sections
 * @param {number} maxTokens - Maximum token budget
 * @param {Record<string, number>} priorities - Map of section heading → priority (higher = keep)
 * @returns {string} Trimmed text
 * @example
 * const text = "# Task\nDo X\n\n# Examples\n...long examples...\n\n# Rules\nNever do Y";
 * const priorities = { "Task": 100, "Rules": 90, "Examples": 50 };
 * const trimmed = autoTrim(text, 500, priorities);
 * // Removes "Examples" section first if needed
 */
export function autoTrim(text, maxTokens, priorities = {}) {
  try {
    // Validate inputs
    if (!text || typeof text !== 'string') {
      throw new Error('text must be a non-empty string');
    }
    if (typeof maxTokens !== 'number' || maxTokens < 1 || !isFinite(maxTokens)) {
      throw new Error('maxTokens must be a positive finite number');
    }
    if (priorities !== null && typeof priorities !== 'object') {
      throw new Error('priorities must be an object or null');
    }

    const currentTokens = estimateTokens(text);
    if (currentTokens <= maxTokens) return text;

    // Parse into sections
    const sections = [];
    let currentHeading = '';
    let currentLines = [];

    for (const line of text.split('\n')) {
      if (/^#{1,3}\s/.test(line)) {
        if (currentHeading || currentLines.length > 0) {
          sections.push({
            heading: currentHeading,
            content: currentLines.join('\n'),
            priority: getPriority(currentHeading, priorities)
          });
        }
        currentHeading = line.trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
    if (currentHeading || currentLines.length > 0) {
      sections.push({
        heading: currentHeading,
        content: currentLines.join('\n'),
        priority: getPriority(currentHeading, priorities)
      });
    }

    // Sort by priority ascending (lowest first = remove first)
    sections.sort((a, b) => a.priority - b.priority);

    // Remove sections until we fit
    let trimmedSections = [...sections];
    while (trimmedSections.length > 1) {
      const assembled = assembleSections(trimmedSections);
      if (estimateTokens(assembled) <= maxTokens) break;
      trimmedSections.shift(); // Remove lowest priority
    }

    // Re-sort by original order for output
    const originalOrder = sections.map(s => s.heading);
    trimmedSections.sort((a, b) =>
      originalOrder.indexOf(a.heading) - originalOrder.indexOf(b.heading)
    );

    return assembleSections(trimmedSections).trim();
  } catch (error) {
    throw new Error(`autoTrim failed: ${error.message}`);
  }
}

function getPriority(heading, priorities) {
  if (!heading) return 50; // Default mid-priority for preamble

  // Normalize heading for lookup
  const normalized = heading.replace(/^#{1,3}\s*/, '').trim().toLowerCase();

  for (const [key, val] of Object.entries(priorities)) {
    const keyLower = key.toLowerCase();
    // Use word boundary matching to avoid false positives like "History" matching "is"
    // Match exact equality or word boundary matching
    if (normalized === keyLower) {
      return val;
    }
    // Check for word boundary matches (whole word only)
    const wordBoundaryRegex = new RegExp(`\\b${keyLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (wordBoundaryRegex.test(normalized)) {
      return val;
    }
  }

  return 50; // Default mid-priority
}

function assembleSections(sections) {
  return sections.map(s => {
    if (s.heading) {
      return s.heading + '\n' + s.content;
    }
    return s.content;
  }).join('\n').trim();
}

/**
 * Get model-specific context limits and thresholds.
 * @param {string} modelName - Model identifier
 * @returns {{ limit: number, warnAt: number, criticalAt: number, model: string }}
 * @example
 * const limits = getModelLimits('claude-opus-4');
 * console.log(`Limit: ${limits.limit}, Warn at: ${limits.warnAt}`);
 */
export function getModelLimits(modelName = 'claude-sonnet-4') {
  const config = MODEL_LIMITS[modelName] || MODEL_LIMITS['claude-sonnet-4'];
  return {
    ...config,
    model: modelName
  };
}
