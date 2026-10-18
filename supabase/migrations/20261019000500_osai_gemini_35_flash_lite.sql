-- Gemini 2.5 Flash-Lite is unavailable to new users; 3.5 Flash-Lite is listed for this project.
-- Google paid standard pricing: $0.30/1M input, $2.50/1M output.
update kleenest_ai.provider_models set model='gemini-3.5-flash-lite',input_usd_per_million=0.30,output_usd_per_million=2.50,updated_at=now() where provider='gemini' and model='gemini-2.5-flash-lite';
