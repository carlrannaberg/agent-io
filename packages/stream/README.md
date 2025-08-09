# @agent-io/stream

Universal JSONL formatter for AI agent CLIs with beautiful terminal and HTML output.

## Installation

```bash
npm install @agent-io/stream
# or
yarn add @agent-io/stream
# or
pnpm add @agent-io/stream
```

## Usage

### CLI Usage

The `aio-stream` command processes output from AI agent CLIs (JSONL for Claude/Amp/Cursor, plain
text for Gemini):

```bash
# Auto-detect vendor and format for terminal
claude --output-format stream-json --verbose -p "explain recursion" | aio-stream

# Explicit vendor with options (Gemini outputs plain text, not JSONL)
gemini -p "explain recursion" | aio-stream --vendor gemini

# Process Amp output
echo "explain recursion" | amp | aio-stream --vendor amp

# Process Cursor Agent output with streaming JSONL
cursor-agent -p "explain recursion" --output-format=stream-json | aio-stream

# Filter specific event types
cat session.jsonl | aio-stream --only tool,error --collapse-tools
```

#### Advanced Usage

```bash
# Generate HTML report
claude --output-format stream-json --verbose -p "build a web app" | aio-stream --html > report.html

# Hide tool execution output
gemini -p "analyze this code" | aio-stream --vendor gemini --hide-tools

# Collapse tool output sections
echo "run all tests" | amp | aio-stream --vendor amp --collapse-tools

# Show only specific event types
cat debug-session.jsonl | aio-stream --only msg,error

# Output to file instead of stdout
claude --output-format stream-json -p "explain quantum computing" | aio-stream -o output.txt
```

#### CLI Options

```bash
Options:
  -v, --vendor <type>     Vendor: auto|claude|gemini|amp|cursor (default: auto)
  -f, --format <type>     Format: ansi|html|json (default: ansi)
  --collapse-tools        Collapse tool output sections
  --hide-tools           Hide tool execution entirely
  --hide-cost            Hide cost information
  --hide-debug           Hide debug events
  --only <types>         Show only specific event types
  -o, --output <file>    Output file (default: stdout)
  --html                 Shorthand for --format html
  --json                 Shorthand for --format json
  -h, --help             Display help
  -V, --version          Output the version number
```

### Programmatic API

#### Basic Streaming

```typescript
import { streamEvents } from '@agent-io/stream';
import { createReadStream } from 'fs';

// Stream events from a file
const source = createReadStream('session.jsonl');
for await (const event of streamEvents({ vendor: 'claude', source })) {
  console.log(event);
}
```

#### Auto-Detection

```typescript
import { streamEvents } from '@agent-io/stream';

// Automatically detect vendor format
for await (const event of streamEvents({
  vendor: 'auto',
  source: process.stdin,
})) {
  switch (event.t) {
    case 'msg':
      console.log(`${event.role}: ${event.text}`);
      break;
    case 'tool':
      console.log(`Tool ${event.name}: ${event.phase}`);
      break;
    case 'error':
      console.error(`Error: ${event.message}`);
      break;
  }
}
```

#### Formatted Output

```typescript
import { streamFormat } from '@agent-io/stream';

// Stream formatted ANSI output
for await (const output of streamFormat({
  vendor: 'claude',
  source: process.stdin,
  format: 'ansi',
  collapseTools: true,
})) {
  process.stdout.write(output);
}
```

#### Collecting Events

```typescript
import { collectEvents } from '@agent-io/stream';

// Collect all events into an array
const events = await collectEvents({
  vendor: 'gemini',
  source: inputStream,
});

console.log(`Processed ${events.length} events`);
```

## API Reference

### Core Functions

#### `streamEvents(options: StreamOptions): AsyncGenerator<AgentEvent>`

Stream and parse JSONL input into normalized agent events.

**Options:**

- `vendor: Vendor` - Vendor format ('auto', 'claude', 'gemini', 'amp', 'cursor')
- `source: ReadableStream` - Input stream containing JSONL data
- `continueOnError?: boolean` - Continue parsing after errors (default: true)
- `emitDebugEvents?: boolean` - Emit debug events for unknown formats (default: false)
- `maxConsecutiveErrors?: number` - Stop after this many consecutive errors (default: 100)
- `lineReaderOptions?: object` - Options for line reading
  - `maxLineLength?: number` - Maximum line length (default: 1MB)
  - `encoding?: string` - Text encoding (default: 'utf8')

#### `streamFormat(options: StreamFormatOptions): AsyncGenerator<string>`

Stream formatted output with rendering applied.

**Options:**

- All `StreamOptions` plus:
- `format: 'ansi' | 'html' | 'json'` - Output format
- `collapseTools?: boolean` - Collapse tool output sections
- `hideTools?: boolean` - Hide tool execution entirely
- `hideCost?: boolean` - Hide cost information
- `hideDebug?: boolean` - Hide debug events
- `showTimestamps?: boolean` - Show event timestamps
- `compactMode?: boolean` - Minimal formatting
- `colorDisabled?: boolean` - Disable ANSI colors

#### `collectEvents(options: StreamOptions): Promise<AgentEvent[]>`

Collect all events from a stream into an array.

### Event Types

```typescript
type AgentEvent = MessageEvent | ToolEvent | CostEvent | ErrorEvent | DebugEvent;

interface MessageEvent {
  t: 'msg';
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: number;
}

interface ToolEvent {
  t: 'tool';
  name: string;
  phase: 'start' | 'stdout' | 'stderr' | 'end';
  text?: string;
  exitCode?: number;
}

interface CostEvent {
  t: 'cost';
  deltaUsd: number;
}

interface ErrorEvent {
  t: 'error';
  message: string;
}

interface DebugEvent {
  t: 'debug';
  raw: unknown;
}
```

### Rendering

#### Creating Renderers

```typescript
import { createRenderer, AnsiRenderer, HtmlRenderer } from '@agent-io/stream';

// Create a renderer with options
const renderer = createRenderer({
  format: 'ansi',
  collapseTools: true,
  showTimestamps: true,
});

// Render events
const output = renderer.render(event);
```

#### Custom Renderers

```typescript
import { Renderer, AgentEvent } from '@agent-io/stream';

class CustomRenderer implements Renderer {
  render(event: AgentEvent): string {
    // Custom rendering logic
    return `[${event.t}] ${JSON.stringify(event)}`;
  }

  renderBatch(events: AgentEvent[]): string {
    return events.map(e => this.render(e)).join('\n');
  }

  flush(): string {
    return ''; // Any final output
  }
}
```

### Parser Registry

#### Adding Custom Parsers

```typescript
import { registry, VendorParser } from '@agent-io/stream';

const myParser: VendorParser = {
  vendor: 'mycli',

  detect: (line: string) => {
    try {
      const obj = JSON.parse(line);
      return obj.source === 'mycli';
    } catch {
      return false;
    }
  },

  parse: (line: string) => {
    const obj = JSON.parse(line);
    if (obj.type === 'message') {
      return [{ t: 'msg', role: obj.role, text: obj.content }];
    }
    return [];
  },
};

// Register with priority (higher = tried first in auto-detection)
registry.register(myParser, 100);
```

## Error Handling

### Parse Errors

```typescript
import { streamEvents, ParseError } from '@agent-io/stream';

try {
  for await (const event of streamEvents({ vendor: 'claude', source })) {
    if (event.t === 'error') {
      console.error(`Parse error: ${event.message}`);
    } else {
      processEvent(event);
    }
  }
} catch (error) {
  if (error instanceof ParseError) {
    console.error(`Fatal parse error in ${error.vendor}:`, error.message);
    console.error(`Line: ${error.line}`);
    if (error.context?.lineNumber) {
      console.error(`Line number: ${error.context.lineNumber}`);
    }
  }
}
```

### Handling Malformed Input

```typescript
const events = streamEvents({
  vendor: 'auto',
  source: inputStream,
  continueOnError: true, // Continue parsing despite errors
  emitDebugEvents: true, // Emit debug events for unknown formats
  maxConsecutiveErrors: 50, // Stop if too many errors in a row
});

for await (const event of events) {
  if (event.t === 'debug') {
    // Log unknown format for debugging
    console.debug('Unknown format:', event.raw);
  }
}
```

## Configuration

### Environment Variables

```bash
# Enable debug logging
DEBUG=agent-stream-fmt:*

# Disable colors in terminal output
NO_COLOR=1

# Force color output (even when piping)
FORCE_COLOR=1
```

## Examples

### Processing Claude Code Output

```typescript
import { streamFormat } from '@agent-io/stream';
import { spawn } from 'child_process';

const claude = spawn('claude', ['--json', 'Write a hello world in Python']);

for await (const output of streamFormat({
  vendor: 'claude',
  source: claude.stdout,
  format: 'ansi',
  collapseTools: true,
})) {
  process.stdout.write(output);
}
```

### Processing Cursor Agent Output

```typescript
import { streamEvents } from '@agent-io/stream';
import { spawn } from 'child_process';

const cursorAgent = spawn('cursor-agent', [
  '-p',
  'Read and analyze package.json',
  '--output-format=stream-json',
]);

for await (const event of streamEvents({
  vendor: 'cursor',
  source: cursorAgent.stdout,
})) {
  switch (event.t) {
    case 'msg':
      console.log(`${event.role}: ${event.text}`);
      break;
    case 'tool':
      if (event.phase === 'start') {
        console.log(`🔧 ${event.name} started`);
      } else if (event.phase === 'end') {
        console.log(`✅ ${event.name} completed (${event.exitCode === 0 ? 'success' : 'failed'})`);
      }
      break;
  }
}
```

### Building a Web Dashboard

```typescript
import { streamFormat } from '@agent-io/stream';
import { createServer } from 'http';

createServer(async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });

  res.write(`<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: monospace; background: #1e1e1e; color: #fff; }
    .message { margin: 10px 0; }
    .tool { background: #2d2d2d; padding: 10px; margin: 5px 0; }
  </style>
</head>
<body>`);

  for await (const html of streamFormat({
    vendor: 'auto',
    source: getAgentOutputStream(),
    format: 'html',
  })) {
    res.write(html);
  }

  res.write('</body></html>');
  res.end();
}).listen(3000);
```

### Filtering Events

```typescript
import { streamEvents } from '@agent-io/stream';

// Only process message and error events
const filtered = async function* (source: AsyncIterable<AgentEvent>) {
  for await (const event of source) {
    if (event.t === 'msg' || event.t === 'error') {
      yield event;
    }
  }
};

const events = filtered(streamEvents({ vendor: 'gemini', source }));
for await (const event of events) {
  console.log(event);
}
```

## Performance

The library is optimized for high-throughput streaming:

- Processes >50,000 lines/second
- Constant memory usage (<20MB) for infinite streams
- Zero dependencies for core functionality
- Efficient line-by-line processing without buffering

## Troubleshooting

### Common Issues

**Q: Auto-detection fails with "Unable to detect vendor format"** A: Ensure the input contains valid
JSONL. Try specifying the vendor explicitly.

**Q: Colors don't appear in terminal output** A: Check if your terminal supports ANSI colors. Try
setting `FORCE_COLOR=1`.

**Q: Memory usage grows with large files** A: Ensure you're using the streaming API, not
`collectEvents()` for large inputs.

**Q: Parse errors with valid-looking JSON** A: Check for line encoding issues. The library expects
UTF-8 by default.

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
DEBUG=agent-stream-fmt:* agent-stream-fmt < input.jsonl
```

## License

MIT

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run performance benchmarks (CPU-intensive!)
npm run test:performance
```

**Note:** The test suite includes error handling tests that intentionally throw errors to verify
proper error handling. You may see error messages in stderr like "Parser error detection failed" -
these are expected and indicate the error handling tests are working correctly.

**Performance Tests:** Performance benchmarks are excluded from the main test suite because they are
extremely CPU-intensive, processing millions of lines to measure throughput. Run them separately
with `npm run test:performance` when needed.

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup and guidelines.
