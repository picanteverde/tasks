/**
 * Agent Demo - Shows how to use the agent nodes
 *
 * This demo demonstrates:
 * 1. Basic agent loop with tool calling
 * 2. Using memory, llm, and toolRouter nodes individually
 * 3. Building a custom agent workflow
 *
 * To run: Set ANTHROPIC_API_KEY environment variable and run with ts-node/bun
 */

import agentLoop from "../src/lib/tasks/nodes/agentLoop";
import memory from "../src/lib/tasks/nodes/memory";
import llm from "../src/lib/tasks/nodes/llm";
import toolRouter from "../src/lib/tasks/nodes/toolRouter";
import type { ToolDefinition } from "../src/lib/tasks/nodes/llm";

// =============================================================================
// Example 1: Using agentLoop (all-in-one)
// =============================================================================

async function basicAgentExample() {
  console.log("=== Basic Agent Loop Example ===\n");

  const agent = agentLoop({
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY,
    systemPrompt: "You are a helpful assistant with access to tools.",
    maxIterations: 5,
    tools: [
      {
        name: "get_weather",
        description: "Get the current weather in a location",
        input_schema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name, e.g. 'San Francisco'",
            },
          },
          required: ["location"],
        },
      },
      {
        name: "calculate",
        description: "Perform a calculation",
        input_schema: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "Math expression to evaluate, e.g. '2 + 2'",
            },
          },
          required: ["expression"],
        },
      },
    ],
    toolHandlers: {
      get_weather: async (input) => {
        // Simulated weather API
        const weather: Record<string, string> = {
          "san francisco": "Sunny, 68°F",
          "new york": "Cloudy, 45°F",
          london: "Rainy, 52°F",
          tokyo: "Clear, 72°F",
        };
        const location = input.location.toLowerCase();
        return weather[location] || `Weather data not available for ${input.location}`;
      },
      calculate: async (input) => {
        try {
          // Simple safe eval for basic math
          const result = Function(`"use strict"; return (${input.expression})`)();
          return String(result);
        } catch {
          return `Error: Could not evaluate "${input.expression}"`;
        }
      },
    },
  });

  // Listen for iteration events to see the agent's progress
  agent.on("iteration", (event) => {
    console.log(`[Iteration ${event.iteration}] Phase: ${event.phase}`);
    if (event.toolCalls?.length) {
      console.log("  Tool calls:", event.toolCalls.map((t: any) => t.name).join(", "));
    }
  });

  // Listen for the final response
  agent.on("data", (data) => {
    console.log("\n--- Agent Response ---");
    console.log(data.response);
    console.log(`\n(Completed in ${data.iterations} iteration(s))`);
  });

  agent.on("error", (error) => {
    console.error("Agent error:", error.message);
  });

  // Send a user message
  agent.write({
    userMessage: "What's the weather in San Francisco? Also, what's 15 * 7?",
  });
}

// =============================================================================
// Example 2: Using individual nodes for custom workflow
// =============================================================================

async function customWorkflowExample() {
  console.log("\n=== Custom Workflow Example ===\n");

  // Create individual nodes
  const memoryNode = memory({
    systemPrompt: "You are a math tutor. Help students solve problems step by step.",
    maxMessages: 20,
  });

  const tools: ToolDefinition[] = [
    {
      name: "solve_equation",
      description: "Solve a mathematical equation",
      input_schema: {
        type: "object",
        properties: {
          equation: { type: "string", description: "The equation to solve" },
        },
        required: ["equation"],
      },
    },
  ];

  const llmNode = llm({
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY,
    tools,
  });

  const router = toolRouter({
    tools: {
      solve_equation: (input) => {
        // Simple equation solver (just for demo)
        return `The solution to "${input.equation}" is computed.`;
      },
    },
  });

  // Wire up the nodes manually
  llmNode.on("data", async (response) => {
    console.log("LLM response received");
    console.log("Stop reason:", response.stopReason);

    if (response.toolCalls.length > 0) {
      console.log("Tool calls requested:", response.toolCalls.length);

      // Route to tool handler
      router.write({ toolCalls: response.toolCalls });
    } else {
      console.log("\nFinal response:", response.text);
    }
  });

  router.on("data", (result) => {
    if (result.hasToolCalls) {
      console.log("Tool results:", result.results);
      // In a real workflow, you'd send these back to the LLM
    }
  });

  // Add user message and trigger LLM
  memoryNode.addMessage({ role: "user", content: "Can you help me solve x + 5 = 12?" });

  // Get messages and call LLM
  const messages = memoryNode.getMessages();
  console.log("Sending messages to LLM:", messages.length);

  llmNode.write({
    messages,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

// =============================================================================
// Example 3: Multi-turn conversation
// =============================================================================

async function multiTurnExample() {
  console.log("\n=== Multi-turn Conversation Example ===\n");

  const agent = agentLoop({
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY,
    systemPrompt: "You are a friendly assistant. Keep track of our conversation.",
  });

  const responses: string[] = [];

  agent.on("data", (data) => {
    responses.push(data.response);
    console.log("Assistant:", data.response);
    console.log("---");
  });

  // Simulate a conversation
  const conversation = [
    "Hi! My name is Alice.",
    "What's my name?",
    "What have we talked about so far?",
  ];

  for (const message of conversation) {
    console.log("User:", message);
    agent.write({ userMessage: message });
    await new Promise((r) => setTimeout(r, 2000)); // Wait for response
  }

  console.log("\nConversation history:");
  agent.getConversation().forEach((msg, i) => {
    const content = typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content);
    console.log(`${i + 1}. [${msg.role}] ${content.slice(0, 100)}...`);
  });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Demo: Agent nodes have been created successfully!");
    console.log("\nTo run the interactive demos, set ANTHROPIC_API_KEY:");
    console.log("  export ANTHROPIC_API_KEY=your-key-here");
    console.log("  npx ts-node demos/agent.ts");
    console.log("\nAvailable nodes:");
    console.log("  - memory: Manages conversation history");
    console.log("  - llm: Calls LLM APIs (Anthropic/OpenAI)");
    console.log("  - toolRouter: Routes tool calls to handlers");
    console.log("  - agentLoop: Complete agentic loop orchestrator");
    return;
  }

  try {
    await basicAgentExample();
    // Uncomment to run other examples:
    // await customWorkflowExample();
    // await multiTurnExample();
  } catch (error) {
    console.error("Demo error:", error);
  }
}

main();
