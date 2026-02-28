# Branch Protection Checklist

Use this for `main` in GitHub: `Settings -> Branches -> Add rule`.

## Recommended Rule

- Branch name pattern: `main`
- Require a pull request before merging: enabled
- Require approvals: `1` (minimum)
- Dismiss stale approvals when new commits are pushed: enabled
- Require conversation resolution before merging: enabled
- Require status checks to pass before merging: enabled
- Require branches to be up to date before merging: enabled

## Required Status Checks

Select these checks:

- `checks` (from `.github/workflows/ci.yml`)
- `eval-gate` (from `.github/workflows/eval-gate.yml`)

## Optional Hardening

- Require review from Code Owners: enabled
- Restrict who can push to matching branches: maintainers only
- Require signed commits: enabled (if team policy requires it)
- Do not allow force pushes: enabled
- Do not allow deletions: enabled

## Notes

- `Eval Gate` uses secret preflight and can skip gracefully on forks/missing secrets.
- For stricter policy on internal branches, configure a second eval workflow that hard-fails when secrets are missing.
