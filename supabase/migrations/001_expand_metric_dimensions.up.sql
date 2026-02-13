-- Expand dimensions for queue_depth and claims_in_progress
SELECT * FROM (
  UPDATE metric_definitions SET allowed_dimensions = ARRAY['priority','carrier','adjuster','region','peril','severity'] WHERE slug = 'queue_depth' RETURNING slug, allowed_dimensions
) AS t1;
SELECT * FROM (
  UPDATE metric_definitions SET allowed_dimensions = ARRAY['stage','adjuster','peril','region','severity'] WHERE slug = 'claims_in_progress' RETURNING slug, allowed_dimensions
) AS t2;
