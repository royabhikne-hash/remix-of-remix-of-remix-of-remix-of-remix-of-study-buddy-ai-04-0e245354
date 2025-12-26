import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, ArrowLeft, Eye, EyeOff, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const Signup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signUp } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    photo: "",
    fullName: "",
    phone: "",
    parentWhatsapp: "",
    class: "",
    age: "",
    board: "CBSE" as "CBSE" | "ICSE" | "Bihar Board" | "Other",
    schoolName: "Insight Public School, Kishanganj",
    district: "",
    state: "",
    email: "",
    password: "",
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Photo too large",
          description: "Please upload a photo smaller than 5MB",
          variant: "destructive"
        });
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
        setFormData((prev) => ({ ...prev, photo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!photoPreview) {
      toast({
        title: "Photo Required",
        description: "Please upload your photo to continue.",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Sign up with Supabase Auth
      const { error: authError } = await signUp(formData.email, formData.password, {
        full_name: formData.fullName,
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          toast({
            title: "Account exists",
            description: "This email is already registered. Please login instead.",
            variant: "destructive",
          });
        } else {
          throw authError;
        }
        setIsLoading(false);
        return;
      }

      // Get the school ID
      const { data: schoolData } = await supabase
        .from("schools")
        .select("id")
        .eq("school_id", "ips855108")
        .maybeSingle();

      // Wait for auth to complete and get user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user && schoolData) {
        // Create student profile
        const { error: profileError } = await supabase
          .from("students")
          .insert({
            user_id: user.id,
            photo_url: formData.photo,
            full_name: formData.fullName,
            phone: formData.phone,
            parent_whatsapp: formData.parentWhatsapp,
            class: formData.class,
            age: parseInt(formData.age),
            board: formData.board,
            school_id: schoolData.id,
            district: formData.district,
            state: formData.state,
          });

        if (profileError) {
          console.error("Profile creation error:", profileError);
          // Don't throw - user can still use the app
        }
      }

      toast({
        title: "Account Created!",
        description: "Welcome to EduImprove AI. Let's start studying!",
      });
      
      navigate("/dashboard");
    } catch (error) {
      console.error("Signup error:", error);
      toast({
        title: "Signup Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen hero-gradient">
      {/* Header */}
      <header className="container mx-auto py-6 px-4">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </header>

      {/* Signup Form */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="edu-card p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-bold">Create Your Account</h1>
              <p className="text-muted-foreground mt-2">Join EduImprove AI and start improving</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Photo Upload */}
              <div className="flex flex-col items-center">
                <Label className="mb-3">Student Photo *</Label>
                <div
                  className="w-32 h-32 rounded-2xl border-2 border-dashed border-input bg-muted flex items-center justify-center cursor-pointer overflow-hidden hover:border-primary transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Camera className="w-8 h-8 mx-auto mb-2" />
                      <span className="text-xs">Upload Photo</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="Your phone number"
                    value={formData.phone}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="parentWhatsapp">Parent WhatsApp *</Label>
                  <Input
                    id="parentWhatsapp"
                    name="parentWhatsapp"
                    type="tel"
                    placeholder="Parent's WhatsApp number"
                    value={formData.parentWhatsapp}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="class">Class *</Label>
                  <select
                    id="class"
                    name="class"
                    className="flex h-12 w-full rounded-xl border border-input bg-background px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={formData.class}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Class</option>
                    {[...Array(12)].map((_, i) => (
                      <option key={i + 1} value={`Class ${i + 1}`}>
                        Class {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="age">Age *</Label>
                  <Input
                    id="age"
                    name="age"
                    type="number"
                    min="5"
                    max="25"
                    placeholder="Your age"
                    value={formData.age}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="board">Board *</Label>
                  <select
                    id="board"
                    name="board"
                    className="flex h-12 w-full rounded-xl border border-input bg-background px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={formData.board}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="CBSE">CBSE</option>
                    <option value="ICSE">ICSE</option>
                    <option value="Bihar Board">Bihar Board</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="schoolName">School *</Label>
                <select
                  id="schoolName"
                  name="schoolName"
                  className="flex h-12 w-full rounded-xl border border-input bg-background px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formData.schoolName}
                  onChange={handleInputChange}
                  required
                >
                  <option value="Insight Public School, Kishanganj">Insight Public School, Kishanganj</option>
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="district">District *</Label>
                  <Input
                    id="district"
                    name="district"
                    placeholder="Your district"
                    value={formData.district}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    name="state"
                    placeholder="Your state"
                    value={formData.state}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    minLength={6}
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

              <Button type="submit" variant="hero" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? "Creating Account..." : "Create Account & Start Studying"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary font-semibold hover:underline">
                  Login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Signup;
