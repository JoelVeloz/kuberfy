// Thin HTTP client over kuberfy's own REST API — the MCP server has no direct DB/Docker access of its own, so
// every tool call here is exactly what a person clicking through the dashboard would trigger, subject to the
// same auth and validation. Session-cookie auth against Better Auth's email/password endpoint, since that's the
// same login path the dashboard itself uses (see apps/web/src/components/LoginForm.tsx).
export interface KuberfyClientOptions {
  baseUrl: string;
  email: string;
  password: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface AppSize {
  id: string;
  label: string;
  cpuLimit: number;
  memoryLimitMb: number;
}

export interface Application {
  id: string;
  projectId: string;
  name: string;
  repoUrl: string;
  branch: string;
  buildType: "image" | "dockerfile";
  dockerfilePath: string | null;
  memoryLimitMb: number;
  cpuLimit: number;
}

export interface Deployment {
  id: string;
  applicationId: string;
  status: string;
}

export class KuberfyApiError extends Error {}

export class KuberfyClient {
  private cookie: string | null = null;

  constructor(private readonly opts: KuberfyClientOptions) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.cookie) await this.login();
    const res = await fetch(new URL(path, this.opts.baseUrl), {
      ...init,
      headers: { ...init?.headers, ...(this.cookie ? { Cookie: this.cookie } : {}) },
    });
    if (res.status === 401 && this.cookie) {
      // session expired mid-run — sign in again once, then retry exactly once
      this.cookie = null;
      return this.request<T>(path, init);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new KuberfyApiError(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${body.slice(0, 500)}`);
    }
    return res.json() as Promise<T>;
  }

  private async login() {
    const res = await fetch(new URL("/api/auth/sign-in/email", this.opts.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.opts.email, password: this.opts.password }),
    });
    if (!res.ok) throw new KuberfyApiError(`Sign-in failed (${res.status}): ${await res.text()}`);
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length === 0) throw new KuberfyApiError("Sign-in succeeded but no session cookie was returned.");
    this.cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  }

  listProjects() {
    return this.request<{ items: Project[]; total: number }>("/api/projects?pageSize=100").then((r) => r.items);
  }

  createProject(name: string) {
    return this.request<Project>("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  }

  listAppSizes() {
    return this.request<AppSize[]>("/api/app-sizes");
  }

  createApplication(input: {
    projectId: string;
    name: string;
    buildType: "image" | "dockerfile";
    repoUrl: string;
    branch?: string;
    dockerfilePath?: string;
    envVars?: Record<string, string>;
    memoryLimitMb?: number;
    cpuLimit?: number;
  }) {
    const { envVars, ...rest } = input;
    return this.request<Application>("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rest, branch: input.branch ?? "main", envVars: envVars ? JSON.stringify(envVars) : undefined }),
    });
  }

  deployApplication(applicationId: string) {
    return this.request<Deployment>(`/api/applications/${applicationId}/deploy`, { method: "POST" });
  }
}
