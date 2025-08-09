import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  registry,
  detectVendor,
  selectParser,
  ParserRegistry,
} from '../src/parsers/index.js';
import { VendorParser } from '../src/parsers/types.js';

/**
 * Enhanced registry integration tests for auto-detection and priority ordering
 * Tests comprehensive scenarios with real fixture data
 */
describe('Registry Integration Tests', () => {
  const fixturesDir = join(process.cwd(), 'tests/fixtures');
  const vendors = ['claude', 'gemini', 'amp'] as const;

  describe('Auto-Detection System', () => {
    it('correctly auto-detects vendor for all vendor fixtures', () => {
      for (const vendor of vendors) {
        const vendorDir = join(fixturesDir, vendor);
        if (!existsSync(vendorDir)) continue;

        const files = readdirSync(vendorDir).filter(f => f.endsWith('.jsonl'));

        for (const filename of files) {
          const filepath = join(vendorDir, filename);
          const content = readFileSync(filepath, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const [lineIndex, line] of lines.entries()) {
            try {
              // Test auto-detection
              const detected = detectVendor(line);

              // Skip malformed JSON lines (expected in error-handling fixtures)
              if (filename.includes('error-handling')) {
                try {
                  JSON.parse(line);
                  // If JSON is valid, should detect correctly
                  expect(
                    detected?.vendor,
                    `Line ${lineIndex + 1} in ${vendor}/${filename} should be detected as ${vendor}`,
                  ).toBe(vendor);
                } catch (e) {
                  // Invalid JSON will be detected by Gemini as plain text
                  if (detected) {
                    expect(
                      detected.vendor,
                      `Line ${lineIndex + 1} in ${vendor}/${filename} with invalid JSON should be detected by Gemini`,
                    ).toBe('gemini');
                  }
                }
              } else {
                // Valid fixtures should always detect correctly
                expect(
                  detected?.vendor,
                  `Line ${lineIndex + 1} in ${vendor}/${filename}: ${line}`,
                ).toBe(vendor);
              }

              // Test selectParser auto mode
              if (detected) {
                const parser = selectParser('auto', line);
                // For invalid JSON, Gemini will detect it as plain text
                const expectedVendor =
                  detected.vendor === 'gemini' ? 'gemini' : vendor;
                expect(
                  parser.vendor,
                  `selectParser auto should detect ${expectedVendor} for line ${lineIndex + 1} in ${filename}`,
                ).toBe(expectedVendor);
              }
            } catch (error) {
              // Log context for debugging
              console.error(
                `Error processing line ${lineIndex + 1} in ${filename}: ${line}`,
              );
              throw error;
            }
          }
        }
      }
    });

    it('handles edge cases in auto-detection', () => {
      const edgeCases = [
        '', // Empty line
        '   ', // Whitespace only
        '\n', // Newline only
        '\t\r\n', // Various whitespace
        'not json', // Non-JSON
        '{"malformed":}', // Malformed JSON
        '{}', // Empty object
        '{"unknown":"format"}', // Unknown format
        '{"type":"unknown"}', // Unknown type
        '{"type":123}', // Non-string type
        '{"type":""}', // Empty type
      ];

      for (const line of edgeCases) {
        const detected = detectVendor(line);

        if (line.trim() === '') {
          // Empty lines should not be detected
          expect(
            detected,
            `Empty line should return null: ${JSON.stringify(line)}`,
          ).toBeNull();
        } else if (line === 'not json' || line.includes('malformed')) {
          // Non-JSON will be detected by Gemini
          expect(
            detected?.vendor,
            `Non-JSON should be detected by Gemini: ${JSON.stringify(line)}`,
          ).toBe('gemini');
        }

        // selectParser should handle these gracefully
        if (line === '') {
          expect(() => selectParser('auto', line)).toThrow(
            'Auto-detection requires at least one line',
          );
        } else if (detected === null) {
          expect(() => selectParser('auto', line)).toThrow(
            'Failed to auto-detect vendor from line',
          );
        }
      }
    });

    it('maintains detection consistency across multiple calls', () => {
      const claudeDir = join(fixturesDir, 'claude');
      if (!existsSync(claudeDir)) return;

      const basicFile = join(claudeDir, 'basic-message.jsonl');
      if (!existsSync(basicFile)) return;

      const content = readFileSync(basicFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        const results = [];

        // Test detection multiple times
        for (let i = 0; i < 10; i++) {
          const detected = detectVendor(line);
          results.push(detected?.vendor || null);
        }

        // All results should be the same
        const uniqueResults = [...new Set(results)];
        expect(
          uniqueResults.length,
          `Detection should be consistent for line: ${line}`,
        ).toBe(1);
      }
    });
  });

  describe('Priority Ordering System', () => {
    let testRegistry: ParserRegistry;

    beforeEach(() => {
      testRegistry = new ParserRegistry();
    });

    it('respects parser priority in detection order', () => {
      const highPriorityParser: VendorParser = {
        vendor: 'high-priority',
        detect: (line: string) => line.includes('priority'),
        parse: () => [{ t: 'debug', raw: 'high' }],
      };

      const mediumPriorityParser: VendorParser = {
        vendor: 'medium-priority',
        detect: (line: string) => line.includes('priority'),
        parse: () => [{ t: 'debug', raw: 'medium' }],
      };

      const lowPriorityParser: VendorParser = {
        vendor: 'low-priority',
        detect: (line: string) => line.includes('priority'),
        parse: () => [{ t: 'debug', raw: 'low' }],
      };

      // Register in mixed order
      testRegistry.registerParser(mediumPriorityParser, 50);
      testRegistry.registerParser(lowPriorityParser, 10);
      testRegistry.registerParser(highPriorityParser, 100);

      const testLine = '{"test":"priority match"}';
      const detected = testRegistry.detectVendor(testLine);

      expect(detected?.vendor).toBe('high-priority');
    });

    it('handles parsers with same priority', () => {
      const parser1: VendorParser = {
        vendor: 'parser1',
        detect: (line: string) => line.includes('same'),
        parse: () => [{ t: 'debug', raw: 'parser1' }],
      };

      const parser2: VendorParser = {
        vendor: 'parser2',
        detect: (line: string) => line.includes('same'),
        parse: () => [{ t: 'debug', raw: 'parser2' }],
      };

      // Register with same priority
      testRegistry.registerParser(parser1, 50);
      testRegistry.registerParser(parser2, 50);

      const testLine = '{"test":"same priority"}';
      const detected = testRegistry.detectVendor(testLine);

      // Should detect one of them consistently
      expect(['parser1', 'parser2']).toContain(detected?.vendor);

      // Should be consistent across calls
      const detected2 = testRegistry.detectVendor(testLine);
      expect(detected2?.vendor).toBe(detected?.vendor);
    });

    it('Claude parser has expected priority', () => {
      // Claude should be registered with priority 100
      const claudeParser = testRegistry.getParser('claude');
      expect(claudeParser).toBeTruthy();

      // Test that Claude gets priority over lower priority parsers
      const lowerPriorityParser: VendorParser = {
        vendor: 'lower',
        detect: () => true, // Always matches
        parse: () => [{ t: 'debug', raw: 'lower' }],
      };

      testRegistry.registerParser(lowerPriorityParser, 50);

      const claudeLine =
        '{"type":"message","role":"assistant","content":"test"}';
      const detected = testRegistry.detectVendor(claudeLine);

      expect(detected?.vendor).toBe('claude');
    });

    it('higher priority parser overrides Claude', () => {
      const higherPriorityParser: VendorParser = {
        vendor: 'higher',
        detect: (line: string) => line.includes('type'),
        parse: () => [{ t: 'debug', raw: 'higher' }],
      };

      testRegistry.registerParser(higherPriorityParser, 150);

      const claudeLine =
        '{"type":"message","role":"assistant","content":"test"}';
      const detected = testRegistry.detectVendor(claudeLine);

      expect(detected?.vendor).toBe('higher');
    });

    it('validates default registry priority ordering', () => {
      // Test that default registry has correct priority ordering
      const availableParsers = registry.listParsers();
      expect(availableParsers).toContain('claude');
      expect(availableParsers).toContain('gemini');
      expect(availableParsers).toContain('amp');

      // Test that priority ordering works with real parsers
      // Claude should have highest priority (100)
      const claudeLine = '{"type":"message","role":"user","content":"test"}';
      const detected = detectVendor(claudeLine);
      expect(detected?.vendor).toBe('claude');

      // Gemini should have priority 10 (lowest) and detects plain text
      const geminiLine = 'This is plain text from Gemini';
      const geminiDetected = detectVendor(geminiLine);
      expect(geminiDetected?.vendor).toBe('gemini');

      // Amp should have priority 80
      const ampLine = '{"phase":"start","task":"test"}';
      const ampDetected = detectVendor(ampLine);
      expect(ampDetected?.vendor).toBe('amp');
    });

    it('handles conflicting detection with proper priority', () => {
      // Test case where multiple parsers could potentially detect the same line
      const conflictTestRegistry = new ParserRegistry();
      conflictTestRegistry.clear();

      const broadParser: VendorParser = {
        vendor: 'broad',
        detect: (line: string) => {
          try {
            const obj = JSON.parse(line);
            return typeof obj === 'object' && obj !== null;
          } catch {
            return false;
          }
        },
        parse: () => [{ t: 'debug', raw: 'broad' }],
      };

      const specificParser: VendorParser = {
        vendor: 'specific',
        detect: (line: string) => {
          try {
            const obj = JSON.parse(line);
            return obj.type === 'message';
          } catch {
            return false;
          }
        },
        parse: () => [{ t: 'debug', raw: 'specific' }],
      };

      // Register broad parser with higher priority
      conflictTestRegistry.registerParser(broadParser, 100);
      conflictTestRegistry.registerParser(specificParser, 50);

      const testLine = '{"type":"message","content":"test"}';
      const detected = conflictTestRegistry.detectVendor(testLine);

      // Should pick broad parser due to higher priority
      expect(detected?.vendor).toBe('broad');

      // Now test with reversed priorities
      conflictTestRegistry.clear();
      conflictTestRegistry.registerParser(broadParser, 50);
      conflictTestRegistry.registerParser(specificParser, 100);

      const detected2 = conflictTestRegistry.detectVendor(testLine);
      expect(detected2?.vendor).toBe('specific');
    });
  });

  describe('Error Handling in Registry', () => {
    let testRegistry: ParserRegistry;

    beforeEach(() => {
      testRegistry = new ParserRegistry();
    });

    it('handles parser detection errors gracefully', () => {
      const errorParser: VendorParser = {
        vendor: 'error-parser',
        detect: () => {
          throw new Error('Detection failed');
        },
        parse: () => [],
      };

      const workingParser: VendorParser = {
        vendor: 'working-parser',
        detect: (line: string) => line.includes('working'),
        parse: () => [{ t: 'debug', raw: 'working' }],
      };

      testRegistry.registerParser(errorParser, 150); // Higher priority
      testRegistry.registerParser(workingParser, 100);

      const testLine = '{"test":"working"}';
      const detected = testRegistry.detectVendor(testLine);

      // Should fall back to working parser despite error parser having higher priority
      expect(detected?.vendor).toBe('working-parser');
    });

    it('handles multiple parser errors', () => {
      const errorParser1: VendorParser = {
        vendor: 'error1',
        detect: () => {
          throw new Error('Error 1');
        },
        parse: () => [],
      };

      const errorParser2: VendorParser = {
        vendor: 'error2',
        detect: () => {
          throw new Error('Error 2');
        },
        parse: () => [],
      };

      testRegistry.registerParser(errorParser1, 200);
      testRegistry.registerParser(errorParser2, 150);

      const testLine = '{"type":"message","role":"assistant","content":"test"}';
      const detected = testRegistry.detectVendor(testLine);

      // Should fall back to Claude parser
      expect(detected?.vendor).toBe('claude');
    });

    it('handles all parsers failing detection', () => {
      testRegistry.clear(); // Remove Claude parser

      const errorParser: VendorParser = {
        vendor: 'error',
        detect: () => {
          throw new Error('Always fails');
        },
        parse: () => [],
      };

      testRegistry.registerParser(errorParser, 100);

      const testLine = '{"test":"anything"}';
      const detected = testRegistry.detectVendor(testLine);

      expect(detected).toBeNull();
    });
  });

  describe('Registry State Management', () => {
    let testRegistry: ParserRegistry;

    beforeEach(() => {
      testRegistry = new ParserRegistry();
    });

    it('maintains consistent state during concurrent operations', () => {
      const parser1: VendorParser = {
        vendor: 'concurrent1',
        detect: () => true,
        parse: () => [],
      };

      const parser2: VendorParser = {
        vendor: 'concurrent2',
        detect: () => true,
        parse: () => [],
      };

      // Simulate concurrent registration
      testRegistry.registerParser(parser1, 100);
      testRegistry.registerParser(parser2, 100);

      expect(testRegistry.size()).toBe(6); // claude + cursor + gemini + amp + 2 new parsers
      expect(testRegistry.listParsers()).toContain('concurrent1');
      expect(testRegistry.listParsers()).toContain('concurrent2');

      // Simulate concurrent detection
      const results = [];
      for (let i = 0; i < 10; i++) {
        const detected = testRegistry.detectVendor('{"test":"concurrent"}');
        results.push(detected?.vendor);
      }

      // Results should be consistent
      const uniqueResults = [...new Set(results)];
      expect(uniqueResults.length).toBe(1);
    });

    it('handles parser replacement correctly', () => {
      const originalParser: VendorParser = {
        vendor: 'replaceable',
        detect: () => true,
        parse: () => [{ t: 'debug', raw: 'original' }],
      };

      const replacementParser: VendorParser = {
        vendor: 'replaceable',
        detect: () => true,
        parse: () => [{ t: 'debug', raw: 'replacement' }],
      };

      testRegistry.registerParser(originalParser, 100);
      expect(testRegistry.size()).toBe(5); // claude + cursor + gemini + amp + replaceable

      const retrieved1 = testRegistry.getParser('replaceable');
      expect(retrieved1).toBe(originalParser);

      // Replace with new parser
      testRegistry.registerParser(replacementParser, 150);
      expect(testRegistry.size()).toBe(5); // Should still be 5

      const retrieved2 = testRegistry.getParser('replaceable');
      expect(retrieved2).toBe(replacementParser);
      expect(retrieved2).not.toBe(originalParser);
    });
  });

  describe('Cross-Vendor Detection', () => {
    it('does not detect Claude format as other vendors', () => {
      const claudeLines = [
        '{"type":"message","role":"assistant","content":"Hello"}',
        '{"type":"tool_use","id":"tool_123","name":"bash"}',
        '{"type":"tool_result","tool_use_id":"tool_123","content":"output"}',
        '{"type":"usage","input_tokens":10,"output_tokens":20}',
        '{"type":"error","message":"Something went wrong"}',
      ];

      const nonClaudeParser: VendorParser = {
        vendor: 'not-claude',
        detect: (line: string) => {
          try {
            const data = JSON.parse(line);
            return data.kind === 'content' || data.event === 'data';
          } catch {
            return false;
          }
        },
        parse: () => [],
      };

      registry.registerParser(nonClaudeParser, 50);

      for (const line of claudeLines) {
        const detected = detectVendor(line);
        expect(
          detected?.vendor,
          `Line should be detected as Claude: ${line}`,
        ).toBe('claude');
      }

      // Cleanup
      registry.unregisterParser('not-claude');
    });

    it('handles ambiguous formats correctly', () => {
      const ambiguousParser: VendorParser = {
        vendor: 'ambiguous',
        detect: (line: string) => {
          try {
            const data = JSON.parse(line);
            return data.type === 'message'; // Same as Claude
          } catch {
            return false;
          }
        },
        parse: () => [{ t: 'debug', raw: 'ambiguous' }],
      };

      registry.registerParser(ambiguousParser, 75); // Lower than Claude's 100

      const ambiguousLine =
        '{"type":"message","role":"assistant","content":"test"}';
      const detected = detectVendor(ambiguousLine);

      // Claude should win due to higher priority
      expect(detected?.vendor).toBe('claude');

      // Cleanup
      registry.unregisterParser('ambiguous');
    });
  });

  describe('Performance Under Load', () => {
    // Performance test removed - was flaky in CI environments
    // The test was asserting >10k ops/sec which varies by machine

    it('handles rapid parser registration/unregistration', () => {
      const testRegistry = new ParserRegistry();

      const startTime = performance.now();

      // Rapidly register and unregister parsers
      for (let i = 0; i < 10; i++) {
        const parser: VendorParser = {
          vendor: `temp-${i}`,
          detect: () => false,
          parse: () => [],
        };

        testRegistry.registerParser(parser, 50);
        testRegistry.unregisterParser(`temp-${i}`);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete quickly
      expect(duration, 'Registry operations should be fast').toBeLessThan(100);

      // Registry should be back to original state
      expect(testRegistry.size()).toBe(4); // Claude + Cursor + Gemini + Amp
    });
  });
});
