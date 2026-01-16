import type { ReadStream, WriteStream } from "@/lib/streams/types";

export type Message = {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
};

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, any> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

type MemoryConfig = {
  maxMessages?: number;
  systemPrompt?: string;
};

type MemoryNode = ReadStream & WriteStream & {
  getMessages: () => Message[];
  addMessage: (message: Message) => void;
  clear: () => void;
};

export default function memory(set: MemoryConfig = {}): MemoryNode {
  const listeners: Record<string, Array<(data: any) => void>> = {};
  const messages: Message[] = [];

  // Add system prompt if provided
  if (set.systemPrompt) {
    messages.push({ role: "system", content: set.systemPrompt });
  }

  const node: MemoryNode = {
    status: "paused" as "open" | "paused" | "error" | "closed",

    // WriteStream methods - receive new messages to add
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
      // Emit current messages when resumed
      node.emit("data", { messages: [...messages] });
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

    // Memory-specific methods
    getMessages: () => [...messages],

    addMessage: (message: Message) => {
      messages.push(message);

      // Enforce max messages limit (keep system prompt if present)
      if (set.maxMessages && messages.length > set.maxMessages) {
        const hasSystemPrompt = messages[0]?.role === "system";
        const startIndex = hasSystemPrompt ? 1 : 0;
        const excess = messages.length - set.maxMessages;
        messages.splice(startIndex, excess);
      }

      // Emit updated messages
      node.emit("data", { messages: [...messages] });
    },

    clear: () => {
      // Keep system prompt if present
      const systemPrompt = messages[0]?.role === "system" ? messages[0] : null;
      messages.length = 0;
      if (systemPrompt) {
        messages.push(systemPrompt);
      }
      node.emit("data", { messages: [...messages] });
    },
  };

  // Handle input - can receive message objects or user strings
  node.on("input", (inputData: any) => {
    if (inputData.message) {
      node.addMessage(inputData.message);
    } else if (inputData.userMessage) {
      node.addMessage({ role: "user", content: inputData.userMessage });
    } else if (inputData.assistantMessage) {
      node.addMessage({ role: "assistant", content: inputData.assistantMessage });
    } else if (inputData.clear) {
      node.clear();
    }
  });

  return node;
}
