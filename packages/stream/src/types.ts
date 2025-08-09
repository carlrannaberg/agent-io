/**
 * Normalized event types emitted by the parser
 *
 * AgentEvent is a discriminated union representing all possible events
 * that can be emitted by AI agent CLIs. Each event has a type discriminator
 * field `t` that determines its structure.
 *
 * @example
 * ```typescript
 * function handleEvent(event: AgentEvent) {
 *   switch (event.t) {
 *     case 'msg':
 *       console.log(`${event.role}: ${event.text}`);
 *       break;
 *     case 'tool':
 *       if (event.phase === 'start') {
 *         console.log(`Running ${event.name}...`);
 *       }
 *       break;
 *     case 'cost':
 *       console.log(`Cost: $${event.deltaUsd.toFixed(4)}`);
 *       break;
 *   }
 * }
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export type AgentEvent =
  | MessageEvent
  | ToolEvent
  | CostEvent
  | ErrorEvent
  | DebugEvent;

/**
 * Message event representing user, assistant, or system messages
 *
 * Message events are the core communication between users and AI assistants.
 * They include the role of the speaker and the text content of the message.
 *
 * @example
 * ```typescript
 * const message: MessageEvent = {
 *   t: 'msg',
 *   role: 'assistant',
 *   text: 'Hello! How can I help you today?'
 * };
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export interface MessageEvent {
  /** Event type discriminator */
  t: 'msg';
  /** Message role - who sent this message */
  role: 'user' | 'assistant' | 'system';
  /** Message content text */
  text: string;
}

/**
 * Tool event representing different phases of tool execution
 *
 * Tool events track the lifecycle of tool/command execution by AI agents.
 * They include start, output (stdout/stderr), and end phases with optional
 * exit codes for completion status.
 *
 * @example
 * ```typescript
 * // Tool start event
 * const start: ToolEvent = {
 *   t: 'tool',
 *   name: 'bash',
 *   phase: 'start'
 * };
 *
 * // Tool output event
 * const output: ToolEvent = {
 *   t: 'tool',
 *   name: 'bash',
 *   phase: 'stdout',
 *   text: 'Hello from bash!\n'
 * };
 *
 * // Tool completion event
 * const end: ToolEvent = {
 *   t: 'tool',
 *   name: 'bash',
 *   phase: 'end',
 *   exitCode: 0
 * };
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export interface ToolEvent {
  /** Event type discriminator */
  t: 'tool';
  /** Tool name or identifier (e.g., 'bash', 'python', 'read_file') */
  name: string;
  /** Current phase of tool execution */
  phase: 'start' | 'stdout' | 'stderr' | 'end';
  /** Tool output text (for stdout/stderr phases) */
  text?: string;
  /** Exit code (for end phase) - 0 indicates success */
  exitCode?: number;
}

/**
 * Cost event representing usage costs
 *
 * Cost events track the incremental costs of AI model usage,
 * typically reported after message exchanges or tool executions.
 *
 * @example
 * ```typescript
 * const cost: CostEvent = {
 *   t: 'cost',
 *   deltaUsd: 0.0234  // $0.0234 for this interaction
 * };
 *
 * // Accumulate total cost
 * let totalCost = 0;
 * if (event.t === 'cost') {
 *   totalCost += event.deltaUsd;
 *   console.log(`Total cost: $${totalCost.toFixed(4)}`);
 * }
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export interface CostEvent {
  /** Event type discriminator */
  t: 'cost';
  /** Cost delta in USD for this interaction */
  deltaUsd: number;
}

/**
 * Error event representing parsing or execution errors
 *
 * Error events capture failures during parsing or execution,
 * allowing graceful error handling in the streaming pipeline.
 *
 * @example
 * ```typescript
 * const error: ErrorEvent = {
 *   t: 'error',
 *   message: 'Failed to parse JSON: Unexpected token < at position 0'
 * };
 *
 * // Handle errors in stream
 * for await (const event of streamEvents(options)) {
 *   if (event.t === 'error') {
 *     console.error('Stream error:', event.message);
 *   }
 * }
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export interface ErrorEvent {
  /** Event type discriminator */
  t: 'error';
  /** Error message describing what went wrong */
  message: string;
}

/**
 * Debug event for unknown or debug data
 *
 * Debug events capture unrecognized or diagnostic data from AI agent CLIs.
 * They're useful for troubleshooting new formats or debugging parser issues.
 *
 * @example
 * ```typescript
 * const debug: DebugEvent = {
 *   t: 'debug',
 *   raw: { type: 'unknown', data: { custom: 'field' } }
 * };
 *
 * // Log debug events during development
 * if (event.t === 'debug' && process.env.DEBUG) {
 *   console.log('Debug data:', JSON.stringify(event.raw, null, 2));
 * }
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export interface DebugEvent {
  /** Event type discriminator */
  t: 'debug';
  /** Raw data for debugging - can be any JSON-serializable value */
  raw: unknown;
}

/**
 * Supported vendor identifiers
 *
 * Vendor identifiers determine which parser to use for JSONL input.
 * Use 'auto' to automatically detect the format from the input.
 *
 * @example
 * ```typescript
 * // Explicit vendor selection
 * const options: StreamEventOptions = {
 *   vendor: 'claude',
 *   source: process.stdin
 * };
 *
 * // Auto-detection
 * const autoOptions: StreamEventOptions = {
 *   vendor: 'auto',
 *   source: inputStream
 * };
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export type Vendor = 'auto' | 'claude' | 'gemini' | 'amp' | 'cursor';

/**
 * Options for streaming events
 *
 * Configuration for the event streaming pipeline, specifying the vendor
 * format and input source stream.
 *
 * @example
 * ```typescript
 * const options: StreamEventOptions = {
 *   vendor: 'claude',
 *   source: process.stdin
 * };
 *
 * for await (const event of streamEvents(options)) {
 *   console.log(event);
 * }
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export interface StreamEventOptions {
  /** Vendor to use for parsing - use 'auto' for automatic detection */
  vendor: Vendor;
  /** Input stream source containing JSONL data */
  source: NodeJS.ReadableStream;
}

/**
 * Options for streaming with formatting
 *
 * Extends StreamEventOptions to include output formatting configuration.
 * Supports ANSI terminal colors, HTML, and raw JSON output.
 *
 * @example
 * ```typescript
 * // Terminal output with colors
 * const ansiOptions: StreamFormatOptions = {
 *   vendor: 'claude',
 *   source: process.stdin,
 *   format: 'ansi',
 *   renderOptions: {
 *     collapseTools: true,
 *     hideTimestamps: false
 *   }
 * };
 *
 * // HTML output for web display
 * const htmlOptions: StreamFormatOptions = {
 *   vendor: 'gemini',
 *   source: inputStream,
 *   format: 'html',
 *   renderOptions: {
 *     theme: 'light'
 *   }
 * };
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export interface StreamFormatOptions extends StreamEventOptions {
  /** Output format - 'ansi' for terminal, 'html' for web, 'json' for raw events */
  format?: 'ansi' | 'html' | 'json';
  /** Renderer-specific options for customizing output */
  renderOptions?: Partial<import('./render/types.js').RenderOptions>;
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
 * Options for formatting output
 *
 * Legacy formatting options used internally. For new code, use
 * StreamFormatOptions with renderOptions instead.
 *
 * @deprecated Use StreamFormatOptions instead
 * @category Types
 * @since 0.1.0
 */
export interface FmtOptions {
  /** Group tool phases into collapsible blocks */
  collapseTools?: boolean;

  /** Completely hide tool events */
  hideTools?: boolean;

  /** Hide cost information */
  hideCost?: boolean;

  /** Output format: true = ANSI, false = plain, 'html' = HTML */
  ansi?: boolean | 'html';

  /** Callback for every parsed event (before filtering) */
  onEvent?: (ev: AgentEvent) => void;

  /** Batch size for write operations (performance tuning) */
  chunkSize?: number;
}

/**
 * Type guards for event discrimination
 *
 * Type guard functions provide runtime type checking for AgentEvent
 * discrimination, enabling TypeScript's type narrowing in conditionals.
 *
 * @category Utilities
 * @since 0.1.0
 */

/**
 * Check if an event is a MessageEvent
 *
 * @param e - Event to check
 * @returns True if event is a MessageEvent
 *
 * @example
 * ```typescript
 * if (isMessageEvent(event)) {
 *   // TypeScript knows event is MessageEvent here
 *   console.log(`${event.role}: ${event.text}`);
 * }
 * ```
 *
 * @category Utilities
 * @since 0.1.0
 */
export const isMessageEvent = (e: AgentEvent): e is MessageEvent =>
  e.t === 'msg';

/**
 * Check if an event is a ToolEvent
 *
 * @param e - Event to check
 * @returns True if event is a ToolEvent
 *
 * @example
 * ```typescript
 * if (isToolEvent(event)) {
 *   // TypeScript knows event is ToolEvent here
 *   if (event.phase === 'start') {
 *     console.log(`Starting tool: ${event.name}`);
 *   }
 * }
 * ```
 *
 * @category Utilities
 * @since 0.1.0
 */
export const isToolEvent = (e: AgentEvent): e is ToolEvent => e.t === 'tool';

/**
 * Check if an event is a CostEvent
 *
 * @param e - Event to check
 * @returns True if event is a CostEvent
 *
 * @example
 * ```typescript
 * let totalCost = 0;
 * if (isCostEvent(event)) {
 *   // TypeScript knows event is CostEvent here
 *   totalCost += event.deltaUsd;
 * }
 * ```
 *
 * @category Utilities
 * @since 0.1.0
 */
export const isCostEvent = (e: AgentEvent): e is CostEvent => e.t === 'cost';

/**
 * Check if an event is an ErrorEvent
 *
 * @param e - Event to check
 * @returns True if event is an ErrorEvent
 *
 * @example
 * ```typescript
 * if (isErrorEvent(event)) {
 *   // TypeScript knows event is ErrorEvent here
 *   console.error('Error:', event.message);
 * }
 * ```
 *
 * @category Utilities
 * @since 0.1.0
 */
export const isErrorEvent = (e: AgentEvent): e is ErrorEvent => e.t === 'error';

/**
 * Check if an event is a DebugEvent
 *
 * @param e - Event to check
 * @returns True if event is a DebugEvent
 *
 * @example
 * ```typescript
 * if (isDebugEvent(event) && process.env.DEBUG) {
 *   // TypeScript knows event is DebugEvent here
 *   console.log('Debug:', JSON.stringify(event.raw, null, 2));
 * }
 * ```
 *
 * @category Utilities
 * @since 0.1.0
 */
export const isDebugEvent = (e: AgentEvent): e is DebugEvent => e.t === 'debug';
