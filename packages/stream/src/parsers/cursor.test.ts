import { describe, it, expect } from 'vitest';
import { cursorParser } from './cursor.js';

describe('CursorParser', () => {
  describe('detection', () => {
    it('should detect system init events', () => {
      // Purpose: Validates that Cursor's unique system init events are recognized
      // This test can fail if the detection logic doesn't check subtype field
      const systemEvent = JSON.stringify({
        type: 'system',
        subtype: 'init',
        apiKeySource: 'login',
        cwd: '/project',
        session_id: 'test-123',
        model: 'GPT-5',
        permissionMode: 'default'
      });
      
      expect(cursorParser.detect(systemEvent)).toBe(true);
    });
    
    it('should detect tool_call events with call_id', () => {
      // Purpose: Ensures tool calls are identified by their unique structure
      // This test can fail if call_id field checking is missing
      const toolEvent = JSON.stringify({
        type: 'tool_call',
        subtype: 'started',
        call_id: 'call_123',
        tool_call: { readToolCall: { args: { path: 'file.txt' } } },
        session_id: 'test-123'
      });
      
      expect(cursorParser.detect(toolEvent)).toBe(true);
    });
    
    it('should detect user message events', () => {
      // Purpose: Validates user message format detection
      // This test can fail if message field validation is incorrect
      const userEvent = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }]
        },
        session_id: 'test-123'
      });
      
      expect(cursorParser.detect(userEvent)).toBe(true);
    });
    
    it('should detect assistant message events', () => {
      // Purpose: Validates assistant message format detection
      // This test can fail if role checking is too restrictive
      const assistantEvent = JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi' }]
        },
        session_id: 'test-123'
      });
      
      expect(cursorParser.detect(assistantEvent)).toBe(true);
    });
    
    it('should detect result events', () => {
      // Purpose: Validates result event detection with timing data
      // This test can fail if duration_ms field is not checked
      const resultEvent = JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 25615,
        is_error: false,
        result: 'Task completed',
        session_id: 'test-123'
      });
      
      expect(cursorParser.detect(resultEvent)).toBe(true);
    });
    
    it('should reject non-Cursor formats', () => {
      // Purpose: Prevents false positives with other vendor formats
      // This test can fail if detection is too permissive
      
      // Claude format
      const claudeEvent = JSON.stringify({
        type: 'message',
        message: { role: 'assistant', content: 'test' }
      });
      expect(cursorParser.detect(claudeEvent)).toBe(false);
      
      // Amp format
      const ampEvent = JSON.stringify({
        phase: 'start',
        task: 'build'
      });
      expect(cursorParser.detect(ampEvent)).toBe(false);
      
      // Plain text
      expect(cursorParser.detect('Hello world')).toBe(false);
    });
    
    it('should reject malformed JSON', () => {
      // Purpose: Ensures graceful handling of invalid input
      // This test can fail if JSON parsing is not wrapped in try-catch
      expect(cursorParser.detect('{ invalid json')).toBe(false);
      expect(cursorParser.detect('')).toBe(false);
      expect(cursorParser.detect('null')).toBe(false);
    });

    it('should require specific fields for each event type', () => {
      // Purpose: Validates that detection is strict about required fields
      // This test can fail if field validation is incomplete
      
      // System event without subtype should be rejected
      const systemEventMissingSubtype = JSON.stringify({
        type: 'system',
        apiKeySource: 'login',
        session_id: 'test-123'
      });
      expect(cursorParser.detect(systemEventMissingSubtype)).toBe(false);
      
      // Tool call event without call_id should be rejected
      const toolEventMissingCallId = JSON.stringify({
        type: 'tool_call',
        subtype: 'started',
        tool_call: { readToolCall: { args: {} } }
      });
      expect(cursorParser.detect(toolEventMissingCallId)).toBe(false);
      
      // Message event without message field should be rejected
      const messageEventMissingMessage = JSON.stringify({
        type: 'user',
        session_id: 'test-123'
      });
      expect(cursorParser.detect(messageEventMissingMessage)).toBe(false);
      
      // Result event without duration_ms should be rejected
      const resultEventMissingDuration = JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: 'Task completed'
      });
      expect(cursorParser.detect(resultEventMissingDuration)).toBe(false);
    });

    it('should reject invalid event types', () => {
      // Purpose: Ensures only known Cursor event types are accepted
      // This test can fail if the valid types list is incomplete
      const invalidTypeEvent = JSON.stringify({
        type: 'unknown_type',
        session_id: 'test-123'
      });
      expect(cursorParser.detect(invalidTypeEvent)).toBe(false);
    });

    it('should handle edge cases gracefully', () => {
      // Purpose: Tests robustness against edge cases in input data
      // This test can fail if type guards are insufficient
      
      // Null object
      expect(cursorParser.detect('null')).toBe(false);
      
      // Array instead of object
      expect(cursorParser.detect('[]')).toBe(false);
      
      // Empty object
      expect(cursorParser.detect('{}')).toBe(false);
      
      // Object with type but not string
      expect(cursorParser.detect('{"type": 123}')).toBe(false);
      
      // Object with null type
      expect(cursorParser.detect('{"type": null}')).toBe(false);
    });
  });
  
  describe('parser properties', () => {
    it('should have correct vendor name and metadata', () => {
      // Purpose: Ensures proper registry configuration
      // This test can fail if metadata is misconfigured
      expect(cursorParser.vendor).toBe('cursor');
      expect(cursorParser.metadata).toEqual({
        version: '1.0.0',
        supportedVersions: ['1.0'],
        documentationUrl: 'https://docs.cursor.com/cli-reference',
      });
    });
    
    it('should have required parser methods', () => {
      // Purpose: Validates VendorParser interface implementation
      // This test can fail if interface is not fully implemented
      expect(typeof cursorParser.detect).toBe('function');
      expect(typeof cursorParser.parse).toBe('function');
    });

    it('should have consistent vendor identifier', () => {
      // Purpose: Ensures vendor consistency across properties
      // This test can fail if vendor field doesn't match expected value
      expect(cursorParser.vendor).toBe('cursor');
      expect(typeof cursorParser.vendor).toBe('string');
    });
  });
});