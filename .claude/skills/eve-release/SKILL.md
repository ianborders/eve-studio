---
name: eve-release
description: Cut a signed, notarized Eve Studio release from main. Picks the smallest sensible version bump, pushes a vX.Y.Z tag that triggers the macOS build + sign + notarize + publish GitHub Actions workflow, and verifies the release assets. Use when shipping a desktop build the in-app UPDATE → RESTART updater will pick up.
---

# Create an Eve Studio release (from `main`)

Pushing a `vX.Y.Z` tag fires `.github/workflows/release.yml`, which builds on
`macos-14`, **signs + notarizes**, and publishes the app to a GitHub Release on
this repo (`ianborders/eve-studio`, public). `electron-updater` in shipped apps
polls that release's `latest-mac.yml`; apps on a lower version then show the
**UPDATE → RESTART** control in the sidebar footer.

> Eve Studio is a **single public repo** — source and releases live here, and CI
> publishes with the built-in `GITHUB_TOKEN`. (Unlike KyberAgent, there is no
> separate feed repo, no `RELEASES_TOKEN`, and no env-image workflow.)

> Each release runs a `macos-14` Actions job (billed at a **10× minutes
> multiplier**) and notarizes with Apple (~1–3 min). Batch changes into one
> release rather than tagging every commit.

---

## Preconditions

- `gh auth status` — logged in with repo access.
- Repo secrets present (`gh secret list`): `CSC_LINK`, `CSC_KEY_PASSWORD`,
  `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Missing any ⇒ the
  build still publishes, just **un-notarized** (and the updater won't apply it on
  macOS, since Squirrel validates the signature). See "One-time setup" below.
- On `main` and current, clean tree:
  ```bash
  git checkout main && git pull --ff-only && git status
  ```

---

## 1. Versioning — smallest sensible bump

`package.json` `"version"` is the single source of truth. The updater compares
with **semver**, so the new version must be **strictly greater** than what's
shipped, and policy is to **increment as little as possible**.

| Bump | When | `0.0.1` → |
|------|------|-----------|
| **patch** (3rd) — **the default** | any normal release: fixes, small features, chores | `0.0.2` |
| **minor** (2nd) | a deliberate, notable feature batch worth calling out | `0.1.0` |
| **major** (1st) | do **not** pre-1.0 | `1.0.0` |

**Almost every release is a patch bump.** Never reuse, re-tag, or decrement a
version — a consumed version is burned forever.

---

## 2. Bump + tag + push (triggers the build)

The one-command path bumps the patch version, commits, tags `v<version>`, and
pushes commit + tag:

```bash
pnpm release           # npm version patch + git push --follow-tags
# notable feature batch instead:
pnpm release:minor
```

Prefer a minor? Use `pnpm release:minor`. Need exact control? Do it by hand:

```bash
npm version patch -m "release: v%s"   # edits package.json, commits, tags v0.0.2
git push --follow-tags                 # pushes main + the tag → fires release.yml
```

The tag push starts `release.yml`. Confirm the number went **up** — a version
≤ what's installed still builds but shows no update badge anywhere.

---

## 3. Watch the build

```bash
RID=$(gh run list --workflow=release.yml -L1 --json databaseId -q '.[0].databaseId')
gh run watch "$RID" --exit-status --interval 30
```

Exit 0 = success. Confirm signing + notarization actually ran:

```bash
gh run view "$RID" --log | grep -iE 'signing .*identity=|notarization|uploading .*provider=github'
```

---

## 4. Verify the release assets

```bash
NEW=$(node -p "require('./package.json').version")
gh release view "v$NEW" --json isDraft,assets -q '.assets[].name'
```

Expect `Eve Studio-<v>-arm64.dmg`, `Eve Studio-<v>-arm64-mac.zip`, both
`*.blockmap`s, and **`latest-mac.yml`** — the manifest the updater polls. If
`latest-mac.yml` is missing, the updater can't see the release.

---

## Done

Production apps on a version **below** the new one show **UPDATE** within ~6h (or
on next launch), download on click, then offer **RESTART**, which finalizes the
install and relaunches.

## Recovering from a mistake

- **Wrong/failed assets:** delete the release + tag, redo at the *next* version:
  ```bash
  gh release delete "v$NEW" --cleanup-tag --yes
  ```
- **Build failed mid-way:** `gh run rerun "$RID"`, or push a fix + a new tag.
- **Forgot to bump (no badge):** cut a new release at the next patch version.

## Troubleshooting

- **Release has no assets** → tag ≠ `v<package.json version>`, or the run failed.
- **Signing/notarization skipped** → a signing secret is missing (`gh secret list`).
- **Workflow didn't trigger** → it fires on a `v*` tag push; the workflow file
  must be on the default branch (`main`).
- **No update badge after publishing** → the running build predates the auto-
  updater, or its version isn't lower than the release. Only builds shipped with
  the updater (≥ the first signed release) will pick up new versions.

---

## One-time setup (signing secrets)

Set these repo secrets once (you already have the cert + Apple creds from other
apps):

```bash
# Developer ID Application cert exported as a .p12, base64-encoded:
gh secret set CSC_LINK < <(base64 -i DeveloperIDApplication.p12)
gh secret set CSC_KEY_PASSWORD          # the .p12 export password
gh secret set APPLE_ID                  # Apple account email
gh secret set APPLE_APP_SPECIFIC_PASSWORD   # appleid.apple.com → App-Specific Password
gh secret set APPLE_TEAM_ID             # 10-char Team ID (Apple Developer → Membership)
```

`build.publish` in `package.json` already points the updater at this repo, so no
token setup is needed — CI publishes with the default `GITHUB_TOKEN`.
