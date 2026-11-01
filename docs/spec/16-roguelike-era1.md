# 16 — Roguelike era 1: "Yellow Turbans" (v0.1, RL0 design pass, 2026-11-01)

This is the full design of the first era of "Roads to War", built on the agreed plan in `15-roguelike.md` (v0.4). Nothing here is implemented yet; RL1 builds it.

- **Data:** `docs/spec/data/era1-stops.json` holds every number on this page. It is the seed for `src/data/eras/yellow-turbans.json` and `src/data/stops/*.json` in RL1. Where this page and the JSON disagree, the JSON wins and this page is a bug.
- **Rules:** every mechanic has an `RL-` id in `10-rules.md` §11.
- **Sim:** the numbers were tuned with `tools/roguelike/paper-sim.mjs`. The report, with a battle model that is only a placeholder, is `16-roguelike-era1-sim.md`.
- **Wireframes:** `docs/wireframes/roguelike/` (road, stop, deploy, finale briefing; desktop and phone).

Source: *Romance of the Three Kingdoms* ch. 1–2 (public domain), romanticised as the owner asked ("keep it from the novel. I'd like a romanticized version of history", 2026-11-01). Every scene line is our own paraphrase. Liberties are flagged where they occur.

## 1. Starting state
| | Value | Rule |
|---|---|---|
| Rice | 50 bags (lasts 16 days for 1,500 soldiers) | RL-UPKEEP-1 |
| Soldiers | 1,500 healthy, 0 wounded | RL-POOL-1 |
| Renown | 30 | RL-REN-1 |
| Day | 0 | RL-CAL-1 |
| Band | Liu Bei, Guan Yu, Zhang Fei, all level 3 (the campaign's starting levels) | RL-RUN-1 |

The prologue scene is the peach garden oath (three to six speech slips, our own prose, skippable). The first stop is always the recruiting notice at Zhuo.

**Command caps** (RL-POOL-2): cap = 20 × Leadership + 100 × level, rounded down to 50, plus any cap bonus from a stop, and halved (to 50) while the officer is hurt.

| Officer | Lead | Level at start or join | Cap | How he joins |
|---|---|---|---|---|
| Liu Bei | 78 | 3 | 1,850 | start (commander, always deployed) |
| Guan Yu | 95 | 3 | 2,200 | start |
| Zhang Fei | 85 | 3 | 2,000 | start |
| Jian Yong | 50 | 2 | 1,200 | wins the Daxing Hill battle (both Daxing choices that fight) |
| Zhou Cang | 60 | 2 | 1,400 | `bandit-offer/accept` at Renown 40+ (alt-history: the novel has him join Guan Yu in ch. 28) |
| Liao Hua | 70 | 2 | 1,600 | `yellow-deserters/enlist` at Renown 55+ (alt-history: the novel has him join Guan Yu in ch. 27) |

Proposed stats for the two new officers (shared-table scale, `14-campaign-battles.md`): **zhou-cang** 85/30/60/40 infantry, loyalty null once he has joined, stratagems `mob-rush`; **liao-hua** 70/62/70/62 infantry, stratagems `twin-blades`. Both are `recruitable` and must never appear as enemies later (the validator rule). Each fielded officer gains XP from the battle log exactly as in the campaign (RL-XP-1, reusing `xpFromLog`), so caps grow by 100 a level.

## 2. The road template (RL-ROAD-1 to 6)
A run's road is drawn once, from the run seed, before the first stop. It never changes during the run.

| Tier | Name | What it holds |
|---|---|---|
| 0 | Zhuo | `zhuo-notice` (fixed, one node) |
| 1 | Youzhou | `daxing-hill` (fixed, one node: always a battle, owner 2026-11-01) |
| 2 | The Qingzhou road | `qingzhou-relief` + one from the **early** pool |
| 3–5 (short road) or 3–6 (long road) | The southern campaign | each tier: one **battle stop** from the mid pool + one other mid stop (which can also be a battle stop) |
| last | Julu | two stops from the **late** pool |
| — | Guangzong | the finale |

- **Length** (RL-ROAD-1): a coin from the seed picks the short road (7 stops) or the long road (8 stops). The mountain path skips one, so a run visits **6 to 8 stops** and then the finale.
- **Pools** (RL-ROAD-2): early = horse-merchants, refugee-column, yellow-deserters, hungry-county, flooded-ford. Mid = village-under-siege, bandit-offer, lu-zhi-in-chains, dong-zhuo-rescue, huangfu-song-fires, captured-granary, plague-camp, rest-or-push, inspector, refugee-column, yellow-deserters, hungry-county, flooded-ford. Late = zhang-bao-sorcery, zhu-jun-camp, guangzong-eve, rest-or-push, captured-granary. A stop appears at most once a run; `dong-zhuo-snub` only appears as the aftermath of winning `dong-zhuo-rescue`.
- **Drawing order** (deterministic, RL-RNG-1, stream "road"): place the fixed and anchor stops; then give each mid tier a battle stop (village-under-siege, bandit-offer, lu-zhi-in-chains, dong-zhuo-rescue, not yet used); then fill every tier to two nodes from its pool (an anchor tier's partner is never a battle stop, so the early tiers stay one battle each); then shuffle the lane order of each tier.
- **Lanes and crossings** (RL-ROAD-3): every tier has two nodes, a left lane and a right lane. A node always connects to the same lane in the next tier, and to the other lane with chance 1/2 (drawn per pair). Tier 0 connects to both nodes of tier 1. Both nodes of the last tier lead to Guangzong.
- **Leg days** (RL-ROAD-4): each connection is 1 day (weight 2), 2 days (weight 5) or 3 days (weight 3). The last leg to Guangzong is always 2 days. The road shows each leg's days on the brush line.
- **The mountain path** (RL-ROAD-5): from tier 2 or tier 3 (seeded), each node also has a path to the same lane **two** tiers on. It takes 2 days, costs 5% of the healthy soldiers to stragglers (half killed, half wounded), skips a stop and cannot be force-marched. The long road through the skipped tier is safe but slower, and it has one more dilemma (often more rice or men).
- **Battles on every path** (RL-ROAD-6): tier 1 is Daxing Hill (always fought), tier 2 offers Qingzhou, and every mid tier has at least one battle stop. So every path offers at least 4 battle choices (3 through the mountain path) before the finale. Battles are always choices, never forced; in the sim the median run takes **2** (benevolent 2, balanced 1–2, ruthless 1, greedy-fighter 4).
- **Visibility** (RL-ROAD-6): the road shows the next **two** tiers ahead of the band: each stop's title, its marks (crossed spears = a choice is a battle; a house = a town or village, so volunteers; a scale = a market; a tent = a camp) and every leg's days. A stop's choices are only read on arrival. Everything further on is a blank, rolled scroll.

**Between stops** (always offered on the road screen, before picking the next leg):
- **Make camp, 2 days** (RL-REST-2): half the wounded return (rounded down to 10) and the tiredness clears. Below Renown 20, 5% of the healthy soldiers desert.
- **Forced march** on the chosen leg (RL-MARCH-1): a leg of L ≥ 2 days takes ⌈L/2⌉ days; it costs 3% of the healthy soldiers per day saved (half killed, half wounded) and the band arrives tired.
- **Send men home** (RL-POOL-4): any number of healthy or wounded soldiers leave for good. It costs nothing else; it is how a hungry band stretches its rice.

## 3. The stop pool (20 stops and one aftermath)
Every stop is one scene on the sand table and 2–3 choices. Each choice slip prints its exact effects (RL-CHOICE-1) except hidden echoes (marked *echo* below, RL-ECHO-1), which the player never sees until they pay off. A flag marked "stated" is printed on the slip with its payoff. Gambles print their odds (RL-GAMBLE-1). A choice whose rice cost is more than the band holds is shown greyed with the reason (RL-CHOICE-2).

**Applied at every stop after the choice** (so they are not repeated in each row):
- **Volunteers** (RL-REN-3): at a stop tagged town or village, Renown × 10 healthy soldiers join after the choice, using Renown after the choice, unless the choice says "no volunteers".
- **Gift** (RL-REN-2): at a town or village stop with Renown 50+ after the choice, the elders bring Renown ÷ 5 bags (rounded down), unless the choice says "no volunteers".
- **Market** (RL-POOL-5): at a stop tagged market, rice buys paid levies, 100 soldiers per 5 bags (4 at Renown 50+, 10 under 20), up to 500 per stop.
- A battle takes 1 day (RL-DEPLOY-4) and its rice is paid at deploy (RL-DEPLOY-3).

**Order liberties (romanticised):** the inspector (ch. 2) comes after the rebellion in the novel and is moved onto the road; Zhang Bao's sorcery (ch. 2) is fought at Yangcheng in the novel and is folded into Guangzong (already flagged in `03-guangzong.md`); Zhou Cang and Liao Hua (ch. 27–28) are met years early. Generic road stops are marked "road".

| Stop | Source | Where it can appear | Tags | Battle choice | Gamble |
|---|---|---|---|---|---|
| `zhuo-notice` | novel ch. 1 | tier 0 (fixed) | town, market | — | — |
| `horse-merchants` | novel ch. 1 | early | road | — | yes |
| `daxing-hill` | novel ch. 1 | tier 1 (anchor) | town, market | daxing-hill | yes |
| `qingzhou-relief` | novel ch. 1 | tier 2 (anchor) | town, market | qingzhou | yes |
| `village-under-siege` | road | mid | village | village-siege | yes |
| `refugee-column` | road | early, mid | road | — | — |
| `yellow-deserters` | road | early, mid | road | — | — |
| `hungry-county` | road | early, mid | town, market | — | — |
| `flooded-ford` | road | early, mid | road | — | yes |
| `bandit-offer` | novel ch. 28 (moved earlier: alt-history) | mid | road | village-siege | — |
| `huangfu-song-fires` | novel ch. 1 | mid | road | — | yes |
| `captured-granary` | road | mid, late | road | — | — |
| `lu-zhi-in-chains` | novel ch. 1 | mid | road | prison-cart | — |
| `dong-zhuo-rescue` | novel ch. 1 | mid | road | dong-zhuo-rescue | — |
| `dong-zhuo-snub` | novel ch. 1 | after winning dong-zhuo-rescue | aftermath | — | — |
| `plague-camp` | road | mid | camp | — | yes |
| `rest-or-push` | road | mid, late | camp | — | — |
| `inspector` | novel ch. 2 (moved before Guangzong) | mid | town, market | — | — |
| `zhu-jun-camp` | novel ch. 1-2 | late | camp, market | — | yes |
| `zhang-bao-sorcery` | novel ch. 2 | late | road | — | yes |
| `guangzong-eve` | novel ch. 1 | late | camp | — | yes |

#### `zhuo-notice` — The Notice at Zhuo
*Source:* novel ch. 1. *Tags:* town, market.

A Han notice on the Zhuo county wall calls for men to fight the Yellow Turbans. Liu Bei, a straw-sandal seller of imperial blood, sighs in front of it; a black-whiskered butcher scolds him for sighing instead of acting. In the wine shop a towering red-faced stranger joins them. Under the peach blossom behind Zhang Fei's farm the three swore to be brothers. Now the oath needs men and grain.

| Choice | Exact effects | Tension |
|---|---|---|
| `estate` Zhang Fei sells his farm and his butcher's stall | rice +10, soldiers +600 | The biggest early army, but every man eats from day one. |
| `feast` Open the peach garden to the county and read the oath aloud | rice −8, 1 day, Renown +15 | Spend scarce rice for a name that pays at every town. |
| `levy` Take the county's grain levy and press its idle young men | rice +30, soldiers +300, Renown −10 | A full cart and a bigger band now, and a poorer name everywhere after. |

#### `horse-merchants` — The Horse Dealers of Zhongshan
*Source:* novel ch. 1. *Tags:* road.

Two horse dealers from Zhongshan, Zhang Shiping and Su Shuang, are stuck in Zhuo with their herd: the rebels hold the roads north. They have heard about the oath, and they come to the camp to look the brothers over.

| Choice | Exact effects | Tension |
|---|---|---|
| `gift` Accept their horses, steel and silver, and forge the brothers' weapons | rice +15, 1 day, stated: `forged-weapons` | A day at the forge and a smaller rice gift, for brothers who hit harder all run long. |
| `escort` Escort the herd through the rebel country | 2 days, **gamble 70%**: rice +45, Renown +5 / 30%: rice +15, lose 300 (half killed, half wounded) | Two days and a stated risk for the biggest rice haul of the early road. |
| `commandeer` Take the herd for the war and sell it to the Youzhou quartermaster | rice +30, Renown −15 | Rice without days, paid for in name. |

#### `daxing-hill` — Daxing Hill
*Always a battle* (owner 2026-11-01): the novel's first fight and the tutorial; both choices fight it.
*Source:* novel ch. 1. *Tags:* town, market.

Cheng Yuanzhi's turbaned host is marching on Zhuo. The Youzhou magistrate Zou Jing has few trained men, and he gladly takes the brothers' band into his column. The rebels have camped in the millet below Daxing Hill. The wind is from the west.

| Choice | Exact effects | Tension |
|---|---|---|
| `fight` March with Zou Jing to Daxing Hill | **battle `daxing-hill`**; win: rice +30, Renown +8, **Jian Yong joins** | The first real fight costs men and a battle's rice, and it brings Jian Yong and a name. |
| `raid` Burn the rebel supply carts and the farms they camp in the night before, then fight | 1 day, Renown −5, **gamble 65%**: rice +30, the battle's enemy troops ×0.75 / 35%: lose 250 (half killed, half wounded), **battle `daxing-hill`**; win: rice +20, Renown +8, **Jian Yong joins** | A day, a stated risk and a stain, for more rice and a weaker enemy; you fight either way. |

#### `qingzhou-relief` — Qingzhou Besieged
*Source:* novel ch. 1. *Tags:* town, market.

A rider from Governor Gong Jing: Qingzhou's walls are ringed with rebels and its granary is down to husks. Zou Jing will lend his archers if Liu Bei leads. The rebels outnumber you; the only way in is to make them chase you.

| Choice | Exact effects | Tension |
|---|---|---|
| `relieve` Relieve Qingzhou: feign a retreat and spring the brothers from the ridges | **battle `qingzhou`**; win: rice +30, Renown +10 | The hardest early battle for the biggest early reward. |
| `smuggle` Run rice through the siege lines by night | rice −12, 1 day, no volunteers, **gamble 80%**: Renown +10, *echo* `qingzhou-holds` / 20%: lose 150 (half killed, half wounded) | No battle, rice spent on an ally you may see again, at stated odds. |
| `march-on` Leave Qingzhou to its walls and march south | Renown −10, no volunteers, *echo* `qingzhou-fell` | Free now; what happens to Qingzhou is not shown. |

#### `village-under-siege` — A Village Under Siege
*Source:* road. *Tags:* village.

Smoke over a millet village: a rebel band has fired the threshing floor, and the elders have barred the gate with carts. Women are on the walls with hoes. They have seen your banner.

| Choice | Exact effects | Tension |
|---|---|---|
| `break` Break the siege | **battle `village-siege`**; win: rice +20, Renown +10 | A small battle's losses and rice, for name, rice and men. |
| `zhang-fei` Send Zhang Fei with a hundred men | Renown +5, volunteers ×0.5, **gamble 50%**: no loss / 50%: lose 100 (all killed), Zhang Fei hurt (cap halved until a rest) | Cheap, but a hurt Zhang Fei leads half his men until you rest. |
| `pass` March past | Renown −10, no volunteers, *echo* `village-fell` | Costs nothing today but the name; what the raiders do next is not shown. |

#### `refugee-column` — The Refugee Column
*Source:* road. *Tags:* road.

A column of families from the burned counties, carts and grandmothers and goats, begs to march under the Han banner. They have eaten their seed grain. The road south is long.

| Choice | Exact effects | Tension |
|---|---|---|
| `take-in` Take them in | rice −10, soldiers +200, the next 2 legs +1 day each, Renown +12, *echo* `refugees-guided` | Slower and hungrier, for men and a name. |
| `feed` Give them rice and send them on | rice −15, Renown +8 | Name for rice, no delay. |
| `press` Take the young men and send the rest on | soldiers +300, Renown −12 | Men now, name lost. |

#### `yellow-deserters` — The Deserters
*Source:* road. *Tags:* road.

Six hundred Yellow Turbans throw down their spears at your pickets. Their scarves are filthy and their bellies are empty. Zou Jing's standing order is no quarter. One of them, a young officer named Liao Hua, asks to speak to Liu Bei.

| Choice | Exact effects | Tension |
|---|---|---|
| `enlist` Spare them and enlist them | soldiers +400, Renown +5, *echo* `turncoats`, Renown 55+: **Liao Hua joins** | More mouths, and rebels in the ranks; a good name brings an officer. |
| `release` Disarm them and send them home with a sack each | rice −6, Renown +10 | Name for rice, no men. |
| `execute` Carry out the order and take their sacks | rice +15, Renown −15, *echo* `no-quarter` | Rice and safety now. |

#### `hungry-county` — The Empty County
*Source:* road. *Tags:* town, market.

The magistrate of a small county fled at the first rumour of rebels. His granary is sealed, his fields are ripe and nobody is cutting them. The farmers watch your column from their doorways.

| Choice | Exact effects | Tension |
|---|---|---|
| `seize` Break the granary seal and press the young men | rice +35, soldiers +300, Renown −15, no volunteers | The ruthless road in one choice. |
| `harvest` Bring in the harvest with them for a fair share | rice +25 (a trade: ×1.25 at Renown 50+, ×0.5 under 20), 2 days, Renown +5 | Two days of work for rice, a name and willing men. |

#### `flooded-ford` — The Flooded Ford
*Source:* road. *Tags:* road.

The autumn rains have filled the river to its banks. The ferryman's rope is gone, and the far bank is a smudge in the drizzle.

| Choice | Exact effects | Tension |
|---|---|---|
| `wait` Wait for the water to fall | 2 days | Safe; two days of rice and two days nearer the finished palisade. |
| `cross` Cross now | **gamble 60%**: no loss / 40%: rice −20, lose 400 (all killed) | Stated odds against time. |
| `rafts` Pull the doors off the nearest village for rafts | 1 day, Renown −5 | Half the delay, a little name. |

#### `bandit-offer` — Zhou Cang's Pass
*Source:* novel ch. 28 (moved earlier: alt-history). *Tags:* road.

A band of hill bandits, once Yellow Turbans, blocks the pass road under two chiefs: Pei Yuanshao, and a dark giant named Zhou Cang who says he has heard of Guan Yu. Zhou Cang would kneel to a lord worth following. Both of them would take a toll from one who isn't.

| Choice | Exact effects | Tension |
|---|---|---|
| `accept` Ask Zhou Cang to join you (Renown 40+) | Renown 40+: soldiers +400, Renown −3, **Zhou Cang joins**; otherwise rice −18 | Men and an officer who eat; only a lord of name can ask, otherwise he names a toll. |
| `clear` Clear the pass by force | **battle `village-siege`**, variant `bandit-pass`; win: rice +25, Renown +5 | A fight for their hoard and a free road. |
| `toll` Pay the toll | rice −12 | The cheap peace: rice for a whole skin and an open road. |

#### `huangfu-song-fires` — The Fires at Changshe
*Source:* novel ch. 1. *Tags:* road.

At Changshe the rebels camped in tall grass, and Huangfu Song set it alight on a night wind. The plain is a sea of fire. Rebels run in every direction. A red-bannered troop of horse under a young officer named Cao Cao is cutting them down.

| Choice | Exact effects | Tension |
|---|---|---|
| `pursue` Ride with Cao Cao and take the baggage | **gamble 70%**: rice +30, Renown +3 / 30%: lose 300 (half killed, half wounded) | Rice at stated odds. |
| `firebreak` Cut firebreaks round the villages in the fire's path | rice +10 at Renown 50+, soldiers +150, 1 day, Renown +10 | A day and no loot, for name and men. |
| `glean` Gather the grain the rebels dropped | rice +20, 1 day | Rice for a day. |

#### `captured-granary` — The Rebel Granary
*Source:* road. *Tags:* road.

A walled rebel granary, its guards fled, the wagons still yoked. Starving farmers watch from the ditch. It is a long haul to Guangzong with full wagons.

| Choice | Exact effects | Tension |
|---|---|---|
| `take` Load the wagons | rice +40, 3 days | The biggest rice haul, three days slower. |
| `burn` Burn it so Guangzong never eats it | stated: `granary-burned` | Nothing now, a weaker finale. |
| `give` Open it to the starving | Renown +15, volunteers come (RL-REN-3) though this is not a town | Name and men, no rice. |

#### `lu-zhi-in-chains` — Lu Zhi in Chains
*Source:* novel ch. 1. *Tags:* road.

A prison cart on the Guangzong road. Inside sits Lu Zhi, Liu Bei's old teacher: he would not bribe the court's envoy, so the envoy reported him for cowardice. Zhang Fei already has his spear in his hand.

| Choice | Exact effects | Tension |
|---|---|---|
| `free` Free him from the escort | **battle `prison-cart`**; win: Renown +12, stated: `lu-zhi-freed`, stated: `outlaw` | Honour and a finale ally, but the court calls you outlaws. |
| `bribe` Pay the escort to treat him gently | rice −10, Renown +5, *echo* `lu-zhi-letter` | Rice for a quiet favour. |
| `let-pass` Let the law take its course | Renown −6, *echo* `zhang-fei-sulks` | No battle and no rice; the men see you do nothing, and Zhang Fei will remember. |

#### `dong-zhuo-rescue` — Dong Zhuo's Rout
*Source:* novel ch. 1. *Tags:* road.

Dust on the plain: an imperial army in full rout, with Zhang Jiao's host on its heels. The general in the middle of the flight is Dong Zhuo of Hedong, and he is losing.

| Choice | Exact effects | Tension |
|---|---|---|
| `charge` Charge into the rebels' flank | **battle `dong-zhuo-rescue`**; win: soldiers +200, Renown +10; then the aftermath stop `dong-zhuo-snub` | A real battle for a man who will not thank you, though some of his stragglers will. |
| `loot` Shadow the rout and take what it drops | rice +15, Renown −8, *echo* `rout-unchecked` | Rice now, a stain on the name, and the rebels who won here go on to Guangzong. |

#### `dong-zhuo-snub` — Dong Zhuo's Snub
*Source:* novel ch. 1. *Tags:* aftermath.

Back in his camp, Dong Zhuo asks what rank the brothers hold. Hearing 'none', he turns back to his wine without a word of thanks. Zhang Fei's hand goes to his sword hilt.

| Choice | Exact effects | Tension |
|---|---|---|
| `restrain` Hold Zhang Fei back and take your leave | Renown +5, Zhang Fei −1 Qi in the next battle | Name, and a brooding brother. |
| `storm-out` Let Zhang Fei say his piece, and take the spare rice as thanks | rice +15, Renown −3, Zhang Fei +1 Qi in the next battle, *echo* `dong-zhuo-grudge` | Rice and a fierce brother, and the story travels. |

#### `plague-camp` — Fever in the Camp
*Source:* road. *Tags:* camp.

A fever comes off the marshes and runs through the ranks. At the camp's edge, hedge priests of the Way of Great Peace sell charm water by the cup.

| Choice | Exact effects | Tension |
|---|---|---|
| `quarantine` Quarantine the sick and wait it out | lose 3% of the healthy soldiers (all killed), 1 day | A day for a light toll. |
| `march-through` March through it | lose 12% of the healthy soldiers (half killed, half wounded), tired (RL-MARCH-2) | No days, many men, and a tired army. |
| `charm-water` Buy the charm water | Renown −5, **gamble 50%**: no loss / 50%: lose 12% of the healthy soldiers (half killed, half wounded) | Stated odds and a stain on the name. |

#### `rest-or-push` — Rest or Push On
*Source:* road. *Tags:* camp.

The men's sandals are worn through after the hill roads. There is a dry riverbed for a camp and a farmer's orchard beside it. Guangzong will not wait.

| Choice | Exact effects | Tension |
|---|---|---|
| `rest` Rest two days | all wounded return, hurt officers recover, tiredness clears (RL-REST-1), 2 days, every officer +1 Qi in the next battle | Two days of rice and two days at Guangzong, for whole men and fresh spirit. |
| `push` Forced march | lose 12% of the healthy soldiers (half killed, half wounded), next leg −2 days, tired (RL-MARCH-2) | Spare rice and days, lose men. |
| `forage` Rest a day and strip the orchard | rice +10 (a trade: ×1.25 at Renown 50+, ×0.5 under 20), half the wounded return, 1 day, Renown −3 | A little of each. |

#### `inspector` — The Inspector
*Source:* novel ch. 2 (moved before Guangzong). *Tags:* town, market.

For their service the brothers are given a small county, Anxi. The court's inspector arrives, sneers at Liu Bei for bringing no gift, and threatens to report him. Zhang Fei finds the inspector drunk at the post-house and ties him to the hitching post.

| Choice | Exact effects | Tension |
|---|---|---|
| `flog` Let Zhang Fei flog him, hang your seal of office on his neck and go | Renown +12, Zhang Fei +1 Qi in the next battle, stated: `outlaw` | Name, a fierce Zhang Fei and the county's young men, but no county grain and no court favour. |
| `pay` Cut him down and pay him from the county granary | rice +22, Renown −5, Zhang Fei −1 Qi in the next battle | Rice and a post, at the cost of Zhang Fei's spirit and the name. |

#### `zhu-jun-camp` — Zhu Jun's Camp
*Source:* novel ch. 1-2. *Tags:* camp, market.

General Zhu Jun's imperial camp is a city of tents. He offers the band a place in his line against the last rebel strongholds, and a share of the commissary. Wancheng's rebels still hold out to the south.

| Choice | Exact effects | Tension |
|---|---|---|
| `serve` Serve in Zhu Jun's line | 2 days, if `outlaw`: nothing; otherwise rice +40, stated: `zhu-jun-line`, if `dong-zhuo-grudge` and not `outlaw`: rice −20 | Two days of parades for rice and a finale ally; outlaws get nothing. |
| `storm-wancheng` Lead the storming party at Wancheng | 1 day, **gamble 65%**: rice +25, soldiers +300, Renown +12 / 35%: lose 400 (half killed, half wounded) | The stated-odds glory road. |
| `horses` Trade your spare horses for rice | rice +25 (a trade: ×1.25 at Renown 50+, ×0.5 under 20), Guan Yu command cap −300 | Rice without days, and Guan Yu leads fewer riders. |

#### `zhang-bao-sorcery` — Zhang Bao's Sorcery
*Source:* novel ch. 2. *Tags:* road.

Captives from Zhang Bao's camp tell of black wind and paper soldiers falling from the sky. Liu Bei remembers an old counter-charm: the blood of pigs, goats and dogs poured on the heights.

| Choice | Exact effects | Tension |
|---|---|---|
| `blood` Buy the beasts and carry the blood ward | rice −6, 1 day, stated: `blood-ward` | A day and rice to blunt the finale's sorcery. |
| `night-raid` Raid the altar hill tonight | **gamble 55%**: Renown +5, stated: `zhang-bao-wounded` / 45%: lose 500 (half killed, half wounded) | Stated odds on a weaker sorcerer. |
| `ignore` Leave the sorcerer to the generals | nothing | No days, no rice, no risk; the sorcerer keeps his full strength. |

#### `guangzong-eve` — The Eve of Guangzong
*Source:* novel ch. 1. *Tags:* camp.

Guangzong's palisade rises on the far bank of the river; you can hear the mallets in the dark. Huangfu Song's column is two days behind you.

| Choice | Exact effects | Tension |
|---|---|---|
| `wait-column` Wait for Huangfu Song (not open to outlaws) | 2 days, if `outlaw`: nothing; otherwise stated: `huangfu-column` | Two days of stockade-building for an ally; outlaws wait for nothing. |
| `night-raid` Send raiders to fire the stockade | **gamble 60%**: stated: `stockade-burned` / 40%: lose 500 (half killed, half wounded) | Stated odds on a weaker palisade. |
| `advance` Cross at dawn | nothing | No days lost, nothing gained. |

## 4. Battles
**Reused:** `daxing-hill` (tier 1), `qingzhou` (tier 2), `guangzong` (the finale, §6). Each gets an `rl-*` variant in RL2 (`createBattle(id, seed, {variant, modifiers, roster})`, spec 15 §7): the player's units take their troops from the deploy sliders, and enemy troops are scaled by the tier (`tierScale` in the data: 0.85 at tier 1, 1.0 at tier 2, 1.05–1.2 in the mid tiers). The battles' maps, objectives, scripts and AI hints stay as they are.

**New minor battles (3).** Each has a short brief here; its full spec (`docs/spec/battles/rl-<id>.md`, the same shape as `11-battle-daxing-hill.md`) and data are written in RL1/RL2, and all its invented officers are flagged `invented: true`.

| Battle | Used by | Map idea and size | Sides and size | Objective | Signature mechanic |
|---|---|---|---|---|---|
| **`village-siege`**, variant `village` | `village-under-siege/break` | 12×10. A millet village in the centre-east: six village tiles behind a cart barricade (wall tiles with a two-tile gap on the west), a ring of farm round it, a stream along the south edge. The band enters from the south-west. | Player: 3 deploy slots + guest "Village militia" (infantry 600) on the village tiles. Rebels (side `yellow`): a Raider Chief* (commander) and 4 units, about 1,800 soldier-equivalents at tier 3. | Win: rout the Raider Chief. Lose: Liu Bei routed, the militia routed (`unitLost`), or round 10. | **The threshing floor is already burning**: two farm tiles inside the ring burn from round 1 under a breeze toward the houses (a timeline ignite). The fire eats the ring and whoever stands in it; the rebels assault the barricade gap. Break in fast or the militia dies in the smoke. |
| **`village-siege`**, variant `bandit-pass` | `bandit-offer/clear` | The same 12×10 footprint re-dressed: hill and forest on both sides of a road, a bandit stockade (rampart, two-tile gap) across it in the east. | Player: 3 slots. Bandits (side `yellow`): Pei Yuanshao (commander; novel ch. 28, met early: alt-history), Zhou Cang (`retreatAt 0.5`, loyalty 45, swayable), 3 invented bandit units. | Win: rout Pei Yuanshao. Lose: Liu Bei routed, round 10. | **Win the man, not the pass**: Zhou Cang can be swayed. A swayed Zhou Cang joins the band after the battle (`recruitable`, the campaign's recruit rule) whatever the Renown, which is the fighting way to get him. |
| **`prison-cart`** | `lu-zhi-in-chains/free` | 14×8. A long east–west road through a wooded valley, low ridges on the north and south edges, a county gate (the exit) at the east edge. | Player: 3 slots, starting on the west road and the north ridge. Escort (new side `court`, colour token `--court` #5d5a52, iron grey): Escort Captain Huo* (commander, carries the cart) and 4 units (2 halberd, 2 crossbow), about 2,000 soldier-equivalents. Their loyalty is low (paid men, 35–45). | Win: rout Captain Huo. Lose: Liu Bei routed, or round 7 (the cart is through the county gate). | **A target that runs**: Captain Huo's AI hint is `advance-to:13,4`; he walks the cart east every round while the halberds hold the road behind him. A short clock, a fast cavalry chase (Guan Yu) and a sway-heavy enemy. Freeing Lu Zhi makes the band outlaws (the stop says so). |
| **`dong-zhuo-rescue`** | `dong-zhuo-rescue/charge` | 16×10. Open plain with a low ridge along the north edge and a dry riverbed across the middle; the west edge is the way out. | Player: 4 slots, starting on the north ridge (the flank charge). Guest Dong Zhuo (cavalry 1,600, **moved by the AI**, behaviour `flee:west`, escapes at the west edge). Rebels (side `yellow`): a Taiping Marshal* (commander, `pursue:dong-zhuo`) and 5–6 units, about 2,300 soldier-equivalents at tier 3. | Win: rout the Marshal, or reach the end of round 8 with Dong Zhuo alive or escaped. Lose: Liu Bei routed, Dong Zhuo routed. | **Save a man who won't take orders**: Dong Zhuo runs for the west edge on his own and the rebel host chases him across the band's front. The player chooses between screening him and striking the Marshal while the rebels' flank is open. |

Engine work these need (RL2, each an engine rule with an `R2-`/`RL-` id): an AI-moved guest (`guestControl: 'ai'`) for Dong Zhuo; an `advance-to:x,y` behaviour hint; a third side id `court` (sides are already data). Everything else (protect, escape, retreat, sway-to-recruit, timeline ignite) exists.

## 5. Echoes and flags (RL-ECHO-1, RL-ECHO-2)
Flags are set by choices and read later by stops (as conditions) or by the finale (as modifiers). A **hidden echo** is never shown when it is set; when it pays off, its cause is named in full ("Because you marched past the burning village: ..."). A **stated** flag is printed on the choice slip with what it will do. The "model effect" column is what the paper sim uses: E is a share of the finale's enemy strength and G is guest strength in the sim's soldier units (§1 of the sim report), not troop counts. The real modifiers are in §6.

| Flag | Shown? | Set by | Pays off at | Model effect (sim) | What the player is told when it pays off |
|---|---|---|---|---|---|
| `qingzhou-holds` | hidden echo | qingzhou-relief/smuggle (win) | finale | finale guests +500 | Because your rice reached Qingzhou: Governor Gong Jing sends a company of his garrison to Guangzong. |
| `qingzhou-fell` | hidden echo | qingzhou-relief/march-on | finale | finale enemy +5% | Because Qingzhou fell: its besiegers have joined Zhang Liang (+1 rebel unit). |
| `village-fell` | hidden echo | village-under-siege/pass | finale | finale enemy +4% | Because you marched past the burning village: its raiders wait at Guangzong (+1 rebel unit). |
| `refugees-guided` | hidden echo | refugee-column/take-in | finale | finale enemy −4% | Because you sheltered the refugees: their men know the north ford, and one of your units may start on the far bank. |
| `turncoats` | hidden echo | yellow-deserters/enlist | finale | finale enemy −3% | Because you spared the deserters: Captain Zhou of the sortie is their cousin (loyalty -20). |
| `no-quarter` | hidden echo | yellow-deserters/execute | finale | finale enemy +3% | Because you executed the deserters: the rebels expect no mercy (no rebel can be swayed; their captains' loyalty becomes null). |
| `granary-burned` | stated on the choice | captured-granary/burn | finale | finale enemy −15% | Because you burned the granary: Zhang Liang fields 2 fewer units. |
| `lu-zhi-freed` | stated on the choice | lu-zhi-in-chains/free (win) | finale | finale guests +600 | Because you freed Lu Zhi: his old officers lead a company of his veterans beside you. |
| `outlaw` | stated on the choice | lu-zhi-in-chains/free (win), inspector/flog | zhu-jun-camp, guangzong-eve | gates choices (see stops) | The court calls you outlaws: imperial camps give you no rice and Huangfu Song will not wait for you. |
| `lu-zhi-letter` | hidden echo | lu-zhi-in-chains/bribe | finale | finale guests +250 | Because you eased Lu Zhi's road: his letter reached the imperial camp; the imperial guests begin with +2 Qi. |
| `zhang-fei-sulks` | hidden echo | lu-zhi-in-chains/let-pass | next battle | next battle strength -4% | Zhang Fei has not forgiven you for Lu Zhi's cart: he ignores your first order (he starts the battle confused). |
| `rout-unchecked` | hidden echo | dong-zhuo-rescue/loot | finale | finale enemy +4% | Because Dong Zhuo's rout went unchecked: the rebels who chased him have joined Zhang Liang (+1 rebel unit). |
| `dong-zhuo-grudge` | hidden echo | dong-zhuo-snub/storm-out | zhu-jun-camp | gates choices (see stops) | Word of the shouting in Dong Zhuo's tent has reached Zhu Jun: his commissary gives you half. |
| `blood-ward` | stated on the choice | zhang-bao-sorcery/blood | finale | finale enemy −15% | Because you carried the blood ward: Zhang Bao's Call the Storm costs 8 Qi and lasts 1 round. |
| `zhang-bao-wounded` | stated on the choice | zhang-bao-sorcery/night-raid (win) | finale | finale enemy −6% | Because your night raid struck the altar: Zhang Bao starts with 60% of his troops. |
| `zhu-jun-line` | stated on the choice | zhu-jun-camp/serve | finale | finale guests +600 | Because you served in Zhu Jun's line: one of his companies fights beside you. |
| `huangfu-column` | stated on the choice | guangzong-eve/wait-column | finale | finale guests +1200 | Because you waited for Huangfu Song: two of his companies form your left wing. |
| `stockade-burned` | stated on the choice | guangzong-eve/night-raid (win) | finale | finale counts -4 days | Because your raiders fired the stockade: the palisade is as it would be four days earlier. |
| `forged-weapons` | stated on the choice | horse-merchants/gift | every battle | gates choices (see stops) | The brothers carry their forged weapons: Liu Bei, Guan Yu and Zhang Fei have War +4 for the run. |

## 6. The finale: Guangzong (RL-CAL-1, RL-REN-7)
The finale is `guangzong` (`03-guangzong.md`) with the roguelike variant `rl-finale`: **deploy slots 5** (the base battle has 4; the fifth start is (1,7)), everything else as built, then the modifiers below applied in this order: day bracket, echoes, Renown, spirit. The briefing (wireframe d) lists every line with its cause before deploy.

**Finale forecast (`RL-HUNGER-2`, owner 2026-11-01):** the road HUD shows "Guangzong will need about N bags" at all times, so arriving hungry is a choice, not a surprise.

### Day of arrival
The bracket uses the arrival day, minus 4 if `stockade-burned` is set.

| Arrival day | Bracket | What it changes in `guangzong.json` (as RL2 modifiers) | Sim E |
|---|---|---|---|
| 12 or earlier | very early | Map patch: the rampart at x=11 is plain except (11,3), (11,4), (11,7), (11,8) ("a line of stakes"). Remove `gz-bowman-a` and `gz-bowman-b`. Zhang Liang's troops ×0.85 (his levies are still in the villages). | ×0.75 |
| 13–16 | early | Map patch: rampart tiles (11,0)–(11,2) and (11,9)–(11,11) are plain ("half built"). Remove `gz-bowman-a` (the north archers are not posted). | ×0.90 |
| 17–20 | on time | The battle as built. | ×1.00 |
| 21–24 | late | Add a rebel wave in round 4 from the east edge: `gz-levy-a` (infantry 1,800) at (14,3) and `gz-levy-b` (infantry 1,800) at (14,8), both `advance`. | ×1.10 |
| 25–28 | very late | As late, plus a second wave in round 7: `gz-levy-c` (infantry 1,800) at (14,5) and `gz-levy-d` (archers 1,500) at (14,6). Zhang Bao starts with Qi 6 (he can call the storm in round 1). | ×1.20 |
| 29 or later | too late | As very late, plus "Zhang Jiao's last rite": every rebel Ruse's confuse chance +20 (a stratagem modifier) and a timeline message at round 1. | ×1.30 |

### Echoes at the finale
| Flag | Briefing line | Modifier |
|---|---|---|
| `qingzhou-fell` | Because Qingzhou fell: its besiegers have joined Zhang Liang. | add `gz-qingzhou-band` (infantry 2,000, `advance`) at (12,2) |
| `village-fell` | Because you marched past the burning village: its raiders wait at Guangzong. | add `gz-village-raiders` (cavalry 1,500, `advance`) at (12,9) |
| `rout-unchecked` | Because Dong Zhuo's rout went unchecked: the rebels who chased him have joined Zhang Liang. | add `gz-pursuers` (infantry 2,000, `advance`) at (9,10) |
| `no-quarter` | Because you executed the deserters: the rebels expect no mercy. | every rebel officer's loyalty becomes null (no sway) and rebel troops ×1.05 |
| `turncoats` | Because you spared the deserters: Captain Zhou of the sortie is their cousin. | `gz-vanguard-a` loyalty 42 → 22 |
| `granary-burned` | Because you burned the granary: Zhang Liang fields 2 fewer units. | remove `gz-vanguard-b` and `gz-horse` (two sortie units, so it never overlaps the day bracket's palisade archers) |
| `blood-ward` | Because you carried the blood ward: Zhang Bao's storm is weak. | `call-the-storm` cost 6 → 8 and rounds 2 → 1 |
| `zhang-bao-wounded` | Because your night raid struck the altar: Zhang Bao is hurt. | Zhang Bao's troops ×0.6 |
| `refugees-guided` | Because you sheltered the refugees: their men know the north ford. | one deploy slot may start at (8,3), on the far bank |
| `lu-zhi-freed` | Because you freed Lu Zhi: his veterans fight beside you. | add guest `rl-lu-zhi-veterans` (infantry 1,800) at (1,4) |
| `lu-zhi-letter` | Because you eased Lu Zhi's road: his letter reached the imperial camp. | the imperial guests start with +2 Qi |
| `zhu-jun-line` | Because you served in Zhu Jun's line: one of his companies fights beside you. | add guest `rl-zhu-jun-company` (infantry 1,800) at (1,8) |
| `huangfu-column` | Because you waited for Huangfu Song: two of his companies form your left wing. | add guests `rl-huangfu-horse` (cavalry 1,500) at (0,4) and `rl-huangfu-bows` (archers 1,500) at (0,8) |
| `qingzhou-holds` | Because your rice reached Qingzhou: Gong Jing sends a company of his garrison. | add guest `rl-qingzhou-garrison` (infantry 1,200) at (1,2) |
| `stockade-burned` | Because your raiders fired the stockade: the palisade is as it would be four days earlier. | the day bracket uses day − 4 |

### Renown at the finale
| Renown | Briefing line | Modifier |
|---|---|---|
| 60+ | The villages round Guangzong send a militia company. | add guest `rl-julu-militia` (infantry 1,000) at (1,10) |
| 80+ | Two rebel captains have heard of you and waver. | `gz-vanguard-a` and `gz-vanguard-b` loyalty −20 (stacks with `turncoats`) |
| under 20 | The imperial generals keep one company back from a lord with such a name. | remove the guest `gz-imperial-bows` |
| any | Liu Bei's sway chance + (Renown − 30) ÷ 10, rounded down (RL-REN-6) | engine modifier `swayBonus` on Liu Bei |
| any | Battle spirit (RL-REN-4): every officer +2 Qi at 70+, +1 at 40+, −1 under 20 | engine modifier `startQi` |

Hunger, tiredness, rest and per-officer Qi echoes (Zhang Fei broods, sulks or burns) are applied as `startQi` too, and the briefing lists each. Guests never draw on the pool or the rice.

**Briefing example** (seed 6, the benevolent run in the sim report): "You arrived on day 21: the palisade is complete and Zhang Liang's levies march in on round 4. / Because you eased Lu Zhi's road: his letter reached the imperial camp; the imperial guests begin with +2 Qi. / Renown 70 (60+): the villages round Guangzong send a militia company to your line. / Renown 70: every officer starts with +2 Qi. / Hungry: after this battle the rice lasts 1 day, so every officer starts with 0 Qi instead."

## 7. Deploy (RL-DEPLOY-1 to 4)
- **Who:** Liu Bei is always deployed. The player fills the battle's other slots (3–5, per battle) from the band. A fallen officer is gone; a hurt one can deploy at half cap.
- **Sliders:** each deployed officer has a soldier slider from 250 to his command cap in steps of 50, drawing on the **healthy** soldiers only. Wounded soldiers cannot be fielded. The slider can never take more than the pool holds.
- **Rice:** the battle costs ⌈fielded ÷ 250⌉ bags, paid when the seal is stamped, plus the battle day's upkeep. The deploy screen shows, live: soldiers fielded, the battle's rice cost, the rice left, **"after this battle rice lasts N days"** (at the current pool), and a red "Hungry" chip if that is under 3 days (RL-HUNGER-1: every officer then starts at 0 Qi). A deployment that would leave 0 rice is refused, with the reason on the seal.
- **Qi line:** every start-Qi modifier is listed on the deploy screen with its cause (Renown, rest, hunger, tired, echoes).
- **After the battle** (RL-LOSS-1): for each deployed unit, lost = fielded − troops left (a routed unit lost all of them). Half the lost (rounded to 10) are killed and the rest join the **wounded**. Survivors go back to the healthy pool. Guests' losses never touch the pool.
- **Officers** (RL-FALL-1): a non-commander routed in a won battle is marked **wounded** for the rest of the run and is hurt (cap halved) until a full rest; a second rout and he **falls**. With Iron Oath, the first rout is a fall. Liu Bei routed loses the battle, and a lost battle ends the run (RL-END-1, RL-END-2).
- **Experience:** XP and levels from the battle log as in the campaign (RL-XP-1); a level adds 100 to the command cap.

## 8. Still open (for RL1)
- The new officers' portraits, figures and stratagem lists (Zhou Cang, Liao Hua, Pei Yuanshao and the invented captains) follow the existing pipeline.
- Scene prose for the peach garden prologue and each stop's two-line scene is drafted above; RL1 turns each into 3–6 speech slips in `src/data/stops/<id>.json`.
- The battle variants' enemy troop scaling (`tierScale`) is a sim value; RL2 tunes it per battle with the real AI (the RL4 run bench).
