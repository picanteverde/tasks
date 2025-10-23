import readStream from "@/lib/streams/readStream";
import type { ReadStream } from "@/lib/streams/types";

export default function input(set: Record<string, any> = {}): ReadStream & { trigger: (data: any) => void } {
  const rs = readStream();

  const s = {
    ...rs,
    trigger: (data: any) => {
      s.emit("data", data);
    }
  };
  return s;
}