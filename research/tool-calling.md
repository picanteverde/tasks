# Tool Calling Research for Agent Workflow Implementation

## Objective

Design an agent workflow using the existing node-based task system that:
- Uses the `fetch` node to call LLM APIs
- Implements short-term memory for conversation messages
- Handles tool calling by making tools other nodes or external frameworks

---

## 1. How Tool Calling Works

### The Basic Flow

Tool calling follows a multi-turn conversation pattern:

```
User Query → LLM (with tool definitions) → Tool Call Request → Execute Tool → Tool Result → LLM → Final Response
```

**Key insight**: The LLM does NOT execute tools. It only returns:
1. The tool name to call
2. The arguments to pass

Your code must:
1. Parse the tool call from the response
2. Execute the actual tool
3. Send results back to the LLM
4. Let the LLM generate the final response

### The Agentic Loop

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │  User    │───▶│   LLM    │───▶│ Tool Call?       │  │
│  │  Input   │    │  (fetch) │    │                  │  │
│  └──────────┘    └──────────┘    └────────┬─────────┘  │
│                                           │            │
│                              ┌────────────┴────────┐   │
│                              │                     │   │
│                              ▼                     ▼   │
│                         ┌────────┐           ┌────────┐│
│                         │  Yes   │           │   No   ││
│                         └───┬────┘           └───┬────┘│
│                             │                    │     │
│                             ▼                    ▼     │
│                      ┌────────────┐      ┌───────────┐ │
│                      │ Execute    │      │ Return    │ │
│                      │ Tool Node  │      │ Response  │ │
│                      └─────┬──────┘      └───────────┘ │
│                            │                           │
│                            ▼                           │
│                      ┌────────────┐                    │
│                      │ Add Result │                    │
│                      │ to Memory  │────────────────────┘
│                      └────────────┘
│
└─────────────────────────────────────────────────────────┘
```

---

## 2. API Formats

### Anthropic Claude API

#### Tool Definition
```json
{
  "name": "get_weather",
  "description": "Get the current weather in a given location",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "The city and state, e.g. San Francisco, CA"
      }
    },
    "required": ["location"]
  }
}
```

#### Request Format
```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 1024,
  "tools": [/* tool definitions */],
  "messages": [
    {"role": "user", "content": "What's the weather in SF?"}
  ]
}
```

#### Tool Use Response (from Claude)
```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "I'll check the weather for you."
    },
    {
      "type": "tool_use",
      "id": "toolu_01A09q90qw90lq917835lq9",
      "name": "get_weather",
      "input": {"location": "San Francisco, CA"}
    }
  ],
  "stop_reason": "tool_use"
}
```

#### Tool Result (sent back to Claude)
```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": "72°F, sunny"
    }
  ]
}
```

### OpenAI API

#### Tool Definition
```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get the current weather",
    "parameters": {
      "type": "object",
      "properties": {
        "location": {"type": "string"}
      },
      "required": ["location"]
    }
  }
}
```

#### Tool Call Response
```json
{
  "role": "assistant",
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"location\": \"San Francisco\"}"
      }
    }
  ]
}
```

#### Tool Result
```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "72°F, sunny"
}
```

---

## 3. Agent Architecture Patterns

### Pattern 1: Augmented LLM (Simplest)
Base layer combining retrieval, tools, and memory. Good starting point.

### Pattern 2: Prompt Chaining
Sequential LLM calls where each processes prior outputs. Useful for multi-step reasoning.

### Pattern 3: Orchestrator-Workers
Central LLM decomposes tasks and delegates to specialized worker nodes.

### Pattern 4: Evaluator-Optimizer
Iterative refinement with feedback loops. Good for code generation.

### Recommendation for Node System
Start with **Augmented LLM** pattern:
- `config` node → provides API keys, model settings
- `memory` node → manages conversation history
- `fetch` node → calls LLM API
- `tool-router` node → routes tool calls to appropriate handlers
- `output` node → returns final response

---

## 4. Memory Management

### Short-Term Memory (Conversation)

The conversation history is an array of messages:
```typescript
type Message = {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
};

type Memory = {
  messages: Message[];
  maxTokens?: number;
}
```

### Memory Node Design

```typescript
// Proposed memory node interface
type MemoryNode = {
  // Add a message to history
  write: (message: Message) => void;

  // Get all messages (for LLM context)
  getMessages: () => Message[];

  // Clear/reset memory
  clear: () => void;

  // Truncate to fit token limit
  compact: (maxTokens: number) => void;
}
```

### Memory Strategies

1. **Full History**: Keep all messages (simple, but hits token limits)
2. **Sliding Window**: Keep last N messages
3. **Summarization**: Periodically summarize older messages
4. **Hybrid**: Recent messages + summary of older ones

### MemTool Framework Insights

Research from MemTool suggests three modes for managing tool context:

| Mode | Description | Best For |
|------|-------------|----------|
| **Autonomous** | LLM manages its own tool context | Powerful models (GPT-5, Claude Opus) |
| **Workflow** | Deterministic pipeline controls context | Reliability-critical apps |
| **Hybrid** | Automated cleanup + agent search | Balance of flexibility/reliability |

---

## 5. Proposed Node Architecture

### Core Nodes

#### `llm` Node (wraps fetch)
```typescript
type LLMConfig = {
  provider: "anthropic" | "openai";
  model: string;
  apiKey: string;  // or reference to config node
  tools?: ToolDefinition[];
  maxTokens?: number;
};

// Input: { messages: Message[], tools?: Tool[] }
// Output: { response: AssistantMessage, toolCalls?: ToolCall[] }
```

#### `memory` Node
```typescript
type MemoryConfig = {
  maxMessages?: number;
  maxTokens?: number;
  strategy: "full" | "sliding" | "summary";
};

// Maintains message history
// Input: { message: Message } - adds to history
// Output: { messages: Message[] } - emits full history
```

#### `tool-router` Node
```typescript
type ToolRouterConfig = {
  tools: {
    [toolName: string]: {
      node: string;  // reference to tool node
      // or
      handler: (input: any) => Promise<any>;
    }
  }
};

// Input: { toolCalls: ToolCall[] }
// Output: { results: ToolResult[] }
```

#### `agent-loop` Node (Orchestrator)
```typescript
type AgentConfig = {
  llmNode: string;
  memoryNode: string;
  toolRouterNode: string;
  maxIterations?: number;
};

// Orchestrates the full agentic loop
// Input: { userMessage: string }
// Output: { response: string }
```

### Example Workflow Definition

```typescript
const agentWorkflow: TaskNodeDescriptor[] = [
  {
    type: "config",
    id: "settings",
    set: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: "claude-sonnet-4-5",
    }
  },
  {
    type: "memory",
    id: "conversation",
    set: {
      strategy: "sliding",
      maxMessages: 20,
    }
  },
  {
    type: "input",
    id: "userInput",
  },
  {
    type: "llm",
    id: "claude",
    set: {
      provider: "anthropic",
      tools: [
        {
          name: "search",
          description: "Search the web",
          input_schema: { /* ... */ }
        }
      ]
    },
    in: {
      apiKey: { node: "settings", out: "apiKey" },
      model: { node: "settings", out: "model" },
      messages: { node: "conversation", out: "messages" },
    }
  },
  {
    type: "tool-router",
    id: "tools",
    set: {
      tools: {
        search: { node: "searchTool" }
      }
    },
    in: {
      toolCalls: { node: "claude", out: "toolCalls" }
    }
  },
  {
    type: "output",
    id: "response",
    in: {
      content: { node: "claude", out: "response" }
    }
  }
];
```

---

## 6. Implementation Recommendations

### Phase 1: Basic LLM Node
1. Create `llm` node that wraps `fetch` node
2. Handle Anthropic message format
3. Parse tool_use responses

### Phase 2: Memory Node
1. Implement simple message array storage
2. Add sliding window truncation
3. Connect to LLM node

### Phase 3: Tool Router
1. Create routing node for tool calls
2. Allow tools to be other nodes or functions
3. Format tool results for LLM

### Phase 4: Agent Loop
1. Orchestrator node that manages the loop
2. Detect stop_reason to continue or stop
3. Add max iteration safeguard

### Key Considerations

1. **Async Handling**: Tool execution is async; nodes need to handle promises
2. **Error Propagation**: Tool errors should be sent back to LLM with `is_error: true`
3. **Parallel Tools**: Claude can request multiple tools at once; handle concurrently
4. **Token Counting**: Consider adding token estimation for memory management

---

## 7. External Framework Integration

### MCP (Model Context Protocol)
- Anthropic's standard for tool servers
- Tools defined with `inputSchema` (rename to `input_schema` for Claude API)
- Consider creating an `mcp-client` node

### LangChain/LangGraph
- Can wrap LangChain tools as nodes
- LangGraph's state machine maps well to node graph

### Tool as Node Pattern
```typescript
// Any node implementing WriteStream can be a tool
// Input: tool arguments
// Output: tool result

const searchTool: TaskNodeDescriptor = {
  type: "fetch",
  id: "searchTool",
  set: {
    url: "https://api.search.com/search?q=[[query]]",
    method: "GET",
  },
  in: {
    query: { node: "toolRouter", out: "searchArgs.query" }
  }
};
```

---

## Sources

- [Anthropic Tool Use Documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
- [Anthropic Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [MemTool: Short-Term Memory Management](https://arxiv.org/html/2507.21428v1)
- [Anthropic Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Smarter Function Calling (Jan 2026)](https://emmanuelbernard.com/blog/2026/01/10/smarter-function-calling/)
- [LangChain Workflows and Agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- [Google ADK Context Engineering](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)
