import llm from "@/lib/tasks/nodes/llm";
import type { Message } from "@/lib/tasks/nodes/memory";
import type { ToolDefinition } from "@/lib/tasks/nodes/llm";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("llm node", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("initialization", () => {
    it("should create an llm node with correct interface", () => {
      const node = llm();

      expect(typeof node.pipe).toBe("function");
      expect(typeof node.resume).toBe("function");
      expect(typeof node.pause).toBe("function");
      expect(typeof node.on).toBe("function");
      expect(typeof node.emit).toBe("function");
      expect(typeof node.write).toBe("function");
      expect(typeof node.end).toBe("function");
      expect(node.status).toBe("paused");
    });

    it("should accept configuration options", () => {
      const node = llm({
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250514",
        maxTokens: 2048,
      });

      expect(node).toBeDefined();
    });
  });

  describe("anthropic provider", () => {
    it("should call Anthropic API with correct format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_123",
          content: [{ type: "text", text: "Hello!" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const node = llm({ provider: "anthropic", model: "claude-sonnet-4-5-20250514" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({
        apiKey: "test-key",
        messages: [{ role: "user", content: "Hello" }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-api-key": "test-key",
            "anthropic-version": "2023-06-01",
          }),
        })
      );

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Hello!",
          stopReason: "end_turn",
          toolCalls: [],
        })
      );
    });

    it("should extract system message from messages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_123",
          content: [{ type: "text", text: "Response" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const node = llm({ provider: "anthropic" });

      node.write({
        apiKey: "test-key",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.system).toBe("You are helpful");
      expect(callBody.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("should include tools in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_123",
          content: [{ type: "text", text: "Response" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const tools: ToolDefinition[] = [
        {
          name: "get_weather",
          description: "Get weather",
          input_schema: {
            type: "object",
            properties: { location: { type: "string" } },
            required: ["location"],
          },
        },
      ];

      const node = llm({ provider: "anthropic", tools });

      node.write({
        apiKey: "test-key",
        messages: [{ role: "user", content: "What's the weather?" }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.tools).toEqual(tools);
    });

    it("should parse tool use response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_123",
          content: [
            { type: "text", text: "Let me check the weather" },
            {
              type: "tool_use",
              id: "tool_1",
              name: "get_weather",
              input: { location: "San Francisco" },
            },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      });

      const node = llm({ provider: "anthropic" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({
        apiKey: "test-key",
        messages: [{ role: "user", content: "What's the weather in SF?" }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          stopReason: "tool_use",
          toolCalls: [
            {
              id: "tool_1",
              name: "get_weather",
              input: { location: "San Francisco" },
            },
          ],
        })
      );
    });

    it("should handle API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const node = llm({ provider: "anthropic" });
      const errorHandler = jest.fn();
      node.on("error", errorHandler);

      node.write({
        apiKey: "bad-key",
        messages: [{ role: "user", content: "Hello" }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Anthropic API error: 401"),
        })
      );
    });
  });

  describe("openai provider", () => {
    it("should call OpenAI API with correct format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          choices: [
            {
              message: { role: "assistant", content: "Hello!" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const node = llm({ provider: "openai", model: "gpt-4o" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({
        apiKey: "test-key",
        messages: [{ role: "user", content: "Hello" }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "Authorization": "Bearer test-key",
          }),
        })
      );

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Hello!",
          stopReason: "stop",
        })
      );
    });

    it("should convert tools to OpenAI format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          choices: [
            {
              message: { role: "assistant", content: "Response" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const tools: ToolDefinition[] = [
        {
          name: "get_weather",
          description: "Get weather",
          input_schema: {
            type: "object",
            properties: { location: { type: "string" } },
          },
        },
      ];

      const node = llm({ provider: "openai", model: "gpt-4o", tools });

      node.write({
        apiKey: "test-key",
        messages: [{ role: "user", content: "Hello" }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.tools).toEqual([
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather",
            parameters: {
              type: "object",
              properties: { location: { type: "string" } },
            },
          },
        },
      ]);
    });

    it("should parse OpenAI tool call response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_123",
                    type: "function",
                    function: {
                      name: "get_weather",
                      arguments: '{"location": "SF"}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      });

      const node = llm({ provider: "openai", model: "gpt-4o" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({
        apiKey: "test-key",
        messages: [{ role: "user", content: "Weather?" }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          stopReason: "tool_use",
          toolCalls: [
            {
              id: "call_123",
              name: "get_weather",
              input: { location: "SF" },
            },
          ],
        })
      );
    });
  });

  describe("error handling", () => {
    it("should emit error when API key is missing", async () => {
      const node = llm();
      const errorHandler = jest.fn();
      node.on("error", errorHandler);

      node.write({
        messages: [{ role: "user", content: "Hello" }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "API key is required for LLM node",
        })
      );
    });

    it("should emit error for network failures", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const node = llm();
      const errorHandler = jest.fn();
      node.on("error", errorHandler);

      node.write({
        apiKey: "test-key",
        messages: [{ role: "user", content: "Hello" }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Network error",
        })
      );
    });
  });

  describe("custom base URL", () => {
    it("should use custom base URL for Anthropic", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_123",
          content: [{ type: "text", text: "Response" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const node = llm({
        provider: "anthropic",
        baseUrl: "https://custom.api.com",
      });

      node.write({
        apiKey: "test-key",
        messages: [{ role: "user", content: "Hello" }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://custom.api.com/v1/messages",
        expect.any(Object)
      );
    });
  });
});
