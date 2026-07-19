function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function contactIdForLead(lead) {
  const fingerprint = String(lead.contact_fingerprint || "").trim();
  return fingerprint ? `contact-${fingerprint.slice(0, 16)}` : `contact-${lead.lead_id}`;
}

function latestLead(leads) {
  return [...leads].sort((left, right) => timestamp(right.received_at) - timestamp(left.received_at))[0];
}

export function buildContactRecords({ leads = [], communicationThreads = [], accounts = [] } = {}) {
  const leadsByContact = new Map();
  for (const lead of leads) {
    if (!lead?.lead_id) continue;
    const contactId = contactIdForLead(lead);
    const rows = leadsByContact.get(contactId) || [];
    rows.push(lead);
    leadsByContact.set(contactId, rows);
  }
  const threadsByLead = new Map(communicationThreads.map((thread) => [thread.lead_id, thread]));
  const accountByContact = new Map();
  for (const account of accounts) {
    for (const contactId of account.contact_ids || []) accountByContact.set(contactId, account);
  }
  return [...leadsByContact.entries()]
    .map(([contactId, contactLeads]) => {
      const current = latestLead(contactLeads);
      const account = accountByContact.get(contactId);
      const contact = current.contact || contactLeads.find((lead) => lead.contact)?.contact || {};
      const leadIds = [...new Set(contactLeads.map((lead) => lead.lead_id))];
      return {
        id: contactId,
        display_name: String(contact.name || "").trim() || contactId,
        contact,
        contact_available: Boolean(Object.keys(contact).length),
        preferred_channel: current.contact_preference || null,
        lead_ids: leadIds,
        lead_count: leadIds.length,
        lead_types: [...new Set(contactLeads.map((lead) => lead.lead_type).filter(Boolean))].sort(),
        languages: [...new Set(contactLeads.map((lead) => lead.original_language).filter(Boolean))].sort(),
        sources: [...new Set(contactLeads.map((lead) => lead.source).filter(Boolean))].sort(),
        assigned_brokers: [...new Set(contactLeads.map((lead) => lead.broker_assignment?.broker_id || lead.assigned_broker).filter(Boolean))].sort(),
        latest_received_at: current.received_at || null,
        latest_lead_id: current.lead_id,
        duplicate_leads: Math.max(0, leadIds.length - 1),
        communication_event_count: leadIds.reduce((total, leadId) => total + (threadsByLead.get(leadId)?.event_count || 0), 0),
        account_id: account?.id || null,
        account_label: account?.label || null,
        account_type: account?.type || null,
      };
    })
    .sort((left, right) => timestamp(right.latest_received_at) - timestamp(left.latest_received_at) || left.id.localeCompare(right.id));
}

export function assertContactRecords(records) {
  if (!Array.isArray(records)) throw new Error("Contact records must be an array");
  const ids = new Set();
  const leads = new Set();
  for (const record of records) {
    if (!record.id || ids.has(record.id)) throw new Error("Contact record ids must be present and unique");
    ids.add(record.id);
    if (!record.lead_ids?.length || record.lead_count !== record.lead_ids.length) {
      throw new Error("Contact records must retain their linked leads");
    }
    for (const leadId of record.lead_ids) {
      if (leads.has(leadId)) throw new Error("A lead cannot belong to multiple contact records");
      leads.add(leadId);
    }
  }
  return true;
}
