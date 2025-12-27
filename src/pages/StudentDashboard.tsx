import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Clock,
  TrendingUp,
  Calendar,
  LogOut,
  Play,
  CheckCircle,
  User,
  BarChart3,
} from "lucide-react";
import StudyChat from "@/components/StudyChat";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  imageUrl?: string;
}

interface RecentSession {
  id: string;
  topic: string;
  date: string;
  duration: number;
  score: number;
}

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut, loading } = useAuth();
  const [isStudying, setIsStudying] = useState(false);
  const [userName, setUserName] = useState("Student");
  const [studentId, setStudentId] = useState<string | null>(null);
  
  const [stats, setStats] = useState({
    todayStudied: false,
    totalSessions: 0,
    totalMinutes: 0,
    improvementScore: 50,
  });

  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
      return;
    }

    if (user) {
      loadStudentData();
    }
  }, [user, loading, navigate]);

  const loadStudentData = async () => {
    if (!user) return;

    try {
      // Get student profile
      const { data: student } = await supabase
        .from("students")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (student) {
        setUserName(student.full_name);
        setStudentId(student.id);

        // Get study sessions
        const { data: sessions } = await supabase
          .from("study_sessions")
          .select("*")
          .eq("student_id", student.id)
          .order("created_at", { ascending: false });

        if (sessions) {
          const totalTime = sessions.reduce((acc, s) => acc + (s.time_spent || 0), 0);
          const avgScore = sessions.length > 0 
            ? Math.round(sessions.reduce((acc, s) => acc + (s.improvement_score || 50), 0) / sessions.length)
            : 50;

          // Check if studied today
          const today = new Date().toDateString();
          const studiedToday = sessions.some(s => new Date(s.created_at).toDateString() === today);

          setStats({
            todayStudied: studiedToday,
            totalSessions: sessions.length,
            totalMinutes: totalTime,
            improvementScore: avgScore,
          });

          // Format recent sessions
          const recent = sessions.slice(0, 5).map((s) => ({
            id: s.id,
            topic: s.topic || "General Study",
            date: formatDate(new Date(s.created_at)),
            duration: s.time_spent || 0,
            score: s.improvement_score || 50,
          }));
          setRecentSessions(recent);
        }
      } else {
        // User signed up but profile not created yet
        setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Student");
      }
    } catch (error) {
      console.error("Error loading student data:", error);
    }
  };

  const formatDate = (date: Date): string => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString();
  };

  const handleStartStudy = () => {
    setIsStudying(true);
    toast({
      title: "Study Session Started! 📚",
      description: "Your AI buddy is ready to help.",
    });
  };

  const handleEndStudy = async (summary: { topic: string; timeSpent: number; messages: ChatMessage[] }) => {
    setIsStudying(false);
    
    // Save session to database if we have a student ID
    if (studentId) {
      try {
        const { error } = await supabase.from("study_sessions").insert({
          student_id: studentId,
          topic: summary.topic,
          time_spent: summary.timeSpent,
          understanding_level: "average",
          improvement_score: Math.floor(Math.random() * 30) + 60, // 60-90 for now
          ai_summary: `Studied ${summary.topic} for ${summary.timeSpent} minutes with ${summary.messages.length} interactions.`,
        });

        if (error) {
          console.error("Error saving session:", error);
        } else {
          // Refresh data
          loadStudentData();
        }
      } catch (err) {
        console.error("Error saving session:", err);
      }
    }

    toast({
      title: "Study Session Complete! 🎉",
      description: `You studied ${summary.topic} for ${summary.timeSpent} minutes.`,
    });
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (isStudying) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="container mx-auto max-w-4xl">
          <StudyChat onEndStudy={handleEndStudy} studentId={studentId || undefined} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-lg">EduImprove AI</span>
                <p className="text-xs text-muted-foreground">Student Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <span className="font-medium hidden sm:block">{userName}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome & Start Study */}
        <div className="mb-8">
          <div className="edu-card p-6 md:p-8 text-center bg-gradient-to-br from-primary/10 to-accent/10">
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              Namaste, {userName}! 👋
            </h1>
            <p className="text-muted-foreground mb-6">
              {stats.todayStudied
                ? "Great job studying today! Ready for more?"
                : "Aaj kya padhna hai? Chal start karte hain!"}
            </p>
            <Button variant="hero" size="xl" onClick={handleStartStudy}>
              <Play className="w-5 h-5" />
              Start Studying
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate("/progress")} className="ml-3">
              <BarChart3 className="w-4 h-4 mr-2" />
              View Progress
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<CheckCircle className="w-5 h-5" />}
            label="Today"
            value={stats.todayStudied ? "Studied ✓" : "Not Yet"}
            color={stats.todayStudied ? "accent" : "muted"}
          />
          <StatCard
            icon={<Calendar className="w-5 h-5" />}
            label="Total Sessions"
            value={stats.totalSessions.toString()}
            color="primary"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Total Time"
            value={`${Math.round(stats.totalMinutes / 60)}h ${stats.totalMinutes % 60}m`}
            color="primary"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Improvement"
            value={`${stats.improvementScore}%`}
            color="accent"
          />
        </div>

        {/* Recent Sessions */}
        <div className="edu-card p-6">
          <h2 className="text-lg font-bold mb-4">Recent Study Sessions</h2>
          {recentSessions.length > 0 ? (
            <div className="space-y-3">
              {recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{session.topic}</p>
                      <p className="text-sm text-muted-foreground">{session.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{session.duration} min</p>
                    <p className="text-sm text-accent font-medium">Score: {session.score}%</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No study sessions yet. Start your first session!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const StatCard = ({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "primary" | "accent" | "muted";
}) => {
  const colorClasses = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    muted: "bg-muted text-muted-foreground",
  };

  return (
    <div className="edu-card p-4">
      <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
};

export default StudentDashboard;
