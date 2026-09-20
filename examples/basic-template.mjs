#!/usr/bin/env node
/**
 * Basic Template Example — Create and use a simple prompt template with Sigil
 *
 * Usage: node examples/basic-template.mjs
 */
import { PromptAssembler, estimateTokens } from '../lib/prompt-assembler.mjs';

// Create a new prompt assembler
const prompt = new PromptAssembler();

// Add sections in the standard 10-section structure
prompt.addSection('role', 'You are an expert JavaScript developer.', { stability: 'stable' });
prompt.addSection('context', 'Working on a Node.js REST API project using Express.', { stability: 'semi-stable' });
prompt.addSection('task', 'Implement input validation for the /users endpoint.', { stability: 'volatile' });
prompt.addSection('constraints', [
  '- Use Zod for schema validation',
  '- Return 400 for invalid requests',
  '- Include field-level error messages'
].join('\n'), { stability: 'stable' });

// Assemble the full prompt
const assembled = prompt.assemble();
console.log('=== Assembled Prompt ===');
console.log(assembled);
console.log();

// Check token usage
const tokens = estimateTokens(assembled);
console.log(`Estimated tokens: ${tokens}`);

// Validate against model limits
const validation = prompt.validate('claude-sonnet-4');
console.log(`\nValid for Sonnet: ${validation.valid}`);
if (validation.warnings.length) {
  console.log('Warnings:', validation.warnings);
}

// Export as reusable template
const template = prompt.toTemplate('api-validator', 'Template for API validation tasks');
console.log('\n=== Exported Template ===');
console.log(template.substring(0, 200) + '...');
