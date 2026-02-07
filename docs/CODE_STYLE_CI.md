# OpenClaw Code Style & CI Workflow

## Code Style

### Language & Type System
- **Language**: TypeScript (ESM modules)
- **Runtime**: Node.js 22+
- **Strict Typing**: Prefer strict typing; avoid `any`

### File Size Limits
- **Guideline**: Keep files under **~500 LOC** (from `check:loc`)
- **Command**: `pnpm check:loc` (checks all `.ts`/`.tsx` files)
- Split/refactor when it improves clarity or testability

### Formatting & Linting
- **Formatter/Linter**: Oxlint + Oxfmt
- **Check Command**: `pnpm check` (runs `tsgo` + `lint` + `format`)
- **Format Check**: `pnpm format`
- **Format Fix**: `pnpm format:fix`
- **Lint Check**: `pnpm lint`
- **Lint Fix**: `pnpm lint:fix`

### Swift (macOS/iOS)
- **Linter**: SwiftLint
- **Formatter**: SwiftFormat
- **Commands**:
  - `swiftlint lint --config .swiftlint.yml`
  - `swiftformat --lint --config .swiftformat apps/macos/Sources`

### Tool Schema Rules (google-antigravity)
- Avoid `Type.Union`, `anyOf`, `oneOf`, `allOf`
- Use `stringEnum`/`optionalStringEnum` for string lists
- Use `Type.Optional(...)` instead of `... | null`
- Top-level schema: `type: "object"` with `properties`
- Avoid raw `format` property names (reserved keyword issue)

### Code Conventions
| Rule | Description |
|------|-------------|
| Comments | Add brief comments for tricky/non-obvious logic |
| Naming | **OpenClaw** for product; `openclaw` for CLI/paths/config |
| Patterns | Use `createDefaultDeps` for dependency injection |
| Avoid | Em dashes/apostrophes in doc headings (break Mintlify) |
| Avoid | Emojis in code unless explicitly requested |

### Project Structure
```
src/              # Core source (CLI, commands, infra, media)
src/cli/          # CLI wiring
src/commands/     # CLI commands
extensions/*       # Plugin workspace packages
apps/macos/       # macOS app (Swift)
apps/ios/         # iOS app (Swift)
apps/android/     # Android app (Kotlin)
docs/             # Mintlify documentation
*.test.ts         # Colocated tests
*.e2e.test.ts     # E2E tests
```

### CLI & TTY Output
- Use `src/cli/progress.ts` (`osc-progress` + `@clack/prompts` spinner)
- Use `src/terminal/table.ts` for tables with ANSI-safe wrapping
- Use `src/terminal/palette.ts` for colors (no hardcoded colors)

### Testing
- **Framework**: Vitest with V8 coverage
- **Coverage Threshold**: **70%** (lines/branches/functions/statements)
- **Test Commands**:
  | Command | Purpose |
  |---------|---------|
  | `pnpm test` | Main test suite |
  | `pnpm test:coverage` | With coverage report |
  | `pnpm test:e2e` | E2E tests |
  | `pnpm test:watch` | Watch mode |
  | `pnpm test:live` | Live tests (requires real API keys) |
  | `pnpm test:docker:*` | Docker-based tests |
- **Workers**: Max 16 (configured in `OPENCLAW_TEST_WORKERS`)

### Dependencies
- **Package Manager**: pnpm (v10.23.0)
- **Lockfile**: Frozen (`pnpm install --frozen-lockfile`)
- **Patched Deps**: Must use exact versions (no `^`/`~`)
- **Never edit** `node_modules` or global installs

### Git Commits
- Use `scripts/committer "<msg>" <file...>` for scoped commits
- Conventional commit format (e.g., `CLI: add verbose flag`)
- Changelog entries for PRs/issues

---

## CI Workflow

### Trigger
- **Push**: `main` branch
- **Pull Request**: All branches
- **Cancel**: In-progress jobs on same PR/branch

### Jobs Overview

| Job | Platform | Key Checks |
|-----|----------|------------|
| `install-check` | Ubuntu 24.04 | Dependency installation |
| `checks` | Linux | tsgo/lint/test/format/protocol + Bun |
| `checks-windows` | Windows | build/lint/test/protocol |
| `secrets` | Ubuntu | detect-secrets scanning |
| `macos` | macOS | TS tests + Swift lint/build/test |
| `android` | Ubuntu | Gradle test/build |
| `formal-conformance` | Ubuntu | Formal model verification (info) |
| `install-smoke` | Ubuntu | Docker installer tests |
| `docker-release` | Linux+ARM | Multi-platform Docker builds |
| `workflow-sanity` | Ubuntu | YAML tabs check |

### Job Details

#### `install-check`
- **Runner**: Blacksmith 4vCPU Ubuntu 2404
- **Purpose**: Verify frozen dependency installation

#### `checks` (Linux)
- **Runner**: Blacksmith 4vCPU Ubuntu 2404
- **Matrix Tasks**:
  1. `tsgo`: TypeScript type checking
  2. `lint`: `pnpm build && pnpm lint`
  3. `test`: `pnpm canvas:a2ui:bundle && pnpm test`
  4. `protocol`: `pnpm protocol:check`
  5. `format`: `pnpm format`
  6. `bun-test`: Bun runtime tests

#### `checks-windows`
- **Runner**: Blacksmith 4vCPU Windows 2025
- **Env**: `NODE_OPTIONS: --max-old-space-size=4096`, `OPENCLAW_TEST_WORKERS: 2`
- **Matrix**: Build+lint, Test, Protocol

#### `secrets`
- **Runner**: Blacksmith 4vCPU Ubuntu 2404
- **Tool**: `detect-secrets==1.5.0`
- **Baseline**: `.secrets.baseline`

#### `macos` (PR only)
- **Runner**: macOS Latest
- **Steps**:
  1. Node.js 22 + pnpm install
  2. TS tests (`pnpm test`)
  3. Xcode 26.1 + Swift tools install
  4. Swift lint (`swiftlint` + `swiftformat --lint`)
  5. Swift build (release config, retry 3x)
  6. Swift test (parallel + coverage)

#### `android`
- **Runner**: Blacksmith 4vCPU Ubuntu 2404
- **Java**: Temurin 21
- **Gradle**: 8.11.1
- **Matrix**: `testDebugUnitTest`, `assembleDebug`

#### `formal-conformance`
- **Runner**: Ubuntu Latest
- **Purpose**: Check tool groups/aliases against formal models repo
- **Status**: Informational (non-blocking)

#### `install-smoke`
- **Trigger**: Push main, PR, or manual
- **Test**: `pnpm test:install:smoke` (Docker-based)

#### `docker-release`
- **Trigger**: Push main or tags `v*`
- **Builds**: amd64 (Linux) + arm64 (macOS ARM)
- **Registry**: GHCR (`ghcr.io/openclaw/openclaw`)
- **Manifest**: Multi-platform image creation

#### `workflow-sanity`
- **Check**: No tabs in `.github/workflows/*.yml` files

### Build Commands Reference

| Command | Purpose |
|---------|---------|
| `pnpm build` | Build TS, A2UI bundle, plugin SDK |
| `pnpm tsgo` | TypeScript checks |
| `pnpm lint` | Oxlint |
| `pnpm format` | Oxfmt check |
| `pnpm check` | tsgo + lint + format |
| `pnpm check:loc` | File LOC check (max 500) |
| `pnpm test` | Vitest suite |
| `pnpm protocol:check` | Protocol schema validation |
| `pnpm canvas:a2ui:bundle` | Bundle A2UI assets |

---

## AI Agent / Multi-Agent Rules

### Multi-Agent Safety
| Do | Don't |
|----|-------|
| Focus on your changes | Create/apply/drop git stash |
| Commit scoped changes | Switch branches without request |
| Report only your edits | Touch unrecognized files |
| Continue if safe (same file) | Create/remove worktree checkouts |
| Reintegrate with `git pull --rebase` | Discard other agents' work |

### Command Interpretation
- **`push`**: `git pull --rebase` to integrate latest, never discard work
- **`commit`**: Scope to your changes only
- **`commit all`**: Commit everything in grouped chunks

### Bug Investigations
1. Read source code of relevant npm dependencies
2. Read all related local code
3. Aim for **high-confidence** root cause
4. Do not guess

### Release Guardrails
- **Do not** change version numbers without explicit consent
- **Always ask** permission before npm publish/release steps
- **Read** `docs/reference/RELEASING.md` before release work

### macOS Debugging
- Start/stop gateway via **OpenClaw app**, not ad-hoc tmux
- Kill temporary tunnels before handoff
- Do **not rebuild** macOS app over SSH (must run directly on Mac)

### External Messaging
- Never send streaming/partial replies to WhatsApp/Telegram
- Only final replies should be delivered to external surfaces
- Streaming/tool events may still go to internal UIs

### Session Files
- Path: `~/.openclaw/agents/<agentId>/sessions/*.jsonl`
- Use `agent=<id>` value from Runtime line of system prompt
- Use newest unless specific ID given

### Pre-commit Hooks
- **Setup**: `prek install`
- **Same checks as CI**: Runs lint/format/type checks before commit

### GitHub/PR Workflow
- **Review mode** (PR link only): `gh pr view`/`gh pr diff`, **do not** change code
- **Landing mode**: Create integration branch, merge PR (prefer rebase), apply fixes, add changelog, run full gate, commit, merge to main
- Print full URL at end of task

---

## Misc Guardrails

| Rule | Details |
|------|---------|
| Carbon dep | Never update |
| node_modules | Never edit |
| 1Password commands | Run in fresh tmux session |
| launchd PATH | Minimal; ensure pnpm bin in PATH |
| Session files | Use `~/.openclaw/agents/<agentId>/sessions/*.jsonl` |
| Release keys | Managed outside repo |
