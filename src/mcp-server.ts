import { stdin, stdout, stderr } from 'node:process';
import { TextDecoder } from 'node:util';
import { getIconCount, parseKeywordInput, searchIconsByKeywords } from './icon-search';

export interface McpServerOptions {
  readonly name?: string;
  readonly version?: string;
  readonly defaultLimit?: number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: unknown;
}

interface ToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

interface ToolDescription {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

interface McpServer {
  listen(): void;
}

interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

interface JsonRpcNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: unknown;
}

const DEFAULT_OPTIONS: Required<McpServerOptions> = {
  name: 'remix-icon-keyword-server',
  version: '0.2.0',
  defaultLimit: 20
};

const JSONRPC_VERSION = '2.0';
const INITIALIZED_NOTIFICATION: JsonRpcNotification = {
  jsonrpc: JSONRPC_VERSION,
  method: 'notifications/initialized',
  params: {}
};

export function createServer(options: McpServerOptions = {}): McpServer {
  const settings = { ...DEFAULT_OPTIONS, ...options };

  const tools: ToolDescription[] = [
    {
      name: 'search_icons',
      description:
        'Search Remix Icon metadata by providing a comma-separated list of keywords. Only use icon-related keywords as input.',
      inputSchema: {
        type: 'object',
        properties: {
          keywords: {
            type: 'string',
            description:
              'Comma-separated keywords. Natural language descriptions are not accepted. Example: "layout, grid, design".'
          },
          limit: {
            type: 'number',
            description: `Optional maximum number of icons to return (default ${settings.defaultLimit}).`,
            minimum: 1,
            maximum: 100
          }
        },
        required: ['keywords']
      }
    }
  ];

  const decoder = new TextDecoder();
  let buffer = '';

  function listen(): void {
    stdin.on('data', (chunk: Buffer) => {
      buffer += decoder.decode(chunk);
      processBuffer();
    });
  }

  function processBuffer(): void {
    while (buffer.length > 0) {
      if (buffer.startsWith('Content-Length:')) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          return;
        }

        const header = buffer.slice(0, headerEnd);
        const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
        if (!lengthMatch) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }

        const bodyLength = Number.parseInt(lengthMatch[1] ?? '0', 10);
        const totalLength = headerEnd + 4 + bodyLength;
        if (buffer.length < totalLength) {
          return;
        }

        const message = buffer.slice(headerEnd + 4, totalLength);
        buffer = buffer.slice(totalLength);
        handleMessage(message.trim());
        continue;
      }

      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length === 0) {
        continue;
      }

      handleMessage(line);
    }
  }

  function handleMessage(raw: string): void {
    if (!raw) {
      return;
    }

    let payload: JsonRpcRequest;
    try {
      payload = JSON.parse(raw) as JsonRpcRequest;
    } catch (error) {
      sendError(null, -32700, 'Invalid JSON payload');
      logError('Failed to parse incoming message', error);
      return;
    }

    if (payload.jsonrpc !== JSONRPC_VERSION) {
      sendError(payload.id ?? null, -32600, 'Invalid JSON-RPC version');
      return;
    }

    switch (payload.method) {
      case 'initialize':
        handleInitialize(payload);
        break;
      case 'ping':
        sendResponse(payload.id ?? null, {});
        break;
      case 'tools/list':
        sendResponse(payload.id ?? null, { tools });
        break;
      case 'tools/call':
        handleToolCall(payload);
        break;
      case 'shutdown':
        sendResponse(payload.id ?? null, {});
        break;
      default:
        sendError(payload.id ?? null, -32601, `Method ${payload.method} not implemented`);
    }
  }

  function handleInitialize(request: JsonRpcRequest): void {
    sendResponse(request.id ?? null, {
      protocolVersion: '2024-11-05',
      serverInfo: {
        name: settings.name,
        version: settings.version
      },
      capabilities: {
        tools: {
          listChanged: false
        }
      },
      data: {
        iconCount: getIconCount()
      }
    });

    sendNotification(INITIALIZED_NOTIFICATION);
  }

  function handleToolCall(request: JsonRpcRequest): void {
    if (!request.params || typeof request.params !== 'object') {
      sendError(request.id ?? null, -32602, 'Missing tool call parameters');
      return;
    }

    const { name, arguments: args } = request.params as ToolCallParams;
    if (name !== 'search_icons') {
      sendError(request.id ?? null, -32601, `Tool ${name} is not available`);
      return;
    }

    const result = executeSearchTool(args);
    sendResponse(request.id ?? null, result);
  }

  function executeSearchTool(args: ToolCallParams['arguments']): ToolCallResult {
    const keywordsInput = typeof args?.keywords === 'string' ? args.keywords : '';
    const rawLimit =
      typeof args?.limit === 'number' && Number.isFinite(args.limit)
        ? Math.floor(args.limit)
        : settings.defaultLimit;
    const safeLimit = Math.min(Math.max(rawLimit, 1), 100);

    if (!keywordsInput.trim()) {
      return {
        content: [
          {
            type: 'text',
            text: 'The `keywords` argument is required and must be a non-empty comma-separated list of icon keywords.'
          }
        ],
        isError: true
      };
    }

    const parsedKeywords = parseKeywordInput(keywordsInput);
    if (parsedKeywords.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No valid keywords were extracted. Provide icon-related keywords separated by commas.'
          }
        ],
        isError: true
      };
    }

    const results = searchIconsByKeywords(parsedKeywords, safeLimit);
    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No icons matched the provided keywords: ${parsedKeywords.join(', ')}`
          }
        ],
        metadata: {
          keywords: parsedKeywords,
          matches: 0
        }
      };
    }

    const lines: string[] = [
      `Top ${results.length} result(s) for keywords: ${parsedKeywords.join(', ')}`
    ];

    for (const result of results) {
      const { icon, score, matchedKeywords } = result;
      const metadata = [
        `category=${icon.category}`,
        `style=${icon.style}`,
        matchedKeywords.length > 0 ? `matched=[${matchedKeywords.join(', ')}]` : undefined
      ]
        .filter(Boolean)
        .join(' ');
      lines.push(`• ${icon.name} (score=${score} ${metadata}) => ${icon.path}`.trim());
    }

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n')
        }
      ],
      metadata: {
        keywords: parsedKeywords,
        matches: results.length,
        limit: safeLimit
      }
    };
  }

  function sendResponse(id: JsonRpcRequest['id'], result: unknown): void {
    const message = JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      id,
      result
    });
    send(message);
  }

  function sendError(id: JsonRpcRequest['id'], code: number, messageText: string): void {
    const message = JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      id,
      error: {
        code,
        message: messageText
      }
    });
    send(message);
  }

  function sendNotification(payload: unknown): void {
    send(JSON.stringify(payload));
  }

  function send(payload: string): void {
    const content = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`;
    stdout.write(content);
  }

  function logError(message: string, error: unknown): void {
    const output = {
      level: 'error',
      message,
      error: error instanceof Error ? error.message : String(error)
    };
    stderr.write(`${JSON.stringify(output)}\n`);
  }

  return { listen };
}
