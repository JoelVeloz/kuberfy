export const appSizes = [
  { id: "nano", label: "Nano", cpuLimit: 0.1, memoryLimitMb: 128 },
  { id: "micro", label: "Micro", cpuLimit: 0.25, memoryLimitMb: 256 },
  { id: "small", label: "Small", cpuLimit: 0.5, memoryLimitMb: 512 },
  { id: "medium", label: "Medium", cpuLimit: 1, memoryLimitMb: 1024 },
  { id: "large", label: "Large", cpuLimit: 2, memoryLimitMb: 2048 },
] as const;

export type AppSizeId = (typeof appSizes)[number]["id"];

export const defaultAppSize = appSizes[0];
