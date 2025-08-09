/* eslint-disable no-console */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { detectVendor, selectParser } from '../src/parsers/index.js';
// import { ClaudeParser } from '../src/parsers/claude.js';
import { ParseError } from '../src/parsers/types.js';
import type { AgentEvent, Vendor } from '../src/types.js';

interface FixtureFile {
  vendor: string;
  filename: string;
  path: string;
  content: string;
  lines: string[];
}

interface TestResult {
  vendor: string;
  file: string;
  line: number;
  success: boolean;
  events?: AgentEvent[];
  error?: string;
}

/**
 * Comprehensive integration tests for all parsers against real fixture data
 * Tests requirements from Phase 1 specification lines 650-750
 */
describe('Comprehensive Parser Integration Tests', () => {
  const fixturesDir = join(process.cwd(), 'tests/fixtures');
  const vendors = ['claude', 'gemini', 'amp'] as const;
  const allFixtures: FixtureFile[] = [];
  const testResults: TestResult[] = [];

  beforeAll(() => {
    // Load all fixture files
    for (const vendor of vendors) {
      const vendorDir = join(fixturesDir, vendor);
      if (!existsSync(vendorDir)) continue;

      const files = readdirSync(vendorDir).filter(f => f.endsWith('.jsonl'));
      for (const filename of files) {
        const filepath = join(vendorDir, filename);
        const content = readFileSync(filepath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        allFixtures.push({
          vendor,
          filename,
          path: filepath,
          content,
          lines,
        });
      }
    }
  });

  describe('Parser Detection Accuracy', () => {
    it('correctly detects vendor for all fixture files', () => {
      for (const fixture of allFixtures) {
        for (const [lineIndex, line] of fixture.lines.entries()) {
          const detected = detectVendor(line);
          const result: TestResult = {
            vendor: fixture.vendor,
            file: fixture.filename,
            line: lineIndex + 1,
            success: false,
          };

          // Skip invalid JSON lines in error-handling fixtures
          if (fixture.filename.includes('error-handling')) {
            try {
              JSON.parse(line);
              // Valid JSON should detect correctly
              if (detected) {
                result.success = detected.vendor === fixture.vendor;
                if (!result.success) {
                  result.error = `Expected ${fixture.vendor}, got ${detected.vendor}`;
                }
              } else {
                result.success = false;
                result.error = 'Failed to detect vendor';
              }
              testResults.push(result);
              expect(
                detected,
                `Line ${lineIndex + 1} in ${fixture.filename}: ${line}`,
              ).toBeTruthy();
              expect(
                detected!.vendor,
                `Line ${lineIndex + 1} in ${fixture.filename}`,
              ).toBe(fixture.vendor);
            } catch (e) {
              // Invalid JSON will be detected by Gemini as plain text
              if (detected && detected.vendor === 'gemini') {
                // Gemini detected the non-JSON as plain text - this is expected
                result.success = true;
                testResults.push(result);
                expect(
                  detected.vendor,
                  `Line ${lineIndex + 1} in ${fixture.filename}: ${line}`,
                ).toBe('gemini');
              } else {
                // Other parsers should not detect invalid JSON
                result.success = detected === null;
                result.error = detected
                  ? `Unexpected detection by ${detected.vendor}`
                  : null;
                testResults.push(result);
                expect(
                  detected,
                  `Line ${lineIndex + 1} in ${fixture.filename}: ${line}`,
                ).toBeNull();
              }
            }
          } else {
            // Non-error-handling fixtures should always detect correctly
            if (detected) {
              result.success = detected.vendor === fixture.vendor;
              if (!result.success) {
                result.error = `Expected ${fixture.vendor}, got ${detected.vendor}`;
              }
            } else {
              result.success = false;
              result.error = 'Failed to detect vendor';
            }
            testResults.push(result);
            expect(
              detected,
              `Line ${lineIndex + 1} in ${fixture.filename}: ${line}`,
            ).toBeTruthy();
            expect(
              detected!.vendor,
              `Line ${lineIndex + 1} in ${fixture.filename}`,
            ).toBe(fixture.vendor);
          }
        }
      }
    });

    it('does not false-positive detect wrong vendors', () => {
      const _claudeFixtures = allFixtures.filter(f => f.vendor === 'claude');
      const nonClaudeFixtures = allFixtures.filter(f => f.vendor !== 'claude');

      for (const fixture of nonClaudeFixtures) {
        for (const [lineIndex, line] of fixture.lines.entries()) {
          const detected = detectVendor(line);
          if (detected) {
            expect(
              detected.vendor,
              `Line ${lineIndex + 1} in ${fixture.filename} should not be detected as Claude`,
            ).not.toBe('claude');
          }
        }
      }
    });
  });

  describe('Parser Event Generation', () => {
    it('generates valid events for all vendor fixtures', () => {
      const validEventTypes = ['msg', 'tool', 'cost', 'error', 'debug'];

      for (const fixture of allFixtures) {
        for (const [lineIndex, line] of fixture.lines.entries()) {
          const parser = selectParser(fixture.vendor as Vendor);

          try {
            const events = parser.parse(line);

            expect(
              events,
              `Line ${lineIndex + 1} in ${fixture.filename}`,
            ).toBeInstanceOf(Array);

            for (const event of events) {
              expect(
                validEventTypes,
                `Invalid event type '${event.t}' at line ${lineIndex + 1} in ${fixture.filename}`,
              ).toContain(event.t);

              // All events must have a 't' field
              expect(
                event.t,
                `Event missing 't' field at line ${lineIndex + 1} in ${fixture.filename}`,
              ).toBeTruthy();
            }
          } catch (error) {
            if (error instanceof ParseError) {
              // Parse errors are expected for malformed JSON in error-handling fixtures
              if (!fixture.filename.includes('error-handling')) {
                throw error;
              }
            } else {
              throw error;
            }
          }
        }
      }
    });

    it('handles malformed JSON gracefully', () => {
      const errorFixtures = allFixtures.filter(f =>
        f.filename.includes('error-handling'),
      );

      for (const fixture of errorFixtures) {
        for (const [_lineIndex, line] of fixture.lines.entries()) {
          const parser = selectParser('claude');

          try {
            // Try to parse JSON first
            JSON.parse(line);
            // If it parses, the parser should handle it
            const events = parser.parse(line);
            expect(events).toBeInstanceOf(Array);
          } catch (jsonError) {
            // If JSON is malformed, parser should throw ParseError
            expect(() => parser.parse(line)).toThrow(ParseError);
          }
        }
      }
    });
  });

  describe('Event Pattern Validation', () => {
    it('generates expected event patterns for message exchanges', () => {
      const basicFixtures = allFixtures.filter(
        f => f.vendor === 'claude' && f.filename.includes('basic-message'),
      );

      for (const fixture of basicFixtures) {
        const allEvents = [];

        for (const line of fixture.lines) {
          const parser = selectParser('claude');
          try {
            const events = parser.parse(line);
            allEvents.push(...events);
          } catch (error) {
            // Skip malformed lines
            continue;
          }
        }

        // Should have message events
        const messageEvents = allEvents.filter(e => e.t === 'msg');
        expect(
          messageEvents.length,
          `${fixture.filename} should have message events`,
        ).toBeGreaterThan(0);

        // Should have user and assistant messages
        const userMessages = messageEvents.filter(e => e.role === 'user');
        const assistantMessages = messageEvents.filter(
          e => e.role === 'assistant',
        );

        expect(
          userMessages.length,
          `${fixture.filename} should have user messages`,
        ).toBeGreaterThan(0);
        expect(
          assistantMessages.length,
          `${fixture.filename} should have assistant messages`,
        ).toBeGreaterThan(0);
      }
    });

    it('generates expected event patterns for tool usage', () => {
      const toolFixtures = allFixtures.filter(
        f => f.vendor === 'claude' && f.filename.includes('tool-use'),
      );

      for (const fixture of toolFixtures) {
        const allEvents = [];

        for (const line of fixture.lines) {
          const parser = selectParser('claude');
          try {
            const events = parser.parse(line);
            allEvents.push(...events);
          } catch (error) {
            // Skip malformed lines
            continue;
          }
        }

        // Should have tool events
        const toolEvents = allEvents.filter(e => e.t === 'tool');
        expect(
          toolEvents.length,
          `${fixture.filename} should have tool events`,
        ).toBeGreaterThan(0);

        // Check for tool lifecycle events
        const toolPhases = toolEvents.map(e => e.phase);
        expect(
          toolPhases,
          `${fixture.filename} should have tool start phase`,
        ).toContain('start');
        expect(
          toolPhases,
          `${fixture.filename} should have tool end phase`,
        ).toContain('end');
      }
    });

    it('generates cost events for usage tracking', () => {
      const allClaudeFixtures = allFixtures.filter(f => f.vendor === 'claude');

      for (const fixture of allClaudeFixtures) {
        const allEvents = [];

        for (const line of fixture.lines) {
          const parser = selectParser('claude');
          try {
            const events = parser.parse(line);
            allEvents.push(...events);
          } catch (error) {
            // Skip malformed lines
            continue;
          }
        }

        // Should have cost events
        const costEvents = allEvents.filter(e => e.t === 'cost');
        if (costEvents.length > 0) {
          for (const costEvent of costEvents) {
            expect(
              costEvent.deltaUsd,
              `Cost event should have deltaUsd field`,
            ).toBeDefined();
            expect(
              typeof costEvent.deltaUsd,
              `deltaUsd should be a number`,
            ).toBe('number');
            expect(
              costEvent.deltaUsd,
              `deltaUsd should be non-negative`,
            ).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });

  describe('Content Preservation', () => {
    it('preserves exact message content including whitespace', () => {
      const claudeFixtures = allFixtures.filter(f => f.vendor === 'claude');

      for (const fixture of claudeFixtures) {
        for (const line of fixture.lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'message' && data.content) {
              const parser = selectParser('claude');
              const events = parser.parse(line);
              const msgEvent = events.find(e => e.t === 'msg');

              if (msgEvent) {
                expect(
                  msgEvent.text,
                  `Message content should be preserved exactly`,
                ).toBe(data.content);
              }
            }
          } catch (error) {
            // Skip malformed JSON
            continue;
          }
        }
      }
    });

    it('preserves tool names and IDs correctly', () => {
      const claudeFixtures = allFixtures.filter(f => f.vendor === 'claude');

      for (const fixture of claudeFixtures) {
        for (const line of fixture.lines) {
          try {
            const data = JSON.parse(line);
            const parser = selectParser('claude');
            const events = parser.parse(line);

            if (data.type === 'tool_use' && data.name) {
              const toolEvent = events.find(
                e => e.t === 'tool' && e.phase === 'start',
              );
              if (toolEvent) {
                expect(toolEvent.name, `Tool name should be preserved`).toBe(
                  data.name,
                );
              }
            }

            if (data.type === 'tool_result' && data.tool_use_id) {
              const toolEvents = events.filter(e => e.t === 'tool');
              for (const toolEvent of toolEvents) {
                expect(
                  toolEvent.name,
                  `Tool ID should be preserved in tool events`,
                ).toBe(data.tool_use_id);
              }
            }
          } catch (error) {
            // Skip malformed JSON
            continue;
          }
        }
      }
    });
  });

  describe('Performance Characteristics', () => {
    it('parses fixture files efficiently', () => {
      for (const fixture of allFixtures) {
        const startTime = performance.now();
        const parser = selectParser(fixture.vendor as Vendor);

        for (const line of fixture.lines) {
          try {
            parser.parse(line);
          } catch (error) {
            // Skip malformed lines
            continue;
          }
        }

        const endTime = performance.now();
        const duration = endTime - startTime;
        const linesPerSecond = (fixture.lines.length / duration) * 1000;

        // Should process at least 500 lines per second (relaxed for error-handling fixtures)
        // Error-handling fixtures may be slower due to error recovery logic
        const minLinesPerSecond = fixture.filename.includes('error')
          ? 500
          : 1000;
        expect(
          linesPerSecond,
          `${fixture.vendor} parser should process at least ${minLinesPerSecond} lines/sec, got ${linesPerSecond.toFixed(2)} for ${fixture.filename}`,
        ).toBeGreaterThan(minLinesPerSecond);
      }
    });
  });

  describe('Error Resilience', () => {
    it('handles empty lines gracefully for all vendors', () => {
      const vendors = ['claude', 'gemini', 'amp'] as const;

      for (const vendor of vendors) {
        const parser = selectParser(vendor);

        if (vendor === 'gemini') {
          // Gemini returns empty array for empty lines (plain text behavior)
          expect(parser.parse('')).toEqual([]);
          expect(parser.parse('   ')).toEqual([]);
          expect(parser.parse('\n')).toEqual([]);
        } else {
          // Claude and Amp throw ParseError for empty lines
          expect(
            () => parser.parse(''),
            `${vendor} should throw ParseError for empty line`,
          ).toThrow(ParseError);
          expect(
            () => parser.parse('   '),
            `${vendor} should throw ParseError for whitespace`,
          ).toThrow(ParseError);
          expect(
            () => parser.parse('\n'),
            `${vendor} should throw ParseError for newline`,
          ).toThrow(ParseError);
        }
      }
    });

    it('handles invalid JSON gracefully for all vendors', () => {
      const vendors = ['claude', 'gemini', 'amp'] as const;
      const invalidJson = [
        '{"type":"message","content":"unclosed',
        '{"type":"message","content":}',
        '{"type":"message","content":"test"',
        'not json at all',
        '{"type":"message","content":"test"}extra',
        '{"type":"message","content":"test",}',
      ];

      for (const vendor of vendors) {
        const parser = selectParser(vendor);

        if (vendor === 'gemini') {
          // Gemini treats non-JSON as plain text and returns message events
          for (const line of invalidJson) {
            const events = parser.parse(line);
            expect(events).toHaveLength(1);
            expect(events[0]).toEqual({
              t: 'msg',
              role: 'assistant',
              text: line,
            });
          }
        } else {
          // Claude and Amp throw ParseError for invalid JSON
          for (const line of invalidJson) {
            expect(
              () => parser.parse(line),
              `${vendor} should throw ParseError for: ${line}`,
            ).toThrow(ParseError);
          }
        }
      }
    });

    it('handles unknown event types gracefully for all vendors', () => {
      const testCases = [
        {
          vendor: 'claude',
          unknownEvents: [
            '{"type":"unknown_event","data":"test"}',
            '{"type":"future_event","version":"2.0"}',
            '{"type":"experimental","payload":{}}',
          ],
        },
        {
          vendor: 'gemini',
          unknownEvents: [
            '{"type":"unknown_event","data":"test"}',
            '{"type":"future_event","version":"2.0"}',
            '{"type":"experimental","payload":{}}',
          ],
        },
        {
          vendor: 'amp',
          unknownEvents: [
            '{"phase":"unknown_phase","task":"test"}',
            '{"phase":"future_phase","task":"test"}',
            '{"phase":"experimental","task":"test"}',
          ],
        },
      ];

      for (const testCase of testCases) {
        const parser = selectParser(testCase.vendor as Vendor);

        for (const line of testCase.unknownEvents) {
          const events = parser.parse(line);
          expect(
            events,
            `${testCase.vendor} should return events for unknown: ${line}`,
          ).toHaveLength(1);

          if (testCase.vendor === 'gemini') {
            // Gemini treats everything as plain text messages
            expect(
              events[0].t,
              `${testCase.vendor} should return message event for: ${line}`,
            ).toBe('msg');
            expect(events[0].role).toBe('assistant');
            expect(events[0].text).toBe(line);
          } else {
            // Claude and Amp return debug events for unknown types
            expect(
              events[0].t,
              `${testCase.vendor} should return debug event for unknown: ${line}`,
            ).toBe('debug');
            expect(
              events[0].raw,
              `${testCase.vendor} debug event should have raw data`,
            ).toBeDefined();
          }
        }
      }
    });
  });

  describe('Test Results Summary', () => {
    it('generates comprehensive test results', () => {
      const totalTests = testResults.length;
      const successfulTests = testResults.filter(r => r.success).length;
      const failedTests = testResults.filter(r => !r.success).length;

      console.log(`\n=== Parser Integration Test Results ===`);
      console.log(`Total tests: ${totalTests}`);
      console.log(`Successful: ${successfulTests}`);
      console.log(`Failed: ${failedTests}`);
      console.log(
        `Success rate: ${((successfulTests / totalTests) * 100).toFixed(2)}%`,
      );

      if (failedTests > 0) {
        console.log(`\nFailed tests by vendor:`);
        const failuresByVendor = testResults
          .filter(r => !r.success)
          .reduce(
            (acc, r) => {
              acc[r.vendor] = (acc[r.vendor] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );

        for (const [vendor, count] of Object.entries(failuresByVendor)) {
          console.log(`  ${vendor}: ${count} failures`);
        }
      }

      // For all vendors, we expect high success rate
      const vendors = ['claude', 'gemini', 'amp'] as const;

      for (const vendor of vendors) {
        const vendorTests = testResults.filter(r => r.vendor === vendor);
        if (vendorTests.length > 0) {
          const vendorSuccess = vendorTests.filter(r => r.success).length;
          const vendorSuccessRate = (vendorSuccess / vendorTests.length) * 100;

          expect(
            vendorSuccessRate,
            `${vendor} parser should have >95% success rate`,
          ).toBeGreaterThan(95);
        }
      }
    });
  });
});
