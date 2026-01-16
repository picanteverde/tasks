import type { ReadStream, WriteStream } from "@/lib/streams/types";

type FetchConfig = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type FetchNode = ReadStream & WriteStream;

/**
 * Replaces placeholders like [[key]] in a string with values from the data object
 */
function replacePlaceholders(template: string, data: Record<string, any>): string {
  return template.replace(/\[\[(\w+)\]\]/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match;
  });
}

/**
 * Recursively replaces placeholders in all string fields of an object
 */
function replaceInObject<T>(obj: T, data: Record<string, any>): T {
  if (typeof obj === 'string') {
    return replacePlaceholders(obj, data) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => replaceInObject(item, data)) as T;
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceInObject(value, data);
    }
    return result as T;
  }

  return obj;
}

export default function fetchNode(set: FetchConfig = {}): FetchNode {
  // Event listeners for this node
  const listeners: Record<string, Array<(data: any) => void>> = {};

  const node: FetchNode = {
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

  // Handle input data and make fetch requests
  node.on("input", async (inputData: Record<string, any>) => {
    try {
      // Replace placeholders in the config with input data
      const config = replaceInObject(set, inputData);

      const url = config.url;
      if (!url) {
        node.emit("error", new Error("URL is required for fetch node"));
        return;
      }

      const fetchOptions: RequestInit = {
        method: config.method || "GET",
        headers: config.headers,
      };

      // Only add body for methods that support it
      if (config.body && fetchOptions.method !== "GET" && fetchOptions.method !== "HEAD") {
        fetchOptions.body = config.body;
      }

      const response = await fetch(url, fetchOptions);

      // Try to parse as JSON, fall back to text
      const contentType = response.headers.get("content-type") || "";
      let responseData: any;

      if (contentType.includes("application/json")) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      node.emit("data", {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok,
      });
    } catch (error) {
      node.emit("error", error);
    }
  });

  return node;
}
