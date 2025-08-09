import { describe, it, expect } from 'vitest';
import { streamEvents } from '../src/index.js';
import { Readable } from 'node:stream';
import { cursorParser } from '../src/parsers/cursor.js';

describe('Cursor Parser Integration', () => {
  /**
   * Helper to create a readable stream from JSONL lines
   */
  function createStream(lines: string[]): Readable {
    return Readable.from(lines.map(line => line + '\n'));
  }

  it('should process complete Q&A session', async () => {
    // Purpose: Validates end-to-end parsing of typical session
    // This test can fail if any parsing component is broken
    
    const lines = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        apiKeySource: 'login',
        cwd: '/project',
        session_id: 'test-session',
        model: 'GPT-5',
        permissionMode: 'default'
      }),
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'What is 2+2?' }]
        },
        session_id: 'test-session'
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '2' }]
        },
        session_id: 'test-session'
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '+' }]
        },
        session_id: 'test-session'
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '2' }]
        },
        session_id: 'test-session'
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: ' equals ' }]
        },
        session_id: 'test-session'
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '4' }]
        },
        session_id: 'test-session'
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 1500,
        is_error: false,
        result: '2+2 equals 4',
        session_id: 'test-session'
      })
    ];

    const events = [];
    for await (const event of streamEvents({
      vendor: 'cursor',
      source: createStream(lines)
    })) {
      events.push(event);
    }

    // With buffering: 1 debug (init), 1 user msg, 1 buffered assistant msg, 1 debug (result)
    expect(events.length).toBeGreaterThanOrEqual(4);
    
    // Check system init
    const debugEvents = events.filter(e => e.t === 'debug');
    expect(debugEvents[0].raw).toMatchObject({
      vendor: 'cursor',
      model: 'GPT-5'
    });
    
    // Check user message
    const userMsg = events.find(e => e.t === 'msg' && e.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg?.text).toBe('What is 2+2?');
    
    // Check assistant message (should be buffered and combined)
    const assistantMsgs = events.filter(e => e.t === 'msg' && e.role === 'assistant');
    expect(assistantMsgs.length).toBe(1);
    expect(assistantMsgs[0].text).toBe('2+2 equals 4');
    
    // Check result debug event
    const resultDebug = debugEvents.find(e => e.raw?.type === 'result');
    expect(resultDebug?.raw).toMatchObject({
      success: true,
      duration_ms: 1500
    });
  });

  it('should handle streaming text assembly', () => {
    // Purpose: Ensures character-by-character messages are assembled
    // This test can fail if buffering logic is incorrect
    
    const parser = cursorParser;
    
    // Simulate streaming response
    const events1 = parser.parse(JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }]
      },
      session_id: 'stream-test'
    }));
    
    const events2 = parser.parse(JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: ' ' }]
      },
      session_id: 'stream-test'
    }));
    
    const events3 = parser.parse(JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'world!' }]
      },
      session_id: 'stream-test'
    }));
    
    // With buffering, streaming assistant messages should return empty arrays
    expect(events1).toEqual([]);
    expect(events2).toEqual([]);
    expect(events3).toEqual([]);
    
    // When result arrives, buffered message should be flushed
    const resultEvents = parser.parse(JSON.stringify({
      type: 'result',
      subtype: 'success',
      duration_ms: 100,
      is_error: false,
      result: 'Greeting completed',
      session_id: 'stream-test'
    }));
    
    // Should have flushed message and result debug
    const flushedMsg = resultEvents.find(e => e.t === 'msg');
    expect(flushedMsg).toMatchObject({
      t: 'msg',
      role: 'assistant',
      text: 'Hello world!'
    });
  });

  it('should process tool calls with results', async () => {
    // Purpose: Validates complete tool lifecycle parsing
    // This test can fail if phase mapping is wrong
    
    const lines = [
      JSON.stringify({
        type: 'tool_call',
        subtype: 'started',
        call_id: 'call_abc123',
        tool_call: {
          readToolCall: {
            args: { path: 'package.json' }
          }
        },
        session_id: 'tool-test'
      }),
      JSON.stringify({
        type: 'tool_call',
        subtype: 'completed',
        call_id: 'call_abc123',
        tool_call: {
          readToolCall: {
            args: { path: 'package.json' },
            result: {
              success: {
                content: '{"name": "test-package", "version": "1.0.0"}'
              }
            }
          }
        },
        session_id: 'tool-test'
      })
    ];

    const events = [];
    for await (const event of streamEvents({
      vendor: 'cursor',
      source: createStream(lines)
    })) {
      events.push(event);
    }

    // Should have: start, end events (no stdout for file content)
    const toolEvents = events.filter(e => e.t === 'tool');
    expect(toolEvents.length).toBe(2);
    
    // Check start event
    expect(toolEvents[0]).toMatchObject({
      t: 'tool',
      name: 'read',
      phase: 'start',
      text: expect.stringContaining('package.json')
    });
    
    // Check end event
    expect(toolEvents[1]).toMatchObject({
      t: 'tool',
      name: 'read',
      phase: 'end',
      exitCode: 0
    });
  });

  it('should handle tool call errors', async () => {
    // Purpose: Tests error handling in tool calls
    // This test can fail if error mapping is incorrect
    
    const lines = [
      JSON.stringify({
        type: 'tool_call',
        subtype: 'started',
        call_id: 'call_error',
        tool_call: {
          writeToolCall: {
            args: { path: '/restricted/file.txt', content: 'test' }
          }
        },
        session_id: 'error-test'
      }),
      JSON.stringify({
        type: 'tool_call',
        subtype: 'completed',
        call_id: 'call_error',
        tool_call: {
          writeToolCall: {
            args: { path: '/restricted/file.txt', content: 'test' },
            result: {
              error: 'Permission denied'
            }
          }
        },
        session_id: 'error-test'
      })
    ];

    const events = [];
    for await (const event of streamEvents({
      vendor: 'cursor',
      source: createStream(lines)
    })) {
      events.push(event);
    }

    const toolEvents = events.filter(e => e.t === 'tool');
    
    // Check stderr event
    const stderrEvent = toolEvents.find(e => e.phase === 'stderr');
    expect(stderrEvent).toBeDefined();
    expect(stderrEvent?.text).toContain('Permission denied');
    
    // Check end event with error code
    const endEvent = toolEvents.find(e => e.phase === 'end');
    expect(endEvent?.exitCode).toBe(1);
  });

  it('should handle multiple concurrent sessions', () => {
    // Purpose: Tests session isolation and cleanup
    // This test can fail if sessions interfere with each other
    
    const parser = cursorParser;
    
    // Session 1 messages
    parser.parse(JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Session1' }] },
      session_id: 'session-1'
    }));
    
    // Session 2 messages
    parser.parse(JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Session2' }] },
      session_id: 'session-2'
    }));
    
    // Complete session 1
    const session1Result = parser.parse(JSON.stringify({
      type: 'result',
      subtype: 'success',
      duration_ms: 100,
      is_error: false,
      result: 'Done',
      session_id: 'session-1'
    }));
    
    // Session 1 should be flushed
    const session1Msg = session1Result.find(e => e.t === 'msg');
    expect(session1Msg?.text).toBe('Session1');
    
    // Session 2 should still be buffered (add more text)
    parser.parse(JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: ' continues' }] },
      session_id: 'session-2'
    }));
    
    // Complete session 2
    const session2Result = parser.parse(JSON.stringify({
      type: 'result',
      subtype: 'success',
      duration_ms: 200,
      is_error: false,
      result: 'Done',
      session_id: 'session-2'
    }));
    
    // Session 2 should have both messages
    const session2Msg = session2Result.find(e => e.t === 'msg');
    expect(session2Msg?.text).toBe('Session2 continues');
  });

  it('should handle malformed input gracefully', async () => {
    // Purpose: Tests error recovery and resilience
    // This test can fail if error handling is missing
    
    const lines = [
      '{ invalid json',
      JSON.stringify({ type: 'unknown' }),
      JSON.stringify({
        type: 'assistant',
        // Missing message field
        session_id: 'broken'
      }),
      JSON.stringify({
        type: 'tool_call',
        subtype: 'started',
        // Missing call_id
        tool_call: {},
        session_id: 'broken'
      }),
      'plain text line',
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Valid message after errors' }]
        },
        session_id: 'recovery'
      })
    ];

    const events = [];
    for await (const event of streamEvents({
      vendor: 'cursor',
      source: createStream(lines)
    })) {
      events.push(event);
    }

    // Should have error events for invalid input
    const errorEvents = events.filter(e => e.t === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    
    // Should recover and parse valid message
    const validMsg = events.find(e => 
      e.t === 'msg' && 
      e.text === 'Valid message after errors'
    );
    expect(validMsg).toBeDefined();
  });

  it('should auto-detect Cursor format', async () => {
    // Purpose: Tests auto-detection capability
    // This test can fail if detection logic is wrong
    
    const lines = [
      JSON.stringify({
        type: 'tool_call',
        subtype: 'started',
        call_id: 'unique-to-cursor',
        tool_call: { testTool: { args: {} } },
        session_id: 'auto-detect'
      })
    ];

    const events = [];
    for await (const event of streamEvents({
      vendor: 'auto', // Use auto-detection
      source: createStream(lines)
    })) {
      events.push(event);
    }

    // Should detect as Cursor and parse correctly
    const toolEvent = events.find(e => e.t === 'tool');
    expect(toolEvent).toBeDefined();
    expect(toolEvent?.name).toBe('testTool');
  });
});