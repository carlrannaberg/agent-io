# Task Breakdown: Cursor Agent JSON Stream Parser

**Generated**: 2025-08-09  
**Source**: specs/feat-cursor-agent-parser.md  
**Total Tasks**: 24  
**Estimated Duration**: 5-8 days  

## Overview

Implementation of a Cursor Agent parser for the agent-io streaming toolkit to handle JSONL output from `cursor-agent` CLI with `--output-format=stream-json` flag. The parser will normalize Cursor Agent events into the unified AgentEvent stream format, supporting auto-detection, streaming text assembly, and tool call lifecycle management.

## Dependency Graph

```
Phase 1 (Foundation)
├── Task 1.1: Parser class structure ─┐
├── Task 1.2: Type definitions        ├─→ Task 1.5: Basic tests
├── Task 1.3: Detection logic         ┤
└── Task 1.4: Registry integration ───┘

Phase 2 (Core Features)
├── Task 2.1: Message parsing ─────────┐
├── Task 2.2: Tool call parsing       ├─→ Task 2.5: Integration tests
├── Task 2.3: Streaming assembly      │
└── Task 2.4: Session management ─────┘

Phase 3 (Production Ready)
├── Task 3.1: Fixture collection
├── Task 3.2: Performance optimization
├── Task 3.3: Documentation
└── Task 3.4: CLI integration
```

## Phase 1: Foundation (MVP/Core Functionality)

### Task 1.1: Create CursorParser class structure
**Description**: Implement the basic CursorParser class with VendorParser interface
**Size**: Small
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 1.2, 1.3

**Technical Requirements**:
- Create `packages/stream/src/parsers/cursor.ts`
- Implement VendorParser interface
- Set vendor name to 'cursor'
- Set priority to 90 (between Claude:100 and Amp:80)
- Initialize message buffer Map for session tracking

**Implementation Steps**:
1. Create new file `cursor.ts` in parsers directory
2. Import required types from `./types` and utilities
3. Define CursorParser class implementing VendorParser
4. Add vendor property as const 'cursor'
5. Set priority property to 90
6. Initialize private messageBuffer as `Map<string, string[]>()`

**Code Template**:
```typescript
import type { VendorParser, AgentEvent, MessageEvent } from './types';
import { isObject } from '../utils/guards';

export class CursorParser implements VendorParser {
  vendor = 'cursor' as const;
  priority = 90;
  
  private messageBuffer = new Map<string, string[]>();
  
  detect(obj: unknown): boolean {
    // Implementation in Task 1.3
  }
  
  parse(line: string): AgentEvent[] {
    // Implementation in Task 2.1-2.4
  }
}
```

**Acceptance Criteria**:
- [ ] File created at correct location
- [ ] Class implements VendorParser interface
- [ ] Vendor and priority correctly set
- [ ] Message buffer initialized
- [ ] TypeScript compilation passes

### Task 1.2: Define Cursor-specific type definitions
**Description**: Create TypeScript interfaces for Cursor Agent event structures
**Size**: Small
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 1.1, 1.3

**Technical Requirements**:
- Define interfaces for all Cursor event types
- System events with init subtype
- User/Assistant message structures
- Tool call events with nested structure
- Result events with timing data

**Type Definitions**:
```typescript
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
      args?: any;
      result?: {
        success?: { content: string };
        error?: any;
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
```

**Acceptance Criteria**:
- [ ] All event types properly typed
- [ ] Interfaces match observed format
- [ ] No TypeScript errors
- [ ] Types exported for testing

### Task 1.3: Implement detection logic
**Description**: Create robust format detection for auto-detection capability
**Size**: Medium
**Priority**: High
**Dependencies**: Task 1.2
**Can run parallel with**: Task 1.1

**Technical Requirements**:
- Check for type field presence
- Validate Cursor-specific event types
- Additional validation per event type
- Return boolean for detection result

**Implementation**:
```typescript
detect(obj: unknown): boolean {
  if (!isObject(obj)) return false;
  
  const hasType = 'type' in obj;
  if (!hasType) return false;
  
  const type = obj.type;
  const validTypes = ['system', 'user', 'assistant', 'tool_call', 'result'];
  
  if (validTypes.includes(type as string)) {
    if (type === 'system' && 'subtype' in obj) return true;
    if (type === 'tool_call' && 'call_id' in obj) return true;
    if ((type === 'user' || type === 'assistant') && 'message' in obj) return true;
    if (type === 'result' && 'duration_ms' in obj) return true;
  }
  
  return false;
}
```

**Test Cases**:
- Valid Cursor events return true
- Non-Cursor formats return false
- Malformed objects return false
- Missing required fields return false

**Acceptance Criteria**:
- [ ] Correctly identifies all Cursor event types
- [ ] Rejects non-Cursor formats
- [ ] No false positives with Claude/Gemini/Amp formats
- [ ] Performance: <1ms per detection

### Task 1.4: Integrate with parser registry
**Description**: Register CursorParser in the parser registry system
**Size**: Small
**Priority**: High
**Dependencies**: Task 1.1
**Can run parallel with**: None

**Technical Requirements**:
- Import CursorParser in `packages/stream/src/parsers/index.ts`
- Register in ParserRegistry constructor
- Update vendor type union to include 'cursor'
- Ensure priority ordering is correct

**Implementation Steps**:
1. Open `packages/stream/src/parsers/index.ts`
2. Add import: `import { CursorParser } from './cursor';`
3. In ParserRegistry constructor, add: `this.register(new CursorParser());`
4. Update Vendor type in types.ts to include 'cursor'

**Acceptance Criteria**:
- [ ] Parser registered in registry
- [ ] Auto-detection includes Cursor format
- [ ] Priority ordering correct (Claude > Cursor > Amp > Gemini)
- [ ] CLI accepts --vendor cursor option

### Task 1.5: Create basic unit tests
**Description**: Write foundational tests for detection and class structure
**Size**: Medium
**Priority**: High
**Dependencies**: Tasks 1.1, 1.2, 1.3, 1.4
**Can run parallel with**: None

**Test File**: `packages/stream/src/parsers/cursor.test.ts`

**Test Coverage**:
```typescript
describe('CursorParser', () => {
  describe('detection', () => {
    it('should detect system init events', () => {
      // Purpose: Validates that Cursor's unique system init events are recognized
      // This test can fail if the detection logic doesn't check subtype field
    });
    
    it('should detect tool_call events with call_id', () => {
      // Purpose: Ensures tool calls are identified by their unique structure
      // This test can fail if call_id field checking is missing
    });
    
    it('should reject non-Cursor formats', () => {
      // Purpose: Prevents false positives with other vendor formats
      // This test can fail if detection is too permissive
    });
  });
  
  describe('parser properties', () => {
    it('should have correct vendor name and priority', () => {
      // Purpose: Ensures proper registry ordering
      // This test can fail if priority is misconfigured
    });
  });
});
```

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] Tests are meaningful and can fail
- [ ] 100% coverage of detection logic
- [ ] Tests document their purpose

## Phase 2: Core Features (Enhanced Functionality)

### Task 2.1: Implement message parsing
**Description**: Parse user and assistant messages with content extraction
**Size**: Medium
**Priority**: High
**Dependencies**: Task 1.1
**Can run parallel with**: Task 2.2, 2.3, 2.4

**Technical Requirements**:
- Extract text from nested content array
- Handle multiple content items
- Map to MessageEvent type
- Support both user and assistant roles

**Implementation**:
```typescript
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
```

**Test Cases**:
- Single content item
- Multiple content items
- Empty content array
- Missing content field
- Non-text content types

**Acceptance Criteria**:
- [ ] Correctly extracts text from nested structure
- [ ] Handles edge cases gracefully
- [ ] Maps to correct AgentEvent type
- [ ] Preserves role information

### Task 2.2: Implement tool call parsing
**Description**: Parse tool call events with start/complete lifecycle
**Size**: Large
**Priority**: High
**Dependencies**: Task 1.1
**Can run parallel with**: Task 2.1, 2.3, 2.4

**Technical Requirements**:
- Extract tool name from nested structure
- Parse arguments and results
- Generate appropriate tool phases
- Handle success and error results

**Implementation Details**:
- Tool name extraction from dynamic keys
- Map 'started' to phase: 'start'
- Map 'completed' to phases: 'stdout'/'stderr' + 'end'
- Include exit codes based on success/error

**Complex Logic**:
```typescript
private parseToolCall(obj: any): AgentEvent[] {
  const events: AgentEvent[] = [];
  const subtype = obj.subtype;
  
  // Extract tool name from nested structure
  let toolName = 'unknown';
  if (obj.tool_call) {
    const callKeys = Object.keys(obj.tool_call);
    if (callKeys.length > 0) {
      toolName = callKeys[0].replace(/ToolCall$/, '');
    }
  }
  
  // Handle phases...
}
```

**Acceptance Criteria**:
- [ ] Tool names correctly extracted
- [ ] Start/complete phases generated
- [ ] Arguments included in start event
- [ ] Results parsed from completed events
- [ ] Error handling for malformed calls

### Task 2.3: Implement streaming text assembly
**Description**: Buffer and assemble character-by-character streaming messages
**Size**: Large
**Priority**: High
**Dependencies**: Task 1.1
**Can run parallel with**: Task 2.1, 2.2, 2.4

**Technical Requirements**:
- Buffer messages per session_id
- Accumulate streaming chunks
- Flush on result event
- Memory management for buffers
- Optional timeout-based flushing

**Buffer Management Strategy**:
```typescript
// In assistant message handling:
if (sessionId && msg.text) {
  if (!this.messageBuffer.has(sessionId)) {
    this.messageBuffer.set(sessionId, []);
  }
  this.messageBuffer.get(sessionId)!.push(msg.text);
}

// In result event handling:
if (sessionId && this.messageBuffer.has(sessionId)) {
  const buffered = this.messageBuffer.get(sessionId)!.join('');
  if (buffered) {
    events.push({ t: 'msg', role: 'assistant', text: buffered });
  }
  this.messageBuffer.delete(sessionId);
}
```

**Edge Cases**:
- Session without result event
- Multiple concurrent sessions
- Very large buffers (>1MB)
- Orphaned sessions

**Acceptance Criteria**:
- [ ] Streaming text properly assembled
- [ ] No memory leaks with buffers
- [ ] Concurrent sessions handled correctly
- [ ] Buffer cleanup on result
- [ ] Maximum buffer size enforced

### Task 2.4: Implement session management
**Description**: Track and manage multiple concurrent sessions
**Size**: Medium
**Priority**: High
**Dependencies**: Task 2.3
**Can run parallel with**: Task 2.1, 2.2

**Technical Requirements**:
- Session ID extraction from events
- Buffer isolation per session
- Cleanup strategies for stale sessions
- Memory limits per session
- Optional timeout-based cleanup

**Session Cleanup Logic**:
```typescript
private cleanupStaleSessions() {
  const MAX_SESSION_AGE = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  
  for (const [sessionId, metadata] of this.sessionMetadata) {
    if (now - metadata.lastActivity > MAX_SESSION_AGE) {
      this.messageBuffer.delete(sessionId);
      this.sessionMetadata.delete(sessionId);
    }
  }
}
```

**Acceptance Criteria**:
- [ ] Sessions properly isolated
- [ ] No cross-session data leakage
- [ ] Stale sessions cleaned up
- [ ] Memory usage bounded
- [ ] Session metadata tracked

### Task 2.5: Create comprehensive integration tests
**Description**: Write integration tests for complete parsing scenarios
**Size**: Large
**Priority**: High
**Dependencies**: Tasks 2.1, 2.2, 2.3, 2.4
**Can run parallel with**: None

**Test File**: `tests/integration/cursor-parser.test.ts`

**Test Scenarios**:
```typescript
describe('Cursor Parser Integration', () => {
  it('should process complete Q&A session', () => {
    // Purpose: Validates end-to-end parsing of typical session
    // This test can fail if any parsing component is broken
  });
  
  it('should handle streaming text assembly', () => {
    // Purpose: Ensures character-by-character messages are assembled
    // This test can fail if buffering logic is incorrect
  });
  
  it('should process tool calls with results', () => {
    // Purpose: Validates complete tool lifecycle parsing
    // This test can fail if phase mapping is wrong
  });
  
  it('should handle multiple concurrent sessions', () => {
    // Purpose: Tests session isolation and cleanup
    // This test can fail if sessions interfere with each other
  });
});
```

**Acceptance Criteria**:
- [ ] All integration tests pass
- [ ] Real-world scenarios covered
- [ ] Performance benchmarks included
- [ ] Memory usage validated
- [ ] Edge cases tested

## Phase 3: Polish and Documentation

### Task 3.1: Collect real Cursor Agent fixtures
**Description**: Capture actual cursor-agent CLI outputs for testing
**Size**: Medium
**Priority**: Medium
**Dependencies**: Phase 2 completion
**Can run parallel with**: Task 3.2, 3.3, 3.4

**Fixtures to Collect**:
1. `basic-prompt.jsonl` - Simple Q&A
2. `tool-execution.jsonl` - File operations
3. `streaming-response.jsonl` - Character streaming
4. `multi-turn.jsonl` - Conversation
5. `error-handling.jsonl` - Failures
6. `complex-session.jsonl` - Mixed events

**Collection Commands**:
```bash
# Basic prompt
cursor-agent -p "What is 2+2?" --output-format=stream-json > basic-prompt.jsonl

# Tool execution
cursor-agent -p "Read package.json" --output-format=stream-json > tool-execution.jsonl

# Streaming response
cursor-agent -p "Write a long story" --output-format=stream-json > streaming-response.jsonl
```

**Storage Location**: `packages/stream/tests/fixtures/cursor/`

**Acceptance Criteria**:
- [ ] All 6 fixture types collected
- [ ] Real cursor-agent output used
- [ ] Various scenarios represented
- [ ] Fixtures validated as parseable
- [ ] Added to test suite

### Task 3.2: Optimize performance
**Description**: Ensure parser meets >50k lines/second target
**Size**: Medium
**Priority**: Medium
**Dependencies**: Phase 2 completion
**Can run parallel with**: Task 3.1, 3.3, 3.4

**Optimization Areas**:
- Lazy JSON parsing
- String concatenation optimization
- Early detection exit
- Object allocation reduction
- Regex precompilation

**Benchmark Code**:
```typescript
it('should process 50k lines per second', async () => {
  const lines = generateCursorLines(50000);
  const start = performance.now();
  
  const parser = new CursorParser();
  for (const line of lines) {
    parser.parse(line);
  }
  
  const elapsed = performance.now() - start;
  const linesPerSecond = 50000 / (elapsed / 1000);
  expect(linesPerSecond).toBeGreaterThan(50000);
});
```

**Acceptance Criteria**:
- [ ] >50k lines/second throughput
- [ ] <20MB memory for large streams
- [ ] <10ms latency for first output
- [ ] No memory leaks
- [ ] Performance tests pass

### Task 3.3: Update documentation
**Description**: Add Cursor Agent support to all relevant documentation
**Size**: Medium
**Priority**: Medium
**Dependencies**: Phase 2 completion
**Can run parallel with**: Task 3.1, 3.2, 3.4

**Files to Update**:
1. `README.md` (root)
   - Add to supported vendors list
   - Include usage example
   
2. `packages/stream/README.md`
   - Document Cursor parser specifics
   - Add configuration options
   
3. `AGENT.md`
   - Update CLI examples
   - Add to troubleshooting

**New Documentation**:
Create `docs/cursor-agent-integration.md`:
```markdown
# Cursor Agent Integration Guide

## Installation
[cursor-agent installation steps]

## Configuration
- Required flags: --output-format=stream-json
- Optional flags: --force, --model

## Usage Examples
[Various usage scenarios]

## Troubleshooting
[Common issues and solutions]
```

**Acceptance Criteria**:
- [ ] All docs updated
- [ ] Examples tested and working
- [ ] Configuration documented
- [ ] Troubleshooting complete
- [ ] API docs updated

### Task 3.4: Update CLI integration
**Description**: Add Cursor support to CLI help and examples
**Size**: Small
**Priority**: Medium
**Dependencies**: Task 1.4
**Can run parallel with**: Task 3.1, 3.2, 3.3

**CLI Updates**:
- Update help text in `packages/stream/src/cli.ts`
- Add --vendor cursor to options
- Include Cursor in auto-detection examples
- Update man page if exists

**Help Text Addition**:
```typescript
Examples:
  # Auto-detect Cursor Agent format
  cursor-agent -p "prompt" --output-format=stream-json | aio-stream
  
  # Explicit vendor selection
  cursor-agent -p "prompt" --output-format=stream-json | aio-stream --vendor cursor
```

**Acceptance Criteria**:
- [ ] CLI help includes Cursor
- [ ] --vendor cursor works
- [ ] Auto-detection includes Cursor
- [ ] Examples in help text
- [ ] Man page updated (if exists)

## Risk Assessment

### Technical Risks
1. **Streaming Assembly Complexity** (Medium)
   - Mitigation: Configurable buffering, timeout strategies
   
2. **Memory Growth** (Medium)
   - Mitigation: Session limits, cleanup strategies
   
3. **Tool Name Extraction** (Low)
   - Mitigation: Collect more examples, robust fallbacks

### Schedule Risks
1. **Fixture Collection** (Low)
   - Mitigation: Can use synthetic fixtures initially
   
2. **Performance Targets** (Low)
   - Mitigation: Existing parsers prove feasibility

## Execution Strategy

### Parallel Execution Opportunities
- Phase 1: Tasks 1.1, 1.2, 1.3 can run in parallel
- Phase 2: Tasks 2.1, 2.2, 2.3, 2.4 can run in parallel
- Phase 3: All tasks can run in parallel

### Critical Path
1. Task 1.1 (Parser class) → Task 1.4 (Registry) → Task 1.5 (Tests)
2. Task 2.3 (Streaming) → Task 2.4 (Sessions) → Task 2.5 (Integration)
3. Phase 2 completion → Phase 3 tasks

### Recommended Execution Order
1. Start Phase 1 tasks 1.1, 1.2, 1.3 in parallel
2. Complete task 1.4 after 1.1
3. Run task 1.5 to validate Phase 1
4. Start Phase 2 tasks in parallel
5. Run task 2.5 to validate Phase 2
6. Execute Phase 3 tasks in parallel
7. Final validation and release

## Summary Statistics

- **Total Tasks**: 24 (including subtasks)
- **Phase 1**: 5 tasks (1-2 days)
- **Phase 2**: 5 tasks (2-3 days)
- **Phase 3**: 4 tasks (1-2 days)
- **Parallel Opportunities**: High (70% of tasks)
- **Critical Dependencies**: 6 sequential steps
- **Estimated Total Duration**: 5-8 days with parallel execution