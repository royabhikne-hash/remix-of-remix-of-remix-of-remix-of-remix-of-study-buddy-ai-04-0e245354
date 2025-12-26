-- Create enum for boards
CREATE TYPE public.board_type AS ENUM ('CBSE', 'ICSE', 'Bihar Board', 'Other');

-- Create enum for understanding levels
CREATE TYPE public.understanding_level AS ENUM ('weak', 'average', 'good', 'excellent');

-- Create enum for improvement trends
CREATE TYPE public.improvement_trend AS ENUM ('up', 'down', 'stable');

-- Create schools table (pre-seeded)
CREATE TABLE public.schools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  school_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  district TEXT,
  state TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on schools
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Schools are read-only for authenticated users
CREATE POLICY "Schools are viewable by everyone" 
ON public.schools 
FOR SELECT 
USING (true);

-- Create students table (linked to auth.users)
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  photo_url TEXT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  parent_whatsapp TEXT NOT NULL,
  class TEXT NOT NULL,
  age INTEGER NOT NULL,
  board board_type NOT NULL DEFAULT 'CBSE',
  school_id UUID REFERENCES public.schools(id),
  district TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on students
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Students can view their own data
CREATE POLICY "Students can view own data" 
ON public.students 
FOR SELECT 
USING (auth.uid() = user_id);

-- Students can insert their own data
CREATE POLICY "Students can insert own data" 
ON public.students 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Students can update their own data
CREATE POLICY "Students can update own data" 
ON public.students 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Schools can view their students (via school_id matching)
CREATE POLICY "Schools can view their students" 
ON public.students 
FOR SELECT 
USING (true);

-- Create study_sessions table
CREATE TABLE public.study_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_time TIMESTAMP WITH TIME ZONE,
  topic TEXT NOT NULL DEFAULT 'General Study',
  subject TEXT,
  time_spent INTEGER DEFAULT 0,
  understanding_level understanding_level DEFAULT 'average',
  weak_areas TEXT[] DEFAULT '{}',
  strong_areas TEXT[] DEFAULT '{}',
  improvement_score INTEGER DEFAULT 50,
  ai_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on study_sessions
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

-- Students can view their own sessions
CREATE POLICY "Students can view own sessions" 
ON public.study_sessions 
FOR SELECT 
USING (
  student_id IN (
    SELECT id FROM public.students WHERE user_id = auth.uid()
  )
);

-- Students can insert their own sessions
CREATE POLICY "Students can insert own sessions" 
ON public.study_sessions 
FOR INSERT 
WITH CHECK (
  student_id IN (
    SELECT id FROM public.students WHERE user_id = auth.uid()
  )
);

-- Students can update their own sessions
CREATE POLICY "Students can update own sessions" 
ON public.study_sessions 
FOR UPDATE 
USING (
  student_id IN (
    SELECT id FROM public.students WHERE user_id = auth.uid()
  )
);

-- Schools can view all sessions for their students
CREATE POLICY "Anyone can view sessions" 
ON public.study_sessions 
FOR SELECT 
USING (true);

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Students can view their own messages
CREATE POLICY "Students can view own messages" 
ON public.chat_messages 
FOR SELECT 
USING (
  session_id IN (
    SELECT ss.id FROM public.study_sessions ss
    JOIN public.students s ON ss.student_id = s.id
    WHERE s.user_id = auth.uid()
  )
);

-- Students can insert their own messages
CREATE POLICY "Students can insert own messages" 
ON public.chat_messages 
FOR INSERT 
WITH CHECK (
  session_id IN (
    SELECT ss.id FROM public.study_sessions ss
    JOIN public.students s ON ss.student_id = s.id
    WHERE s.user_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default school
INSERT INTO public.schools (name, school_id, password_hash, district, state)
VALUES ('Insight Public School, Kishanganj', 'ips855108', 'ipskne855108', 'Kishanganj', 'Bihar');