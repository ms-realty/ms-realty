import * as migration_20260710_132716_initial_schema from './20260710_132716_initial_schema';
import * as migration_20260730_120000_property_search_schema from './20260730_120000_property_search_schema';
import * as migration_20260730_120000_add_supersplat_tours from './20260730_120000_add_supersplat_tours';
import * as migration_20260730_142043_realty_case_persistence from './20260730_142043_realty_case_persistence';
import * as migration_20260730_160000_realign_realty_case_mandate_projection from './20260730_160000_realign_realty_case_mandate_projection';
import * as migration_20260730_170000_add_realty_case_conditions from './20260730_170000_add_realty_case_conditions';

export const migrations = [
  {
    up: migration_20260710_132716_initial_schema.up,
    down: migration_20260710_132716_initial_schema.down,
    name: '20260710_132716_initial_schema',
  },
  {
    up: migration_20260730_120000_property_search_schema.up,
    down: migration_20260730_120000_property_search_schema.down,
    name: '20260730_120000_property_search_schema'
  },
  {
    up: migration_20260730_120000_add_supersplat_tours.up,
    down: migration_20260730_120000_add_supersplat_tours.down,
    name: '20260730_120000_add_supersplat_tours'
  },
  {
    up: migration_20260730_142043_realty_case_persistence.up,
    down: migration_20260730_142043_realty_case_persistence.down,
    name: '20260730_142043_realty_case_persistence'
  },
  {
    up: migration_20260730_160000_realign_realty_case_mandate_projection.up,
    down: migration_20260730_160000_realign_realty_case_mandate_projection.down,
    name: '20260730_160000_realign_realty_case_mandate_projection'
  },
  {
    up: migration_20260730_170000_add_realty_case_conditions.up,
    down: migration_20260730_170000_add_realty_case_conditions.down,
    name: '20260730_170000_add_realty_case_conditions'
  },
];
