import eventEmitter from "../EventEmitter";
import type { ReadStream, WriteStream } from "./types";
import pipe from "./pipe";

export default function readStream(): ReadStream {
  const s = eventEmitter();
  const rs = {
    ...s,
    status: "paused",
    pipe: (writeStream: WriteStream) => {
      pipe(s as ReadStream, writeStream);
      rs.resume();
    },
    resume: () => {
      rs.status = "open";
    },
    pause: () => {
      rs.status = "paused";
    }
  };
  return rs as ReadStream;
}
