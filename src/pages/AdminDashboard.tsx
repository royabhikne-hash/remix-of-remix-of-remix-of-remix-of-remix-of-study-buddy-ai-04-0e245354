import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Shield,
  Users,
  Building2,
  LogOut,
  Plus,
  Search,
  TrendingUp,
  Send,
  FileText,
  Loader2,
  Eye,
  EyeOff,
  X,
  ClipboardList,
  Ban,
  DollarSign,
  CheckCircle,
  XCircle,
  Trash2,
  AlertTriangle,
  Database,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import StudentReportModal from "@/components/StudentReportModal";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguageToggle from "@/components/LanguageToggle";
import { useDebounce } from "@/hooks/useDebounce";

interface School {
  id: string;
  school_id: string;
  name: string;
  district: string | null;
  state: string | null;
  studentCount: number;
  is_banned: boolean;
  fee_paid: boolean;
  email: string | null;
  contact_whatsapp: string | null;
}

interface Student {
  id: string;
  full_name: string;
  class: string;
  parent_whatsapp: string;
  school_name: string;
  photo_url?: string;
  is_banned: boolean;
  is_approved: boolean;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [adminName, setAdminName] = useState("Admin");
  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"schools" | "students" | "reports" | "student-reports">("schools");
  
  // Add school modal state
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [newSchool, setNewSchool] = useState({
    name: "",
    district: "",
    state: "Bihar",
    email: "",
    contact_whatsapp: "",
  });
  const [addingSchool, setAddingSchool] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<{ id: string; password: string } | null>(null);

  // Send report state
  const [sendingReportFor, setSendingReportFor] = useState<string | null>(null);

  // Student report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Ban/Delete confirmation states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "ban" | "unban" | "delete" | "fee";
    entity: "school" | "student";
    id: string;
    name: string;
  } | null>(null);

  // Seed schools state
  const [seedingSchools, setSeedingSchools] = useState(false);
  const [showSeedDialog, setShowSeedDialog] = useState(false);
  const [seededSchools, setSeededSchools] = useState<{ name: string; schoolId: string; password: string }[]>([]);

  // Debounced search
  const debouncedSearch = useDebounce(searchQuery, 300);
  useEffect(() => {
    const storedAdminId = localStorage.getItem("adminId");
    const storedAdminName = localStorage.getItem("adminName");
    
    if (!storedAdminId) {
      navigate("/admin-login");
      return;
    }
    
    if (storedAdminName) {
      setAdminName(storedAdminName);
    }

    loadData();
  }, [navigate]);

  const loadData = async () => {
    try {
      // Use edge function to bypass RLS and get all data for admin
      const sessionToken = localStorage.getItem("adminSessionToken");
      
      if (!sessionToken) {
        toast({
          title: t('msg.error'),
          description: "Session expired. Please login again.",
          variant: "destructive",
        });
        navigate("/admin-login");
        return;
      }
      
      const { data, error } = await supabase.functions.invoke("get-students", {
        body: {
          user_type: "admin",
          session_token: sessionToken,
        },
      });

      if (error) {
        console.error("Error fetching data:", error);
        toast({
          title: t('msg.error'),
          description: "Failed to load data. Please try again.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      
      if (data?.error) {
        if (data.error.includes("expired") || data.error.includes("Invalid")) {
          localStorage.clear();
          navigate("/admin-login");
          return;
        }
        console.error("Data error:", data.error);
        setLoading(false);
        return;
      }

      if (data?.schools && data?.students) {
        const schoolsWithCounts = data.schools.map((school: any) => ({
          ...school,
          studentCount: data.students.filter((s: any) => s.school_id === school.id).length,
          is_banned: school.is_banned || false,
          fee_paid: school.fee_paid !== false,
        }));
        setSchools(schoolsWithCounts);

        const formattedStudents = data.students.map((s: any) => ({
          id: s.id,
          full_name: s.full_name,
          class: s.class,
          parent_whatsapp: s.parent_whatsapp,
          school_name: s.schools?.name || "No School",
          photo_url: s.photo_url || undefined,
          is_banned: s.is_banned || false,
          is_approved: s.is_approved || false,
        }));
        setStudents(formattedStudents);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSchool = async () => {
    if (!newSchool.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter school name",
        variant: "destructive",
      });
      return;
    }

    setAddingSchool(true);

    try {
      // Use secure edge function to create school with cryptographically random credentials
      const adminId = localStorage.getItem("adminId");
      const sessionToken = localStorage.getItem("adminSessionToken");
      
      const { data, error } = await supabase.functions.invoke("secure-auth", {
        body: {
          action: "create_school",
          adminCredentials: {
            adminId,
            sessionToken,
          },
          schoolData: {
            name: newSchool.name,
            district: newSchool.district || null,
            state: newSchool.state || null,
            email: newSchool.email || null,
            contact_whatsapp: newSchool.contact_whatsapp || null,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.error) {
        if (data.error.includes("23505") || data.error.includes("duplicate")) {
          toast({
            title: "School Already Exists",
            description: "A school with similar credentials already exists.",
            variant: "destructive",
          });
        } else {
          throw new Error(data.error);
        }
      } else if (data.success) {
        setGeneratedCredentials(data.credentials);
        toast({
          title: "School Added!",
          description: `${newSchool.name} has been added successfully.`,
        });
        loadData();
      }
    } catch (error) {
      console.error("Error adding school:", error);
      toast({
        title: "Error",
        description: "Failed to add school. Please try again.",
        variant: "destructive",
      });
    } finally {
      setAddingSchool(false);
    }
  };

  const handleBanSchool = async (schoolId: string, ban: boolean) => {
    setActionLoading(schoolId);
    try {
      const adminId = localStorage.getItem("adminId");
      const sessionToken = localStorage.getItem("adminSessionToken");
      
      const { data, error } = await supabase.functions.invoke("secure-auth", {
        body: {
          action: "update_school",
          adminCredentials: { adminId, sessionToken },
          schoolData: {
            schoolId,
            updates: { is_banned: ban },
          },
        },
      });

      if (error || data?.error) throw error || new Error(data.error);

      setSchools(prev => prev.map(s => 
        s.id === schoolId ? { ...s, is_banned: ban } : s
      ));

      toast({
        title: ban ? "School Banned" : "School Unbanned",
        description: ban ? "School can no longer access the dashboard." : "School access has been restored.",
      });
    } catch (error) {
      console.error("Error updating school:", error);
      toast({
        title: "Error",
        description: "Failed to update school. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  const handleToggleFee = async (schoolId: string, paid: boolean) => {
    setActionLoading(schoolId);
    try {
      const adminId = localStorage.getItem("adminId");
      const sessionToken = localStorage.getItem("adminSessionToken");
      
      const { data, error } = await supabase.functions.invoke("secure-auth", {
        body: {
          action: "update_school",
          adminCredentials: { adminId, sessionToken },
          schoolData: {
            schoolId,
            updates: { fee_paid: paid },
          },
        },
      });

      if (error || data?.error) throw error || new Error(data.error);

      setSchools(prev => prev.map(s => 
        s.id === schoolId ? { ...s, fee_paid: paid } : s
      ));

      toast({
        title: paid ? "Fee Marked as Paid" : "Fee Marked as Unpaid",
        description: paid ? "School can access the dashboard." : "School access has been suspended.",
      });
    } catch (error) {
      console.error("Error updating fee status:", error);
      toast({
        title: "Error",
        description: "Failed to update fee status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  const handleDeleteSchool = async (schoolId: string) => {
    setActionLoading(schoolId);
    try {
      const adminId = localStorage.getItem("adminId");
      const sessionToken = localStorage.getItem("adminSessionToken");
      
      const { data, error } = await supabase.functions.invoke("secure-auth", {
        body: {
          action: "delete_school",
          adminCredentials: { adminId, sessionToken },
          schoolData: { schoolId },
        },
      });

      if (error || data?.error) throw error || new Error(data.error);

      setSchools(prev => prev.filter(s => s.id !== schoolId));

      toast({
        title: "School Deleted",
        description: "School has been permanently removed.",
      });
    } catch (error) {
      console.error("Error deleting school:", error);
      toast({
        title: "Error",
        description: "Failed to delete school. It may have associated students.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  const handleBanStudent = async (studentId: string, ban: boolean) => {
    setActionLoading(studentId);
    try {
      const { error } = await supabase
        .from("students")
        .update({ is_banned: ban })
        .eq("id", studentId);

      if (error) throw error;

      setStudents(prev => prev.map(s => 
        s.id === studentId ? { ...s, is_banned: ban } : s
      ));

      toast({
        title: ban ? "Student Banned" : "Student Unbanned",
        description: ban ? "Student can no longer access the platform." : "Student access has been restored.",
      });
    } catch (error) {
      console.error("Error updating student:", error);
      toast({
        title: "Error",
        description: "Failed to update student. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    setActionLoading(studentId);
    try {
      const { error } = await supabase
        .from("students")
        .delete()
        .eq("id", studentId);

      if (error) throw error;

      setStudents(prev => prev.filter(s => s.id !== studentId));

      toast({
        title: "Student Deleted",
        description: "Student has been permanently removed.",
      });
    } catch (error) {
      console.error("Error deleting student:", error);
      toast({
        title: "Error",
        description: "Failed to delete student. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  const handleSendReport = async (studentId: string, parentWhatsapp: string) => {
    setSendingReportFor(studentId);
    try {
      const { data, error } = await supabase.functions.invoke("send-weekly-report", {
        body: { studentId, testMode: true },
      });

      if (error) throw error;

      if (data?.success) {
        await supabase.from("parent_reports").insert({
          student_id: studentId,
          report_type: "manual",
          report_data: data.reportData || {},
          sent_at: new Date().toISOString(),
          sent_to: parentWhatsapp,
          created_by: localStorage.getItem("adminId"),
          created_by_type: "admin",
        });

        toast({
          title: "Report Sent!",
          description: `WhatsApp report sent to ${parentWhatsapp}`,
        });
      } else {
        throw new Error(data?.error || "Failed to send report");
      }
    } catch (error) {
      console.error("Error sending report:", error);
      toast({
        title: "Failed to send report",
        description: error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setSendingReportFor(null);
    }
  };

  const handleViewStudentReport = (student: Student) => {
    setSelectedStudent(student);
    setShowReportModal(true);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  const filteredSchools = useMemo(() => 
    schools.filter((school) =>
      school.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      school.school_id.toLowerCase().includes(debouncedSearch.toLowerCase())
    ), [schools, debouncedSearch]);

  const filteredStudents = useMemo(() => 
    students.filter(
      (student) =>
        student.full_name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        student.school_name.toLowerCase().includes(debouncedSearch.toLowerCase())
    ), [students, debouncedSearch]);

  const stats = useMemo(() => ({
    totalStudents: students.length,
    totalSchools: schools.length,
    activeSchools: schools.filter((s) => s.studentCount > 0 && !s.is_banned && s.fee_paid).length,
    bannedSchools: schools.filter((s) => s.is_banned).length,
    unpaidSchools: schools.filter((s) => !s.fee_paid).length,
  }), [schools, students]);

  const handleSeedSchools = async () => {
    setSeedingSchools(true);
    try {
      const sessionToken = localStorage.getItem("adminSessionToken");
      
      const { data, error } = await supabase.functions.invoke("seed-schools", {
        body: {
          action: "seed_default",
          sessionToken,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.created && data.created.length > 0) {
        setSeededSchools(data.created);
        toast({
          title: `${data.created.length} Schools Created!`,
          description: "Default schools have been added successfully.",
        });
        loadData();
      } else if (data?.errors?.length > 0) {
        toast({
          title: "Some schools already exist",
          description: data.errors.join(", "),
        });
      } else {
        toast({
          title: "No schools created",
          description: "All default schools already exist.",
        });
      }
    } catch (error) {
      console.error("Seed schools error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to seed schools.",
        variant: "destructive",
      });
    } finally {
      setSeedingSchools(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-destructive flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Shield className="w-6 h-6 text-destructive-foreground" />
          </div>
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-destructive flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 sm:w-6 sm:h-6 text-destructive-foreground" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-sm sm:text-lg truncate block">Admin Panel</span>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Welcome, {adminName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LanguageToggle />
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 mb-6 sm:mb-8">
          <div className="edu-card p-3 sm:p-4 text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <p className="text-xl sm:text-2xl font-bold">{stats.totalStudents}</p>
            <p className="text-[10px] sm:text-sm text-muted-foreground">Students</p>
          </div>
          <div className="edu-card p-3 sm:p-4 text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2">
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
            </div>
            <p className="text-xl sm:text-2xl font-bold">{stats.totalSchools}</p>
            <p className="text-[10px] sm:text-sm text-muted-foreground">Schools</p>
          </div>
          <div className="edu-card p-3 sm:p-4 text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <p className="text-xl sm:text-2xl font-bold">{stats.activeSchools}</p>
            <p className="text-[10px] sm:text-sm text-muted-foreground">Active Schools</p>
          </div>
          <div className="edu-card p-3 sm:p-4 text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto mb-2">
              <Ban className="w-5 h-5 sm:w-6 sm:h-6 text-destructive" />
            </div>
            <p className="text-xl sm:text-2xl font-bold">{stats.bannedSchools}</p>
            <p className="text-[10px] sm:text-sm text-muted-foreground">Banned</p>
          </div>
          <div className="edu-card p-3 sm:p-4 text-center col-span-2 sm:col-span-1">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-warning/10 flex items-center justify-center mx-auto mb-2">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-warning" />
            </div>
            <p className="text-xl sm:text-2xl font-bold">{stats.unpaidSchools}</p>
            <p className="text-[10px] sm:text-sm text-muted-foreground">Unpaid Fees</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 sm:mb-6 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
          <Button
            variant={activeTab === "schools" ? "default" : "outline"}
            onClick={() => setActiveTab("schools")}
            size="sm"
            className="text-xs sm:text-sm whitespace-nowrap"
          >
            <Building2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Schools
          </Button>
          <Button
            variant={activeTab === "students" ? "default" : "outline"}
            onClick={() => setActiveTab("students")}
            size="sm"
            className="text-xs sm:text-sm whitespace-nowrap"
          >
            <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Students
          </Button>
          <Button
            variant={activeTab === "reports" ? "default" : "outline"}
            onClick={() => setActiveTab("reports")}
            size="sm"
            className="text-xs sm:text-sm whitespace-nowrap"
          >
            <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Reports
          </Button>
          <Button
            variant={activeTab === "student-reports" ? "default" : "outline"}
            onClick={() => setActiveTab("student-reports")}
            size="sm"
            className="text-xs sm:text-sm whitespace-nowrap"
          >
            <ClipboardList className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Reports
          </Button>
        </div>

        {/* Search & Actions */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 sm:pl-10 h-10 sm:h-12"
            />
          </div>
          {activeTab === "schools" && (
            <Dialog open={showAddSchool} onOpenChange={setShowAddSchool}>
              <DialogTrigger asChild>
                <Button variant="hero" size="sm" className="text-xs sm:text-sm">
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Add School
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New School</DialogTitle>
                </DialogHeader>
                {generatedCredentials ? (
                  <div className="space-y-4">
                    <div className="bg-accent/10 border border-accent/20 rounded-xl p-4">
                      <p className="font-semibold text-accent mb-2">School Added Successfully!</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Share these credentials with the school:
                      </p>
                      <div className="space-y-2 bg-background rounded-lg p-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">School ID:</span>
                          <span className="font-mono font-bold">{generatedCredentials.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Password:</span>
                          <span className="font-mono font-bold">{generatedCredentials.password}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setShowAddSchool(false);
                        setGeneratedCredentials(null);
                        setNewSchool({ name: "", district: "", state: "Bihar", email: "", contact_whatsapp: "" });
                      }}
                    >
                      Done
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="schoolName">School Name *</Label>
                      <Input
                        id="schoolName"
                        placeholder="Enter school name"
                        value={newSchool.name}
                        onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="district">District</Label>
                      <Input
                        id="district"
                        placeholder="e.g., Kishanganj"
                        value={newSchool.district}
                        onChange={(e) => setNewSchool({ ...newSchool, district: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        placeholder="e.g., Bihar"
                        value={newSchool.state}
                        onChange={(e) => setNewSchool({ ...newSchool, state: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email (for notifications)</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="school@example.com"
                        value={newSchool.email}
                        onChange={(e) => setNewSchool({ ...newSchool, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="whatsapp">WhatsApp (for notifications)</Label>
                      <Input
                        id="whatsapp"
                        placeholder="9876543210"
                        value={newSchool.contact_whatsapp}
                        onChange={(e) => setNewSchool({ ...newSchool, contact_whatsapp: e.target.value })}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleAddSchool}
                      disabled={addingSchool}
                    >
                      {addingSchool ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Add School
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Content */}
        {activeTab === "schools" && (
          <div className="edu-card overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-border bg-secondary/30">
              <h2 className="font-bold text-sm sm:text-base">Registered Schools</h2>
            </div>
            <div className="divide-y divide-border">
              {filteredSchools.map((school) => (
                <div key={school.id} className={`p-3 sm:p-4 ${school.is_banned ? 'bg-destructive/5' : !school.fee_paid ? 'bg-warning/5' : ''}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${school.is_banned ? 'bg-destructive/10' : !school.fee_paid ? 'bg-warning/10' : 'bg-accent/10'}`}>
                        <Building2 className={`w-4 h-4 sm:w-5 sm:h-5 ${school.is_banned ? 'text-destructive' : !school.fee_paid ? 'text-warning' : 'text-accent'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                          <p className="font-semibold text-sm sm:text-base truncate">{school.name}</p>
                          {school.is_banned && (
                            <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] sm:text-xs font-medium">Banned</span>
                          )}
                          {!school.fee_paid && !school.is_banned && (
                            <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] sm:text-xs font-medium">Unpaid</span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">
                          ID: {school.school_id} • {school.studentCount} students
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 ml-10 sm:ml-0">
                      {/* Fee Toggle */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDialog({
                          open: true,
                          type: "fee",
                          entity: "school",
                          id: school.id,
                          name: school.name,
                        })}
                        disabled={actionLoading === school.id}
                        className={`text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3 ${school.fee_paid ? "text-accent" : "text-warning"}`}
                      >
                        <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 mr-0.5 sm:mr-1" />
                        {school.fee_paid ? "Paid" : "Unpaid"}
                      </Button>
                      
                      {/* Ban/Unban */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDialog({
                          open: true,
                          type: school.is_banned ? "unban" : "ban",
                          entity: "school",
                          id: school.id,
                          name: school.name,
                        })}
                        disabled={actionLoading === school.id}
                        className={`text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3 ${school.is_banned ? "text-accent" : "text-destructive"}`}
                      >
                        {school.is_banned ? <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" /> : <Ban className="w-3 h-3 sm:w-4 sm:h-4" />}
                      </Button>
                      
                      {/* Delete */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDialog({
                          open: true,
                          type: "delete",
                          entity: "school",
                          id: school.id,
                          name: school.name,
                        })}
                        disabled={actionLoading === school.id}
                        className="text-destructive hover:bg-destructive/10 h-7 sm:h-8 px-2 sm:px-3"
                      >
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredSchools.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No schools found.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "students" && (
          <div className="edu-card overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-border bg-secondary/30">
              <h2 className="font-bold text-sm sm:text-base">All Students</h2>
            </div>
            <div className="divide-y divide-border">
              {filteredStudents.map((student) => (
                <div key={student.id} className={`p-3 sm:p-4 ${student.is_banned ? 'bg-destructive/5' : ''}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {student.photo_url ? (
                        <img 
                          src={student.photo_url} 
                          alt={student.full_name}
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 flex-shrink-0 ${student.is_banned ? 'border-destructive/30' : 'border-primary/20'}`}
                        />
                      ) : (
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm sm:text-lg font-bold flex-shrink-0 ${student.is_banned ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                          {student.full_name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                          <p className="font-semibold text-sm sm:text-base truncate">{student.full_name}</p>
                          {student.is_banned && (
                            <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] sm:text-xs font-medium">Banned</span>
                          )}
                          {!student.is_approved && !student.is_banned && (
                            <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] sm:text-xs font-medium">Pending</span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">
                          {student.class} • {student.school_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 ml-10 sm:ml-0">
                      {/* Ban/Unban */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDialog({
                          open: true,
                          type: student.is_banned ? "unban" : "ban",
                          entity: "student",
                          id: student.id,
                          name: student.full_name,
                        })}
                        disabled={actionLoading === student.id}
                        className={`text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3 ${student.is_banned ? "text-accent" : "text-destructive"}`}
                      >
                        {student.is_banned ? <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" /> : <Ban className="w-3 h-3 sm:w-4 sm:h-4" />}
                      </Button>
                      
                      {/* Delete */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDialog({
                          open: true,
                          type: "delete",
                          entity: "student",
                          id: student.id,
                          name: student.full_name,
                        })}
                        disabled={actionLoading === student.id}
                        className="text-destructive hover:bg-destructive/10 h-7 sm:h-8 px-2 sm:px-3"
                      >
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredStudents.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No students found.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "reports" && (
          <div className="edu-card overflow-hidden">
            <div className="p-4 border-b border-border bg-gradient-to-r from-accent/10 to-primary/10">
              <h2 className="font-bold text-lg">📱 Send Parent Reports</h2>
              <p className="text-sm text-muted-foreground">
                Click "Open WhatsApp" to manually send progress reports to parents
              </p>
            </div>
            <div className="divide-y divide-border">
              {filteredStudents.filter(s => !s.is_banned).map((student) => {
                // Format WhatsApp number - remove leading 0 and add 91
                const formatWhatsAppNumber = (phone: string) => {
                  let cleaned = phone.replace(/\D/g, '');
                  if (cleaned.startsWith('0')) {
                    cleaned = cleaned.substring(1);
                  }
                  if (!cleaned.startsWith('91') && cleaned.length === 10) {
                    cleaned = '91' + cleaned;
                  }
                  return cleaned;
                };
                
                const whatsappNumber = formatWhatsAppNumber(student.parent_whatsapp);
                const reportMessage = encodeURIComponent(
                  `🎓 *EduImprove AI - Progress Report*\n\n` +
                  `👤 Student: ${student.full_name}\n` +
                  `📚 Class: ${student.class}\n` +
                  `🏫 School: ${student.school_name}\n\n` +
                  `📊 Aapke bachche ki weekly progress report ready hai!\n\n` +
                  `📱 Full report dekhne ke liye EduImprove AI app use karein.\n\n` +
                  `_Report generated on ${new Date().toLocaleDateString('en-IN')}_`
                );
                const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${reportMessage}`;
                
                return (
                  <div key={student.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {student.photo_url ? (
                          <img 
                            src={student.photo_url} 
                            alt={student.full_name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-primary/20"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-lg font-bold text-primary">
                            {student.full_name.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{student.full_name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {student.class} • {student.school_name}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            📞 {student.parent_whatsapp}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium text-sm transition-colors shadow-sm"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          Open WhatsApp
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredStudents.filter(s => !s.is_banned).length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No students found.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "student-reports" && (
          <div className="edu-card overflow-hidden">
            <div className="p-4 border-b border-border bg-secondary/30">
              <h2 className="font-bold">Student Report Generator</h2>
              <p className="text-sm text-muted-foreground">
                View detailed study reports for any student (weekly summary, weak areas, AI feedback)
              </p>
            </div>
            <div className="divide-y divide-border">
              {filteredStudents.filter(s => !s.is_banned).map((student) => (
                <div key={student.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {student.photo_url ? (
                      <img 
                        src={student.photo_url} 
                        alt={student.full_name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-primary/20"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold">
                        {student.full_name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold">{student.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {student.class} • {student.school_name}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewStudentReport(student)}
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    View Report
                  </Button>
                </div>
              ))}
              {filteredStudents.filter(s => !s.is_banned).length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No students found.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Confirm Action
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.type === "ban" && `Are you sure you want to ban ${confirmDialog.name}? They will lose access to the platform.`}
              {confirmDialog?.type === "unban" && `Are you sure you want to unban ${confirmDialog.name}? They will regain access to the platform.`}
              {confirmDialog?.type === "delete" && `Are you sure you want to permanently delete ${confirmDialog.name}? This action cannot be undone.`}
              {confirmDialog?.type === "fee" && confirmDialog.entity === "school" && (
                schools.find(s => s.id === confirmDialog.id)?.fee_paid
                  ? `Mark ${confirmDialog.name}'s fee as unpaid? They will lose dashboard access.`
                  : `Mark ${confirmDialog.name}'s fee as paid? They will regain dashboard access.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmDialog?.type === "delete" || confirmDialog?.type === "ban" ? "bg-destructive hover:bg-destructive/90" : ""}
              onClick={() => {
                if (!confirmDialog) return;
                
                if (confirmDialog.type === "ban") {
                  if (confirmDialog.entity === "school") handleBanSchool(confirmDialog.id, true);
                  else handleBanStudent(confirmDialog.id, true);
                } else if (confirmDialog.type === "unban") {
                  if (confirmDialog.entity === "school") handleBanSchool(confirmDialog.id, false);
                  else handleBanStudent(confirmDialog.id, false);
                } else if (confirmDialog.type === "delete") {
                  if (confirmDialog.entity === "school") handleDeleteSchool(confirmDialog.id);
                  else handleDeleteStudent(confirmDialog.id);
                } else if (confirmDialog.type === "fee") {
                  const school = schools.find(s => s.id === confirmDialog.id);
                  if (school) handleToggleFee(confirmDialog.id, !school.fee_paid);
                }
              }}
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Student Report Modal */}
      {selectedStudent && (
        <StudentReportModal
          isOpen={showReportModal}
          onClose={() => {
            setShowReportModal(false);
            setSelectedStudent(null);
          }}
          studentId={selectedStudent.id}
          studentName={selectedStudent.full_name}
          studentPhoto={selectedStudent.photo_url}
          studentClass={selectedStudent.class}
          userType="admin"
        />
      )}
    </div>
  );
};

export default AdminDashboard;
