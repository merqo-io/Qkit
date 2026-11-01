---
name: changelog
description: Append a Keep-a-Changelog entry to CHANGELOG.md, under [Unreleased] or the bumped version's heading.
allowed-tools: "Read(CHANGELOG.md), Edit(CHANGELOG.md), Read(package.json), Bash(git show origin/main:package.json)"
argument-hint: "[Added|Changed|Fixed|Removed] <summary>"
---

Add a one-line entry to `CHANGELOG.md` under `## [Unreleased]`, or under the
branch's version heading when the branch bumps the version.

1. Run `git show origin/main:package.json` and read `package.json`. If this
   branch's `version` differs from origin/main's, the target is that version's
   heading, `## [x.y.z] - YYYY-MM-DD` (today's date when creating it). If the
   heading is missing, create it directly below `## [Unreleased]`, above the
   previous release. Otherwise the target is `## [Unreleased]`.
2. Read `CHANGELOG.md`.
3. Under the target heading, find or create the matching subsection
   (`### Added` / `### Changed` / `### Fixed` / `### Removed` / `### Security`).
4. Add a concise bullet — what changed and why it matters, not the file list.

Follow Keep a Changelog (https://keepachangelog.com). Group by type, newest at the
top of `[Unreleased]`. Never invent a version that `package.json` does not have; a branch that bumps
nothing keeps its entries in `[Unreleased]`, which a release cuts into a
dated version separately.
