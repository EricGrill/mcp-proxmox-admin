// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, type Config } from "./config/index.js";
import { TransportRouter } from "./transports/index.js";

// Tool handler type
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

// Tool registry
const tools: Map<string, ToolHandler> = new Map();

// Tool definitions for ListTools response
const toolDefinitions: Tool[] = [
  // VM Tools
  {
    name: "proxmox_vm_list",
    description: "List all virtual machines across all nodes or on a specific node",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Optional node name to filter VMs. If not provided, lists VMs from all nodes.",
        },
      },
      required: [],
    },
  },
  {
    name: "proxmox_vm_start",
    description: "Start a virtual machine",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the VM is located",
        },
        vmid: {
          type: "number",
          description: "VM ID to start",
        },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "proxmox_vm_stop",
    description: "Stop a virtual machine immediately (hard stop)",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the VM is located",
        },
        vmid: {
          type: "number",
          description: "VM ID to stop",
        },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "proxmox_vm_shutdown",
    description: "Gracefully shutdown a virtual machine (sends ACPI shutdown signal)",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the VM is located",
        },
        vmid: {
          type: "number",
          description: "VM ID to shutdown",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds to wait for shutdown (default: 60)",
        },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "proxmox_vm_restart",
    description: "Restart a virtual machine",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the VM is located",
        },
        vmid: {
          type: "number",
          description: "VM ID to restart",
        },
      },
      required: ["node", "vmid"],
    },
  },

  // Container Tools
  {
    name: "proxmox_ct_list",
    description: "List all LXC containers across all nodes or on a specific node",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Optional node name to filter containers. If not provided, lists containers from all nodes.",
        },
      },
      required: [],
    },
  },
  {
    name: "proxmox_ct_start",
    description: "Start an LXC container",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the container is located",
        },
        vmid: {
          type: "number",
          description: "Container ID to start",
        },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "proxmox_ct_stop",
    description: "Stop an LXC container immediately",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the container is located",
        },
        vmid: {
          type: "number",
          description: "Container ID to stop",
        },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "proxmox_ct_restart",
    description: "Restart an LXC container",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the container is located",
        },
        vmid: {
          type: "number",
          description: "Container ID to restart",
        },
      },
      required: ["node", "vmid"],
    },
  },

  // Node Tools
  {
    name: "proxmox_node_list",
    description: "List all nodes in the Proxmox cluster",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "proxmox_node_status",
    description: "Get detailed status of a specific node",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name to get status for",
        },
      },
      required: ["node"],
    },
  },

  // Storage Tools
  {
    name: "proxmox_storage_list",
    description: "List all storage resources across all nodes or on a specific node",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Optional node name to filter storage. If not provided, lists storage from all nodes.",
        },
      },
      required: [],
    },
  },

  // Snapshot Tools
  {
    name: "proxmox_snapshot_list",
    description: "List all snapshots for a VM or container",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the VM/container is located",
        },
        vmid: {
          type: "number",
          description: "VM or container ID",
        },
        type: {
          type: "string",
          enum: ["vm", "ct"],
          description: "Type of resource: 'vm' for virtual machine, 'ct' for container",
        },
      },
      required: ["node", "vmid", "type"],
    },
  },
  {
    name: "proxmox_snapshot_create",
    description: "Create a snapshot of a VM or container",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the VM/container is located",
        },
        vmid: {
          type: "number",
          description: "VM or container ID",
        },
        type: {
          type: "string",
          enum: ["vm", "ct"],
          description: "Type of resource: 'vm' for virtual machine, 'ct' for container",
        },
        name: {
          type: "string",
          description: "Name for the snapshot (alphanumeric, no spaces)",
        },
        description: {
          type: "string",
          description: "Optional description for the snapshot",
        },
      },
      required: ["node", "vmid", "type", "name"],
    },
  },
  {
    name: "proxmox_snapshot_restore",
    description: "Restore a VM or container to a previous snapshot",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the VM/container is located",
        },
        vmid: {
          type: "number",
          description: "VM or container ID",
        },
        type: {
          type: "string",
          enum: ["vm", "ct"],
          description: "Type of resource: 'vm' for virtual machine, 'ct' for container",
        },
        name: {
          type: "string",
          description: "Name of the snapshot to restore",
        },
      },
      required: ["node", "vmid", "type", "name"],
    },
  },
  {
    name: "proxmox_snapshot_delete",
    description: "Delete a snapshot from a VM or container",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the VM/container is located",
        },
        vmid: {
          type: "number",
          description: "VM or container ID",
        },
        type: {
          type: "string",
          enum: ["vm", "ct"],
          description: "Type of resource: 'vm' for virtual machine, 'ct' for container",
        },
        name: {
          type: "string",
          description: "Name of the snapshot to delete",
        },
      },
      required: ["node", "vmid", "type", "name"],
    },
  },
];

// Tool registration functions (to be implemented in Task 9)
// These will be called to register tool handlers with the tools Map

export function registerVMTools(
  toolRegistry: Map<string, ToolHandler>,
  router: TransportRouter,
  config: Config
): void {
  // Placeholder - Task 9 will implement actual handlers
  toolRegistry.set("proxmox_vm_list", async (args) => {
    const transport = router.getTransport(undefined, "read");
    return transport.listVMs(args.node as string | undefined);
  });

  toolRegistry.set("proxmox_vm_start", async (args) => {
    const transport = router.getTransport(undefined, "write");
    return transport.startVM(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_vm_stop", async (args) => {
    const transport = router.getTransport(undefined, "write");
    return transport.stopVM(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_vm_shutdown", async (args) => {
    const transport = router.getTransport(undefined, "write");
    return transport.shutdownVM(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_vm_restart", async (args) => {
    const transport = router.getTransport(undefined, "write");
    return transport.restartVM(args.node as string, args.vmid as number);
  });
}

export function registerContainerTools(
  toolRegistry: Map<string, ToolHandler>,
  router: TransportRouter,
  config: Config
): void {
  // Placeholder - Task 9 will implement actual handlers
  toolRegistry.set("proxmox_ct_list", async (args) => {
    const transport = router.getTransport(undefined, "read");
    return transport.listContainers(args.node as string | undefined);
  });

  toolRegistry.set("proxmox_ct_start", async (args) => {
    const transport = router.getTransport(undefined, "write");
    return transport.startContainer(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_ct_stop", async (args) => {
    const transport = router.getTransport(undefined, "write");
    return transport.stopContainer(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_ct_restart", async (args) => {
    const transport = router.getTransport(undefined, "write");
    return transport.restartContainer(args.node as string, args.vmid as number);
  });
}

export function registerNodeTools(
  toolRegistry: Map<string, ToolHandler>,
  router: TransportRouter,
  config: Config
): void {
  // Placeholder - Task 9 will implement actual handlers
  toolRegistry.set("proxmox_node_list", async () => {
    const transport = router.getTransport(undefined, "read");
    return transport.listNodes();
  });

  toolRegistry.set("proxmox_node_status", async (args) => {
    const transport = router.getTransport(undefined, "read");
    return transport.getNodeStatus(args.node as string);
  });
}

export function registerStorageTools(
  toolRegistry: Map<string, ToolHandler>,
  router: TransportRouter,
  config: Config
): void {
  // Placeholder - Task 9 will implement actual handlers
  toolRegistry.set("proxmox_storage_list", async (args) => {
    const transport = router.getTransport(undefined, "read");
    return transport.listStorage(args.node as string | undefined);
  });
}

export function registerSnapshotTools(
  toolRegistry: Map<string, ToolHandler>,
  router: TransportRouter,
  config: Config
): void {
  // Placeholder - Task 9 will implement actual handlers
  toolRegistry.set("proxmox_snapshot_list", async (args) => {
    const transport = router.getTransport(undefined, "snapshot");
    return transport.listSnapshots(
      args.node as string,
      args.vmid as number,
      args.type as "vm" | "ct"
    );
  });

  toolRegistry.set("proxmox_snapshot_create", async (args) => {
    const transport = router.getTransport(undefined, "snapshot");
    return transport.createSnapshot(
      args.node as string,
      args.vmid as number,
      args.type as "vm" | "ct",
      args.name as string,
      args.description as string | undefined
    );
  });

  toolRegistry.set("proxmox_snapshot_restore", async (args) => {
    const transport = router.getTransport(undefined, "snapshot");
    return transport.restoreSnapshot(
      args.node as string,
      args.vmid as number,
      args.type as "vm" | "ct",
      args.name as string
    );
  });

  toolRegistry.set("proxmox_snapshot_delete", async (args) => {
    const transport = router.getTransport(undefined, "snapshot");
    return transport.deleteSnapshot(
      args.node as string,
      args.vmid as number,
      args.type as "vm" | "ct",
      args.name as string
    );
  });
}

async function main(): Promise<void> {
  // Create MCP server instance
  const server = new Server(
    { name: "mcp-proxmox-admin", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // Load configuration from MCP settings
  const mcpSettings = JSON.parse(process.env.MCP_SETTINGS ?? "{}");
  const config = loadConfig(mcpSettings);

  // Initialize transport router
  const router = new TransportRouter(config);

  // Register all tools
  registerVMTools(tools, router, config);
  registerContainerTools(tools, router, config);
  registerNodeTools(tools, router, config);
  registerStorageTools(tools, router, config);
  registerSnapshotTools(tools, router, config);

  // ListTools handler - returns all tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolDefinitions };
  });

  // CallTool handler - executes the requested tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const handler = tools.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      const result = await handler(args ?? {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: errorMessage }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  // Connect the transport router
  await router.connect();

  // Set up graceful shutdown
  const cleanup = async (): Promise<void> => {
    await router.disconnect();
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  // Start the server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run the main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
