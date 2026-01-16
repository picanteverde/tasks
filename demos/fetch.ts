import { simple } from "./src/lib/tasks";
import type { TaskNodeDescriptor } from "./src/lib/tasks/types";
import type input from "./src/lib/tasks/nodes/input";
import type output from "./src/lib/tasks/nodes/output";
import * as readline from "readline";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error("Error: GROQ_API_KEY not found in environment variables");
  console.error("Make sure you have a .env file with GROQ_API_KEY=your_key");
  process.exit(1);
}

// Build the request body with placeholder for content
const requestBody = JSON.stringify({
  messages: [{ role: "user", content: "[[content]]" }],
  model: "llama-3.1-8b-instant",
  temperature: 1,
  max_completion_tokens: 1024,
});

const workflow: TaskNodeDescriptor[] = [
  // Input node receives user messages
  {
    type: "input",
    id: "userInput",
  },
  // Fetch node calls the Groq API
  {
    type: "fetch",
    id: "groqFetch",
    set: {
      url: "https://api.groq.com/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: requestBody,
    },
    in: {
      content: { node: "userInput", out: "data" },
    },
  },
  // Output node receives the API response
  {
    type: "output",
    id: "apiResponse",
    in: {
      response: { node: "groqFetch", out: "data" },
    },
  },
];

// Compile the workflow
const context = simple(workflow);

// Get node references
const inputNode = context.getNode("userInput") as unknown as ReturnType<typeof input>;
const outputNode = context.getNode("apiResponse") as unknown as ReturnType<typeof output>;

// Set up readline for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Listen for output
outputNode.addListener((data) => {
  console.log("\n--- Response from Groq API ---");
  if (data.response?.choices?.[0]?.message?.content) {
    console.log(data.response.choices[0].message.content);
  } else if (data.response?.error) {
    console.error("API Error:", data.response.error);
  } else {
    console.log(JSON.stringify(data.response, null, 2));
  }
  console.log("------------------------------\n");
  promptUser();
});

// Prompt user for input
function promptUser() {
  rl.question("You: ", (userInput) => {
    const trimmed = userInput.trim();

    if (trimmed.toLowerCase() === "quit" || trimmed.toLowerCase() === "exit") {
      console.log("Goodbye!");
      rl.close();
      process.exit(0);
    }

    if (trimmed) {
      console.log("\nSending to Groq API...");
      inputNode.trigger({ data: trimmed });
    } else {
      promptUser();
    }
  });
}

console.log("=== Groq API Chat Demo ===\n");
console.log("This demo uses a workflow with input, fetch, and output nodes.");
console.log("Type a message and press Enter to send it to the Groq API.");
console.log("Type 'quit' or 'exit' to exit.\n");

promptUser();
