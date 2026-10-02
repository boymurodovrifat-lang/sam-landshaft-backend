import chroma from 'chroma-js';

const PERCEPTUAL: Record<string, string[]> = {
  Turbo: ['#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4', '#24eca6', '#61fc6c', '#d1e834', '#fe9b2d', '#d93806', '#7a0402'],
  Inferno: ['#000004', '#320a5e', '#781c6d', '#bb3754', '#ec6824', '#fbb41a', '#fcffa4'],
  Magma: ['#000004', '#2c115f', '#721f81', '#b73779', '#f1605d', '#feaf77', '#fcfdbf'],
  Plasma: ['#0d0887', '#5c01a6', '#9c179e', '#cc4778', '#ed7953', '#fdb32f', '#f0f921'],
  Cividis: ['#00224e', '#123570', '#3b496c', '#707173', '#a59c74', '#e1cc55', '#fee838'],
  Rocket: ['#03051a', '#381536', '#6b1b48', '#a42e4d', '#d14245', '#ea6a3e', '#f3933e', '#faba4f', '#fbe07b', '#f9f1b9'],
  Mako: ['#0b0405', '#2b1d3e', '#413e7c', '#3e6998', '#3d90a1', '#4db7a7', '#71d4af', '#bde3c8', '#f5f5f2'],
};

function genScheme(palette: string, min: number, max: number, steps = 6, invert = false) {
  let colors: string[];
  try {
    if (PERCEPTUAL[palette]) {
      colors = chroma.scale(PERCEPTUAL[palette]).mode('lab').colors(steps);
    } else {
      colors = chroma.scale(palette as never).colors(steps);
    }
  } catch {
    colors = chroma.scale('Viridis' as never).colors(steps);
  }
  if (invert) colors = [...colors].reverse();
  return colors.map((color, i) => ({
    value: min + (i / (steps - 1)) * (max - min),
    color,
  }));
}

export interface Preset {
  unit: string;
  min: number;
  max: number;
  palette: string;
  invert?: boolean;
  steps?: number;
}

export const PRESETS: Record<string, Preset> = {
  // Vegetatsiya
  ndvi: { unit: '', min: -1, max: 1, palette: 'RdYlGn' },
  evi: { unit: '', min: -1, max: 1, palette: 'RdYlGn' },
  savi: { unit: '', min: -1, max: 1, palette: 'RdYlGn' },
  gndvi: { unit: '', min: -1, max: 1, palette: 'RdYlGn' },
  msavi: { unit: '', min: -1, max: 1, palette: 'RdYlGn' },
  lai: { unit: '', min: 0, max: 7, palette: 'Greens' },
  fvc: { unit: '', min: -1, max: 1, palette: 'BrBG' },

  // Harorat va namlik
  lst: { unit: '°C', min: 0, max: 50, palette: 'Turbo' },
  'brightness-temperature': { unit: 'K', min: 250, max: 320, palette: 'Inferno' },
  tvdi: { unit: '', min: 0, max: 1, palette: 'RdYlGn', invert: true },
  cwsi: { unit: '', min: 0, max: 1, palette: 'Reds' },
  et: { unit: 'mm/kun', min: 0, max: 10, palette: 'Blues' },
  pet: { unit: 'mm/kun', min: 0, max: 15, palette: 'Blues' },
  'soil-moisture': { unit: '', min: 0, max: 1, palette: 'Blues' },

  // Tuproq holati
  'soil-salinity': { unit: 'dS/m', min: 0, max: 16, palette: 'YlOrRd' },
  ndsi: { unit: '', min: -1, max: 1, palette: 'RdBu', invert: true },
  ssi: { unit: '', min: 0, max: 5, palette: 'OrRd' },
  bi: { unit: '', min: 0, max: 1, palette: 'Greys' },
  albedo: { unit: '', min: 0, max: 1, palette: 'Greys' },
  bsi: { unit: '', min: -1, max: 1, palette: 'BrBG', invert: true },
  'soil-organic-matter': { unit: '%', min: 0, max: 10, palette: 'YlOrBr', invert: true },
  'clay-index': { unit: '', min: 0, max: 1, palette: 'Oranges' },
  'carbonate-index': { unit: '', min: 0, max: 1, palette: 'YlOrBr' },
  'soil-nitrogen': { unit: 'mg/kg', min: 0, max: 100, palette: 'Greens' },

  // Landshaft
  ndwi: { unit: '', min: -1, max: 1, palette: 'RdBu' },
  mndwi: { unit: '', min: -1, max: 1, palette: 'RdBu' },
  ndbi: { unit: '', min: -1, max: 1, palette: 'RdGy' },
  lulc: { unit: '', min: 1, max: 10, palette: 'Spectral', steps: 10 },
  dsi: { unit: '', min: 0, max: 1, palette: 'YlOrRd' },
  'land-degradation': { unit: '', min: 0, max: 1, palette: 'YlOrRd' },
  fragmentation: { unit: '', min: 0, max: 1, palette: 'YlGnBu' },
  slope: { unit: '°', min: 0, max: 45, palette: 'YlOrRd' },
  aspect: { unit: '°', min: 0, max: 360, palette: 'Spectral' },
  dem: { unit: 'm', min: 0, max: 3000, palette: 'Turbo' },
};

export function presetToScheme(slug: string) {
  const preset = PRESETS[slug];
  if (!preset) return null;
  return {
    unit: preset.unit,
    minValue: preset.min,
    maxValue: preset.max,
    colorScheme: JSON.stringify(
      genScheme(preset.palette, preset.min, preset.max, preset.steps ?? 6, preset.invert),
    ),
    palette: preset.palette,
    invert: !!preset.invert,
  };
}
