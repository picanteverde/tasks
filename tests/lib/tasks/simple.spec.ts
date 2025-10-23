import { TaskNodeDescriptor } from "@/lib/tasks/types";
import { simple } from "@/lib/tasks";
import output from "@/lib/tasks/nodes/output";
import input from "@/lib/tasks/nodes/input";

const workflow: TaskNodeDescriptor[] = [
  {
    type: "input",
    id: 'input1',
  },
  {
    type: "output",
    id: 'output1',
    in: {
      data: {
        node: 'input1',
        out: 'data'
      }
    }
   }
];

describe("simple", () => {
  it("should compile a workflow", () => {
    const compileContext = simple(workflow);

    expect(compileContext.nodes.input1).toBeDefined();
    expect(compileContext.nodes.output1).toBeDefined();
  });

  it("should compile a workflow with an input and an output", () => {
    const outputHandler = jest.fn();
    const compileContext = simple(workflow);
    (compileContext.getNode('output1') as unknown as ReturnType<typeof output>).addListener(outputHandler);
    (compileContext.getNode('input1') as unknown as ReturnType<typeof input>).trigger({ data: 'test' });
    expect(outputHandler).toHaveBeenCalledWith({ data: 'test' });
  });
});