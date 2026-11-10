# Public release preparation

This separate source snapshot contains no copied Git history, remote configuration,
local databases, browser data, credentials or image archives. Club settings are synthetic
examples: configure your club before building/using live checks.

Prefer a **new repository with one reviewed initial commit**. Keep the existing private
repository and installed app intact. Do not import/merge old history or push old branches
and tags. An orphan branch alone does not sanitize other refs, PRs or Actions history.

Use a reviewed initial commit with a GitHub no-reply author email and retain GPL notices.
Keep the new repository private until its public release is explicitly approved. Never
merge the old private history into it. Use ignored-file handling; never upload a raw working
folder containing dependencies, build output or local state.

Before changing visibility or publishing an image, review repository/package permissions,
issues/PRs, Actions history/artifacts, metadata and container layers. Exposed credentials
must be revoked/rotated; rewriting history alone cannot revoke them or purge other clones.

References:

- [GitHub: removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [GitHub: repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
