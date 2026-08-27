# Security Policy

## Supported Versions

ARAY is in active Phase 1 development. Security fixes are applied to the latest `main` branch only.

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| Tagged releases `v1.x` | ✅ |
| Older branches | ❌ |

## Reporting a Vulnerability

**Please DO NOT open a public GitHub issue for security vulnerabilities.**

Instead, report privately:

1. Go to <https://github.com/synclicen/ARAY/security/advisories/new>
2. Click **"Report a vulnerability"**
3. Fill in:
   - Description of the issue
   - Steps to reproduce
   - Affected versions
   - Suggested fix (if any)
4. Submit

### What to expect

- **Acknowledgment**: within 24 hours
- **Initial assessment**: within 72 hours
- **Fix or mitigation**: within 7 days for high-severity, 30 days for low-severity
- **Public disclosure**: after a fix is released, coordinated with reporter

### Scope

**In scope**:

- Electron security misconfigurations (contextIsolation, nodeIntegration, sandbox)
- IPC handler vulnerabilities (path traversal, input validation)
- OAuth / credential storage weaknesses
- SQL injection in database layer
- XSS in renderer (CSP bypass)
- Local file access beyond the configured storage path
- Dependency vulnerabilities with proven exploit path

**Out of scope**:

- Theoretical vulnerabilities without a reproducible exploit
- Social engineering attacks
- DoS attacks requiring physical access to the operator machine
- Issues in third-party services (Google Drive, Windows print spooler) — report to upstream
- Findings from automated scanners without manual verification
- Self-XSS requiring the user to paste attacker-controlled content into DevTools

### Bug bounty

ARAY does not currently offer a monetary bug bounty. Contributors who report valid security issues will be credited in the release notes (unless they prefer to remain anonymous).

## Security Measures

See [`docs/SECURITY.md`](../docs/SECURITY.md) for the full security architecture. Highlights:

- ✅ `contextIsolation: true`, `nodeIntegration: false`
- ✅ Preload uses `contextBridge` — never exposes `ipcRenderer`
- ✅ Content Security Policy meta tag in renderer HTML
- ✅ Path traversal prevention via `isPathWithinStorage()`
- ✅ Filename sanitization via `sanitizeFilename()`
- ✅ SHA-256 checksum verification on captured files
- ✅ Local-first architecture (files saved before DB rows, before sync queue)
- ⏳ OAuth tokens encrypted at rest via Electron `safeStorage` (Phase 3)
- ⏳ Zod schema validation on every IPC payload (Phase 2)
- ⏳ Preload sandboxed (Phase 2)
- ⏳ Windows code signing (Phase 5)
- ⏳ Auto-update signature verification (Phase 5+)

## Disclosure Policy

When a security fix is released:

1. A GitHub Security Advisory is published with CVSS score and CVE assignment (if applicable)
2. The fix is included in the next tagged release
3. Release notes credit the reporter (unless anonymous)
4. A blog post may be written for high-severity issues

## Contact

- **Security advisories**: <https://github.com/synclicen/ARAY/security/advisories>
- **General security questions**: open a Discussion (public) or Advisory (private)
