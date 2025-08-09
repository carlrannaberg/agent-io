import {
  AgentEvent,
  StreamEventOptions,
  StreamFormatOptions,
} from './types.js';
import { selectParser } from './parsers/index.js';
import { createLineReaderWithLineNumbers } from './utils/line-reader.js';
import { ParseError } from './parsers/types.js';
import { createRenderer } from './render/factory.js';
import type { RenderOptions } from './render/types.js';

/**
 * Options for streaming behavior
 */
export interface StreamOptions extends StreamEventOptions {
  /** Continue on parse errors (default: true) */
  continueOnError?: boolean;

  /** Emit debug events for unknown formats (default: false) */
  emitDebugEvents?: boolean;

  /** Maximum consecutive errors before stopping (default: 100) */
  maxConsecutiveErrors?: number;

  /** Line reader options */
  lineReaderOptions?: {
    maxLineLength?: number;
    encoding?:
      | 'utf8'
      | 'ascii'
      | 'utf-8'
      | 'utf16le'
      | 'ucs2'
      | 'ucs-2'
      | 'base64'
      | 'latin1'
      | 'binary'
      | 'hex';
  };
}

/**
 * Stream events from JSONL input with automatic vendor detection
 *
 * This is the core streaming function that parses JSONL input from any supported
 * AI agent CLI and yields normalized AgentEvent objects. It handles partial lines,
 * error recovery, and automatic vendor detection.
 *
 * @param options - Streaming options
 * @param options.vendor - Vendor format to use ('auto' for automatic detection)
 * @param options.source - Readable stream containing JSONL data
 * @param options.continueOnError - Continue parsing after errors (default: true)
 * @param options.emitDebugEvents - Emit debug events for unknown formats (default: false)
 * @param options.maxConsecutiveErrors - Stop after this many consecutive errors (default: 100)
 * @param options.lineReaderOptions - Options for line reading (maxLineLength, encoding)
 * @returns Async iterator of normalized agent events
 *
 * @example
 * ```typescript
 * // Basic usage with explicit vendor
 * for await (const event of streamEvents({
 *   vendor: 'claude',
 *   source: process.stdin
 * })) {
 *   console.log(event);
 * }
 *
 * // Auto-detection with error handling
 * try {
 *   for await (const event of streamEvents({
 *     vendor: 'auto',
 *     source: inputStream,
 *     emitDebugEvents: true
 *   })) {
 *     if (event.t === 'error') {
 *       console.error('Parse error:', event.message);
 *     } else {
 *       processEvent(event);
 *     }
 *   }
 * } catch (error) {
 *   console.error('Stream failed:', error);
 * }
 * ```
 *
 * @throws {Error} If vendor is 'auto' but no data is available for detection
 * @throws {Error} If specified vendor is not supported
 * @throws {Error} If max consecutive errors is exceeded
 *
 * @category Main API
 * @since 0.1.0
 */
export async function* streamEvents(
  options: StreamOptions,
): AsyncGenerator<AgentEvent, void, unknown> {
  const {
    vendor,
    source,
    continueOnError = true,
    emitDebugEvents = false,
    maxConsecutiveErrors = 100,
    lineReaderOptions = {},
  } = options;

  let parser: ReturnType<typeof selectParser> | null = null;
  let consecutiveErrors = 0;
  let totalLines = 0;
  let successfulLines = 0;

  // Create line reader
  const lineReader = createLineReaderWithLineNumbers(source, lineReaderOptions);

  try {
    for await (const { line, lineNumber } of lineReader) {
      totalLines++;

      try {
        // Auto-detect parser on first line if needed
        if (!parser) {
          parser = selectParser(vendor, line);

          // Emit debug event about detected vendor
          if (emitDebugEvents && vendor === 'auto') {
            yield {
              t: 'debug',
              raw: { detected: parser.vendor, lineNumber },
            };
          }
        }

        // Parse line into events
        const events = parser.parse(line);

        // Yield each event
        for (const event of events) {
          yield event;
        }

        // Reset error counter on success
        consecutiveErrors = 0;
        successfulLines++;
      } catch (error) {
        consecutiveErrors++;

        // Enhance ParseError with line number if not already present
        let enhancedError = error;
        if (error instanceof ParseError && !error.context?.lineNumber) {
          enhancedError = new ParseError(
            error.message,
            error.vendor,
            error.line,
            error.cause,
            {
              ...error.context,
              lineNumber,
            },
          );
        }

        // Create error event
        const errorEvent: AgentEvent = {
          t: 'error',
          message:
            enhancedError instanceof ParseError
              ? `Line ${lineNumber}: ${enhancedError.message}`
              : `Line ${lineNumber}: ${enhancedError instanceof Error ? enhancedError.message : String(enhancedError)}`,
        };

        // Always yield error event
        yield errorEvent;

        // Emit debug info if requested
        if (emitDebugEvents) {
          yield {
            t: 'debug',
            raw: {
              lineNumber,
              line: line.substring(0, 200),
              error:
                enhancedError instanceof Error
                  ? enhancedError.stack
                  : String(enhancedError),
            },
          };
        }

        // Check if we should stop
        if (!continueOnError) {
          throw enhancedError;
        }

        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(
            `Stopped after ${maxConsecutiveErrors} consecutive errors. ` +
              `Processed ${successfulLines}/${totalLines} lines successfully.`,
          );
        }
      }
    }
  } finally {
    // Flush any buffered content from the parser
    if (parser && 'flush' in parser && typeof parser.flush === 'function') {
      try {
        const flushedEvents = parser.flush();
        for (const event of flushedEvents) {
          yield event;
        }
      } catch (flushError) {
        // Emit error event for flush failure
        yield {
          t: 'error',
          message: `Failed to flush parser: ${flushError instanceof Error ? flushError.message : String(flushError)}`,
        };
      }
    }

    // Emit summary debug event if requested
    if (emitDebugEvents && totalLines > 0) {
      yield {
        t: 'debug',
        raw: {
          summary: {
            totalLines,
            successfulLines,
            errorLines: totalLines - successfulLines,
            successRate:
              ((successfulLines / totalLines) * 100).toFixed(2) + '%',
          },
        },
      };
    }
  }
}

/**
 * Collect all events from a stream into an array
 *
 * WARNING: This loads all events into memory and should only be used for
 * testing or processing small streams. For production use, prefer the
 * streaming API to avoid memory issues.
 *
 * @param options - Same options as streamEvents
 * @returns Promise resolving to array of all events
 *
 * @example
 * ```typescript
 * // Collect events for testing
 * const events = await collectEvents({
 *   vendor: 'claude',
 *   source: fs.createReadStream('test.jsonl')
 * });
 *
 * // Analyze collected events
 * const messages = events.filter(e => e.t === 'msg');
 * const errors = events.filter(e => e.t === 'error');
 * console.log(`Parsed ${messages.length} messages, ${errors.length} errors`);
 * ```
 *
 * @category Main API
 * @since 0.1.0
 */
export async function collectEvents(
  options: StreamOptions,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];

  for await (const event of streamEvents(options)) {
    events.push(event);
  }

  return events;
}

/**
 * Extended options for streamFormat that includes filtering
 */
export interface ExtendedStreamFormatOptions extends StreamFormatOptions {
  /** Set of event types to include (if specified, only these types are rendered) */
  eventFilter?: Set<string>;
  /** Whether to emit debug events */
  emitDebugEvents?: boolean;
}

/**
 * Stream events with formatting applied
 *
 * This function combines event streaming with rendering, yielding
 * formatted strings instead of raw events. It automatically handles
 * renderer initialization and cleanup, making it easy to produce
 * beautiful terminal output or HTML documents.
 *
 * @param options - Streaming and formatting options
 * @param options.vendor - Vendor format to use ('auto' for detection)
 * @param options.source - Input stream containing JSONL data
 * @param options.format - Output format: 'ansi', 'html', or 'json' (default: 'ansi')
 * @param options.renderOptions - Renderer-specific options
 * @param options.eventFilter - Set of event types to include (filters out others)
 * @param options.emitDebugEvents - Whether to emit debug events
 * @returns Async iterator of formatted strings
 *
 * @example
 * ```typescript
 * // Stream ANSI-formatted output to console
 * for await (const output of streamFormat({
 *   vendor: 'claude',
 *   source: process.stdin,
 *   format: 'ansi'
 * })) {
 *   process.stdout.write(output);
 * }
 *
 * // Generate HTML output with filtering
 * const htmlParts = [];
 * for await (const output of streamFormat({
 *   vendor: 'gemini',
 *   source: stream,
 *   format: 'html',
 *   renderOptions: {
 *     collapseTools: true,
 *     theme: 'dark'
 *   },
 *   eventFilter: new Set(['msg', 'tool']) // Only messages and tools
 * })) {
 *   htmlParts.push(output);
 * }
 * const html = htmlParts.join('');
 *
 * // Stream raw JSON events
 * for await (const json of streamFormat({
 *   vendor: 'amp',
 *   source: input,
 *   format: 'json'
 * })) {
 *   const event = JSON.parse(json);
 *   await processEvent(event);
 * }
 * ```
 *
 * @category Main API
 * @since 0.1.0
 */
export async function* streamFormat(
  options: ExtendedStreamFormatOptions,
): AsyncGenerator<string, void, unknown> {
  const {
    vendor,
    source,
    format = 'ansi',
    renderOptions = {},
    eventFilter,
    emitDebugEvents,
  } = options;

  // Create renderer with merged options
  const fullRenderOptions: RenderOptions = {
    format,
    ...renderOptions,
  };
  const renderer = createRenderer(format, fullRenderOptions);

  // Stream options for the underlying event stream
  const streamOptions: StreamOptions = {
    vendor,
    source,
    emitDebugEvents,
    // Pass through compatible properties from StreamFormatOptions
    continueOnError: options.continueOnError,
    maxConsecutiveErrors: options.maxConsecutiveErrors,
    lineReaderOptions: options.lineReaderOptions,
  };

  try {
    // Process events through the renderer
    for await (const event of streamEvents(streamOptions)) {
      // Apply event filtering if specified
      if (eventFilter && !eventFilter.has(event.t)) {
        continue;
      }

      const formatted = renderer.render(event);
      if (formatted) {
        yield formatted;
      }
    }

    // Flush any pending output from the renderer
    const finalOutput = renderer.flush();
    if (finalOutput) {
      yield finalOutput;
    }
  } catch (error) {
    // Ensure we flush even on error
    const errorFlush = renderer.flush();
    if (errorFlush) {
      yield errorFlush;
    }
    throw error;
  }
}
