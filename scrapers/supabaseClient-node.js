const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://icgcyrkmadtzkvbhljds.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljZ2N5cmttYWR0emt2YmhsamRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTI0NDY0NywiZXhwIjoyMDY0ODIwNjQ3fQ.ohtkmXRGn60izISkslkxa1sWWdniU16WDfxFl1c-__k';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };