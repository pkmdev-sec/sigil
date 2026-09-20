#!/usr/bin/env node
/**
 * Multi-Agent PromptSuite Example — Coordinate prompts across agent roles
 *
 * Usage: node examples/multi-agent-suite.mjs
 */
import { createSuite, PREDEFINED_ROLES, MODEL_PRICING } from '../lib/suite-manager.mjs';
import { PromptAssembler } from '../lib/prompt-assembler.mjs';

// Create a suite for a feature development workflow
const suite = createSuite('feature-development', 'End-to-end feature implementation suite');

// Add roles with specialized prompts
const researcher = new PromptAssembler();
researcher.addSection('core-identity', 'You are a technical researcher. Analyze requirements and identify implementation approaches.');
researcher.addSection('system-instructions', 'Research best practices for implementing real-time notifications.');
suite.addRole('researcher', researcher.assemble(), { model: 'claude-sonnet-4' });

const implementer = new PromptAssembler();
implementer.addSection('core-identity', 'You are a senior developer. Write production-quality code.');
implementer.addSection('system-instructions', 'Implement WebSocket-based notification system.');
implementer.addSection('anti-pattern-rules', '- Use ws library\n- Handle reconnection\n- Include rate limiting');
suite.addRole('implementer', implementer.assemble(), { model: 'claude-sonnet-4', dependsOn: ['researcher'] });

const reviewer = new PromptAssembler();
reviewer.addSection('core-identity', 'You are a code reviewer focused on security, performance, and best practices.');
reviewer.addSection('system-instructions', 'Review the notification system implementation for production readiness.');
suite.addRole('reviewer', reviewer.assemble(), { model: 'claude-opus-4', dependsOn: ['implementer'] });

const tester = new PromptAssembler();
tester.addSection('core-identity', 'You are a QA engineer. Write comprehensive tests.');
tester.addSection('system-instructions', 'Create unit and integration tests for the notification system.');
suite.addRole('tester', tester.assemble(), { model: 'claude-sonnet-4', dependsOn: ['implementer'] });

// Validate the suite
const validation = suite.validate();
console.log('=== Suite Validation ===');
console.log(`Valid: ${validation.valid}`);
console.log(`Execution order: ${validation.executionOrder?.join(' → ')}`);
if (validation.warnings.length) {
  console.log('Warnings:', validation.warnings);
}

// Estimate suite cost
const costEstimate = suite.estimateSuiteCost();
console.log('\n=== Cost Estimate ===');
costEstimate.roles.forEach(r => {
  console.log(`  ${r.role} (${r.model}): $${r.totalCost.toFixed(4)}`);
});
console.log(`  Total: $${costEstimate.total.toFixed(4)}`);

// Export for persistence
const json = suite.toJSON();
console.log(`\nSuite serialized: ${JSON.stringify(json).length} bytes`);
