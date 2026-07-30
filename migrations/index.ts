import * as migration_20260710_132716_initial_schema from './20260710_132716_initial_schema';
import * as migration_20260730_120000_add_supersplat_tours from './20260730_120000_add_supersplat_tours';

export const migrations = [
  {
    up: migration_20260710_132716_initial_schema.up,
    down: migration_20260710_132716_initial_schema.down,
    name: '20260710_132716_initial_schema'
  },
  {
    up: migration_20260730_120000_add_supersplat_tours.up,
    down: migration_20260730_120000_add_supersplat_tours.down,
    name: '20260730_120000_add_supersplat_tours'
  },
];
