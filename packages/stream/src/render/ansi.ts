/**
 * ANSI renderer for AgentEvents
 *
 * Renders events with ANSI color codes and formatting for terminal output.
 * Supports role-based colors, tool tracking, and markdown-like formatting.
 */

import kleur from 'kleur';
import type { AgentEvent, ToolEvent } from '../types.js';
import type { Renderer, RenderOptions, RenderContext } from './types.js';

/**
 * Safe JSON stringify that handles circular references
 */
function safeStringify(obj: unknown, indent: number = 2): string {
  const seen = new WeakSet();

  try {
    return JSON.stringify(
      obj,
      (key, value) => {
        // Handle primitive types
        if (typeof value !== 'object' || value === null) {
          return value;
        }

        // Check for circular reference
        if (seen.has(value)) {
          return '[Circular]';
        }

        seen.add(value);
        return value;
      },
      indent,
    );
  } catch (error) {
    // Fallback for any other JSON.stringify errors
    return `[Error stringifying object: ${error instanceof Error ? error.message : String(error)}]`;
  }
}

/**
 * ANSI terminal renderer implementation
 *
 * Provides colorful terminal output with icons, formatting, and
 * visual hierarchy for agent events. Supports 256-color and truecolor
 * terminals with automatic color degradation.
 *
 * @example
 * ```typescript
 * // Create renderer with options
 * const renderer = new AnsiRenderer({
 *   collapseTools: true,
 *   hideTimestamps: false,
 *   colors: true
 * });
 *
 * // Render events
 * renderer.start();
 * for (const event of events) {
 *   const output = renderer.render(event);
 *   if (output) process.stdout.write(output);
 * }
 * renderer.end();
 * ```
 *
 * @category Renderers
 * @since 0.1.0
 */
export class AnsiRenderer implements Renderer {
  private context: RenderContext;

  constructor(private options: RenderOptions) {
    // Enable colors by default unless explicitly disabled
    if (options.colorDisabled) {
      kleur.enabled = false;
    } else {
      // Always enable colors unless explicitly disabled
      // This ensures consistent behavior in test environments
      kleur.enabled = true;
    }

    this.context = {
      toolStack: new Map(),
      messageCount: 0,
      renderStartTime: Date.now(),
    };
  }

  /**
   * Render a single event to ANSI-formatted string
   */
  render(event: AgentEvent): string {
    // Update context
    this.context.previousEvent = event;

    switch (event.t) {
      case 'msg':
        return this.renderMessage(event);
      case 'tool':
        return this.renderTool(event);
      case 'cost':
        return this.renderCost(event);
      case 'error':
        return this.renderError(event);
      case 'debug':
        return this.renderDebug(event);
      default:
        // Handle unknown event types gracefully
        return this.renderUnknown(event);
    }
  }

  /**
   * Render a message event with role-based formatting
   */
  private renderMessage(event: AgentEvent & { t: 'msg' }): string {
    this.context.messageCount++;

    // Handle null/undefined role
    const role = event.role || 'unknown';

    // Role-based icons
    const roleIcon =
      {
        user: '👤',
        assistant: '🤖',
        system: '⚙️',
      }[role] || '❓';

    // Role-based colors
    const roleColor =
      {
        user: kleur.bold().cyan,
        assistant: kleur.bold().green,
        system: kleur.bold().yellow,
      }[role] || kleur.bold().white;

    const header = roleColor(`${roleIcon} ${role}:`);
    const content = this.formatMessageContent(event.text || '');

    // Add extra newline for spacing unless in compact mode
    const spacing = this.options.compactMode ? '\n' : '\n\n';

    return `${header}\n${content}${spacing}`;
  }

  /**
   * Render a tool event with phase-based formatting
   */
  private renderTool(event: AgentEvent & { t: 'tool' }): string {
    if (this.options.hideTools) return '';

    switch (event.phase) {
      case 'start':
        return this.renderToolStart(event as ToolEvent & { phase: 'start' });
      case 'stdout':
      case 'stderr':
        return this.renderToolOutput(
          event as ToolEvent & { phase: 'stdout' | 'stderr' },
        );
      case 'end':
        return this.renderToolEnd(event as ToolEvent & { phase: 'end' });
      default:
        // Handle unknown phases gracefully
        return kleur.dim().gray(`  │ ${event.phase}: ${event.text || ''}\n`);
    }
  }

  /**
   * Extract key parameters from tool input
   */
  private extractToolParams(
    toolName: string,
    inputText: string | undefined,
  ): string {
    if (!inputText) return '';

    try {
      const input = JSON.parse(inputText);

      // Format based on tool name
      switch (toolName.toLowerCase()) {
        case 'write':
        case 'edit':
        case 'multiedit':
          if (input.file_path) {
            return ` → ${input.file_path}`;
          }
          break;

        case 'read':
        case 'notebookread':
          // Handle both 'file_path' (Claude) and 'path' (Cursor)
          if (input.file_path || input.path || input.notebook_path) {
            const path = input.file_path || input.path || input.notebook_path;
            const preview = input.limit ? ` (${input.limit} lines)` : '';
            return ` → ${path}${preview}`;
          }
          break;

        case 'bash':
          if (input.command) {
            // Truncate long commands
            const cmd =
              input.command.length > 50
                ? input.command.substring(0, 47) + '...'
                : input.command;
            return ` → ${cmd}`;
          }
          break;

        case 'glob':
          if (input.pattern) {
            return ` → ${input.pattern}`;
          }
          break;

        case 'grep':
          if (input.pattern) {
            const path = input.path ? ` in ${input.path}` : '';
            return ` → "${input.pattern}"${path}`;
          }
          break;

        case 'ls':
          if (input.path) {
            return ` → ${input.path}`;
          }
          break;

        case 'webfetch':
          if (input.url) {
            // Show just the domain for brevity
            try {
              const url = new URL(input.url);
              return ` → ${url.hostname}`;
            } catch {
              return ` → ${input.url}`;
            }
          }
          break;

        case 'websearch':
          if (input.query) {
            const query =
              input.query.length > 30
                ? input.query.substring(0, 27) + '...'
                : input.query;
            return ` → "${query}"`;
          }
          break;

        case 'task':
          if (input.description) {
            return ` → ${input.description}`;
          }
          break;

        case 'todowrite':
          if (input.todos && Array.isArray(input.todos)) {
            return ` → ${input.todos.length} items`;
          }
          break;
      }

      // Generic fallback - show first meaningful value
      const keys = Object.keys(input);
      if (keys.length > 0) {
        const firstKey = keys[0];
        const value = String(input[firstKey]);
        if (value.length > 40) {
          return ` → ${firstKey}: ${value.substring(0, 37)}...`;
        }
        return ` → ${firstKey}: ${value}`;
      }
    } catch {
      // If JSON parsing fails, just return empty
    }

    return '';
  }

  /**
   * Render tool start phase
   */
  private renderToolStart(event: ToolEvent & { phase: 'start' }): string {
    // Track tool state
    this.context.toolStack.set(event.name, {
      name: event.name,
      startTime: Date.now(),
      outputLines: [],
      collapsed: this.options.collapseTools || false,
    });

    const startIcon = kleur.dim().italic('🔧');
    // Escape ANSI codes in tool name
    // eslint-disable-next-line no-control-regex
    const escapedName = event.name.replace(/\x1b/g, '\\x1b');
    const toolName = kleur.bold().blue(escapedName);

    // Extract and format key parameters
    const params = this.extractToolParams(event.name, event.text);
    const formattedParams = params ? kleur.dim().cyan(params) : '';

    return `${startIcon} ${toolName}${formattedParams}\n`;
  }

  /**
   * Render tool output (stdout/stderr)
   */
  private renderToolOutput(
    event: ToolEvent & { phase: 'stdout' | 'stderr' },
  ): string {
    const toolState = this.context.toolStack.get(event.name);
    if (!toolState) return '';

    // If collapsed, store output for later
    if (toolState.collapsed) {
      toolState.outputLines.push(event.text || '');
      return '';
    }

    // Different prefix for stderr
    const prefix =
      event.phase === 'stderr'
        ? kleur.dim().red('  │ ')
        : kleur.dim().gray('  │ ');

    // Handle multi-line output
    const lines = (event.text || '').split('\n');
    return lines.map(line => `${prefix}${line}`).join('\n') + '\n';
  }

  /**
   * Render tool end phase
   */
  private renderToolEnd(event: ToolEvent & { phase: 'end' }): string {
    const toolState = this.context.toolStack.get(event.name);
    if (!toolState) return '';

    const duration = Date.now() - toolState.startTime;
    const exitCode = event.exitCode || 0;

    let result = '';

    // If collapsed, show summary
    if (toolState.collapsed && toolState.outputLines.length > 0) {
      const lineCount = toolState.outputLines.length;
      const summary = toolState.outputLines.join('\n');
      const truncated = summary.slice(0, 100);
      const suffix = summary.length > 100 ? '...' : '';
      result += kleur
        .dim()
        .gray(`  └─ ${truncated}${suffix} (${lineCount} lines)\n`);
    }

    // Status indicator with more descriptive text
    const statusIcon = exitCode === 0 ? '✅' : '❌';
    const statusText =
      exitCode === 0 ? 'completed' : `failed (exit ${exitCode})`;
    const statusColor = exitCode === 0 ? kleur.green : kleur.red;
    const durationText = kleur.dim().gray(`${duration}ms`);
    // eslint-disable-next-line no-control-regex
    const escapedName = event.name.replace(/\x1b/g, '\\x1b');

    result += `${statusIcon} ${statusColor(escapedName)} ${kleur.dim(statusText)} ${durationText}\n`;

    // Clean up tool state
    this.context.toolStack.delete(event.name);

    return result;
  }

  /**
   * Render a cost event
   */
  private renderCost(event: AgentEvent & { t: 'cost' }): string {
    if (this.options.hideCost) return '';

    const costIcon = '💰';
    const costValue =
      event.deltaUsd < 0
        ? `-$${Math.abs(event.deltaUsd).toFixed(4)}`
        : `$${event.deltaUsd.toFixed(4)}`;
    const costText = kleur.dim().yellow(costValue);

    return `${costIcon} ${costText}\n`;
  }

  /**
   * Render an error event
   */
  private renderError(event: AgentEvent & { t: 'error' }): string {
    const errorIcon = '🚨';
    const message = event.message || 'Unknown error';
    const errorText = kleur.bold().red(message);

    return `${errorIcon} ${errorText}\n`;
  }

  /**
   * Render a debug event
   */
  private renderDebug(event: AgentEvent & { t: 'debug' }): string {
    if (this.options.hideDebug) return '';

    const debugIcon = kleur.dim().gray('🐛');
    const debugText = kleur.dim().gray(safeStringify(event.raw));

    return `${debugIcon} ${debugText}\n`;
  }

  /**
   * Render unknown event types
   */
  private renderUnknown(event: { t: string; [key: string]: unknown }): string {
    return kleur
      .dim()
      .gray(`❓ Unknown event type: ${JSON.stringify(event)}\n`);
  }

  /**
   * Format message content with markdown-like formatting
   */
  private formatMessageContent(text: string): string {
    // Handle null/undefined gracefully
    if (!text) return '  ';

    // Escape ANSI escape sequences to prevent injection
    // eslint-disable-next-line no-control-regex
    const escapedText = text.replace(/\x1b/g, '\\x1b');

    const lines = escapedText.split('\n');
    let inCodeBlock = false;

    return lines
      .map(line => {
        // Handle code blocks
        if (line.startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          return `  ${kleur.dim(line)}`;
        }

        // If we're inside a code block, just dim the content
        if (inCodeBlock) {
          return `  ${kleur.dim(line)}`;
        }

        // Process inline formatting with a more sophisticated approach
        let formatted = line;

        // First, handle inline code to protect it from other formatting
        const codeSegments: { placeholder: string; content: string }[] = [];
        formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
          const placeholder = `__CODE_${codeSegments.length}__`;
          codeSegments.push({ placeholder, content: kleur.yellow(code) });
          return placeholder;
        });

        // Handle bold with potential nested content using a more specific pattern
        // This regex looks for ** followed by content that may include * but not **
        formatted = formatted.replace(
          /\*\*((?:[^*]|\*(?!\*))+)\*\*/g,
          (_, content) => {
            // Process italic within bold
            const withItalic = content.replace(
              /\*([^*]+)\*/g,
              (_: string, text: string) => kleur.italic(text),
            );
            return kleur.bold(withItalic);
          },
        );

        // Handle remaining standalone italic (not within bold)
        formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, text) =>
          kleur.italic(text),
        );

        // Restore code segments
        codeSegments.forEach(({ placeholder, content }) => {
          formatted = formatted.replace(placeholder, content);
        });

        // Indent message content
        return `  ${formatted}`;
      })
      .join('\n');
  }

  /**
   * Render multiple events in a batch
   */
  renderBatch(events: AgentEvent[]): string {
    return events.map(event => this.render(event)).join('');
  }

  /**
   * Flush any pending state
   */
  flush(): string {
    // Handle any pending tool output
    const pendingTools = Array.from(this.context.toolStack.values());

    if (pendingTools.length === 0) {
      return '';
    }

    // Warn about tools that didn't complete
    const warnings = pendingTools
      .map(tool => `⚠️  ${kleur.yellow('Tool still running:')} ${tool.name}`)
      .join('\n');

    return warnings ? warnings + '\n' : '';
  }
}
