import { WriteStream } from "@/lib/streams/types";
import writeStream from "@/lib/streams/writeStream";

type Listener = (data: any) => void;

export default function output(
  set: Record<string, any> = {}
): WriteStream  & { addListener: (listener: Listener) => void }{
  const s = writeStream();

  const ws = {
    ...s,
    addListener: (listener: Listener) => {
      s.on("data", listener);
    }
  }
  return ws;
}
