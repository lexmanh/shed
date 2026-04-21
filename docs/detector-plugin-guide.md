# Detector Plugin Guide

> Hướng dẫn viết detector mới cho Shed.
> Đọc [`docs/safety-testing.md`](safety-testing.md) trước — mọi detector mới **phải** có tests viết trước implementation.

---

## 1. Detector là gì?

Detector là một class chịu trách nhiệm tìm và phân loại artifacts có thể xoá cho một runtime/tool cụ thể (Node, Python, Rust, Docker, v.v.). Scanner gọi tất cả detectors khi người dùng chạy `shed scan`.

Mỗi detector làm 2 việc:
- **`analyze(dir, ctx)`** — kiểm tra một thư mục cụ thể có phải là project của runtime này không, nếu có thì liệt kê artifacts bên trong
- **`scanGlobal(ctx)`** — tìm caches toàn hệ thống không gắn với project cụ thể (ví dụ: `~/.npm`, `~/.cargo/registry`)

---

## 2. Interface

File: `packages/core/src/detectors/detector.ts`

```ts
export interface ProjectDetector {
  readonly id: string;          // ổn định, lowercase, ví dụ "go", "java-maven"
  readonly displayName: string; // human-readable, ví dụ "Go", "Java (Maven)"

  quickProbe(dir: string): Promise<boolean>;
  analyze(dir: string, ctx: DetectorContext): Promise<DetectedProject | null>;
  scanGlobal(ctx: DetectorContext): Promise<readonly CleanableItem[]>;
}

export interface DetectorContext {
  readonly scanRoot: string;
  readonly maxDepth: number;
  readonly signal?: AbortSignal;
}
```

**`BaseDetector`** cung cấp 3 utilities sẵn — extend thay vì implement từ đầu:

```ts
protected async computeSize(path: string): Promise<number>
protected async getLastModified(path: string): Promise<number>
protected async dirExists(path: string): Promise<boolean>
```

`scanGlobal` mặc định return `[]` trong BaseDetector — chỉ override khi detector có global caches.

---

## 3. Viết detector từng bước

### Bước 1 — Viết tests trước

Tạo `packages/core/src/detectors/go-detector.test.ts` trước khi tạo implementation. Xem [safety-testing.md](safety-testing.md) section 5 để biết mandatory test cases.

### Bước 2 — Tạo file implementation

```
packages/core/src/detectors/go-detector.ts
```

### Bước 3 — Implement class

Dưới đây là ví dụ đầy đủ cho Go detector:

```ts
import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface GoDetectorOptions {
  // inject homeDir để test không cần real home directory
  readonly homeDir?: string;
}

export class GoDetector extends BaseDetector {
  readonly id = 'go';
  readonly displayName = 'Go';

  private readonly homeDir: string;

  constructor(options: GoDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
  }

  // Cheap check — chỉ fs.access, không đọc file
  async quickProbe(dir: string): Promise<boolean> {
    try {
      await access(join(dir, 'go.mod'));
      return true;
    } catch {
      return false;
    }
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    const goModPath = join(dir, 'go.mod');
    let moduleName: string | undefined;
    try {
      const content = await readFile(goModPath, 'utf-8');
      moduleName = content.match(/^module\s+(\S+)/m)?.[1];
    } catch {
      return null; // go.mod không đọc được → không phải Go project
    }

    const items: CleanableItem[] = [];

    // Go build cache trong project — Yellow (context-dependent)
    const buildCachePath = join(dir, 'vendor');
    if (await this.dirExists(buildCachePath)) {
      items.push({
        id: `${dir}::vendor`,
        path: buildCachePath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(buildCachePath),
        lastModified: await this.getLastModified(buildCachePath),
        description: 'Go vendor directory — regenerate with `go mod vendor`',
        projectRoot: dir,
      });
    }

    return {
      root: dir,
      type: 'go',
      name: moduleName,
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      items,
    };
  }

  // Global cache — không gắn với project cụ thể
  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];
    const modCachePath = join(this.homeDir, 'go', 'pkg', 'mod');

    if (await this.dirExists(modCachePath)) {
      items.push({
        id: 'global::go::mod-cache',
        path: modCachePath,
        detector: this.id,
        risk: RiskTier.Green, // global cache — regenerate automatically
        sizeBytes: await this.computeSize(modCachePath),
        lastModified: await this.getLastModified(modCachePath),
        description: 'Go module cache — regenerate with `go get`',
      });
    }

    return items;
  }
}
```

### Bước 4 — Thêm vào `ProjectType`

File: `packages/core/src/types.ts`

```ts
export type ProjectType =
  | 'node'
  | 'python'
  | 'rust'
  | 'go'      // ← thêm vào đây
  // ...
```

### Bước 5 — Export từ index

File: `packages/core/src/detectors/index.ts`

```ts
export * from './go-detector.js'; // ← thêm dòng này
```

### Bước 6 — Đăng ký với Scanner

File: `packages/cli/src/commands/scan.ts` (hoặc nơi Scanner được khởi tạo):

```ts
import { GoDetector } from '@lexmanh/shed-core';

const scanner = new Scanner([
  new NodeDetector(),
  new PythonDetector(),
  new RustDetector(),
  new GoDetector(),   // ← thêm vào đây
  // ...
]);
```

---

## 4. Quy tắc bắt buộc

### 4.1 Detector phải pure

Detectors **chỉ** được đọc filesystem và chạy subprocess. **Không** được:
- Gọi `fs.rm`, `fs.unlink`, `rimraf`, hoặc bất kỳ destructive operation nào
- Write vào filesystem
- Gọi API bên ngoài

Mọi deletion đi qua `SafetyChecker.execute()` — không phải detector.

### 4.2 `quickProbe` phải rẻ

`quickProbe` được gọi trên **mọi directory** trong scan tree. Phải là `fs.access` đơn giản, không phải `readFile` hay subprocess.

```ts
// ✅ Đúng
async quickProbe(dir: string): Promise<boolean> {
  try {
    await access(join(dir, 'go.mod'));
    return true;
  } catch { return false; }
}

// ❌ Sai — quá nặng
async quickProbe(dir: string): Promise<boolean> {
  const content = await readFile(join(dir, 'go.mod'), 'utf-8'); // đọc file
  return content.includes('module');
}
```

### 4.3 `analyze` trả về `null` nếu không confirm được

`quickProbe` chỉ là heuristic. `analyze` phải verify lại và return `null` nếu thực ra không phải project của runtime này.

```ts
async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
  try {
    const content = await readFile(join(dir, 'go.mod'), 'utf-8');
    if (!content.startsWith('module ')) return null; // không phải go.mod hợp lệ
  } catch {
    return null; // file không đọc được
  }
  // ...
}
```

### 4.4 Không bao giờ return sacred paths

Detectors **không được** return `CleanableItem` có path nằm trong:

```
~/.ssh/     ~/.aws/     ~/.kube/    ~/.gnupg/
~/.config/  ~/.git/     ~/.local/share/ (trừ known cache subdirs)
```

Và **không bao giờ** return lock files:
- `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- `Cargo.lock`, `poetry.lock`, `Gemfile.lock`, `Podfile.lock`

### 4.5 `id` phải ổn định và lowercase

`id` được dùng làm prefix cho `CleanableItem.id` và lưu vào audit log. **Không bao giờ đổi** sau khi release.

```ts
// ✅
readonly id = 'go';
readonly id = 'java-maven';
readonly id = 'java-gradle';

// ❌
readonly id = 'Go';          // uppercase
readonly id = 'goLang';      // camelCase
```

### 4.6 `CleanableItem.id` phải globally unique

Format chuẩn:
- Project-level: `${projectRoot}::${artifactName}` — ví dụ `"/home/user/myapp"::vendor`
- Global: `global::${detectorId}::${subpath}` — ví dụ `global::go::mod-cache`

### 4.7 Inject `homeDir` để test được

Không hardcode `homedir()` trực tiếp. Nhận qua constructor options để test inject path giả:

```ts
// ✅ Testable
constructor(options: GoDetectorOptions = {}) {
  this.homeDir = options.homeDir ?? homedir();
}

// Test:
const detector = new GoDetector({ homeDir: fix.path });

// ❌ Không test được
readonly goCache = join(homedir(), 'go', 'pkg', 'mod');
```

---

## 5. Risk tier — khi nào dùng gì?

| Artifact | Tier | Lý do |
|---|---|---|
| Global package manager cache (`~/.npm`, `~/.cargo/registry`) | Green | Tự động regenerate, không mất data |
| Global tool cache (`~/go/pkg/mod`) | Green | Tự động regenerate khi `go get` |
| Project build output (`dist/`, `build/`, `target/`) | Yellow | Có thể regenerate nhưng cần context |
| Project dependencies (`node_modules/`, `vendor/`, `venv/`) | Yellow | Cần confirm vì có thể đang active |
| Simulator devices, archives, release builds | Red | Chứa data người dùng, khó recover |
| Database files, WAL, binary logs | **Không return** | Detect-only — xem section 6 |

**Nguyên tắc:** khi không chắc giữa Yellow và Red, chọn Red. Safer is better.

---

## 6. Detect-only items (database paths)

Một số paths **không bao giờ** được xoá bởi Shed — chỉ surface để user biết. Ví dụ: MySQL binary logs, PostgreSQL WAL.

Detector vẫn có thể return những items này nhưng **phải dùng** `metadata.detectOnly: true`:

```ts
items.push({
  id: `${dir}::pg-wal`,
  path: walPath,
  detector: this.id,
  risk: RiskTier.Red,
  sizeBytes: await this.computeSize(walPath),
  lastModified: await this.getLastModified(walPath),
  description: 'PostgreSQL WAL — may indicate replication lag. Run `CHECKPOINT` to investigate.',
  projectRoot: dir,
  metadata: {
    detectOnly: true,
    suggestion: 'Check replication status before touching WAL files.',
  },
});
```

SafetyChecker sẽ skip items có `metadata.detectOnly: true` khi execute — chỉ hiện trong scan output.

---

## 7. Platform-specific detectors

Dùng `process.platform` để skip detector trên OS không phù hợp:

```ts
async quickProbe(dir: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false; // Xcode chỉ có macOS
  // ...
}
```

Trong tests:

```ts
it.skipIf(process.platform !== 'darwin')('detects DerivedData on macOS', async () => {
  // ...
});
```

---

## 8. Checklist trước khi submit PR

- [ ] Test file tạo **trước** implementation file
- [ ] `quickProbe` chỉ dùng `fs.access`, không đọc file content
- [ ] `analyze` return `null` cho mọi invalid input (file không tồn tại, JSON lỗi, v.v.)
- [ ] Không có path nào thuộc sacred paths trong `CleanableItem.path`
- [ ] Không có lock file nào trong `CleanableItem.path`
- [ ] `homeDir` được inject qua constructor, không hardcode
- [ ] `CleanableItem.id` theo format chuẩn và globally unique
- [ ] `id` lowercase, ổn định
- [ ] `ProjectType` union được update trong `types.ts`
- [ ] Export từ `detectors/index.ts`
- [ ] Detector được đăng ký trong Scanner
- [ ] Tests cover: missing signature file, invalid config, unicode path, platform filtering
- [ ] `pnpm typecheck && pnpm test && pnpm lint` pass
