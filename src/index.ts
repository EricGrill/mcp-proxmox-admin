// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, type Config, type Transport } from "./config/index.js";
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
        },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "proxmox_vm_create",
    description: "Create a new virtual machine with full Proxmox configuration options",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the VM should be created",
        },
        vmid: {
          type: "number",
          description: "Unique VM ID (100-999999999)",
        },
        name: {
          type: "string",
          description: "VM name",
        },
        memory: {
          type: "number",
          description: "Memory in MB (default: 2048)",
        },
        cores: {
          type: "number",
          description: "Number of CPU cores (default: 1)",
        },
        sockets: {
          type: "number",
          description: "Number of CPU sockets (default: 1)",
        },
        cpu: {
          type: "string",
          description: "CPU type (default: host)",
        },
        storage: {
          type: "string",
          description: "Storage pool for primary disk",
        },
        diskSize: {
          type: "string",
          description: "Primary disk size (e.g., '32G')",
        },
        scsihw: {
          type: "string",
          description: "SCSI controller type (default: virtio-scsi-pci)",
        },
        net0: {
          type: "string",
          description: "Network configuration (e.g., 'virtio,bridge=vmbr0')",
        },
        bios: {
          type: "string",
          enum: ["seabios", "ovmf"],
          description: "BIOS type: seabios or ovmf (UEFI)",
        },
        boot: {
          type: "string",
          description: "Boot order string",
        },
        iso: {
          type: "string",
          description: "ISO image path for installation",
        },
        ostype: {
          type: "string",
          description: "OS type hint (l26, win10, etc.)",
        },
        agent: {
          type: "string",
          description: "QEMU guest agent configuration",
        },
        onboot: {
          type: "boolean",
          description: "Start VM on node boot",
        },
        start: {
          type: "boolean",
          description: "Start VM after creation",
        },
        description: {
          type: "string",
          description: "VM description",
        },
        tags: {
          type: "string",
          description: "Comma-separated tags",
        },
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
        },
      },
      required: ["node", "vmid", "name"],
    },
  },
  {
    name: "proxmox_vm_destroy",
    description: "Destroy a virtual machine permanently",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the VM is located",
        },
        vmid: {
          type: "number",
          description: "VM ID to destroy",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to confirm destruction",
        },
        purge: {
          type: "boolean",
          description: "Remove from backup jobs and HA (default: false)",
        },
        destroyUnreferencedDisks: {
          type: "boolean",
          description: "Remove orphaned disks (default: true)",
        },
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
        },
      },
      required: ["node", "vmid", "confirm"],
    },
  },
  {
    name: "proxmox_vm_clone",
    description: "Clone a virtual machine from a template or existing VM",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Source node name",
        },
        vmid: {
          type: "number",
          description: "Source VM ID to clone from",
        },
        newid: {
          type: "number",
          description: "Target VM ID for the clone",
        },
        name: {
          type: "string",
          description: "Name for the cloned VM",
        },
        target: {
          type: "string",
          description: "Target node (if different from source)",
        },
        full: {
          type: "boolean",
          description: "Full clone vs linked clone (default: true)",
        },
        storage: {
          type: "string",
          description: "Target storage for full clone",
        },
        format: {
          type: "string",
          enum: ["raw", "qcow2", "vmdk"],
          description: "Disk format for full clone",
        },
        description: {
          type: "string",
          description: "Description for the clone",
        },
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
        },
      },
      required: ["node", "vmid", "newid"],
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
        },
      },
      required: ["node", "vmid"],
    },
  },
  {
    name: "proxmox_ct_create",
    description: "Create a new LXC container with full Proxmox configuration options",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the container should be created",
        },
        vmid: {
          type: "number",
          description: "Unique container ID (100-999999999)",
        },
        ostemplate: {
          type: "string",
          description: "OS template path (e.g., 'local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst')",
        },
        hostname: {
          type: "string",
          description: "Container hostname",
        },
        memory: {
          type: "number",
          description: "Memory in MB (default: 512)",
        },
        swap: {
          type: "number",
          description: "Swap in MB (default: 512)",
        },
        cores: {
          type: "number",
          description: "Number of CPU cores (default: 1)",
        },
        cpulimit: {
          type: "number",
          description: "CPU limit (0-128, default: 0 = unlimited)",
        },
        storage: {
          type: "string",
          description: "Storage pool for rootfs",
        },
        rootfs: {
          type: "string",
          description: "Root filesystem size (e.g., '8G')",
        },
        net0: {
          type: "string",
          description: "Network configuration (e.g., 'name=eth0,bridge=vmbr0,ip=dhcp')",
        },
        nameserver: {
          type: "string",
          description: "DNS server",
        },
        searchdomain: {
          type: "string",
          description: "DNS search domain",
        },
        unprivileged: {
          type: "boolean",
          description: "Run as unprivileged container (default: true, recommended)",
        },
        features: {
          type: "string",
          description: "Container features (nesting, keyctl, fuse, etc.)",
        },
        password: {
          type: "string",
          description: "Root password",
        },
        sshKeys: {
          type: "string",
          description: "SSH public keys for root",
        },
        onboot: {
          type: "boolean",
          description: "Start container on node boot",
        },
        start: {
          type: "boolean",
          description: "Start container after creation",
        },
        description: {
          type: "string",
          description: "Container description",
        },
        tags: {
          type: "string",
          description: "Comma-separated tags",
        },
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
        },
      },
      required: ["node", "vmid", "ostemplate"],
    },
  },
  {
    name: "proxmox_ct_destroy",
    description: "Destroy an LXC container permanently",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Node name where the container is located",
        },
        vmid: {
          type: "number",
          description: "Container ID to destroy",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to confirm destruction",
        },
        purge: {
          type: "boolean",
          description: "Remove from backup jobs and HA (default: false)",
        },
        force: {
          type: "boolean",
          description: "Force destroy even if running (default: false)",
        },
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
        },
      },
      required: ["node", "vmid", "confirm"],
    },
  },
  {
    name: "proxmox_ct_clone",
    description: "Clone an LXC container from a template or existing container",
    inputSchema: {
      type: "object",
      properties: {
        node: {
          type: "string",
          description: "Source node name",
        },
        vmid: {
          type: "number",
          description: "Source container ID to clone from",
        },
        newid: {
          type: "number",
          description: "Target container ID for the clone",
        },
        hostname: {
          type: "string",
          description: "Hostname for the cloned container",
        },
        target: {
          type: "string",
          description: "Target node (if different from source)",
        },
        full: {
          type: "boolean",
          description: "Full clone vs linked clone (default: true)",
        },
        storage: {
          type: "string",
          description: "Target storage for full clone",
        },
        description: {
          type: "string",
          description: "Description for the clone",
        },
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
        },
      },
      required: ["node", "vmid", "newid"],
    },
  },

  // Node Tools
  {
    name: "proxmox_node_list",
    description: "List all nodes in the Proxmox cluster",
    inputSchema: {
      type: "object",
      properties: {
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
        },
      },
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
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
        confirm: {
          type: "boolean",
          description: "Must be true to confirm deletion",
        },
        transport: {
          type: "string",
          enum: ["ssh", "api", "auto"],
          description: "Transport to use (default: auto)",
        },
      },
      required: ["node", "vmid", "type", "name", "confirm"],
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
  toolRegistry.set("proxmox_vm_list", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "read");
    return transport.listVMs(args.node as string | undefined);
  });

  toolRegistry.set("proxmox_vm_start", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.startVM(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_vm_stop", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.stopVM(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_vm_shutdown", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.shutdownVM(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_vm_restart", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.restartVM(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_vm_create", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.createVM(args.node as string, {
      vmid: args.vmid as number,
      name: args.name as string,
      memory: args.memory as number | undefined,
      cores: args.cores as number | undefined,
      sockets: args.sockets as number | undefined,
      cpu: args.cpu as string | undefined,
      storage: args.storage as string | undefined,
      diskSize: args.diskSize as string | undefined,
      scsihw: args.scsihw as string | undefined,
      net0: args.net0 as string | undefined,
      bios: args.bios as "seabios" | "ovmf" | undefined,
      boot: args.boot as string | undefined,
      iso: args.iso as string | undefined,
      ostype: args.ostype as string | undefined,
      agent: args.agent as string | undefined,
      onboot: args.onboot as boolean | undefined,
      start: args.start as boolean | undefined,
      description: args.description as string | undefined,
      tags: args.tags as string | undefined,
    });
  });

  toolRegistry.set("proxmox_vm_destroy", async (args) => {
    if (args.confirm !== true) {
      throw new Error("Destruction requires confirm: true");
    }
    if (config.safeMode) {
      throw new Error("Destructive operations disabled in safe mode");
    }
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.deleteVM(args.node as string, args.vmid as number, {
      vmid: args.vmid as number,
      purge: args.purge as boolean | undefined,
      destroyUnreferencedDisks: args.destroyUnreferencedDisks as boolean | undefined,
    });
  });

  toolRegistry.set("proxmox_vm_clone", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.cloneVM(args.node as string, {
      vmid: args.vmid as number,
      newid: args.newid as number,
      name: args.name as string | undefined,
      target: args.target as string | undefined,
      full: args.full as boolean | undefined,
      storage: args.storage as string | undefined,
      format: args.format as "raw" | "qcow2" | "vmdk" | undefined,
      description: args.description as string | undefined,
    });
  });
}

export function registerContainerTools(
  toolRegistry: Map<string, ToolHandler>,
  router: TransportRouter,
  config: Config
): void {
  toolRegistry.set("proxmox_ct_list", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "read");
    return transport.listContainers(args.node as string | undefined);
  });

  toolRegistry.set("proxmox_ct_start", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.startContainer(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_ct_stop", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.stopContainer(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_ct_restart", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.restartContainer(args.node as string, args.vmid as number);
  });

  toolRegistry.set("proxmox_ct_create", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.createContainer(args.node as string, {
      vmid: args.vmid as number,
      ostemplate: args.ostemplate as string,
      hostname: args.hostname as string | undefined,
      memory: args.memory as number | undefined,
      swap: args.swap as number | undefined,
      cores: args.cores as number | undefined,
      cpulimit: args.cpulimit as number | undefined,
      storage: args.storage as string | undefined,
      rootfs: args.rootfs as string | undefined,
      net0: args.net0 as string | undefined,
      nameserver: args.nameserver as string | undefined,
      searchdomain: args.searchdomain as string | undefined,
      unprivileged: args.unprivileged as boolean | undefined,
      features: args.features as string | undefined,
      password: args.password as string | undefined,
      "ssh-public-keys": args.sshKeys as string | undefined,
      onboot: args.onboot as boolean | undefined,
      start: args.start as boolean | undefined,
      description: args.description as string | undefined,
      tags: args.tags as string | undefined,
    });
  });

  toolRegistry.set("proxmox_ct_destroy", async (args) => {
    if (args.confirm !== true) {
      throw new Error("Destruction requires confirm: true");
    }
    if (config.safeMode) {
      throw new Error("Destructive operations disabled in safe mode");
    }
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.deleteContainer(args.node as string, args.vmid as number, {
      vmid: args.vmid as number,
      purge: args.purge as boolean | undefined,
      force: args.force as boolean | undefined,
    });
  });

  toolRegistry.set("proxmox_ct_clone", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "write");
    return transport.cloneContainer(args.node as string, {
      vmid: args.vmid as number,
      newid: args.newid as number,
      hostname: args.hostname as string | undefined,
      target: args.target as string | undefined,
      full: args.full as boolean | undefined,
      storage: args.storage as string | undefined,
      description: args.description as string | undefined,
    });
  });
}

export function registerNodeTools(
  toolRegistry: Map<string, ToolHandler>,
  router: TransportRouter,
  _config: Config
): void {
  toolRegistry.set("proxmox_node_list", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "read");
    return transport.listNodes();
  });

  toolRegistry.set("proxmox_node_status", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "read");
    return transport.getNodeStatus(args.node as string);
  });
}

export function registerStorageTools(
  toolRegistry: Map<string, ToolHandler>,
  router: TransportRouter,
  _config: Config
): void {
  toolRegistry.set("proxmox_storage_list", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "read");
    return transport.listStorage(args.node as string | undefined);
  });
}

export function registerSnapshotTools(
  toolRegistry: Map<string, ToolHandler>,
  router: TransportRouter,
  config: Config
): void {
  toolRegistry.set("proxmox_snapshot_list", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "snapshot");
    return transport.listSnapshots(
      args.node as string,
      args.vmid as number,
      args.type as "vm" | "ct"
    );
  });

  toolRegistry.set("proxmox_snapshot_create", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "snapshot");
    return transport.createSnapshot(
      args.node as string,
      args.vmid as number,
      args.type as "vm" | "ct",
      args.name as string,
      args.description as string | undefined
    );
  });

  toolRegistry.set("proxmox_snapshot_restore", async (args) => {
    const transport = router.getTransport(args.transport as Transport | undefined, "snapshot");
    return transport.restoreSnapshot(
      args.node as string,
      args.vmid as number,
      args.type as "vm" | "ct",
      args.name as string
    );
  });

  toolRegistry.set("proxmox_snapshot_delete", async (args) => {
    if (args.confirm !== true) {
      throw new Error("Deletion requires confirm: true");
    }
    if (config.safeMode) {
      throw new Error("Delete operations disabled in safe mode");
    }
    const transport = router.getTransport(args.transport as Transport | undefined, "snapshot");
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
