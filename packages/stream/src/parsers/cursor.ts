import type { VendorParser } from './types.js';
import type { AgentEvent } from '../types.js';

/**
 * Cursor-specific event type definitions
 */

interface CursorSystemEvent {
  type: 'system';
  subtype: 'init';
  apiKeySource: string;
  cwd: string;
  session_id: string;
  model: string;
  permissionMode: string;
}

interface CursorMessageEvent {
  type: 'user' | 'assistant';
  message: {
    role: 'user' | 'assistant';
    content: Array<{
      type: 'text';
      text: string;
    }>;
  };
  session_id: string;
}

interface CursorToolCallEvent {
  type: 'tool_call';
  subtype: 'started' | 'completed';
  call_id: string;
  tool_call: {
    [key: string]: {
      args?: Record<string, unknown>;
      result?: {
        success?: { content: string };
        error?: string | Record<string, unknown>;
      };
    };
  };
  session_id: string;
}

interface CursorResultEvent {
  type: 'result';
  subtype: 'success' | 'error';
  duration_ms: number;
  is_error: boolean;
  result: string;
  session_id: string;
}

// Union type for all Cursor events (prefixed with _ since not used yet but will be needed)
type _CursorEvent =
  | CursorSystemEvent
  | CursorMessageEvent
  | CursorToolCallEvent
  | CursorResultEvent;

/**
 * Cursor Agent JSONL parser
 *
 * Parses the JSONL output from Cursor Agent CLI when using the --json flag.
 * Handles message events, tool use/result events, and error events from
 * Cursor's AI agent interactions.
 *
 * @example
 * ```typescript
 * const parser = new CursorParser();
 * const events = parser.parse('{"type":"message","role":"assistant","content":"Hello"}');
 * ```
 */
export class CursorParser implements VendorParser {
  /** Vendor identifier */
  vendor = 'cursor' as const;

  /** Parser metadata */
  metadata = {
    version: '1.0.0',
    supportedVersions: ['1.0'],
    documentationUrl: 'https://docs.cursor.com/cli-reference',
  };

  /**
   * Message buffer for session tracking
   * Maps session IDs to accumulated message fragments
   */
  private messageBuffer = new Map<string, string[]>();

  /**
   * Buffer for incomplete JSON lines that are split across multiple lines
   * This handles the case where cursor-agent wraps long JSON at character limits
   */
  private incompleteLineBuffer = '';

  /**
   * Check if a text consists only of ignorable trailing garbage
   * such as commas, quotes, and whitespace.
   */
  private isGarbageSuffix(text: string): boolean {
    const t = text.trim();
    return (
      t === '' ||
      t === ',' ||
      t === ';' ||
      t === '""' ||
      t === '"' ||
      t === "''" ||
      t.startsWith(', ') ||
      /^[,\s"']+$/.test(t)
    );
  }

  /**
   * Extract the first complete top-level JSON object from text by
   * scanning braces while respecting string/escape sequences.
   * Returns the JSON substring and the remaining suffix, or null.
   */
  private extractFirstJsonObject(
    text: string,
  ): { json: string; suffix: string } | null {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let inString = false;
    let escape = false;
    let depth = 0;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') {
        depth++;
        continue;
      }
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const json = text.slice(start, i + 1);
          const suffix = text.slice(i + 1);
          return { json, suffix };
        }
      }
    }

    return null;
  }

  /** Remove ANSI escape/control sequences */
  private stripAnsi(text: string): string {
    // CSI sequences: ESC [ ... cmd
    // eslint-disable-next-line no-control-regex
    const CSI = /\x1B\[[0-?]*[ -/]*[@-~]/g;
    // OSC sequences: ESC ] ... BEL
    // eslint-disable-next-line no-control-regex
    const OSC = /\x1B\][^\x07]*\x07/g;
    // Other DCS/PM/APC terminated by ST (ESC \\)
    // eslint-disable-next-line no-control-regex
    const ST_TERM = /\x1B[PX^_].*?\x1B\\/gs;
    return text.replace(CSI, '').replace(OSC, '').replace(ST_TERM, '');
  }

  /** True if line is only ANSI/control or zero-width chars/whitespace */
  private isAnsiOrControlOnly(text: string): boolean {
    const cleaned = this.stripAnsi(text)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
    return cleaned === '';
  }

  /**
   * Detect if a line belongs to Cursor's JSONL format
   *
   * Fast detection method that checks for Cursor-specific event types.
   * Does not throw errors and returns false for any parsing issues.
   *
   * @param line - Raw JSONL line to test
   * @returns True if this parser can handle the line
   */
  detect(line: string): boolean {
    try {
      const obj = JSON.parse(line);

      // Type guard to ensure obj is a record
      if (
        !obj ||
        typeof obj !== 'object' ||
        obj === null ||
        Array.isArray(obj)
      ) {
        return false;
      }

      const record = obj as Record<string, unknown>;
      if (!('type' in record)) {
        return false;
      }

      const type = record.type;
      const validTypes = ['system', 'user', 'assistant', 'tool_call', 'result'];

      if (validTypes.includes(type as string)) {
        // Cursor-specific: Always has session_id field
        if (!('session_id' in record)) {
          return false;
        }

        // Distinguish from Claude Code which also has session_id
        // Claude Code has 'tools' array and 'parent_tool_use_id' field
        if ('tools' in record && Array.isArray(record.tools)) {
          return false; // This is Claude Code, not Cursor
        }

        // Claude Code messages have parent_tool_use_id field
        if ('parent_tool_use_id' in record) {
          return false; // This is Claude Code, not Cursor
        }

        // Check for Cursor-specific field combinations
        if (
          type === 'system' &&
          'subtype' in record &&
          'apiKeySource' in record &&
          record.apiKeySource === 'login'
        )
          return true;
        if (type === 'tool_call' && 'call_id' in record) return true;
        if (
          (type === 'user' || type === 'assistant') &&
          'message' in record &&
          record.message &&
          typeof record.message === 'object'
        ) {
          const msg = record.message as Record<string, unknown>;
          // Cursor uses simple content array with type/text objects
          // Claude Code has nested message with id, model, etc.
          if ('id' in msg || 'model' in msg) {
            return false; // This is Claude Code with nested message structure
          }
          if ('content' in msg && Array.isArray(msg.content)) return true;
        }
        if (type === 'result' && 'duration_ms' in record) return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Parse a single JSONL line into zero or more events
   *
   * Converts Cursor's JSONL format into normalized AgentEvent objects.
   * Handles all known Cursor event types and converts unknowns to DebugEvent.
   *
   * @param line - Raw JSONL line to parse
   * @returns Array of parsed events
   * @throws {ParseError} When JSON parsing fails
   */
  parse(line: string): AgentEvent[] {
    try {
      // Handle line-wrapped JSON where cursor-agent forces newlines at character limits
      // This is similar to how Claude Code wraps long JSON lines

      // Append current line to buffer
      this.incompleteLineBuffer += line;

      // Try to parse the accumulated buffer
      let obj: unknown;
      try {
        obj = JSON.parse(this.incompleteLineBuffer);
        // Successfully parsed - clear buffer and continue
        const completeLine = this.incompleteLineBuffer;
        this.incompleteLineBuffer = '';

        if (!this.detect(completeLine)) {
          return [{ t: 'debug', raw: obj }];
        }

        return this.parseEvent(obj as Record<string, unknown>);
      } catch (parseError) {
        // Check if this looks like an incomplete JSON object
        const trimmed = this.incompleteLineBuffer.trim();

        // Robust salvage: extract first complete JSON object and ignore
        // any trailing garbage that consists only of commas/quotes/whitespace.
        const extracted = this.extractFirstJsonObject(trimmed);
        if (extracted) {
          try {
            const parsed = JSON.parse(extracted.json);
            // Always drop any suffix after the first full JSON object for Cursor
            // Cursor outputs are one object per logical emission; suffixes are noise
            this.incompleteLineBuffer = '';
            if (!this.detect(extracted.json)) {
              return [{ t: 'debug', raw: parsed }];
            }
            return this.parseEvent(parsed as Record<string, unknown>);
          } catch {
            // fall through to normal handling
          }
        }

        // If it starts with { but doesn't end with }, it's likely incomplete
        if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
          // Keep buffering - line is incomplete
          return [];
        }

        // If it doesn't start with {, it might be a continuation line
        if (!trimmed.startsWith('{') && this.incompleteLineBuffer !== line) {
          // This was a continuation, keep buffering
          return [];
        }

        // Ignore common trailing garbage that cursor-agent might output
        // This includes commas, quotes, empty strings, etc.
        if (this.isGarbageSuffix(trimmed)) {
          this.incompleteLineBuffer = '';
          return [];
        }

        // Ignore pure ANSI/control sequences (e.g., terminal show/hide cursor)
        if (this.isAnsiOrControlOnly(trimmed)) {
          this.incompleteLineBuffer = '';
          return [];
        }

        // Otherwise, this is genuinely malformed JSON
        // Clear buffer and return error
        this.incompleteLineBuffer = '';

        // Only show error for actual parsing issues
        if (trimmed && !trimmed.startsWith(',')) {
          return [
            {
              t: 'error',
              message: `Cursor parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            },
          ];
        }
        return [];
      }
    } catch (error) {
      // Clear buffer on unexpected errors
      this.incompleteLineBuffer = '';
      return [
        {
          t: 'error',
          message: `Cursor parse error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ];
    }
  }

  /**
   * Parse a Cursor event object into normalized events
   *
   * Routes the event to the appropriate parser based on event type.
   * Handles session management and message buffering for streaming text.
   *
   * @param obj - Parsed JSON object from Cursor
   * @returns Array of normalized events
   */
  private parseEvent(obj: Record<string, unknown>): AgentEvent[] {
    const events: AgentEvent[] = [];
    const sessionId = obj.session_id as string;

    switch (obj.type) {
      case 'system': {
        if (obj.subtype === 'init') {
          // System initialization - convert to debug event
          events.push({
            t: 'debug',
            raw: {
              vendor: 'cursor',
              model: obj.model,
              cwd: obj.cwd,
              session: sessionId,
            },
          });
        }
        break;
      }

      case 'user': {
        // Flush any buffered assistant messages before processing user message
        if (sessionId && this.messageBuffer.has(sessionId)) {
          const buffered = this.messageBuffer.get(sessionId)!.join('');
          if (buffered) {
            events.push({ t: 'msg', role: 'assistant', text: buffered });
          }
          this.messageBuffer.delete(sessionId);
        }
        events.push(this.parseMessage(obj, 'user'));
        break;
      }

      case 'assistant': {
        // Handle streaming text assembly
        const msg = this.parseMessage(obj, 'assistant');

        // Buffer management for streaming text
        if (sessionId && 'text' in msg && msg.text) {
          if (!this.messageBuffer.has(sessionId)) {
            this.messageBuffer.set(sessionId, []);
          }
          this.messageBuffer.get(sessionId)!.push(msg.text);

          // Don't emit individual tokens during streaming
          // Wait for a complete message or result event to flush
          // Return empty array to suppress token-by-token output
          return [];
        }

        events.push(msg);
        break;
      }

      case 'result': {
        // Final result - flush any buffered messages
        if (sessionId && this.messageBuffer.has(sessionId)) {
          const buffered = this.messageBuffer.get(sessionId)!.join('');
          if (buffered) {
            events.push({ t: 'msg', role: 'assistant', text: buffered });
          }
          this.messageBuffer.delete(sessionId);
        }

        // Add result as debug info
        if (obj.result) {
          events.push({
            t: 'debug',
            raw: {
              type: 'result',
              success: !obj.is_error,
              duration_ms: obj.duration_ms,
              summary: obj.result,
            },
          });
        }
        break;
      }

      case 'tool_call': {
        // On tool_call events, also flush any buffered messages before the tool
        // This ensures text appears before tool execution starts
        if (
          obj.subtype === 'started' &&
          sessionId &&
          this.messageBuffer.has(sessionId)
        ) {
          const buffered = this.messageBuffer.get(sessionId)!.join('');
          if (buffered) {
            events.push({ t: 'msg', role: 'assistant', text: buffered });
          }
          this.messageBuffer.delete(sessionId);
        }
        events.push(...this.parseToolCall(obj));
        break;
      }

      default: {
        events.push({ t: 'debug', raw: obj });
      }
    }

    return events;
  }

  /**
   * Parse message events from Cursor
   *
   * Extracts text content from Cursor's message structure which uses
   * an array of content objects with type/text properties.
   *
   * @param obj - Message event object
   * @param role - Message role (user or assistant)
   * @returns Normalized message event
   */
  private parseMessage(
    obj: Record<string, unknown>,
    role: 'user' | 'assistant',
  ): AgentEvent {
    const message = obj.message as
      | { content?: Array<{ type: string; text?: string }> }
      | undefined;
    let text = '';

    if (message?.content && Array.isArray(message.content)) {
      text = message.content
        .filter((c: { type: string; text?: string }) => c.type === 'text')
        .map((c: { type: string; text?: string }) => c.text || '')
        .join('');
    }

    return { t: 'msg', role, text };
  }

  /**
   * Flush any buffered messages
   *
   * Called when the stream ends to ensure all buffered content is emitted.
   *
   * @returns Array of flushed message events
   */
  flush(): AgentEvent[] {
    const events: AgentEvent[] = [];

    // Flush all buffered messages from all sessions
    for (const [_sessionId, buffer] of this.messageBuffer.entries()) {
      const text = buffer.join('');
      if (text) {
        events.push({ t: 'msg', role: 'assistant', text });
      }
    }

    // Clear all buffers
    this.messageBuffer.clear();

    // Also clear incomplete line buffer
    if (this.incompleteLineBuffer.trim()) {
      // If there's incomplete JSON, emit as error
      events.push({
        t: 'error',
        message: `Incomplete JSON at stream end: ${this.incompleteLineBuffer.substring(0, 100)}...`,
      });
      this.incompleteLineBuffer = '';
    }

    return events;
  }

  /**
   * Parse tool call events from Cursor
   *
   * Handles both 'started' and 'completed' subtypes, extracting tool names,
   * arguments, and results from Cursor's nested tool_call structure.
   *
   * @param obj - Tool call event object
   * @returns Array of tool events (start, stdout/stderr, end)
   */
  private parseToolCall(obj: Record<string, unknown>): AgentEvent[] {
    const events: AgentEvent[] = [];
    const subtype = obj.subtype as string;

    // Extract tool name from nested structure
    let toolName = 'unknown';
    let args: Record<string, unknown> = {};
    let result: {
      success?: { content: string };
      error?: string | Record<string, unknown>;
    } | null = null;

    const toolCall = obj.tool_call as Record<string, unknown> | undefined;
    if (toolCall) {
      // Find the tool name from the nested structure
      const callKeys = Object.keys(toolCall);
      if (callKeys.length > 0) {
        const toolKey = callKeys[0]; // e.g., 'readToolCall'
        toolName = toolKey.replace(/ToolCall$/, ''); // Remove suffix

        const toolData = toolCall[toolKey] as
          | {
              args?: Record<string, unknown>;
              result?: {
                success?: { content: string };
                error?: string | Record<string, unknown>;
              };
            }
          | undefined;
        if (toolData) {
          args = toolData.args || {};
          result = toolData.result || null;
        }
      }
    }

    if (subtype === 'started') {
      // Pass raw args as JSON for the ANSI renderer to extract params
      // This matches how Claude parser does it
      events.push({
        t: 'tool',
        name: toolName,
        phase: 'start',
        text: Object.keys(args).length > 0 ? JSON.stringify(args) : undefined,
      });
    } else if (subtype === 'completed') {
      // Don't show file contents as stdout - just show completion
      // Claude's formatter doesn't show content for file operations

      if (result?.error) {
        events.push({
          t: 'tool',
          name: toolName,
          phase: 'stderr',
          text: JSON.stringify(result.error),
        });
      }

      events.push({
        t: 'tool',
        name: toolName,
        phase: 'end',
        exitCode: result?.error ? 1 : 0,
      });
    }

    return events;
  }
}

/**
 * Singleton instance of Cursor parser
 *
 * Pre-configured parser instance ready for use in the parser registry.
 *
 * @example
 * ```typescript
 * import { cursorParser } from './cursor.js';
 * const events = cursorParser.parse(jsonlLine);
 * ```
 */
export const cursorParser = new CursorParser();
