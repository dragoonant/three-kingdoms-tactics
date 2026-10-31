# 11 — First battle: Daxing Hill (184 AD)

**Source story:** in *Romance of the Three Kingdoms* chapter 1, the newly sworn brothers Liu Bei, Guan Yu and Zhang Fei march under the Youzhou official Zou Jing against the Yellow Turban generals Cheng Yuanzhi and Deng Mao at Daxing Hill. Zhang Fei kills Deng Mao and Guan Yu kills Cheng Yuanzhi. The novel is public domain. Every line of prose in the game is ours.

**Cast liberties:** Jian Yong (Liu Bei's boyhood friend) is added as the party's strategist. The four rebel captains and the Taiping Adept are invented minor officers, flagged `invented: true` in the data.

## Objective
- Win: rout Cheng Yuanzhi, or every rebel unit.
- Lose: Liu Bei is routed, or round 15 ends (`onTimeout: yellow`).
- Side order: `han` (player) then `yellow`.

## Map (14 × 12)
Legend: `.` plain, `f` farm, `T` forest, `h` hill, `v` village, `=` road (the tile at x8,y6 is a bridge), `~` river, `o` ford.

```
   x 0123456789ABCD
y0   TTT...ff~...TT
y1   TT...fff~..hTT
y2   T....fffo.hhh.
y3   ....ffff~.hhh.
y4   ...fffff~..hh.
y5   ....fff.~...h.
y6   =v============
y7   ....fff.~...h.
y8   ...ffff.~..hh.
y9   T...fff.~..hhT
y10  TT...ff.o...TT
y11  TTT.....~..TTT
```
The river can be crossed at the bridge (8,6) and the fords (8,2) and (8,10). The millet fields west of the river are the fire trap. Daxing Hill rises on the east bank.

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | E | breeze |
| 6 | — | calm |
| 9 | W | gale |
| 12 | E | breeze |

The east breeze favours burning rebels as they cross. The round-9 westerly gale turns any fire still burning back onto the Han line, so the player should finish the fire play early.

## Officers (stats War/Int/Lead/Cha, Loyalty)
| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Bonds | Stratagems | Start (x,y) facing |
|---|---|---|---|---|---|---|---|---|---|
| liu-bei | Liu Bei (commander) | han | infantry | 2000 | 72/74/78/98 | — | guan-yu, zhang-fei | twin-blades, rally | (1,6) E |
| guan-yu | Guan Yu | han | cavalry | 2000 | 97/75/95/85 | — | liu-bei, zhang-fei | crescent-sweep, thundering-charge | (3,4) E |
| zhang-fei | Zhang Fei | han | infantry | 2000 | 98/30/85/45 | — | liu-bei, guan-yu | serpent-thrust, thunder-roar | (3,8) E |
| zou-jing | Zou Jing | han | archers | 2500 | 55/60/70/60 | — | — | arrow-rain | (2,5) E |
| jian-yong | Jian Yong | han | archers | 1500 | 40/72/50/80 | — | — | fire-attack, sow-discord | (2,7) E |
| cheng-yuanzhi | Cheng Yuanzhi (commander) | yellow | infantry | 3000 | 70/40/65/50 | — | — | mob-rush | (11,4) W |
| deng-mao | Deng Mao | yellow | infantry | 2500 | 68/35/55/30 | — | — | mob-rush, rebel-war-cry | (10,7) W |
| captain-gao | Rebel Captain Gao* | yellow | infantry | 1500 | 50/30/45/25 | 40 | — | mob-rush | (9,2) W |
| captain-sun | Rebel Captain Sun* | yellow | infantry | 1500 | 48/35/42/30 | 45 | — | mob-rush | (9,9) W |
| captain-ma | Rebel Captain Ma* | yellow | cavalry | 1500 | 55/25/40/20 | 35 | — | torch-raid | (10,6) W |
| captain-wu | Rebel Captain Wu* | yellow | archers | 1500 | 45/40/42/30 | 50 | — | massed-arrows | (11,3) W |
| taiping-adept | Taiping Adept* | yellow | archers | 1200 | 30/68/40/55 | 55 | — | yellow-sky-hex | (12,5) W |

`*` invented.

## Stratagems
| id | Name | Tag | Cost | Range | Area | Power | Stat | Effect | Follows |
|---|---|---|---|---|---|---|---|---|---|
| twin-blades | Twin Blades | Strike | 3 | 1–1 | single | 1.3 | war | — | Strike, Shout, Charge |
| rally | Rally the Militia | Command | 4 | 0–2 | aura (allies incl. self) | 0 | — | heal 15% max troops | — |
| crescent-sweep | Crescent Sweep | Strike | 4 | 1–1 | sweep | 1.2 | war | — | Strike, Shout, Volley, Charge |
| thundering-charge | Thundering Charge | Charge | 5 | 2–3 | single | 1.5 | war | dash | Volley, Shout |
| serpent-thrust | Serpent Thrust | Strike | 3 | 1–2 | single | 1.4 | war | — | Strike, Charge |
| thunder-roar | Thunder Roar | Shout | 4 | 0–0 | adjacent | 0.5 | war | confuse | Strike, Charge |
| arrow-rain | Arrow Rain | Volley | 3 | 2–3 | cross (neighbours ×0.6) | 1.0 | war | — | Strike, Charge, Shout, Fire |
| fire-attack | Fire Attack | Fire | 5 | 1–3 | single | 1.0 | int | ignite | Volley, Fire |
| sow-discord | Sow Discord | Ruse | 4 | 1–3 | single | 0 | int | confuse | Fire, Shout |
| mob-rush | Mob Rush | Strike | 3 | 1–1 | single | 1.3 | war | — | Strike, Shout |
| rebel-war-cry | Rebel War Cry | Shout | 4 | 0–0 | adjacent | 0.4 | war | confuse | Strike |
| torch-raid | Torch Raid | Fire | 5 | 1–1 | single | 0.8 | war | ignite | Strike |
| massed-arrows | Massed Arrows | Volley | 3 | 2–3 | single | 1.1 | war | — | Strike, Shout |
| yellow-sky-hex | Yellow Sky Hex | Ruse | 4 | 2–3 | single | 0.6 | int | confuse | Volley, Strike |

## Intended play (a design check, not a script)
The rebels will want to cross the river. If the Han hold the farm belt, Jian Yong can light the millet under the east breeze. Arrow Rain then opens Volley→Strike→Strike chains through Guan Yu and Zhang Fei with the bond bonus. Liu Bei's Charisma 98 makes swaying hurt captains (Loyalty 35–50) a real option. Cheng Yuanzhi on the hilltop is hard to reach (hill elevation, Captain Wu's arrows), so a cavalry Thundering Charge up the road is the decisive play. The round-9 gale punishes leaving fires burning.
