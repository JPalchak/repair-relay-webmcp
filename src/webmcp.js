export async function registerWebMCPTools(tools, onStatus = () => {}) {
  const modelContext = document.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    onStatus({
      supported: false,
      registered: 0,
      message: "WebMCP unavailable — use ChatGPT’s in-app browser or enable Chrome WebMCP testing."
    });
    return { supported: false, registered: 0, errors: [] };
  }

  const errors = [];
  let registered = 0;
  const controller = new AbortController();

  const requiredSearchTool = tools.find((tool) => tool.name === "search_products");
  const remainingTools = tools.filter((tool) => tool !== requiredSearchTool);

  if (requiredSearchTool) {
    try {
      await document.modelContext.registerTool({
        name: "search_products",
        description: "Search the product catalog",
        title: requiredSearchTool.title,
        inputSchema: requiredSearchTool.inputSchema,
        annotations: requiredSearchTool.annotations,
        execute: async (input, options) => requiredSearchTool.execute(input, options)
      }, { signal: controller.signal });
      registered += 1;
    } catch (error) {
      errors.push({ name: requiredSearchTool.name, message: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const tool of remainingTools) {
    try {
      await document.modelContext.registerTool(tool, { signal: controller.signal });
      registered += 1;
    } catch (error) {
      errors.push({ name: tool.name, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const supported = registered === tools.length;
  onStatus({
    supported,
    registered,
    message: supported
      ? `WebMCP ready · ${registered} tools`
      : `WebMCP partial · ${registered}/${tools.length} tools`
  });

  return { supported, registered, errors, controller };
}
