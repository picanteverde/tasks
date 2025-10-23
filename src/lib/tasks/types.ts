import type { ReadStream, WriteStream } from "@/lib/streams/types";
import nodes from "./nodes";

type NodeInput = {
  node: string;
  out: string;
}

export type TaskNodeTypes = keyof typeof nodes;

export type TaskNodeDescriptor = {
  type: TaskNodeTypes;
  id?: string;
  set?: Record<string, any>;
  in?: Record<string, NodeInput | any | NodeInput[]>;
}

export type TaskNode = {
  id: string;
  in?: Record<string, string | NodeInput | any | NodeInput[]>;
} & ReadStream & WriteStream;
