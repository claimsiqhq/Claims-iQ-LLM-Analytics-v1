-- Expand dimensions for queue_depth and claims_in_progress
UPDATE metric_definitions SET allowed_dimensions = ARRAY['priority','carrier','adjuster','region','peril','severity'] WHERE slug = 'queue_depth';
UPDATE metric_definitions SET allowed_dimensions = ARRAY['stage','adjuster','peril','region','severity'] WHERE slug = 'claims_in_progress';
