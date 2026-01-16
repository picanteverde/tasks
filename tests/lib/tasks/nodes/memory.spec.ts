import memory from "@/lib/tasks/nodes/memory";
import type { Message } from "@/lib/tasks/nodes/memory";
import writeStream from "@/lib/streams/writeStream";

describe("memory node", () => {
  describe("initialization", () => {
    it("should create a memory node with correct interface", () => {
      const node = memory();

      expect(typeof node.pipe).toBe("function");
      expect(typeof node.resume).toBe("function");
      expect(typeof node.pause).toBe("function");
      expect(typeof node.on).toBe("function");
      expect(typeof node.emit).toBe("function");
      expect(typeof node.write).toBe("function");
      expect(typeof node.end).toBe("function");
      expect(typeof node.getMessages).toBe("function");
      expect(typeof node.addMessage).toBe("function");
      expect(typeof node.clear).toBe("function");
      expect(node.status).toBe("paused");
    });

    it("should start with empty messages", () => {
      const node = memory();
      expect(node.getMessages()).toEqual([]);
    });

    it("should include system prompt if provided", () => {
      const node = memory({ systemPrompt: "You are a helpful assistant" });
      const messages = node.getMessages();

      expect(messages.length).toBe(1);
      expect(messages[0]).toEqual({
        role: "system",
        content: "You are a helpful assistant",
      });
    });
  });

  describe("addMessage", () => {
    it("should add messages to history", () => {
      const node = memory();

      node.addMessage({ role: "user", content: "Hello" });
      node.addMessage({ role: "assistant", content: "Hi there!" });

      const messages = node.getMessages();
      expect(messages.length).toBe(2);
      expect(messages[0]).toEqual({ role: "user", content: "Hello" });
      expect(messages[1]).toEqual({ role: "assistant", content: "Hi there!" });
    });

    it("should emit data event when message is added", () => {
      const node = memory();
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.addMessage({ role: "user", content: "Hello" });

      expect(dataHandler).toHaveBeenCalledWith({
        messages: [{ role: "user", content: "Hello" }],
      });
    });

    it("should handle content blocks", () => {
      const node = memory();

      node.addMessage({
        role: "assistant",
        content: [
          { type: "text", text: "Let me check that" },
          { type: "tool_use", id: "tool_1", name: "get_weather", input: { location: "SF" } },
        ],
      });

      const messages = node.getMessages();
      expect(messages[0].content).toHaveLength(2);
    });
  });

  describe("maxMessages limit", () => {
    it("should enforce maxMessages limit", () => {
      const node = memory({ maxMessages: 3 });

      node.addMessage({ role: "user", content: "Message 1" });
      node.addMessage({ role: "assistant", content: "Response 1" });
      node.addMessage({ role: "user", content: "Message 2" });
      node.addMessage({ role: "assistant", content: "Response 2" });

      const messages = node.getMessages();
      expect(messages.length).toBe(3);
      expect(messages[0].content).toBe("Response 1");
    });

    it("should preserve system prompt when truncating", () => {
      const node = memory({
        systemPrompt: "System message",
        maxMessages: 3,
      });

      node.addMessage({ role: "user", content: "Message 1" });
      node.addMessage({ role: "assistant", content: "Response 1" });
      node.addMessage({ role: "user", content: "Message 2" });
      node.addMessage({ role: "assistant", content: "Response 2" });

      const messages = node.getMessages();
      expect(messages.length).toBe(3);
      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toBe("System message");
    });
  });

  describe("clear", () => {
    it("should clear all messages", () => {
      const node = memory();

      node.addMessage({ role: "user", content: "Hello" });
      node.addMessage({ role: "assistant", content: "Hi" });
      node.clear();

      expect(node.getMessages()).toEqual([]);
    });

    it("should preserve system prompt when clearing", () => {
      const node = memory({ systemPrompt: "System message" });

      node.addMessage({ role: "user", content: "Hello" });
      node.clear();

      const messages = node.getMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe("system");
    });

    it("should emit data event when cleared", () => {
      const node = memory();
      node.addMessage({ role: "user", content: "Hello" });

      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.clear();

      expect(dataHandler).toHaveBeenCalledWith({ messages: [] });
    });
  });

  describe("write input handling", () => {
    it("should add message via write with message object", () => {
      const node = memory();
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({ message: { role: "user", content: "Hello via write" } });

      expect(dataHandler).toHaveBeenCalledWith({
        messages: [{ role: "user", content: "Hello via write" }],
      });
    });

    it("should add user message via write with userMessage", () => {
      const node = memory();

      node.write({ userMessage: "Hello user" });

      const messages = node.getMessages();
      expect(messages[0]).toEqual({ role: "user", content: "Hello user" });
    });

    it("should add assistant message via write with assistantMessage", () => {
      const node = memory();

      node.write({ assistantMessage: "Hello assistant" });

      const messages = node.getMessages();
      expect(messages[0]).toEqual({ role: "assistant", content: "Hello assistant" });
    });

    it("should clear via write with clear flag", () => {
      const node = memory();
      node.addMessage({ role: "user", content: "Hello" });

      node.write({ clear: true });

      expect(node.getMessages()).toEqual([]);
    });
  });

  describe("resume behavior", () => {
    it("should emit current messages on resume", () => {
      const node = memory();
      node.addMessage({ role: "user", content: "Hello" });

      const dataHandler = jest.fn();
      node.on("data", dataHandler);
      dataHandler.mockClear();

      node.resume();

      expect(dataHandler).toHaveBeenCalledWith({
        messages: [{ role: "user", content: "Hello" }],
      });
    });

    it("should change status to open on resume", () => {
      const node = memory();

      expect(node.status).toBe("paused");
      node.resume();
      expect(node.status).toBe("open");
    });
  });

  describe("pipe behavior", () => {
    it("should pipe messages to connected stream", () => {
      const node = memory();
      node.addMessage({ role: "user", content: "Hello" });

      const ws = writeStream();
      const dataHandler = jest.fn();
      ws.on("data", dataHandler);

      node.pipe(ws);

      expect(dataHandler).toHaveBeenCalledWith({
        messages: [{ role: "user", content: "Hello" }],
      });
    });
  });

  describe("pause behavior", () => {
    it("should change status to paused on pause", () => {
      const node = memory();
      node.resume();

      expect(node.status).toBe("open");
      node.pause();
      expect(node.status).toBe("paused");
    });
  });

  describe("immutability", () => {
    it("should return copies of messages array", () => {
      const node = memory();
      node.addMessage({ role: "user", content: "Hello" });

      const messages1 = node.getMessages();
      const messages2 = node.getMessages();

      expect(messages1).not.toBe(messages2);
      expect(messages1).toEqual(messages2);
    });
  });
});
