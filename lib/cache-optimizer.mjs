#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════════╗
// ║  cache-optimizer.mjs — Prompt Caching Optimizer              ║
// ║  Analyzes prompts for caching potential, optimizes layout,   ║
// ║  and estimates cost savings from Anthropic prompt caching    ║
// ╚══════════════════════════════════════════════════════════════╝

import { STABILITY, MODEL_CONTEXTS, estimateTokens } from './prompt-assembler.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STUDIO_DIR = join(homedir(), '.claude', 'prompt-studio');
const CACHE_STATS_FILE = join(STUDIO_DIR, 'results', 'cache-stats.jsonl');

// Anthropic prompt caching pricing (per million tokens)
// Cached reads are 90% cheaper than uncached input
// Cache writes have a 25% surcharge on first use
const CACHE_PRICING = {
  'claude-opus-4':      { input: 15,   output: 75,   cacheWrite: 18.75, cacheRead: 1.50  },
  'claude-sonnet-4':    { input: 3,    output: 15,   cacheWrite: 3.75,  cacheRead: 0.30  },
  'claude-sonnet-4-5':  { input: 3,    output: 15,   cacheWrite: 3.75,  cacheRead: 0.30  },
  'claude-haiku-3.5':   { input: 0.25, output: 1.25, cacheWrite: 0.30,  cacheRead: 0.025 },
  'claude-opus-4-fast': { input: 30,   output: 150,  cacheWrite: 37.50, cacheRead: 3.00  },
};

// Stability heuristics for content classification
const CONTENT_PATTERNS = {
  systemInstruction: {
    patterns: [
      /^you are\b/im,
      /^# (system|instructions|rules|guidelines)/im,
      /\b(must|shall|always|never)\b.*\./i,
    ],
    stability: 1.0,
    label: 'System instructions',
  },
  toolDefinition: {
    patterns: [
      /"type"\s*:\s*"function"/,
      /"name"\s*:\s*"[^"]+"/,
      /"parameters"\s*:\s*\{/,
      /tool definitions/i,
    ],
    stability: 1.0,
    label: 'Tool definitions',
  },
  claudeMd: {
    patterns: [
      /^# CLAUDE\.md/im,
      /claude\.md content/i,
      /project instructions/i,
    ],
    stability: 0.95,
    label: 'CLAUDE.md content',
  },
  environment: {
    patterns: [
      /working directory:/i,
      /platform:\s*(darwin|linux|win)/i,
      /current date/i,
      /\$CWD|\$PLATFORM|\$DATE/,
    ],
    stability: 0.5,
    label: 'Environment metadata',
  },
  userMessage: {
    patterns: [
      /^(human|user):/im,
      /please (help|fix|create|update|review)/i,
    ],
    stability: 0.0,
    label: 'User message',
  },
  outputStyle: {
    patterns: [
      /tone and style/i,
      /formatting|markdown/i,
      /emoji/i,
      /responses should be/i,
    ],
    stability: 0.9,
    label: 'Output style',
  },
  fewShot: {
    patterns: [
      /<example>/i,
      /example[_\s]*(input|output|response)/i,
      /here('s| is) an example/i,
    ],
    stability: 0.8,
    label: 'Few-shot examples',
  },
  antiPattern: {
    patterns: [
      /\bNEVER\b.*\./,
      /\bMUST\b.*\./,
      /\bDO NOT\b.*\./,
      /\bIMPORTANT:/,
      /\bCRITICAL:/,
    ],
    stability: 1.0,
    label: 'Anti-pattern rules',
  },
};

// Minimum token threshold for caching to be worthwhile (Anthropic requirement: 1024)
const MIN_CACHE_TOKENS = 1024;

// Cache TTL: Anthropic caches for 5 minutes by default
const CACHE_TTL_SECONDS = 300;

/**
 * Classify a text block by matching against known content patterns.
 * Returns { type, stability, label }.
 */
function classifyBlock(text) {
  let bestMatch = { type: 'unknown', stability: 0.5, label: 'Unknown content' };
  let bestScore = 0;

  for (const [type, config] of Object.entries(CONTENT_PATTERNS)) {
    let score = 0;
    for (const pat of config.patterns) {
      if (pat.test(text)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { type, stability: config.stability, label: config.label };
    }
  }

  return bestMatch;
}

/**
 * Split text into logical blocks (by markdown headings or double newlines).
 */
function splitIntoBlocks(text) {
  // Split on markdown headings (h1, h2, h3) or double newlines
  const raw = text.split(/\n(?=#{1,3} )/);
  const blocks = [];
  for (const chunk of raw) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const classification = classifyBlock(trimmed);
    blocks.push({
      content: trimmed,
      tokens: estimateTokens(trimmed),
      ...classification,
    });
  }
  return blocks;
}

/**
 * Analyze a template/prompt and identify stable vs variable sections for caching optimization.
 * @param {string} template - The prompt text to analyze
 * @returns {{ stableSections: Array, variableSections: Array, cacheHitProbability: number, totalTokens: number, stableTokens: number, variableTokens: number, stableRatio: number }}
 */
export function analyzeTemplate(template) {
  try {
    // Validate input
    if (!template || typeof template !== 'string') {
      throw new Error('template must be a non-empty string');
    }

    const blocks = splitIntoBlocks(template);
    const stableSections = [];
    const variableSections = [];

    for (const block of blocks) {
      if (block.stability >= 0.8) {
        stableSections.push(block);
      } else {
        variableSections.push(block);
      }
    }

    const totalTokens = blocks.reduce((s, b) => s + b.tokens, 0);
    const stableTokens = stableSections.reduce((s, b) => s + b.tokens, 0);

    // Cache hit probability = weighted average of stability across all blocks
    const cacheHitProbability = totalTokens > 0
      ? blocks.reduce((s, b) => s + b.stability * b.tokens, 0) / totalTokens
      : 0;

    return {
      stableSections,
      variableSections,
      cacheHitProbability: Math.round(cacheHitProbability * 1000) / 1000,
      totalTokens,
      stableTokens,
      variableTokens: totalTokens - stableTokens,
      stableRatio: totalTokens > 0 ? Math.round((stableTokens / totalTokens) * 1000) / 1000 : 0,
    };
  } catch (error) {
    throw new Error(`analyzeTemplate failed: ${error.message}`);
  }
}

/**
 * Optimize a template for caching by reordering sections: stable sections first, variable last.
 * @param {string} template - The prompt text to optimize
 * @returns {string} Optimized prompt with stable content front-loaded for maximum cache efficiency
 */
export function optimizeForCaching(template) {
  try {
    // Validate input
    if (!template || typeof template !== 'string') {
      throw new Error('template must be a non-empty string');
    }

    const blocks = splitIntoBlocks(template);

    // Sort: highest stability first, then by original order for equal stability
    const indexed = blocks.map((b, i) => ({ ...b, originalIndex: i }));
    indexed.sort((a, b) => {
      if (b.stability !== a.stability) return b.stability - a.stability;
      return a.originalIndex - b.originalIndex;
    });

    return indexed.map(b => b.content).join('\n\n');
  } catch (error) {
    throw new Error(`optimizeForCaching failed: ${error.message}`);
  }
}

/**
 * Estimate cost savings from prompt caching over N API calls.
 * @param {string} template - The prompt text
 * @param {number} [callCount=100] - Number of API calls to estimate for
 * @param {string} [model='claude-sonnet-4'] - Model name for pricing
 * @returns {{ uncachedCost: number, cachedCost: number, savings: number, savingsPercent: number, breakEvenCalls: number, model: string, callCount: number, stableTokens: number, variableTokens: number, totalTokens: number }}
 */
export function estimateCacheSavings(template, callCount = 100, model = 'claude-sonnet-4') {
  try {
    // Validate inputs
    if (!template || typeof template !== 'string') {
      throw new Error('template must be a non-empty string');
    }
    if (typeof callCount !== 'number' || callCount < 1 || !isFinite(callCount)) {
      throw new Error('callCount must be a positive finite number');
    }
    if (!model || typeof model !== 'string') {
      throw new Error('model must be a non-empty string');
    }

    const pricing = CACHE_PRICING[model] ?? CACHE_PRICING['claude-sonnet-4'];
    const analysis = analyzeTemplate(template);

    const totalTokens = analysis.totalTokens;
    const stableTokens = analysis.stableTokens;
    const variableTokens = analysis.variableTokens;

    // Uncached: all tokens at full input price every call
    const uncachedCost = (totalTokens / 1_000_000) * pricing.input * callCount;

    // Cached scenario:
    // - First call: cache write for stable portion + normal input for variable
    // - Subsequent calls within TTL: cache read for stable + normal input for variable
    // - Assume cache refreshes every CACHE_TTL_SECONDS / avg_call_interval
    // For simplicity, assume steady usage where cache stays warm
    const cacheWriteCalls = Math.max(1, Math.ceil(callCount / 20)); // refresh ~every 20 calls
    const cacheReadCalls = callCount - cacheWriteCalls;

    const writePortionCost = (stableTokens / 1_000_000) * pricing.cacheWrite * cacheWriteCalls;
    const readPortionCost = (stableTokens / 1_000_000) * pricing.cacheRead * cacheReadCalls;
    const variablePortionCost = (variableTokens / 1_000_000) * pricing.input * callCount;

    const cachedCost = writePortionCost + readPortionCost + variablePortionCost;
    const savings = uncachedCost - cachedCost;
    const savingsPercent = uncachedCost > 0 ? Math.round((savings / uncachedCost) * 1000) / 10 : 0;

    // Break-even: number of calls where cached cost < uncached cost
    // Per-call uncached = totalTokens * input / 1M
    // Per-call cached (steady state) = stableTokens * cacheRead / 1M + variableTokens * input / 1M
    const perCallUncached = (totalTokens / 1_000_000) * pricing.input;
    const perCallCachedSteady = (stableTokens / 1_000_000) * pricing.cacheRead +
      (variableTokens / 1_000_000) * pricing.input;
    const cacheWriteOverhead = (stableTokens / 1_000_000) * pricing.cacheWrite;

    // Break-even: cacheWriteOverhead + N * perCallCachedSteady < N * perCallUncached
    // cacheWriteOverhead < N * (perCallUncached - perCallCachedSteady)
    const perCallSaving = perCallUncached - perCallCachedSteady;
    const breakEvenCalls = perCallSaving > 0 ? Math.ceil(cacheWriteOverhead / perCallSaving) + 1 : Infinity;

    return {
      uncachedCost: round6(uncachedCost),
      cachedCost: round6(cachedCost),
      savings: round6(savings),
      savingsPercent,
      breakEvenCalls: breakEvenCalls === Infinity ? -1 : breakEvenCalls,
      model,
      callCount,
      stableTokens,
      variableTokens,
      totalTokens,
    };
  } catch (error) {
    throw new Error(`estimateCacheSavings failed: ${error.message}`);
  }
}

/**
 * Split a prompt into cacheable prefix and dynamic suffix.
 * Ensures the cacheable prefix meets minimum token requirements (1024 tokens).
 * @param {string} prompt - The prompt text
 * @returns {{ cacheablePrefix: string, dynamicSuffix: string, prefixTokens: number, suffixTokens: number, meetsCacheMinimum: boolean }}
 */
export function splitForCaching(prompt) {
  try {
    // Validate input
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('prompt must be a non-empty string');
    }

    const blocks = splitIntoBlocks(prompt);

    // Partition by stability threshold
    const stableBlocks = [];
    const variableBlocks = [];

    for (const block of blocks) {
      if (block.stability >= 0.8) {
        stableBlocks.push(block);
      } else {
        variableBlocks.push(block);
      }
    }

    const cacheablePrefix = stableBlocks.map(b => b.content).join('\n\n');
    const dynamicSuffix = variableBlocks.map(b => b.content).join('\n\n');
    const prefixTokens = estimateTokens(cacheablePrefix);
    const suffixTokens = estimateTokens(dynamicSuffix);

    return {
      cacheablePrefix,
      dynamicSuffix,
      prefixTokens,
      suffixTokens,
      meetsCacheMinimum: prefixTokens >= MIN_CACHE_TOKENS,
    };
  } catch (error) {
    throw new Error(`splitForCaching failed: ${error.message}`);
  }
}

function round6(n) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Track a cache hit or miss event for historical statistics.
 * @param {Object} event - Cache event details
 * @param {boolean} event.hit - Whether this was a cache hit
 * @param {number} event.tokensServed - Number of tokens served from cache (or would-be cached)
 * @param {string} event.promptId - Identifier for the prompt/template
 * @param {string} [event.model] - Model name
 * @returns {Promise<void>}
 */
export async function trackCacheEvent(event) {
  try {
    if (!event || typeof event !== 'object') {
      throw new Error('event must be an object');
    }
    if (typeof event.hit !== 'boolean') {
      throw new Error('event.hit must be a boolean');
    }
    if (typeof event.tokensServed !== 'number' || event.tokensServed < 0) {
      throw new Error('event.tokensServed must be a non-negative number');
    }

    const statsDir = join(STUDIO_DIR, 'results');
    if (!existsSync(statsDir)) {
      mkdirSync(statsDir, { recursive: true });
    }

    const record = {
      timestamp: new Date().toISOString(),
      hit: event.hit,
      tokensServed: event.tokensServed,
      promptId: event.promptId || 'unknown',
      model: event.model || 'unknown',
    };

    const line = JSON.stringify(record) + '\n';

    // Append to stats file
    if (existsSync(CACHE_STATS_FILE)) {
      const existing = readFileSync(CACHE_STATS_FILE, 'utf-8');
      writeFileSync(CACHE_STATS_FILE, existing + line, 'utf-8');
    } else {
      writeFileSync(CACHE_STATS_FILE, line, 'utf-8');
    }
  } catch (error) {
    throw new Error(`trackCacheEvent failed: ${error.message}`);
  }
}

/**
 * Get cache hit rate statistics from historical data.
 * @param {Object} [options] - Filter options
 * @param {string} [options.promptId] - Filter by specific prompt ID
 * @param {string} [options.model] - Filter by model name
 * @param {number} [options.lastNDays] - Only include events from last N days
 * @returns {{ hitRate: number, totalEvents: number, totalHits: number, totalMisses: number, tokensSaved: number }}
 */
export function getCacheStats(options = {}) {
  try {
    if (!existsSync(CACHE_STATS_FILE)) {
      return {
        hitRate: 0,
        totalEvents: 0,
        totalHits: 0,
        totalMisses: 0,
        tokensSaved: 0
      };
    }

    const content = readFileSync(CACHE_STATS_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);

    let totalEvents = 0;
    let totalHits = 0;
    let totalMisses = 0;
    let tokensSaved = 0;

    const cutoffDate = options.lastNDays
      ? new Date(Date.now() - options.lastNDays * 24 * 60 * 60 * 1000)
      : null;

    for (const line of lines) {
      try {
        const record = JSON.parse(line);

        // Apply filters
        if (options.promptId && record.promptId !== options.promptId) continue;
        if (options.model && record.model !== options.model) continue;
        if (cutoffDate && new Date(record.timestamp) < cutoffDate) continue;

        totalEvents++;
        if (record.hit) {
          totalHits++;
          tokensSaved += record.tokensServed || 0;
        } else {
          totalMisses++;
        }
      } catch {
        // Skip malformed lines
      }
    }

    const hitRate = totalEvents > 0 ? totalHits / totalEvents : 0;

    return {
      hitRate: Math.round(hitRate * 1000) / 1000,
      totalEvents,
      totalHits,
      totalMisses,
      tokensSaved
    };
  } catch (error) {
    throw new Error(`getCacheStats failed: ${error.message}`);
  }
}

export { CACHE_PRICING, CONTENT_PATTERNS, MIN_CACHE_TOKENS, CACHE_TTL_SECONDS, classifyBlock, splitIntoBlocks };
