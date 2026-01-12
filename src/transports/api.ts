// src/transports/api.ts
import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import https from "https";
import type { Config } from "../config/index.js";
import type { Transport, CommandResult } from "./types.js";
import type {
  VMStatus,
  ContainerStatus,
  NodeStatus,
  StorageInfo,
  Snapshot,
  TaskResult,
  VMCreateConfig,
  VMCloneConfig,
  VMDeleteConfig,
  ContainerCreateConfig,
  ContainerCloneConfig,
  ContainerDeleteConfig,
} from "../types/proxmox.js";

interface ProxmoxResponse<T> {
  data: T;
}

export class APITransport implements Transport {
  private client: AxiosInstance;
  private config: Config;
  private connected: boolean = false;

  constructor(config: Config) {
    this.config = config;

    const httpsAgent = new https.Agent({
      rejectUnauthorized: config.verifySsl,
    });

    this.client = axios.create({
      baseURL: this.getBaseUrl(),
      timeout: config.timeout,
      httpsAgent,
      headers: {
        Authorization: this.getAuthHeader(),
      },
    });
  }

  getBaseUrl(): string {
    return `https://${this.config.host}:${this.config.port}/api2/json`;
  }

  getAuthHeader(): string {
    return `PVEAPIToken=${this.config.apiTokenId}=${this.config.apiTokenSecret}`;
  }

  async connect(): Promise<void> {
    // Test connection by fetching version info
    try {
      await this.client.get("/version");
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw new Error(
        `Failed to connect to Proxmox API: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async executeCommand(_command: string): Promise<CommandResult> {
    throw new Error(
      "API transport does not support direct command execution. Use SSH transport instead."
    );
  }

  async apiRequest<T>(
    method: string,
    endpoint: string,
    data?: unknown
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      method: method.toLowerCase(),
      url: endpoint,
    };

    if (data) {
      if (method.toLowerCase() === "get") {
        config.params = data;
      } else {
        config.data = data;
      }
    }

    const response = await this.client.request<ProxmoxResponse<T>>(config);
    return response.data.data;
  }

  private async getDefaultNode(): Promise<string> {
    if (this.config.defaultNode) {
      return this.config.defaultNode;
    }
    const nodes = await this.listNodes();
    if (nodes.length === 0) {
      throw new Error("No nodes available");
    }
    return nodes[0].node;
  }

  // VM Operations
  async listVMs(node?: string): Promise<VMStatus[]> {
    const targetNode = node || (await this.getDefaultNode());
    const data = await this.apiRequest<Array<Record<string, unknown>>>(
      "GET",
      `/nodes/${targetNode}/qemu`
    );

    return data.map((item) => ({
      vmid: item.vmid as number,
      name: (item.name as string) || `vm-${item.vmid}`,
      status: item.status as "running" | "stopped" | "paused",
      node: targetNode,
      cpu: (item.cpu as number) || 0,
      mem: (item.mem as number) || 0,
      maxmem: (item.maxmem as number) || 0,
      disk: (item.disk as number) || 0,
      maxdisk: (item.maxdisk as number) || 0,
      uptime: (item.uptime as number) || 0,
      template: item.template === 1,
    }));
  }

  async getVM(node: string, vmid: number): Promise<VMStatus> {
    const data = await this.apiRequest<Record<string, unknown>>(
      "GET",
      `/nodes/${node}/qemu/${vmid}/status/current`
    );

    return {
      vmid,
      name: (data.name as string) || `vm-${vmid}`,
      status: data.status as "running" | "stopped" | "paused",
      node,
      cpu: (data.cpu as number) || 0,
      mem: (data.mem as number) || 0,
      maxmem: (data.maxmem as number) || 0,
      disk: (data.disk as number) || 0,
      maxdisk: (data.maxdisk as number) || 0,
      uptime: (data.uptime as number) || 0,
      template: data.template === 1,
    };
  }

  async startVM(node: string, vmid: number): Promise<TaskResult> {
    try {
      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/qemu/${vmid}/status/start`
      );
      return {
        success: true,
        taskId,
        message: `VM ${vmid} start initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async stopVM(node: string, vmid: number): Promise<TaskResult> {
    try {
      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/qemu/${vmid}/status/stop`
      );
      return {
        success: true,
        taskId,
        message: `VM ${vmid} stop initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async shutdownVM(node: string, vmid: number): Promise<TaskResult> {
    try {
      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/qemu/${vmid}/status/shutdown`
      );
      return {
        success: true,
        taskId,
        message: `VM ${vmid} shutdown initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async restartVM(node: string, vmid: number): Promise<TaskResult> {
    try {
      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/qemu/${vmid}/status/reboot`
      );
      return {
        success: true,
        taskId,
        message: `VM ${vmid} restart initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createVM(node: string, config: VMCreateConfig): Promise<TaskResult> {
    try {
      // Build API payload from config
      const payload: Record<string, unknown> = { vmid: config.vmid };

      // Map config properties to API parameters
      if (config.name) payload.name = config.name;
      if (config.memory) payload.memory = config.memory;
      if (config.cores) payload.cores = config.cores;
      if (config.sockets) payload.sockets = config.sockets;
      if (config.cpu) payload.cpu = config.cpu;
      if (config.scsihw) payload.scsihw = config.scsihw;
      if (config.bios) payload.bios = config.bios;
      if (config.boot) payload.boot = config.boot;
      if (config.ostype) payload.ostype = config.ostype;
      if (config.agent) payload.agent = config.agent;
      if (config.onboot !== undefined) payload.onboot = config.onboot ? 1 : 0;
      if (config.protection !== undefined) payload.protection = config.protection ? 1 : 0;
      if (config.start !== undefined) payload.start = config.start ? 1 : 0;
      if (config.description) payload.description = config.description;
      if (config.tags) payload.tags = config.tags;
      if (config.net0) payload.net0 = config.net0;

      // Handle disk configuration
      if (config.storage && config.diskSize) {
        payload.scsi0 = `${config.storage}:${config.diskSize}`;
      }

      // Handle ISO/CD-ROM
      if (config.iso) {
        payload.ide2 = `${config.iso},media=cdrom`;
      } else if (config.cdrom) {
        payload.ide2 = config.cdrom;
      }

      // Pass through any additional parameters
      for (const [key, value] of Object.entries(config)) {
        if (!(key in payload) && !["vmid", "storage", "diskSize", "iso"].includes(key)) {
          payload[key] = value;
        }
      }

      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/qemu`,
        payload
      );
      return {
        success: true,
        taskId,
        message: `VM ${config.vmid} creation initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async deleteVM(node: string, vmid: number, options?: VMDeleteConfig): Promise<TaskResult> {
    try {
      const params: Record<string, unknown> = {};
      if (options?.purge) params.purge = 1;
      if (options?.destroyUnreferencedDisks !== false) params["destroy-unreferenced-disks"] = 1;

      const taskId = await this.apiRequest<string>(
        "DELETE",
        `/nodes/${node}/qemu/${vmid}`,
        Object.keys(params).length > 0 ? params : undefined
      );
      return {
        success: true,
        taskId,
        message: `VM ${vmid} deletion initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async cloneVM(node: string, config: VMCloneConfig): Promise<TaskResult> {
    try {
      const payload: Record<string, unknown> = { newid: config.newid };

      if (config.name) payload.name = config.name;
      if (config.target) payload.target = config.target;
      if (config.full !== undefined) payload.full = config.full ? 1 : 0;
      if (config.storage) payload.storage = config.storage;
      if (config.format) payload.format = config.format;
      if (config.description) payload.description = config.description;

      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/qemu/${config.vmid}/clone`,
        payload
      );
      return {
        success: true,
        taskId,
        message: `VM ${config.vmid} clone to ${config.newid} initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Container Operations
  async listContainers(node?: string): Promise<ContainerStatus[]> {
    const targetNode = node || (await this.getDefaultNode());
    const data = await this.apiRequest<Array<Record<string, unknown>>>(
      "GET",
      `/nodes/${targetNode}/lxc`
    );

    return data.map((item) => ({
      vmid: item.vmid as number,
      name: (item.name as string) || `ct-${item.vmid}`,
      status: item.status as "running" | "stopped",
      node: targetNode,
      cpu: (item.cpu as number) || 0,
      mem: (item.mem as number) || 0,
      maxmem: (item.maxmem as number) || 0,
      disk: (item.disk as number) || 0,
      maxdisk: (item.maxdisk as number) || 0,
      uptime: (item.uptime as number) || 0,
      template: item.template === 1,
    }));
  }

  async getContainer(node: string, vmid: number): Promise<ContainerStatus> {
    const data = await this.apiRequest<Record<string, unknown>>(
      "GET",
      `/nodes/${node}/lxc/${vmid}/status/current`
    );

    return {
      vmid,
      name: (data.name as string) || `ct-${vmid}`,
      status: data.status as "running" | "stopped",
      node,
      cpu: (data.cpu as number) || 0,
      mem: (data.mem as number) || 0,
      maxmem: (data.maxmem as number) || 0,
      disk: (data.disk as number) || 0,
      maxdisk: (data.maxdisk as number) || 0,
      uptime: (data.uptime as number) || 0,
      template: data.template === 1,
    };
  }

  async startContainer(node: string, vmid: number): Promise<TaskResult> {
    try {
      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/lxc/${vmid}/status/start`
      );
      return {
        success: true,
        taskId,
        message: `Container ${vmid} start initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async stopContainer(node: string, vmid: number): Promise<TaskResult> {
    try {
      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/lxc/${vmid}/status/stop`
      );
      return {
        success: true,
        taskId,
        message: `Container ${vmid} stop initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async restartContainer(node: string, vmid: number): Promise<TaskResult> {
    try {
      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/lxc/${vmid}/status/reboot`
      );
      return {
        success: true,
        taskId,
        message: `Container ${vmid} restart initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createContainer(node: string, config: ContainerCreateConfig): Promise<TaskResult> {
    try {
      const payload: Record<string, unknown> = {
        vmid: config.vmid,
        ostemplate: config.ostemplate,
      };

      // Map config properties to API parameters
      if (config.hostname) payload.hostname = config.hostname;
      if (config.memory) payload.memory = config.memory;
      if (config.swap !== undefined) payload.swap = config.swap;
      if (config.cores) payload.cores = config.cores;
      if (config.cpulimit !== undefined) payload.cpulimit = config.cpulimit;
      if (config.nameserver) payload.nameserver = config.nameserver;
      if (config.searchdomain) payload.searchdomain = config.searchdomain;
      if (config.unprivileged !== undefined) payload.unprivileged = config.unprivileged ? 1 : 0;
      if (config.features) payload.features = config.features;
      if (config.password) payload.password = config.password;
      if (config["ssh-public-keys"]) payload["ssh-public-keys"] = config["ssh-public-keys"];
      if (config.onboot !== undefined) payload.onboot = config.onboot ? 1 : 0;
      if (config.protection !== undefined) payload.protection = config.protection ? 1 : 0;
      if (config.start !== undefined) payload.start = config.start ? 1 : 0;
      if (config.description) payload.description = config.description;
      if (config.tags) payload.tags = config.tags;
      if (config.net0) payload.net0 = config.net0;

      // Handle rootfs configuration
      if (config.storage && config.rootfs) {
        payload.rootfs = `${config.storage}:${config.rootfs}`;
      } else if (config.rootfs) {
        payload.rootfs = config.rootfs;
      } else if (config.storage) {
        payload.rootfs = `${config.storage}:8`;
      }

      // Pass through any additional parameters
      for (const [key, value] of Object.entries(config)) {
        if (!(key in payload) && !["vmid", "ostemplate", "storage"].includes(key)) {
          payload[key] = value;
        }
      }

      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/lxc`,
        payload
      );
      return {
        success: true,
        taskId,
        message: `Container ${config.vmid} creation initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async deleteContainer(node: string, vmid: number, options?: ContainerDeleteConfig): Promise<TaskResult> {
    try {
      const params: Record<string, unknown> = {};
      if (options?.purge) params.purge = 1;
      if (options?.force) params.force = 1;

      const taskId = await this.apiRequest<string>(
        "DELETE",
        `/nodes/${node}/lxc/${vmid}`,
        Object.keys(params).length > 0 ? params : undefined
      );
      return {
        success: true,
        taskId,
        message: `Container ${vmid} deletion initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async cloneContainer(node: string, config: ContainerCloneConfig): Promise<TaskResult> {
    try {
      const payload: Record<string, unknown> = { newid: config.newid };

      if (config.hostname) payload.hostname = config.hostname;
      if (config.target) payload.target = config.target;
      if (config.full !== undefined) payload.full = config.full ? 1 : 0;
      if (config.storage) payload.storage = config.storage;
      if (config.description) payload.description = config.description;

      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/lxc/${config.vmid}/clone`,
        payload
      );
      return {
        success: true,
        taskId,
        message: `Container ${config.vmid} clone to ${config.newid} initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Node Operations
  async listNodes(): Promise<NodeStatus[]> {
    const data = await this.apiRequest<Array<Record<string, unknown>>>(
      "GET",
      "/nodes"
    );

    return data.map((item) => ({
      node: item.node as string,
      status: item.status as "online" | "offline",
      cpu: (item.cpu as number) || 0,
      maxcpu: (item.maxcpu as number) || 0,
      mem: (item.mem as number) || 0,
      maxmem: (item.maxmem as number) || 0,
      disk: (item.disk as number) || 0,
      maxdisk: (item.maxdisk as number) || 0,
      uptime: (item.uptime as number) || 0,
    }));
  }

  async getNodeStatus(node: string): Promise<NodeStatus> {
    const data = await this.apiRequest<Record<string, unknown>>(
      "GET",
      `/nodes/${node}/status`
    );

    return {
      node,
      status: "online",
      cpu: (data.cpu as number) || 0,
      maxcpu:
        ((data.cpuinfo as Record<string, unknown>)?.cpus as number) || 0,
      mem:
        ((data.memory as Record<string, unknown>)?.used as number) || 0,
      maxmem:
        ((data.memory as Record<string, unknown>)?.total as number) || 0,
      disk:
        ((data.rootfs as Record<string, unknown>)?.used as number) || 0,
      maxdisk:
        ((data.rootfs as Record<string, unknown>)?.total as number) || 0,
      uptime: (data.uptime as number) || 0,
    };
  }

  // Storage Operations
  async listStorage(node?: string): Promise<StorageInfo[]> {
    const targetNode = node || (await this.getDefaultNode());
    const data = await this.apiRequest<Array<Record<string, unknown>>>(
      "GET",
      `/nodes/${targetNode}/storage`
    );

    return data.map((item) => ({
      storage: item.storage as string,
      type: item.type as string,
      content: (item.content as string) || "",
      active: (item.active as number) === 1,
      enabled: (item.enabled as number) === 1,
      shared: (item.shared as number) === 1,
      total: (item.total as number) || 0,
      used: (item.used as number) || 0,
      avail: (item.avail as number) || 0,
    }));
  }

  // Snapshot Operations
  async listSnapshots(
    node: string,
    vmid: number,
    type: "vm" | "ct"
  ): Promise<Snapshot[]> {
    const apiPath = type === "vm" ? "qemu" : "lxc";
    const data = await this.apiRequest<Array<Record<string, unknown>>>(
      "GET",
      `/nodes/${node}/${apiPath}/${vmid}/snapshot`
    );

    return data.map((item) => ({
      name: item.name as string,
      description: (item.description as string) || "",
      snaptime: item.snaptime as number | undefined,
      parent: item.parent as string | undefined,
    }));
  }

  async createSnapshot(
    node: string,
    vmid: number,
    type: "vm" | "ct",
    name: string,
    description?: string
  ): Promise<TaskResult> {
    const apiPath = type === "vm" ? "qemu" : "lxc";
    const payload: Record<string, string> = { snapname: name };
    if (description) {
      payload.description = description;
    }

    try {
      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/${apiPath}/${vmid}/snapshot`,
        payload
      );
      return {
        success: true,
        taskId,
        message: `Snapshot ${name} creation initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async deleteSnapshot(
    node: string,
    vmid: number,
    type: "vm" | "ct",
    name: string
  ): Promise<TaskResult> {
    const apiPath = type === "vm" ? "qemu" : "lxc";

    try {
      const taskId = await this.apiRequest<string>(
        "DELETE",
        `/nodes/${node}/${apiPath}/${vmid}/snapshot/${name}`
      );
      return {
        success: true,
        taskId,
        message: `Snapshot ${name} deletion initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async restoreSnapshot(
    node: string,
    vmid: number,
    type: "vm" | "ct",
    name: string
  ): Promise<TaskResult> {
    const apiPath = type === "vm" ? "qemu" : "lxc";

    try {
      const taskId = await this.apiRequest<string>(
        "POST",
        `/nodes/${node}/${apiPath}/${vmid}/snapshot/${name}/rollback`
      );
      return {
        success: true,
        taskId,
        message: `Snapshot ${name} restore initiated`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
