# 31 — Hero figures (v0.1, 2026-11-01)

The owner asked for unique models of the major generals (2026-11-01). Until the art milestone (M5, Gemini concepts → Hunyuan GLBs on the owner's PC), heroes are **procedural rigs built in three.js**. They follow the MGSD standard (KB `local-ai-studios.md`): about 2–2.5 heads tall, the head about 40% of the height and as wide as the shoulders, a tiny torso, stubby legs with chunky feet, and oversized hands and weapons. Each stands on a plain round black base. The rig contract (`src/client/figures/rig.ts`) is what the board and the battle cut-ins animate, so a GLB can replace a procedural body later without touching either.

**IP:** every design below comes from the public-domain novel and traditional opera and temple iconography (Guan Yu's red face and long beard, Zhang Fei's serpent spear, Lu Bu's pheasant feathers). We draw our own versions. They must not resemble any video-game character design or the SD Three Kingdoms toy line: no mecha parts, V-fins or visors, and no text on the figures.

**Silhouette test:** at board scale (about 60 px tall), each hero must be identifiable from its silhouette and two colours alone. The checklist is a contact sheet of all heroes side by side, front and three-quarter views.

## Identity table (one visual clause per hero; the builder follows it literally)
| id | Look | Colours | Signature | Mount |
|---|---|---|---|---|
| liu-bei | kind round face with a small moustache; **very large earlobes** and **long arms with big hands** (both from the novel); hair in a topknot with a small gold crown pin | jade green robe over light lamellar, cream sleeves, gold trim | **twin swords**, one in each hand, short and broad | — (infantry) |
| guan-yu | **deep red face**, narrow phoenix eyes, **long black beard reaching the belt**, which sways when he moves | green headscarf and long green robe over dark armour, gold belt | **crescent glaive**: a long pole, a wide crescent blade and a dragon-head socket; the tallest weapon in the game | chestnut horse with a dark mane |
| zhang-fei | dark ruddy face, **round staring eyes**, **bristling black whiskers** fanning out like a tiger's, open shouting mouth | black and deep blue armour, iron studs | **serpent spear**: a long pole with a wavy, snake-like blade | — (infantry) |
| zhao-yun | young clean-shaven face, calm | **white and silver** armour, white cape, blue sash | long straight spear with a red tassel | **white horse** |
| zhuge-liang | serene face with a thin beard; **tall black scholar's hat** | white crane robe with black trim | **crane-feather fan** held up | — (archers) |
| lu-bu | fierce face; **two very long pheasant feathers** arching back from a gold headpiece (the tallest silhouette) | red and gold armour, black under-robe | **twin-crescent halberd**: crescent blades on both sides of the spear tip | **red horse** with a flame-coloured mane |
| cao-cao | sharp face, goatee, narrowed eyes | black and deep purple armour, gold edges, black cloak with red lining | straight sword held low; commander's helmet with a small crest | black horse |

Supporting heroes reuse a **named-officer kit**: a generic MGSD body with a per-officer palette, headgear and weapon from data. They get unique designs later. This covers Jian Yong, Zou Jing, Mi Zhu, Sun Qian, Guan Ping, Xiahou Dun (eyepatch), Xiahou Yuan, Zhang Liao, Cheng Yuanzhi, Deng Mao, Zhang Bao (Taoist robe and talisman sword), Zhou Yu, Huang Gai, Gan Ning (bells on his belt) and the rest.

## Troops (for battle cut-ins and later the board)
Four troops per kit, sharing one body with per-side colours:
- **infantry**: spear and round shield;
- **archer**: bow and quiver;
- **cavalry**: a rider on a stubby MGSD horse;
- **rebel**: Yellow Turban: a yellow headscarf, a ragged tunic and a spear or farm fork.

Side palettes come from the theme tokens (`--han` jade, `--yellow` ochre, `--cao` slate, `--dong` red-black, `--lu` purple).

## Animation joints (contract)
`root, hips, torso, head, armL, armR, handL, handR, legL, legR, weapon` (parented to `handR`), `offhand` (parented to `handL`), optional `cape` and `beard` (secondary sway), and on mounts `horse.{body, neck, head, legFL, legFR, legBL, legBR, tail}`. Rest pose: standing, weapon ready. Each joint rotates about its own pivot. Clips are code (keyframes over named joints), not baked files.
