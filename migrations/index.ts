import * as migration_20260710_132716_initial_schema from './20260710_132716_initial_schema';
import * as migration_20260730_120000_add_supersplat_tours from './20260730_120000_add_supersplat_tours';
import * as migration_20260730_120000_property_search_schema from './20260730_120000_property_search_schema';
import * as migration_20260730_142043_realty_case_persistence from './20260730_142043_realty_case_persistence';
import * as migration_20260730_160000_realign_realty_case_mandate_projection from './20260730_160000_realign_realty_case_mandate_projection';
import * as migration_20260730_170000_add_realty_case_conditions from './20260730_170000_add_realty_case_conditions';
import * as migration_20260810_000558_durable_lead_store from './20260810_000558_durable_lead_store';
import * as migration_20260810_143000_repair_durable_lead_relations from './20260810_143000_repair_durable_lead_relations';
import * as migration_20260810_164700_payload_schema_drift from './20260810_164700_payload_schema_drift';
import * as migration_20260811_120000_durable_listing_edit_audit from './20260811_120000_durable_listing_edit_audit';
import * as migration_20260811_153000_postgres_public_search from './20260811_153000_postgres_public_search';
import * as migration_20260813_110000_repair_postgres_search_index from './20260813_110000_repair_postgres_search_index';
import * as migration_20260813_120000_durable_funnel_events from './20260813_120000_durable_funnel_events';
import * as migration_20260813_120000_durable_lead_side_effects from './20260813_120000_durable_lead_side_effects';
import * as migration_20260813_130000_provider_connections from './20260813_130000_provider_connections';
import * as migration_20260813_140000_provider_webhook_events from './20260813_140000_provider_webhook_events';
import * as migration_20260813_150000_provider_delivery_receipts from './20260813_150000_provider_delivery_receipts';
import * as migration_20260813_160000_durable_viewings from './20260813_160000_durable_viewings';
import * as migration_20260820_190500_repair_postgres_search_view from './20260820_190500_repair_postgres_search_view';
import * as migration_20260825_120000_durable_lead_operations from './20260825_120000_durable_lead_operations';
import * as migration_20260826_220000_source_stated_search_view from './20260826_220000_source_stated_search_view';
import * as migration_20260827_120000_admin_password_change_required from './20260827_120000_admin_password_change_required';
import * as migration_20260828_120000_hermes_owner_receipts from './20260828_120000_hermes_owner_receipts';
import * as migration_20260828_130000_workspace_settings from './20260828_130000_workspace_settings';
import * as migration_20260829_120000_durable_viewing_trip_requests from './20260829_120000_durable_viewing_trip_requests';
import * as migration_20260829_170000_social_marketing_publications from './20260829_170000_social_marketing_publications';
import * as migration_20260830_120000_listing_translation_copy from './20260830_120000_listing_translation_copy';
import * as migration_20260830_130000_listing_translation_workflow_status from './20260830_130000_listing_translation_workflow_status';
import * as migration_20260901_120000_durable_media_lifecycle from './20260901_120000_durable_media_lifecycle';
import * as migration_20260901_130000_document_signatures from './20260901_130000_document_signatures';
import * as migration_20260901_130000_provider_connection_workspace_scope from './20260901_130000_provider_connection_workspace_scope';
import * as migration_20260901_140000_operations_workspace from './20260901_140000_operations_workspace';

export const migrations = [
  {
    up: migration_20260710_132716_initial_schema.up,
    down: migration_20260710_132716_initial_schema.down,
    name: '20260710_132716_initial_schema',
  },
  {
    up: migration_20260730_120000_add_supersplat_tours.up,
    down: migration_20260730_120000_add_supersplat_tours.down,
    name: '20260730_120000_add_supersplat_tours',
  },
  {
    up: migration_20260730_120000_property_search_schema.up,
    down: migration_20260730_120000_property_search_schema.down,
    name: '20260730_120000_property_search_schema',
  },
  {
    up: migration_20260730_142043_realty_case_persistence.up,
    down: migration_20260730_142043_realty_case_persistence.down,
    name: '20260730_142043_realty_case_persistence',
  },
  {
    up: migration_20260730_160000_realign_realty_case_mandate_projection.up,
    down: migration_20260730_160000_realign_realty_case_mandate_projection.down,
    name: '20260730_160000_realign_realty_case_mandate_projection',
  },
  {
    up: migration_20260730_170000_add_realty_case_conditions.up,
    down: migration_20260730_170000_add_realty_case_conditions.down,
    name: '20260730_170000_add_realty_case_conditions',
  },
  {
    up: migration_20260810_000558_durable_lead_store.up,
    down: migration_20260810_000558_durable_lead_store.down,
    name: '20260810_000558_durable_lead_store'
  },
  {
    up: migration_20260810_143000_repair_durable_lead_relations.up,
    down: migration_20260810_143000_repair_durable_lead_relations.down,
    name: '20260810_143000_repair_durable_lead_relations',
  },
  {
    up: migration_20260810_164700_payload_schema_drift.up,
    down: migration_20260810_164700_payload_schema_drift.down,
    name: '20260810_164700_payload_schema_drift',
  },
  {
    up: migration_20260811_120000_durable_listing_edit_audit.up,
    down: migration_20260811_120000_durable_listing_edit_audit.down,
    name: '20260811_120000_durable_listing_edit_audit',
  },
  {
    up: migration_20260811_153000_postgres_public_search.up,
    down: migration_20260811_153000_postgres_public_search.down,
    name: '20260811_153000_postgres_public_search',
  },
  {
    up: migration_20260813_110000_repair_postgres_search_index.up,
    down: migration_20260813_110000_repair_postgres_search_index.down,
    name: '20260813_110000_repair_postgres_search_index',
  },
  {
    up: migration_20260813_120000_durable_funnel_events.up,
    down: migration_20260813_120000_durable_funnel_events.down,
    name: '20260813_120000_durable_funnel_events',
  },
  {
    up: migration_20260813_120000_durable_lead_side_effects.up,
    down: migration_20260813_120000_durable_lead_side_effects.down,
    name: '20260813_120000_durable_lead_side_effects',
  },
  {
    up: migration_20260813_130000_provider_connections.up,
    down: migration_20260813_130000_provider_connections.down,
    name: '20260813_130000_provider_connections',
  },
  {
    up: migration_20260813_140000_provider_webhook_events.up,
    down: migration_20260813_140000_provider_webhook_events.down,
    name: '20260813_140000_provider_webhook_events',
  },
  {
    up: migration_20260813_150000_provider_delivery_receipts.up,
    down: migration_20260813_150000_provider_delivery_receipts.down,
    name: '20260813_150000_provider_delivery_receipts',
  },
  {
    up: migration_20260813_160000_durable_viewings.up,
    down: migration_20260813_160000_durable_viewings.down,
    name: '20260813_160000_durable_viewings',
  },
  {
    up: migration_20260820_190500_repair_postgres_search_view.up,
    down: migration_20260820_190500_repair_postgres_search_view.down,
    name: '20260820_190500_repair_postgres_search_view',
  },
  {
    up: migration_20260825_120000_durable_lead_operations.up,
    down: migration_20260825_120000_durable_lead_operations.down,
    name: '20260825_120000_durable_lead_operations',
  },
  {
    up: migration_20260826_220000_source_stated_search_view.up,
    down: migration_20260826_220000_source_stated_search_view.down,
    name: '20260826_220000_source_stated_search_view',
  },
  {
    up: migration_20260827_120000_admin_password_change_required.up,
    down: migration_20260827_120000_admin_password_change_required.down,
    name: '20260827_120000_admin_password_change_required',
  },
  {
    up: migration_20260828_120000_hermes_owner_receipts.up,
    down: migration_20260828_120000_hermes_owner_receipts.down,
    name: '20260828_120000_hermes_owner_receipts',
  },
  {
    up: migration_20260828_130000_workspace_settings.up,
    down: migration_20260828_130000_workspace_settings.down,
    name: '20260828_130000_workspace_settings',
  },
  {
    up: migration_20260829_120000_durable_viewing_trip_requests.up,
    down: migration_20260829_120000_durable_viewing_trip_requests.down,
    name: '20260829_120000_durable_viewing_trip_requests',
  },
  {
    up: migration_20260829_170000_social_marketing_publications.up,
    down: migration_20260829_170000_social_marketing_publications.down,
    name: '20260829_170000_social_marketing_publications',
  },
  {
    up: migration_20260830_120000_listing_translation_copy.up,
    down: migration_20260830_120000_listing_translation_copy.down,
    name: '20260830_120000_listing_translation_copy',
  },
  {
    up: migration_20260830_130000_listing_translation_workflow_status.up,
    down: migration_20260830_130000_listing_translation_workflow_status.down,
    name: '20260830_130000_listing_translation_workflow_status',
  },
  {
    up: migration_20260901_120000_durable_media_lifecycle.up,
    down: migration_20260901_120000_durable_media_lifecycle.down,
    name: '20260901_120000_durable_media_lifecycle',
  },
  {
    up: migration_20260901_130000_document_signatures.up,
    down: migration_20260901_130000_document_signatures.down,
    name: '20260901_130000_document_signatures',
  },
  {
    up: migration_20260901_130000_provider_connection_workspace_scope.up,
    down: migration_20260901_130000_provider_connection_workspace_scope.down,
    name: '20260901_130000_provider_connection_workspace_scope',
  },
  {
    up: migration_20260901_140000_operations_workspace.up,
    down: migration_20260901_140000_operations_workspace.down,
    name: '20260901_140000_operations_workspace',
  },
];
