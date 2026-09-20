#!/usr/bin/env node
// prompt-studio: Cost Estimator (Innovation 8)
// Estimates API costs based on token count and model pricing

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { appendFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const RESULTS_DIR = join(homedir(), '.claude', 'prompt-studio', 'results');

// ─── Model Pricing (per million tokens) ─────────────────────────
// From RE analysis of Claude Code v2.1.71
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

// ─── Cost Estimation ────────────────────────────────────────────

/**
 * Estimate cost for a given token count and model.
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {string} [model='claude-opus-4'] - Model identifier
 * @returns {{ inputCost: number, outputCost: number, totalCost: number, cachedCost: number, savings: number }}
 */
export function estimateCost(inputTokens, outputTokens, model = 'claude-opus-4') {
  try {
    // Validate inputs
    if (typeof inputTokens !== 'number' || inputTokens < 0 || !isFinite(inputTokens)) {
      throw new Error('inputTokens must be a non-negative finite number');
    }
    if (typeof outputTokens !== 'number' || outputTokens < 0 || !isFinite(outputTokens)) {
      throw new Error('outputTokens must be a non-negative finite number');
    }
    if (!model || typeof model !== 'string') {
      throw new Error('model must be a non-empty string');
    }

    const pricing = PRICING[model] || PRICING['claude-opus-4'];

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const totalCost = inputCost + outputCost;

    // Cached cost: input uses cached pricing, output stays the same
    const cachedInputCost = (inputTokens / 1_000_000) * pricing.cachedInput;
    const cachedCost = cachedInputCost + outputCost;

    const savings = totalCost - cachedCost;

    return {
      inputCost: round6(inputCost),
      outputCost: round6(outputCost),
      totalCost: round6(totalCost),
      cachedCost: round6(cachedCost),
      savings: round6(savings),
    };
  } catch (error) {
    throw new Error(`estimateCost failed: ${error.message}`);
  }
}

// ─── Cost Comparison Across Models ──────────────────────────────

/**
 * Compare costs for a template across multiple models.
 * @param {number} templateTokens - Input tokens (template size)
 * @param {string[]|null} [models=null] - List of model names to compare (defaults to all models)
 * @returns {Array<{ model: string, inputCost: number, outputCost: number, totalCost: number, cachedCost: number, savings: number }>}
 */
export function compareCosts(templateTokens, models = null) {
  try {
    // Validate inputs
    if (typeof templateTokens !== 'number' || templateTokens < 0 || !isFinite(templateTokens)) {
      throw new Error('templateTokens must be a non-negative finite number');
    }
    if (models !== null && !Array.isArray(models)) {
      throw new Error('models must be an array or null');
    }

    const modelList = models || Object.keys(PRICING);
    // Assume output is roughly 2x input for a typical response
    const estimatedOutput = Math.round(templateTokens * 2);

    return modelList.map(model => {
      const costs = estimateCost(templateTokens, estimatedOutput, model);
      return { model, ...costs };
    });
  } catch (error) {
    throw new Error(`compareCosts failed: ${error.message}`);
  }
}

// ─── Cost Tracking ──────────────────────────────────────────────

/**
 * Track actual cost by appending to the results database.
 * @param {string} sessionId - Unique session identifier
 * @param {{ input: number, output: number }} actualTokens - Actual token usage
 * @param {string} [model='claude-opus-4'] - Model identifier
 * @returns {Promise<Object>} Cost tracking record
 */
export async function trackCost(sessionId, actualTokens, model = 'claude-opus-4') {
  try {
    // Validate inputs
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('sessionId must be a non-empty string');
    }
    if (!actualTokens || typeof actualTokens !== 'object') {
      throw new Error('actualTokens must be an object');
    }
    if (typeof actualTokens.input !== 'number' || actualTokens.input < 0) {
      throw new Error('actualTokens.input must be a non-negative number');
    }
    if (typeof actualTokens.output !== 'number' || actualTokens.output < 0) {
      throw new Error('actualTokens.output must be a non-negative number');
    }

    if (!existsSync(RESULTS_DIR)) {
      mkdirSync(RESULTS_DIR, { recursive: true });
    }

    const costs = estimateCost(actualTokens.input, actualTokens.output, model);

    const record = {
      timestamp: new Date().toISOString(),
      sessionId,
      model,
      tokens: actualTokens,
      costs,
    };

    const dbPath = join(RESULTS_DIR, 'cost-tracking.jsonl');
    await appendFile(dbPath, JSON.stringify(record) + '\n', 'utf-8');

    return record;
  } catch (error) {
    throw new Error(`trackCost failed: ${error.message}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function round6(n) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Get session cost history from the tracking database.
 * @param {Object} [options] - Filter options
 * @param {string} [options.sessionId] - Filter by specific session ID
 * @param {string} [options.model] - Filter by model name
 * @param {number} [options.lastNDays] - Only include records from last N days
 * @returns {Array<{timestamp: string, sessionId: string, model: string, tokens: Object, costs: Object}>}
 */
export function getCostHistory(options = {}) {
  try {
    const dbPath = join(RESULTS_DIR, 'cost-tracking.jsonl');
    if (!existsSync(dbPath)) {
      return [];
    }

    const content = readFileSync(dbPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);
    const records = [];

    const cutoffDate = options.lastNDays
      ? new Date(Date.now() - options.lastNDays * 24 * 60 * 60 * 1000)
      : null;

    for (const line of lines) {
      try {
        const record = JSON.parse(line);

        // Apply filters
        if (options.sessionId && record.sessionId !== options.sessionId) continue;
        if (options.model && record.model !== options.model) continue;
        if (cutoffDate && new Date(record.timestamp) < cutoffDate) continue;

        records.push(record);
      } catch {
        // Skip malformed lines
      }
    }

    return records;
  } catch (error) {
    throw new Error(`getCostHistory failed: ${error.message}`);
  }
}

/**
 * Get cost trend data suitable for visualization.
 * @param {Object} [options] - Filter options
 * @param {string} [options.sessionId] - Filter by specific session ID
 * @param {string} [options.model] - Filter by model name
 * @param {number} [options.lastNDays=30] - Only include records from last N days
 * @param {string} [options.groupBy='day'] - Group by 'day', 'hour', or 'session'
 * @returns {{ labels: string[], totalCosts: number[], inputCosts: number[], outputCosts: number[], cachedCosts: number[], totalTokens: number[] }}
 */
export function getCostTrends(options = {}) {
  try {
    const groupBy = options.groupBy || 'day';
    const lastNDays = options.lastNDays || 30;

    const history = getCostHistory({
      ...options,
      lastNDays
    });

    if (history.length === 0) {
      return {
        labels: [],
        totalCosts: [],
        inputCosts: [],
        outputCosts: [],
        cachedCosts: [],
        totalTokens: []
      };
    }

    // Group records by time bucket
    const buckets = new Map();

    for (const record of history) {
      let bucketKey;
      const date = new Date(record.timestamp);

      if (groupBy === 'hour') {
        bucketKey = date.toISOString().slice(0, 13) + ':00:00';
      } else if (groupBy === 'day') {
        bucketKey = date.toISOString().slice(0, 10);
      } else if (groupBy === 'session') {
        bucketKey = record.sessionId;
      } else {
        bucketKey = date.toISOString().slice(0, 10);
      }

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          totalCost: 0,
          inputCost: 0,
          outputCost: 0,
          cachedCost: 0,
          totalTokens: 0
        });
      }

      const bucket = buckets.get(bucketKey);
      bucket.totalCost += record.costs.totalCost || 0;
      bucket.inputCost += record.costs.inputCost || 0;
      bucket.outputCost += record.costs.outputCost || 0;
      bucket.cachedCost += record.costs.cachedCost || 0;
      bucket.totalTokens += (record.tokens.input || 0) + (record.tokens.output || 0);
    }

    // Convert to arrays for visualization
    const labels = [];
    const totalCosts = [];
    const inputCosts = [];
    const outputCosts = [];
    const cachedCosts = [];
    const totalTokens = [];

    const sorted = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [label, data] of sorted) {
      labels.push(label);
      totalCosts.push(round6(data.totalCost));
      inputCosts.push(round6(data.inputCost));
      outputCosts.push(round6(data.outputCost));
      cachedCosts.push(round6(data.cachedCost));
      totalTokens.push(data.totalTokens);
    }

    return {
      labels,
      totalCosts,
      inputCosts,
      outputCosts,
      cachedCosts,
      totalTokens
    };
  } catch (error) {
    throw new Error(`getCostTrends failed: ${error.message}`);
  }
}
