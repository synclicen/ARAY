# Contributing to ARAY

> **ARAY** — Are you Ready? and....Yapping!
>
> Thank you for contributing! This document covers the development workflow, coding standards, and review process.

## 🎯 Project Status

ARAY is currently in **Phase 1** (Core). See [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the full roadmap.

| Phase | Status | Focus |
|---|---|---|
| Phase 1 — Core | ✅ Shipped | Electron + React + brand + dashboard + events + SQLite + local storage + camera + gallery |
| Phase 2 — Photo Booth | 🚧 Next | Countdown, sessions, filters, template editor, composite, printing, green screen |
| Phase 3 — Google Drive | 📋 Planned | OAuth, sync queue, retry, offline mode |
| Phase 4 — Media | 📋 Planned | GIF, boomerang, video, video guestbook |
| Phase 5 — Advanced | 📋 Planned | AI bg removal, 360, local sharing, survey, virtual attendant |

## 🛠 Development Setup

### Prerequisites

- **Node.js 18+** (LTS recommended)
- **npm 9+**
- **Git 2.30+**
- **Windows 10/11 x64** (recommended for full Electron testing)
- macOS/Linux work for development; only the Windows installer build requires Windows

### First-time setup

```bash
git clone https://github.com/synclicen/ARAY.git
cd ARAY
npm install
npm run dev
```

### Common commands

```bash
npm run dev          # Start dev mode (Vite HMR + Electron)
npm run build        # Build main + preload + renderer to out/
npm run typecheck    # TypeScript type checking
npm run dist         # Build NSIS installer (Windows)
node scripts/smoke-test.mjs   # Run 45-invariant verification suite
```

## 🌿 Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, always-builds, ready-to-release |
| `feature/<name>` | New features (e.g., `feature/phase2-template-editor`) |
| `fix/<name>` | Bug fixes |
| `chore/<name>` | Maintenance, dependency bumps, refactors |

### Rules

- **Never** push directly to `main`. Always open a PR.
- **Always** branch from latest `main`: `git checkout main && git pull && git checkout -b feature/my-feature`.
- **Delete** your branch after merge.

## 📝 Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, semicolons, etc.) — no logic change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `chore` | Build process, dependencies, config |
| `ci` | CI/CD changes |
| `revert` | Reverting a previous commit |

### Scopes

`main`, `preload`, `renderer`, `database`, `storage`, `camera`, `ipc`, `brand`, `ui`, `booth`, `gallery`, `events`, `settings`, `sync`, `print`, `docs`, `ci`

### Examples

```
feat(booth): add countdown beep sound effect
fix(database): handle WAL checkpoint race condition
docs(security): document OAuth token encryption
chore(deps): bump electron to 31.4.0
ci: add Windows build matrix
```

## 🧪 Testing

### Before opening a PR

All of these must pass locally:

```bash
npm run typecheck
npm run build
node scripts/smoke-test.mjs
```

The CI workflow (`.github/workflows/ci.yml`) runs the same checks on every push.

### Smoke test

`scripts/smoke-test.mjs` verifies 45 invariants across:

- Brand design tokens (Purple Haze / Gold / Silver hex values)
- Database schema (13 tables + indexes + migration tracker)
- Repository CRUD (events, media, settings)
- Camera provider abstraction
- Local-first architecture (file written before DB row, checksum verification)
- Security (contextIsolation, nodeIntegration, preload bridge, CSP)

Run it before every commit that touches main process code.

### Manual test checklist

For UI changes, manually verify:

- [ ] App boots without errors
- [ ] First-run wizard completes
- [ ] Dashboard loads with stats
- [ ] Create event → appears in list
- [ ] Booth: greeting → countdown → flash → capture → result
- [ ] Gallery shows captured photo
- [ ] Settings persist across restart

## 🎨 Brand & UI Guidelines

See [`docs/BRANDING.md`](../docs/BRANDING.md) for the full design system.

Key rules:

- **Never hardcode colors** — always use Tailwind tokens (`purple-haze-500`, `gold-400`, etc.)
- **Color balance**: Purple 60% · Silver 25% · Gold 15%
- **Inter** is the only typeface (system fallback allowed)
- **Microcopy** is sparse and on-brand — never use all phrases at once
- **Animations** are 200-300ms by default; never longer than 500ms for UI

## 🔒 Security Review

Any PR that touches these paths requires explicit review from `@synclicen`:

- `src/preload/`
- `src/main/ipc/`
- `src/main/security/`
- `docs/SECURITY.md`

See [`.github/CODEOWNERS`](CODEOWNERS) for the full list.

### Security checklist for new IPC handlers

- [ ] Input validated (TypeScript types + runtime check)
- [ ] Path arguments passed through `isPathWithinStorage()`
- [ ] Filenames passed through `sanitizeFilename()`
- [ ] Errors caught and returned as `ArayIPCResult` (never throw to renderer)
- [ ] No secrets logged
- [ ] No `ipcRenderer` exposed (only typed `window.aray` methods)

## 📦 Dependency Policy

- **Patch updates** (e.g., `1.2.3` → `1.2.4`): auto-merged by Dependabot
- **Minor updates** (e.g., `1.2.3` → `1.3.0`): reviewed manually
- **Major updates** (e.g., `1.x` → `2.x`): require a migration plan + breaking change note
- **Security advisories**: patched within 48 hours

Dependabot config: [`.github/dependabot.yml`](dependabot.yml)

Major updates for `electron`, `better-sqlite3`, and `sharp` are explicitly **ignored** by Dependabot — these native bindings require manual migration testing.

## 🚀 Release Process

1. **Tag a release**: `git tag v1.0.0 && git push origin v1.0.0`
2. **CI triggers**: `.github/workflows/release.yml` runs on Windows runner
3. **Build**: typecheck → build → smoke test → NSIS installer
4. **Publish**: GitHub Release auto-created with `ARAY-Setup-1.0.0.exe` attached
5. **Announce**: update README badge, post to socials

Phase 5 will add code signing (`CERT_PASSWORD` secret) before public release.

## 📚 Documentation Standards

Any PR that adds a user-facing feature must update:

- [ ] `README.md` — quick start, features
- [ ] Relevant `docs/*.md` — architecture, security, branding
- [ ] In-app microcopy (if UI changed)
- [ ] Code comments for non-obvious logic

### File header comments

Every TypeScript file should start with a brief JSDoc explaining its purpose:

```typescript
/**
 * ARAY Camera Provider Abstraction
 * Defines the contract for all camera implementations (webcam, DSLR, etc.)
 */
```

## 🤝 Code Review

### What reviewers look for

1. **Correctness** — does it do what it claims?
2. **Tests** — does it pass typecheck + smoke test?
3. **Security** — does it follow the security checklist above?
4. **Performance** — does it block the UI thread? Use async/worker where needed.
5. **Brand** — does it use design tokens? No hardcoded colors?
6. **Documentation** — are non-obvious decisions explained?
7. **Local-first** — does it preserve the "save local → verify → sync" order?

### Review turnaround

- Initial review: within 48 hours
- Follow-up reviews: within 24 hours
- Security-critical PRs: within 12 hours

## 📞 Getting Help

- **Issues**: <https://github.com/synclicen/ARAY/issues>
- **Discussions**: <https://github.com/synclicen/ARAY/discussions> (if enabled)
- **Security**: see [`docs/SECURITY.md`](../docs/SECURITY.md) for responsible disclosure

---

**Yap. Snap. Repeat.** 🎉
