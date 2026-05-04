/**
 * Public Supabase settings for the browser (anon key only — never put the service role key here).
 * Dashboard: Project Settings → API → Project URL + anon public key.
 */
if (typeof window !== "undefined") {
  window.SUPABASE_URL = window.SUPABASE_URL || "https://zzehgxcrafnszqrwplgg.supabase.co";
  window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZWhneGNyYWZuc3pxcndwbGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjM4NzcsImV4cCI6MjA4OTYzOTg3N30.4Z52FGq9YsrI_3i4g4UZUfXciDCtsg5f6M2yUpLWmbA";
}
