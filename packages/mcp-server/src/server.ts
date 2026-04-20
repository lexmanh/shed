#!/usr/bin/env node
/**
 * Shed MCP Server
 *
 * Exposes shed scan/analyze/cleanup tools to MCP clients (Claude Desktop, Claude Code).
 * All tools are READ-ONLY — cleanup must be confirmed in the CLI.
 *
 * Transport: stdio (standard MCP convention for local tools).
 *
 * Usage in claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "shed": { "command": "shed-mcp" }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { executeToolCall } from '@lxmanh/shed-agent';

const server = new McpServer({
  name: 'shed',
  version: '0.0.0',
});

// ── list_projects ──────────────────────────────────────────────────────────────
server.tool(
  'list_projects',
  'List all detected projects under a given path. Returns project type, path, last-modified date, and total cleanable size. Read-only.',
  {
    root: z.string().describe('Absolute path to scan from'),
    maxDepth: z.number().optional().default(5).describe('Max directory depth'),
  },
  async ({ root, maxDepth }) => {
    const result = await executeToolCall('list_projects', { root, maxDepth });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// ── analyze_project ────────────────────────────────────────────────────────────
server.tool(
  'analyze_project',
  'Get detailed analysis of a single project: all cleanable items, risk tiers, git status, last activity. Read-only.',
  {
    path: z.string().describe('Absolute path to the project root'),
  },
  async ({ path }) => {
    const result = await executeToolCall('analyze_project', { path });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// ── estimate_cleanup ───────────────────────────────────────────────────────────
server.tool(
  'estimate_cleanup',
  'Estimate space freed by cleaning a set of items. Runs safety checks and returns what would be allowed vs skipped. Read-only — never deletes anything.',
  {
    itemIds: z.array(z.string()).describe('Item IDs from list_projects or analyze_project'),
    includeRed: z.boolean().optional().default(false).describe('Include Red-tier items'),
  },
  async ({ itemIds, includeRed }) => {
    const result = await executeToolCall('estimate_cleanup', { itemIds, includeRed });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// ── get_disk_usage ─────────────────────────────────────────────────────────────
server.tool(
  'get_disk_usage',
  'Get current disk usage on the user machine (free / used / total).',
  {
    path: z.string().optional().describe('Path to check (defaults to home directory)'),
  },
  async ({ path }) => {
    const result = await executeToolCall('get_disk_usage', { path });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// ── start ──────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
