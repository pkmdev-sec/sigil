#!/usr/bin/env node
/**
 * suite-manager.mjs — Multi-Agent Prompt Coordination
 * Innovation 10 for prompt-studio
 *
 * Manages coordinated prompt sets (suites) for multi-agent workflows.
 * Each suite defines roles with specific templates, models, and settings.
 *
 * Exports:
 *   PromptSuite class
 *   createSuite(name)       -> new PromptSuite
 *   loadSuite(path)         -> PromptSuite from file
 *   saveSuite(suite, path)  -> save to file
 *   listSuites(dir)         -> list available suites
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STUDIO_DIR = process.env.PROMPT_STUDIO_DIR || join(process.env.HOME, '.claude', 'prompt-studio');
const DEFAULT_SUITES_DIR = join(STUDIO_DIR, 'suites');

// ─── Model Pricing (per 1M tokens) ──────────────────────────────

const MODEL_PRICING = {
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-3.5': { input: 0.80, output: 4 },
};

// ─── Predefined Roles ────────────────────────────────────────────

const PREDEFINED_ROLES = {
  researcher: {
    description: 'Explores codebase, gathers context, identifies patterns',
    defaultModel: 'claude-sonnet-4',
    defaultThinkingBudget: 10000,
    templateHint: 'You are a research agent. Thoroughly explore the codebase to gather context.',
  },
  implementer: {
    description: 'Writes code, applies changes, creates files',
    defaultModel: 'claude-sonnet-4',
    defaultThinkingBudget: 15000,
    templateHint: 'You are an implementation agent. Write clean, correct code following project patterns.',
  },
  reviewer: {
    description: 'Reviews code for quality, security, and correctness',
    defaultModel: 'claude-opus-4',
    defaultThinkingBudget: 20000,
    templateHint: 'You are a code review agent. Carefully review for bugs, security issues, and quality.',
  },
  tester: {
    description: 'Writes and runs tests, validates behavior',
    defaultModel: 'claude-sonnet-4',
    defaultThinkingBudget: 10000,
    templateHint: 'You are a testing agent. Write comprehensive tests and verify correctness.',
  },
  coordinator: {
    description: 'Plans work, delegates tasks, integrates results',
    defaultModel: 'claude-opus-4',
    defaultThinkingBudget: 25000,
    templateHint: 'You are a coordinator agent. Plan the approach and delegate to specialized agents.',
  },
  debugger: {
    description: 'Diagnoses bugs, traces root causes, proposes fixes',
    defaultModel: 'claude-opus-4',
    defaultThinkingBudget: 20000,
    templateHint: 'You are a debugging agent. Systematically trace the root cause and propose a fix.',
  },
};

// ─── PromptSuite Class ───────────────────────────────────────────

export class PromptSuite {
  /**
   * @param {string} name - Suite name
   * @param {string} [description=''] - Suite description
   * @example
   * const suite = new PromptSuite('feature-dev', 'End-to-end feature workflow');
   */
  constructor(name, description = '') {
    if (!name || typeof name !== 'string') {
      throw new Error('Suite name must be a non-empty string');
    }
    this.name = name;
    this.description = description;
    this.roles = {};
    this.created = new Date().toISOString();
    this.version = '1.0.0';
  }

  /**
   * Add a role-specific template to the suite.
   * @param {string} roleName
   * @param {string} template - The prompt template text
   * @param {Object} [options]
   * @param {string} [options.model] - Model to use for this role
   * @param {number} [options.thinkingBudget] - Thinking token budget
   * @param {string} [options.description] - Role description override
   * @param {number} [options.maxTokens] - Max output tokens
   * @param {string[]} [options.dependsOn] - Array of role names this role depends on
   * @example
   * suite.addRole('implementer', 'Write production code', {
   *   model: 'claude-sonnet-4',
   *   dependsOn: ['researcher']
   * });
   */
  addRole(roleName, template, options = {}) {
    try {
      if (!roleName || typeof roleName !== 'string') {
        throw new Error('roleName must be a non-empty string');
      }
      if (!template || typeof template !== 'string') {
        throw new Error('template must be a non-empty string');
      }

      const predefined = PREDEFINED_ROLES[roleName];
      const model = options.model || (predefined && predefined.defaultModel) || 'claude-sonnet-4';
      const thinkingBudget = options.thinkingBudget || (predefined && predefined.defaultThinkingBudget) || 10000;

      this.roles[roleName] = {
        template,
        model,
        thinkingBudget,
        description: options.description || (predefined && predefined.description) || '',
        maxTokens: options.maxTokens || 16000,
        dependsOn: options.dependsOn || [],
      };
    } catch (error) {
      throw new Error(`addRole failed: ${error.message}`);
    }
  }

  /**
   * Get the template for a specific role.
   * @param {string} roleName
   * @returns {string} template text
   * @example
   * const template = suite.getTemplate('researcher');
   * console.log(template);
   */
  getTemplate(roleName) {
    try {
      if (!roleName || typeof roleName !== 'string') {
        throw new Error('roleName must be a non-empty string');
      }
      const role = this.roles[roleName];
      if (!role) {
        throw new Error(`Role not found in suite "${this.name}": ${roleName}`);
      }
      return role.template;
    } catch (error) {
      throw new Error(`getTemplate failed: ${error.message}`);
    }
  }

  /**
   * Validate the suite configuration including dependency checking.
   * @returns {{ valid: boolean, errors: string[], warnings: string[], executionOrder: string[] }}
   * @example
   * const validation = suite.validate();
   * if (!validation.valid) {
   *   validation.errors.forEach(e => console.error(e));
   * }
   * console.log(`Execution order: ${validation.executionOrder.join(' → ')}`);
   */
  validate() {
    const errors = [];
    const warnings = [];

    if (!this.name) errors.push('Suite name is required');
    if (!this.description) warnings.push('Suite has no description');

    const roleNames = Object.keys(this.roles);
    if (roleNames.length === 0) {
      errors.push('Suite has no roles defined');
    }

    for (const [roleName, role] of Object.entries(this.roles)) {
      if (!role.template || role.template.trim().length === 0) {
        errors.push(`Role "${roleName}" has empty template`);
      }
      if (!role.model) {
        errors.push(`Role "${roleName}" has no model specified`);
      }
      if (role.thinkingBudget && role.thinkingBudget < 0) {
        errors.push(`Role "${roleName}" has negative thinkingBudget`);
      }

      // Validate dependencies
      if (role.dependsOn && Array.isArray(role.dependsOn)) {
        for (const dep of role.dependsOn) {
          if (!this.roles[dep]) {
            errors.push(`Role "${roleName}" depends on non-existent role "${dep}"`);
          }
        }
      }
    }

    // Check for circular dependencies
    const circularCheck = this._detectCircularDependencies();
    if (circularCheck.hasCircular) {
      errors.push(`Circular dependency detected: ${circularCheck.cycle.join(' -> ')}`);
    }

    // Get execution order
    let executionOrder = [];
    if (!circularCheck.hasCircular) {
      executionOrder = this._topologicalSort();
    }

    // Check for coordinator role in multi-role suites
    if (roleNames.length > 2 && !this.roles.coordinator) {
      warnings.push('Multi-role suite has no coordinator — consider adding one');
    }

    return { valid: errors.length === 0, errors, warnings, executionOrder };
  }

  /**
   * Detect circular dependencies in role dependencies.
   * @returns {{ hasCircular: boolean, cycle: string[] }}
   */
  _detectCircularDependencies() {
    const visited = new Set();
    const recursionStack = new Set();
    const cycle = [];

    const dfs = (roleName) => {
      visited.add(roleName);
      recursionStack.add(roleName);

      const role = this.roles[roleName];
      if (role && role.dependsOn) {
        for (const dep of role.dependsOn) {
          if (!visited.has(dep)) {
            const found = dfs(dep);
            if (found) {
              cycle.unshift(roleName);
              return true;
            }
          } else if (recursionStack.has(dep)) {
            cycle.push(dep, roleName);
            return true;
          }
        }
      }

      recursionStack.delete(roleName);
      return false;
    };

    for (const roleName of Object.keys(this.roles)) {
      if (!visited.has(roleName)) {
        if (dfs(roleName)) {
          return { hasCircular: true, cycle };
        }
      }
    }

    return { hasCircular: false, cycle: [] };
  }

  /**
   * Get topological sort order for role execution (respecting dependencies).
   * @returns {string[]} Array of role names in execution order
   */
  _topologicalSort() {
    const inDegree = {};
    const adjList = {};

    // Initialize
    for (const roleName of Object.keys(this.roles)) {
      inDegree[roleName] = 0;
      adjList[roleName] = [];
    }

    // Build adjacency list and in-degree counts
    for (const [roleName, role] of Object.entries(this.roles)) {
      if (role.dependsOn && Array.isArray(role.dependsOn)) {
        for (const dep of role.dependsOn) {
          if (adjList[dep]) {
            adjList[dep].push(roleName);
            inDegree[roleName]++;
          }
        }
      }
    }

    // Kahn's algorithm for topological sort
    const queue = [];
    const result = [];

    // Start with nodes that have no dependencies
    for (const [roleName, degree] of Object.entries(inDegree)) {
      if (degree === 0) {
        queue.push(roleName);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      result.push(current);

      for (const neighbor of adjList[current]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  /**
   * Estimate total cost for running the full suite once.
   * @param {string} [modelOverride] - Override all roles to use this model
   * @returns {{ totalInput: number, totalOutput: number, total: number, perRole: Object }}
   * @example
   * const cost = suite.estimateSuiteCost();
   * console.log(`Total suite cost: $${cost.total}`);
   * Object.entries(cost.perRole).forEach(([role, c]) => {
   *   console.log(`  ${role}: $${c.totalCost}`);
   * });
   */
  estimateSuiteCost(modelOverride) {
    const perRole = {};
    let totalInput = 0;
    let totalOutput = 0;

    for (const [roleName, role] of Object.entries(this.roles)) {
      const model = modelOverride || role.model;
      const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4'];

      // Estimate tokens: template + thinking budget for input, maxTokens for output
      const templateTokens = Math.ceil(role.template.length / 4); // rough estimate
      const inputTokens = templateTokens + (role.thinkingBudget || 0);
      const outputTokens = role.maxTokens || 16000;

      const inputCost = (inputTokens / 1_000_000) * pricing.input;
      const outputCost = (outputTokens / 1_000_000) * pricing.output;

      perRole[roleName] = {
        model,
        inputTokens,
        outputTokens,
        inputCost: Math.round(inputCost * 10000) / 10000,
        outputCost: Math.round(outputCost * 10000) / 10000,
        totalCost: Math.round((inputCost + outputCost) * 10000) / 10000,
      };

      totalInput += inputCost;
      totalOutput += outputCost;
    }

    return {
      totalInput: Math.round(totalInput * 10000) / 10000,
      totalOutput: Math.round(totalOutput * 10000) / 10000,
      total: Math.round((totalInput + totalOutput) * 10000) / 10000,
      perRole,
    };
  }

  /**
   * Serialize to JSON-compatible object.
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      created: this.created,
      roles: { ...this.roles },
    };
  }

  /**
   * Deserialize from a JSON object.
   * @param {Object} data
   * @returns {PromptSuite}
   */
  static fromJSON(data) {
    if (!data || !data.name) {
      throw new Error('Invalid suite data: missing name');
    }
    const suite = new PromptSuite(data.name, data.description || '');
    suite.version = data.version || '1.0.0';
    suite.created = data.created || new Date().toISOString();

    if (data.roles) {
      for (const [roleName, roleData] of Object.entries(data.roles)) {
        suite.roles[roleName] = {
          template: roleData.template || '',
          model: roleData.model || 'claude-sonnet-4',
          thinkingBudget: roleData.thinkingBudget || 10000,
          description: roleData.description || '',
          maxTokens: roleData.maxTokens || 16000,
          dependsOn: roleData.dependsOn || [],
        };
      }
    }

    return suite;
  }
}

// ─── Module Functions ────────────────────────────────────────────

/**
 * Create a new empty PromptSuite.
 * @param {string} name - Suite name
 * @param {string} [description=''] - Suite description
 * @returns {PromptSuite} New PromptSuite instance
 * @example
 * const suite = createSuite('review-suite', 'Multi-agent code review workflow');
 */
export function createSuite(name, description = '') {
  return new PromptSuite(name, description);
}

/**
 * Load a PromptSuite from a JSON file.
 * @param {string} filePath - Path to suite JSON file
 * @returns {PromptSuite} Loaded PromptSuite instance
 * @example
 * const suite = loadSuite('~/.claude/prompt-studio/suites/my-suite.json');
 * console.log(`Loaded suite: ${suite.name}`);
 */
export function loadSuite(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('filePath must be a non-empty string');
    }
    if (!existsSync(filePath)) {
      throw new Error(`Suite file not found: ${filePath}`);
    }
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return PromptSuite.fromJSON(data);
  } catch (error) {
    throw new Error(`loadSuite failed: ${error.message}`);
  }
}

/**
 * Save a PromptSuite to a JSON file.
 * @param {PromptSuite} suite - PromptSuite instance to save
 * @param {string} filePath - Path where to save the suite
 * @example
 * saveSuite(suite, '~/.claude/prompt-studio/suites/my-suite.json');
 * console.log('Suite saved successfully');
 */
export function saveSuite(suite, filePath) {
  try {
    if (!suite || !(suite instanceof PromptSuite)) {
      throw new Error('suite must be a PromptSuite instance');
    }
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('filePath must be a non-empty string');
    }

    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(suite.toJSON(), null, 2) + '\n', 'utf-8');
  } catch (error) {
    throw new Error(`saveSuite failed: ${error.message}`);
  }
}

/**
 * List available suites in a directory.
 * @param {string} [dir] - Directory to scan (defaults to ~/.claude/prompt-studio/suites)
 * @returns {Array<{ name: string, path: string, description: string, roleCount: number }>} Array of suite metadata
 * @example
 * const suites = listSuites();
 * suites.forEach(s => {
 *   console.log(`${s.name}: ${s.roleCount} roles - ${s.description}`);
 * });
 */
export function listSuites(dir) {
  try {
    const suitesDir = dir || DEFAULT_SUITES_DIR;
    if (!existsSync(suitesDir)) {
      return [];
    }

    const files = readdirSync(suitesDir).filter(f => f.endsWith('.json'));
    const suites = [];

    for (const file of files) {
      const filePath = join(suitesDir, file);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        suites.push({
          name: data.name || basename(file, '.json'),
          path: filePath,
          description: data.description || '',
          roleCount: data.roles ? Object.keys(data.roles).length : 0,
        });
      } catch {
        // Skip unparseable files
      }
    }

    return suites;
  } catch (error) {
    throw new Error(`listSuites failed: ${error.message}`);
  }
}

export { PREDEFINED_ROLES, MODEL_PRICING };
