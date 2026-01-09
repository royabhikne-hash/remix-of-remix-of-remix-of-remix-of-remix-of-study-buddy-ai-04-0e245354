-- First, drop the overly permissive RLS policies that allow anyone to modify data

-- Drop dangerous schools table policies
DROP POLICY IF EXISTS "Admin can insert schools" ON schools;
DROP POLICY IF EXISTS "Admin can update schools" ON schools;
DROP POLICY IF EXISTS "Admin can delete schools" ON schools;

-- Drop dangerous admins table policy that exposes credentials
DROP POLICY IF EXISTS "Admins viewable for login" ON admins;

-- Drop overly permissive students policy
DROP POLICY IF EXISTS "Schools can view their students" ON students;

-- Now create restrictive policies

-- Admins table: NO public access (only edge functions with service role can access)
-- This completely protects admin credentials from public access

-- Schools table: Only SELECT allowed for login verification (no write operations from client)
CREATE POLICY "Schools can read own data for login"
ON schools FOR SELECT
USING (true);

-- Schools table: NO insert/update/delete from client (use edge functions with service role)

-- Students table: Schools can view students belonging to them via school_id
-- This requires proper authentication - we'll use edge functions for school access
-- Keep the existing student self-access policies

-- Create a login_attempts table to track failed logins for rate limiting
CREATE TABLE IF NOT EXISTS public.login_attempts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier text NOT NULL,
    attempt_type text NOT NULL,
    ip_address text,
    success boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on login_attempts
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Only edge functions (via service role) can access login_attempts
-- No public access policies - this table is managed server-side only

-- Create index for efficient rate limit queries
CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier_time 
ON login_attempts(identifier, created_at DESC);

-- Create index for cleanup of old records
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at 
ON login_attempts(created_at);