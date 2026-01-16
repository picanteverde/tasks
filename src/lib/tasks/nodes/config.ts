import type { ReadStream } from "@/lib/streams/types";

export default function config(set: Record<string, any> = {}): ReadStream {
  const listeners: Record<string, Array<(data: any) => void>> = {};

  const node: ReadStream = {
    status: "paused" as "open" | "paused" | "error" | "closed",

    pipe: (writeStream) => {
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
      // Emit all configured values when resumed
      node.emit("data", set);
    },

    pause: () => {
      node.status = "paused";
    },

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

  return node;
}
