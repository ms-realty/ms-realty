const PRIORITY_RANK = { critical: 0, urgent: 1, normal: 2, complete: 3 };

function byLeadId(rows = []) {
  return new Map(rows.map((row) => [row.lead_id, row]));
}

function requirementsFor(lead, pipeline) {
  return pipeline?.requirements || lead.requirements || {};
}

function readinessScore(lead, pipeline, match, thread) {
  const requirements = requirementsFor(lead, pipeline);
  const intake = lead.intake_completion || pipeline?.intake_completion || {};
  const signals = [
    { code: "intake_complete", points: intake.complete === true ? 20 : 0, present: intake.complete === true },
    { code: "preferred_channel", points: lead.contact_preference ? 10 : 0, present: Boolean(lead.contact_preference) },
    { code: "listing_context", points: lead.listing_reference ? 10 : 0, present: Boolean(lead.listing_reference) },
    { code: "location_captured", points: requirements.locations?.length ? 10 : 0, present: Boolean(requirements.locations?.length) },
    {
      code: "budget_captured",
      points: requirements.budget_max_eur !== null && requirements.budget_max_eur !== undefined ? 15 : 0,
      present: requirements.budget_max_eur !== null && requirements.budget_max_eur !== undefined,
    },
    { code: "timeline_captured", points: requirements.timeline ? 10 : 0, present: Boolean(requirements.timeline) },
    { code: "inventory_matches", points: match?.match_count > 0 ? 15 : 0, present: match?.match_count > 0, value: match?.match_count || 0 },
    { code: "communication_started", points: (thread?.event_count || 0) > 1 ? 10 : 0, present: (thread?.event_count || 0) > 1 },
  ];
  const score = Math.min(100, signals.reduce((total, signal) => total + signal.points, 0));
  return { score, signals };
}

function nextAction({ lead, sla, pipeline, match, delivery }) {
  if (delivery?.status === "failed") {
    return { code: "requeue_failed_reply", priority: "critical", owner: lead.assigned_broker, due_at: delivery.last_recorded_at };
  }
  if (sla?.status === "manager_escalation_required") {
    return { code: "manager_review_and_reply", priority: "critical", owner: "manager", due_at: sla.manager_escalation_due_at };
  }
  if (pipeline?.overdue) {
    return { code: pipeline.next_action || "pipeline_follow_up", priority: "urgent", owner: pipeline.assigned_broker, due_at: pipeline.next_follow_up_at };
  }
  if (sla?.status === "reminder_required") {
    return { code: "send_initial_reply", priority: "urgent", owner: lead.assigned_broker, due_at: sla.sla_due_at };
  }
  if (sla?.status === "pending") {
    return { code: "send_initial_reply", priority: "normal", owner: lead.assigned_broker, due_at: sla.sla_due_at };
  }
  if (pipeline?.status === "open" && !pipeline.requirements) {
    return { code: "qualify_requirements", priority: "normal", owner: pipeline.assigned_broker, due_at: pipeline.next_follow_up_at };
  }
  if (pipeline?.status === "open" && pipeline.next_action) {
    return { code: pipeline.next_action, priority: "normal", owner: pipeline.assigned_broker, due_at: pipeline.next_follow_up_at };
  }
  if (match?.broker_task?.status === "open") {
    return { code: "review_inventory_matches", priority: "normal", owner: match.broker_task.owner, due_at: null };
  }
  if (pipeline?.status === "closed" || pipeline?.status === "lost") {
    return { code: pipeline.status === "closed" ? "journey_complete" : "no_open_action", priority: "complete", owner: null, due_at: null };
  }
  return { code: lead.lead_type === "seller" ? "seller_follow_up" : "broker_follow_up", priority: "normal", owner: lead.assigned_broker, due_at: null };
}

export function buildLeadBriefs({
  leads = [],
  leadSla = { rows: [] },
  leadMatching = { rows: [] },
  leadPipelineQueue = { states: [], rows: [] },
  replyDeliveryQueue = { states: [] },
  communicationThreads = [],
} = {}) {
  const slaByLead = byLeadId(leadSla.rows);
  const matchByLead = byLeadId(leadMatching.rows);
  const pipelineByLead = byLeadId(leadPipelineQueue.states);
  const pipelineRowsByLead = byLeadId(leadPipelineQueue.rows);
  const deliveryByLead = byLeadId(replyDeliveryQueue.states);
  const threadByLead = byLeadId(communicationThreads);
  const rows = leads.map((lead) => {
    const pipelineState = pipelineByLead.get(lead.lead_id);
    const pipeline = pipelineState ? { ...pipelineState, overdue: pipelineRowsByLead.get(lead.lead_id)?.overdue === true } : null;
    const match = matchByLead.get(lead.lead_id) || null;
    const readiness = readinessScore(lead, pipeline, match, threadByLead.get(lead.lead_id));
    const action = nextAction({
      lead,
      sla: slaByLead.get(lead.lead_id),
      pipeline,
      match,
      delivery: deliveryByLead.get(lead.lead_id),
    });
    return {
      lead_id: lead.lead_id,
      readiness_score: readiness.score,
      readiness_band: readiness.score >= 75 ? "ready" : readiness.score >= 45 ? "developing" : "incomplete",
      priority: action.priority,
      next_action: action,
      signals: readiness.signals,
      match_count: match?.match_count || 0,
      missing_fields: lead.intake_completion?.missing_fields || pipeline?.intake_completion?.missing_fields || [],
      decision_source: "deterministic_workflow",
      hermes_authority: "draft_only",
    };
  });
  rows.sort((left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] || right.readiness_score - left.readiness_score || left.lead_id.localeCompare(right.lead_id));
  return {
    rows,
    summary: {
      leads: rows.length,
      critical: rows.filter((row) => row.priority === "critical").length,
      urgent: rows.filter((row) => row.priority === "urgent").length,
      ready: rows.filter((row) => row.readiness_band === "ready").length,
      incomplete: rows.filter((row) => row.readiness_band === "incomplete").length,
    },
  };
}

export function assertLeadBriefs(report, leads = []) {
  if (report.rows.length !== leads.length || report.summary.leads !== report.rows.length) {
    throw new Error("Lead brief report must cover every lead exactly once");
  }
  const ids = new Set();
  for (const row of report.rows) {
    if (!row.lead_id || ids.has(row.lead_id)) throw new Error("Lead brief ids must be present and unique");
    ids.add(row.lead_id);
    if (!Number.isInteger(row.readiness_score) || row.readiness_score < 0 || row.readiness_score > 100) {
      throw new Error("Lead readiness score must be an integer from 0 to 100");
    }
    if (row.decision_source !== "deterministic_workflow" || row.hermes_authority !== "draft_only") {
      throw new Error("Lead briefs must keep deterministic decisions separate from Hermes drafts");
    }
    if (!row.next_action?.code || !Object.hasOwn(PRIORITY_RANK, row.priority)) {
      throw new Error("Lead briefs must include one bounded next action and priority");
    }
  }
  return true;
}
