# Cursor Agent Fixtures

Test fixtures for the Cursor Agent JSONL parser. These fixtures represent real-world output patterns
from the `cursor-agent` CLI when invoked with `--output-format=stream-json`.

## Fixture Files

### basic-prompt.jsonl

A simple Q&A session demonstrating:

- System initialization with session tracking
- User message format with content array structure
- Character-by-character streaming response assembly
- Result summary with timing information

### tool-execution.jsonl

File reading operation showing:

- Tool call lifecycle (started → completed)
- Nested tool call structure with arguments and results
- Mixed streaming text and tool execution
- Successful file reading with content extraction

### streaming-response.jsonl

Granular character-level streaming demonstrating:

- Individual character streaming events
- Buffer assembly requirements for readable output
- Code block generation with proper formatting
- Performance implications of high-frequency streaming

### complex-session.jsonl

Multi-step workflow with mixed events:

- Multiple tool calls (read file, execute command)
- Tool execution with stdout/stderr capture
- Interleaved streaming text between tool calls
- Complex session with multiple phases

## Cursor Agent Event Format

### Key Characteristics

1. **Session Tracking**: Every event includes `session_id` for correlation
2. **Dual Type System**: Uses `type` and optional `subtype` for categorization
3. **Nested Messages**: User/assistant messages wrapped in `message` object with `content` array
4. **Tool Structure**: Nested `tool_call` objects with tool-specific sub-objects
5. **Character Streaming**: Assistant responses arrive character-by-character, requiring assembly

### Event Types

| Type      | Subtype       | Purpose                                            |
| --------- | ------------- | -------------------------------------------------- |
| system    | init          | Session initialization with model/environment info |
| user      | -             | User input messages                                |
| assistant | -             | AI response messages (streaming)                   |
| tool_call | started       | Tool execution begins                              |
| tool_call | completed     | Tool execution finishes with results               |
| result    | success/error | Final session summary                              |

### Comparison with Other Vendors

| Feature        | Claude               | Cursor           | Gemini            |
| -------------- | -------------------- | ---------------- | ----------------- |
| Streaming      | Block-based          | Character-based  | None (plain text) |
| Tool calls     | tool_use/tool_result | tool_call nested | N/A               |
| Sessions       | No                   | session_id       | No                |
| Message format | Direct content       | Nested with role | Plain text        |

## Testing Considerations

These fixtures are designed to test:

1. **Format Detection**: Cursor-specific field patterns (`session_id`, nested `tool_call`)
2. **Message Assembly**: Streaming character chunks → complete messages
3. **Tool Lifecycle**: Proper phase handling (start/stdout/stderr/end)
4. **Session Management**: Buffer cleanup and correlation
5. **Performance**: High-frequency streaming event processing
6. **Error Handling**: Malformed JSON and missing required fields

## Capture Commands

These fixtures were created based on the Cursor Agent specification. To capture real fixtures in the
future:

```bash
# Basic prompt
cursor-agent -p "What is the capital of France?" --output-format=stream-json > basic-prompt.jsonl

# Tool usage
cursor-agent -p "Read the package.json file" --output-format=stream-json > tool-execution.jsonl

# Complex multi-step
cursor-agent -p "Check the tests and run them" --output-format=stream-json > complex-session.jsonl
```

**Note**: These fixtures are synthetic examples created to match the documented Cursor Agent format
specification, as real cursor-agent CLI output was not available during development.
