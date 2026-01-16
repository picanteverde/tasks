import config from "@/lib/tasks/nodes/config";
import { simple } from "@/lib/tasks";
import type { TaskNodeDescriptor } from "@/lib/tasks/types";
import output from "@/lib/tasks/nodes/output";
import writeStream from "@/lib/streams/writeStream";

describe("config node", () => {
  describe("initialization", () => {
    it("should create a config node with correct interface", () => {
      const node = config();

      expect(typeof node.pipe).toBe("function");
      expect(typeof node.resume).toBe("function");
      expect(typeof node.pause).toBe("function");
      expect(typeof node.on).toBe("function");
      expect(typeof node.emit).toBe("function");
      expect(node.status).toBe("paused");
    });

    it("should accept configuration object", () => {
      const node = config({ token: "abc123" });
      expect(node).toBeDefined();
    });

    it("should work without configuration object", () => {
      const node = config();
      expect(node).toBeDefined();
    });
  });

  describe("emit on resume", () => {
    it("should emit all configured values when resumed", () => {
      const node = config({
        token: "gsk_abc123",
        apiUrl: "https://api.example.com",
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.resume();

      expect(dataHandler).toHaveBeenCalledTimes(1);
      expect(dataHandler).toHaveBeenCalledWith({
        token: "gsk_abc123",
        apiUrl: "https://api.example.com",
      });
    });

    it("should emit single value when only one is configured", () => {
      const node = config({
        token: "gsk_abc123",
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.resume();

      expect(dataHandler).toHaveBeenCalledWith({
        token: "gsk_abc123",
      });
    });

    it("should emit empty object when no values configured", () => {
      const node = config({});
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.resume();

      expect(dataHandler).toHaveBeenCalledWith({});
    });

    it("should emit on every resume call", () => {
      const node = config({ value: "test" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.resume();
      node.resume();
      node.resume();

      expect(dataHandler).toHaveBeenCalledTimes(3);
    });

    it("should change status to open on resume", () => {
      const node = config({ value: "test" });

      expect(node.status).toBe("paused");
      node.resume();
      expect(node.status).toBe("open");
    });
  });

  describe("emit on pipe", () => {
    it("should emit values when piped to another stream", () => {
      const node = config({
        token: "gsk_abc123",
        secret: "mysecret",
      });
      const ws = writeStream();
      const dataHandler = jest.fn();
      ws.on("data", dataHandler);

      node.pipe(ws);

      expect(dataHandler).toHaveBeenCalledTimes(1);
      expect(dataHandler).toHaveBeenCalledWith({
        token: "gsk_abc123",
        secret: "mysecret",
      });
    });
  });

  describe("different value types", () => {
    it("should handle string values", () => {
      const node = config({ name: "test" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.resume();

      expect(dataHandler).toHaveBeenCalledWith({ name: "test" });
    });

    it("should handle number values", () => {
      const node = config({ count: 42, price: 19.99 });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.resume();

      expect(dataHandler).toHaveBeenCalledWith({ count: 42, price: 19.99 });
    });

    it("should handle boolean values", () => {
      const node = config({ enabled: true, disabled: false });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.resume();

      expect(dataHandler).toHaveBeenCalledWith({ enabled: true, disabled: false });
    });

    it("should handle nested objects", () => {
      const node = config({
        api: {
          url: "https://api.example.com",
          headers: {
            "Content-Type": "application/json",
          },
        },
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.resume();

      expect(dataHandler).toHaveBeenCalledWith({
        api: {
          url: "https://api.example.com",
          headers: {
            "Content-Type": "application/json",
          },
        },
      });
    });

    it("should handle array values", () => {
      const node = config({ items: [1, 2, 3], tags: ["a", "b"] });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.resume();

      expect(dataHandler).toHaveBeenCalledWith({
        items: [1, 2, 3],
        tags: ["a", "b"],
      });
    });
  });

  describe("pause functionality", () => {
    it("should change status to paused on pause", () => {
      const node = config({ value: "test" });

      node.resume();
      expect(node.status).toBe("open");

      node.pause();
      expect(node.status).toBe("paused");
    });
  });

  describe("workflow integration", () => {
    it("should work in a workflow with output node", () => {
      const workflow: TaskNodeDescriptor[] = [
        {
          type: "config",
          id: "config1",
          set: {
            token: "gsk_abc123",
            apiUrl: "https://api.example.com",
          },
        },
        {
          type: "output",
          id: "output1",
          in: {
            token: {
              node: "config1",
              out: "token",
            },
          },
        },
      ];

      const compileContext = simple(workflow);
      const outputHandler = jest.fn();

      (
        compileContext.getNode("output1") as unknown as ReturnType<typeof output>
      ).addListener(outputHandler);

      // Config emits when piped, which happens during workflow compilation
      // We need to trigger the config node to emit
      compileContext.getNode("config1").resume();

      expect(outputHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "gsk_abc123",
        })
      );
    });

    it("should auto-generate id if not provided", () => {
      const workflow: TaskNodeDescriptor[] = [
        { type: "config", set: { a: 1 } },
        { type: "config", set: { b: 2 } },
      ];

      const compileContext = simple(workflow);

      expect(compileContext.nodes["config-1"]).toBeDefined();
      expect(compileContext.nodes["config-2"]).toBeDefined();
    });

    it("should provide multiple outputs to different nodes", () => {
      const workflow: TaskNodeDescriptor[] = [
        {
          type: "config",
          id: "config1",
          set: {
            token: "abc123",
            baseUrl: "https://api.example.com",
          },
        },
        {
          type: "output",
          id: "tokenOutput",
          in: {
            value: {
              node: "config1",
              out: "token",
            },
          },
        },
        {
          type: "output",
          id: "urlOutput",
          in: {
            value: {
              node: "config1",
              out: "baseUrl",
            },
          },
        },
      ];

      const compileContext = simple(workflow);
      const tokenHandler = jest.fn();
      const urlHandler = jest.fn();

      (
        compileContext.getNode("tokenOutput") as unknown as ReturnType<typeof output>
      ).addListener(tokenHandler);
      (
        compileContext.getNode("urlOutput") as unknown as ReturnType<typeof output>
      ).addListener(urlHandler);

      compileContext.getNode("config1").resume();

      expect(tokenHandler).toHaveBeenCalledWith(
        expect.objectContaining({ value: "abc123" })
      );
      expect(urlHandler).toHaveBeenCalledWith(
        expect.objectContaining({ value: "https://api.example.com" })
      );
    });
  });
});
