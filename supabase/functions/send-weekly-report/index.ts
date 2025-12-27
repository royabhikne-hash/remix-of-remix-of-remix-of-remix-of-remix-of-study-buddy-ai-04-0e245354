import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StudentReport {
  studentId: string;
  studentName: string;
  parentWhatsapp: string;
  studyConsistency: number;
  topicsCovered: string[];
  weakSubjects: string[];
  improvementSummary: string;
  totalSessions: number;
  totalMinutes: number;
  avgScore: number;
}

const generatePDFContent = (report: StudentReport): string => {
  // Generate a text-based report that Twilio can send
  const dateRange = `${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString()} - ${new Date().toLocaleDateString()}`;
  
  return `📚 *Weekly Study Report*
*Student:* ${report.studentName}
*Period:* ${dateRange}

📊 *Study Statistics:*
• Total Sessions: ${report.totalSessions}
• Total Study Time: ${Math.floor(report.totalMinutes / 60)}h ${report.totalMinutes % 60}m
• Study Consistency: ${report.studyConsistency}%
• Average Score: ${report.avgScore}%

📖 *Topics Covered:*
${report.topicsCovered.length > 0 ? report.topicsCovered.map(t => `• ${t}`).join('\n') : '• No topics recorded'}

⚠️ *Areas Needing Attention:*
${report.weakSubjects.length > 0 ? report.weakSubjects.map(s => `• ${s}`).join('\n') : '• Great progress! No weak areas identified'}

💡 *AI Summary:*
${report.improvementSummary}

_Sent by EduImprove AI - Your child's study companion_`;
};

const sendWhatsAppMessage = async (to: string, message: string): Promise<boolean> => {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Twilio credentials not configured");
    return false;
  }

  // Format phone number for WhatsApp
  let formattedTo = to.replace(/\D/g, '');
  if (!formattedTo.startsWith('91')) {
    formattedTo = '91' + formattedTo;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: `whatsapp:${fromNumber}`,
        To: `whatsapp:+${formattedTo}`,
        Body: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Twilio error:", response.status, errorText);
      return false;
    }

    console.log(`WhatsApp sent successfully to ${formattedTo}`);
    return true;
  } catch (error) {
    console.error("Error sending WhatsApp:", error);
    return false;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Starting weekly report generation...");

    // Get all students with their study sessions from the past 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("*");

    if (studentsError) {
      console.error("Error fetching students:", studentsError);
      throw studentsError;
    }

    console.log(`Found ${students?.length || 0} students`);

    const reports: { studentName: string; sent: boolean }[] = [];

    for (const student of students || []) {
      // Get sessions for this student from the past 7 days
      const { data: sessions } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("student_id", student.id)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false });

      const sessionList = sessions || [];
      
      // Calculate metrics
      const totalSessions = sessionList.length;
      const totalMinutes = sessionList.reduce((acc, s) => acc + (s.time_spent || 0), 0);
      const avgScore = totalSessions > 0 
        ? Math.round(sessionList.reduce((acc, s) => acc + (s.improvement_score || 50), 0) / totalSessions)
        : 0;
      
      // Calculate study consistency (days studied out of 7)
      const daysStudied = new Set(sessionList.map(s => new Date(s.created_at).toDateString())).size;
      const studyConsistency = Math.round((daysStudied / 7) * 100);
      
      // Get unique topics
      const topicsCovered = [...new Set(sessionList.map(s => s.topic).filter(Boolean))];
      
      // Identify weak areas
      const weakSessions = sessionList.filter(s => 
        s.understanding_level === 'weak' || s.understanding_level === 'average'
      );
      const weakSubjects = [...new Set(weakSessions.map(s => s.subject || s.topic).filter(Boolean))];
      
      // Generate improvement summary
      let improvementSummary = "";
      if (totalSessions === 0) {
        improvementSummary = "No study sessions recorded this week. Encourage your child to use the app daily!";
      } else if (studyConsistency >= 70) {
        improvementSummary = `Excellent consistency! ${student.full_name} is showing great dedication with regular study habits.`;
      } else if (studyConsistency >= 40) {
        improvementSummary = `Good effort! With more consistency, ${student.full_name} can improve further.`;
      } else {
        improvementSummary = `${student.full_name} needs to study more regularly. Daily practice will help improve performance.`;
      }

      if (avgScore >= 75) {
        improvementSummary += " Performance is strong - keep it up!";
      } else if (avgScore >= 50) {
        improvementSummary += " Focus on weak areas for better results.";
      }

      const report: StudentReport = {
        studentId: student.id,
        studentName: student.full_name,
        parentWhatsapp: student.parent_whatsapp,
        studyConsistency,
        topicsCovered,
        weakSubjects,
        improvementSummary,
        totalSessions,
        totalMinutes,
        avgScore,
      };

      // Generate and send report
      const messageContent = generatePDFContent(report);
      const sent = await sendWhatsAppMessage(student.parent_whatsapp, messageContent);
      
      reports.push({ studentName: student.full_name, sent });
      
      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("Weekly reports completed:", reports);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${reports.length} students`,
        reports 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Weekly report error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
