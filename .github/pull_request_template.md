## Summary

<!-- 1-3 sentences describing what this PR does and why -->

## Changes

<!-- Bulleted list of significant changes -->
-
-
-

## Type

<!-- Check one -->
- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Performance
- [ ] Test
- [ ] Documentation
- [ ] Infrastructure / CI

## Affected Services

<!-- Check all that apply -->
- [ ] `apps/web`
- [ ] `apps/mobile`
- [ ] `packages/shared`
- [ ] `packages/ui`
- [ ] `packages/sdk`
- [ ] `services/gateway`
- [ ] `services/camera-ingest`
- [ ] `services/video-pipeline`
- [ ] `services/event-engine`
- [ ] `services/extension-runtime`
- [ ] `infra/`

## Test Plan

<!-- How was this tested? What should reviewers verify? -->
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated (if UI change)
- [ ] Manual testing steps:
  1.
  2.

## Checklist

<!-- All must be checked before merge -->
- [ ] Follows [naming conventions](./docs/CONSISTENCY-STANDARDS.md#1-naming-conventions)
- [ ] Error handling uses [standard error format](./docs/CONSISTENCY-STANDARDS.md#3-error-handling-standard)
- [ ] New endpoints have Zod request validation
- [ ] New DB tables have RLS policies
- [ ] New features have unit + integration tests
- [ ] No hardcoded secrets or connection strings
- [ ] Logging follows [structured format](./docs/CONSISTENCY-STANDARDS.md#4-logging--observability)
- [ ] API changes are backward-compatible (or version bumped)
- [ ] Extension hooks maintain backward compatibility

## Screenshots / Recordings

<!-- For UI changes, include before/after screenshots or a screen recording -->

## Related Issues

<!-- Link to Jira/GitHub issues -->
Closes OSP-XXX
