CREATE TABLE task_effort_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id),
  actor_id uuid NOT NULL REFERENCES principals(id),
  operation_id uuid NOT NULL REFERENCES operations(id),
  action text NOT NULL,
  category text,
  minutes integer,
  reason text NOT NULL,
  voids_id uuid REFERENCES task_effort_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_effort_shape CHECK (
    (action = 'record' AND category IS NOT NULL AND category IN ('correction','reentry') AND minutes IS NOT NULL AND minutes BETWEEN 1 AND 480 AND voids_id IS NULL)
    OR (action = 'void' AND category IS NULL AND minutes IS NULL AND voids_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX task_effort_void_once ON task_effort_entries(voids_id);
CREATE UNIQUE INDEX task_effort_operation_once ON task_effort_entries(operation_id);
CREATE INDEX task_effort_task_idx ON task_effort_entries(task_id, created_at);
CREATE FUNCTION prevent_task_effort_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Task effort observations are append only';
END;
$$;
CREATE TRIGGER task_effort_immutable BEFORE UPDATE OR DELETE ON task_effort_entries
FOR EACH ROW EXECUTE FUNCTION prevent_task_effort_mutation();
