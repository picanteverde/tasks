import fetchNode from "@/lib/tasks/nodes/fetch";
import { simple } from "@/lib/tasks";
import type { TaskNodeDescriptor } from "@/lib/tasks/types";
import input from "@/lib/tasks/nodes/input";
import output from "@/lib/tasks/nodes/output";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("fetch node", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("initialization", () => {
    it("should create a fetch node with correct interface", () => {
      const node = fetchNode();

      expect(typeof node.write).toBe("function");
      expect(typeof node.end).toBe("function");
      expect(typeof node.pipe).toBe("function");
      expect(typeof node.resume).toBe("function");
      expect(typeof node.pause).toBe("function");
      expect(typeof node.on).toBe("function");
      expect(typeof node.emit).toBe("function");
    });

    it("should accept configuration object", () => {
      const config = {
        url: "https://example.com/api",
        method: "GET",
      };
      const node = fetchNode(config);

      expect(node).toBeDefined();
    });
  });

  describe("basic fetch functionality", () => {
    it("should make a GET request by default", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ message: "success" }),
      });

      const node = fetchNode({ url: "https://example.com/api" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/api", {
        method: "GET",
        headers: undefined,
      });
      expect(dataHandler).toHaveBeenCalledWith({
        data: { message: "success" },
        status: 200,
        statusText: "OK",
        headers: expect.any(Object),
        ok: true,
      });
    });

    it("should make a POST request with body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: "Created",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ id: 1 }),
      });

      const node = fetchNode({
        url: "https://example.com/api",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"name": "test"}',
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"name": "test"}',
      });
      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: 1 },
          status: 201,
        })
      );
    });

    it("should handle text responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "text/plain" }),
        text: async () => "Hello World",
      });

      const node = fetchNode({ url: "https://example.com/api" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: "Hello World",
        })
      );
    });
  });

  describe("placeholder replacement", () => {
    it("should replace placeholders in URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      const node = fetchNode({
        url: "https://example.com/api/[[resource]]/[[id]]",
      });

      node.write({ resource: "users", id: "123" });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/users/123",
        expect.any(Object)
      );
    });

    it("should replace placeholders in body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      const node = fetchNode({
        url: "https://example.com/api",
        method: "POST",
        body: '{"content": "[[message]]", "user": "[[username]]"}',
      });

      node.write({ message: "Hello World", username: "john" });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api",
        expect.objectContaining({
          body: '{"content": "Hello World", "user": "john"}',
        })
      );
    });

    it("should replace placeholders in headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      const node = fetchNode({
        url: "https://example.com/api",
        headers: {
          Authorization: "Bearer [[token]]",
          "X-Custom": "[[custom]]",
        },
      });

      node.write({ token: "abc123", custom: "value" });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api",
        expect.objectContaining({
          headers: {
            Authorization: "Bearer abc123",
            "X-Custom": "value",
          },
        })
      );
    });

    it("should keep placeholders that are not in input data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      const node = fetchNode({
        url: "https://example.com/api/[[existing]]/[[missing]]",
      });

      node.write({ existing: "found" });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/found/[[missing]]",
        expect.any(Object)
      );
    });
  });

  describe("error handling", () => {
    it("should emit error when URL is missing", async () => {
      const node = fetchNode({});
      const errorHandler = jest.fn();
      node.on("error", errorHandler);

      node.write({});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "URL is required for fetch node",
        })
      );
    });

    it("should emit error when fetch fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const node = fetchNode({ url: "https://example.com/api" });
      const errorHandler = jest.fn();
      node.on("error", errorHandler);

      node.write({});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Network error",
        })
      );
    });

    it("should still emit data for non-2xx responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ error: "Not found" }),
      });

      const node = fetchNode({ url: "https://example.com/api" });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 404,
          ok: false,
          data: { error: "Not found" },
        })
      );
    });
  });

  describe("HTTP methods", () => {
    it.each(["GET", "POST", "PUT", "PATCH", "DELETE"])(
      "should support %s method",
      async (method) => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({}),
        });

        const config: { url: string; method: string; body?: string } = {
          url: "https://example.com/api",
          method,
        };

        if (method !== "GET") {
          config.body = "{}";
        }

        const node = fetchNode(config);
        node.write({});

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockFetch).toHaveBeenCalledWith(
          "https://example.com/api",
          expect.objectContaining({ method })
        );
      }
    );

    it("should not include body for GET requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      const node = fetchNode({
        url: "https://example.com/api",
        method: "GET",
        body: '{"ignored": true}',
      });

      node.write({});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api",
        expect.not.objectContaining({ body: expect.anything() })
      );
    });
  });

  describe("workflow integration", () => {
    it("should work in a workflow with input and output nodes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ result: "API response" }),
      });

      const workflow: TaskNodeDescriptor[] = [
        {
          type: "input",
          id: "input1",
        },
        {
          type: "fetch",
          id: "fetch1",
          set: {
            url: "https://example.com/api",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"content": "[[content]]"}',
          },
          in: {
            content: {
              node: "input1",
              out: "data",
            },
          },
        },
        {
          type: "output",
          id: "output1",
          in: {
            result: {
              node: "fetch1",
              out: "data",
            },
          },
        },
      ];

      const compileContext = simple(workflow);
      const outputHandler = jest.fn();

      (
        compileContext.getNode("output1") as unknown as ReturnType<
          typeof output
        >
      ).addListener(outputHandler);

      (
        compileContext.getNode("input1") as unknown as ReturnType<typeof input>
      ).trigger({ data: "Hello from input" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api",
        expect.objectContaining({
          body: '{"content": "Hello from input"}',
        })
      );

      // The workflow extracts 'data' from fetch response, so result = { result: "API response" }
      expect(outputHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          result: { result: "API response" },
        })
      );
    });

    it("should auto-generate id if not provided", () => {
      const workflow: TaskNodeDescriptor[] = [
        { type: "fetch", set: { url: "https://example.com" } },
        { type: "fetch", set: { url: "https://example.com" } },
      ];

      const compileContext = simple(workflow);

      expect(compileContext.nodes["fetch-1"]).toBeDefined();
      expect(compileContext.nodes["fetch-2"]).toBeDefined();
    });
  });

  describe("multiple inputs", () => {
    it("should handle multiple input writes", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ success: true }),
      });

      const node = fetchNode({
        url: "https://example.com/api/[[id]]",
        method: "GET",
      });
      const dataHandler = jest.fn();
      node.on("data", dataHandler);

      node.write({ id: "1" });
      node.write({ id: "2" });
      node.write({ id: "3" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "https://example.com/api/1",
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "https://example.com/api/2",
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        "https://example.com/api/3",
        expect.any(Object)
      );
      expect(dataHandler).toHaveBeenCalledTimes(3);
    });
  });
});
