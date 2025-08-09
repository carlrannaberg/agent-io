import { describe, it, expect, beforeEach } from 'vitest';
import {
  ParserRegistry,
  registry,
  registerParser,
  getParser,
  detectVendor,
  detectVendorMultiLine,
  detectVendorWithConfidence,
  listParsers,
  selectParser,
} from './index.js';
import { VendorParser } from './types.js';
import { claudeParser } from './claude.js';
import { Vendor } from '../types.js';

describe('ParserRegistry', () => {
  let testRegistry: ParserRegistry;

  beforeEach(() => {
    testRegistry = new ParserRegistry();
  });

  describe('constructor', () => {
    it('initializes with all default parsers registered', () => {
      expect(testRegistry.hasParser('claude')).toBe(true);
      expect(testRegistry.hasParser('cursor')).toBe(true);
      expect(testRegistry.hasParser('gemini')).toBe(true);
      expect(testRegistry.hasParser('amp')).toBe(true);
      expect(testRegistry.size()).toBe(4);
    });

    it('registers Claude parser with priority 100', () => {
      const parser = testRegistry.getParser('claude');
      expect(parser).toBe(claudeParser);
    });
  });

  describe('registerParser', () => {
    it('registers a parser with default priority', () => {
      const mockParser: VendorParser = {
        vendor: 'test',
        detect: () => true,
        parse: () => [],
      };

      testRegistry.registerParser(mockParser);
      expect(testRegistry.hasParser('test')).toBe(true);
      expect(testRegistry.getParser('test' as Vendor)).toBe(mockParser);
    });

    it('registers a parser with custom priority', () => {
      const mockParser: VendorParser = {
        vendor: 'test',
        detect: () => true,
        parse: () => [],
      };

      testRegistry.registerParser(mockParser, 75);
      expect(testRegistry.hasParser('test')).toBe(true);
    });

    it('replaces existing parser with same vendor name', () => {
      const parser1: VendorParser = {
        vendor: 'test',
        detect: () => true,
        parse: () => [],
      };

      const parser2: VendorParser = {
        vendor: 'test',
        detect: () => false,
        parse: () => [],
      };

      testRegistry.registerParser(parser1);
      testRegistry.registerParser(parser2);

      expect(testRegistry.getParser('test' as Vendor)).toBe(parser2);
      expect(testRegistry.size()).toBe(5); // claude + cursor + gemini + amp + test
    });

    it('throws error for null parser', () => {
      expect(() => {
        testRegistry.registerParser(null as unknown as VendorParser);
      }).toThrow('Parser cannot be null or undefined');
    });

    it('throws error for undefined parser', () => {
      expect(() => {
        testRegistry.registerParser(undefined as unknown as VendorParser);
      }).toThrow('Parser cannot be null or undefined');
    });

    it('throws error for parser with empty vendor name', () => {
      const mockParser: VendorParser = {
        vendor: '',
        detect: () => true,
        parse: () => [],
      };

      expect(() => {
        testRegistry.registerParser(mockParser);
      }).toThrow('Parser must have a valid vendor name');
    });

    it('throws error for parser with whitespace-only vendor name', () => {
      const mockParser: VendorParser = {
        vendor: '   ',
        detect: () => true,
        parse: () => [],
      };

      expect(() => {
        testRegistry.registerParser(mockParser);
      }).toThrow('Parser must have a valid vendor name');
    });

    it('throws error for parser with auto vendor name', () => {
      const mockParser: VendorParser = {
        vendor: 'auto',
        detect: () => true,
        parse: () => [],
      };

      expect(() => {
        testRegistry.registerParser(mockParser);
      }).toThrow(
        "Cannot register parser with vendor 'auto' (reserved for auto-detection)",
      );
    });

    it('throws error for invalid priority', () => {
      const mockParser: VendorParser = {
        vendor: 'test',
        detect: () => true,
        parse: () => [],
      };

      expect(() => {
        testRegistry.registerParser(mockParser, NaN);
      }).toThrow('Priority must be a finite number');

      expect(() => {
        testRegistry.registerParser(mockParser, Infinity);
      }).toThrow('Priority must be a finite number');
    });
  });

  describe('getParser', () => {
    it('returns parser for existing vendor', () => {
      const parser = testRegistry.getParser('claude');
      expect(parser).toBe(claudeParser);
    });

    it('returns null for non-existing vendor', () => {
      const parser = testRegistry.getParser('nonexistent' as Vendor);
      expect(parser).toBeNull();
    });

    it('returns null for auto vendor', () => {
      const parser = testRegistry.getParser('auto');
      expect(parser).toBeNull();
    });
  });

  describe('detectVendor', () => {
    it('detects Claude format correctly', () => {
      const claudeLine =
        '{"type":"message","role":"assistant","content":"Hello"}';
      const detected = testRegistry.detectVendor(claudeLine);

      expect(detected).toBe(claudeParser);
    });

    it('returns null for unrecognized format', () => {
      const unknownLine = '{"unknown":"format"}';
      const detected = testRegistry.detectVendor(unknownLine);

      expect(detected).toBeNull();
    });

    it('returns null for empty line', () => {
      const detected = testRegistry.detectVendor('');
      expect(detected).toBeNull();
    });

    it('returns null for non-string input', () => {
      const detected = testRegistry.detectVendor(null as unknown as string);
      expect(detected).toBeNull();
    });

    it('respects parser priority order', () => {
      const highPriorityParser: VendorParser = {
        vendor: 'high',
        detect: () => true,
        parse: () => [],
      };

      const lowPriorityParser: VendorParser = {
        vendor: 'low',
        detect: () => true,
        parse: () => [],
      };

      testRegistry.registerParser(lowPriorityParser, 10);
      testRegistry.registerParser(highPriorityParser, 200);

      const detected = testRegistry.detectVendor('anything');
      expect(detected?.vendor).toBe('high');
    });

    it('handles parser detection errors gracefully', () => {
      const errorParser: VendorParser = {
        vendor: 'error',
        detect: () => {
          throw new Error('Detection error');
        },
        parse: () => [],
      };

      testRegistry.registerParser(errorParser, 200);

      // Should still work despite error parser
      const claudeLine =
        '{"type":"message","role":"assistant","content":"Hello"}';
      const detected = testRegistry.detectVendor(claudeLine);
      expect(detected?.vendor).toBe('claude');
    });
  });

  describe('listParsers', () => {
    it('returns list of registered vendors', () => {
      const vendors = testRegistry.listParsers();
      expect(vendors).toEqual(['amp', 'claude', 'cursor', 'gemini']);
    });

    it('returns sorted list', () => {
      const parser1: VendorParser = {
        vendor: 'zebra',
        detect: () => true,
        parse: () => [],
      };

      const parser2: VendorParser = {
        vendor: 'alpha',
        detect: () => true,
        parse: () => [],
      };

      testRegistry.registerParser(parser1);
      testRegistry.registerParser(parser2);

      const vendors = testRegistry.listParsers();
      expect(vendors).toEqual([
        'alpha',
        'amp',
        'claude',
        'cursor',
        'gemini',
        'zebra',
      ]);
    });

    it('returns empty array for empty registry', () => {
      testRegistry.clear();
      const vendors = testRegistry.listParsers();
      expect(vendors).toEqual([]);
    });
  });

  describe('size', () => {
    it('returns correct size', () => {
      expect(testRegistry.size()).toBe(4);

      const mockParser: VendorParser = {
        vendor: 'test',
        detect: () => true,
        parse: () => [],
      };

      testRegistry.registerParser(mockParser);
      expect(testRegistry.size()).toBe(5); // claude + cursor + gemini + amp + test
    });
  });

  describe('hasParser', () => {
    it('returns true for existing parser', () => {
      expect(testRegistry.hasParser('claude')).toBe(true);
    });

    it('returns false for non-existing parser', () => {
      expect(testRegistry.hasParser('nonexistent')).toBe(false);
    });
  });

  describe('unregisterParser', () => {
    it('removes existing parser', () => {
      const result = testRegistry.unregisterParser('claude');
      expect(result).toBe(true);
      expect(testRegistry.hasParser('claude')).toBe(false);
    });

    it('returns false for non-existing parser', () => {
      const result = testRegistry.unregisterParser('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all parsers', () => {
      testRegistry.clear();
      expect(testRegistry.size()).toBe(0);
      expect(testRegistry.listParsers()).toEqual([]);
    });
  });

  describe('Enhanced Detection Methods', () => {
    describe('detectVendorMultiLine', () => {
      it('detects vendor from multiple lines with high accuracy', () => {
        const claudeLines = [
          '{"type":"message","role":"user","content":"Hello"}',
          '{"type":"message","role":"assistant","content":"Hi there!"}',
          '{"type":"tool_use","id":"toolu_123","name":"Write","input":{"file_path":"test.txt"}}',
          '{"type":"usage","input_tokens":10,"output_tokens":5}',
        ];

        const detected = testRegistry.detectVendorMultiLine(claudeLines);
        expect(detected?.vendor).toBe('claude');
      });

      it('handles mixed format lines and chooses most frequent', () => {
        const mixedLines = [
          '{"type":"message","role":"user","content":"Hello"}', // Claude
          '{"type":"user","content":"Hello"}', // Gemini
          '{"type":"message","role":"assistant","content":"Hi"}', // Claude
          '{"type":"message","role":"user","content":"Test"}', // Claude
        ];

        const detected = testRegistry.detectVendorMultiLine(mixedLines);
        expect(detected?.vendor).toBe('claude'); // Should win with 3/4 matches
      });

      it('returns null for empty array', () => {
        const detected = testRegistry.detectVendorMultiLine([]);
        expect(detected).toBeNull();
      });

      it('skips empty lines', () => {
        const linesWithEmpties = [
          '',
          '{"type":"message","role":"user","content":"Hello"}',
          '   ',
          '{"type":"message","role":"assistant","content":"Hi"}',
        ];

        const detected = testRegistry.detectVendorMultiLine(linesWithEmpties);
        expect(detected?.vendor).toBe('claude');
      });

      it('limits analysis to first 10 lines', () => {
        const manyLines = Array(15).fill(
          '{"type":"message","role":"user","content":"Hello"}',
        );
        manyLines[11] = '{"phase":"start","task":"test"}'; // Amp format after 10th line

        const detected = testRegistry.detectVendorMultiLine(manyLines);
        expect(detected?.vendor).toBe('claude'); // Should not see the Amp line
      });

      it('returns null when no lines match any parser', () => {
        const unknownLines = [
          '{"unknown":"format"}',
          '{"another":"unknown"}',
          '{"different":"structure"}',
        ];

        const detected = testRegistry.detectVendorMultiLine(unknownLines);
        expect(detected).toBeNull();
      });
    });

    describe('detectVendorWithConfidence', () => {
      it('returns high confidence for Claude message events', () => {
        const claudeLine =
          '{"type":"message","role":"assistant","content":"Hello"}';

        const result = testRegistry.detectVendorWithConfidence(claudeLine);
        expect(result).not.toBeNull();
        expect(result!.parser.vendor).toBe('claude');
        expect(result!.confidence).toBeGreaterThan(0.8);
        expect(result!.reason).toContain('Claude format detected');
      });

      it('returns medium confidence for less specific formats', () => {
        const claudeLine =
          '{"type":"usage","input_tokens":10,"output_tokens":5}';

        const result = testRegistry.detectVendorWithConfidence(claudeLine);
        expect(result).not.toBeNull();
        expect(result!.parser.vendor).toBe('claude');
        expect(result!.confidence).toBeGreaterThan(0.5);
        expect(result!.confidence).toBeLessThan(1.0);
      });

      it('returns low confidence for Gemini plain text (due to low priority)', () => {
        const geminiLine = 'Hello, how can I help you today?';

        const result = testRegistry.detectVendorWithConfidence(geminiLine);
        expect(result).not.toBeNull();
        expect(result!.parser.vendor).toBe('gemini');
        // Gemini has low priority (10) so confidence is low
        expect(result!.confidence).toBeLessThan(0.3);
        expect(result!.reason).toContain('gemini format detected');
      });

      it('returns high confidence for Amp tool execution with output type', () => {
        const ampLine =
          '{"phase":"output","task":"npm_test","type":"stdout","content":"Running tests..."}';

        const result = testRegistry.detectVendorWithConfidence(ampLine);
        expect(result).not.toBeNull();
        expect(result!.parser.vendor).toBe('amp');
        expect(result!.confidence).toBeGreaterThan(0.8);
        expect(result!.reason).toContain('Amp format detected');
      });

      it('returns null for unrecognized format', () => {
        const unknownLine = '{"unknown":"format","data":"test"}';

        const result = testRegistry.detectVendorWithConfidence(unknownLine);
        expect(result).toBeNull();
      });

      it('handles parser detection errors gracefully', () => {
        const errorParser: VendorParser = {
          vendor: 'error',
          detect: () => {
            throw new Error('Detection error');
          },
          parse: () => [],
        };

        testRegistry.registerParser(errorParser, 200);

        const claudeLine =
          '{"type":"message","role":"assistant","content":"Hello"}';
        const result = testRegistry.detectVendorWithConfidence(claudeLine);

        // Should still detect Claude despite error parser
        expect(result?.parser.vendor).toBe('claude');

        testRegistry.unregisterParser('error');
      });

      it('returns best candidate when multiple parsers match', () => {
        // Create a parser that always matches with lower confidence
        const alwaysMatchParser: VendorParser = {
          vendor: 'always-match',
          detect: () => true,
          parse: () => [],
        };

        testRegistry.registerParser(alwaysMatchParser, 50); // Lower priority than Claude

        const claudeLine =
          '{"type":"message","role":"assistant","content":"Hello"}';
        const result = testRegistry.detectVendorWithConfidence(claudeLine);

        // Should prefer Claude due to higher confidence
        expect(result?.parser.vendor).toBe('claude');
        expect(result?.confidence).toBeGreaterThan(0.8);

        testRegistry.unregisterParser('always-match');
      });

      it('returns low confidence for non-JSON that still matches', () => {
        // Mock a parser that detects non-JSON
        const nonJsonParser: VendorParser = {
          vendor: 'non-json',
          detect: line => line.includes('special-marker'),
          parse: () => [],
        };

        testRegistry.registerParser(nonJsonParser, 60);

        const nonJsonLine = 'not-json-but-has-special-marker';
        const result = testRegistry.detectVendorWithConfidence(nonJsonLine);

        expect(result?.parser.vendor).toBe('non-json');
        expect(result?.confidence).toBe(0.2); // Low confidence for non-JSON
        expect(result?.reason).toContain('(non-JSON)');

        testRegistry.unregisterParser('non-json');
      });

      it('caps confidence at 1.0', () => {
        // Test that confidence never exceeds 1.0 even with highly specific formats
        const claudeLine =
          '{"type":"message","role":"assistant","content":"Hello","extra_specific_field":"value"}';

        const result = testRegistry.detectVendorWithConfidence(claudeLine);
        expect(result?.confidence).toBeLessThanOrEqual(1.0);
      });
    });

    describe('Enhanced detectVendor error handling', () => {
      it('collects all matching candidates and returns highest priority', () => {
        // Create multiple parsers that match the same format
        const parser1: VendorParser = {
          vendor: 'test1',
          detect: () => true,
          parse: () => [],
        };

        const parser2: VendorParser = {
          vendor: 'test2',
          detect: () => true,
          parse: () => [],
        };

        testRegistry.registerParser(parser1, 70);
        testRegistry.registerParser(parser2, 80); // Higher priority

        const result = testRegistry.detectVendor('{"test": true}');
        expect(result?.vendor).toBe('test2'); // Should return higher priority

        testRegistry.unregisterParser('test1');
        testRegistry.unregisterParser('test2');
      });

      it('continues processing after parser detection error', () => {
        const errorParser: VendorParser = {
          vendor: 'error',
          detect: () => {
            throw new Error('Detection failed');
          },
          parse: () => [],
        };

        testRegistry.registerParser(errorParser, 200); // Higher priority than Claude

        const claudeLine =
          '{"type":"message","role":"assistant","content":"Hello"}';
        const result = testRegistry.detectVendor(claudeLine);

        // Should still detect Claude despite error in higher priority parser
        expect(result?.vendor).toBe('claude');

        testRegistry.unregisterParser('error');
      });
    });
  });
});

describe('Default registry and convenience functions', () => {
  describe('default registry', () => {
    it('is initialized with all default parsers', () => {
      expect(registry.hasParser('claude')).toBe(true);
      expect(registry.hasParser('cursor')).toBe(true);
      expect(registry.hasParser('gemini')).toBe(true);
      expect(registry.hasParser('amp')).toBe(true);
      expect(registry.size()).toBe(4);
    });
  });

  describe('registerParser function', () => {
    it('registers parser with default registry', () => {
      const mockParser: VendorParser = {
        vendor: 'test-convenience',
        detect: () => true,
        parse: () => [],
      };

      registerParser(mockParser, 75);
      expect(registry.hasParser('test-convenience')).toBe(true);

      // Cleanup
      registry.unregisterParser('test-convenience');
    });
  });

  describe('getParser function', () => {
    it('retrieves parser from default registry', () => {
      const parser = getParser('claude');
      expect(parser).toBe(claudeParser);
    });

    it('returns null for non-existing parser', () => {
      const parser = getParser('nonexistent' as Vendor);
      expect(parser).toBeNull();
    });
  });

  describe('detectVendor function', () => {
    it('detects vendor using default registry', () => {
      const claudeLine =
        '{"type":"message","role":"assistant","content":"Hello"}';
      const detected = detectVendor(claudeLine);

      expect(detected).toBe(claudeParser);
    });

    it('returns null for unrecognized format', () => {
      const unknownLine = '{"unknown":"format"}';
      const detected = detectVendor(unknownLine);

      expect(detected).toBeNull();
    });
  });

  describe('listParsers function', () => {
    it('returns vendors from default registry', () => {
      const vendors = listParsers();
      expect(vendors).toContain('claude');
    });
  });

  describe('selectParser function', () => {
    it('returns specific parser for known vendor', () => {
      const parser = selectParser('claude');
      expect(parser).toBe(claudeParser);
    });

    it('throws error for unknown vendor', () => {
      expect(() => {
        selectParser('unknown' as Vendor);
      }).toThrow('Unknown vendor: unknown');
    });

    it('auto-detects vendor when vendor is auto', () => {
      const claudeLine =
        '{"type":"message","role":"assistant","content":"Hello"}';
      const parser = selectParser('auto', claudeLine);

      expect(parser).toBe(claudeParser);
    });

    it('throws error for auto without firstLine', () => {
      expect(() => {
        selectParser('auto');
      }).toThrow('Auto-detection requires at least one line');
    });

    it('throws error for auto with unrecognized format', () => {
      const unknownLine = '{"unknown":"format"}';

      expect(() => {
        selectParser('auto', unknownLine);
      }).toThrow('Failed to auto-detect vendor from line');
    });
  });
});

describe('Enhanced convenience functions', () => {
  describe('detectVendorMultiLine function', () => {
    it('uses default registry for multi-line detection', () => {
      const claudeLines = [
        '{"type":"message","role":"user","content":"Hello"}',
        '{"type":"message","role":"assistant","content":"Hi there!"}',
      ];

      const detected = detectVendorMultiLine(claudeLines);
      expect(detected?.vendor).toBe('claude');
    });

    it('returns null for empty lines', () => {
      const detected = detectVendorMultiLine([]);
      expect(detected).toBeNull();
    });
  });

  describe('detectVendorWithConfidence function', () => {
    it('uses default registry for confidence detection', () => {
      const claudeLine =
        '{"type":"message","role":"assistant","content":"Hello"}';

      const result = detectVendorWithConfidence(claudeLine);
      expect(result?.parser.vendor).toBe('claude');
      expect(result?.confidence).toBeGreaterThan(0.8);
    });

    it('returns null for unrecognized format', () => {
      const unknownLine = '{"unknown":"format"}';

      const result = detectVendorWithConfidence(unknownLine);
      expect(result).toBeNull();
    });
  });
});

describe('Integration tests with real fixtures', () => {
  it('detects Claude format from real fixture', () => {
    // Sample line from Claude fixtures
    const claudeLine =
      '{"type":"message","role":"assistant","content":"I\'ll help you create a simple test file."}';

    const detected = detectVendor(claudeLine);
    expect(detected?.vendor).toBe('claude');
  });

  it('detects Claude tool_use format', () => {
    const toolUseLine =
      '{"type":"tool_use","id":"toolu_123","name":"Write","input":{"file_path":"test.txt","content":"Hello"}}';

    const detected = detectVendor(toolUseLine);
    expect(detected?.vendor).toBe('claude');
  });

  it('detects Claude usage format', () => {
    const usageLine = '{"type":"usage","input_tokens":142,"output_tokens":89}';

    const detected = detectVendor(usageLine);
    expect(detected?.vendor).toBe('claude');
  });

  it('does not detect non-Claude format', () => {
    const nonClaudeLine = '{"kind":"content","data":{"text":"Hello World"}}';

    const detected = detectVendor(nonClaudeLine);
    expect(detected).toBeNull();
  });

  it('multi-line detection works with mixed vendor session', () => {
    const sessionLines = [
      '{"type":"message","role":"user","content":"Start Claude session"}',
      '{"type":"message","role":"assistant","content":"Claude response"}',
      '{"type":"tool_use","id":"toolu_123","name":"Write","input":{}}',
      '{"type":"tool_result","tool_use_id":"toolu_123","content":"Success"}',
      '{"type":"usage","input_tokens":50,"output_tokens":25}',
    ];

    const detected = detectVendorMultiLine(sessionLines);
    expect(detected?.vendor).toBe('claude');
  });

  it('confidence scoring provides meaningful results for real formats', () => {
    const samples = [
      {
        line: '{"type":"message","role":"assistant","content":"Hello"}',
        expectedVendor: 'claude',
        minConfidence: 0.9,
        expectedReason: 'Claude format detected',
      },
      {
        line: 'This is plain text output from Gemini',
        expectedVendor: 'gemini',
        minConfidence: 0.1, // Low confidence due to low priority
        expectedReason: 'gemini format detected',
      },
      {
        line: '{"phase":"start","task":"build"}',
        expectedVendor: 'amp',
        minConfidence: 0.8,
        expectedReason: 'Amp format detected',
      },
    ];

    for (const sample of samples) {
      const result = detectVendorWithConfidence(sample.line);
      expect(result?.parser.vendor).toBe(sample.expectedVendor);
      expect(result?.confidence).toBeGreaterThanOrEqual(sample.minConfidence);
      expect(result?.reason).toContain(sample.expectedReason);
    }
  });
});
