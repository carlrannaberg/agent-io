import { describe, it, expect } from 'vitest';
import { cursorParser } from '../src/parsers/cursor.js';

describe('Cursor Parser Performance', () => {
  /**
   * Generate test lines for performance testing
   */
  function generateCursorLines(count: number): string[] {
    const lines: string[] = [];

    // Add initial system event
    lines.push(
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        apiKeySource: 'login',
        cwd: '/test',
        session_id: 'perf-test',
        model: 'GPT-5',
        permissionMode: 'default',
      }),
    );

    // Generate a mix of event types
    for (let i = 0; i < count - 2; i++) {
      const eventType = i % 4;

      switch (eventType) {
        case 0: // User message
          lines.push(
            JSON.stringify({
              type: 'user',
              message: {
                role: 'user',
                content: [{ type: 'text', text: `User message ${i}` }],
              },
              session_id: 'perf-test',
            }),
          );
          break;

        case 1: // Assistant message (streaming)
          lines.push(
            JSON.stringify({
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: `A` }],
              },
              session_id: 'perf-test',
            }),
          );
          break;

        case 2: // Tool call started
          lines.push(
            JSON.stringify({
              type: 'tool_call',
              subtype: 'started',
              call_id: `call_${i}`,
              tool_call: {
                testTool: {
                  args: { index: i },
                },
              },
              session_id: 'perf-test',
            }),
          );
          break;

        case 3: // Tool call completed
          lines.push(
            JSON.stringify({
              type: 'tool_call',
              subtype: 'completed',
              call_id: `call_${i}`,
              tool_call: {
                testTool: {
                  args: { index: i },
                  result: {
                    success: {
                      content: `Result for ${i}`,
                    },
                  },
                },
              },
              session_id: 'perf-test',
            }),
          );
          break;
      }
    }

    // Add final result event
    lines.push(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 1000,
        is_error: false,
        result: 'Performance test completed',
        session_id: 'perf-test',
      }),
    );

    return lines;
  }

  it('should process 50k lines per second', () => {
    // Purpose: Validates that parser meets performance requirements
    // This test can fail if parser has performance bottlenecks

    const lineCount = 50000;
    const lines = generateCursorLines(lineCount);

    // Warm up the parser
    for (let i = 0; i < 100; i++) {
      cursorParser.parse(lines[i % lines.length]);
    }

    // Measure performance
    const start = performance.now();

    for (const line of lines) {
      cursorParser.parse(line);
    }

    const elapsed = performance.now() - start;
    const linesPerSecond = lineCount / (elapsed / 1000);

    // Should process at least 50k lines per second
    expect(linesPerSecond).toBeGreaterThan(50000);
  });

  it('should handle detection efficiently', () => {
    // Purpose: Tests detection performance specifically
    // This test can fail if detection logic is inefficient

    const iterations = 100000;
    const validLine = JSON.stringify({
      type: 'tool_call',
      subtype: 'started',
      call_id: 'test',
      tool_call: { test: {} },
      session_id: 'test',
    });

    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      cursorParser.detect(validLine);
    }

    const elapsed = performance.now() - start;
    const detectionsPerMs = iterations / elapsed;

    // Should handle at least 100k detections per second
    expect(detectionsPerMs * 1000).toBeGreaterThan(100000);
  });

  it('should maintain constant memory usage', () => {
    // Purpose: Ensures no memory leaks during streaming
    // This test can fail if buffers are not properly cleaned

    const initialMemory = process.memoryUsage().heapUsed;

    // Process many sessions to test cleanup
    for (let session = 0; session < 100; session++) {
      const sessionId = `session-${session}`;

      // Simulate streaming session
      for (let i = 0; i < 100; i++) {
        cursorParser.parse(
          JSON.stringify({
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'x' }],
            },
            session_id: sessionId,
          }),
        );
      }

      // Complete the session to trigger cleanup
      cursorParser.parse(
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          duration_ms: 100,
          is_error: false,
          result: 'Done',
          session_id: sessionId,
        }),
      );
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;
    const memoryGrowthMB = memoryGrowth / (1024 * 1024);

    // Memory growth should be reasonable (less than 20MB for 100 sessions)
    expect(memoryGrowthMB).toBeLessThan(20);
  });

  it('should handle concurrent parsing efficiently', () => {
    // Purpose: Tests parser with mixed event types
    // This test can fail if switching between parsers is slow

    const lines = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' }),
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
        session_id: 's1',
      }),
      JSON.stringify({
        type: 'tool_call',
        subtype: 'started',
        call_id: 'c1',
        tool_call: { test: {} },
        session_id: 's1',
      }),
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] },
        session_id: 's1',
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 100,
        is_error: false,
        result: 'Done',
        session_id: 's1',
      }),
    ];

    const iterations = 10000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      for (const line of lines) {
        cursorParser.parse(line);
      }
    }

    const elapsed = performance.now() - start;
    const totalLines = iterations * lines.length;
    const linesPerSecond = totalLines / (elapsed / 1000);

    // Should handle mixed content efficiently
    expect(linesPerSecond).toBeGreaterThan(50000);
  });
});
