# RL — Minor battle: Zhou Cang's Pass (184 AD), `rl-bandit-pass`

**Used by:** the roguelike era 1 stop `bandit-offer/clear` (`16-roguelike-era1.md` §3 and §4; listed there as the `bandit-pass` variant of `village-siege`, built as its own battle id). Not in the campaign arc.

**Source story:** *Romance of the Three Kingdoms* ch. 28: Pei Yuanshao and Zhou Cang, former Yellow Turbans turned hill bandits, meet Guan Yu on the road and Zhou Cang begs to follow him. Every line of prose is ours.

**Cast liberties / alt-history flags:**
- **Met early (alt-history):** the novel sets this in ch. 28 (around 200 AD); the roguelike moves it to 184 (owner, 2026-11-01: a romanticised novel). Flagged in `16-roguelike-era1.md` and in each officer's `note`.
- Zhou Cang and Pei Yuanshao are the novel's figures and are shared officers in `officers.json` (they get kit figures and portraits). Zhou Cang is `recruitable` with loyalty 45 (the run layer sets his loyalty to null once he has joined).
- The three bandit units are invented (`invented: true`, ids `bp-*`).

## Objective
- Win: rout Pei Yuanshao (`routCommander`).
- Lose: Liu Bei is routed (`commanderLost`), or round 10 ends (`timeout`, `onTimeout: yellow`).
- Side order: `han` then `yellow` (the side is named "Hill Bandit", colour token `yellow`). Par 7 rounds.
- **Win the man, not the pass:** Zhou Cang (`retreatAt 0.5`, loyalty 45) can be swayed (R-SWAY-1/2; Liu Bei's chance at full troops is 98 − 45 = 53%, plus the run's `swayBonus`, RL-MOD-3). A swayed Zhou Cang joins the band after the battle whatever the Renown: the run layer reads the `swayed` event (the campaign's recruit rule). If he retreats instead, he is gone.

## Deploy
`deploySlots: 3`, `required: [liu-bei]`, `defaultDeploy: [liu-bei, guan-yu, zhang-fei]`. Starts on the west road: (1,4) E, (0,5) E, (1,3) E.

## Map (12 × 10)
Legend: `.` plain, `T` forest, `h` hill, `=` road, `r` rampart (the stockade).

```
   x 0123456789AB
y0   TThhTTThhTTT
y1   ThhhTThhhrTh
y2   ..hh..hh.r..
y3   ........hr..
y4   ============
y5   ============
y6   ........hr..
y7   ..TT..hh.r..
y8   ThhhTThhhrTh
y9   TThhTTThhTTT
```
- **The road** (y4–5) runs the length of the pass between wooded hills (north y0–2, south y7–9).
- **The stockade** is a rampart line at x9 (y1–3, y6–8) with a **two-tile gap** on the road at (9,4)–(9,5). Rampart: infantry and archers can climb it (cost 2), cavalry cannot; archers on it get +1 range and the height bonus.

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | — | calm |
| 5 | W | breeze |

## Officers (stats War/Int/Lead/Cha, Loyalty). `*` invented.
| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Stratagems | Start (x,y) facing | Hint |
|---|---|---|---|---|---|---|---|---|---|
| (deploy) | Liu Bei + two of the band | han | — | sliders | — | — | — | (1,4), (0,5), (1,3) E | — |
| pei-yuanshao | Pei Yuanshao (commander) | yellow | infantry | 2000 | 62/32/52/30 | — | mob-rush, rebel-war-cry | (10,4) W | `hold` |
| zhou-cang | Zhou Cang (`retreatAt 0.5`) | yellow | infantry | 2000 | 85/30/60/40 | 45 | mob-rush | (7,5) W | `advance` |
| bp-bowman-a | Bandit Bowman Yan* | yellow | archers | 1300 | 46/34/40/24 | 44 | massed-arrows | (9,2) W (rampart) | `hold` |
| bp-bowman-b | Bandit Bowman Kou* | yellow | archers | 1300 | 45/32/40/22 | 46 | massed-arrows | (9,7) W (rampart) | `hold` |
| bp-spearman | Bandit Captain Shi* | yellow | infantry | 1800 | 54/28/46/24 | 40 | mob-rush | (8,4) W | `guard:9,4` |

Bandits: Pei Yuanshao, Zhou Cang and 3 invented units, 8,400 troops at tier scale 1.0.

## Timeline
| Round | Phase | Kind | Text |
|---|---|---|---|
| 1 | start | message | Zhou Cang plants his axe in the road in front of the stockade gap. He is looking at Guan Yu, not at you. |

## Intended play
1. Zhou Cang comes down the road alone at the head of the bandits. Hitting him hard makes him retreat at half troops (lost to you); getting Liu Bei within two tiles and swaying him wins him (and his 2,000 men) at once.
2. The bowmen on the rampart cover the gap; the spearman and Pei hold it. Cavalry cannot climb the rampart, so Guan Yu goes through the gap or round the forest ends of the stockade (x9, y0 and y9).

## Balance notes (RL1b)
- Bench: greedy player (Liu Bei, Guan Yu, Zhang Fei; level 3, +2, 1,800 troops each) against the normal AI, 60 games (seeds 7000–7059): **han 42/60 = 70%**, 8.6 rounds; losses: 4 Liu Bei routed, 14 timeouts. The greedy bot swayed an enemy unit 1.8 times a game on average. At 1,500 troops each (40 games): 53%. The normal AI as the player (20 games): 95% (a careful player clears the pass; the run's tier scale is the lever). 0 invariant failures, no stalls.
- First draft (a fourth invented unit, a bandit rider; Pei 2,200, bowmen 1,500) gave 2/30: the greedy bot sent Guan Yu alone into the stockade gap and lost him to the rampart bowmen. The rider is gone (spec: 3 invented units), Pei is 2,000 and the bowmen 1,300.

## Rulings
- The battle is its own id (`rl-bandit-pass`) rather than a variant of `rl-village-siege`: RL1 pre-registered four ids and the variants mechanism of spec 15 §7 is not built.
- Recruiting Zhou Cang after a sway is the run layer's job (RL1a), not an engine rule; the engine only reports the `swayed` event and keeps him on the han side.
