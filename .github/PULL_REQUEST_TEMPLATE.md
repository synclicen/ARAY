## 📝 Description

<!-- What does this PR do? Link any related issues with "Fixes #123" or "Closes #123". -->

## 🎯 Type of change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🎨 Style/UI refinement
- [ ] ♻️ Refactor (no functional change)
- [ ] ⚡ Performance improvement
- [ ] 🧪 Test addition / fix
- [ ] 🔧 Chore (deps, config, build)

## 🧪 Verification

All of these pass locally:

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `node scripts/smoke-test.mjs` (45/45)
- [ ] Manual smoke test of affected features

## 📸 Screenshots / demo

<!-- If this PR changes UI or behavior, attach screenshots or a short screen recording. -->

## 🔒 Security review

If this PR touches any of the following, I have completed the security checklist in [CONTRIBUTING.md](../CONTRIBUTING.md):

- [ ] `src/preload/` (preload bridge)
- [ ] `src/main/ipc/` (IPC handlers)
- [ ] `src/main/security/` (security utilities)
- [ ] OAuth / Google Drive credentials
- [ ] Database schema

## 📚 Documentation

- [ ] Updated `README.md` if user-facing
- [ ] Updated relevant `docs/*.md`
- [ ] Updated `CONTRIBUTING.md` if workflow changed
- [ ] Code comments added for non-obvious logic

## 🎨 Brand compliance (if UI change)

- [ ] No hardcoded colors (used Tailwind tokens)
- [ ] Color balance respected (Purple 60% · Silver 25% · Gold 15%)
- [ ] Microcopy is on-brand (see `docs/BRANDING.md`)
- [ ] Animations ≤ 500ms

## ✅ Local-first check (if capture/storage change)

- [ ] File written to disk before DB insert
- [ ] Checksum verified after write
- [ ] Sync queue entry created only after DB insert
- [ ] Original file never auto-deleted unless explicitly opted in

---

**Yap. Snap. Repeat.**
