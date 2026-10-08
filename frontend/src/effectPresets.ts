/**
 * Curated style presets a user can pick for a component's base/hover/active
 * state, instead of writing CSS themselves. Each preset is just a class name
 * defined in effects.css - hover/active classes hook :hover/:active so the
 * effect runs on the CSS engine, not React state.
 *
 * Every preset here only ever touches transform/box-shadow/border-color/
 * background - never width, padding, or border-width changes - so none of
 * them can reflow whatever content is inside the component they're applied to.
 */
import type { ComponentKind } from './types'

export type EffectPreset = { key: string; label: string; className: string }

export const baseEffects: EffectPreset[] = [
  { key: 'flat', label: 'Flat', className: 'effect-base-flat' },
  { key: 'raised', label: 'Raised (chunky 3D)', className: 'effect-base-raised' },
  { key: 'pill', label: 'Solid pill', className: 'effect-base-pill' },
  { key: 'glass', label: 'Glass panel', className: 'effect-base-glass' },
]

export const hoverEffects: EffectPreset[] = [
  { key: 'none', label: 'None', className: '' },
  { key: 'raise', label: 'Physical raise', className: 'effect-hover-raise' },
  { key: 'float', label: 'Floating glow', className: 'effect-hover-float' },
  { key: 'subtle', label: 'Subtle lift', className: 'effect-hover-subtle' },
]

export const activeEffects: EffectPreset[] = [
  { key: 'none', label: 'None', className: '' },
  { key: 'press', label: 'Physical press', className: 'effect-active-press' },
  { key: 'subtle', label: 'Subtle press', className: 'effect-active-subtle' },
]

// Sensible starting point for a freshly-added component of this kind. Every
// kind gets one, though most default to a plain, non-interactive look since
// a label/image/table isn't something you click - the dropdowns still let a
// user opt any component into a punchier style afterward.
export const defaultStyleForKind: Record<ComponentKind, { base: string; hover: string; active: string }> = {
  label: { base: 'flat', hover: 'none', active: 'none' },
  button: { base: 'pill', hover: 'raise', active: 'press' },
  text_input: { base: 'flat', hover: 'subtle', active: 'none' },
  image: { base: 'flat', hover: 'none', active: 'none' },
  table: { base: 'flat', hover: 'none', active: 'none' },
  container: { base: 'flat', hover: 'none', active: 'none' },
  chat: { base: 'glass', hover: 'none', active: 'none' },
  list: { base: 'flat', hover: 'none', active: 'none' },
  message: { base: 'flat', hover: 'none', active: 'none' },
}

function findClassName(presets: EffectPreset[], key: string | undefined): string {
  if (!key) return ''
  return presets.find((preset) => preset.key === key)?.className ?? ''
}

/** Combines a component's chosen preset keys into the class names to render. */
export function effectClassNames(style: { base?: string; hover?: string; active?: string } | null | undefined): string {
  if (!style) return ''
  return [
    findClassName(baseEffects, style.base),
    findClassName(hoverEffects, style.hover),
    findClassName(activeEffects, style.active),
  ]
    .filter(Boolean)
    .join(' ')
}
