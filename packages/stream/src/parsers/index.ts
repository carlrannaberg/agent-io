import { VendorParser, ParserEntry, DetectionResult } from './types.js';
import { claudeParser } from './claude.js';
import { geminiParser } from './gemini.js';
import { ampParser } from './amp.js';
import { cursorParser } from './cursor.js';
import { Vendor } from '../types.js';

/**
 * Registry system for managing vendor parsers
 *
 * The ParserRegistry maintains a collection of vendor parsers with priority-based
 * auto-detection. Higher priority parsers are tried first during auto-detection.
 *
 * @example
 * ```typescript
 * // Get a specific parser
 * const parser = registry.getParser('claude');
 *
 * // Auto-detect vendor from line
 * const detected = registry.detectVendor(jsonLine);
 *
 * // Register a custom parser
 * registry.registerParser(myParser, 75);
 * ```
 */
export class ParserRegistry {
  private parsers: Map<string, ParserEntry> = new Map();

  /**
   * Initialize registry with default parsers
   */
  constructor() {
    // Register built-in parsers with priority
    // Cursor has highest priority since it's most specific (requires session_id)
    this.registerParser(cursorParser, 100);
    // Claude is less specific, can match broader patterns
    this.registerParser(claudeParser, 90);
    this.registerParser(ampParser, 80);
    // Gemini has lowest priority since it accepts any non-JSON text
    this.registerParser(geminiParser, 10);
  }

  /**
   * Register a parser with the specified priority
   *
   * Higher priority parsers are tried first during auto-detection.
   * If a parser with the same vendor name already exists, it will be replaced.
   *
   * @param parser - The parser to register
   * @param priority - Priority level (higher = tried first in auto-detection)
   * @throws {Error} If parser is null or undefined
   * @throws {Error} If parser.vendor is empty or invalid
   *
   * @example
   * ```typescript
   * registry.registerParser(myParser, 75);
   * ```
   */
  registerParser(parser: VendorParser, priority: number = 50): void {
    if (!parser) {
      throw new Error('Parser cannot be null or undefined');
    }

    if (
      !parser.vendor ||
      typeof parser.vendor !== 'string' ||
      parser.vendor.trim() === ''
    ) {
      throw new Error('Parser must have a valid vendor name');
    }

    if (typeof priority !== 'number' || !isFinite(priority)) {
      throw new Error('Priority must be a finite number');
    }

    // Prevent registration of 'auto' as a vendor (reserved for auto-detection)
    if (parser.vendor === 'auto') {
      throw new Error(
        "Cannot register parser with vendor 'auto' (reserved for auto-detection)",
      );
    }

    this.parsers.set(parser.vendor, { parser, priority });
  }

  /**
   * Get a parser by vendor name
   *
   * @param vendor - Vendor name to look up
   * @returns Parser instance or null if not found
   *
   * @example
   * ```typescript
   * const parser = registry.getParser('claude');
   * if (parser) {
   *   const events = parser.parse(jsonLine);
   * }
   * ```
   */
  getParser(vendor: Vendor): VendorParser | null {
    if (vendor === 'auto') {
      return null; // Auto is not a specific parser
    }

    const entry = this.parsers.get(vendor);
    return entry ? entry.parser : null;
  }

  /**
   * Get parsers sorted by priority (highest first)
   * @returns Array of parser entries sorted by priority
   */
  private getSortedParsers(): ParserEntry[] {
    return Array.from(this.parsers.values()).sort(
      (a, b) => b.priority - a.priority,
    );
  }

  /**
   * Auto-detect vendor from a line using parser priorities
   *
   * Enhanced version with improved error handling and candidate collection.
   * Tries all registered parsers in priority order (highest first).
   * Returns the first parser whose detect() method returns true.
   *
   * @param line - Raw JSONL line to analyze
   * @returns Detected parser or null if no parser matches
   *
   * @example
   * ```typescript
   * const parser = registry.detectVendor(jsonLine);
   * if (parser) {
   *   console.log(`Detected vendor: ${parser.vendor}`);
   *   const events = parser.parse(jsonLine);
   * }
   * ```
   */
  detectVendor(line: string): VendorParser | null {
    if (!line || typeof line !== 'string') {
      return null;
    }

    // 1. Try all parsers in priority order
    const sortedParsers = this.getSortedParsers();

    // 2. Collect detection results
    const candidates: VendorParser[] = [];

    for (const entry of sortedParsers) {
      try {
        if (entry.parser.detect(line)) {
          candidates.push(entry.parser);
        }
      } catch (error) {
        // Silently continue - parser detection errors are expected in some cases
        // especially during testing of error handling
      }
    }

    // 3. Return highest priority match
    return candidates[0] || null;
  }

  /**
   * Multi-line vendor detection for better accuracy
   *
   * Analyzes multiple lines to determine the most likely vendor.
   * This is more reliable than single-line detection for mixed formats.
   *
   * @param lines - Array of JSONL lines to analyze
   * @returns Detected parser or null if no parser matches consistently
   *
   * @example
   * ```typescript
   * const lines = stream.split('\n').slice(0, 10);
   * const parser = registry.detectVendorMultiLine(lines);
   * if (parser) {
   *   console.log(`Detected vendor: ${parser.vendor} (multi-line)`);
   * }
   * ```
   */
  detectVendorMultiLine(lines: string[]): VendorParser | null {
    if (!lines || lines.length === 0) {
      return null;
    }

    // Try detection on first 10 lines for better accuracy
    const detectionResults = new Map<string, number>();

    for (const line of lines.slice(0, 10)) {
      if (!line || line.trim() === '') {
        continue; // Skip empty lines
      }

      const parser = this.detectVendor(line);
      if (parser) {
        const count = detectionResults.get(parser.vendor) || 0;
        detectionResults.set(parser.vendor, count + 1);
      }
    }

    // Return parser with most matches
    if (detectionResults.size === 0) {
      return null;
    }

    const [topVendor] = [...detectionResults.entries()].sort(
      (a, b) => b[1] - a[1],
    );

    return topVendor ? this.getParser(topVendor[0] as Vendor) : null;
  }

  /**
   * Vendor detection with confidence scoring
   *
   * Provides confidence metrics for detection results, useful for
   * debugging and handling ambiguous formats.
   *
   * @param line - Raw JSONL line to analyze
   * @returns Detection result with confidence score, or null if no match
   *
   * @example
   * ```typescript
   * const result = registry.detectVendorWithConfidence(jsonLine);
   * if (result && result.confidence > 0.8) {
   *   console.log(`High confidence detection: ${result.parser.vendor}`);
   *   console.log(`Reason: ${result.reason}`);
   * }
   * ```
   */
  detectVendorWithConfidence(line: string): DetectionResult | null {
    if (!line || typeof line !== 'string') {
      return null;
    }

    const sortedParsers = this.getSortedParsers();
    const candidates: Array<{
      parser: VendorParser;
      confidence: number;
      reason: string;
    }> = [];

    for (const entry of sortedParsers) {
      try {
        if (entry.parser.detect(line)) {
          // Calculate confidence based on format specificity
          const confidence = this.calculateConfidence(entry.parser, line);
          const reason = this.generateDetectionReason(entry.parser, line);

          candidates.push({
            parser: entry.parser,
            confidence,
            reason,
          });
        }
      } catch (error) {
        // Only log parser detection errors in non-test environments
        // In tests, we intentionally use error parsers to test error handling
        if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
          console.warn(
            `Parser ${entry.parser.vendor} detection failed:`,
            error,
          );
        }
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Return candidate with highest confidence
    const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
    return {
      parser: best.parser,
      confidence: best.confidence,
      reason: best.reason,
    };
  }

  /**
   * Calculate confidence score for a parser detection
   * @param parser - The parser that detected the format
   * @param line - The line being analyzed
   * @returns Confidence score between 0 and 1
   */
  private calculateConfidence(parser: VendorParser, line: string): number {
    try {
      const obj = JSON.parse(line);

      // Base confidence for successful JSON parsing
      let confidence = 0.5;

      // Increase confidence based on vendor-specific indicators
      switch (parser.vendor) {
        case 'claude':
          // Claude has very specific type indicators
          if (
            obj.type &&
            ['message', 'tool_use', 'tool_result', 'usage', 'error'].includes(
              obj.type,
            )
          ) {
            confidence += 0.4;
          }
          // Message events with role are highly specific
          if (
            obj.type === 'message' &&
            obj.role &&
            ['user', 'assistant'].includes(obj.role)
          ) {
            confidence += 0.1;
          }
          break;

        case 'gemini':
          // Gemini format indicators
          if (
            obj.type &&
            ['user', 'assistant', 'metadata'].includes(obj.type)
          ) {
            confidence += 0.3;
          }
          // Usage metadata is highly specific
          if (obj.type === 'metadata' && obj.usage) {
            confidence += 0.2;
          }
          break;

        case 'cursor':
          // Cursor format indicators
          if (
            obj.type &&
            ['system', 'user', 'assistant', 'tool_call', 'result'].includes(
              obj.type,
            )
          ) {
            confidence += 0.4;
          }
          // System events with subtype and session_id are highly specific
          if (
            obj.type === 'system' &&
            obj.subtype === 'init' &&
            obj.session_id
          ) {
            confidence += 0.1;
          }
          // Tool call events with call_id are very specific
          if (obj.type === 'tool_call' && obj.call_id && obj.tool_call) {
            confidence += 0.1;
          }
          break;

        case 'amp':
          // Amp phase-based format
          if (
            obj.phase &&
            ['start', 'output', 'end'].includes(obj.phase) &&
            obj.task
          ) {
            confidence += 0.4;
          }
          // Output phases with type are more specific
          if (
            obj.phase === 'output' &&
            obj.type &&
            ['stdout', 'stderr'].includes(obj.type)
          ) {
            confidence += 0.1;
          }
          break;
      }

      return Math.min(confidence, 1.0);
    } catch {
      // If we can't parse JSON, confidence is low even if detection passed
      return 0.2;
    }
  }

  /**
   * Generate human-readable reason for detection
   * @param parser - The parser that detected the format
   * @param line - The line being analyzed
   * @returns Human-readable detection reason
   */
  private generateDetectionReason(parser: VendorParser, line: string): string {
    try {
      const obj = JSON.parse(line);

      switch (parser.vendor) {
        case 'claude':
          if (obj.type) {
            return `Claude format detected: type="${obj.type}"`;
          }
          return 'Claude format detected: structure matches';

        case 'gemini':
          if (obj.type) {
            return `Gemini format detected: type="${obj.type}"`;
          }
          return 'Gemini format detected: structure matches';

        case 'cursor':
          if (obj.type && obj.session_id) {
            return `Cursor format detected: type="${obj.type}", session_id="${obj.session_id}"`;
          }
          if (obj.type) {
            return `Cursor format detected: type="${obj.type}"`;
          }
          return 'Cursor format detected: structure matches';

        case 'amp':
          if (obj.phase && obj.task) {
            return `Amp format detected: phase="${obj.phase}", task="${obj.task}"`;
          }
          return 'Amp format detected: structure matches';

        default:
          return `${parser.vendor} format detected`;
      }
    } catch {
      return `${parser.vendor} format detected (non-JSON)`;
    }
  }

  /**
   * Get list of all registered vendor names
   *
   * @returns Array of vendor names
   *
   * @example
   * ```typescript
   * const vendors = registry.listParsers();
   * console.log('Available vendors:', vendors.join(', '));
   * ```
   */
  listParsers(): string[] {
    return Array.from(this.parsers.keys()).sort();
  }

  /**
   * Get number of registered parsers
   *
   * @returns Number of parsers in registry
   */
  size(): number {
    return this.parsers.size;
  }

  /**
   * Check if a vendor is registered
   *
   * @param vendor - Vendor name to check
   * @returns True if vendor is registered
   */
  hasParser(vendor: string): boolean {
    return this.parsers.has(vendor);
  }

  /**
   * Remove a parser from the registry
   *
   * @param vendor - Vendor name to remove
   * @returns True if parser was removed, false if not found
   */
  unregisterParser(vendor: string): boolean {
    return this.parsers.delete(vendor);
  }

  /**
   * Clear all parsers from the registry
   *
   * Warning: This will remove all parsers including built-in ones.
   * Use with caution.
   */
  clear(): void {
    this.parsers.clear();
  }
}

/**
 * Default parser registry instance
 *
 * Pre-configured registry with built-in parsers registered:
 * - Claude Code parser (priority: 100)
 * - Cursor Agent parser (priority: 90)
 * - Amp Code parser (priority: 80)
 * - Gemini CLI parser (priority: 10) - lowest priority as it accepts any non-JSON text
 *
 * This is the recommended way to access the parser registry.
 *
 * @example
 * ```typescript
 * import { registry } from 'agent-stream-fmt';
 *
 * // Get a specific parser
 * const parser = registry.getParser('claude');
 *
 * // Auto-detect vendor
 * const detected = registry.detectVendor(jsonLine);
 *
 * // Register custom parser
 * registry.registerParser(myParser, 75);
 *
 * // List all parsers
 * console.log('Available:', registry.listParsers());
 * ```
 *
 * @category Parsers
 * @since 0.1.0
 */
export const registry = new ParserRegistry();

/**
 * Register a parser with the default registry
 *
 * Convenience function for registering parsers with the default registry.
 * Higher priority parsers are tried first during auto-detection.
 *
 * @param parser - Parser to register
 * @param priority - Priority level (default: 50, built-in parsers use 80-100)
 *
 * @example
 * ```typescript
 * // Register a custom parser
 * const myParser: VendorParser = {
 *   vendor: 'custom',
 *   detect: (line) => line.includes('custom-format'),
 *   parse: (line) => {
 *     // Parse logic here
 *     return [];
 *   }
 * };
 *
 * registerParser(myParser, 75);
 * ```
 *
 * @category Parsers
 * @since 0.1.0
 */
export function registerParser(
  parser: VendorParser,
  priority: number = 50,
): void {
  registry.registerParser(parser, priority);
}

/**
 * Get a parser by vendor name from the default registry
 *
 * @param vendor - Vendor name to look up ('claude', 'cursor', 'gemini', 'amp')
 * @returns Parser instance or null if not found
 *
 * @example
 * ```typescript
 * const parser = getParser('claude');
 * if (parser) {
 *   const events = parser.parse(jsonLine);
 *   console.log(`Parsed ${events.length} events`);
 * }
 *
 * // Check if vendor is supported
 * if (!getParser('unknown')) {
 *   console.error('Vendor not supported');
 * }
 * ```
 *
 * @category Parsers
 * @since 0.1.0
 */
export function getParser(vendor: Vendor): VendorParser | null {
  return registry.getParser(vendor);
}

/**
 * Auto-detect vendor from a line using the default registry
 *
 * Tries all registered parsers in priority order and returns the first
 * parser whose detect() method returns true.
 *
 * @param line - Raw JSONL line to analyze
 * @returns Detected parser or null if no parser matches
 *
 * @example
 * ```typescript
 * const parser = detectVendor(jsonLine);
 * if (parser) {
 *   console.log(`Detected vendor: ${parser.vendor}`);
 *   const events = parser.parse(jsonLine);
 * } else {
 *   console.error('Unknown format');
 * }
 * ```
 *
 * @category Parsers
 * @since 0.1.0
 */
export function detectVendor(line: string): VendorParser | null {
  return registry.detectVendor(line);
}

/**
 * Multi-line vendor detection using the default registry
 *
 * Analyzes multiple lines to determine the most likely vendor.
 * More reliable than single-line detection for mixed formats or
 * when the first line might not be representative.
 *
 * @param lines - Array of JSONL lines to analyze (uses first 10 non-empty lines)
 * @returns Detected parser or null if no parser matches consistently
 *
 * @example
 * ```typescript
 * // Read first few lines for detection
 * const lines = [];
 * const reader = readline.createInterface({ input: stream });
 *
 * for await (const line of reader) {
 *   lines.push(line);
 *   if (lines.length >= 10) break;
 * }
 *
 * const parser = detectVendorMultiLine(lines);
 * if (parser) {
 *   console.log(`Detected vendor: ${parser.vendor} (high confidence)`);
 * }
 * ```
 *
 * @category Parsers
 * @since 0.1.0
 */
export function detectVendorMultiLine(lines: string[]): VendorParser | null {
  return registry.detectVendorMultiLine(lines);
}

/**
 * Vendor detection with confidence scoring using the default registry
 *
 * Provides confidence metrics for detection results, useful for
 * debugging and handling ambiguous formats. Confidence scores range
 * from 0.0 to 1.0, with higher scores indicating more certainty.
 *
 * @param line - Raw JSONL line to analyze
 * @returns Detection result with confidence score, or null if no match
 *
 * @example
 * ```typescript
 * const result = detectVendorWithConfidence(jsonLine);
 * if (result) {
 *   console.log(`Detected: ${result.parser.vendor}`);
 *   console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
 *   console.log(`Reason: ${result.reason}`);
 *
 *   if (result.confidence > 0.8) {
 *     // High confidence - proceed normally
 *     const events = result.parser.parse(jsonLine);
 *   } else {
 *     // Low confidence - maybe prompt user or log warning
 *     console.warn('Low confidence detection');
 *   }
 * }
 * ```
 *
 * @category Parsers
 * @since 0.1.0
 */
export function detectVendorWithConfidence(
  line: string,
): DetectionResult | null {
  return registry.detectVendorWithConfidence(line);
}

/**
 * Get list of all registered vendor names from the default registry
 *
 * @returns Array of vendor names sorted alphabetically
 *
 * @example
 * ```typescript
 * const vendors = listParsers();
 * console.log('Available vendors:', vendors.join(', '));
 * // Output: "amp, claude, gemini"
 *
 * // Check if a vendor is supported
 * if (listParsers().includes('claude')) {
 *   console.log('Claude is supported');
 * }
 * ```
 *
 * @category Parsers
 * @since 0.1.0
 */
export function listParsers(): string[] {
  return registry.listParsers();
}

/**
 * Select a parser based on vendor option
 *
 * Handles both explicit vendor selection and auto-detection.
 * For auto-detection, requires a sample line to analyze.
 * This is the recommended way to get a parser when processing streams.
 *
 * @param vendor - Vendor name or 'auto' for auto-detection
 * @param firstLine - Sample line for auto-detection (required if vendor is 'auto')
 * @returns Selected parser
 * @throws {Error} If vendor is 'auto' but no firstLine provided
 * @throws {Error} If auto-detection fails to identify format
 * @throws {Error} If specified vendor is not registered
 *
 * @example
 * ```typescript
 * // Explicit vendor selection
 * try {
 *   const parser = selectParser('claude');
 *   // Process entire stream with this parser
 * } catch (error) {
 *   console.error('Vendor not supported:', error.message);
 * }
 *
 * // Auto-detection from first line
 * const firstLine = await readFirstLine(stream);
 * try {
 *   const parser = selectParser('auto', firstLine);
 *   console.log(`Auto-detected: ${parser.vendor}`);
 *
 *   // Process first line and rest of stream
 *   const events = parser.parse(firstLine);
 *   // ... continue with rest of stream
 * } catch (error) {
 *   console.error('Failed to detect format:', error.message);
 * }
 * ```
 *
 * @category Parsers
 * @since 0.1.0
 */
export function selectParser(vendor: Vendor, firstLine?: string): VendorParser {
  if (vendor === 'auto') {
    if (!firstLine) {
      throw new Error('Auto-detection requires at least one line');
    }

    const detected = registry.detectVendor(firstLine);
    if (!detected) {
      throw new Error(
        `Failed to auto-detect vendor from line: ${firstLine.substring(0, 100)}...`,
      );
    }

    return detected;
  }

  const parser = registry.getParser(vendor);
  if (!parser) {
    const available = registry.listParsers();
    throw new Error(
      `Unknown vendor: ${vendor}. Available vendors: ${available.join(', ')}`,
    );
  }

  return parser;
}
