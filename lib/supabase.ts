import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zduzgjaglshgfxpbsxin.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdXpnamFnbHNoZ2Z4cGJzeGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDA3OTMsImV4cCI6MjA3NjcxNjc5M30._3K1_ngdfggkhjcKGV2wgkZ-UtLnD1ritt08632iVxI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
