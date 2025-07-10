const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://icgcyrkmadtzkvbhljds.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljZ2N5cmttYWR0emt2YmhsamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNDQ2NDcsImV4cCI6MjA2NDgyMDY0N30.y0QeA2bIkGFm79LDWQtO8Kl6LyY5ghJY_uORIS58twU';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };