import agentLoop from "@/lib/tasks/nodes/agentLoop";
import type { ToolDefinition } from "@/lib/tasks/nodes/llm";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("agentLoop node", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("initialization", () => {
    it("should create an agentLoop node with correct interface", () => {
      const node = agentLoop();

      expect(typeof node.pipe).toBe("function");
      expect(typeof node.resume).toBe("function");
      expect(typeof node.pause).toBe("function");
      expect(typeof node.on).toBe("function");
      expect(typeof node.emit).toBe("function");
      expect(typeof node.write).toBe("function");
      expect(typeof node.end).toBe("function");
      expect(typeof node.registerTool).toBe("function");
      expect(typeof node.unregisterTool).toBe("function");
      expect(typeof node.getConversation).toBe("function");
      expect(typeof node.clearConversation).toBe("function");
      expect(node.status).toBe("paused");
    });

    it("should include system prompt in conversation", () => {
      const node = agentLoop({ systemPrompt: "You are helpful" });

      const conversation = node.getConversation();
      expect(conversation[0]).toEqual({
        role: "system",
        content: "You are helpful",
      });
    });
  });

  describe("simple conversation (no tools)", () => {
    it("should handle a simple user message and response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_123",
          content: [{ type: "text", text: "Hello! How can I help?" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 8 },
        }),
      });

      const node = agentLoop({ provider: "anthropic" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({ apiKey: "test-key", userMessage: "Hello" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          response: "Hello! How can I help?",
          iterations: 1,
          stopReason: "end_turn",
        })
      );

      // Check conversation was stored
      const conversation = node.getConversation();
      expect(conversation).toHaveLength(2);
      expect(conversation[0]).toEqual({ role: "user", content: "Hello" });
      expect(conversation[1].role).toBe("assistant");
    });
  });

  describe("tool calling loop", () => {
    it("should execute tool and continue conversation", async () => {
      // First call: LLM wants to use a tool
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_1",
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

      // Second call: LLM gives final response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_2",
          content: [{ type: "text", text: "The weather in SF is sunny and 72°F." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 30, output_tokens: 15 },
        }),
      });

      const weatherTool: ToolDefinition = {
        name: "get_weather",
        description: "Get weather",
        input_schema: {
          type: "object",
          properties: { location: { type: "string" } },
          required: ["location"],
        },
      };

      const node = agentLoop({
        provider: "anthropic",
        tools: [weatherTool],
        toolHandlers: {
          get_weather: (input) => `Weather in ${input.location}: sunny, 72°F`,
        },
      });

      const dataHandler = jest.fn();
      const iterationHandler = jest.fn();
      node.on("data", dataHandler);
      node.on("iteration", iterationHandler);

      node.write({ apiKey: "test-key", userMessage: "What's the weather in SF?" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalledTimes(2);

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          response: "The weather in SF is sunny and 72°F.",
          iterations: 2,
        })
      );

      // Check iteration events were emitted
      expect(iterationHandler).toHaveBeenCalled();
    });

    it("should handle multiple tool calls in one response", async () => {
      // LLM wants to use multiple tools
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_1",
          content: [
            { type: "tool_use", id: "t1", name: "get_weather", input: { location: "SF" } },
            { type: "tool_use", id: "t2", name: "get_weather", input: { location: "NYC" } },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 30 },
        }),
      });

      // Final response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_2",
          content: [{ type: "text", text: "SF is sunny, NYC is cloudy." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 50, output_tokens: 10 },
        }),
      });

      const node = agentLoop({
        provider: "anthropic",
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            input_schema: { type: "object", properties: { location: { type: "string" } } },
          },
        ],
        toolHandlers: {
          get_weather: (input) =>
            input.location === "SF" ? "sunny" : "cloudy",
        },
      });

      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({ apiKey: "test-key", userMessage: "Weather in SF and NYC?" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          response: "SF is sunny, NYC is cloudy.",
        })
      );
    });
  });

  describe("max iterations", () => {
    it("should stop after max iterations", async () => {
      // Always return tool_use to force loop
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "msg",
          content: [
            { type: "tool_use", id: "t1", name: "infinite_tool", input: {} },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      });

      const node = agentLoop({
        provider: "anthropic",
        maxIterations: 3,
        tools: [
          {
            name: "infinite_tool",
            description: "A tool that always gets called",
            input_schema: { type: "object", properties: {} },
          },
        ],
        toolHandlers: {
          infinite_tool: () => "result",
        },
      });

      const errorHandler = jest.fn();
      node.on("error", errorHandler);

      node.write({ apiKey: "test-key", userMessage: "Go" });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Max iterations (3) reached",
        })
      );

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("registerTool", () => {
    it("should allow registering tools after creation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_1",
          content: [
            { type: "tool_use", id: "t1", name: "custom_tool", input: { x: 5 } },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_2",
          content: [{ type: "text", text: "Result is 10" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 20, output_tokens: 5 },
        }),
      });

      const node = agentLoop({ provider: "anthropic" });

      // Register tool after creation
      node.registerTool(
        {
          name: "custom_tool",
          description: "Doubles a number",
          input_schema: { type: "object", properties: { x: { type: "number" } } },
        },
        (input) => String(input.x * 2)
      );

      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({ apiKey: "test-key", userMessage: "Double 5" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          response: "Result is 10",
        })
      );
    });
  });

  describe("clearConversation", () => {
    it("should clear conversation history", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg",
          content: [{ type: "text", text: "Hi!" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
      });

      const node = agentLoop({ provider: "anthropic" });

      node.write({ apiKey: "test-key", userMessage: "Hello" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(node.getConversation().length).toBeGreaterThan(0);

      node.clearConversation();

      expect(node.getConversation()).toEqual([]);
    });

    it("should preserve system prompt when clearing", async () => {
      const node = agentLoop({
        provider: "anthropic",
        systemPrompt: "You are helpful",
      });

      node.clearConversation();

      const conversation = node.getConversation();
      expect(conversation.length).toBe(1);
      expect(conversation[0].role).toBe("system");
    });
  });

  describe("error handling", () => {
    it("should emit error when API key is missing", async () => {
      const node = agentLoop();
      const errorHandler = jest.fn();
      node.on("error", errorHandler);

      node.write({ userMessage: "Hello" });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "API key is required for agent loop",
        })
      );
    });

    it("should emit error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      const node = agentLoop({ provider: "anthropic" });
      const errorHandler = jest.fn();
      node.on("error", errorHandler);

      node.write({ apiKey: "test-key", userMessage: "Hello" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Anthropic API error"),
        })
      );
    });

    it("should handle tool errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_1",
          content: [
            { type: "tool_use", id: "t1", name: "failing_tool", input: {} },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "msg_2",
          content: [{ type: "text", text: "The tool failed, but I handled it." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 30, output_tokens: 10 },
        }),
      });

      const node = agentLoop({
        provider: "anthropic",
        tools: [
          {
            name: "failing_tool",
            description: "Always fails",
            input_schema: { type: "object", properties: {} },
          },
        ],
        toolHandlers: {
          failing_tool: () => {
            throw new Error("Tool crashed!");
          },
        },
      });

      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({ apiKey: "test-key", userMessage: "Run the failing tool" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still complete despite tool error
      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          response: "The tool failed, but I handled it.",
        })
      );
    });
  });

  describe("openai provider", () => {
    it("should work with OpenAI provider", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          choices: [
            {
              message: { role: "assistant", content: "Hello from GPT!" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const node = agentLoop({ provider: "openai", model: "gpt-4o" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({ apiKey: "test-key", userMessage: "Hello" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.any(Object)
      );

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          response: "Hello from GPT!",
        })
      );
    });
  });
});
