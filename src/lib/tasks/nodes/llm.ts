import type { ReadStream, WriteStream } from "@/lib/streams/types";
import type { Message, ContentBlock } from "./memory";

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, any>;
};

type LLMConfig = {
  provider?: "anthropic" | "openai";
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  tools?: ToolDefinition[];
  baseUrl?: string;
};

type LLMNode = ReadStream & WriteStream;

// Anthropic API types
type AnthropicRequest = {
  model: string;
  max_tokens: number;
  messages: Message[];
  tools?: ToolDefinition[];
  system?: string;
};

type AnthropicResponse = {
  id: string;
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: { input_tokens: number; output_tokens: number };
};

// OpenAI API types
type OpenAIMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

type OpenAIRequest = {
  model: string;
  max_tokens: number;
  messages: OpenAIMessage[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }>;
};

type OpenAIResponse = {
  id: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: "stop" | "tool_calls" | "length";
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
};

function convertToOpenAIMessages(messages: Message[]): OpenAIMessage[] {
  return messages.flatMap((msg): OpenAIMessage[] => {
    if (typeof msg.content === "string") {
      return [{ role: msg.role, content: msg.content }];
    }

    // Handle content blocks (Anthropic format to OpenAI)
    const result: OpenAIMessage[] = [];
    const textBlocks = msg.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
    const toolUseBlocks = msg.content.filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, any> } => b.type === "tool_use");
    const toolResultBlocks = msg.content.filter((b): b is { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean } => b.type === "tool_result");

    if (msg.role === "assistant") {
      const assistantMsg: OpenAIMessage = {
        role: "assistant",
        content: textBlocks.map(b => b.text).join("\n") || null,
      };
      if (toolUseBlocks.length > 0) {
        assistantMsg.tool_calls = toolUseBlocks.map(b => ({
          id: b.id,
          type: "function" as const,
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));
      }
      result.push(assistantMsg);
    } else if (msg.role === "user") {
      // Tool results come as user messages in Anthropic format
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
}

function convertOpenAIResponseToAnthropic(response: OpenAIResponse): { content: ContentBlock[]; stopReason: string; toolCalls: ToolCall[] } {
  const choice = response.choices[0];
  const content: ContentBlock[] = [];
  const toolCalls: ToolCall[] = [];

  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    choice.message.tool_calls.forEach(tc => {
      const toolUse: ContentBlock = {
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      };
      content.push(toolUse);
      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      });
    });
  }

  return {
    content,
    stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : choice.finish_reason,
    toolCalls,
  };
}

function convertToolsToOpenAI(tools: ToolDefinition[]): OpenAIRequest["tools"] {
  return tools.map(tool => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

export default function llm(set: LLMConfig = {}): LLMNode {
  const listeners: Record<string, Array<(data: any) => void>> = {};

  const config = {
    provider: set.provider || "anthropic",
    model: set.model || "claude-sonnet-4-5-20250514",
    maxTokens: set.maxTokens || 4096,
    tools: set.tools || [],
    apiKey: set.apiKey,
    baseUrl: set.baseUrl,
  };

  const node: LLMNode = {
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
  };

  // Handle input and make LLM API calls
  node.on("input", async (inputData: { messages: Message[]; apiKey?: string; tools?: ToolDefinition[] }) => {
    try {
      const apiKey = inputData.apiKey || config.apiKey;
      if (!apiKey) {
        node.emit("error", new Error("API key is required for LLM node"));
        return;
      }

      const tools = inputData.tools || config.tools;
      const messages = inputData.messages || [];

      if (config.provider === "anthropic") {
        await callAnthropic(apiKey, messages, tools);
      } else if (config.provider === "openai") {
        await callOpenAI(apiKey, messages, tools);
      } else {
        node.emit("error", new Error(`Unknown provider: ${config.provider}`));
      }
    } catch (error) {
      node.emit("error", error);
    }
  });

  async function callAnthropic(apiKey: string, messages: Message[], tools: ToolDefinition[]) {
    const baseUrl = config.baseUrl || "https://api.anthropic.com";

    // Extract system message if present
    let systemPrompt: string | undefined;
    const filteredMessages = messages.filter(m => {
      if (m.role === "system") {
        systemPrompt = typeof m.content === "string" ? m.content : m.content.map(b => (b as any).text || "").join("\n");
        return false;
      }
      return true;
    });

    const requestBody: AnthropicRequest = {
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

    const data: AnthropicResponse = await response.json();

    // Extract tool calls from response
    const toolCalls: ToolCall[] = data.content
      .filter((block): block is { type: "tool_use"; id: string; name: string; input: Record<string, any> } => block.type === "tool_use")
      .map(block => ({
        id: block.id,
        name: block.name,
        input: block.input,
      }));

    // Extract text response
    const textContent = data.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map(block => block.text)
      .join("\n");

    node.emit("data", {
      content: data.content,
      text: textContent,
      toolCalls,
      stopReason: data.stop_reason,
      usage: data.usage,
      raw: data,
    });
  }

  async function callOpenAI(apiKey: string, messages: Message[], tools: ToolDefinition[]) {
    const baseUrl = config.baseUrl || "https://api.openai.com";

    const openAIMessages = convertToOpenAIMessages(messages);

    const requestBody: OpenAIRequest = {
      model: config.model.startsWith("gpt") ? config.model : "gpt-4o",
      max_tokens: config.maxTokens,
      messages: openAIMessages,
    };

    if (tools.length > 0) {
      requestBody.tools = convertToolsToOpenAI(tools);
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

    const data: OpenAIResponse = await response.json();
    const { content, stopReason, toolCalls } = convertOpenAIResponseToAnthropic(data);

    // Extract text response
    const textContent = content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map(block => block.text)
      .join("\n");

    node.emit("data", {
      content,
      text: textContent,
      toolCalls,
      stopReason,
      usage: { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens },
      raw: data,
    });
  }

  return node;
}
