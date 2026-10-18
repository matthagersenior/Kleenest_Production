-- Enable a low-cost, JSON-capable model for public-evidence investigations only.
-- Official Google Gemini 2.5 Flash-Lite standard paid text rates:
-- input $0.10/1M tokens, output $0.40/1M tokens.
-- Other provider placeholders remain disabled until independently validated.
update kleenest_ai.provider_models
set model = 'gemini-2.5-flash-lite',
    enabled = true,
    supports_json = true,
    allowed_data_class = 'public',
    input_usd_per_million = 0.10,
    output_usd_per_million = 0.40,
    priority = 1,
    updated_at = now()
where provider = 'gemini' and model = 'unconfigured' and enabled = false;
