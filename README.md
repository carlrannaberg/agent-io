# Agent-IO

[![npm version](https://badge.fury.io/js/@agent-io%2Fstream.svg)](https://www.npmjs.com/package/@agent-io/stream)
[![CI Status](https://github.com/yourusername/agent-io/workflows/CI/badge.svg)](https://github.com/yourusername/agent-io/actions)
[![codecov](https://codecov.io/gh/yourusername/agent-io/branch/main/graph/badge.svg)](https://codecov.io/gh/yourusername/agent-io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Agent-IO** is a universal I/O toolkit for AI agent CLIs that normalizes output from Claude Code,
Gemini CLI, Amp Code, Cursor Agent, and other AI assistants into unified event streams with beautiful terminal and
HTML rendering.

## Overview

Working with different AI agent CLIs means dealing with different output formats. Agent-IO solves
this by providing:

- 🚀 **Universal Format**: Normalize JSONL outputs from Claude, Gemini, Amp, Cursor, and more
- 🎨 **Beautiful Rendering**: ANSI colors for terminals, semantic HTML for web
- 📊 **High Performance**: 2-3M lines/second throughput with constant memory usage
- 🔄 **True Streaming**: Process infinite streams without buffering
- 🛠️ **Modular Architecture**: Pick only the packages you need
- 🔒 **Type Safe**: Full TypeScript support with comprehensive types

## Monorepo Structure

Agent-IO is organized as a monorepo with focused, composable packages:

```
agent-io/
├── packages/
│   ├── core/           # @agent-io/core - Shared types and utilities
│   ├── jsonl/          # @agent-io/jsonl - JSONL parsers for AI CLIs
│   ├── stream/         # @agent-io/stream - Main streaming formatter
│   └── invoke/         # @agent-io/invoke - CLI invocation tools
├── docs/               # Documentation
├── examples/           # Usage examples
├── fixtures/           # Test fixtures from real CLI outputs
├── scripts/            # Development and build scripts
├── specs/              # Technical specifications
└── tests/              # Integration tests
```

## Quick Start

### Installation

```bash
# Install the main formatter (includes CLI)
npm install -g @agent-io/stream
```

### CLI Usage

```bash
# Auto-detect format and display in terminal
claude --output-format stream-json --verbose -p "explain recursion" | aio-stream

# Process Gemini CLI plain text output
gemini -p "explain recursion" | aio-stream --vendor gemini

# Process Amp output
echo "explain recursion" | amp | aio-stream --vendor amp

# Process Cursor Agent output
cursor-agent -p "explain recursion" --output-format=stream-json | aio-stream
```

### Programmatic Usage

```typescript
import { streamEvents, streamFormat } from '@agent-io/stream';

// Process events programmatically
for await (const event of streamEvents({
  vendor: 'claude',
  source: process.stdin,
})) {
  if (event.t === 'tool' && event.phase === 'end') {
    console.log(`Tool ${event.name} completed with code ${event.exitCode}`);
  }
}

// Format with rendering
for await (const output of streamFormat({
  vendor: 'auto',
  source: process.stdin,
  format: 'ansi',
})) {
  process.stdout.write(output);
}
```

## Packages

### @agent-io/core

Core types and utilities shared across all Agent-IO packages.

```typescript
import { AgentEvent, isMessageEvent } from '@agent-io/core';

// Type-safe event handling
function handleEvent(event: AgentEvent) {
  if (isMessageEvent(event)) {
    console.log(`${event.role}: ${event.text}`);
  }
}
```

### @agent-io/jsonl

Vendor-specific JSONL parsers for AI agent CLIs.

```typescript
import { parseClaudeLine, parseGeminiLine } from '@agent-io/jsonl';

// Parse vendor-specific formats
const events = parseClaudeLine('{"type":"message","content":"Hello"}');
```

### @agent-io/stream

The main streaming formatter with rendering capabilities.

```typescript
import { streamEvents, streamFormat } from '@agent-io/stream';

// Full streaming pipeline with formatting
const formatted = streamFormat({
  vendor: 'auto',
  source: inputStream,
  format: 'html',
  renderOptions: {
    collapseTools: true,
    hideDebug: true,
  },
});
```

### @agent-io/invoke

CLI invocation utilities for running AI agents programmatically.

```typescript
import { invokeClaude, invokeGemini } from '@agent-io/invoke';

// Invoke AI agents with proper streaming
const stream = await invokeClaude({
  prompt: 'Explain quantum computing',
  json: true,
});

for await (const event of streamEvents({ vendor: 'claude', source: stream })) {
  // Process events
}
```

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0 (for workspaces support)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/yourusername/agent-io.git
cd agent-io

# Install dependencies and build all packages
npm run bootstrap

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build all packages
npm run build

# Type check all packages
npm run typecheck
```

### Development Commands

```bash
# Package-specific commands
npm run build:core          # Build @agent-io/core
npm run build:stream        # Build @agent-io/stream
npm run test:packages       # Test all packages
npm run test:integration    # Run integration tests

# Development workflow
npm run dev                 # Watch mode for all packages
npm run validate            # Lint, typecheck, and test
npm run changeset           # Create a changeset for version bumps

# Testing
npm run test:coverage       # Generate coverage report
npm run test:ui             # Open Vitest UI

# Code quality
npm run lint                # Lint all packages
npm run lint:fix            # Fix linting issues
npm run format              # Format with Prettier
npm run format:check        # Check formatting
```

### Working with Workspaces

```bash
# Add dependency to a specific package
npm install lodash --workspace packages/stream

# Run script in specific package
npm run test --workspace packages/core

# Build specific packages
npm run build:core build:jsonl

# Run command in all packages
npm run build --workspaces
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make your changes**
   - Write tests for new functionality
   - Ensure all tests pass with `npm test`
   - Check types with `npm run typecheck`
   - Format code with `npm run format`

3. **Create a changeset**

   ```bash
   npm run changeset
   ```

   Follow the prompts to describe your changes.

4. **Submit a pull request**
   - Ensure all checks pass
   - Provide a clear description of changes
   - Link any related issues

### Architecture Decisions

- **Streaming First**: All operations use async iterators for constant memory usage
- **Vendor Agnostic**: Core types work with any AI CLI format
- **Progressive Enhancement**: Start with basic parsing, add rendering as needed
- **Type Safety**: Comprehensive TypeScript types with strict checking
- **Zero Dependencies**: Minimal external dependencies (only kleur for colors)

### Testing Strategy

- **Unit Tests**: Each package has comprehensive unit tests
- **Integration Tests**: Cross-package functionality testing
- **Fixture-Based**: Real CLI outputs captured as test fixtures
- **Performance Tests**: Benchmarks ensure throughput targets are met

## Performance

Agent-IO is designed for high-throughput stream processing:

| Format | Throughput      | Memory Usage |
| ------ | --------------- | ------------ |
| Claude | ~900K lines/sec | <20MB        |
| Gemini | ~668K lines/sec | <20MB        |
| Amp    | ~797K lines/sec | <20MB        |

Benchmarks run on M1 MacBook Pro. See [Performance Guide](docs/performance.md) for optimization
tips.

## API Documentation

Complete API documentation is available:

- [API Reference](docs/api/)
- [Core Types](docs/api/interfaces/)
- [Streaming Guide](docs/api/modules.md)

## Examples

Explore the [examples/](examples/) directory for:

- Basic usage patterns
- Advanced filtering and rendering
- Integration with web frameworks
- Custom renderer implementation
- Performance optimization techniques

## License

MIT © 2024 Agent-IO contributors

## Links

- [Documentation](https://github.com/yourusername/agent-io#readme)
- [API Reference](docs/api/)
- [npm Packages](https://www.npmjs.com/org/agent-io)
- [GitHub Repository](https://github.com/yourusername/agent-io)
- [Issue Tracker](https://github.com/yourusername/agent-io/issues)
- [Changelog](CHANGELOG.md)
- [Contributing Guide](CONTRIBUTING.md)

---

Built with ❤️ for the AI agent community
