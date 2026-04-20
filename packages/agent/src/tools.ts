/**
 * Tool schemas used by both the built-in AI (agent package) and MCP server.
 * These are READ-ONLY tools — AI cannot execute cleanup directly.
 * Cleanup requires explicit user confirmation in the CLI.
 */

import type { AITool } from './provider.js';

export const TOOLS = {
  listProjects: {
    name: 'list_projects',
    description:
      'List all detected projects under a given path. Returns project type, path, last-modified date, and total cleanable size. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Absolute path to scan from' },
        maxDepth: { type: 'number', description: 'Max directory depth', default: 5 },
      },
      required: ['root'],
    },
  } satisfies AITool,

  analyzeProject: {
    name: 'analyze_project',
    description:
      'Get detailed analysis of a single project: all cleanable items, risk tiers, git status, last activity. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the project root' },
      },
      required: ['path'],
    },
  } satisfies AITool,

  estimateCleanup: {
    name: 'estimate_cleanup',
    description:
      'Estimate space that would be freed by cleaning a set of items. Runs safety checks and returns what would be allowed vs skipped. Read-only, never deletes.',
    inputSchema: {
      type: 'object',
      properties: {
        itemIds: { type: 'array', items: { type: 'string' } },
        includeRed: { type: 'boolean', default: false },
      },
      required: ['itemIds'],
    },
  } satisfies AITool,

  getDiskUsage: {
    name: 'get_disk_usage',
    description: 'Get current disk usage on the user machine (free / used / total).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to check (defaults to home)' },
      },
    },
  } satisfies AITool,
} as const;

export const ALL_TOOLS: readonly AITool[] = Object.values(TOOLS);
