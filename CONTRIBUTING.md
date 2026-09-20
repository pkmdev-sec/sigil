# Contributing to SIGIL

Thank you for your interest in contributing to SIGIL! This document provides guidelines for contributing to the project.

## How to Contribute

We welcome contributions of all kinds:

- Bug reports and feature requests
- Documentation improvements
- Code contributions (bug fixes, new features, optimizations)
- New sigil templates
- Testing and validation

## Reporting Bugs

When reporting bugs, please include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Your environment (OS, Node.js version, Claude Code version)
- Any relevant error messages or logs
- Screenshots if applicable

Create an issue on GitHub with these details.

## Suggesting Features

When suggesting new features:

- Check if the feature has already been requested
- Provide a clear description of the feature
- Explain the use case and why it would be valuable
- Include examples of how the feature would be used
- Consider implementation complexity and maintainability

## Pull Requests

### Before Submitting

1. Check that your code works with the latest version
2. Run tests: `npm test`
3. Ensure your changes don't break existing functionality
4. Update documentation if needed
5. Follow the code style guidelines

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Commit with clear, descriptive messages (see Commit Messages below)
5. Push to your fork
6. Open a pull request with a clear description of:
   - What changes you made
   - Why you made them
   - Any relevant issue numbers

### Pull Request Guidelines

- Keep pull requests focused on a single feature or fix
- Include tests for new functionality
- Update documentation for user-facing changes
- Respond to feedback and review comments
- Be patient - maintainers review PRs as time permits

## Code Style

- Use ES modules (`.mjs` files)
- Follow existing code formatting and conventions
- Write clear, self-documenting code
- Add comments for complex logic
- Use descriptive variable and function names
- Keep functions focused and single-purpose
- Avoid deeply nested code

### JavaScript Style

- Use `const` by default, `let` when reassignment is needed
- Use template literals for string interpolation
- Use arrow functions for callbacks
- Use async/await for asynchronous code
- Handle errors appropriately

## Running Tests

Run the test suite:

```bash
npm test
```

Tests are located in the `tests/` directory. When adding new features, include corresponding tests.

## Commit Messages

Use conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(cache): add cache-analyze command for optimization insights

Implements a new command that analyzes sigil templates for caching
opportunities and provides optimization recommendations.

Closes #42
```

```
fix(assembler): handle empty frontmatter gracefully

Previously crashed when encountering sigils with empty YAML frontmatter.
Now defaults to empty object and continues processing.

Fixes #56
```

```
docs(readme): update installation instructions

Clarifies prerequisites and adds troubleshooting section.
```

## Adding New Sigils

When contributing new sigil templates:

1. Place them in `sigils/` directory
2. Include complete YAML frontmatter
3. Provide clear, actionable instructions
4. Test with all target models (opus/sonnet/haiku)
5. Validate token budgets
6. Document the use case in comments

## Questions?

If you have questions about contributing, feel free to:

- Open an issue on GitHub
- Check existing issues and discussions
- Review the documentation in `docs/`

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Assume good intentions
- Keep discussions professional

Thank you for contributing to SIGIL!
