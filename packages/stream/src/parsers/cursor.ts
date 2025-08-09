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
type _CursorEvent = CursorSystemEvent | CursorMessageEvent | CursorToolCallEvent | CursorResultEvent;

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
      if (!obj || typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        return false;
      }
      
      const record = obj as Record<string, unknown>;
      if (!('type' in record)) {
        return false;
      }
      
      const type = record.type;
      const validTypes = ['system', 'user', 'assistant', 'tool_call', 'result'];
      
      if (validTypes.includes(type as string)) {
        if (type === 'system' && 'subtype' in record) return true;
        if (type === 'tool_call' && 'call_id' in record) return true;
        if ((type === 'user' || type === 'assistant') && 'message' in record) return true;
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
      const obj = JSON.parse(line);
      if (!this.detect(line)) {
        return [{ t: 'debug', raw: obj }];
      }
      
      return this.parseEvent(obj);
    } catch (error) {
      return [{
        t: 'error',
        message: `Cursor parse error: ${error instanceof Error ? error.message : String(error)}`
      }];
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
              session: sessionId
            }
          });
        }
        break;
      }
        
      case 'user': {
        events.push(this.parseMessage(obj, 'user'));
        break;
      }
        
      case 'assistant': {
        // Handle streaming text assembly
        const msg = this.parseMessage(obj, 'assistant');
        
        // Buffer management for streaming text
        if (sessionId && msg.text) {
          if (!this.messageBuffer.has(sessionId)) {
            this.messageBuffer.set(sessionId, []);
          }
          this.messageBuffer.get(sessionId)!.push(msg.text);
          
          // Don't emit individual characters/words in streaming mode
          // Could be enhanced with a timeout-based flush strategy
        }
        
        events.push(msg);
        break;
      }
        
      case 'tool_call': {
        events.push(...this.parseToolCall(obj));
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
              summary: obj.result
            }
          });
        }
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
  private parseMessage(obj: Record<string, unknown>, role: 'user' | 'assistant'): AgentEvent {
    const message = obj.message as { content?: Array<{ type: string; text?: string }> } | undefined;
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
    let result: { success?: { content: string }; error?: string | Record<string, unknown> } | null = null;
    
    const toolCall = obj.tool_call as Record<string, unknown> | undefined;
    if (toolCall) {
      // Find the tool name from the nested structure
      const callKeys = Object.keys(toolCall);
      if (callKeys.length > 0) {
        const toolKey = callKeys[0]; // e.g., 'readToolCall'
        toolName = toolKey.replace(/ToolCall$/, ''); // Remove suffix
        
        const toolData = toolCall[toolKey] as { args?: Record<string, unknown>; result?: { success?: { content: string }; error?: string | Record<string, unknown> } } | undefined;
        if (toolData) {
          args = toolData.args || {};
          result = toolData.result || null;
        }
      }
    }
    
    if (subtype === 'started') {
      events.push({
        t: 'tool',
        name: toolName,
        phase: 'start',
        text: `${toolName}(${JSON.stringify(args)})`
      });
    } else if (subtype === 'completed') {
      // Parse result
      if (result?.success?.content) {
        events.push({
          t: 'tool',
          name: toolName,
          phase: 'stdout',
          text: result.success.content
        });
      } else if (result?.error) {
        events.push({
          t: 'tool',
          name: toolName,
          phase: 'stderr',
          text: JSON.stringify(result.error)
        });
      }
      
      events.push({
        t: 'tool',
        name: toolName,
        phase: 'end',
        exitCode: result?.error ? 1 : 0
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