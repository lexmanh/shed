import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { DotnetDetector } from './dotnet-detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

describe('DotnetDetector.quickProbe', () => {
  it('returns true when .csproj exists', async () => {
    const fix = await createFixture({ 'MyApp.csproj': '<Project Sdk="Microsoft.NET.Sdk" />' });
    try {
      expect(await new DotnetDetector().quickProbe(fix.path)).toBe(true);
    } finally { await fix.rm(); }
  });

  it('returns true when .fsproj exists', async () => {
    const fix = await createFixture({ 'MyApp.fsproj': '<Project Sdk="Microsoft.NET.Sdk" />' });
    try {
      expect(await new DotnetDetector().quickProbe(fix.path)).toBe(true);
    } finally { await fix.rm(); }
  });

  it('returns true when .sln exists', async () => {
    const fix = await createFixture({ 'MySolution.sln': 'Microsoft Visual Studio Solution File' });
    try {
      expect(await new DotnetDetector().quickProbe(fix.path)).toBe(true);
    } finally { await fix.rm(); }
  });

  it('returns false when no .NET project files exist', async () => {
    const fix = await createFixture({ 'pom.xml': '' });
    try {
      expect(await new DotnetDetector().quickProbe(fix.path)).toBe(false);
    } finally { await fix.rm(); }
  });
});

describe('DotnetDetector.analyze', () => {
  it('returns null when no .NET project files found', async () => {
    const fix = await createFixture({});
    try {
      expect(await new DotnetDetector().analyze(fix.path, ctx)).toBeNull();
    } finally { await fix.rm(); }
  });

  it('returns type=dotnet', async () => {
    const fix = await createFixture({ 'App.csproj': '<Project Sdk="Microsoft.NET.Sdk" />' });
    try {
      expect((await new DotnetDetector().analyze(fix.path, ctx))?.type).toBe('dotnet');
    } finally { await fix.rm(); }
  });

  it('uses project file name as project name', async () => {
    const fix = await createFixture({ 'MyWebApi.csproj': '<Project Sdk="Microsoft.NET.Sdk" />' });
    try {
      expect((await new DotnetDetector().analyze(fix.path, ctx))?.name).toBe('MyWebApi');
    } finally { await fix.rm(); }
  });

  it('returns bin/ as Yellow when present', async () => {
    const fix = await createFixture({
      'App.csproj': '',
      'bin/Debug/net8.0/App.dll': '',
    });
    try {
      const result = await new DotnetDetector().analyze(fix.path, ctx);
      const bin = result?.items.find(i => i.path === join(fix.path, 'bin'));
      expect(bin?.risk).toBe(RiskTier.Yellow);
    } finally { await fix.rm(); }
  });

  it('returns obj/ as Yellow when present', async () => {
    const fix = await createFixture({
      'App.csproj': '',
      'obj/Debug/net8.0/App.dll': '',
    });
    try {
      const result = await new DotnetDetector().analyze(fix.path, ctx);
      const obj = result?.items.find(i => i.path === join(fix.path, 'obj'));
      expect(obj?.risk).toBe(RiskTier.Yellow);
    } finally { await fix.rm(); }
  });

  it('returns no items when build dirs absent', async () => {
    const fix = await createFixture({ 'App.csproj': '' });
    try {
      expect((await new DotnetDetector().analyze(fix.path, ctx))?.items).toHaveLength(0);
    } finally { await fix.rm(); }
  });
});

describe('DotnetDetector.scanGlobal', () => {
  it('returns .nuget/packages as Green when present', async () => {
    const fix = await createFixture({ '.nuget/packages/newtonsoft.json/13.0.0/lib': '' });
    try {
      const items = await new DotnetDetector({ homeDir: fix.path }).scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]?.risk).toBe(RiskTier.Green);
    } finally { await fix.rm(); }
  });

  it('returns empty when .nuget absent', async () => {
    const fix = await createFixture({});
    try {
      expect(await new DotnetDetector({ homeDir: fix.path }).scanGlobal(ctx)).toHaveLength(0);
    } finally { await fix.rm(); }
  });
});
