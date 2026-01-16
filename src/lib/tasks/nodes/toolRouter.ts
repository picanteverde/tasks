import type { ReadStream, WriteStream } from "@/lib/streams/types";
import type { ToolCall } from "./llm";
import type { ContentBlock } from "./memory";

export type ToolHandler = (input: Record<string, any>) => Promise<string> | string;

export type ToolResult = {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

type ToolRouterConfig = {
  tools?: Record<string, ToolHandler>;
};

type ToolRouterNode = ReadStream & WriteStream & {
  registerTool: (name: string, handler: ToolHandler) => void;
  unregisterTool: (name: string) => void;
  getTools: () => string[];
};

export default function toolRouter(set: ToolRouterConfig = {}): ToolRouterNode {
  const listeners: Record<string, Array<(data: any) => void>> = {};
  const tools: Record<string, ToolHandler> = { ...set.tools };

  const node: ToolRouterNode = {
    status: "paused" as "open" | "paused" | "error" | "closed",

    // WriteStream methods
    write: (data: any) => {
      node.emit("input", data);
    },
    end: () => {
      node.emit("close");
    },

    // ReadStream methods
    pipe: (writeStream: WriteStream) => {
      node.on("data", (data) => {
        writeStream.write(data);
      });
      node.on("error", (error) => {
        writeStream.emit("error", error);
      });
      node.on("close", () => {
        writeStream.emit("close");
      });
      node.resume();
    },
    resume: () => {
      node.status = "open";
    },
    pause: () => {
      node.status = "paused";
    },

    // EventEmitter methods
    on: (event: string, handler: (data: any) => void) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(handler);
    },
    emit: (event: string, data?: any) => {
      if (listeners[event]) {
        listeners[event].forEach(handler => handler(data));
      }
    },

    // Tool Router specific methods
    registerTool: (name: string, handler: ToolHandler) => {
      tools[name] = handler;
    },

    unregisterTool: (name: string) => {
      delete tools[name];
    },

    getTools: () => Object.keys(tools),
  };

  // Handle incoming tool calls
  node.on("input", async (inputData: { toolCalls: ToolCall[] }) => {
    const toolCalls = inputData.toolCalls || [];

    if (toolCalls.length === 0) {
      // No tool calls, pass through
      node.emit("data", { results: [], hasToolCalls: false });
      return;
    }

    // Execute all tool calls in parallel
    const results: ToolResult[] = await Promise.all(
      toolCalls.map(async (toolCall): Promise<ToolResult> => {
        const handler = tools[toolCall.name];

        if (!handler) {
          return {
            tool_use_id: toolCall.id,
            content: `Error: Tool "${toolCall.name}" not found`,
            is_error: true,
          };
        }

        try {
          const result = await handler(toolCall.input);
          return {
            tool_use_id: toolCall.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          };
        } catch (error) {
          return {
            tool_use_id: toolCall.id,
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            is_error: true,
          };
        }
      })
    );

    // Convert results to content blocks for Anthropic format
    const contentBlocks: ContentBlock[] = results.map(result => ({
      type: "tool_result" as const,
      tool_use_id: result.tool_use_id,
      content: result.content,
      is_error: result.is_error,
    }));

    node.emit("data", {
      results,
      contentBlocks,
      hasToolCalls: true,
    });
  });

  return node;
}
