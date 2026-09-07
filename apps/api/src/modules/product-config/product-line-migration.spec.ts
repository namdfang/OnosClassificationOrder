import { inferOrderProductLine, inferProductLine } from './product-line-migration';

describe('inferProductLine (PRD-8)', () => {
  it('collection thắng mọi tín hiệu khác, ưu tiên thêu > gỗ > 2d > 3d', () => {
    expect(inferProductLine({ collections: ['3D'], factoryShortName: 'TNW' })).toEqual({ productLine: '3d', source: 'collection' });
    expect(inferProductLine({ collections: ['3D', 'embroidery'] })).toEqual({ productLine: 'embroidery', source: 'collection' });
    expect(inferProductLine({ collections: ['handmade-wood', '2D'] })).toEqual({ productLine: 'wood', source: 'collection' });
    expect(inferProductLine({ collections: ['2d', '3d'] })).toEqual({ productLine: '2d', source: 'collection' });
  });
  it('xưởng TNW → gỗ, MLDTF → 2d', () => {
    expect(inferProductLine({ factoryShortName: 'TNW' })).toEqual({ productLine: 'wood', source: 'factory' });
    expect(inferProductLine({ factoryShortName: 'mldtf' })).toEqual({ productLine: '2d', source: 'factory' });
  });
  it('phòng máy HT → thêu; mã in embroidery/EMB → thêu, dtf/dtg → 2d', () => {
    expect(inferProductLine({ machineTypeShortName: 'HT' })).toEqual({ productLine: 'embroidery', source: 'machineType' });
    expect(inferProductLine({ printMethod: 'EMB' })).toEqual({ productLine: 'embroidery', source: 'printMethod' });
    expect(inferProductLine({ printMethod: 'dtg' })).toEqual({ productLine: '2d', source: 'printMethod' });
  });
  it('không có tín hiệu → 3d với source=default', () => {
    expect(inferProductLine({})).toEqual({ productLine: '3d', source: 'default' });
    expect(inferProductLine({ collections: ['summer-2026'], factoryShortName: 'TN', machineTypeShortName: 'ICL' })).toEqual({ productLine: '3d', source: 'default' });
    expect(inferOrderProductLine({ factoryShortName: 'ML' })).toBe('3d');
  });
});
