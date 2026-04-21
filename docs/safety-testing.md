# Safety Testing Guide

> **Rule 3 từ CLAUDE.md:** Bất kỳ code nào trong `packages/core/src/safety/` hoặc
> `packages/core/src/detectors/` **phải có test viết trước implementation.**
>
> File này giải thích cách viết những test đó — patterns, helpers, và mandatory cases.

---

## 1. Setup & Tools

```ts
import { join } from 'node:path';
import { execa } from 'execa';
import { createFixture } from 'fs-fixture';
import { describe, expect, it, vi } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
```

**`fs-fixture`** tạo temp directory với file structure tuỳ ý, tự dọn dẹp sau test.
**`execa`** chạy git commands để setup repo state.
**Không dùng `memfs`** cho safety tests — cần real filesystem để test symlinks, permissions, và git commands thật.

---

## 2. Helpers chuẩn

Copy 2 helpers này vào mọi test file trong `safety/` và `detectors/`:

```ts
async function initGit(cwd: string, { makeCommit = true } = {}) {
  await execa('git', ['init', '-q', '-b', 'main'], { cwd });
  await execa('git', ['config', 'user.email', 'test@shed.test'], { cwd });
  await execa('git', ['config', 'user.name', 'Shed Test'], { cwd });
  await execa('git', ['config', 'commit.gpgsign', 'false'], { cwd });
  if (makeCommit) {
    await execa('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });
  }
}

const mkItem = (overrides: Partial<CleanableItem> = {}): CleanableItem => ({
  id: 'test-1',
  path: '/tmp/test-item',
  detector: 'node',
  risk: RiskTier.Yellow,
  sizeBytes: 1024 * 1024 * 100,          // 100 MB
  lastModified: Date.now() - 1000 * 60 * 60 * 24 * 90, // 90 days ago
  description: 'test item',
  projectRoot: '/tmp/test',
  ...overrides,
});
```

**Tại sao `makeCommit = true` mặc định:** `git status --porcelain` cần có HEAD để hoạt động. Repo init nhưng chưa có commit sẽ throw error. Dùng `{ makeCommit: false }` chỉ khi test cụ thể trường hợp "repo mới tạo chưa có commit".

**Tại sao `commit.gpgsign = false`:** tránh test fail trên máy dev có GPG signing bật.

---

## 3. Fixture pattern

```ts
it('mô tả test case', async () => {
  const fix = await createFixture({
    'src/index.ts': 'export {}',
    'node_modules/.package-lock.json': '{}',
  });
  try {
    // ... test logic
  } finally {
    await fix.rm(); // luôn cleanup dù test fail
  }
});
```

`fix.path` trả về absolute path của temp directory.

---

## 4. Mandatory test cases cho SafetyChecker

Khi thêm logic mới vào `SafetyChecker`, phải cover đủ các cases sau:

### 4.1 Sacred path guard

```ts
it('blocks ~/.ssh', async () => {
  const checker = new SafetyChecker();
  const result = await checker.check(mkItem({ path: `${process.env.HOME}/.ssh` }));
  expect(result.allowed).toBe(false);
  expect(result.reasons[0]?.code).toBe('sacred-path');
  expect(result.reasons[0]?.severity).toBe('block');
});

it('blocks paths nested inside sacred directory', async () => {
  const checker = new SafetyChecker();
  const result = await checker.check(mkItem({ path: `${process.env.HOME}/.aws/credentials` }));
  expect(result.allowed).toBe(false);
});

// Symlink trỏ vào sacred path — QUAN TRỌNG
it.skipIf(process.platform === 'win32')(
  'blocks symlink that resolves into a sacred path',
  async () => {
    const fix = await createFixture({});
    try {
      const { symlink } = await import('node:fs/promises');
      const linkPath = join(fix.path, 'innocent-cache');
      await symlink('/etc', linkPath);
      const checker = new SafetyChecker();
      const result = await checker.check(mkItem({ path: linkPath }));
      expect(result.allowed).toBe(false);
      expect(result.reasons[0]?.code).toBe('sacred-path');
    } finally {
      await fix.rm();
    }
  }
);
```

### 4.2 Git awareness

```ts
// Case quan trọng nhất: gitignored path KHÔNG bị block dù repo dirty
it('allows gitignored path even when repo is dirty', async () => {
  const fix = await createFixture({
    '.gitignore': 'node_modules\n',
    'src/index.ts': 'export {}', // untracked → repo dirty
  });
  try {
    await initGit(fix.path);
    const nm = join(fix.path, 'node_modules');
    await execa('mkdir', ['-p', nm]);
    const checker = new SafetyChecker();
    const result = await checker.check(
      mkItem({ path: nm, projectRoot: fix.path })
    );
    expect(result.reasons.find(r => r.code === 'git-dirty')).toBeUndefined();
  } finally {
    await fix.rm();
  }
});

// Tracked file với uncommitted changes → block
it('blocks tracked file with uncommitted changes', async () => {
  const fix = await createFixture({ 'src/app.ts': 'v1' });
  try {
    await initGit(fix.path);
    await execa('git', ['add', 'src/app.ts'], { cwd: fix.path });
    await execa('git', ['commit', '-q', '-m', 'add'], { cwd: fix.path });
    // Modify tracked file
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(fix.path, 'src/app.ts'), 'v2');
    const checker = new SafetyChecker();
    const result = await checker.check(
      mkItem({ path: join(fix.path, 'src/app.ts'), projectRoot: fix.path })
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.find(r => r.code === 'git-dirty')).toBeDefined();
  } finally {
    await fix.rm();
  }
});

// Không phải git repo → cho phép
it('allows when not a git repo', async () => {
  const fix = await createFixture({});
  try {
    const checker = new SafetyChecker();
    const result = await checker.check(
      mkItem({ path: '/tmp/item', projectRoot: fix.path })
    );
    expect(result.reasons.find(r => r.code === 'git-dirty')).toBeUndefined();
  } finally {
    await fix.rm();
  }
});

// git binary không có → fallback gracefully, không crash
it('handles missing git binary gracefully', async () => {
  const checker = new SafetyChecker();
  const result = await checker.check(
    mkItem({ path: '/tmp/safe', projectRoot: '/absolutely/does/not/exist' })
  );
  expect(result.reasons.find(r => r.code === 'git-dirty')).toBeUndefined();
});
```

### 4.3 Process awareness

Inject `PlatformApi` để mock lsof/Get-Process — không cần process thật đang chạy:

```ts
it('blocks when a process holds files in the path', async () => {
  const platform: PlatformApi = {
    async isPathHeldByProcess() {
      return { pid: 12345, command: 'node' };
    },
  };
  const checker = new SafetyChecker({ platform });
  const result = await checker.check(mkItem({ path: '/tmp/busy' }));
  expect(result.allowed).toBe(false);
  expect(result.reasons.find(r => r.code === 'process-holding-file')).toBeDefined();
  expect(result.reasons.find(r => r.code === 'process-holding-file')?.message)
    .toContain('node');
});

// lsof crash → không block (fail open là intentional)
it('allows when lsof/Get-Process throws', async () => {
  const platform: PlatformApi = {
    async isPathHeldByProcess() { throw new Error('lsof blew up'); },
  };
  const checker = new SafetyChecker({ platform });
  const result = await checker.check(mkItem({ path: '/tmp/err' }));
  expect(result.reasons.find(r => r.code === 'process-holding-file')).toBeUndefined();
});
```

### 4.4 Recency guard

```ts
it('warns for items modified within threshold', async () => {
  const checker = new SafetyChecker({ recencyThresholdDays: 30 });
  const result = await checker.check(mkItem({
    path: '/tmp/recent',
    lastModified: Date.now() - 1000 * 60 * 60 * 24 * 7, // 7 ngày
  }));
  const r = result.reasons.find(r => r.code === 'recent-modification');
  expect(r).toBeDefined();
  expect(r?.severity).toBe('warning'); // warning, không phải block
});

it('does not warn for old items', async () => {
  const checker = new SafetyChecker({ recencyThresholdDays: 30 });
  const result = await checker.check(mkItem({
    path: '/tmp/old',
    lastModified: Date.now() - 1000 * 60 * 60 * 24 * 100, // 100 ngày
  }));
  expect(result.reasons.find(r => r.code === 'recent-modification')).toBeUndefined();
});
```

### 4.5 Dry-run và TOCTOU

```ts
// performDelete không được gọi khi dryRun=true
it('never calls performDelete in dry-run mode', async () => {
  const checker = new SafetyChecker();
  const spy = vi.spyOn(
    checker as unknown as { performDelete: () => Promise<void> },
    'performDelete'
  );
  await checker.execute([mkItem({ path: '/tmp/dry' })], {
    dryRun: true, hardDelete: false, includeRed: false,
  });
  expect(spy).not.toHaveBeenCalled();
});

// check() phải được gọi lại lúc execute, không chỉ lúc scan (TOCTOU mitigation)
it('re-checks items at execution time', async () => {
  const checker = new SafetyChecker();
  const spy = vi.spyOn(checker, 'check');
  const items = [mkItem({ id: 'a' }), mkItem({ id: 'b' })];
  await checker.execute(items, { dryRun: true, hardDelete: false, includeRed: false });
  expect(spy).toHaveBeenCalledTimes(2);
});
```

---

## 5. Mandatory test cases cho Detectors

Mỗi detector mới trong `packages/core/src/detectors/` phải có test cover:

### 5.1 Structure cơ bản

```ts
describe('XxxDetector.quickProbe', () => {
  it('returns true when signature file/dir exists', async () => {
    const fix = await createFixture({ 'signature-file': '' });
    try {
      const detector = new XxxDetector();
      expect(await detector.quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when signature is absent', async () => {
    const fix = await createFixture({ 'unrelated.txt': '' });
    try {
      expect(await new XxxDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

describe('XxxDetector.analyze', () => {
  it('returns null when project signature absent', async () => { /* ... */ });
  it('returns null when config file is invalid/malformed', async () => { /* ... */ });
  it('returns correct type string', async () => { /* ... */ });
  it('assigns correct RiskTier to each cleanable item', async () => { /* ... */ });
  it('reports accurate sizeBytes', async () => { /* ... */ });
});
```

### 5.2 Risk tier correctness

```ts
it('classifies global cache as Green', async () => {
  const fix = await createFixture({ /* ... */ });
  try {
    const result = await new XxxDetector().analyze(fix.path, ctx);
    const cacheItem = result?.cleanableItems.find(i => i.description.includes('cache'));
    expect(cacheItem?.risk).toBe(RiskTier.Green);
  } finally {
    await fix.rm();
  }
});

it('classifies project build dir as Yellow', async () => { /* ... */ });
```

### 5.3 Path safety

```ts
// Detector không được return path nằm ngoài scanRoot
it('does not return items outside scan root', async () => {
  const fix = await createFixture({ 'package.json': '{}' });
  try {
    const result = await new XxxDetector().analyze(fix.path, {
      scanRoot: fix.path,
      maxDepth: 3,
    });
    for (const item of result?.cleanableItems ?? []) {
      expect(item.path.startsWith(fix.path) || item.path.startsWith(process.env.HOME!))
        .toBe(true);
    }
  } finally {
    await fix.rm();
  }
});
```

### 5.4 Platform filtering

```ts
// Detector chỉ chạy trên đúng platform
it.skipIf(process.platform !== 'darwin')('Xcode paths — macOS only', async () => {
  /* ... */
});

it.skipIf(process.platform !== 'win32')('Windows-specific paths', async () => {
  /* ... */
});
```

### 5.5 Edge cases bắt buộc

| Case | Lý do |
|---|---|
| Empty project (chỉ có signature file, không có cleanable item) | Tránh false positive |
| Path traversal `../` trong config | Tránh escape scan root |
| Unicode filename (ví dụ: `phân-tích/`) | VN devs thường có tên thư mục tiếng Việt |
| Symlink trỏ ra ngoài project | Detector không được follow |
| Fixture không có quyền read (chmod 000) | Graceful error, không crash |

```ts
it('handles unicode paths', async () => {
  const fix = await createFixture({
    'package.json': '{}',
    'phân-tích/node_modules/.keep': '',
  });
  try {
    const result = await new NodeDetector().analyze(fix.path, ctx);
    expect(result).not.toBeNull();
  } finally {
    await fix.rm();
  }
});
```

---

## 6. Chạy tests

```bash
# Tất cả tests
pnpm test

# TDD mode — watch 1 file
pnpm --filter @lxmanh/shed-core test -- --watch packages/core/src/safety/safety-checker.test.ts

# Coverage report
pnpm --filter @lxmanh/shed-core test -- --coverage
```

Coverage target: **100% branches** cho `safety/`, **≥ 90%** cho `detectors/`.

---

## 7. Khi nào dùng mock vs real filesystem

| Tình huống | Dùng |
|---|---|
| Test git awareness, symlinks, permissions | `createFixture` (real fs) |
| Test process awareness (lsof/Get-Process) | Inject `PlatformApi` mock |
| Test pure logic (tier assignment, path parsing) | In-memory object, không cần fs |
| Integration: scan → safety → delete | `createFixture` + `SafetyChecker` thật |

**Không bao giờ** touch real home directory (`~`) trong tests ngoại trừ `e2e/` suite.
