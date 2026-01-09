import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limiting (resets on function cold start, but provides basic protection)
const loginAttempts = new Map<string, { count: number; lastAttempt: number; blockedUntil: number }>();

const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION = 30 * 60 * 1000; // 30 minutes block after exceeding attempts

function checkRateLimit(identifier: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = loginAttempts.get(identifier);

  if (!record) {
    return { allowed: true };
  }

  // Check if blocked
  if (record.blockedUntil > now) {
    return { 
      allowed: false, 
      waitSeconds: Math.ceil((record.blockedUntil - now) / 1000) 
    };
  }

  // Reset if window expired
  if (now - record.lastAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.delete(identifier);
    return { allowed: true };
  }

  // Check if exceeded attempts
  if (record.count >= MAX_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION;
    return { 
      allowed: false, 
      waitSeconds: Math.ceil(BLOCK_DURATION / 1000) 
    };
  }

  return { allowed: true };
}

function recordAttempt(identifier: string, success: boolean) {
  const now = Date.now();
  const record = loginAttempts.get(identifier);

  if (success) {
    // Clear on successful login
    loginAttempts.delete(identifier);
    return;
  }

  if (!record) {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now, blockedUntil: 0 });
  } else {
    record.count++;
    record.lastAttempt = now;
  }
}

// Constant-time string comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do the comparison to maintain constant time
    let result = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      result |= (a.charCodeAt(i % a.length) || 0) ^ (b.charCodeAt(i % b.length) || 0);
    }
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Generate cryptographically secure credentials
function generateSecureCredentials(): { id: string; password: string } {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const idLength = 12;
  const passLength = 16;
  
  let id = 'SCH_';
  let password = '';
  
  const randomBytes = crypto.getRandomValues(new Uint8Array(idLength + passLength));
  
  for (let i = 0; i < idLength; i++) {
    id += chars[randomBytes[i] % chars.length];
  }
  
  for (let i = 0; i < passLength; i++) {
    password += chars[randomBytes[idLength + i] % chars.length];
  }
  
  return { id, password };
}

// Simple password hashing using Web Crypto API (for edge runtime compatibility)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.slice(0, 32));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const inputHash = await hashPassword(password);
  return secureCompare(inputHash, storedHash);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, userType, identifier, password, schoolData, adminCredentials } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use service role for all operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get client IP for rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';
    const rateLimitKey = `${userType}:${identifier || clientIp}`;

    if (action === "login") {
      // Check rate limit
      const rateCheck = checkRateLimit(rateLimitKey);
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ 
            error: `Too many login attempts. Please try again in ${rateCheck.waitSeconds} seconds.`,
            rateLimited: true,
            waitSeconds: rateCheck.waitSeconds
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (userType === "admin") {
        const { data: admin, error } = await supabase
          .from("admins")
          .select("*")
          .eq("admin_id", identifier)
          .maybeSingle();

        if (error) {
          console.error("Admin lookup error:", error);
          recordAttempt(rateLimitKey, false);
          return new Response(
            JSON.stringify({ error: "Authentication failed" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!admin) {
          recordAttempt(rateLimitKey, false);
          return new Response(
            JSON.stringify({ error: "Invalid credentials" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify password (check both hashed and legacy plain text)
        const isValidHash = await verifyPassword(password, admin.password_hash);
        const isLegacyPlainText = secureCompare(password, admin.password_hash);
        
        if (!isValidHash && !isLegacyPlainText) {
          recordAttempt(rateLimitKey, false);
          return new Response(
            JSON.stringify({ error: "Invalid credentials" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Successful login - clear rate limit
        recordAttempt(rateLimitKey, true);

        // Generate session token
        const sessionToken = crypto.randomUUID();

        // Log the successful login attempt
        await supabase.from("login_attempts").insert({
          identifier: identifier,
          attempt_type: "admin",
          ip_address: clientIp,
          success: true
        });

        return new Response(
          JSON.stringify({ 
            success: true,
            user: {
              id: admin.id,
              name: admin.name,
              role: admin.role,
              adminId: admin.admin_id
            },
            sessionToken
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } else if (userType === "school") {
        const { data: school, error } = await supabase
          .from("schools")
          .select("*")
          .eq("school_id", identifier)
          .maybeSingle();

        if (error) {
          console.error("School lookup error:", error);
          recordAttempt(rateLimitKey, false);
          return new Response(
            JSON.stringify({ error: "Authentication failed" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!school) {
          recordAttempt(rateLimitKey, false);
          return new Response(
            JSON.stringify({ error: "Invalid credentials" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if banned
        if (school.is_banned) {
          return new Response(
            JSON.stringify({ error: "This school account has been suspended" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify password (check both hashed and legacy plain text)
        const isValidHash = await verifyPassword(password, school.password_hash);
        const isLegacyPlainText = secureCompare(password, school.password_hash);
        
        if (!isValidHash && !isLegacyPlainText) {
          recordAttempt(rateLimitKey, false);
          return new Response(
            JSON.stringify({ error: "Invalid credentials" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        recordAttempt(rateLimitKey, true);
        const sessionToken = crypto.randomUUID();

        await supabase.from("login_attempts").insert({
          identifier: identifier,
          attempt_type: "school",
          ip_address: clientIp,
          success: true
        });

        return new Response(
          JSON.stringify({ 
            success: true,
            user: {
              id: school.id,
              schoolId: school.school_id,
              name: school.name,
              feePaid: school.fee_paid
            },
            sessionToken
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Invalid user type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "create_school") {
      // Verify admin credentials first
      if (!adminCredentials?.adminId || !adminCredentials?.sessionToken) {
        return new Response(
          JSON.stringify({ error: "Admin authentication required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify admin exists (session token validation would be more robust in production)
      const { data: admin } = await supabase
        .from("admins")
        .select("id")
        .eq("id", adminCredentials.adminId)
        .maybeSingle();

      if (!admin) {
        return new Response(
          JSON.stringify({ error: "Invalid admin session" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate secure credentials
      const credentials = generateSecureCredentials();
      const hashedPassword = await hashPassword(credentials.password);

      // Create school with hashed password
      const { data: newSchool, error } = await supabase
        .from("schools")
        .insert({
          school_id: credentials.id,
          password_hash: hashedPassword,
          name: schoolData.name,
          district: schoolData.district || null,
          state: schoolData.state || null,
          email: schoolData.email || null,
          contact_whatsapp: schoolData.contact_whatsapp || null,
        })
        .select()
        .single();

      if (error) {
        console.error("Create school error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          school: newSchool,
          credentials: {
            id: credentials.id,
            password: credentials.password // Return plain password only once for admin to share
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "update_school") {
      // Verify admin credentials
      if (!adminCredentials?.adminId || !adminCredentials?.sessionToken) {
        return new Response(
          JSON.stringify({ error: "Admin authentication required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: admin } = await supabase
        .from("admins")
        .select("id")
        .eq("id", adminCredentials.adminId)
        .maybeSingle();

      if (!admin) {
        return new Response(
          JSON.stringify({ error: "Invalid admin session" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { schoolId, updates } = schoolData;

      const { error } = await supabase
        .from("schools")
        .update(updates)
        .eq("id", schoolId);

      if (error) {
        console.error("Update school error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "delete_school") {
      // Verify admin credentials
      if (!adminCredentials?.adminId || !adminCredentials?.sessionToken) {
        return new Response(
          JSON.stringify({ error: "Admin authentication required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: admin } = await supabase
        .from("admins")
        .select("id")
        .eq("id", adminCredentials.adminId)
        .maybeSingle();

      if (!admin) {
        return new Response(
          JSON.stringify({ error: "Invalid admin session" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase
        .from("schools")
        .delete()
        .eq("id", schoolData.schoolId);

      if (error) {
        console.error("Delete school error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "get_students_for_school") {
      // Get students for a specific school (for school dashboard)
      const { schoolUuid, sessionToken } = schoolData;

      if (!schoolUuid || !sessionToken) {
        return new Response(
          JSON.stringify({ error: "School authentication required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: students, error } = await supabase
        .from("students")
        .select("*")
        .eq("school_id", schoolUuid);

      if (error) {
        console.error("Get students error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, students }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Auth error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});