import * as migration_20260615_132131 from './20260615_132131';

export const migrations = [
  {
    up: migration_20260615_132131.up,
    down: migration_20260615_132131.down,
    name: '20260615_132131'
  },
];
