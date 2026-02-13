-- Revert dimensions for queue_depth and claims_in_progress
SELECT * FROM (
  UPDATE metric_definitions SET allowed_dimensions = ARRAY['priority','carrier','adjuster'] WHERE slug = 'queue_depth' RETURNING slug, allowed_dimensions
) AS t1;
SELECT * FROM (
  UPDATE metric_definitions SET allowed_dimensions = ARRAY['stage','adjuster','peril'] WHERE slug = 'claims_in_progress' RETURNING slug, allowed_dimensions
) AS t2;
