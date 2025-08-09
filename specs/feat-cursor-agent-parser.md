# Cursor Agent JSON Stream Parser Specification

**Status**: Draft  
**Authors**: Claude Assistant  
**Date**: 2025-08-09  
**Version**: 1.0.0  

## Overview

This specification outlines the implementation of a Cursor Agent parser for the agent-io streaming toolkit. The parser will handle the JSONL output format produced by the `cursor-agent` CLI when invoked with the `--output-format=stream-json` flag, normalizing it into the unified AgentEvent stream format used by agent-io.

## Background/Problem Statement

Cursor Agent is an AI-powered CLI tool that generates streaming JSON output similar to Claude Code and other AI agent CLIs. Currently, agent-io supports Claude Code, Gemini CLI, and Amp Code outputs, but lacks support for Cursor Agent's specific JSONL format. 

The Cursor Agent output format shares similarities with Claude's format but has distinct differences:
- Uses `type` and `subtype` fields for event categorization
- Includes session tracking with `session_id` field
- Has unique event types like `system` with `subtype: init`
- Tool calls use different field structure (`tool_call` instead of `tool_use`)
- Streaming text messages arrive character-by-character or word-by-word

Without proper parsing support, users cannot pipe Cursor Agent output through the agent-io stream formatter, limiting the toolkit's universality.

## Goals

- ✅ Parse Cursor Agent JSONL output format correctly
- ✅ Normalize Cursor events to unified AgentEvent types
- ✅ Support auto-detection of Cursor Agent format
- ✅ Handle streaming text assembly from partial messages
- ✅ Parse tool calls with proper phase lifecycle
- ✅ Maintain performance targets (>50k lines/second)
- ✅ Provide comprehensive test coverage with real fixtures
- ✅ Integrate seamlessly with existing parser registry

## Non-Goals

- ❌ Support for Cursor Agent binary/non-JSON formats
- ❌ Direct invocation of cursor-agent CLI
- ❌ Modification of Cursor Agent output format
- ❌ Support for Cursor IDE-specific features (only CLI)
- ❌ Backwards compatibility with pre-stream-json formats

## Technical Dependencies

### Internal Dependencies
- `@agent-io/core` - Core types and utilities
- `@agent-io/jsonl` - JSONL parsing utilities
- `@agent-io/stream` - Streaming engine and parser registry

### External Dependencies
- No new external dependencies required
- Uses existing: `commander`, `kleur` (inherited from stream package)

### Version Requirements
- Node.js >=18.0.0 (existing requirement)
- TypeScript ^5.0.0 (existing requirement)

## Detailed Design

### Architecture Changes

The implementation will follow the existing vendor parser pattern:

```
packages/stream/src/parsers/
├── index.ts          # Registry (update with Cursor parser)
├── types.ts          # Types (no changes needed)
├── cursor.ts         # NEW: Cursor Agent parser
├── claude.ts         # Existing
├── gemini.ts         # Existing
└── amp.ts            # Existing
```

### Cursor Agent Event Types

Based on the analyzed output, Cursor Agent produces these event types:

#### 1. System Events
```json
{
  "type": "system",
  "subtype": "init",
  "apiKeySource": "login",
  "cwd": "/path/to/project",
  "session_id": "uuid",
  "model": "OpenAI GPT-5",
  "permissionMode": "default"
}
```

#### 2. User Messages
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [{"type": "text", "text": "message content"}]
  },
  "session_id": "uuid"
}
```

#### 3. Assistant Messages (Streaming)
```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [{"type": "text", "text": "partial text"}]
  },
  "session_id": "uuid"
}
```

#### 4. Tool Calls
```json
{
  "type": "tool_call",
  "subtype": "started|completed",
  "call_id": "unique_id",
  "tool_call": {
    "readToolCall": {
      "args": {"path": "file.txt"},
      "result": {"success": {"content": "..."}}
    }
  },
  "session_id": "uuid"
}
```

#### 5. Result Events
```json
{
  "type": "result",
  "subtype": "success",
  "duration_ms": 25615,
  "is_error": false,
  "result": "summary text",
  "session_id": "uuid"
}
```

### Parser Implementation

```typescript
// packages/stream/src/parsers/cursor.ts

export class CursorParser implements VendorParser {
  vendor = 'cursor' as const;
  priority = 90; // Between Claude (100) and Amp (80)
  
  private messageBuffer = new Map<string, string[]>();
  
  detect(obj: unknown): boolean {
    if (!isObject(obj)) return false;
    
    const hasType = 'type' in obj;
    const hasSessionId = 'session_id' in obj;
    
    if (!hasType) return false;
    
    // Check for Cursor-specific event types
    const type = obj.type;
    const validTypes = ['system', 'user', 'assistant', 'tool_call', 'result'];
    
    if (validTypes.includes(type as string)) {
      // Additional validation for Cursor-specific structure
      if (type === 'system' && 'subtype' in obj) return true;
      if (type === 'tool_call' && 'call_id' in obj) return true;
      if ((type === 'user' || type === 'assistant') && 'message' in obj) return true;
      if (type === 'result' && 'duration_ms' in obj) return true;
    }
    
    return false;
  }
  
  parse(line: string): AgentEvent[] {
    try {
      const obj = JSON.parse(line);
      if (!this.detect(obj)) {
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
  
  private parseEvent(obj: any): AgentEvent[] {
    const events: AgentEvent[] = [];
    const sessionId = obj.session_id;
    
    switch (obj.type) {
      case 'system':
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
        
      case 'user':
        events.push(this.parseMessage(obj, 'user'));
        break;
        
      case 'assistant':
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
        
      case 'tool_call':
        events.push(...this.parseToolCall(obj));
        break;
        
      case 'result':
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
        
      default:
        events.push({ t: 'debug', raw: obj });
    }
    
    return events;
  }
  
  private parseMessage(obj: any, role: 'user' | 'assistant'): MessageEvent {
    const message = obj.message;
    let text = '';
    
    if (message?.content && Array.isArray(message.content)) {
      text = message.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text || '')
        .join('');
    }
    
    return { t: 'msg', role, text };
  }
  
  private parseToolCall(obj: any): AgentEvent[] {
    const events: AgentEvent[] = [];
    const callId = obj.call_id;
    const subtype = obj.subtype;
    
    // Extract tool name from nested structure
    let toolName = 'unknown';
    let args: any = {};
    let result: any = null;
    
    if (obj.tool_call) {
      // Find the tool name from the nested structure
      const callKeys = Object.keys(obj.tool_call);
      if (callKeys.length > 0) {
        const toolKey = callKeys[0]; // e.g., 'readToolCall'
        toolName = toolKey.replace(/ToolCall$/, ''); // Remove suffix
        
        const toolData = obj.tool_call[toolKey];
        if (toolData) {
          args = toolData.args || {};
          result = toolData.result;
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
```

### Registry Integration

Update `packages/stream/src/parsers/index.ts`:

```typescript
import { CursorParser } from './cursor';

// In ParserRegistry constructor
this.register(new CursorParser());
```

### CLI Integration

Update help text and documentation to include Cursor Agent examples:

```bash
# Auto-detect Cursor Agent format
cursor-agent -p "explain recursion" --output-format=stream-json | aio-stream

# Explicit vendor selection
cursor-agent -p "build project" --output-format=stream-json | aio-stream --vendor cursor
```

## User Experience

Users will be able to pipe Cursor Agent output directly to aio-stream:

### Basic Usage
```bash
# Simple prompt with auto-detection
cursor-agent -p "What is the current version?" --output-format=stream-json | aio-stream

# With explicit vendor
cursor-agent -p "refactor this code" --output-format=stream-json | aio-stream --vendor cursor

# With filtering
cursor-agent -p "run tests" --output-format=stream-json | aio-stream --only tool,error
```

### Expected Output
The formatted output will display:
- System initialization as debug info (hidden by default)
- User prompts with proper role attribution
- Assistant responses assembled from streaming chunks
- Tool executions with clear phase indicators
- Result summaries and timing information

## Testing Strategy

### Unit Tests

Location: `packages/stream/src/parsers/cursor.test.ts`

Test cases:
1. **Detection tests**
   - Correctly identifies Cursor Agent format
   - Rejects non-Cursor formats
   - Priority ordering in registry
   
2. **Parsing tests**
   - System initialization events
   - User message parsing
   - Assistant message streaming assembly
   - Tool call lifecycle (start/complete)
   - Result event handling
   - Session ID tracking
   - Error handling for malformed JSON

3. **Message buffering tests**
   - Streaming text accumulation
   - Buffer cleanup on result
   - Multiple concurrent sessions

### Integration Tests

Location: `tests/integration/cursor-parser.test.ts`

Test cases:
1. **End-to-end streaming**
   - Process complete Cursor Agent session
   - Verify event sequence and timing
   - Test with large outputs
   
2. **Auto-detection**
   - Mixed vendor input detection
   - Cursor format prioritization

3. **Performance tests**
   - Throughput: >50k lines/second
   - Memory usage: <20MB for large streams
   - Latency: <10ms for first output

### Fixture Collection

Location: `packages/stream/tests/fixtures/cursor/`

Required fixtures:
1. **basic-prompt.jsonl** - Simple Q&A session
2. **tool-execution.jsonl** - File reading, command execution
3. **streaming-response.jsonl** - Character-by-character streaming
4. **multi-turn.jsonl** - Multiple user/assistant interactions
5. **error-handling.jsonl** - Tool failures and errors
6. **complex-session.jsonl** - Mixed events, tools, streaming

Fixture collection process:
```bash
# Capture real Cursor Agent outputs
cursor-agent -p "test prompt" --output-format=stream-json > fixture.jsonl
```

### Test Documentation

Each test should include:
```typescript
it('should handle streaming text assembly', () => {
  // Purpose: Validates that streaming character/word messages are properly
  // assembled into complete messages, preventing output fragmentation
  // This test can fail if buffer management is incorrect
  
  const parser = new CursorParser();
  // ... test implementation
});
```

### Edge Case Testing

Critical edge cases to test:
1. Malformed JSON lines
2. Missing required fields
3. Unknown event types
4. Extremely long lines (>10KB)
5. Rapid streaming (thousands of events/second)
6. Session ID collisions
7. Incomplete tool call sequences
8. Mixed format input (Cursor + other vendors)

## Performance Considerations

### Expected Performance Metrics

- **Throughput**: >50,000 lines/second (matching existing parsers)
- **Memory**: O(n) where n = number of active sessions (for message buffering)
- **Latency**: <1ms per line parsing
- **CPU**: Minimal overhead, single-pass parsing

### Optimization Strategies

1. **Lazy JSON parsing**: Parse only required fields
2. **String concatenation optimization**: Use arrays for buffering
3. **Early detection exit**: Return quickly on format mismatch
4. **Minimal object allocation**: Reuse objects where possible
5. **Session cleanup**: Automatic buffer expiration for stale sessions

### Memory Management

Message buffering considerations:
- Implement maximum buffer size per session (e.g., 1MB)
- Add timeout-based buffer cleanup (e.g., 5 minutes)
- Option to disable buffering for reduced memory usage

## Security Considerations

### Input Validation

1. **JSON parsing safety**: Use try-catch for all JSON.parse calls
2. **Field sanitization**: Validate and escape user-provided content
3. **Size limits**: Enforce maximum line length (default: 1MB)
4. **Session ID validation**: Ensure session IDs are valid UUIDs

### Content Security

1. **No code execution**: Never eval() parsed content
2. **Path sanitization**: Validate file paths in tool calls
3. **Command injection prevention**: Escape shell arguments
4. **Sensitive data**: Never log API keys or tokens

### Resource Protection

1. **Memory limits**: Cap message buffer size
2. **DoS prevention**: Limit parsing recursion depth
3. **Rate limiting**: Optional throttling for high-volume streams
4. **Error boundaries**: Isolate parser failures

## Documentation

### Files to Update

1. **README.md** (root)
   - Add Cursor Agent to supported vendors list
   - Include usage examples
   
2. **packages/stream/README.md**
   - Document Cursor parser specifics
   - Add CLI examples
   
3. **AGENT.md**
   - Update CLI interface section with Cursor examples
   - Add to troubleshooting guide

4. **API Documentation**
   - Update TypeScript interfaces
   - Add Cursor vendor type to enums

### New Documentation

Create `docs/cursor-agent-integration.md`:
- Installation instructions for cursor-agent CLI
- Configuration requirements
- Common usage patterns
- Troubleshooting guide
- Performance tuning tips

## Implementation Phases

### Phase 1: MVP/Core Functionality (2-3 days)

**Deliverables:**
1. Basic CursorParser class implementation
2. Event type detection and parsing
3. Registry integration
4. Basic unit tests
5. Simple fixtures (manually created)

**Success Criteria:**
- Can parse basic Cursor Agent output
- Correctly identifies format via auto-detection
- All basic event types handled

### Phase 2: Enhanced Features (2-3 days)

**Deliverables:**
1. Streaming text assembly with buffering
2. Complete tool call lifecycle handling
3. Session management and cleanup
4. Performance optimizations
5. Comprehensive test suite

**Success Criteria:**
- Handles complex streaming scenarios
- Memory-efficient buffer management
- Meets performance targets

### Phase 3: Polish and Documentation (1-2 days)

**Deliverables:**
1. Real fixture collection from cursor-agent
2. Integration tests
3. Documentation updates
4. Example scripts
5. Performance benchmarks

**Success Criteria:**
- 100% test coverage for parser
- Complete documentation
- Production-ready implementation

## Open Questions

1. **Message Buffering Strategy**: Should we buffer streaming messages by default or make it configurable?
   - **Recommendation**: Make it configurable with smart defaults

2. **Session Timeout**: What's the appropriate timeout for session cleanup?
   - **Recommendation**: 5 minutes of inactivity

3. **Tool Name Extraction**: Is the current strategy for extracting tool names from nested objects robust enough?
   - **Needs Investigation**: Collect more tool call examples

4. **Cost Tracking**: Does Cursor Agent provide token usage or cost information?
   - **To Research**: Check if any events contain usage data

5. **Error Recovery**: Should parser attempt to recover from malformed JSON or fail fast?
   - **Recommendation**: Follow existing pattern (continue with error events)

## References

### Related Issues/PRs
- Original agent-io implementation specs in `/specs/` directory
- Claude parser implementation: `packages/stream/src/parsers/claude.ts`
- Parser registry pattern: `packages/stream/src/parsers/index.ts`

### External Documentation
- Cursor Agent CLI documentation (if available)
- JSONL specification: https://jsonlines.org/
- Node.js Streams documentation: https://nodejs.org/api/stream.html

### Design Patterns
- Registry Pattern for parser management
- Strategy Pattern for vendor-specific parsing
- Iterator Pattern for streaming processing
- Builder Pattern for event construction

### Architectural Decisions
- Event normalization to unified types
- Streaming-first architecture
- Parser priority system for auto-detection
- Fixture-driven testing approach

## Appendix: Cursor Agent Format Analysis

### Observed Event Patterns

From the provided example, we can identify these patterns:

1. **Initialization Sequence**
   - Always starts with system/init event
   - Contains model, cwd, and permission info
   
2. **Message Streaming**
   - Assistant messages arrive character-by-character
   - Each chunk is a separate JSON line
   - Text must be assembled from chunks
   
3. **Tool Call Pattern**
   - Two-phase: started → completed
   - Nested structure with tool-specific sub-objects
   - Results embedded in completed event
   
4. **Session Tracking**
   - Every event includes session_id
   - Used for correlation and cleanup
   
5. **Result Summary**
   - Final event with duration and success status
   - Contains human-readable summary

### Comparison with Claude Format

| Feature | Claude | Cursor |
|---------|--------|--------|
| Event field | `type` | `type` + `subtype` |
| Message format | Direct content | Nested with role |
| Tool calls | `tool_use` | `tool_call` |
| Streaming | Block-based | Character-based |
| Session tracking | No | Yes (session_id) |
| Cost tracking | Yes (usage) | Not observed |
| Error handling | error type | is_error flag |

This analysis informs the parser design and ensures compatibility with the existing agent-io architecture while properly handling Cursor Agent's unique characteristics.