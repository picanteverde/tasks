import type { ReadStream, WriteStream } from "./types";

export default function pipe(readStream: ReadStream, writeStream: WriteStream) {
  readStream.on("data", (data) => {
    writeStream.write(data);
  });

  readStream.on("error", (error) => {
    writeStream.emit("error", error);
  });

  readStream.on("close", () => {
    writeStream.emit("close");
  });
}