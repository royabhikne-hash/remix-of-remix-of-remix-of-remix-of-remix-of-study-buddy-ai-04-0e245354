import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  ArrowLeft,
  TrendingUp,
  Calendar,
  Clock,
  Target,
  Brain,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface StudySession {
  id: string;
  topic: string;
  subject: string | null;
  time_spent: number | null;
  improvement_score: number | null;
  understanding_level: string | null;
  weak_areas: string[] | null;
  strong_areas: string[] | null;
  created_at: string;
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--secondary))", "#8884d8", "#82ca9d"];

const StudentProgress = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [studentName, setStudentName] = useState("Student");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
      return;
    }

    if (user) {
      loadProgressData();
    }
  }, [user, loading, navigate]);

  const loadProgressData = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const { data: student } = await supabase
        .from("students")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (student) {
        setStudentName(student.full_name);

        const { data: sessionData } = await supabase
          .from("study_sessions")
          .select("*")
          .eq("student_id", student.id)
          .order("created_at", { ascending: true });

        if (sessionData) {
          setSessions(sessionData);
        }
      }
    } catch (error) {
      console.error("Error loading progress data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate improvement over time data
  const getImprovementData = () => {
    const last30Days = sessions.filter(s => {
      const date = new Date(s.created_at);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return date >= thirtyDaysAgo;
    });

    // Group by date
    const grouped = last30Days.reduce((acc, session) => {
      const date = new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!acc[date]) {
        acc[date] = { scores: [], time: 0 };
      }
      acc[date].scores.push(session.improvement_score || 50);
      acc[date].time += session.time_spent || 0;
      return acc;
    }, {} as Record<string, { scores: number[]; time: number }>);

    return Object.entries(grouped).map(([date, data]) => ({
      date,
      score: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
      time: data.time,
    }));
  };

  // Calculate subject-wise performance
  const getSubjectPerformance = () => {
    const subjectData = sessions.reduce((acc, session) => {
      const subject = session.subject || session.topic || "Other";
      if (!acc[subject]) {
        acc[subject] = { sessions: 0, totalScore: 0, totalTime: 0 };
      }
      acc[subject].sessions++;
      acc[subject].totalScore += session.improvement_score || 50;
      acc[subject].totalTime += session.time_spent || 0;
      return acc;
    }, {} as Record<string, { sessions: number; totalScore: number; totalTime: number }>);

    return Object.entries(subjectData)
      .map(([subject, data]) => ({
        subject: subject.length > 12 ? subject.slice(0, 12) + "..." : subject,
        avgScore: Math.round(data.totalScore / data.sessions),
        totalTime: data.totalTime,
        sessions: data.sessions,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5);
  };

  // Calculate study patterns (time of day, day of week)
  const getStudyPatterns = () => {
    const dayData: Record<string, number> = {
      Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0
    };
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    sessions.forEach(session => {
      const date = new Date(session.created_at);
      const day = days[date.getDay()];
      dayData[day] += session.time_spent || 0;
    });

    return Object.entries(dayData).map(([day, minutes]) => ({
      day,
      minutes,
    }));
  };

  // Calculate understanding level distribution
  const getUnderstandingDistribution = () => {
    const distribution: Record<string, number> = {
      excellent: 0,
      good: 0,
      average: 0,
      weak: 0,
    };

    sessions.forEach(session => {
      const level = session.understanding_level || "average";
      if (distribution[level] !== undefined) {
        distribution[level]++;
      }
    });

    return Object.entries(distribution)
      .filter(([_, count]) => count > 0)
      .map(([level, count]) => ({
        name: level.charAt(0).toUpperCase() + level.slice(1),
        value: count,
      }));
  };

  // Get weak and strong areas
  const getAreasAnalysis = () => {
    const weakAreas: Record<string, number> = {};
    const strongAreas: Record<string, number> = {};

    sessions.forEach(session => {
      (session.weak_areas || []).forEach(area => {
        weakAreas[area] = (weakAreas[area] || 0) + 1;
      });
      (session.strong_areas || []).forEach(area => {
        strongAreas[area] = (strongAreas[area] || 0) + 1;
      });
    });

    return {
      weak: Object.entries(weakAreas).sort((a, b) => b[1] - a[1]).slice(0, 5),
      strong: Object.entries(strongAreas).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  };

  // Calculate overall stats
  const getOverallStats = () => {
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((acc, s) => acc + (s.time_spent || 0), 0);
    const avgScore = totalSessions > 0
      ? Math.round(sessions.reduce((acc, s) => acc + (s.improvement_score || 50), 0) / totalSessions)
      : 0;
    
    // Calculate consistency (unique days studied in last 30 days)
    const last30Days = sessions.filter(s => {
      const date = new Date(s.created_at);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return date >= thirtyDaysAgo;
    });
    const daysStudied = new Set(last30Days.map(s => new Date(s.created_at).toDateString())).size;
    const consistency = Math.round((daysStudied / 30) * 100);

    return { totalSessions, totalMinutes, avgScore, consistency };
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Loading progress...</p>
        </div>
      </div>
    );
  }

  const improvementData = getImprovementData();
  const subjectData = getSubjectPerformance();
  const patternData = getStudyPatterns();
  const understandingData = getUnderstandingDistribution();
  const areasAnalysis = getAreasAnalysis();
  const stats = getOverallStats();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-lg">Progress Report</span>
                <p className="text-xs text-muted-foreground">{studentName}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Overall Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<Calendar className="w-5 h-5" />}
            label="Total Sessions"
            value={stats.totalSessions.toString()}
            color="primary"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Study Time"
            value={`${Math.floor(stats.totalMinutes / 60)}h ${stats.totalMinutes % 60}m`}
            color="accent"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Avg Score"
            value={`${stats.avgScore}%`}
            color="primary"
          />
          <StatCard
            icon={<Target className="w-5 h-5" />}
            label="Consistency"
            value={`${stats.consistency}%`}
            color="accent"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Improvement Over Time */}
          <div className="edu-card p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Improvement Over Time
            </h3>
            {improvementData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={improvementData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: "hsl(var(--primary))", r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No data available yet
              </div>
            )}
          </div>

          {/* Subject Performance */}
          <div className="edu-card p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Subject Performance
            </h3>
            {subjectData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={subjectData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="subject" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }} 
                  />
                  <Bar dataKey="avgScore" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No data available yet
              </div>
            )}
          </div>

          {/* Study Patterns */}
          <div className="edu-card p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Weekly Study Pattern
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={patternData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                  formatter={(value: number) => [`${value} min`, 'Study Time']}
                />
                <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Understanding Distribution */}
          <div className="edu-card p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              Understanding Levels
            </h3>
            {understandingData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={understandingData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="hsl(var(--primary))"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {understandingData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No data available yet
              </div>
            )}
          </div>
        </div>

        {/* Areas Analysis */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Strong Areas */}
          <div className="edu-card p-6">
            <h3 className="font-bold text-lg mb-4 text-accent flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Strong Areas
            </h3>
            {areasAnalysis.strong.length > 0 ? (
              <div className="space-y-3">
                {areasAnalysis.strong.map(([area, count]) => (
                  <div key={area} className="flex items-center justify-between p-3 bg-accent/10 rounded-lg">
                    <span className="font-medium">{area}</span>
                    <span className="text-sm text-muted-foreground">{count} sessions</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Keep studying to identify your strengths!
              </p>
            )}
          </div>

          {/* Weak Areas */}
          <div className="edu-card p-6">
            <h3 className="font-bold text-lg mb-4 text-destructive flex items-center gap-2">
              <Target className="w-5 h-5" />
              Areas to Improve
            </h3>
            {areasAnalysis.weak.length > 0 ? (
              <div className="space-y-3">
                {areasAnalysis.weak.map(([area, count]) => (
                  <div key={area} className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg">
                    <span className="font-medium">{area}</span>
                    <span className="text-sm text-muted-foreground">{count} sessions</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Great job! No weak areas identified yet.
              </p>
            )}
          </div>
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
  color: "primary" | "accent";
}) => {
  const colorClasses = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
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

export default StudentProgress;
