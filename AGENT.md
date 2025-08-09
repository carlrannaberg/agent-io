# AGENT.md

This file provides guidance to AI coding assistants working in this repository.

**Note:** CLAUDE.md, .clinerules, .cursorrules, .windsurfrules, .replit.md, GEMINI.md, and other AI
config files are symlinks to AGENT.md in this project.

# Agent-IO

A universal I/O toolkit for AI agent CLIs that normalizes JSONL output from Claude Code, Gemini CLI,
and Amp Code into unified event streams with beautiful ANSI terminal and HTML rendering.

## Project Status

**Current State**: Phase 5 (Package & Documentation) completed  
**Next Step**: Monorepo fully operational with 4 packages

## Build & Commands

### Development Commands

```bash
# Build
npm run build                 # Build all packages sequentially
npm run build:packages        # Build all packages with workspaces
npm run build:all            # Clean + build everything
npm run build:core           # Build @agent-io/core package
npm run build:jsonl          # Build @agent-io/jsonl package
npm run build:stream         # Build @agent-io/stream package
npm run build:invoke         # Build @agent-io/invoke package
npm run typecheck             # TypeScript type checking across monorepo

# Development
npm run dev                  # Watch mode for all packages
npm run dev:packages         # Development mode for workspace packages
npm run bootstrap            # Fresh install + build all packages

# Testing
npm test                      # Run all tests with vitest
npm run test:watch            # Run tests in watch mode
npm run test:ui              # Run vitest UI
npm run test:coverage        # Run tests with coverage reporting
npm run test:integration      # Run integration tests only
npm run test:packages        # Run tests in all workspace packages
npm run test:all             # Full test suite across monorepo

# Test single file
npm test -- tests/path/to/file.test.ts
npm test -- packages/stream/src/parsers/claude.test.ts

# Code Quality
npm run lint                 # ESLint all packages
npm run lint:fix             # Auto-fix linting issues
npm run format               # Prettier formatting
npm run format:check         # Check formatting without fixing
npm run validate             # Run lint + typecheck + test

# Release Management (with Changesets)
npm run changeset            # Create changeset for version bumping
npm run version              # Update package versions

# Proper Release Process
npm run release:patch        # Release patch version (bug fixes)
npm run release:minor        # Release minor version (new features)
npm run release:major        # Release major version (breaking changes)

# CLI Usage (after build)
aio-stream [options] [file]  # Main CLI from @agent-io/stream

# Git operations
git status                    # Check current state
git add .                     # Stage changes
git commit -m "type: message" # Commit with conventional format
```

### Script Command Consistency

**Important**: When modifying npm scripts in package.json, ensure all references are updated:

- GitHub Actions workflows (.github/workflows/\*.yml)
- README.md documentation
- Contributing guides
- Dockerfile/docker-compose.yml
- CI/CD configuration files
- Setup/installation scripts

Common places that reference npm scripts:

- `npm run build` → Check: workflows, README, Dockerfile
- `npm test` → Check: workflows, contributing docs
- `npm run typecheck` → Check: pre-commit hooks, workflows
- `npm start` → Check: README, deployment docs

## Code Style

### Git Commit Convention

- **Format**: Conventional Commits (https://www.conventionalcommits.org/)
- **Structure**: `type(scope): description`
- **Types**: feat, fix, docs, style, refactor, test, chore, perf
- **Examples**:
  ```
  feat(parser): add Claude JSONL parser
  fix(stream): handle partial lines correctly
  docs: update API documentation
  perf(render): optimize ANSI color handling
  test: add Gemini parser edge cases
  ```

### TypeScript Guidelines

- **Strict mode**: Always use strict TypeScript configuration
- **Module system**: ESM modules only
- **Target**: ES2022 or later
- **Imports**: Use explicit imports, prefer named imports

```typescript
// Good
import { streamEvents, AgentEvent } from './stream';
import type { Vendor } from './types';

// Avoid
import * as stream from './stream';
```

### Naming Conventions

- **Files**: kebab-case (`agent-parser.ts`)
- **Functions/Variables**: camelCase (`streamEvents`, `parseMessage`)
- **Types/Interfaces**: PascalCase (`AgentEvent`, `VendorParser`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_LINE_LENGTH`)
- **Enums**: PascalCase with descriptive names

### Code Organization

```typescript
// File structure order:
1. Type imports
2. Value imports
3. Type definitions
4. Constants
5. Main implementation
6. Default export (if any)

// Example file structure:
import type { AgentEvent } from './types';
import { kleur } from 'kleur';

interface RenderOptions {
  // ...
}

const DEFAULT_OPTIONS: RenderOptions = {
  // ...
};

export class AnsiRenderer {
  // ...
}
```

### Error Handling

- **Graceful degradation**: Never crash on malformed input
- **Explicit error types**: Use typed errors when possible
- **Logging**: Use structured logging for debugging

```typescript
// Good
try {
  const obj = JSON.parse(line);
  return parseEvent(obj);
} catch (error) {
  return { t: 'error', message: `Parse error: ${error.message}` };
}

// Avoid silent failures
try {
  const obj = JSON.parse(line);
  return parseEvent(obj);
} catch {
  return null; // Don't do this
}
```

## Testing

### Framework & Patterns

- **Framework**: Vitest with workspace support
- **Test files**: `*.test.ts` in `tests/` directory and alongside source files
- **Fixtures**: Real CLI outputs in `tests/fixtures/`
- **Coverage**: Aim for >90% coverage

### Testing Philosophy

**When tests fail, fix the code, not the test.**

Key principles:

- **Tests should be meaningful** - Avoid tests that always pass regardless of behavior
- **Test actual functionality** - Call the functions being tested, don't just check side effects
- **Failing tests are valuable** - They reveal bugs or missing features
- **Fix the root cause** - When a test fails, fix the underlying issue, don't hide the test
- **Test edge cases** - Tests that reveal limitations help improve the code
- **Document test purpose** - Each test should include a comment explaining why it exists and what
  it validates

### Test Categories

1. **Parser tests**: Validate vendor-specific parsing logic
2. **Stream tests**: Test async iteration and backpressure
3. **Render tests**: Verify ANSI and HTML output formatting
4. **Integration tests**: End-to-end CLI functionality
5. **Performance tests**: Throughput and memory benchmarks

### Testing Examples

```typescript
// Good test - tests actual behavior
describe('Claude parser', () => {
  it('should parse message events correctly', () => {
    const line = '{"type":"message","role":"assistant","content":"Hello"}';
    const events = parseClaudeLine(line);

    expect(events).toEqual([{ t: 'msg', role: 'assistant', text: 'Hello' }]);
  });
});

// Performance test
it('should process 50k lines per second', async () => {
  const lines = generateTestLines(50000);
  const start = performance.now();

  for await (const event of streamEvents({ vendor: 'claude', source: lines })) {
    // Process events
  }

  const elapsed = performance.now() - start;
  const linesPerSecond = 50000 / (elapsed / 1000);
  expect(linesPerSecond).toBeGreaterThan(50000);
});
```

## Security

### Input Validation

- **JSON parsing**: Always use try-catch for JSON.parse()
- **Size limits**: Limit individual line size to prevent DoS
- **HTML escaping**: Escape all user content in HTML output
- **No code execution**: Never eval() or execute user content

### Data Protection

- **No secrets**: Ensure test fixtures contain no API keys or tokens
- **Sanitize output**: Remove sensitive information from logs
- **Minimal dependencies**: Only use essential packages (kleur for colors)

### Security Patterns

```typescript
// Safe HTML escaping
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Safe JSON parsing
function safeParse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
```

## Performance Requirements

### Targets

- **Throughput**: >50,000 lines/second
- **Memory**: <20MB RSS for infinite streams
- **Latency**: <10ms for first output
- **Startup**: <100ms from CLI invocation

### Optimization Guidelines

- **Streaming**: Use async iterators, avoid buffering
- **Memory**: Constant memory usage regardless of input size
- **String operations**: Minimize concatenation, use arrays
- **RegExp**: Pre-compile patterns, avoid in hot paths

## Configuration

### Environment Variables

```bash
# Development
NODE_ENV=development          # Enable debug logging
DEBUG=aio-stream:*     # Debug namespace

# Testing
TEST_LIVE=true               # Enable live CLI testing
TEST_FIXTURES=/path/to/fixtures  # Custom fixture directory
```

### Dependencies

- **Runtime**: Node.js >=18.0.0
- **Core dependencies**:
  - `commander` (^14.0.0) - CLI argument parsing
  - `kleur` (^4.1.5) - ANSI color formatting
- **Dev dependencies**:
  - `typescript` (^5.0.0) - TypeScript compiler
  - `vitest` (^1.0.0) - Test framework
  - `tsup` (^8.0.0) - Build tool
  - `tsx` (^4.0.0) - TypeScript execution
  - `@types/node` (^20.0.0) - Node.js types

## Architecture

### Monorepo Structure

```
agent-io/
├── packages/                 # Monorepo packages
│   ├── core/                # @agent-io/core - Core types and utilities
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts
│   ├── jsonl/               # @agent-io/jsonl - JSONL parsing utilities
│   │   ├── src/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts
│   ├── stream/              # @agent-io/stream - Main streaming formatter + CLI
│   │   ├── src/
│   │   │   ├── cli.ts       # Command-line interface
│   │   │   ├── index.ts     # Public API exports
│   │   │   ├── stream.ts    # Main streaming engine
│   │   │   ├── parsers/     # Vendor-specific parsers
│   │   │   ├── render/      # Output formatters
│   │   │   └── utils/       # Utility functions
│   │   ├── tests/           # Package-specific tests
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts
│   └── invoke/              # @agent-io/invoke - CLI invocation tools
│       ├── src/
│       ├── package.json
│       ├── tsconfig.json
│       └── tsup.config.ts
├── tests/                   # Integration tests and fixtures
│   ├── fixtures/            # JSONL fixture files
│   │   ├── claude/          # Claude CLI outputs
│   │   ├── gemini/          # Gemini CLI outputs
│   │   └── amp/             # Amp Code outputs
│   ├── integration/         # Cross-package integration tests
│   └── *.test.ts            # Integration test files
├── reports/                 # ALL reports and documentation
│   └── *.md                 # Various report types
├── specs/                   # Specification documents
├── examples/                # Usage examples
├── .github/workflows/       # CI/CD workflows
├── vitest.workspace.ts      # Vitest workspace configuration
├── tsconfig.json           # Root TypeScript configuration
└── package.json            # Monorepo root package.json
```

### Core Types

```typescript
// Main event union type
export type AgentEvent =
  | { t: 'msg'; role: 'user' | 'assistant' | 'system'; text: string }
  | {
      t: 'tool';
      name: string;
      phase: 'start' | 'stdout' | 'stderr' | 'end';
      text?: string;
      exitCode?: number;
    }
  | { t: 'cost'; deltaUsd: number }
  | { t: 'error'; message: string }
  | { t: 'debug'; raw: any };

// Vendor types
export type Vendor = 'auto' | 'claude' | 'gemini' | 'amp';
```

### Streaming API

```typescript
// Core streaming function
export async function* streamEvents(opts: StreamEventOptions): AsyncIterator<AgentEvent>

// Formatting with rendering
export async function* streamFormat(opts: StreamFormatOptions): AsyncIterator<string>
```

### Report Generation

**CRITICAL**: ALL reports MUST be saved to the `reports/` directory. NEVER save report files to the
project root.

**❌ INCORRECT (Root Directory):**

```
TEST_COVERAGE_REPORT.md         ❌ Wrong location
TEST_SUITE_SUMMARY.md          ❌ Wrong location
validation-report.json         ❌ Wrong location and format
```

**✅ CORRECT (Reports Directory):**

```
reports/TEST_RESULTS_2025-07-20.md       ✅ Correct
reports/COVERAGE_REPORT_2025-07-20.md    ✅ Correct
reports/VALIDATION_REPORT_2025-07-20.md  ✅ Correct
```

**Implementation Reports:**

- Phase validation: `reports/PHASE_X_VALIDATION_REPORT.md`
- Implementation summaries: `reports/IMPLEMENTATION_SUMMARY_[FEATURE].md`
- Feature completion: `reports/FEATURE_[NAME]_REPORT.md`

**Testing & Analysis Reports:**

- Test results: `reports/TEST_RESULTS_[DATE].md`
- Coverage reports: `reports/COVERAGE_REPORT_[DATE].md`
- Schema analysis: `reports/SCHEMA_ANALYSIS_[VENDOR].md`
- Fixture validation: `reports/FIXTURE_VALIDATION_REPORT.md`

**Performance & Benchmarks:**

- Performance benchmarks: `reports/PERFORMANCE_BENCHMARK_[DATE].md`
- Memory profiling: `reports/MEMORY_PROFILE_[SCENARIO].md`
- Load testing: `reports/LOAD_TEST_[VERSION].md`

**Quality & Validation:**

- Code quality: `reports/CODE_QUALITY_REPORT.md`
- Security audit: `reports/SECURITY_AUDIT_[DATE].md`
- Dependency analysis: `reports/DEPENDENCY_REPORT.md`
- API compatibility: `reports/API_COMPATIBILITY_REPORT.md`

**Report Creation Checklist:**

1. ✅ Always use the `reports/` directory
2. ✅ Use Markdown format (.md) for all reports
3. ✅ Include dates in YYYY-MM-DD format where applicable
4. ✅ Use descriptive prefixes to group related reports
5. ❌ Never save reports to the project root
6. ❌ Avoid JSON format for human-readable reports

This keeps the project root clean and provides a central location for all project documentation and
analysis.

### Important Note

If you find report files in the project root, they were placed incorrectly. Move them to the
`reports/` directory to keep the root clean:

```bash
# Example: moving misplaced reports
mv TEST_COVERAGE_REPORT.md reports/
mv TEST_SUITE_SUMMARY.md reports/
mv validation-report.json reports/
```

### Script Output Conventions

**All scripts that generate reports MUST output to the correct directories:**

```typescript
// ✅ CORRECT - Output to reports directory
import { writeFileSync } from 'fs';
import { join } from 'path';

const reportPath = join(
  process.cwd(),
  'reports',
  `TEST_RESULTS_${new Date().toISOString().split('T')[0]}.md`,
);
writeFileSync(reportPath, reportContent);

// ❌ INCORRECT - Output to root directory
writeFileSync('TEST_RESULTS.md', reportContent); // Never do this!
```

**Directory Rules for Scripts:**

- **Test results** → Always output to `reports/`
- **Schema analysis** → Output to `fixtures/` (with the fixtures they analyze)
- **Coverage reports** → Always output to `reports/`
- **Validation reports** → Always output to `reports/`
- **Temporary files** → Use `temp/` directory (create if needed)

## Temporary Files & Debugging

All temporary files, debugging scripts, and test artifacts should be organized in a `/temp` folder:

### Temporary File Organization

- **Debug scripts**: `temp/debug-*.js`, `temp/analyze-*.py`
- **Test artifacts**: `temp/test-results/`, `temp/coverage/`
- **Generated files**: `temp/generated/`, `temp/build-artifacts/`
- **Logs**: `temp/logs/debug.log`, `temp/logs/error.log`

### Guidelines

- Never commit files from `/temp` directory
- Use `/temp` for all debugging and analysis scripts created during development
- Clean up `/temp` directory regularly or use automated cleanup
- Include `/temp/` in `.gitignore` to prevent accidental commits

### Example `.gitignore` patterns

```
# Temporary files and debugging
/temp/
temp/
**/temp/
debug-*.js
test-*.py
analyze-*.sh
*-debug.*
*.debug

# Claude settings
.claude/settings.local.json

# Don't ignore reports directory
!reports/
!reports/**
```

### Claude Code Settings (.claude Directory)

The `.claude` directory contains Claude Code configuration files with specific version control
rules:

#### Version Controlled Files (commit these):

- `.claude/settings.json` - Shared team settings for hooks, tools, and environment
- `.claude/commands/*.md` - Custom slash commands available to all team members
- `.claude/hooks/*.sh` - Hook scripts for automated validations and actions

#### Ignored Files (do NOT commit):

- `.claude/settings.local.json` - Personal preferences and local overrides
- Any `*.local.json` files - Personal configuration not meant for sharing

**Important Notes:**

- Claude Code automatically adds `.claude/settings.local.json` to `.gitignore`
- The shared `settings.json` should contain team-wide standards (linting, type checking, etc.)
- Personal preferences or experimental settings belong in `settings.local.json`
- Hook scripts in `.claude/hooks/` should be executable (`chmod +x`)

## Implementation Phases

### Phase 0: Project Setup & Fixture Collection ✅

- Initialize TypeScript project with modern tooling
- Capture real JSONL outputs from Claude Code, Gemini CLI, Amp Code
- Set up testing infrastructure with fixtures

### Phase 1: Core Types & Parser Infrastructure ✅

- Define TypeScript types for all event formats
- Implement extensible parser interface
- Create Claude parser with comprehensive tests

### Phase 2: Streaming Engine ✅

- Build memory-efficient line reader
- Implement async iterator streaming pipeline
- Add error handling and recovery

### Phase 3: Rendering Engine ✅

- Create ANSI terminal renderer with colors and formatting
- Implement HTML renderer with semantic structure
- Build enhanced CLI with filtering options

### Phase 4: Additional Vendors ✅

- Add Gemini CLI parser
- Add Amp Code parser
- Improve auto-detection logic

### Phase 5: Package & Documentation ✅

- Complete monorepo migration with npm workspaces
- Set up independent package versioning with Changesets
- Comprehensive CI/CD with GitHub Actions
- Performance optimization and benchmarking

## Key Files to Review

Before implementing, review these specification documents:

- `specs/feat-jsonl-stream-formatter.md` - Main feature specification
- `specs/implementation-roadmap.md` - Complete execution plan
- `specs/testing-strategy.md` - Testing approach and fixture management
- `specs/phase-*.md` - Detailed implementation phases

## Release Process

### IMPORTANT: Proper Release Workflow

**Always use the dedicated release scripts** to ensure a proper release:

```bash
# For bug fixes (0.0.x)
npm run release:patch

# For new features (0.x.0)
npm run release:minor

# For breaking changes (x.0.0)
npm run release:major
```

**Why use these scripts?** The `release:[version]` scripts automatically:

1. Run all tests to ensure code quality
2. Update README files across packages
3. Generate/update CHANGELOG entries
4. Bump version numbers appropriately
5. Create git commits with proper messages
6. Publish to npm registry
7. Push changes and tags to GitHub

**DO NOT use these commands directly for releases:**

- ❌ `changeset publish` - Bypasses test validation and documentation updates
- ❌ `npm publish` - Will not maintain version consistency across monorepo

### Release Checklist

Before running a release command:

1. Ensure all changes are committed
2. Verify you're on the main branch
3. Pull latest changes from remote
4. Run `npm test` locally to catch issues early
5. Review pending changesets with `npx changeset status`

### Creating Changesets

For individual changes during development:

```bash
# Create a changeset for your changes
npm run changeset

# Select the package(s) affected
# Choose the version bump type (patch/minor/major)
# Write a clear description of the changes
```

### Manual Version Management (Advanced)

If you need to manage versions manually:

```bash
# Update versions based on changesets
npm run version

# Then use the appropriate release script
npm run release:patch|minor|major
```

## Contributing Guidelines

1. **Follow specifications**: All implementation must match the detailed specs
2. **Fixture-first approach**: Capture real CLI outputs before implementing parsers
3. **Performance focus**: Maintain streaming efficiency and memory bounds
4. **Test-driven**: Write tests using real fixtures, not synthetic data
5. **TypeScript strict**: Use strict type checking throughout

## CLI Interface

### Correct CLI Usage Examples

**Important**: These are the correct CLI usage patterns for each AI tool:

#### Claude CLI

```bash
# Claude requires --output-format stream-json for JSONL output
claude --output-format stream-json --verbose -p "explain recursion" | aio-stream
```

#### Gemini CLI

```bash
# Gemini outputs plain text (not JSONL), use -p flag for prompts
gemini -p "Write a haiku about code" | aio-stream --vendor gemini
```

#### Amp CLI

```bash
# Amp can be used interactively or with piped input
amp  # Interactive mode

# Or pipe input directly
echo "Build and test my project" | amp | aio-stream
```

#### Cursor Agent CLI

```bash
# Cursor Agent requires --output-format=stream-json for JSONL output
cursor-agent -p "Read package.json and analyze dependencies" --output-format=stream-json | aio-stream

# With explicit vendor specification
cursor-agent -p "Run tests and check results" --output-format=stream-json | aio-stream --vendor cursor
```

### Basic Usage

```bash
# Auto-detect vendor and format for terminal
claude --output-format stream-json --verbose -p "explain recursion" | aio-stream

# Explicit vendor with options
gemini -p "explain recursion" | aio-stream --vendor gemini

# Process Amp output
echo "explain recursion" | amp | aio-stream --vendor amp

# Process Cursor Agent output
cursor-agent -p "explain recursion" --output-format=stream-json | aio-stream

# Filter specific event types
cat session.jsonl | aio-stream --only tool,error --collapse-tools
```

### Options

```bash
-v, --vendor <type>     # Vendor: auto|claude|gemini|amp|cursor (default: auto)
-f, --format <type>     # Format: ansi|html|json (default: ansi)
--collapse-tools        # Collapse tool output sections
--hide-tools           # Hide tool execution entirely
--hide-cost            # Hide cost information
--hide-debug           # Hide debug events
--only <types>         # Show only specific event types
-o, --output <file>    # Output file (default: stdout)
--html                 # Shorthand for --format html
--json                 # Shorthand for --format json
```

## Troubleshooting

### Common Issues

- **Memory usage**: Check for buffering in stream processing
- **Performance**: Profile with `--inspect` flag for bottlenecks
- **Parsing errors**: Validate fixtures match expected format
- **Test failures**: Ensure fixtures represent real CLI outputs

### Debug Commands

```bash
# Debug parsing issues
DEBUG=aio-stream:parser npm test

# Memory profiling
node --inspect --inspect-brk dist/cli.js < large-file.jsonl

# Performance profiling
node --prof dist/cli.js < test-data.jsonl
```

## CLI Tools Reference

Documentation for CLI tools used in this project.

<details>
<summary><strong>stm</strong> - A simple command-line task management tool</summary>

```
Usage: stm [options] [command]

A simple command-line task management tool

Options:
  -h, --help                              display help for command
  -v, --version                           display version information

Commands:
  add [options] <title>                   Add a new task
  export [options]                        Export tasks to a file or stdout
  grep [options] <pattern>                Search tasks by pattern (supports regular expressions)
  help [command]                          display help for command
  init                                    Initialize STM repository in the current directory
  list [options]                          List tasks with optional filtering
  show [options] <id>                     Show a specific task
  update [options] <id> [assignments...]  Update a task with flexible options for metadata, content sections, and editor integration
```

</details>

# Important Instruction Reminders

Do what has been asked; nothing more, nothing less. NEVER create files unless they're absolutely
necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation
files if explicitly requested by the User. Only use emojis if the user explicitly requests it. Avoid
adding emojis to files unless asked.

# important-instruction-reminders

Do what has been asked; nothing more, nothing less. NEVER create files unless they're absolutely
necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation
files if explicitly requested by the User.
