import type { ReadStream, WriteStream } from "@/lib/streams/types";
import type { Message, ContentBlock } from "./memory";
import type { ToolDefinition, ToolCall } from "./llm";
import type { ToolHandler, ToolResult } from "./toolRouter";

type AgentConfig = {
  provider?: "anthropic" | "openai";
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  maxIterations?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  toolHandlers?: Record<string, ToolHandler>;
  baseUrl?: string;
};

type AgentLoopNode = ReadStream & WriteStream & {
  registerTool: (definition: ToolDefinition, handler: ToolHandler) => void;
  unregisterTool: (name: string) => void;
  getConversation: () => Message[];
  clearConversation: () => void;
};

export default function agentLoop(set: AgentConfig = {}): AgentLoopNode {
  const listeners: Record<string, Array<(data: any) => void>> = {};

  // Internal state
  const messages: Message[] = [];
  const toolDefinitions: ToolDefinition[] = [...(set.tools || [])];
  const toolHandlers: Record<string, ToolHandler> = { ...(set.toolHandlers || {}) };

  const config = {
    provider: set.provider || "anthropic",
    model: set.model || "claude-sonnet-4-5-20250514",
    maxTokens: set.maxTokens || 4096,
    maxIterations: set.maxIterations || 10,
    apiKey: set.apiKey,
    baseUrl: set.baseUrl,
  };

  // Add system prompt if provided
  if (set.systemPrompt) {
    messages.push({ role: "system", content: set.systemPrompt });
  }

  const node: AgentLoopNode = {
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

    // Agent-specific methods
    registerTool: (definition: ToolDefinition, handler: ToolHandler) => {
      toolDefinitions.push(definition);
      toolHandlers[definition.name] = handler;
    },

    unregisterTool: (name: string) => {
      const index = toolDefinitions.findIndex(t => t.name === name);
      if (index !== -1) {
        toolDefinitions.splice(index, 1);
      }
      delete toolHandlers[name];
    },

    getConversation: () => [...messages],

    clearConversation: () => {
      const systemPrompt = messages[0]?.role === "system" ? messages[0] : null;
      messages.length = 0;
      if (systemPrompt) {
        messages.push(systemPrompt);
      }
    },
  };

  // Main input handler - runs the agentic loop
  node.on("input", async (inputData: { userMessage?: string; message?: Message; apiKey?: string }) => {
    try {
      const apiKey = inputData.apiKey || config.apiKey;
      if (!apiKey) {
        node.emit("error", new Error("API key is required for agent loop"));
        return;
      }

      // Add user message to conversation
      if (inputData.userMessage) {
        messages.push({ role: "user", content: inputData.userMessage });
      } else if (inputData.message) {
        messages.push(inputData.message);
      }

      // Emit that we're starting
      node.emit("iteration", { iteration: 0, phase: "start", messages: [...messages] });

      // Run the agentic loop
      let iteration = 0;
      while (iteration < config.maxIterations) {
        iteration++;

        // Call LLM
        const llmResponse = await callLLM(apiKey, messages, toolDefinitions);

        // Add assistant response to memory
        messages.push({ role: "assistant", content: llmResponse.content });

        // Emit iteration event
        node.emit("iteration", {
          iteration,
          phase: "llm_response",
          content: llmResponse.content,
          toolCalls: llmResponse.toolCalls,
          stopReason: llmResponse.stopReason,
        });

        // Check if we need to execute tools
        if (llmResponse.stopReason !== "tool_use" || llmResponse.toolCalls.length === 0) {
          // No more tool calls, we're done
          const textContent = llmResponse.content
            .filter((block): block is { type: "text"; text: string } => block.type === "text")
            .map(block => block.text)
            .join("\n");

          node.emit("data", {
            response: textContent,
            content: llmResponse.content,
            messages: [...messages],
            iterations: iteration,
            stopReason: llmResponse.stopReason,
          });
          return;
        }

        // Execute tools
        const toolResults = await executeTools(llmResponse.toolCalls);

        // Add tool results to memory
        const toolResultBlocks: ContentBlock[] = toolResults.map(result => ({
          type: "tool_result" as const,
          tool_use_id: result.tool_use_id,
          content: result.content,
          is_error: result.is_error,
        }));
        messages.push({ role: "user", content: toolResultBlocks });

        // Emit tool execution event
        node.emit("iteration", {
          iteration,
          phase: "tool_results",
          toolResults,
        });
      }

      // Max iterations reached
      node.emit("error", new Error(`Max iterations (${config.maxIterations}) reached`));
    } catch (error) {
      node.emit("error", error);
    }
  });

  async function callLLM(
    apiKey: string,
    messages: Message[],
    tools: ToolDefinition[]
  ): Promise<{ content: ContentBlock[]; toolCalls: ToolCall[]; stopReason: string }> {
    if (config.provider === "anthropic") {
      return callAnthropic(apiKey, messages, tools);
    } else if (config.provider === "openai") {
      return callOpenAI(apiKey, messages, tools);
    }
    throw new Error(`Unknown provider: ${config.provider}`);
  }

  async function callAnthropic(
    apiKey: string,
    msgs: Message[],
    tools: ToolDefinition[]
  ): Promise<{ content: ContentBlock[]; toolCalls: ToolCall[]; stopReason: string }> {
    const baseUrl = config.baseUrl || "https://api.anthropic.com";

    // Extract system message if present
    let systemPrompt: string | undefined;
    const filteredMessages = msgs.filter(m => {
      if (m.role === "system") {
        systemPrompt = typeof m.content === "string" ? m.content : (m.content as any[]).map(b => b.text || "").join("\n");
        return false;
      }
      return true;
    });

    const requestBody: any = {
      model: config.model,
      max_tokens: config.maxTokens,
      messages: filteredMessages,
    };

    if (systemPrompt) {
      requestBody.system = systemPrompt;
    }

    if (tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    const toolCalls: ToolCall[] = data.content
      .filter((block: any) => block.type === "tool_use")
      .map((block: any) => ({
        id: block.id,
        name: block.name,
        input: block.input,
      }));

    return {
      content: data.content,
      toolCalls,
      stopReason: data.stop_reason,
    };
  }

  async function callOpenAI(
    apiKey: string,
    msgs: Message[],
    tools: ToolDefinition[]
  ): Promise<{ content: ContentBlock[]; toolCalls: ToolCall[]; stopReason: string }> {
    const baseUrl = config.baseUrl || "https://api.openai.com";

    // Convert messages to OpenAI format
    const openAIMessages = msgs.flatMap((msg): any[] => {
      if (typeof msg.content === "string") {
        return [{ role: msg.role, content: msg.content }];
      }

      const result: any[] = [];
      const textBlocks = (msg.content as any[]).filter(b => b.type === "text");
      const toolUseBlocks = (msg.content as any[]).filter(b => b.type === "tool_use");
      const toolResultBlocks = (msg.content as any[]).filter(b => b.type === "tool_result");

      if (msg.role === "assistant") {
        const assistantMsg: any = {
          role: "assistant",
          content: textBlocks.map(b => b.text).join("\n") || null,
        };
        if (toolUseBlocks.length > 0) {
          assistantMsg.tool_calls = toolUseBlocks.map(b => ({
            id: b.id,
            type: "function",
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          }));
        }
        result.push(assistantMsg);
      } else if (msg.role === "user") {
        if (toolResultBlocks.length > 0) {
          toolResultBlocks.forEach(b => {
            result.push({
              role: "tool",
              content: b.content,
              tool_call_id: b.tool_use_id,
            });
          });
        }
        if (textBlocks.length > 0) {
          result.push({ role: "user", content: textBlocks.map(b => b.text).join("\n") });
        }
      } else {
        result.push({ role: msg.role, content: textBlocks.map(b => b.text).join("\n") });
      }

      return result;
    });

    const requestBody: any = {
      model: config.model.startsWith("gpt") ? config.model : "gpt-4o",
      max_tokens: config.maxTokens,
      messages: openAIMessages,
    };

    if (tools.length > 0) {
      requestBody.tools = tools.map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }));
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const content: ContentBlock[] = [];
    const toolCalls: ToolCall[] = [];

    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      choice.message.tool_calls.forEach((tc: any) => {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      });
    }

    return {
      content,
      toolCalls,
      stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : choice.finish_reason,
    };
  }

  async function executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(
      toolCalls.map(async (toolCall): Promise<ToolResult> => {
        const handler = toolHandlers[toolCall.name];

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
  }

  return node;
}
