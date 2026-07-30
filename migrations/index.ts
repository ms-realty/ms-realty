import * as migration_20260710_132716_initial_schema from './20260710_132716_initial_schema';
import * as migration_20260730_142043_realty_case_persistence from './20260730_142043_realty_case_persistence';

export const migrations = [
  {
    up: migration_20260710_132716_initial_schema.up,
    down: migration_20260710_132716_initial_schema.down,
    name: '20260710_132716_initial_schema',
  },
  {
    up: migration_20260730_142043_realty_case_persistence.up,
    down: migration_20260730_142043_realty_case_persistence.down,
    name: '20260730_142043_realty_case_persistence'
  },
];
