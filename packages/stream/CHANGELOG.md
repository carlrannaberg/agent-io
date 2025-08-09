# @agent-io/stream

## 0.2.0

### Minor Changes

- chore: apply Prettier formatting across codebase

## 0.1.7

### Patch Changes

- fix(stream): resolve ES module compatibility issue in CLI

## 0.1.6

### Patch Changes

- Fix CLI execution when installed globally via npm

  The CLI was not producing any output when executed through npm's bin symlink due to an issue with
  the main module detection in the CommonJS build. This fix improves the entry point detection to
  handle:
  - Direct execution
  - Symlink execution (npm global installs)
  - CommonJS require.main checks
  - Fallback detection based on argv[1] patterns

  This ensures `aio-stream --version` and other commands work correctly when the package is
  installed globally.

## 0.1.5

### Patch Changes

- revert: remove aio-stream usage from prepare-release script

## 0.1.4

### Patch Changes

- docs: fix CLI usage examples and improve documentation consistency

## 0.1.3

### Patch Changes

- chore(scripts): improve prepare-release.sh formatting and timeout

## 0.1.2

### Patch Changes

- fix(tests): update cli-enhanced test to mock readFileSync

## 0.1.1

### Patch Changes

- chore(tests): remove duplicate CLI test file

## 1.0.0

### Major Changes

- # Initial Release of Agent-IO Monorepo 🎉

  ## Overview

  This is the initial release of the Agent-IO monorepo, marking the migration from the standalone
  `agent-stream-fmt` package to a comprehensive monorepo structure. This release establishes the
  foundation for the Agent-IO ecosystem with multiple specialized packages.

  ## Major Changes

  ### @agent-io/stream (1.0.0)

  The core functionality from `agent-stream-fmt` has been migrated to this package with the
  following improvements:
  - **Universal JSONL formatter** for AI agent CLIs (Claude Code, Gemini CLI, Amp Code)
  - **Beautiful terminal rendering** with ANSI colors and formatting
  - **HTML output support** for web-based displays
  - **Streaming architecture** with memory-efficient processing
  - **Enhanced error recovery** and robust parsing
  - **Performance optimized** for >50,000 lines/second throughput

  ### New Packages

  #### @agent-io/core (0.1.0)
  - Core types and utilities shared across Agent-IO packages
  - Type guards and validation helpers
  - Foundation for future package development

  #### @agent-io/jsonl (0.1.0)
  - Specialized JSONL parsing and streaming utilities
  - Error handling for malformed JSON
  - Placeholder for future enhancements

  #### @agent-io/invoke (0.1.0)
  - Universal agent invocation tool (placeholder)
  - Foundation for cross-vendor agent execution

  #### @agent-io/stream-formatter (1.0.0)
  - Legacy package maintained for backward compatibility
  - Re-exports from @agent-io/stream
  - Includes deprecation notice pointing to new package

  ## Migration Guide

  If you're currently using `agent-stream-fmt`, update your imports:

  ```typescript
  // Before
  import { streamEvents, streamFormat } from 'agent-stream-fmt';

  // After
  import { streamEvents, streamFormat } from '@agent-io/stream';
  ```

  The CLI command is now:

  ```bash
  aio-stream [options] [file]
  ```

  ## Features

  ### Supported Vendors
  - **Claude Code** - Full support for all event types
  - **Gemini CLI** - Basic message and content parsing
  - **Amp Code** - Tool execution and output handling

  ### Output Formats
  - **ANSI Terminal** - Rich colors and formatting for CLI display
  - **HTML** - Semantic markup for web integration
  - **JSON** - Structured data for programmatic use

  ### Performance
  - Streaming architecture with constant memory usage
  - Handles infinite streams without buffering
  - Optimized for high-throughput scenarios

  ## What's Next

  This initial release establishes the monorepo structure. Future releases will:
  - Enhance Gemini and Amp parsers with full feature parity
  - Implement the @agent-io/invoke universal agent runner
  - Add more specialized JSONL utilities
  - Expand the ecosystem with additional packages

  ## Installation

  ```bash
  # Install the main stream formatter
  npm install @agent-io/stream

  # Or install specific packages
  npm install @agent-io/core @agent-io/jsonl
  ```

  ## Documentation

  Full documentation and examples are available at:
  - GitHub: https://github.com/carlrannaberg/agent-io
  - Main package: https://github.com/carlrannaberg/agent-io/tree/main/packages/stream

  ## Breaking Changes

  None - this is the initial release. The `agent-stream-fmt` package continues to work but is now
  deprecated in favor of `@agent-io/stream`.
