export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export class BadBboxError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BadBboxError';
  }
}

export function parseBbox(raw: string | undefined): Bbox {
  if (!raw) throw new BadBboxError('bbox query parametr berilmadi');
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length !== 4) {
    throw new BadBboxError('bbox formati: minLng,minLat,maxLng,maxLat');
  }
  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n))) {
    throw new BadBboxError("bbox raqamli bo'lishi shart");
  }
  const [minLng, minLat, maxLng, maxLat] = nums;
  if (minLng >= maxLng) {
    throw new BadBboxError("minLng < maxLng bo'lishi kerak");
  }
  if (minLat >= maxLat) {
    throw new BadBboxError("minLat < maxLat bo'lishi kerak");
  }
  return { minLng, minLat, maxLng, maxLat };
}
