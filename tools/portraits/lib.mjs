// Pure parts of the Hugging Face portrait generator (docs/spec/50-presentation.md "Portraits"): the subject list, the identity table, the
// one STYLE constant, the prompt lint, and the plan. No network, no files written here (tests/unit/portrait-gen.test.ts covers it).
// Rules from the knowledge base (card-games.md section 7): no text in an image; never an artist, studio, franchise or game name in a prompt;
// ONE style constant, byte-identical on every generation; an identity table (one visual clause per officer); the lint refuses to write the
// prompts file and also lints the STYLE constant.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The one style sentence, appended unchanged to every prompt. Changing a character starts a new set. It says "wordless and unlettered" rather
 * than "no text": the lint bans negation words (a diffusion model reads the noun after a negation).
 */
export const STYLE =
  'Painted portrait of a general in the war-council look: head and shoulders, warm lantern light, dark backdrop, wordless and unlettered, full-bleed.'

/** Style variants for --audition (one subject, four looks, the owner picks one). The first is the STYLE. */
export const AUDITION_STYLES = [
  STYLE,
  'Ink-wash portrait of a general: head and shoulders, soft brush edges, warm lantern glow on silk, deep brown backdrop, wordless and unlettered, full-bleed.',
  'Flat cel-shaded portrait of a general: head and shoulders, bold clean shapes, warm lantern light, dark backdrop, wordless and unlettered, full-bleed.',
  'Lacquer-and-gilt portrait of a general: head and shoulders, glossy warm highlights, lantern light, dark backdrop, wordless and unlettered, full-bleed.',
]

/** Proportion anchor, front-loaded in every prompt right after the subject (the figures are about 2.5 heads tall, the head large and round). */
export const ANCHOR = 'stylised figure with a large round head and big expressive eyes'

/** One visual clause per named officer, written once. Colours and gear follow the figure designs (docs/spec/31-hero-figures.md and officerKit.ts). */
export const IDENTITY = {
  'liu-bei': 'a kind calm man in his thirties, gentle face, very long earlobes, thin moustache, topknot held by a small gold pin, jade green and cream robes over light armour',
  'guan-yu': 'a tall dignified general, deep red face, narrow phoenix eyes, very long black beard falling to the chest, green headscarf, green robe over dark armour with a gold belt',
  'zhang-fei': 'a broad fierce general, dark ruddy face, round staring eyes, bristling black whiskers fanning out like a tiger, shouting, black and deep blue armour with iron studs, red cape over the shoulders',
  'zhao-yun': 'a young heroic general, clean-shaven bright face, calm eyes, silver helmet with a white plume, white and pale blue armour',
  'zhuge-liang': 'a serene scholar-strategist, thin beard, tall black scholar hat, white crane-feather robe with black trim, holding a feather fan',
  'lu-bu': 'a proud fierce young warlord, bold brows, short pointed beard, golden crown helm with two long pheasant feathers, red and gold armour',
  'cao-cao': 'a shrewd commanding ruler, narrow watchful eyes, thin moustache and short beard, tall court cap, purple and black armour with a dark cape',
  'zou-jing': 'a stern veteran officer, thick moustache, grey iron helmet with a red plume, jade green armour',
  'jian-yong': 'a friendly easygoing adviser, warm smile, thin moustache, dark cap, tan and brown scholar robes',
  'cheng-yuanzhi': 'a stout rebel general shouting, full black beard, yellow scarf on the head, ochre armour',
  'deng-mao': 'a fierce rebel lieutenant, short pointed beard, yellow scarf, golden ochre armour',
  'captain-gao': 'a loud rebel captain, thick moustache, yellow scarf, ochre armour with pale trim',
  'captain-sun': 'a hard-eyed rebel captain, clean-shaven, yellow scarf, tarnished gold armour',
  'captain-ma': 'a roaring rebel horse captain, short pointed beard, yellow scarf, ochre armour',
  'captain-wu': 'a young wiry rebel archer captain, clean-shaven, yellow scarf, worn gold tunic',
  'taiping-adept': 'a calm rebel sorcerer, short pointed beard, black taoist hat, ochre and black robes',
  'gong-jing': 'a steady Han officer, calm face, thick moustache, grey helmet with a red plume, jade green armour',
  'gongsun-zan': 'a stern northern horse lord, thick moustache, polished silver helmet with a white plume, white and silver armour',
  'tao-qian': 'a kindly elderly governor, long white beard, gentle eyes, dark cap, deep violet robes with gold trim',
  'mi-zhu': 'a prosperous round-faced merchant adviser, kind smile, thin moustache, brown cap, russet and gold robes',
  'sun-qian': 'a quiet courteous envoy, calm eyes, short pointed beard, dark cap, steel blue robes with pale trim',
  'guan-ping': 'a young earnest officer, clean-shaven, green headscarf, green armour with gold trim',
  'xiahou-dun': 'a fierce one-eyed general, leather patch over one eye, thick moustache, dark steel helmet with a slate plume, slate blue armour',
  'xiahou-yuan': 'a lean sharp-eyed archer general, short pointed beard, dark steel helmet with a pale plume, slate blue armour',
  'cao-ren': 'a stout steady general, full black beard, grey steel helmet, slate blue armour',
  'yu-jin': 'a disciplined officer, calm face, thick moustache, steel helmet with a pale plume, slate blue armour',
  'dian-wei': 'a huge broad bodyguard, shouting, full black beard, dark helmet, dark blue armour with steel trim',
  'xu-chu': 'a giant bare-headed warrior, full black beard, shouting, tanned skin, russet armour',
  'zhang-he': 'a young dashing general, clean-shaven, steel helmet with a crimson plume, slate blue armour with gold trim',
  'li-dian': 'a calm scholarly officer, clean-shaven, steel helmet, slate blue armour',
  'chen-gong': 'a cunning counsellor, calm eyes, short pointed beard, black cap, deep blue robes with pale trim',
  'gao-shun': 'a grim disciplined captain, thick moustache, violet-grey helmet with a gold plume, deep purple armour',
  'zhang-liao': 'a fierce loyal cavalry general, thick moustache, steel helmet with a crimson plume, blue armour with gold trim',
  'li-jue': 'a brutal warlord shouting, full black beard, dark iron helmet with a dark red plume, dark red and black armour',
  'guo-si': 'a sly warlord, short pointed beard, dark iron helmet with a gold plume, dark red and black armour',
  'zhang-liang': 'a stern rebel sage, thick moustache, yellow scarf, ochre robe, holding a wooden staff',
  'zhang-bao': 'a fierce rebel sorcerer, short pointed beard, black taoist hat, ochre and black robes',
  'zhou-yu': 'a handsome young strategist, clean-shaven, black topknot, crimson and cream armour',
  'huang-gai': 'a stout old veteran, long grey beard, bronze helmet with a pale plume, crimson armour',
  'gan-ning': 'a bold river warrior, clean-shaven, fierce eyes, bare black hair, blue armour with gold trim and small bells',
  'cai-mao': 'a wary naval commander, thick moustache, green-grey helmet, olive green armour',
  'zhou-cang': 'a towering dark-skinned bandit warrior, full black beard, shouting, bare black hair, worn brown leather armour',
  'pei-yuanshao': 'a wily hill bandit chief, short pointed beard, faded ochre scarf on the head, patched brown armour',
  'dong-zhuo': 'a heavy overbearing frontier general, fleshy face, full black beard, iron helmet with a gold plume, dark red and black armour',
}

const SIDE_LOOK = { han: 'jade green', yellow: 'ochre yellow', cao: 'slate blue', dong: 'dark red and black', lu: 'deep purple', court: 'iron grey' }
const KIND_LOOK = {
  infantry: 'a steady foot soldier officer, iron helmet',
  rebel: 'a rebel foot officer, yellow scarf on the head, ragged tunic',
  archer: 'an alert archer officer, soft cap',
  cavalry: 'a hardy horse officer, iron helmet with a short plume',
}
const VARIANT_LOOK = ['thick moustache', 'clean-shaven young face', 'short pointed beard']

/** Identity clause for a battle-local officer (an invented captain): troop kind and side, one of three face details by variant. */
export function localClause(kind, side, variant) {
  return `${KIND_LOOK[kind]}, ${VARIANT_LOOK[variant % 3]}, ${SIDE_LOOK[side] ?? SIDE_LOOK.han} armour`
}

/** Identity clause for the generic portrait of a side and troop kind. */
export function genericClause(kind, side) {
  return `${KIND_LOOK[kind]}, calm face, ${SIDE_LOOK[side] ?? SIDE_LOOK.han} armour`
}

// ------------------------------------------------------------------ subjects (mirrors src/client/portraits.ts portraitSubjects, from the JSON files)
const SIDES = ['han', 'yellow', 'cao', 'dong', 'lu', 'court']
const kindOf = (type, side) => (type === 'archers' ? 'archer' : type === 'cavalry' ? 'cavalry' : side === 'yellow' ? 'rebel' : 'infantry')
function variantOf(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) % 3
}
const HEROES = new Set(['liu-bei', 'guan-yu', 'zhang-fei', 'zhao-yun', 'zhuge-liang', 'lu-bu', 'cao-cao'])

/** Every portrait subject in the same order as the client's portraitSubjects(): { id, name, group, side, kind, troop, variant }. */
export function loadSubjects(root = '.') {
  const officers = JSON.parse(readFileSync(join(root, 'src/data/officers.json'), 'utf8'))
  const dir = join(root, 'src/data/battles')
  const battles = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  return buildSubjects(officers, battles)
}

/** Subjects from parsed officers.json and battle files (the client's ALL_BATTLES order is the registry's; sides are first-fielded, so order only breaks ties). */
export function buildSubjects(officers, battles) {
  const sideFor = new Map()
  const local = []
  for (const def of battles) {
    const token = (side) => {
      const t = (def.sides ?? []).find((s) => s.id === side)?.colourToken ?? side
      return SIDES.includes(t) ? t : 'han'
    }
    const fielded = [...(def.units ?? []), ...(def.guests ?? []), ...(def.reinforcements ?? []).flatMap((r) => r.units)]
    for (const u of fielded) if (!sideFor.has(u.officer)) sideFor.set(u.officer, token(u.side))
    for (const o of def.officers ?? []) if (!local.some((l) => l.id === o.id)) local.push({ id: o.id, name: o.name, type: o.type ?? 'infantry' })
  }
  const out = []
  const seen = new Set()
  for (const group of ['hero', 'officer']) {
    for (const o of officers) {
      if ((group === 'hero') !== HEROES.has(o.id) || seen.has(o.id)) continue
      seen.add(o.id)
      out.push({ id: o.id, name: o.name, group, side: sideFor.get(o.id) ?? 'han', kind: 'infantry', troop: o.type ?? 'infantry', variant: 0 })
    }
  }
  for (const l of local) {
    if (seen.has(l.id)) continue
    seen.add(l.id)
    const side = sideFor.get(l.id) ?? 'han'
    out.push({ id: l.id, name: l.name, group: 'local', side, kind: kindOf(l.type, side), troop: l.type, variant: variantOf(l.id) })
  }
  for (const side of SIDES) {
    for (const troop of ['infantry', 'archers', 'cavalry']) {
      const kind = kindOf(troop, side)
      out.push({ id: `generic-${side}-${kind}`, name: `${side} ${troop}`, group: 'generic', side, kind, troop, variant: 0 })
    }
  }
  return out
}

/** The identity clause of a subject; a named officer with no entry throws (the build fails, as the knowledge base asks). */
export function clauseFor(s) {
  if (s.group === 'hero' || s.group === 'officer') {
    const c = IDENTITY[s.id]
    if (!c) throw new Error(`portrait identity table has no entry for ${s.id}`)
    return c
  }
  return s.group === 'local' ? localClause(s.kind, s.side, s.variant) : genericClause(s.kind, s.side)
}

/** The full prompt: the subject and the proportion anchor first, then the byte-identical style. */
export function promptFor(s, style = STYLE) {
  return `Head-and-shoulders portrait of ${clauseFor(s)}, ${ANCHOR}. ${style}`
}

// ------------------------------------------------------------------ lint
const TEXT_MAGNETS = ['sign', 'signs', 'signage', 'banner', 'banners', 'logo', 'logos', 'emblem', 'emblems', 'book', 'books', 'map', 'maps', 'screen', 'screens', 'magazine', 'cover', 'poster', 'label', 'caption', 'title', 'inscription', 'writing', 'letters', 'letter', 'text', 'calligraphy', 'plaque', 'stamp', 'seal', 'flag', 'scroll', 'tablet', 'sticker', 'symbol', 'rune', 'runes', 'character', 'characters', 'frame', 'border']
const NEGATIONS = ['no', 'not', 'never', 'without', 'none', 'nothing', 'neither', 'nor', 'avoid', 'absent', 'devoid', 'lacking', 'cannot', "don't", "doesn't", "isn't", "can't"]
const NUMBERS = ['three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'dozen', 'many', 'several', 'hundred']
const BRANDS = ['koei', 'tecmo', 'dynasty warriors', 'dynasty tactics', 'warriors orochi', 'musou', 'total war', 'romance of the three kingdoms', 'sangokushi', 'ghibli', 'disney', 'pixar', 'nintendo', 'capcom', 'blizzard', 'riot', 'marvel', 'studio', 'rutkowski', 'artgerm', 'mucha', 'frazetta', 'miyazaki', 'gundam', 'mecha', 'unreal engine', 'artstation', 'deviantart', 'trending']
export const MAX_PROMPT = 900

/** Violations of a prompt (an empty list passes). Applied to every full prompt, and to the STYLE constant and its audition variants. */
export function lintPrompt(text) {
  const bad = []
  if (text.length > MAX_PROMPT) bad.push(`over ${MAX_PROMPT} characters (${text.length})`)
  const lower = text.toLowerCase()
  const words = lower.match(/[a-z']+/g) ?? []
  for (const w of words) {
    if (TEXT_MAGNETS.includes(w)) bad.push(`text-magnet noun "${w}"`)
    if (NEGATIONS.includes(w)) bad.push(`negation "${w}"`)
    if (NUMBERS.includes(w)) bad.push(`count word "${w}"`)
  }
  for (const m of lower.match(/\d+/g) ?? []) bad.push(`digit "${m}"`)
  for (const b of BRANDS) if (lower.includes(b)) bad.push(`franchise, artist or studio name "${b}"`)
  return [...new Set(bad)]
}

// ------------------------------------------------------------------ plan
/** Deterministic seed per subject id (a re-run of the same id asks for the same picture). */
export function seedFor(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) % 2147483647
}

/**
 * The plan for a run: one entry per subject picked by `only` (exact ids; all when empty) and capped by `limit`. `exists(id)` says whether
 * public/portraits/<id>.webp is already there: an existing file is skipped unless `force` (which archives it first).
 */
export function buildPlan(subjects, { only = [], limit = Infinity, force = false, exists = () => false } = {}) {
  const ids = new Set(subjects.map((s) => s.id))
  for (const o of only) if (!ids.has(o)) throw new Error(`--only ${o}: no such portrait subject`)
  const picked = only.length ? subjects.filter((s) => only.includes(s.id)) : subjects
  const plan = []
  for (const s of picked) {
    const prompt = promptFor(s)
    const has = exists(s.id)
    const action = has ? (force ? 'replace' : 'skip') : 'generate'
    plan.push({ id: s.id, group: s.group, action, prompt, seed: seedFor(s.id), file: `${s.id}.webp` })
  }
  // --limit caps the paid calls, not the skipped lines
  let paid = 0
  return plan.map((p) => {
    if (p.action === 'skip') return p
    paid += 1
    return paid > limit ? { ...p, action: 'defer' } : p
  })
}

/** Lint everything a run would send: the style, the audition variants and every prompt. Returns { ok, problems: [[where, violation]] }. */
export function lintAll(subjects) {
  const problems = []
  for (const [i, st] of AUDITION_STYLES.entries()) for (const v of lintPrompt(st)) problems.push([i === 0 ? 'STYLE' : `audition style ${i}`, v])
  for (const s of subjects) for (const v of lintPrompt(promptFor(s))) problems.push([s.id, v])
  return { ok: problems.length === 0, problems }
}
