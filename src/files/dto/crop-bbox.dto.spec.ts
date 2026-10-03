import { parseBbox, BadBboxError } from './crop-bbox.dto';

describe('parseBbox', () => {
  it.each(['-Infinity,0,1,1', '0,0,Infinity,1', ',0,1,1', '-181,0,1,1', '0,-91,1,1', '0,0,181,1', '0,0,1,91'])('rejects unsafe bbox %s', raw => {
    expect(() => parseBbox(raw)).toThrow(BadBboxError);
  });
  it('parses well-formed "minLng,minLat,maxLng,maxLat"', () => {
    expect(parseBbox('66.5,39.2,67.5,40.0')).toEqual({
      minLng: 66.5,
      minLat: 39.2,
      maxLng: 67.5,
      maxLat: 40.0,
    });
  });

  it('throws on non-numeric', () => {
    expect(() => parseBbox('a,b,c,d')).toThrow(BadBboxError);
  });

  it('throws on wrong arity', () => {
    expect(() => parseBbox('1,2,3')).toThrow(BadBboxError);
  });

  it('throws when minLng >= maxLng', () => {
    expect(() => parseBbox('67,39,66,40')).toThrow(BadBboxError);
  });

  it('throws when minLat >= maxLat', () => {
    expect(() => parseBbox('66,40,67,39')).toThrow(BadBboxError);
  });

  it('throws on missing input', () => {
    expect(() => parseBbox(undefined as any)).toThrow(BadBboxError);
  });
});
