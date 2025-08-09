#!/usr/bin/env node
import { createReadStream, createWriteStream, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { streamFormat } from './stream.js';
import type { ExtendedStreamFormatOptions } from './stream.js';
import { Vendor } from './types.js';
import { Command } from 'commander';
import type { RenderOptions } from './render/types.js';

/**
 * CLI for formatting JSONL output from AI agent CLIs
 * Supports Claude Code, Gemini CLI, and Amp Code with beautiful terminal and HTML rendering
 */

// HTML document wrapper constants
const HTML_DOCUMENT_START = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Stream Output</title>
  <style>
    body { font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; line-height: 1.6; margin: 20px; background: #fafafa; color: #333; }
    .message { margin: 1em 0; padding: 1em; border-radius: 8px; }
    .message-user { background: #f0f8ff; border-left: 4px solid #007acc; }
    .message-assistant { background: #f0fff0; border-left: 4px solid #28a745; }
    .message-system { background: #fffbf0; border-left: 4px solid #ffc107; }
    .message-header { font-weight: bold; margin-bottom: 0.5em; }
    .tool-execution { margin: 1em 0; padding: 1em; background: #f8f9fa; border-radius: 4px; }
    .tool-start { font-weight: bold; color: #007acc; }
    .tool-output { margin: 0.5em 0; padding: 0.5em; background: #ffffff; border-radius: 4px; font-family: monospace; }
    .tool-stdout { color: #333; }
    .tool-stderr { color: #dc3545; }
    .tool-end.success { color: #28a745; font-weight: bold; }
    .tool-end.error { color: #dc3545; font-weight: bold; }
    .error-message { padding: 1em; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; color: #721c24; }
    .cost-info { display: inline-block; padding: 0.2em 0.5em; background: #fff3cd; border-radius: 4px; font-size: 0.9em; }
    .debug-info { padding: 0.5em; background: #e9ecef; border-radius: 4px; font-size: 0.8em; font-family: monospace; }
    pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; }
    code { background: #f8f9fa; padding: 0.2em 0.4em; border-radius: 3px; }
  </style>
</head>
<body>
`;

const HTML_DOCUMENT_END = `
</body>
</html>
`;

// Get package version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
);
const packageVersion = packageJson.version;

interface CliOptions {
  vendor: string;
  format: string;
  collapseTools: boolean;
  hideTools: boolean;
  hideCost: boolean;
  hideDebug: boolean;
  only?: string;
  output?: string;
  html: boolean;
  json: boolean;
}

async function main() {
  const program = new Command();

  program
    .name('aio-stream')
    .description(
      'Format JSONL output from AI agent CLIs with beautiful terminal and HTML rendering',
    )
    .version(packageVersion)
    .argument('[file]', 'input JSONL file (default: stdin)')
    .option(
      '-v, --vendor <type>',
      'vendor type (auto|claude|cursor|gemini|amp)',
      'auto',
    )
    .option('-f, --format <type>', 'output format (ansi|html|json)', 'ansi')
    .option('--collapse-tools', 'collapse tool output sections', false)
    .option('--hide-tools', 'hide tool execution entirely', false)
    .option('--hide-cost', 'hide cost information', false)
    .option('--hide-debug', 'hide debug events (use --no-hide-debug to show)')
    .option(
      '--only <types>',
      'only show specific event types (comma-separated)',
    )
    .option('-o, --output <file>', 'output file (default: stdout)')
    .option('--html', 'shorthand for --format html')
    .option('--json', 'shorthand for --format json')
    .addHelpText(
      'after',
      `
Examples:
  # Auto-detect vendor and format for terminal
  claude --json "explain recursion" | aio-stream
  
  # Explicit vendor with options
  gemini --jsonl -i task.md | aio-stream --vendor gemini --hide-tools
  
  # HTML output for web display
  amp-code run build.yml -j | aio-stream --html > build-log.html
  
  # Filter specific event types
  cat session.jsonl | aio-stream --only tool,error --collapse-tools
  
  # Read from file
  aio-stream output.jsonl --vendor claude
  
Event types for --only:
  msg     - user/assistant/system messages
  tool    - tool execution (start/stdout/stderr/end)
  cost    - usage cost information
  error   - error messages
  debug   - debug information
  
Vendor auto-detection:
  - Automatically detects format from input
  - Supports claude, cursor, gemini, amp formats
  - Use --vendor to force specific parser
`,
    );

  program.parse(process.argv);

  const opts = program.opts() as CliOptions;
  const args = program.args;
  const inputFile = args[0];

  // Handle shorthand options
  if (opts.html) opts.format = 'html';
  if (opts.json) opts.format = 'json';

  // Set default for hideDebug if not specified
  if (opts.hideDebug === undefined) {
    opts.hideDebug = true;
  }

  // Validate format
  if (!['ansi', 'html', 'json'].includes(opts.format)) {
    process.stderr.write(
      `Error: Invalid format '${opts.format}'. Must be one of: ansi, html, json\n`,
    );
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      process.exit(1);
    } else {
      throw new Error(`Invalid format '${opts.format}'`);
    }
  }

  // Validate vendor
  if (!['auto', 'claude', 'cursor', 'gemini', 'amp'].includes(opts.vendor)) {
    process.stderr.write(
      `Error: Invalid vendor '${opts.vendor}'. Must be one of: auto, claude, cursor, gemini, amp\n`,
    );
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      process.exit(1);
    } else {
      throw new Error(`Invalid vendor '${opts.vendor}'`);
    }
  }

  // Setup output stream
  const output = opts.output ? createWriteStream(opts.output) : process.stdout;

  // Disable output buffering for real-time streaming when writing to stdout
  if (!opts.output && process.stdout) {
    // Use a type assertion to access internal Node.js properties
    const stdoutInternal = process.stdout as {
      _handle?: { setBlocking?: (blocking: boolean) => void };
    };
    if (stdoutInternal._handle && stdoutInternal._handle.setBlocking) {
      stdoutInternal._handle.setBlocking(true);
    }
  }

  // Setup event filtering
  let eventFilter: Set<string> | undefined;
  if (opts.only) {
    eventFilter = new Set(opts.only.split(',').map((s: string) => s.trim()));
    // Validate event types
    const validTypes = new Set(['msg', 'tool', 'cost', 'error', 'debug']);
    for (const type of eventFilter) {
      if (!validTypes.has(type)) {
        process.stderr.write(
          `Error: Invalid event type '${type}'. Valid types: ${Array.from(validTypes).join(', ')}\n`,
        );
        if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
          process.exit(1);
        } else {
          throw new Error(`Invalid event type '${type}'`);
        }
      }
    }
  }

  // Setup render options
  const renderOptions: RenderOptions = {
    format: opts.format as 'ansi' | 'html' | 'json',
    collapseTools: opts.collapseTools,
    hideTools: opts.hideTools,
    hideCost: opts.hideCost,
    hideDebug: opts.hideDebug,
    // Use compact mode for JSON to ensure JSONL output
    compactMode: opts.format === 'json',
  };

  // Add HTML document wrapper for HTML output
  if (opts.format === 'html') {
    try {
      output.write(HTML_DOCUMENT_START);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'EPIPE'
      ) {
        process.exit(0);
      }
      throw error;
    }
  }

  try {
    // Create input stream
    const source = inputFile
      ? createReadStream(inputFile, { encoding: 'utf8' })
      : process.stdin;

    // Configure stdin if using it
    if (!inputFile) {
      process.stdin.setEncoding('utf8');
      process.stdin.on('error', err => {
        // Handle stdin errors gracefully
        if ('code' in err && err.code === 'EPIPE') {
          process.exit(0);
        }
        throw err;
      });
    }

    // Stream with formatting
    const formatOptions: ExtendedStreamFormatOptions = {
      vendor: opts.vendor as Vendor,
      source,
      format: opts.format as 'ansi' | 'html' | 'json',
      renderOptions,
      eventFilter,
      emitDebugEvents: !opts.hideDebug,
    };

    for await (const formatted of streamFormat(formatOptions)) {
      try {
        // Write to output stream
        const writeSuccessful = output.write(formatted);

        // If write returned false (backpressure), wait for drain
        if (!writeSuccessful && output !== process.stdout) {
          await new Promise<void>(resolve =>
            output.once('drain', () => resolve()),
          );
        }
      } catch (error) {
        // Handle EPIPE errors gracefully - the output pipe was closed
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'EPIPE'
        ) {
          process.exit(0);
        }
        throw error;
      }
    }
  } catch (error) {
    if (opts.format === 'html') {
      // Write error in HTML format
      output.write(
        `<div class="error-message">Error: ${error instanceof Error ? error.message : String(error)}</div>`,
      );
    } else {
      process.stderr.write(
        `\nError: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      process.exit(1);
    } else {
      throw error; // Re-throw in test environment instead of calling process.exit
    }
  } finally {
    if (opts.format === 'html') {
      try {
        output.write(HTML_DOCUMENT_END);
      } catch (error) {
        // Ignore EPIPE errors in cleanup
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code !== 'EPIPE'
        ) {
          console.error('Error writing HTML end:', error);
        }
      }
    }

    if (opts.output) {
      // For file output, we need to wait for the stream to finish
      await new Promise<void>((resolve, reject) => {
        output.end((error?: Error | null) => {
          if (error && 'code' in error && error.code !== 'EPIPE') {
            console.error('Error closing output file:', error);
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  }
}

// Handle SIGPIPE and EPIPE errors gracefully
process.on('SIGPIPE', () => {
  // Ignore SIGPIPE - this happens when the output pipe is closed
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  // EPIPE means the output pipe was closed (e.g., when piping to head or when the receiving process exits)
  if (error && 'code' in error && error.code === 'EPIPE') {
    process.exit(0);
  }
  // For other errors, log and exit
  process.stderr.write(`Uncaught error: ${error.message}\n`);
  process.exit(1);
});

// Run if called directly
// Check if this module is the entry point.
// In ESM: import.meta.url === `file://${process.argv[1]}`
// In CJS: require.main === module (but we can't use 'module' in ES modules)
// So we check various fallback conditions that work in both environments
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  // For CJS builds, tsup transforms import.meta.url but the comparison might fail
  // Check if being run directly via node or via the bin script
  process.argv[1]?.endsWith('cli.js') ||
  process.argv[1]?.endsWith('cli.cjs') ||
  process.argv[1]?.endsWith('aio-stream') ||
  // Additional check for when invoked via npm/npx
  process.argv[1]?.includes('aio-stream');

if (isMainModule) {
  main().catch(error => {
    // Handle EPIPE errors gracefully
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'EPIPE'
    ) {
      process.exit(0);
    }
    process.stderr.write(
      `Fatal error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}

export { main };
