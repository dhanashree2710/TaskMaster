// ===========================================
// Supabase configuration
// ===========================================
// Fill these in with your project's values from
// Supabase Dashboard -> Project Settings -> API.
const SUPABASE_URL = 'https://vgmjwgdpwdztleaysqfz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnbWp3Z2Rwd2R6dGxlYXlzcWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzA5NDMsImV4cCI6MjA5ODY0Njk0M30.Dei4gAPm2bTduhGrnlFO_xaTcfndEBg-OLH8FtbCiGI';

// `supabase` is exposed globally by the CDN script tag included on each page.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORAGE_BUCKETS = {
  employeePhotos: 'employee_photos',
  internPhotos: 'intern_photos',
  documents: 'documents',
  taskFiles: 'task_files',
  wallImages: 'wall_images',
};
