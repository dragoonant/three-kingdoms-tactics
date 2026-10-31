# Three Kingdoms Tactics — agent orientation

An original 3D browser grid-tactics game set in the Three Kingdoms era (spiritual successor to Dynasty Tactics; not a port, not affiliated with Koei Tecmo). Owner credit: **evilgouki**. Never write the owner's real name, email or home path into this repo.

- **Read first:** `PLAN.md` (decisions D1–D12, milestones), `STATUS.md` (current state), `docs/spec/00-architecture.md` (frozen contracts), `docs/spec/10-rules.md` (rules with ids), `docs/spec/11-battle-daxing-hill.md`, `docs/spec/50-presentation.md`.
- **Knowledge base:** `docs/knowledge-base/` (submodule of the private `dragoonant/tabletop-kb`; run `git submodule update --init`). Its README lists the owner's standing rules. Update `tabletop-kb/three-kingdoms-tactics.md` at the end of every milestone.
- **Engine rules:** `src/engine` is pure and deterministic (no DOM, React, three or `Math.random`). `step` never throws, `legalActions` is never empty before the result, and `query.*` owns every number the UI shows.
- **Rules changes:** edit `10-rules.md` first, log it in PLAN.md "Rulings / balance log", then change the code. Tests are named by rule id.
- **Skin:** everything visual follows `50-presentation.md`. Never copy a sibling game's skin.
- **Commands:** `npm run dev | typecheck | test | build | e2e`. Playwright uses `/opt/pw-browsers/chromium` when it exists. Set `PW_PORT` per worktree.
- **Git:** commit and push to `main` after each stage (owner-approved). Gate the commit, not the working tree. While agents run, commit only your own paths (`git commit -- <paths>`).
