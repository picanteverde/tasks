import eventEmitter from "../EventEmitter";
import type { WriteStream } from "./types";

export default function writeStream(): WriteStream {
  const s = eventEmitter();
  const ws = {
    ...s,
    status: "open",
    write: (data: any) => {
      s.emit("data", data);
    },
    end: () => {
      s.emit("close");
    }
  };
  return ws as WriteStream;
}
