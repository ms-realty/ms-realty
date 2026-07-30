import * as migration_20260710_132716_initial_schema from './20260710_132716_initial_schema';
import * as migration_20260730_120000_property_search_schema from './20260730_120000_property_search_schema';

export const migrations = [
  {
    up: migration_20260710_132716_initial_schema.up,
    down: migration_20260710_132716_initial_schema.down,
    name: '20260710_132716_initial_schema'
  },
  {
    up: migration_20260730_120000_property_search_schema.up,
    down: migration_20260730_120000_property_search_schema.down,
    name: '20260730_120000_property_search_schema'
  },
];
