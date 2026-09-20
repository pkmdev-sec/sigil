#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════════╗
// ║  prompt-assembler.mjs — System Prompt Assembly Engine        ║
// ║  Assembles Claude Code system prompts in correct section     ║
// ║  order with caching support and token estimation             ║
// ╚══════════════════════════════════════════════════════════════╝

// Section assembly order matches Claude Code's internal prompt construction
// (from reverse engineering analysis):
//   1. Core identity
//   2. System instructions (behavioral rules)
//   3. Tool definitions (JSON schemas)
//   4. Permission mode instructions
//   5. CLAUDE.md content (global → project)
//   6. Environment metadata (cwd, git, OS, date, model)
//   7. Output style block
//   8. system-reminder tags (runtime injected)
//   9. Few-shot examples
//  10. Anti-pattern rules (NEVER, MUST, DO NOT)

const SECTION_ORDER = [
  'core-identity',
  'system-instructions',
  'tool-definitions',
  'permission-mode',
  'claude-md',
  'environment',
  'output-style',
  'system-reminders',
  'few-shot-examples',
  'anti-pattern-rules',
];

// Default stability ratings for cache optimization
const STABILITY = {
  'core-identity': 1.0,
  'system-instructions': 1.0,
  'tool-definitions': 1.0,
  'permission-mode': 0.95,
  'claude-md': 0.95,
  'environment': 0.5,
  'output-style': 0.9,
  'system-reminders': 0.3,
  'few-shot-examples': 0.8,
  'anti-pattern-rules': 1.0,
};

// Claude model context limits
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

/**
 * Approximate token estimation using ~4 chars per token for English text.
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text) return 0;
  // Hybrid: average of char-based and word-based estimates
  const chars = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((chars / 4 + words * 1.3) / 2));
}

// Default section content from Claude Code RE analysis
const DEFAULT_SECTIONS = {
  'core-identity': {
    content: [
      'You are Claude Code, an interactive CLI tool built by Anthropic.',
      'You are an expert software engineer with deep knowledge of programming languages, frameworks, design patterns, and best practices.',
      'You assist users with software engineering tasks including writing code, debugging, refactoring, testing, and code review.',
    ].join('\n'),
    estimatedTokens: 80,
    cacheable: true,
  },
  'system-instructions': {
    content: [
      '# Doing tasks',
      '- Read files before editing. Understand existing code before suggesting modifications.',
      '- Do not create files unless absolutely necessary. Prefer editing existing files.',
      '- Be careful not to introduce security vulnerabilities (command injection, XSS, SQL injection, OWASP top 10).',
      '- Avoid over-engineering. Only make changes that are directly requested or clearly necessary.',
      '',
      '# Using your tools',
      '- Use Read instead of cat/head/tail. Use Edit instead of sed/awk. Use Write instead of echo redirection.',
      '- Use Glob instead of find or ls for file search. Use Grep instead of grep or rg for content search.',
      '- Break down work with TodoWrite. Mark each task completed as soon as done.',
      '- Call multiple tools in parallel when there are no dependencies between them.',
    ].join('\n'),
    estimatedTokens: 600,
    cacheable: true,
  },
  'tool-definitions': {
    content: '<!-- Tool definitions are injected by Claude Code runtime -->\n<!-- Includes: Read, Write, Edit, Bash, Glob, Grep, Agent, TodoWrite, WebFetch, WebSearch, etc. -->',
    estimatedTokens: 1000,
    cacheable: true,
  },
  'permission-mode': {
    content: [
      '# Permission modes',
      '- Tools are executed in a user-selected permission mode.',
      '- When a tool is not automatically allowed, the user will be prompted to approve or deny.',
      '- If user denies a tool call, do not re-attempt. Adjust your approach.',
    ].join('\n'),
    estimatedTokens: 120,
    cacheable: true,
  },
  'claude-md': {
    content: '<!-- CLAUDE.md content loaded at runtime from ~/.claude/CLAUDE.md and project CLAUDE.md -->',
    estimatedTokens: 800,
    cacheable: true,
  },
  'environment': {
    content: [
      '# Environment',
      '- Primary working directory: $CWD',
      '- Platform: $PLATFORM',
      '- Shell: $SHELL',
      '- OS Version: $OS_VERSION',
      '- Model: $MODEL_NAME',
      '- Current date: $DATE',
    ].join('\n'),
    estimatedTokens: 150,
    cacheable: false,
  },
  'output-style': {
    content: [
      '# Tone and style',
      '- Only use emojis if the user explicitly requests it.',
      '- Responses should be short and concise.',
      '- When referencing code include file_path:line_number pattern.',
      '- Do not use a colon before tool calls.',
      '- Use Github-flavored markdown for formatting.',
    ].join('\n'),
    estimatedTokens: 120,
    cacheable: true,
  },
  'system-reminders': {
    content: '<!-- <system-reminder> tags injected at runtime: budget, date, skill list, etc. -->',
    estimatedTokens: 200,
    cacheable: false,
  },
  'few-shot-examples': {
    content: '',
    estimatedTokens: 0,
    cacheable: true,
  },
  'anti-pattern-rules': {
    content: [
      '# Critical rules',
      '- NEVER generate or guess URLs unless confident they help with programming.',
      '- NEVER use destructive git commands without explicit user request.',
      '- NEVER skip hooks (--no-verify) unless explicitly asked.',
      '- NEVER commit changes unless explicitly asked.',
      '- MUST read files before editing them.',
      '- DO NOT create documentation files unless explicitly requested.',
      '- DO NOT add features, refactor code, or make improvements beyond what was asked.',
    ].join('\n'),
    estimatedTokens: 150,
    cacheable: true,
  },
};

export class PromptAssembler {
  /**
   * Create a new PromptAssembler for building structured system prompts.
   * Pre-populates with Claude Code's default 10-section structure.
   * @param {PromptAssembler|null} [parentAssembler=null] - Optional parent assembler for template inheritance
   * @example
   * const prompt = new PromptAssembler();
   * prompt.addSection('task', 'Implement authentication middleware.');
   * const assembled = prompt.assemble();
   */
  constructor(parentAssembler = null) {
    this._sections = new Map();
    this._conditions = new Map();
    this._parent = parentAssembler;
    // Pre-populate with defaults
    for (const name of SECTION_ORDER) {
      const def = DEFAULT_SECTIONS[name];
      if (def) {
        this._sections.set(name, {
          name,
          content: def.content,
          priority: SECTION_ORDER.indexOf(name),
          cacheable: def.cacheable,
          estimatedTokens: def.estimatedTokens,
          stability: STABILITY[name] ?? 0.5,
        });
      }
    }
  }

  /**
   * Add or replace a section in the prompt assembler.
   * @param {string} name - Section identifier (e.g., 'core-identity', 'system-instructions')
   * @param {string} content - The text content for this section
   * @param {Object} [options] - Configuration options
   * @param {number} [options.priority] - Section priority for ordering (lower = earlier)
   * @param {boolean} [options.cacheable] - Whether this section can be cached
   * @param {number} [options.estimatedTokens] - Estimated token count (auto-calculated if omitted)
   * @param {number} [options.stability] - Stability score 0-1 (higher = more stable/cacheable)
   * @param {Function} [options.condition] - Conditional function to determine if section should be included
   * @returns {PromptAssembler} Returns this for method chaining
   */
  addSection(name, content, options = {}) {
    try {
      // Validate inputs
      if (!name || typeof name !== 'string') {
        throw new Error('name must be a non-empty string');
      }
      if (content === null || content === undefined) {
        throw new Error('content cannot be null or undefined');
      }
      if (typeof content !== 'string') {
        throw new Error('content must be a string');
      }
      if (options.priority !== undefined && (typeof options.priority !== 'number' || options.priority < 0)) {
        throw new Error('priority must be a non-negative number');
      }

      const priority = options.priority ?? (SECTION_ORDER.includes(name)
        ? SECTION_ORDER.indexOf(name)
        : SECTION_ORDER.length + this._sections.size);
      const cacheable = options.cacheable ?? (STABILITY[name] ?? 0) >= 0.8;
      const estimatedTokens = options.estimatedTokens ?? estimateTokens(content);
      const stability = options.stability ?? STABILITY[name] ?? 0.5;

      this._sections.set(name, {
        name,
        content,
        priority,
        cacheable,
        estimatedTokens,
        stability,
      });

      if (options.condition) {
        this._conditions.set(name, options.condition);
      }

      return this;
    } catch (error) {
      throw new Error(`addSection failed: ${error.message}`);
    }
  }

  /**
   * Get a section by name.
   * @param {string} name - Section identifier
   * @returns {Object|null} Section object or null if not found
   */
  getSection(name) {
    return this._sections.get(name) ?? null;
  }

  /**
   * Remove a section from the assembler.
   * @param {string} name - Section identifier to remove
   * @returns {PromptAssembler} Returns this for method chaining
   */
  removeSection(name) {
    this._sections.delete(name);
    this._conditions.delete(name);
    return this;
  }

  /**
   * List all section names in assembly order.
   * @returns {string[]} Array of section names in priority order
   */
  sectionNames() {
    return this._orderedSections().map(s => s.name);
  }

  // Get sections sorted by priority, with template inheritance support
  _orderedSections() {
    const sections = [];
    const seen = new Set();

    // Collect sections from this assembler
    for (const section of this._sections.values()) {
      // Check conditional inclusion
      const condition = this._conditions.get(section.name);
      if (condition && !condition()) continue;
      sections.push(section);
      seen.add(section.name);
    }

    // Inherit sections from parent if not overridden
    if (this._parent) {
      for (const section of this._parent._orderedSections()) {
        if (!seen.has(section.name)) {
          sections.push(section);
        }
      }
    }

    sections.sort((a, b) => a.priority - b.priority);
    return sections;
  }

  /**
   * Set section priority for custom ordering.
   * @param {string} name - Section name
   * @param {number} priority - New priority value (lower = earlier in output)
   * @returns {PromptAssembler} Returns this for method chaining
   */
  setPriority(name, priority) {
    if (typeof priority !== 'number' || priority < 0) {
      throw new Error('priority must be a non-negative number');
    }
    const section = this._sections.get(name);
    if (!section) {
      throw new Error(`Section not found: ${name}`);
    }
    section.priority = priority;
    return this;
  }

  /**
   * Reorder sections by providing a new section order array.
   * @param {string[]} sectionNames - Array of section names in desired order
   * @returns {PromptAssembler} Returns this for method chaining
   */
  reorder(sectionNames) {
    if (!Array.isArray(sectionNames)) {
      throw new Error('sectionNames must be an array');
    }
    for (let i = 0; i < sectionNames.length; i++) {
      const name = sectionNames[i];
      const section = this._sections.get(name);
      if (section) {
        section.priority = i;
      }
    }
    return this;
  }

  /**
   * Assemble full prompt string with sections in correct priority order.
   * @returns {string} Complete assembled prompt text
   */
  assemble() {
    try {
      const sections = this._orderedSections();
      const parts = [];
      for (const section of sections) {
        if (!section.content || section.content.trim() === '') continue;
        parts.push(section.content);
      }
      return parts.join('\n\n');
    } catch (error) {
      throw new Error(`assemble failed: ${error.message}`);
    }
  }

  /**
   * Split assembled prompt into cacheable prefix and variable suffix for prompt caching optimization.
   * @returns {{cacheablePrefix: string, variableSuffix: string}} Object with cacheable and variable parts
   */
  assembleCacheable() {
    try {
      const sections = this._orderedSections();
      const cacheableParts = [];
      const variableParts = [];

      for (const section of sections) {
        if (!section.content || section.content.trim() === '') continue;
        if (section.cacheable && section.stability >= 0.8) {
          cacheableParts.push(section.content);
        } else {
          variableParts.push(section.content);
        }
      }

      return {
        cacheablePrefix: cacheableParts.join('\n\n'),
        variableSuffix: variableParts.join('\n\n'),
      };
    } catch (error) {
      throw new Error(`assembleCacheable failed: ${error.message}`);
    }
  }

  /**
   * Estimate total tokens across all active sections.
   * @returns {number} Total estimated token count
   */
  estimateTotalTokens() {
    let total = 0;
    for (const section of this._orderedSections()) {
      total += section.estimatedTokens;
    }
    return total;
  }

  /**
   * Validate the assembled prompt against model context limits.
   * @param {string} [modelName='claude-sonnet-4'] - Target model name for validation
   * @returns {{valid: boolean, warnings: string[], errors: string[], totalTokens: number, maxContext: number, utilization: number}} Validation result with warnings and errors
   */
  validate(modelName = 'claude-sonnet-4') {
    try {
      if (!modelName || typeof modelName !== 'string') {
        throw new Error('modelName must be a non-empty string');
      }

      const maxContext = MODEL_CONTEXTS[modelName] ?? 200000;
      const totalTokens = this.estimateTotalTokens();
      const warnings = [];
      const errors = [];

      // Check total size
      if (totalTokens > maxContext) {
        errors.push(`Total tokens (${totalTokens}) exceed ${modelName} context limit (${maxContext})`);
      } else if (totalTokens > maxContext * 0.5) {
        warnings.push(`System prompt uses ${((totalTokens / maxContext) * 100).toFixed(1)}% of context — may cause frequent compaction`);
      }

      // Check for empty critical sections
      for (const name of ['core-identity', 'system-instructions']) {
        const section = this._sections.get(name);
        if (!section || !section.content || section.content.trim() === '') {
          warnings.push(`Section '${name}' is empty — this is a critical section`);
        }
      }

      // Check for duplicate content across sections
      const contents = [];
      for (const section of this._sections.values()) {
        if (section.content) contents.push({ name: section.name, content: section.content });
      }
      for (let i = 0; i < contents.length; i++) {
        for (let j = i + 1; j < contents.length; j++) {
          if (contents[i].content === contents[j].content && contents[i].content.trim() !== '') {
            warnings.push(`Sections '${contents[i].name}' and '${contents[j].name}' have identical content`);
          }
        }
      }

      // Check for oversized individual sections
      for (const section of this._orderedSections()) {
        if (section.estimatedTokens > 10000) {
          warnings.push(`Section '${section.name}' is very large (${section.estimatedTokens} tokens)`);
        }
      }

      return {
        valid: errors.length === 0,
        warnings,
        errors,
        totalTokens,
        maxContext,
        utilization: totalTokens / maxContext,
      };
    } catch (error) {
      throw new Error(`validate failed: ${error.message}`);
    }
  }

  /**
   * Export assembler as a prompt-studio template with YAML frontmatter.
   * @param {string} [name='custom-prompt'] - Template name
   * @param {string} [description='Custom assembled prompt'] - Template description
   * @returns {string} Template with YAML frontmatter and markdown body
   */
  toTemplate(name = 'custom-prompt', description = 'Custom assembled prompt') {
    const assembled = this.assemble();
    const totalTokens = this.estimateTotalTokens();
    const sectionList = this.sectionNames().join(', ');

    const frontmatter = [
      '---',
      `name: ${name}`,
      `description: ${description}`,
      'category: assembled',
      'author: prompt-studio assembler',
      'version: 1.0.0',
      `tags: assembled, ${sectionList}`,
      'use_with: --system-prompt',
      '---',
    ].join('\n');

    return `${frontmatter}\n\n${assembled}\n`;
  }
}

// Named exports for convenience
export { SECTION_ORDER, STABILITY, MODEL_CONTEXTS, DEFAULT_SECTIONS, estimateTokens };
