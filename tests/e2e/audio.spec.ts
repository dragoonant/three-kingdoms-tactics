import { expect, test, type Page } from '@playwright/test'

// Audio (docs/spec/60-audio.md). Batch 1 files ship since b74545c; the "files pending" checks below keep the empty path
// covered by routing in an empty manifest, one test checks the shipped manifest, and the graph test routes in a generated
// click-track WAV (test data only, never shipped) to drive the real Web Audio path.
// Nothing here judges how the music sounds: that is by ear, on sounds.html.

async function emptyManifest(page: Page): Promise<void> {
  await page.route('**/audio/manifest.json', (r) => r.fulfill({ json: { version: 1, tracks: [] } }))
}

function watch(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

test('sounds.html loads with 0 page errors, shows "no file yet" for every slot, and the volume panel works', async ({ page }) => {
  const errors = watch(page)
  await emptyManifest(page)
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto('./sounds.html?test=1')
  await expect(page.getByTestId('no-tracks')).toBeVisible()
  const slots = page.getByTestId('slots').locator('li')
  expect(await slots.count()).toBe(10)
  for (const li of await slots.all()) await expect(li).toContainText('no file yet')
  await expect(page.getByTestId('demo')).toBeVisible()
  await expect(page.getByTestId('music-note')).toHaveText('Music: files pending')
  // a gesture creates the context; it is running afterwards
  await page.getByTestId('demo-start').click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __audio: { engine: { state: string } } }).__audio.engine.state)).toBe('running')
  // the demo runs silently: no files, meters stay at zero, nothing throws
  await expect(page.getByTestId('meter-bed')).toContainText('-inf dB')
  await page.getByTestId('demo-stop').click()
  // volume persists
  await page.getByTestId('vol-music').fill('35')
  await page.getByTestId('sound-mute').click()
  await expect(page.getByTestId('sound-mute')).toHaveAttribute('aria-pressed', 'true')
  const saved = await page.evaluate(() => localStorage.getItem('tkt.audio.v1'))
  expect(JSON.parse(saved!)).toMatchObject({ music: 0.35, muted: true })
  await page.reload()
  await expect(page.getByTestId('vol-music')).toHaveValue('35')
  await expect(page.getByTestId('sound-mute')).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: 'e2e-out/sounds.png' })
  expect(errors).toEqual([])
})

test('cinema.html shows the music panel (files pending) with 0 page errors', async ({ page }) => {
  const errors = watch(page)
  await emptyManifest(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./cinema.html?test=1')
  await page.waitForFunction(() => (window as unknown as { __cinema?: { ready: boolean } }).__cinema?.ready === true, undefined, { timeout: 90_000 })
  await expect(page.getByTestId('music-panel')).toBeVisible()
  await expect(page.getByTestId('music-note')).toHaveText('Music: files pending')
  await page.getByTestId('vol-master').fill('50')
  await page.getByTestId('play').click()
  await page.getByTestId('play').click()
  await page.screenshot({ path: 'e2e-out/cinema-music.png' })
  expect(errors).toEqual([])
})

test('the title and the battle top bar open the sound settings', async ({ page }) => {
  const errors = watch(page)
  await emptyManifest(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?test=1')
  await expect(page.getByTestId('title-screen')).toBeVisible()
  await page.getByTestId('sound-btn').click()
  const panel = page.getByRole('dialog', { name: 'Sound settings' })
  await expect(panel).toBeVisible()
  await expect(panel.getByTestId('music-note')).toHaveText('Music: files pending')
  await panel.getByTestId('vol-sfx').fill('20')
  await panel.getByTestId('sound-mute').click()
  await expect(page.getByTestId('sound-btn')).toContainText('Sound off')
  await page.screenshot({ path: 'e2e-out/title-sound.png' })
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  // battle: the same control sits on the top bar and survives a replay being skipped by clicking elsewhere
  await page.evaluate(() => (window as unknown as { __game: { begin(): void } }).__game.begin())
  await expect(page.getByTestId('topbar')).toBeVisible()
  await page.getByTestId('topbar').getByTestId('sound-btn').click()
  await expect(page.getByRole('dialog', { name: 'Sound settings' })).toBeVisible()
  await page.screenshot({ path: 'e2e-out/battle-sound.png' })
  // the bed follows the screen
  expect(await page.evaluate(() => (window as unknown as { __audio: { getMood(): string } }).__audio.getMood())).toBe('battle')
  expect(errors).toEqual([])
})

test('the shipped manifest (batch 1) fills every slot on sounds.html with 0 page errors', async ({ page }) => {
  const errors = watch(page)
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto('./sounds.html?test=1')
  await expect(page.getByTestId('tracks')).toBeVisible()
  const slots = page.getByTestId('slots').locator('li')
  expect(await slots.count()).toBe(10)
  for (const li of await slots.all()) await expect(li).not.toContainText('no file yet')
  await expect(page.getByTestId('music-note')).not.toHaveText('Music: files pending')
  expect(errors).toEqual([])
})

function clickTrackWav(seconds: number, bpm: number): Buffer {
  const rate = 22050
  const n = Math.round(seconds * rate)
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  const beat = 60 / bpm
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const since = t % beat
    const v = since < 0.03 ? Math.sin(2 * Math.PI * 880 * since) * Math.exp(-since * 120) * 0.3 : 0
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buf
}

test('real Web Audio path: the demo ducks the bed, locks the charge layer on a beat, and removes it again (generated click track, not music)', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = watch(page)
  const entry = { bpm: 120, beatsPerBar: 4, loopStart: 0, loopEnd: 8, gainDb: 0 }
  const manifest = {
    version: 1,
    tracks: [
      { id: 'test-bed', file: 'test-bed.wav', role: 'bed', mood: 'battle', ...entry },
      { id: 'test-charge', file: 'test-charge.wav', role: 'charge', ...entry, gainDb: -3 },
    ],
  }
  const wav = clickTrackWav(8, 120)
  await page.route('**/audio/manifest.json', (r) => r.fulfill({ json: manifest }))
  await page.route('**/audio/test-*.wav', (r) => r.fulfill({ body: wav, contentType: 'audio/wav' }))
  await page.route('**/audio/missing.ogg', (r) => r.fulfill({ status: 404, body: 'no' }))
  await page.goto('./sounds.html?test=1')
  await expect(page.getByTestId('tracks')).toBeVisible()
  await expect(page.getByTestId('slot-bed:battle')).toContainText('1 file')
  await expect(page.getByTestId('slot-bed:calm')).toContainText('no file yet')
  await page.getByTestId('demo-start').click()
  type A = { levels(): { bed: number; charge: number }; debug(): { charge: string; ducked: boolean; bed: string | null; lock: { time: number; beatInBar: number } | null } | null; now(): number }
  const get = <T>(fn: (a: A) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__audio)`) as Promise<T>
  // bed fades in over 2 s
  await expect.poll(() => get((a) => a.debug()?.bed), { timeout: 20_000 }).toBe('test-bed')
  await expect.poll(() => get((a) => a.levels().bed), { timeout: 10_000 }).toBeGreaterThan(0.95)
  // at 4 s the cut-in starts: the layer goes active and the bed ducks to -6 dB
  await expect.poll(() => get((a) => a.debug()?.charge), { timeout: 20_000 }).toBe('active')
  await expect.poll(() => get((a) => Math.abs(a.levels().bed - 0.501) < 0.02 && Math.abs(a.levels().charge - 0.708) < 0.02), { timeout: 10_000 }).toBe(true)
  const lock = await get((a) => a.debug()?.lock)
  expect(lock).not.toBeNull()
  expect(lock!.beatInBar).toBeGreaterThanOrEqual(0)
  expect(lock!.beatInBar).toBeLessThan(4)
  // 7 s later it ends: the layer fades out over 1.2 s and the bed returns
  await expect.poll(() => get((a) => a.debug()?.charge), { timeout: 20_000 }).toMatch(/releasing|idle/)
  await expect.poll(() => get((a) => a.debug()?.charge), { timeout: 10_000 }).toBe('idle')
  await expect.poll(() => get((a) => a.levels().bed), { timeout: 10_000 }).toBeGreaterThan(0.95)
  expect(await get((a) => a.levels().charge)).toBe(0)
  await page.screenshot({ path: 'e2e-out/sounds-demo.png' })
  expect(errors).toEqual([])
})
