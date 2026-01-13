// src/transports/api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { APITransport } from "./api.js";
import type { Config } from "../config/index.js";
import type {
  VMCreateConfig,
  VMCloneConfig,
  VMDeleteConfig,
  ContainerCreateConfig,
  ContainerCloneConfig,
  ContainerDeleteConfig,
} from "../types/proxmox.js";

// Mock axios
const mockRequest = vi.fn();
const mockGet = vi.fn();

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      request: mockRequest,
    })),
  },
}));

describe("APITransport", () => {
  const baseConfig: Config = {
    host: "192.168.1.100",
    port: 8006,
    apiTokenId: "user@pam!token",
    apiTokenSecret: "secret-uuid",
    verifySsl: true,
    defaultTransport: "api",
    timeout: 30000,
    safeMode: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates instance with config", () => {
    const transport = new APITransport(baseConfig);
    expect(transport).toBeInstanceOf(APITransport);
  });

  it("builds correct base URL", () => {
    const transport = new APITransport(baseConfig);
    expect(transport.getBaseUrl()).toBe("https://192.168.1.100:8006/api2/json");
  });

  it("builds correct auth header", () => {
    const transport = new APITransport(baseConfig);
    const header = transport.getAuthHeader();
    expect(header).toBe("PVEAPIToken=user@pam!token=secret-uuid");
  });

  it("throws error for executeCommand", async () => {
    const transport = new APITransport(baseConfig);
    await expect(transport.executeCommand("test")).rejects.toThrow(
      "API transport does not support direct command execution"
    );
  });

  it("uses custom port in base URL", () => {
    const configWithPort: Config = { ...baseConfig, port: 443 };
    const transport = new APITransport(configWithPort);
    expect(transport.getBaseUrl()).toBe("https://192.168.1.100:443/api2/json");
  });
});

describe("APITransport - VM Operations", () => {
  let transport: APITransport;
  const config: Config = {
    host: "proxmox.example.com",
    port: 8006,
    apiTokenId: "user@pam!token",
    apiTokenSecret: "secret-token",
    sshPort: 22,
    sshUser: "root",
    defaultTransport: "api",
    verifySsl: false,
    timeout: 30000,
    safeMode: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    transport = new APITransport(config);
    mockGet.mockResolvedValue({ data: { data: { version: "7.0" } } });
    await transport.connect();
  });

  describe("createVM", () => {
    it("should create a VM with basic configuration", async () => {
      const vmConfig: VMCreateConfig = {
        vmid: 100,
        name: "test-vm",
        memory: 2048,
        cores: 2,
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000000" },
      });

      const result = await transport.createVM("pve", vmConfig);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe("UPID:node:00000000");
      expect(result.message).toContain("VM 100 creation initiated");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "post",
          url: "/nodes/pve/qemu",
          data: expect.objectContaining({
            vmid: 100,
            name: "test-vm",
            memory: 2048,
            cores: 2,
          }),
        })
      );
    });

    it("should create a VM with full configuration options", async () => {
      const vmConfig: VMCreateConfig = {
        vmid: 101,
        name: "full-vm",
        memory: 4096,
        cores: 4,
        sockets: 2,
        cpu: "host",
        storage: "local-lvm",
        diskSize: "32G",
        scsihw: "virtio-scsi-pci",
        net0: "virtio,bridge=vmbr0",
        bios: "ovmf",
        boot: "order=scsi0",
        ostype: "l26",
        agent: "1",
        onboot: true,
        start: true,
        description: "Test VM with full config",
        tags: "test;production",
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000001" },
      });

      const result = await transport.createVM("pve", vmConfig);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vmid: 101,
            name: "full-vm",
            memory: 4096,
            cores: 4,
            sockets: 2,
            cpu: "host",
            scsi0: "local-lvm:32G",
            scsihw: "virtio-scsi-pci",
            net0: "virtio,bridge=vmbr0",
            bios: "ovmf",
            boot: "order=scsi0",
            ostype: "l26",
            agent: "1",
            onboot: 1,
            start: 1,
            description: "Test VM with full config",
            tags: "test;production",
          }),
        })
      );
    });

    it("should create a VM with ISO configuration", async () => {
      const vmConfig: VMCreateConfig = {
        vmid: 102,
        name: "iso-vm",
        iso: "local:iso/debian-12.iso",
        storage: "local-lvm",
        diskSize: "20G",
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000002" },
      });

      const result = await transport.createVM("pve", vmConfig);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scsi0: "local-lvm:20G",
            ide2: "local:iso/debian-12.iso,media=cdrom",
          }),
        })
      );
    });

    it("should handle VM creation errors", async () => {
      const vmConfig: VMCreateConfig = {
        vmid: 103,
        name: "error-vm",
      };

      mockRequest.mockRejectedValue(new Error("VM ID already exists"));

      const result = await transport.createVM("pve", vmConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain("VM ID already exists");
    });
  });

  describe("deleteVM", () => {
    it("should delete a VM with default options", async () => {
      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000003" },
      });

      const result = await transport.deleteVM("pve", 100);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe("UPID:node:00000003");
      expect(result.message).toContain("VM 100 deletion initiated");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "delete",
          url: "/nodes/pve/qemu/100",
          data: expect.objectContaining({
            "destroy-unreferenced-disks": 1,
          }),
        })
      );
    });

    it("should delete a VM with purge option", async () => {
      const options: VMDeleteConfig = {
        vmid: 101,
        purge: true,
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000004" },
      });

      const result = await transport.deleteVM("pve", 101, options);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purge: 1,
            "destroy-unreferenced-disks": 1,
          }),
        })
      );
    });

    it("should delete a VM without destroying unreferenced disks", async () => {
      const options: VMDeleteConfig = {
        vmid: 102,
        destroyUnreferencedDisks: false,
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000005" },
      });

      const result = await transport.deleteVM("pve", 102, options);

      expect(result.success).toBe(true);
      const callArgs = mockRequest.mock.calls[0][0];
      expect(callArgs.method).toBe("delete");
      expect(callArgs.url).toBe("/nodes/pve/qemu/102");
      expect(callArgs.data).toBeUndefined();
    });

    it("should handle VM deletion errors", async () => {
      mockRequest.mockRejectedValue(new Error("VM not found"));

      const result = await transport.deleteVM("pve", 999);

      expect(result.success).toBe(false);
      expect(result.message).toContain("VM not found");
    });
  });

  describe("cloneVM", () => {
    it("should clone a VM with basic configuration", async () => {
      const cloneConfig: VMCloneConfig = {
        vmid: 100,
        newid: 200,
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000006" },
      });

      const result = await transport.cloneVM("pve", cloneConfig);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe("UPID:node:00000006");
      expect(result.message).toContain("VM 100 clone to 200 initiated");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "post",
          url: "/nodes/pve/qemu/100/clone",
          data: expect.objectContaining({
            newid: 200,
          }),
        })
      );
    });

    it("should clone a VM with full clone option", async () => {
      const cloneConfig: VMCloneConfig = {
        vmid: 100,
        newid: 201,
        name: "cloned-vm",
        full: true,
        storage: "local-lvm",
        format: "qcow2",
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000007" },
      });

      const result = await transport.cloneVM("pve", cloneConfig);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            newid: 201,
            name: "cloned-vm",
            full: 1,
            storage: "local-lvm",
            format: "qcow2",
          }),
        })
      );
    });

    it("should clone a VM to different target node", async () => {
      const cloneConfig: VMCloneConfig = {
        vmid: 100,
        newid: 202,
        target: "pve2",
        description: "Clone on different node",
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000008" },
      });

      const result = await transport.cloneVM("pve", cloneConfig);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            newid: 202,
            target: "pve2",
            description: "Clone on different node",
          }),
        })
      );
    });

    it("should create linked clone when full is false", async () => {
      const cloneConfig: VMCloneConfig = {
        vmid: 100,
        newid: 203,
        full: false,
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000009" },
      });

      const result = await transport.cloneVM("pve", cloneConfig);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            newid: 203,
            full: 0,
          }),
        })
      );
    });

    it("should handle VM clone errors", async () => {
      const cloneConfig: VMCloneConfig = {
        vmid: 100,
        newid: 999,
      };

      mockRequest.mockRejectedValue(new Error("Source VM not found"));

      const result = await transport.cloneVM("pve", cloneConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Source VM not found");
    });
  });
});

describe("APITransport - Container Operations", () => {
  let transport: APITransport;
  const config: Config = {
    host: "proxmox.example.com",
    port: 8006,
    apiTokenId: "user@pam!token",
    apiTokenSecret: "secret-token",
    sshPort: 22,
    sshUser: "root",
    defaultTransport: "api",
    verifySsl: false,
    timeout: 30000,
    safeMode: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    transport = new APITransport(config);
    mockGet.mockResolvedValue({ data: { data: { version: "7.0" } } });
    await transport.connect();
  });

  describe("createContainer", () => {
    it("should create a container with basic configuration", async () => {
      const ctConfig: ContainerCreateConfig = {
        vmid: 100,
        ostemplate: "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst",
        hostname: "test-ct",
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000010" },
      });

      const result = await transport.createContainer("pve", ctConfig);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe("UPID:node:00000010");
      expect(result.message).toContain("Container 100 creation initiated");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "post",
          url: "/nodes/pve/lxc",
          data: expect.objectContaining({
            vmid: 100,
            ostemplate: "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst",
            hostname: "test-ct",
          }),
        })
      );
    });

    it("should create a container with full configuration", async () => {
      const ctConfig: ContainerCreateConfig = {
        vmid: 101,
        ostemplate: "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst",
        hostname: "full-ct",
        memory: 1024,
        swap: 512,
        cores: 2,
        cpulimit: 1.5,
        storage: "local-lvm",
        rootfs: "8G",
        net0: "name=eth0,bridge=vmbr0,ip=dhcp",
        nameserver: "8.8.8.8",
        searchdomain: "example.com",
        unprivileged: true,
        features: "nesting=1",
        password: "secret",
        onboot: true,
        start: true,
        description: "Full container config",
        tags: "test;staging",
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000011" },
      });

      const result = await transport.createContainer("pve", ctConfig);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vmid: 101,
            ostemplate: "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst",
            hostname: "full-ct",
            memory: 1024,
            swap: 512,
            cores: 2,
            cpulimit: 1.5,
            rootfs: "local-lvm:8G",
            net0: "name=eth0,bridge=vmbr0,ip=dhcp",
            nameserver: "8.8.8.8",
            searchdomain: "example.com",
            unprivileged: 1,
            features: "nesting=1",
            password: "secret",
            onboot: 1,
            start: 1,
            description: "Full container config",
            tags: "test;staging",
          }),
        })
      );
    });

    it("should create a container with SSH keys", async () => {
      const ctConfig: ContainerCreateConfig = {
        vmid: 102,
        ostemplate: "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst",
        hostname: "ssh-ct",
        "ssh-public-keys": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAB...",
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000012" },
      });

      const result = await transport.createContainer("pve", ctConfig);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            "ssh-public-keys": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAB...",
          }),
        })
      );
    });

    it("should handle container creation errors", async () => {
      const ctConfig: ContainerCreateConfig = {
        vmid: 103,
        ostemplate: "invalid-template",
      };

      mockRequest.mockRejectedValue(new Error("Template not found"));

      const result = await transport.createContainer("pve", ctConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Template not found");
    });
  });

  describe("deleteContainer", () => {
    it("should delete a container with default options", async () => {
      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000013" },
      });

      const result = await transport.deleteContainer("pve", 100);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe("UPID:node:00000013");
      expect(result.message).toContain("Container 100 deletion initiated");
      const callArgs = mockRequest.mock.calls[0][0];
      expect(callArgs.method).toBe("delete");
      expect(callArgs.url).toBe("/nodes/pve/lxc/100");
      expect(callArgs.data).toBeUndefined();
    });

    it("should delete a container with purge option", async () => {
      const options: ContainerDeleteConfig = {
        vmid: 101,
        purge: true,
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000014" },
      });

      const result = await transport.deleteContainer("pve", 101, options);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purge: 1,
          }),
        })
      );
    });

    it("should delete a container with force option", async () => {
      const options: ContainerDeleteConfig = {
        vmid: 102,
        force: true,
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000015" },
      });

      const result = await transport.deleteContainer("pve", 102, options);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            force: 1,
          }),
        })
      );
    });

    it("should delete a container with both purge and force", async () => {
      const options: ContainerDeleteConfig = {
        vmid: 103,
        purge: true,
        force: true,
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000016" },
      });

      const result = await transport.deleteContainer("pve", 103, options);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purge: 1,
            force: 1,
          }),
        })
      );
    });

    it("should handle container deletion errors", async () => {
      mockRequest.mockRejectedValue(new Error("Container not found"));

      const result = await transport.deleteContainer("pve", 999);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Container not found");
    });
  });

  describe("cloneContainer", () => {
    it("should clone a container with basic configuration", async () => {
      const cloneConfig: ContainerCloneConfig = {
        vmid: 100,
        newid: 200,
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000017" },
      });

      const result = await transport.cloneContainer("pve", cloneConfig);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe("UPID:node:00000017");
      expect(result.message).toContain("Container 100 clone to 200 initiated");
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "post",
          url: "/nodes/pve/lxc/100/clone",
          data: expect.objectContaining({
            newid: 200,
          }),
        })
      );
    });

    it("should clone a container with full configuration", async () => {
      const cloneConfig: ContainerCloneConfig = {
        vmid: 100,
        newid: 201,
        hostname: "cloned-ct",
        full: true,
        storage: "local-lvm",
        description: "Cloned container",
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000018" },
      });

      const result = await transport.cloneContainer("pve", cloneConfig);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            newid: 201,
            hostname: "cloned-ct",
            full: 1,
            storage: "local-lvm",
            description: "Cloned container",
          }),
        })
      );
    });

    it("should clone a container to different target node", async () => {
      const cloneConfig: ContainerCloneConfig = {
        vmid: 100,
        newid: 202,
        target: "pve2",
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000019" },
      });

      const result = await transport.cloneContainer("pve", cloneConfig);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            newid: 202,
            target: "pve2",
          }),
        })
      );
    });

    it("should create linked clone when full is false", async () => {
      const cloneConfig: ContainerCloneConfig = {
        vmid: 100,
        newid: 203,
        full: false,
      };

      mockRequest.mockResolvedValue({
        data: { data: "UPID:node:00000020" },
      });

      const result = await transport.cloneContainer("pve", cloneConfig);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            newid: 203,
            full: 0,
          }),
        })
      );
    });

    it("should handle container clone errors", async () => {
      const cloneConfig: ContainerCloneConfig = {
        vmid: 100,
        newid: 999,
      };

      mockRequest.mockRejectedValue(new Error("Source container not found"));

      const result = await transport.cloneContainer("pve", cloneConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Source container not found");
    });
  });
});
