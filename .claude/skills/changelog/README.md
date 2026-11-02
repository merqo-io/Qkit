# changelog

## Purpose

Skill that appends a Keep-a-Changelog entry to `CHANGELOG.md`, under `[Unreleased]` or the bumped version's heading.

## Contents

- `SKILL.md` — defines the `changelog` skill (`allowed-tools: Read(CHANGELOG.md), Edit(CHANGELOG.md), Read(package.json), Bash(git show origin/main:package.json)`, `argument-hint: [Added|Changed|Fixed|Removed] <summary>`). Instructs the agent to compare `package.json`'s `version` with `origin/main`'s: if bumped, the target is that version's `## [x.y.z] - YYYY-MM-DD` heading (created below `## [Unreleased]` when missing), otherwise `## [Unreleased]`. It then reads `CHANGELOG.md`, finds or creates the matching `### Added`/`### Changed`/`### Fixed`/`### Removed`/`### Security` subsection under the target heading, and add one concise bullet describing what changed and why — not a file list. Follows the keepachangelog.com convention; never invents a version that `package.json` does not have.

## Connectivity

Scoped by `allowed-tools` to edit only the root `CHANGELOG.md`; besides it, it can read only `package.json` and run `git show origin/main:package.json`. Invoked as `/changelog` (or model-triggered given its description) whenever a change should be recorded for the next release.

## Parent

[skills](../README.md)
