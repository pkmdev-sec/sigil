/**
 * model-variants.mjs — Generate model-specific prompt variants
 *
 * Adapts templates for different Claude model tiers (Opus, Sonnet, Haiku)
 * based on each model's strengths, cost characteristics, and capabilities.
 */

// ─── Model Characteristics ──────────────────────────────────────────

const MODEL_PROFILES = {
  opus: {
    name: "Claude Opus 4",
    tier: "premium",
    reasoning: "best",
    cost: "highest",
    supportsExtendedThinking: true,
    strengths: ["complex reasoning", "nuanced analysis", "multi-step planning", "creative tasks"],
    contextStrategy: "full",
    description: "Best reasoning, highest cost, supports extended thinking",
  },
  sonnet: {
    name: "Claude Sonnet 4",
    tier: "balanced",
    reasoning: "good",
    cost: "moderate",
    supportsExtendedThinking: false,
    strengths: ["implementation", "code generation", "balanced analysis", "general tasks"],
    contextStrategy: "concise",
    description: "Balanced capability, 5x cheaper than Opus, good for implementation",
  },
  haiku: {
    name: "Claude Haiku 4.5",
    tier: "fast",
    reasoning: "basic",
    cost: "lowest",
    supportsExtendedThinking: false,
    strengths: ["simple tasks", "quick responses", "classification", "extraction"],
    contextStrategy: "minimal",
    description: "Fastest and cheapest, good for simple focused tasks",
  },
};

// ─── Section Parsing ────────────────────────────────────────────────

function parseSections(template) {
  const lines = template.split("\n");
  const sections = [];
  let currentHeading = "";
  let currentLines = [];

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      if (currentHeading || currentLines.length > 0) {
        sections.push({ heading: currentHeading, body: currentLines.join("\n").trim() });
      }
      currentHeading = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentHeading || currentLines.length > 0) {
    sections.push({ heading: currentHeading, body: currentLines.join("\n").trim() });
  }

  return sections;
}

function reassemble(sections) {
  return sections
    .map((s) => (s.heading ? s.heading + "\n\n" + s.body : s.body))
    .join("\n\n")
    .trim();
}

// ─── Example Detection ──────────────────────────────────────────────

function containsExamples(text) {
  return /```[\s\S]*?```|example:|for example|e\.g\.|such as:/i.test(text);
}

function stripExamples(text) {
  // Remove fenced code blocks
  let cleaned = text.replace(/```[\s\S]*?```/g, "");
  // Remove lines starting with "Example:" or "For example:"
  cleaned = cleaned.replace(/^(?:for\s+)?example:.*$/gim, "");
  // Remove "e.g., ..." clauses
  cleaned = cleaned.replace(/\s*e\.g\.,?\s*[^.;]+[.;]?/gi, ".");
  // Remove "such as ..." clauses
  cleaned = cleaned.replace(/\s*such\s+as:?\s*[^.;]+[.;]?/gi, ".");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

function keepOnlyKeyExamples(text) {
  // Keep at most one code block example
  const blocks = text.match(/```[\s\S]*?```/g) || [];
  if (blocks.length <= 1) return text;

  let result = text;
  for (let i = 1; i < blocks.length; i++) {
    result = result.replace(blocks[i], "");
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Variant Generators ─────────────────────────────────────────────

function generateOpusVariant(template) {
  const sections = parseSections(template);

  // Opus gets full instructions with thinking hints
  const enriched = sections.map((s) => {
    let body = s.body;

    // Add thinking hints for complex sections
    if (/analys|review|audit|evaluat|assess/i.test(s.heading + " " + body)) {
      if (!body.includes("think deeply")) {
        body += "\n\nThink deeply about edge cases and non-obvious implications before responding.";
      }
    }

    return { heading: s.heading, body };
  });

  // Prepend thinking instruction
  const thinkingHint = {
    heading: "",
    body: "Use extended thinking to reason through complex aspects of this task step by step before providing your response.",
  };

  return reassemble([thinkingHint, ...enriched]);
}

function generateSonnetVariant(template) {
  const sections = parseSections(template);

  // Sonnet gets concise instructions with key examples only
  const trimmed = sections.map((s) => {
    let body = s.body;

    // Keep only key examples, remove verbose ones
    if (containsExamples(body)) {
      body = keepOnlyKeyExamples(body);
    }

    // Trim overly long sections (keep first ~500 chars of body)
    if (body.length > 600) {
      const cutPoint = body.indexOf("\n", 450);
      if (cutPoint > 0 && cutPoint < 600) {
        body = body.substring(0, cutPoint).trim();
      }
    }

    return { heading: s.heading, body };
  });

  return reassemble(trimmed);
}

function generateHaikuVariant(template) {
  const sections = parseSections(template);

  // Haiku gets minimal instructions: no examples, single-focus
  const minimal = sections
    .filter((s) => {
      // Keep only essential sections (headings with key terms)
      if (!s.heading) return true; // Keep preamble
      const h = s.heading.toLowerCase();
      // Skip example-only sections, detailed explanation sections
      return !/example|appendix|detail|reference|background/i.test(h);
    })
    .map((s) => {
      let body = s.body;

      // Strip all examples
      if (containsExamples(body)) {
        body = stripExamples(body);
      }

      // Aggressively trim — keep first meaningful paragraph
      const paragraphs = body.split(/\n\n+/);
      if (paragraphs.length > 2) {
        body = paragraphs.slice(0, 2).join("\n\n");
      }

      return { heading: s.heading, body };
    })
    .filter((s) => s.body.trim().length > 0);

  // Limit to top 4 sections
  const limited = minimal.slice(0, 4);

  return reassemble(limited);
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Generate model-specific variants of a base template optimized for each model tier.
 * Opus gets full details with thinking hints, Sonnet gets concise version, Haiku gets minimal version.
 * @param {string} baseTemplate — The original template content
 * @returns {{ opus: string, sonnet: string, haiku: string }} Object with variants for each model tier
 * @example
 * const template = "Review this code for security issues. Check for SQL injection, XSS, and auth flaws.";
 * const variants = generateVariants(template);
 * console.log(variants.opus);    // Full version with thinking hints
 * console.log(variants.sonnet);  // Concise version
 * console.log(variants.haiku);   // Minimal action-focused version
 */
export function generateVariants(baseTemplate) {
  try {
    if (!baseTemplate || typeof baseTemplate !== "string") {
      return { opus: "", sonnet: "", haiku: "" };
    }

    return {
      opus: generateOpusVariant(baseTemplate),
      sonnet: generateSonnetVariant(baseTemplate),
      haiku: generateHaikuVariant(baseTemplate),
    };
  } catch (error) {
    throw new Error(`generateVariants failed: ${error.message}`);
  }
}

/**
 * Select the appropriate variant for a given model name.
 * Automatically detects model tier from name and returns optimized variant.
 * @param {string} template — The base template content
 * @param {string} modelName — Model identifier (e.g., "claude-opus-4", "claude-sonnet-4", "claude-haiku-3.5")
 * @returns {string} The model-appropriate variant
 * @example
 * const template = "Debug this authentication error and propose a fix.";
 * const opusVersion = selectVariant(template, 'claude-opus-4');
 * const haikuVersion = selectVariant(template, 'claude-haiku-3.5');
 */
export function selectVariant(template, modelName) {
  try {
    if (!template || !modelName) return template || "";

    const name = modelName.toLowerCase();
    const variants = generateVariants(template);

    if (name.includes("opus")) return variants.opus;
    if (name.includes("haiku")) return variants.haiku;
    // Default to sonnet for unknown models (balanced)
    return variants.sonnet;
  } catch (error) {
    throw new Error(`selectVariant failed: ${error.message}`);
  }
}

/**
 * Enrich a template with model-specific additions and metadata.
 * Adds optimization hints and behavioral guidance specific to the model tier.
 * @param {string} template — The base template content
 * @param {string} modelName — Model identifier
 * @returns {string} Template with model-specific enrichments and optimization comments
 * @example
 * const template = "Refactor this legacy code for maintainability.";
 * const enriched = enrichForModel(template, 'claude-opus-4');
 * // Adds: extended thinking hints, model capabilities metadata
 */
export function enrichForModel(template, modelName) {
  try {
    if (!template || !modelName) return template || "";

    const name = modelName.toLowerCase();
    let profile;

    if (name.includes("opus")) profile = MODEL_PROFILES.opus;
    else if (name.includes("haiku")) profile = MODEL_PROFILES.haiku;
    else profile = MODEL_PROFILES.sonnet;

    const variant = selectVariant(template, modelName);

    // Add model-specific preamble
    const preamble = `<!-- Optimized for ${profile.name} (${profile.description}) -->`;

    let enriched = preamble + "\n\n" + variant;

    // Add model-specific behavioral hints
    if (profile.supportsExtendedThinking) {
      enriched += "\n\n> Use extended thinking for complex reasoning steps.";
    }

    if (profile.tier === "fast") {
      enriched += "\n\n> Focus on the single most important aspect. Be direct and concise.";
    }

    if (profile.tier === "balanced") {
      enriched += "\n\n> Balance thoroughness with efficiency. Prioritize actionable output.";
    }

    return enriched;
  } catch (error) {
    throw new Error(`enrichForModel failed: ${error.message}`);
  }
}

/**
 * Get the model profile information including capabilities and characteristics.
 * @param {string} modelName — Model identifier
 * @returns {object} Model profile with tier, reasoning capability, cost, and strengths
 * @example
 * const profile = getModelProfile('claude-opus-4');
 * console.log(profile.tier);              // "premium"
 * console.log(profile.reasoning);         // "best"
 * console.log(profile.supportsExtendedThinking); // true
 */
export function getModelProfile(modelName) {
  if (!modelName) return MODEL_PROFILES.sonnet;
  const name = modelName.toLowerCase();
  if (name.includes("opus")) return MODEL_PROFILES.opus;
  if (name.includes("haiku")) return MODEL_PROFILES.haiku;
  return MODEL_PROFILES.sonnet;
}
