# Contributing to Shed

Shed is currently in **closed beta** — external contributions are not yet being accepted. This file exists to document the contribution process for when we go public (estimated Q3 2026).

During the beta phase, beta testers can contribute via:
- Bug reports on the private issue tracker
- Feature suggestions in Discussions
- Feedback on Discord/Telegram

## When we go public

### Before starting work

1. **Read [CLAUDE.md](./CLAUDE.md)** — it contains non-negotiable safety rules that apply to all contributions, whether you use Claude Code or not
2. Check existing issues/PRs — avoid duplicate work
3. For non-trivial changes, **open an issue first** to discuss approach
4. Safety-critical changes (anything touching `packages/core/src/safety/`) require maintainer approval before code review

### Development setup

```bash
git clone https://github.com/<TBD>/shed
cd shed
pnpm install
pnpm test    # verify your setup
```

### Making changes

- Branch from `main`: `git checkout -b feat/your-feature`
- **Tests first** for safety-critical code (anything in `core/safety/` or `core/detectors/`)
- Follow existing patterns — if unsure, look at similar existing code
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Keep PRs focused — one logical change per PR

### PR checklist

- [ ] Tests added/updated
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes on your machine
- [ ] `pnpm lint` passes
- [ ] Updated docs if user-facing behavior changed
- [ ] Safety review self-check: does this PR touch any deletion logic? If yes, explain in PR description.

### Adding a new detector

Detectors are the most common extension point. To add support for a new runtime/tool:

1. Read `docs/detector-plugin-guide.md`
2. Create `packages/core/src/detectors/YourDetector.ts`
3. Implement `ProjectDetector` interface
4. Add to `packages/core/src/detectors/index.ts`
5. Write unit tests with fixtures in `packages/core/src/detectors/YourDetector.test.ts`
6. Document risk tier assignments and safety checks
7. Add integration test in `e2e/detectors/`

### Code review priorities

Reviewers prioritize (in order):
1. **Safety** — could this destroy user data?
2. **Correctness** — does it handle edge cases?
3. **Cross-platform** — works on macOS, Windows, Linux?
4. **Tests** — adequately covered?
5. **Code style** — consistent with codebase?
6. **Performance** — any obvious issues?

### What NOT to do

- Don't add dependencies without justification (check license, bundle impact, maintenance status)
- Don't call `fs.rm` / `rimraf` / `rm -rf` outside `SafetyChecker`
- Don't add "always delete" cleanup paths without tiered classification
- Don't bypass dry-run mode
- Don't touch sacred paths listed in CLAUDE.md rule 4

### Questions?

- General discussion: GitHub Discussions
- Bugs: GitHub Issues
- Security/safety concerns: email maintainer directly (don't file publicly until fixed)

---

Thank you for your interest in contributing to Shed. We take safety seriously, and your careful attention to the rules above helps keep every user's data safe.
