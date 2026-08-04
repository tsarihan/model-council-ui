// MCP bridge: spawns the model-council plugin's bundled server over stdio and
// exposes callTool with progress forwarding. One shared connection, respawned
// on demand if the child dies.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolveServerPath() {
  const fromEnv = process.env.MODEL_COUNCIL_SERVER;
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new Error(`MODEL_COUNCIL_SERVER points at a missing file: ${fromEnv}`);
    }
    return fromEnv;
  }

  // Installed Claude Code plugin cache — pick the highest version.
  const cacheRoot = path.join(
    homedir(), '.claude', 'plugins', 'cache', 'model-council', 'model-council',
  );
  if (existsSync(cacheRoot)) {
    const versions = readdirSync(cacheRoot)
      .filter((v) => existsSync(path.join(cacheRoot, v, 'bundle', 'server.cjs')))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    if (versions.length > 0) {
      return path.join(cacheRoot, versions[0], 'bundle', 'server.cjs');
    }
  }

  // Sibling checkout of the plugin repo.
  const sibling = path.resolve(__dirname, '..', '..', 'model-council-mcp', 'bundle', 'server.cjs');
  if (existsSync(sibling)) return sibling;

  throw new Error(
    'Could not find the model-council MCP server. Install the model-council ' +
    'Claude Code plugin, clone model-council-mcp next to this repo, or set ' +
    'MODEL_COUNCIL_SERVER=/path/to/bundle/server.cjs',
  );
}

let client = null;
let connecting = null;

async function connect() {
  const serverPath = resolveServerPath();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...process.env },
    stderr: 'ignore',
  });
  const c = new Client({ name: 'model-council-ui', version: '0.1.0' });
  c.onclose = () => { if (client === c) client = null; };
  await c.connect(transport);
  console.log(`[mcp] connected to ${serverPath}`);
  return c;
}

async function getClient() {
  if (client) return client;
  if (!connecting) {
    connecting = connect()
      .then((c) => { client = c; return c; })
      .finally(() => { connecting = null; });
  }
  return connecting;
}

/**
 * Call an MCP tool. onProgress (optional) receives {progress, total, message}.
 * Returns the parsed council payload (see parseCouncilText).
 */
export async function callTool(name, args = {}, onProgress) {
  const c = await getClient();
  const result = await c.callTool(
    { name, arguments: args },
    undefined,
    {
      timeout: 120_000,
      resetTimeoutOnProgress: true,
      maxTotalTimeout: 2 * 60 * 60 * 1000,
      onprogress: onProgress,
    },
  );
  const text = (result.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  if (result.isError) {
    const err = new Error(text || `MCP tool ${name} failed`);
    err.isToolError = true;
    throw err;
  }
  return parseCouncilText(text);
}

/** Strip the ═══ BEGINNING/END OF RESPONSE ═══ markers and parse JSON. */
export function parseCouncilText(text) {
  const lines = text.split('\n');
  const begin = lines.findIndex((l) => l.includes('BEGINNING OF RESPONSE'));
  const end = lines.findLastIndex((l) => l.includes('END OF RESPONSE'));
  const body = begin !== -1 && end > begin
    ? lines.slice(begin + 1, end).join('\n')
    : text;
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body.trim() };
  }
}
