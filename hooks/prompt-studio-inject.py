#!/usr/bin/env python3
"""
prompt-studio-inject — Claude Code Hook (UserPromptSubmit)

Intercepts user prompts and injects active template context as a system-reminder.
When an active template is set via prompt-studio, this hook reads it and prepends
the template instructions to the user's session.

Hook type: UserPromptSubmit
Output: JSON with 'result' field ('continue' or 'block') and optional modifications.
"""

import json
import os
import sys

STUDIO_DIR = os.environ.get("STUDIO_DIR", os.path.expanduser("~/.claude/prompt-studio"))
ACTIVE_TEMPLATE_FILE = os.path.join(STUDIO_DIR, ".active-template")
TEMPLATES_DIR = os.path.join(STUDIO_DIR, "templates")


def read_active_template():
    """Read the currently active template name from .active-template file."""
    if not os.path.isfile(ACTIVE_TEMPLATE_FILE):
        return None
    with open(ACTIVE_TEMPLATE_FILE, "r") as f:
        name = f.read().strip()
    return name if name else None


def load_template(name):
    """Load and parse a template file, returning the body (after frontmatter)."""
    template_file = os.path.join(TEMPLATES_DIR, f"{name}.md")
    if not os.path.isfile(template_file):
        return None

    with open(template_file, "r") as f:
        content = f.read()

    # Strip YAML frontmatter (between --- markers)
    lines = content.split("\n")
    if lines and lines[0].strip() == "---":
        end_idx = -1
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                end_idx = i
                break
        if end_idx > 0:
            body = "\n".join(lines[end_idx + 1:]).strip()
            return body

    return content.strip()


def main():
    # Read hook input from stdin
    try:
        raw_input = sys.stdin.read()
        hook_input = json.loads(raw_input) if raw_input.strip() else {}
    except (json.JSONDecodeError, IOError):
        hook_input = {}

    # Check for active template
    template_name = read_active_template()

    if not template_name:
        # No active template — pass through unchanged
        result = {
            "result": "continue"
        }
        print(json.dumps(result))
        return

    # Load the template body
    template_body = load_template(template_name)

    if not template_body:
        # Template file not found — warn but continue
        result = {
            "result": "continue",
            "message": f"Warning: active template '{template_name}' not found"
        }
        print(json.dumps(result))
        return

    # Inject the template as a system-reminder prefix to the user's message
    user_message = hook_input.get("message", "")

    injected_prefix = (
        f"<system-reminder>\n"
        f"[prompt-studio: {template_name}]\n"
        f"{template_body}\n"
        f"</system-reminder>\n\n"
    )

    modified_message = injected_prefix + user_message

    result = {
        "result": "continue",
        "message": f"Injected template: {template_name}",
        "modifiedMessage": modified_message
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
