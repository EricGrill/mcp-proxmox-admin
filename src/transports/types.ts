// src/transports/types.ts
import type {
  TaskResult,
  VMStatus,
  ContainerStatus,
  NodeStatus,
  StorageInfo,
  Snapshot,
  VMCreateConfig,
  VMCloneConfig,
  VMDeleteConfig,
  ContainerCreateConfig,
  ContainerCloneConfig,
  ContainerDeleteConfig,
} from "../types/proxmox.js";

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface Transport {
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Raw execution
  executeCommand(command: string): Promise<CommandResult>;
  apiRequest<T>(method: string, endpoint: string, data?: unknown): Promise<T>;

  // VM operations
  listVMs(node?: string): Promise<VMStatus[]>;
  getVM(node: string, vmid: number): Promise<VMStatus>;
  startVM(node: string, vmid: number): Promise<TaskResult>;
  stopVM(node: string, vmid: number): Promise<TaskResult>;
  shutdownVM(node: string, vmid: number): Promise<TaskResult>;
  restartVM(node: string, vmid: number): Promise<TaskResult>;
  createVM(node: string, config: VMCreateConfig): Promise<TaskResult>;
  deleteVM(node: string, vmid: number, options?: VMDeleteConfig): Promise<TaskResult>;
  cloneVM(node: string, config: VMCloneConfig): Promise<TaskResult>;

  // Container operations
  listContainers(node?: string): Promise<ContainerStatus[]>;
  getContainer(node: string, vmid: number): Promise<ContainerStatus>;
  startContainer(node: string, vmid: number): Promise<TaskResult>;
  stopContainer(node: string, vmid: number): Promise<TaskResult>;
  restartContainer(node: string, vmid: number): Promise<TaskResult>;
  createContainer(node: string, config: ContainerCreateConfig): Promise<TaskResult>;
  deleteContainer(node: string, vmid: number, options?: ContainerDeleteConfig): Promise<TaskResult>;
  cloneContainer(node: string, config: ContainerCloneConfig): Promise<TaskResult>;

  // Node operations
  listNodes(): Promise<NodeStatus[]>;
  getNodeStatus(node: string): Promise<NodeStatus>;

  // Storage operations
  listStorage(node?: string): Promise<StorageInfo[]>;

  // Snapshot operations
  listSnapshots(node: string, vmid: number, type: "vm" | "ct"): Promise<Snapshot[]>;
  createSnapshot(node: string, vmid: number, type: "vm" | "ct", name: string, description?: string): Promise<TaskResult>;
  deleteSnapshot(node: string, vmid: number, type: "vm" | "ct", name: string): Promise<TaskResult>;
  restoreSnapshot(node: string, vmid: number, type: "vm" | "ct", name: string): Promise<TaskResult>;
}

export type TransportType = "ssh" | "api" | "auto";
