import type { TaskNode, TaskNodeDescriptor, TaskNodeTypes } from "./types";
import nodeTypes from "./nodes";  
import writeStream from "../streams/writeStream";

const transformEvent = (
  event: Record<string, any>,
  inputNode: TaskNode,
  inputKey: string,
  outputNode: TaskNode,
  outputKey: string
) => {

  const s = writeStream();
  s.on("data", (data) => {
    event[inputKey] = data[outputKey];
    // TODO: check all required inputs are present
    // console.log(`DEBUG: [v.node: ${value.node}, v.out: ${value.out}]`);
    inputNode.write(event);
  });

  outputNode.pipe(s);
}


export default function compile(workflow: TaskNodeDescriptor[]) {

  const compileContext = {
    nodes: {} as Record<string, TaskNode>,
    nodeTypeCounts: {} as Record<TaskNodeTypes, number>,
    getNode: (id: string) => {
      if (!compileContext.nodes[id]) {
        throw new Error(`Node ${id} not found`);
      }
      return compileContext.nodes[id];
    }
  };

  workflow.forEach((nodeDescriptor) => {

    if (!nodeTypes[nodeDescriptor.type]) {
      throw new Error(`Node type ${nodeDescriptor.type} not found`);
    }

    const node = nodeTypes[nodeDescriptor.type](nodeDescriptor.set) as unknown as TaskNode;
    compileContext.nodeTypeCounts[nodeDescriptor.type] =
      (compileContext.nodeTypeCounts[nodeDescriptor.type] || 0) + 1;

    nodeDescriptor.id = nodeDescriptor.id ||
      `${nodeDescriptor.type}-${compileContext.nodeTypeCounts[nodeDescriptor.type]}`;

    compileContext.nodes[nodeDescriptor.id] = node;
  });

  // connect each stream with the following node

  workflow
    .filter((nodeDescriptor) => nodeDescriptor.in)
    .forEach((nodeDescriptor) => {
      // accumulates the value of all the inputs from different nodes
      const acc: Record<string, any> = {};

      Object.entries(nodeDescriptor.in || {}).forEach(([key, value]) => {

        if (typeof value === "object") {
          transformEvent(
            acc,
            compileContext.nodes[nodeDescriptor.id as string] as TaskNode,
            key,
            compileContext.nodes[value.node] as TaskNode,
            value.out,
          );
        }

        if (Array.isArray(value)) {
          value.forEach((v) => {
            transformEvent(
              acc,
              compileContext.nodes[nodeDescriptor.id as string] as TaskNode,
              key,
              compileContext.nodes[v.node] as TaskNode,
              v.out,
            );
          });
        }
      });
    });

  return compileContext;
}