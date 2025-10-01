import type { EventEmitter } from "../EventEmitter";

type Stream = {
  status: "open" | "paused" | "error" | "closed";
}

export type ReadStream = {
  pipe: (writeStream: WriteStream) => void;
  resume: () => void;
  pause: () => void;
} & Stream & EventEmitter;

export type WriteStream = {
  write: (data: any) => void;
  end: () => void;
} & Stream & EventEmitter;
