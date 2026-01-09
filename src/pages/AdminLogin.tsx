import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimitWait, setRateLimitWait] = useState<number | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Use secure auth edge function
      const { data, error } = await supabase.functions.invoke("secure-auth", {
        body: {
          action: "login",
          userType: "admin",
          identifier: adminId,
          password: password,
        },
      });

      if (error) {
        throw error;
      }

      if (data.rateLimited) {
        setRateLimitWait(data.waitSeconds);
        toast({
          title: "Too Many Attempts",
          description: `Please wait ${Math.ceil(data.waitSeconds / 60)} minutes before trying again.`,
          variant: "destructive",
        });
        return;
      }

      if (data.error) {
        toast({
          title: "Invalid Credentials",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      if (data.success) {
        // Store session securely (sessionStorage clears on tab close)
        sessionStorage.setItem("adminSession", JSON.stringify({
          id: data.user.id,
          name: data.user.name,
          role: data.user.role,
          adminId: data.user.adminId,
          sessionToken: data.sessionToken,
          timestamp: Date.now(),
        }));
        
        // Also set localStorage for backward compatibility with dashboard checks
        localStorage.setItem("userType", "admin");
        localStorage.setItem("adminId", data.user.id);
        localStorage.setItem("adminName", data.user.name);
        localStorage.setItem("adminRole", data.user.role);
        localStorage.setItem("adminSessionToken", data.sessionToken);
        
        toast({
          title: "Welcome Admin!",
          description: "Admin dashboard access granted.",
        });
        navigate("/admin-dashboard");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: "Login Failed",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen hero-gradient flex flex-col">
      {/* Header */}
      <header className="container mx-auto py-6 px-4">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </header>

      {/* Login Form */}
      <main className="flex-1 container mx-auto px-4 flex items-center justify-center py-8">
        <div className="w-full max-w-md">
          <div className="edu-card p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-destructive flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-destructive-foreground" />
              </div>
              <h1 className="text-2xl font-bold">Admin Login</h1>
              <p className="text-muted-foreground mt-2">Super Admin Access Only</p>
            </div>

            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-destructive mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-foreground">Restricted Access</p>
                  <p className="text-muted-foreground">This login is for authorized administrators only.</p>
                </div>
              </div>
            </div>

            {rateLimitWait && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  Too many login attempts. Please wait before trying again.
                </p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <Label htmlFor="adminId">Admin ID</Label>
                <Input
                  id="adminId"
                  placeholder="Enter your Admin ID"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <Button type="submit" variant="destructive" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? "Logging in..." : "Access Admin Panel"}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-border text-center">
              <Link to="/school-login" className="text-sm text-muted-foreground hover:text-primary">
                School Login →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminLogin;