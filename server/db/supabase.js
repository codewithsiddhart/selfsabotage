const { createClient } = require("@supabase/supabase-js");
const { config } = require("../config");

let _client = null;

function getSupabase() {
  if (_client) return _client;
  const url = config.supabaseUrl;
  const key = config.supabaseServiceKey;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

function isDbEnabled() {
  return !!(config.supabaseUrl && config.supabaseServiceKey);
}

module.exports = { getSupabase, isDbEnabled };
