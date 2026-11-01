export const STYLE: string
export const AUDITION_STYLES: string[]
export const ANCHOR: string
export const IDENTITY: Record<string, string>
export const MAX_PROMPT: number
export interface Subject {
  id: string
  name: string
  group: 'hero' | 'officer' | 'local' | 'generic'
  side: string
  kind: 'infantry' | 'archer' | 'cavalry' | 'rebel'
  troop: 'infantry' | 'archers' | 'cavalry'
  variant: number
}
export interface PlanEntry {
  id: string
  group: string
  action: 'generate' | 'replace' | 'skip' | 'defer'
  prompt: string
  seed: number
  file: string
}
export function localClause(kind: string, side: string, variant: number): string
export function genericClause(kind: string, side: string): string
export function loadSubjects(root?: string): Subject[]
export function buildSubjects(officers: unknown[], battles: unknown[]): Subject[]
export function clauseFor(s: Subject): string
export function promptFor(s: Subject, style?: string): string
export function lintPrompt(text: string): string[]
export function seedFor(id: string): number
export function buildPlan(subjects: Subject[], opts?: { only?: string[]; limit?: number; force?: boolean; exists?: (id: string) => boolean }): PlanEntry[]
export function lintAll(subjects: Subject[]): { ok: boolean; problems: [string, string][] }
