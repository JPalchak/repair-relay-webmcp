function getModelContext() {
  if (document.modelContext && typeof document.modelContext.registerTool === "function") {
    return { context: document.modelContext, api: "document.modelContext" };
  }
  if (navigator.modelContext && typeof navigator.modelContext.registerTool === "function") {
    return { context: navigator.modelContext, api: "navigator.modelContext preview" };
  }
  return null;
}

function browserCompatibleTool(tool, fallbackSignal) {
  return {
    ...tool,
    execute: (input, options = { signal: fallbackSignal }) => tool.execute(input, options)
  };
}

export async function registerWebMCPTools(tools, onStatus = () => {}) {
  const model = getModelContext();
  if (!model) {
    onStatus({
      supported: false,
      registered: 0,
      message: "WebMCP unavailable · human app remains usable"
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
      const requiredTool = browserCompatibleTool({
        name: "search_products",
        description: "Search the product catalog",
        title: requiredSearchTool.title,
        inputSchema: requiredSearchTool.inputSchema,
        annotations: requiredSearchTool.annotations,
        execute: async (input, options = { signal: controller.signal }) => requiredSearchTool.execute(input, options)
      }, controller.signal);
      if (document.modelContext) {
        await document.modelContext.registerTool({
          name: "search_products",
          description: "Search the product catalog",
          title: requiredSearchTool.title,
          inputSchema: requiredSearchTool.inputSchema,
          annotations: requiredSearchTool.annotations,
          execute: async (input, options = { signal: controller.signal }) => requiredSearchTool.execute(input, options)
        }, { signal: controller.signal });
      } else {
        await model.context.registerTool(requiredTool, { signal: controller.signal });
      }
      registered += 1;
    } catch (error) {
      errors.push({ name: requiredSearchTool.name, message: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const tool of remainingTools) {
    try {
      await model.context.registerTool(browserCompatibleTool(tool, controller.signal), { signal: controller.signal });
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

  window.addEventListener("pagehide", () => controller.abort("Label Relay page unloaded."), { once: true });
  return { supported, registered, errors, controller, api: model.api };
}
