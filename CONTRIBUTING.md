# Contributing

1. Use Node.js 20 or newer.
2. Run `npm ci`.
3. Make focused changes with tests.
4. Run `npm run check` before opening a pull request.
5. Commit regenerated `lib/` artifacts when source behavior changes.

## Maintainer acceptance gate

For every UI or runtime-behavior change, the maintainer must follow this order:

1. run the complete local verification suite;
2. install the candidate build into the maintainer's current DSH Desktop profile;
3. let the requester try it in the current DSH Desktop window;
4. wait for the requester's explicit approval;
5. only after approval, commit/push the change and create or update a GitHub release.

Do not push, tag, or publish a candidate merely because automated tests pass. User acceptance in the real DSH window is a required release gate.

Please do not include credentials, private session data, unpublished model metadata, screenshots containing personal information, or generated dependency directories.

This is an unofficial community plugin. Contributions must not imply endorsement by DeepSeek or the DeepSeek Harness maintainers.
