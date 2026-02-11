-- Add VAT default columns to vendor_aliases table
-- Allows setting default VAT settings per vendor alias

-- Add VAT columns
ALTER TABLE vendor_aliases
  ADD COLUMN IF NOT EXISTS default_has_vat BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_vat_percentage NUMERIC(5,2) DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN vendor_aliases.default_has_vat IS 'Default VAT setting for transactions matching this alias (null = no default)';
COMMENT ON COLUMN vendor_aliases.default_vat_percentage IS 'Default VAT percentage for transactions matching this alias (e.g., 17, 18)';

-- Update the seed function to include VAT defaults for common vendors
CREATE OR REPLACE FUNCTION seed_default_vendor_aliases(p_user_id UUID, p_team_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO vendor_aliases (user_id, team_id, alias_pattern, canonical_name, match_type, source, priority, default_has_vat, default_vat_percentage)
  VALUES
    -- Meta/Facebook (Ads platform) - Foreign company, no VAT
    (p_user_id, p_team_id, 'FACEBK', 'Meta (Facebook)', 'contains', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'FB*', 'Meta (Facebook)', 'starts_with', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'META PLATFORMS', 'Meta (Facebook)', 'contains', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'FACEBOOK', 'Meta (Facebook)', 'contains', 'system', 100, false, NULL),

    -- Google (Ads, Cloud, Workspace) - Foreign company, no VAT
    (p_user_id, p_team_id, 'GOOG', 'Google', 'contains', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'GOOGLE*', 'Google', 'starts_with', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'GCP', 'Google Cloud Platform', 'exact', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'GOOGLE ADS', 'Google Ads', 'contains', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'GOOGLE CLOUD', 'Google Cloud Platform', 'contains', 'system', 100, false, NULL),

    -- Microsoft (Azure, 365, Ads) - Foreign company, no VAT
    (p_user_id, p_team_id, 'MSFT', 'Microsoft', 'contains', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'MICROSOFT*', 'Microsoft', 'starts_with', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'AZURE', 'Microsoft Azure', 'contains', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'OFFICE 365', 'Microsoft 365', 'contains', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'M365', 'Microsoft 365', 'contains', 'system', 100, false, NULL),

    -- Shopify (E-commerce platform) - Foreign company, no VAT
    (p_user_id, p_team_id, 'SHOPIFY', 'Shopify', 'contains', 'system', 100, false, NULL),
    (p_user_id, p_team_id, 'SHOPIFY*', 'Shopify', 'starts_with', 'system', 100, false, NULL)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
