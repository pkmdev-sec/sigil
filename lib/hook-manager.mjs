/**
 * hook-manager.mjs — Manage prompt-studio hook installation and active templates
 *
 * Provides functions to install/uninstall the UserPromptSubmit hook
 * in ~/.claude/settings.json and manage the active template state.
 */

import { readFile, writeFile, unlink, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const STUDIO_DIR = process.env.STUDIO_DIR || join(homedir(), ".claude", "prompt-studio");
const SETTINGS_FILE = join(homedir(), ".claude", "settings.json");
const ACTIVE_TEMPLATE_FILE = join(STUDIO_DIR, ".active-template");
const TEMPLATES_DIR = join(STUDIO_DIR, "templates");
const HOOK_SCRIPT = join(STUDIO_DIR, "hooks", "prompt-studio-inject.py");

const HOOK_COMMAND = `python3 ${HOOK_SCRIPT}`;

/**
 * Read and parse ~/.claude/settings.json, returning {} if missing or invalid.
 */
async function readSettings() {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Write settings back to ~/.claude/settings.json with pretty formatting.
 */
async function writeSettings(settings) {
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

/**
 * Install the prompt-studio hook into ~/.claude/settings.json.
 *
 * Adds a UserPromptSubmit hook entry pointing to the inject script.
 * Idempotent — will not duplicate if already installed.
 *
 * @returns {{ installed: boolean, message: string }}
 * @example
 * const result = await installHook();
 * console.log(result.message); // "Hook installed successfully" or "Hook already installed"
 */
export async function installHook() {
  try {
    const settings = await readSettings();

    // Ensure hooks section exists
    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (!settings.hooks.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = [];
    }

    // Normalize: if it's not an array, wrap it
    if (!Array.isArray(settings.hooks.UserPromptSubmit)) {
      settings.hooks.UserPromptSubmit = [settings.hooks.UserPromptSubmit];
    }

    // Check if already installed
    const existing = settings.hooks.UserPromptSubmit.find(
      (h) => {
        const cmd = typeof h === "string" ? h : h?.command;
        return cmd && cmd.includes("prompt-studio-inject");
      }
    );

    if (existing) {
      return { installed: false, message: "Hook already installed" };
    }

    // Add the hook entry
    settings.hooks.UserPromptSubmit.push({
      command: HOOK_COMMAND,
      description: "prompt-studio: inject active template context"
    });

    await writeSettings(settings);

    return { installed: true, message: "Hook installed successfully" };
  } catch (error) {
    throw new Error(`installHook failed: ${error.message}`);
  }
}

/**
 * Uninstall the prompt-studio hook from ~/.claude/settings.json.
 *
 * Removes any UserPromptSubmit hook entry that references prompt-studio-inject.
 *
 * @returns {{ uninstalled: boolean, message: string }}
 * @example
 * const result = await uninstallHook();
 * console.log(result.message); // "Hook uninstalled successfully"
 */
export async function uninstallHook() {
  try {
    const settings = await readSettings();

    if (!settings.hooks?.UserPromptSubmit) {
      return { uninstalled: false, message: "No hooks configured" };
    }

    if (!Array.isArray(settings.hooks.UserPromptSubmit)) {
      settings.hooks.UserPromptSubmit = [settings.hooks.UserPromptSubmit];
    }

    const before = settings.hooks.UserPromptSubmit.length;
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
      (h) => {
        const cmd = typeof h === "string" ? h : h?.command;
        return !(cmd && cmd.includes("prompt-studio-inject"));
      }
    );
    const after = settings.hooks.UserPromptSubmit.length;

    // Clean up empty arrays
    if (settings.hooks.UserPromptSubmit.length === 0) {
      delete settings.hooks.UserPromptSubmit;
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    await writeSettings(settings);

    if (before === after) {
      return { uninstalled: false, message: "Hook was not installed" };
    }

    return { uninstalled: true, message: "Hook uninstalled successfully" };
  } catch (error) {
    throw new Error(`uninstallHook failed: ${error.message}`);
  }
}

/**
 * Set the active template by name.
 * Validates that the template file exists before setting.
 *
 * @param {string} templateName — Template name (without .md extension)
 * @returns {{ set: boolean, message: string }}
 * @example
 * const result = await setActiveTemplate('security-audit');
 * console.log(result.message); // "Active template set to: security-audit"
 */
export async function setActiveTemplate(templateName) {
  try {
    if (!templateName || typeof templateName !== "string") {
      return { set: false, message: "Template name is required" };
    }

    const templateFile = join(TEMPLATES_DIR, `${templateName}.md`);

    try {
      await access(templateFile);
    } catch {
      return { set: false, message: `Template not found: ${templateName}` };
    }

    await writeFile(ACTIVE_TEMPLATE_FILE, templateName + "\n", "utf-8");
    return { set: true, message: `Active template set to: ${templateName}` };
  } catch (error) {
    throw new Error(`setActiveTemplate failed: ${error.message}`);
  }
}

/**
 * Get the currently active template name.
 *
 * @returns {string|null} — Template name or null if none active
 * @example
 * const active = await getActiveTemplate();
 * if (active) {
 *   console.log(`Currently active: ${active}`);
 * }
 */
export async function getActiveTemplate() {
  try {
    try {
      const raw = await readFile(ACTIVE_TEMPLATE_FILE, "utf-8");
      const name = raw.trim();
      return name || null;
    } catch {
      return null;
    }
  } catch (error) {
    throw new Error(`getActiveTemplate failed: ${error.message}`);
  }
}

/**
 * Clear the active template (removes .active-template file).
 *
 * @returns {{ cleared: boolean, message: string }}
 * @example
 * const result = await clearActiveTemplate();
 * console.log(result.message); // "Active template cleared"
 */
export async function clearActiveTemplate() {
  try {
    try {
      await unlink(ACTIVE_TEMPLATE_FILE);
      return { cleared: true, message: "Active template cleared" };
    } catch (err) {
      if (err.code === "ENOENT") {
        return { cleared: false, message: "No active template was set" };
      }
      throw err;
    }
  } catch (error) {
    throw new Error(`clearActiveTemplate failed: ${error.message}`);
  }
}
