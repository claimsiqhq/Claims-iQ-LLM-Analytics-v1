-- Revert dimensions for queue_depth and claims_in_progress
UPDATE metric_definitions SET allowed_dimensions = ARRAY['priority','carrier','adjuster'] WHERE slug = 'queue_depth';
UPDATE metric_definitions SET allowed_dimensions = ARRAY['stage','adjuster','peril'] WHERE slug = 'claims_in_progress';
