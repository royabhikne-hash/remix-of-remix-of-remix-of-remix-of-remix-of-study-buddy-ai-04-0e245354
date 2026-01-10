import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, session_token, user_type, school_id } = await req.json();

    // Create admin client to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify session token
    if (user_type === 'school') {
      // Verify school session
      const { data: school, error } = await supabaseAdmin
        .from('schools')
        .select('id, name, is_banned, fee_paid')
        .eq('id', school_id)
        .maybeSingle();

      if (error || !school) {
        return new Response(
          JSON.stringify({ error: 'Invalid school session' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (school.is_banned) {
        return new Response(
          JSON.stringify({ error: 'School is banned' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch students for this school
      const { data: students, error: studentsError } = await supabaseAdmin
        .from('students')
        .select('*')
        .eq('school_id', school_id)
        .eq('is_banned', false)
        .order('created_at', { ascending: false });

      if (studentsError) {
        console.error('Error fetching students:', studentsError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch students' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch study sessions for each student to calculate trends
      const studentsWithSessions = await Promise.all(
        (students || []).map(async (student) => {
          const { data: sessions } = await supabaseAdmin
            .from('study_sessions')
            .select('*')
            .eq('student_id', student.id)
            .order('created_at', { ascending: false })
            .limit(10);

          return {
            ...student,
            study_sessions: sessions || []
          };
        })
      );

      return new Response(
        JSON.stringify({ students: studentsWithSessions, school }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (user_type === 'admin') {
      // Verify admin session (basic check - in production use proper JWT)
      const adminId = session_token?.split('_')[1];
      
      const { data: admin, error: adminError } = await supabaseAdmin
        .from('admins')
        .select('id, name, role')
        .eq('id', adminId)
        .maybeSingle();

      if (adminError || !admin) {
        return new Response(
          JSON.stringify({ error: 'Invalid admin session' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch all students with school info
      const { data: students, error: studentsError } = await supabaseAdmin
        .from('students')
        .select('*, schools(name)')
        .order('created_at', { ascending: false });

      if (studentsError) {
        console.error('Error fetching students:', studentsError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch students' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch all schools
      const { data: schools, error: schoolsError } = await supabaseAdmin
        .from('schools')
        .select('*')
        .order('created_at', { ascending: false });

      if (schoolsError) {
        console.error('Error fetching schools:', schoolsError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch schools' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ students: students || [], schools: schools || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid user type' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
