# Contributing to Shed

Thanks for your interest in contributing! Shed is a **destructive tool** — it deletes files. Safety is the top priority in every review.

## Before starting work

1. **Read [CLAUDE.md](./CLAUDE.md)** — it contains non-negotiable safety rules that apply to all contributions
2. Check existing issues/PRs to avoid duplicate work
3. For non-trivial changes, **open an issue first** to discuss your approach
4. Safety-critical changes (anything in `packages/core/src/safety/`) require maintainer sign-off before code review begins

## Development setup

```bash
git clone https://github.com/lexmanh/shed
cd shed
pnpm install
pnpm test        # verify your setup
pnpm dev         # watch mode across all packages
```

## Making changes

- Branch from `main`: `git checkout -b feat/your-feature`
- **Tests first** for anything in `core/safety/` or `core/detectors/` (CLAUDE.md rule 3)
- Follow existing patterns — look at similar code when unsure
- [Conventional commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Keep PRs focused — one logical change per PR

## PR checklist

- [ ] Tests added/updated
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] Docs updated if user-facing behavior changed
- [ ] If this PR touches deletion logic: explain the safety reasoning in the PR description

## Adding a new detector

Detectors are the most common extension point. To add support for a new runtime/tool:

1. Create `packages/core/src/detectors/your-detector.ts`
2. Implement the `ProjectDetector` interface
3. Export from `packages/core/src/detectors/index.ts`
4. Write tests with temp filesystem fixtures (see existing detector tests for patterns)
5. Document risk tier assignments and any edge cases

## Code review priorities

1. **Safety** — could this destroy user data?
2. **Correctness** — edge cases handled?
3. **Cross-platform** — works on macOS, Windows, Linux?
4. **Tests** — adequately covered?
5. **Style** — consistent with codebase?

## What NOT to do

- Don't call `fs.rm` / `rimraf` / `rm -rf` outside `SafetyChecker` (CLAUDE.md rule 1)
- Don't add new cleanup paths without risk tier classification (CLAUDE.md rule 5)
- Don't bypass dry-run mode (CLAUDE.md rule 2)
- Don't touch sacred paths listed in CLAUDE.md rule 4
- Don't add dependencies without checking license, bundle size, and maintenance status

## Reporting security / safety issues

If you find a bug that could cause **data loss** or touch **sacred paths**, please email the maintainer directly before filing a public issue. Do not disclose publicly until a fix is available.

For general bugs and feature requests, use GitHub Issues.
