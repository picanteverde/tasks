import toolRouter from "@/lib/tasks/nodes/toolRouter";
import type { ToolCall } from "@/lib/tasks/nodes/llm";

describe("toolRouter node", () => {
  describe("initialization", () => {
    it("should create a toolRouter node with correct interface", () => {
      const node = toolRouter();

      expect(typeof node.pipe).toBe("function");
      expect(typeof node.resume).toBe("function");
      expect(typeof node.pause).toBe("function");
      expect(typeof node.on).toBe("function");
      expect(typeof node.emit).toBe("function");
      expect(typeof node.write).toBe("function");
      expect(typeof node.end).toBe("function");
      expect(typeof node.registerTool).toBe("function");
      expect(typeof node.unregisterTool).toBe("function");
      expect(typeof node.getTools).toBe("function");
      expect(node.status).toBe("paused");
    });

    it("should accept initial tools in config", () => {
      const node = toolRouter({
        tools: {
          greet: (input) => `Hello, ${input.name}!`,
        },
      });

      expect(node.getTools()).toEqual(["greet"]);
    });
  });

  describe("registerTool", () => {
    it("should register a new tool", () => {
      const node = toolRouter();

      node.registerTool("calculator", (input) => String(input.a + input.b));

      expect(node.getTools()).toContain("calculator");
    });

    it("should allow registering async tools", () => {
      const node = toolRouter();

      node.registerTool("async_tool", async (input) => {
        await new Promise((r) => setTimeout(r, 1));
        return "async result";
      });

      expect(node.getTools()).toContain("async_tool");
    });
  });

  describe("unregisterTool", () => {
    it("should unregister a tool", () => {
      const node = toolRouter({
        tools: { greet: () => "hello" },
      });

      expect(node.getTools()).toContain("greet");

      node.unregisterTool("greet");

      expect(node.getTools()).not.toContain("greet");
    });
  });

  describe("tool execution", () => {
    it("should execute a single tool call", async () => {
      const node = toolRouter({
        tools: {
          get_weather: (input) => `Weather in ${input.location}: sunny`,
        },
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      const toolCalls: ToolCall[] = [
        { id: "tool_1", name: "get_weather", input: { location: "SF" } },
      ];

      node.write({ toolCalls });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          hasToolCalls: true,
          results: [
            {
              tool_use_id: "tool_1",
              content: "Weather in SF: sunny",
            },
          ],
        })
      );
    });

    it("should execute multiple tool calls in parallel", async () => {
      const executionOrder: string[] = [];

      const node = toolRouter({
        tools: {
          tool_a: async () => {
            await new Promise((r) => setTimeout(r, 20));
            executionOrder.push("a");
            return "result_a";
          },
          tool_b: async () => {
            await new Promise((r) => setTimeout(r, 10));
            executionOrder.push("b");
            return "result_b";
          },
        },
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      const toolCalls: ToolCall[] = [
        { id: "call_a", name: "tool_a", input: {} },
        { id: "call_b", name: "tool_b", input: {} },
      ];

      node.write({ toolCalls });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Tool B should finish first due to shorter delay (parallel execution)
      expect(executionOrder).toEqual(["b", "a"]);

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          results: expect.arrayContaining([
            { tool_use_id: "call_a", content: "result_a" },
            { tool_use_id: "call_b", content: "result_b" },
          ]),
        })
      );
    });

    it("should handle tool not found", async () => {
      const node = toolRouter();
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      const toolCalls: ToolCall[] = [
        { id: "tool_1", name: "unknown_tool", input: {} },
      ];

      node.write({ toolCalls });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          results: [
            {
              tool_use_id: "tool_1",
              content: 'Error: Tool "unknown_tool" not found',
              is_error: true,
            },
          ],
        })
      );
    });

    it("should handle tool execution errors", async () => {
      const node = toolRouter({
        tools: {
          failing_tool: () => {
            throw new Error("Tool failed!");
          },
        },
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      const toolCalls: ToolCall[] = [
        { id: "tool_1", name: "failing_tool", input: {} },
      ];

      node.write({ toolCalls });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          results: [
            {
              tool_use_id: "tool_1",
              content: "Error: Tool failed!",
              is_error: true,
            },
          ],
        })
      );
    });

    it("should handle async tool errors", async () => {
      const node = toolRouter({
        tools: {
          async_failing: async () => {
            await new Promise((r) => setTimeout(r, 5));
            throw new Error("Async error");
          },
        },
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({ toolCalls: [{ id: "t1", name: "async_failing", input: {} }] });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          results: [
            {
              tool_use_id: "t1",
              content: "Error: Async error",
              is_error: true,
            },
          ],
        })
      );
    });
  });

  describe("empty tool calls", () => {
    it("should handle empty tool calls array", async () => {
      const node = toolRouter();
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({ toolCalls: [] });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith({
        results: [],
        hasToolCalls: false,
      });
    });

    it("should handle missing toolCalls property", async () => {
      const node = toolRouter();
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith({
        results: [],
        hasToolCalls: false,
      });
    });
  });

  describe("content blocks output", () => {
    it("should output content blocks in Anthropic format", async () => {
      const node = toolRouter({
        tools: {
          test_tool: () => "result",
        },
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({
        toolCalls: [{ id: "tool_1", name: "test_tool", input: {} }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          contentBlocks: [
            {
              type: "tool_result",
              tool_use_id: "tool_1",
              content: "result",
              is_error: undefined,
            },
          ],
        })
      );
    });
  });

  describe("tool result serialization", () => {
    it("should serialize object results to JSON", async () => {
      const node = toolRouter({
        tools: {
          json_tool: () => ({ foo: "bar", num: 42 }),
        },
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({
        toolCalls: [{ id: "t1", name: "json_tool", input: {} }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          results: [
            {
              tool_use_id: "t1",
              content: '{"foo":"bar","num":42}',
            },
          ],
        })
      );
    });

    it("should keep string results as-is", async () => {
      const node = toolRouter({
        tools: {
          string_tool: () => "plain string",
        },
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({
        toolCalls: [{ id: "t1", name: "string_tool", input: {} }],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          results: [
            {
              tool_use_id: "t1",
              content: "plain string",
            },
          ],
        })
      );
    });
  });
});
