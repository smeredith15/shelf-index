export interface SyncConfig {
  owner: string;
  repo: string;
  token: string;
  branch?: string;
}

const CONFIG_KEY = 'shelf-index.sync';

/** The token stays on this device only; it is never written to either repo. */
export function loadConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function saveConfig(config: SyncConfig | null): void {
  if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  else localStorage.removeItem(CONFIG_KEY);
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface TreeEntry {
  path: string;
  mode: '100644';
  type: 'blob';
  sha?: string | null;
  content?: string;
}

export class GitHubClient {
  constructor(private config: SyncConfig) {}

  private async request(path: string, init: RequestInit = {}, accept = 'application/vnd.github+json') {
    const { owner, repo, token } = this.config;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok && res.status !== 404) {
      let detail = res.statusText;
      try {
        detail = ((await res.json()) as { message?: string }).message ?? detail;
      } catch {
        /* not JSON */
      }
      throw new GitHubError(detail, res.status);
    }
    return res;
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.request(path, init);
    if (res.status === 404) throw new GitHubError(`Not found: ${path}`, 404);
    return (await res.json()) as T;
  }

  async defaultBranch(): Promise<string> {
    if (this.config.branch) return this.config.branch;
    const info = await this.json<{ default_branch: string }>('');
    this.config.branch = info.default_branch;
    return info.default_branch;
  }

  /** Returns the head commit and its tree, or throws 409 when the repo has no commits yet. */
  async head(): Promise<{ commit: string; tree: string }> {
    const branch = await this.defaultBranch();
    const ref = await this.json<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(branch)}`);
    const commit = await this.json<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
    return { commit: ref.object.sha, tree: commit.tree.sha };
  }

  async readText(path: string, ref: string): Promise<string | null> {
    const res = await this.request(`/contents/${path}?ref=${ref}`, {}, 'application/vnd.github.raw+json');
    return res.status === 404 ? null : res.text();
  }

  async readBlob(path: string, ref: string): Promise<Blob | null> {
    const res = await this.request(`/contents/${path}?ref=${ref}`, {}, 'application/vnd.github.raw+json');
    return res.status === 404 ? null : res.blob();
  }

  async createBlob(base64: string): Promise<string> {
    const out = await this.json<{ sha: string }>('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: base64, encoding: 'base64' }),
    });
    return out.sha;
  }

  async createTree(baseTree: string, entries: TreeEntry[]): Promise<string> {
    const out = await this.json<{ sha: string }>('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTree, tree: entries }),
    });
    return out.sha;
  }

  async createCommit(message: string, tree: string, parent: string): Promise<string> {
    const out = await this.json<{ sha: string }>('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree, parents: [parent] }),
    });
    return out.sha;
  }

  /** Fast-forward only. Returns false when the branch moved (another device pushed first). */
  async updateRef(commit: string): Promise<boolean> {
    const branch = await this.defaultBranch();
    try {
      await this.json(`/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit, force: false }),
      });
      return true;
    } catch (err) {
      if (err instanceof GitHubError && err.status === 422) return false;
      throw err;
    }
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
