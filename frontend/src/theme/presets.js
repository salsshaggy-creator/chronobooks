/**
 * Curated brand accent presets (spec Section 3.6). Each is a full ramp for
 * `--cb-primary-*`, applied to the document root at runtime — no rebuild, no
 * per-screen changes. This is the payoff of theme.css using CSS variables instead of
 * hardcoded colors: switching an organization's brand is just swapping these values.
 *
 * Nine options, not one — but still a fixed list, not a free-form hex picker. Every
 * ramp below is pre-checked for text contrast (light/dark stops chosen so white or
 * dark text both stay readable against them), which is exactly why V1 stays with a
 * curated set rather than letting an org type in any hex — a badly chosen custom
 * color could make text unreadable. A free-form picker with automatic contrast-safe
 * text is the documented Phase 2 upgrade (see README / spec Section 10.4).
 */
export const BRAND_PRESETS = {
  indigo: {
    label: 'Indigo',
    description: 'Modern fintech indigo',
    swatch: '#7f77dd',
    vars: { 50: '#eeedfe', 100: '#cecbf6', 200: '#afa9ec', 400: '#7f77dd', 600: '#534ab7', 800: '#3c3489', 900: '#26215c' },
  },
  emerald: {
    label: 'Emerald',
    description: 'Money-forward green-teal',
    swatch: '#1d9e75',
    vars: { 50: '#e1f5ee', 100: '#9fe1cb', 200: '#5dcaa5', 400: '#1d9e75', 600: '#0f6e56', 800: '#085041', 900: '#04342c' },
  },
  coral: {
    label: 'Coral',
    description: 'Warm and energetic',
    swatch: '#d85a30',
    vars: { 50: '#faece7', 100: '#f5c4b3', 200: '#f0997b', 400: '#d85a30', 600: '#993c1d', 800: '#712b13', 900: '#4a1b0c' },
  },
  rose: {
    label: 'Rose',
    description: 'Distinctive, still professional',
    swatch: '#d4537e',
    vars: { 50: '#fbeaf0', 100: '#f4c0d1', 200: '#ed93b1', 400: '#d4537e', 600: '#993556', 800: '#72243e', 900: '#4b1528' },
  },
  slate: {
    label: 'Slate',
    description: 'Charcoal, premium and neutral',
    swatch: '#888780',
    vars: { 50: '#f1efe8', 100: '#d3d1c7', 200: '#b4b2a9', 400: '#888780', 600: '#5f5e5a', 800: '#444441', 900: '#2c2c2a' },
  },
  sky: {
    label: 'Sky blue',
    description: 'Classic, trustworthy blue',
    swatch: '#378add',
    vars: { 50: '#e6f1fb', 100: '#b5d4f4', 200: '#85b7eb', 400: '#378add', 600: '#185fa5', 800: '#0c447c', 900: '#042c53' },
  },
  forest: {
    label: 'Forest green',
    description: 'Deep, natural green',
    swatch: '#639922',
    vars: { 50: '#eaf3de', 100: '#c0dd97', 200: '#97c459', 400: '#639922', 600: '#3b6d11', 800: '#27500a', 900: '#173404' },
  },
  amber: {
    label: 'Amber gold',
    description: 'Bright and optimistic',
    swatch: '#ba7517',
    vars: { 50: '#faeeda', 100: '#fac775', 200: '#ef9f27', 400: '#ba7517', 600: '#854f0b', 800: '#633806', 900: '#412402' },
  },
  crimson: {
    label: 'Crimson',
    description: 'Bold, high-attention red',
    swatch: '#e24b4a',
    vars: { 50: '#fcebeb', 100: '#f7c1c1', 200: '#f09595', 400: '#e24b4a', 600: '#a32d2d', 800: '#791f1f', 900: '#501313' },
  },
};

export function applyBrandPreset(key) {
  const preset = BRAND_PRESETS[key] || BRAND_PRESETS.indigo;
  const root = document.documentElement;
  Object.entries(preset.vars).forEach(([stop, value]) => root.style.setProperty(`--cb-primary-${stop}`, value));
}
