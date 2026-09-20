#!/usr/bin/env node
/**
 * A/B Test Prompts Example — Compare two prompt variants with statistical analysis
 *
 * Usage: node examples/ab-test-prompts.mjs
 */
import { startTest, recordResult, analyzeResults } from '../lib/gate-aware-ab.mjs';

// Define two prompt variants to test
const variants = {
  concise: {
    prompt: 'Fix the bug in the login function.',
    description: 'Short, direct instruction'
  },
  detailed: {
    prompt: 'Please analyze the login function, identify the authentication bug causing session timeouts, and implement a fix that maintains backward compatibility.',
    description: 'Detailed instruction with context'
  }
};

// Start an A/B test
const testId = startTest('prompt-style-test', Object.keys(variants), {
  sampleSize: 50,
  metric: 'quality_score'
});
console.log(`Started test: ${testId}`);

// Simulate recording results from real usage
// In production, you would record these as Claude responses come back
for (let i = 0; i < 25; i++) {
  recordResult(testId, 'concise', {
    quality_score: 0.7 + Math.random() * 0.2,
    tokens_used: 500 + Math.floor(Math.random() * 200),
    latency_ms: 1200 + Math.floor(Math.random() * 800)
  });
  recordResult(testId, 'detailed', {
    quality_score: 0.8 + Math.random() * 0.15,
    tokens_used: 800 + Math.floor(Math.random() * 300),
    latency_ms: 1800 + Math.floor(Math.random() * 1000)
  });
}

// Analyze results
const analysis = analyzeResults(testId);
console.log('\n=== A/B Test Results ===');
console.log(`Test: ${analysis.testName}`);
console.log(`Samples: ${analysis.totalRuns}`);
console.log('\nVariant Performance:');
for (const [name, stats] of Object.entries(analysis.variantStats)) {
  console.log(`  ${name}: avgQuality=${stats.avgQuality?.toFixed(3)}, samples=${stats.count}`);
}
if (analysis.winner) {
  console.log(`\nWinner: ${analysis.winner} (confidence: ${(analysis.confidence * 100).toFixed(1)}%)`);
} else {
  console.log(`\nNo clear winner: ${analysis.significanceNote}`);
}
