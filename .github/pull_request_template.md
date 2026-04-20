## Summary

<!-- What does this PR do? Why? -->

## Type of change

- [ ] Bug fix
- [ ] New feature / detector
- [ ] Refactor (no behavior change)
- [ ] Documentation
- [ ] Chore / tooling

## Safety self-review

<!-- Required for any PR touching deletion logic, detectors, or SafetyChecker -->

- [ ] This PR does NOT add new destructive filesystem calls outside `SafetyChecker.execute()`
- [ ] This PR does NOT touch sacred paths (see CLAUDE.md rule 4)
- [ ] Dry-run mode is preserved for any new cleanup operation
- [ ] If a new cleanup path is added: risk tier is documented and tested

## Testing

- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] New tests added for changed behavior

## Notes for reviewer

<!-- Edge cases, platform-specific behavior, anything non-obvious -->
