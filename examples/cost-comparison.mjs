#!/usr/bin/env node
/**
 * Cost Comparison Example — Compare prompt costs across Claude models
 *
 * Usage: node examples/cost-comparison.mjs
 */
import { estimateCost, compareCosts } from '../lib/cost-estimator.mjs';
import { estimateTokens } from '../lib/token-counter.mjs';

// Sample prompt to estimate
const samplePrompt = `You are a senior software architect. Review the following microservices
architecture and provide recommendations for improving reliability, scalability, and cost
efficiency. Consider message queuing, circuit breakers, and service mesh patterns.`;

const tokens = estimateTokens(samplePrompt);
console.log(`Prompt tokens: ${tokens}`);
console.log();

// Single model cost estimate
const opusCost = estimateCost(tokens, 2000, 'claude-opus-4');
console.log('=== Opus Cost Estimate ===');
console.log(`  Input:  $${opusCost.inputCost.toFixed(4)}`);
console.log(`  Output: $${opusCost.outputCost.toFixed(4)}`);
console.log(`  Total:  $${opusCost.totalCost.toFixed(4)}`);
console.log(`  With caching: $${opusCost.cachedCost.toFixed(4)} (save $${opusCost.savings.toFixed(4)})`);

// Compare across all models
console.log('\n=== Cross-Model Comparison ===');
const comparison = compareCosts(tokens);
comparison.forEach(m => {
  console.log(`  ${m.model}: $${m.totalCost.toFixed(4)} (input: $${m.inputCost.toFixed(4)}, output: $${m.outputCost.toFixed(4)})`);
});

// Calculate costs for a typical session (50 calls)
console.log('\n=== Projected Session Cost (50 calls) ===');
comparison.forEach(m => {
  const sessionCost = m.totalCost * 50;
  const cachedSessionCost = m.cachedCost * 50;
  console.log(`  ${m.model}: $${sessionCost.toFixed(2)} (cached: $${cachedSessionCost.toFixed(2)})`);
});
