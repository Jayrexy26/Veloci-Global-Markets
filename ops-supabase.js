// Veloci Global Markets OPS — isolated admin Supabase client
// Uses sessionStorage + a separate key so it never touches the user's localStorage session.
const SUPABASE_URL  = 'https://xdcscknfomlzwysczegc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkY3Nja25mb21send5c2N6ZWdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MTYzMDMsImV4cCI6MjA4MzI5MjMwM30.E6o2wFFMOpK1DghLUqnxG6Ig09djy4bmDQexprhAiB4';

window.SV_DB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:           window.sessionStorage,
    storageKey:        'sv-ops-auth',
    persistSession:    true,
    autoRefreshToken:  true,
  }
});
