# Gemini CLI Fixtures

This directory contains plain text output samples from Gemini CLI.

## Gemini CLI Output Format

**Important**: As of version 0.1.x, Gemini CLI does NOT support JSONL output. It outputs plain text
responses directly to stdout.

The CLI outputs:

- A system message "Loaded cached credentials." at startup
- Plain text responses from the model
- Code blocks formatted with markdown-style triple backticks
- Empty lines for paragraph separation

## Common Patterns

- **System messages**: "Loaded cached credentials." (filtered out by parser)
- **Content**: Direct text output from the model
- **Code blocks**: Wrapped in ``` with optional language identifier
- **Multi-line responses**: Each line is treated as part of the assistant's response

## Capture Examples

```bash
# Basic content generation
gemini -p "explain the concept of dependency injection"

# Code generation
gemini -p "write a hello world function in Python"

# Interactive mode
gemini

# Using input file
gemini -p "summarize this" -f document.txt
```

## Notes

- Gemini CLI (v0.1.x) does not have a --jsonl or --stream-json flag
- All output is plain text streamed to stdout
- The parser treats each non-empty line as an assistant message
- System messages like "Loaded cached credentials." are filtered out
- Empty lines are preserved for formatting but don't generate events
