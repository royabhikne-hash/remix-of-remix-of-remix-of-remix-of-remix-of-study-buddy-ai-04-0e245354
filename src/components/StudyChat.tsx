import { useState, useRef, useEffect } from "react";
import { Send, Image, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  imageUrl?: string;
}

interface StudyChatProps {
  onEndStudy: (summary: { topic: string; timeSpent: number; messages: ChatMessage[] }) => void;
  studentId?: string;
}

const StudyChat = ({ onEndStudy, studentId }: StudyChatProps) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: "Bhai, aaj kya padh raha hai? Chal bata kaunsa subject ya chapter start karna hai! 📚",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [startTime] = useState(new Date());
  const [currentTopic, setCurrentTopic] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getAIResponse = async (conversationHistory: ChatMessage[]) => {
    try {
      // Format messages for the API
      const formattedMessages = conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
        imageUrl: msg.imageUrl
      }));

      const { data, error } = await supabase.functions.invoke('study-chat', {
        body: { messages: formattedMessages, studentId }
      });

      if (error) {
        console.error("Edge function error:", error);
        throw error;
      }

      if (data?.error) {
        toast({
          title: "AI Error",
          description: data.error,
          variant: "destructive"
        });
      }

      return data?.response || "Sorry bhai, kuch problem ho gaya. Phir se try kar!";
    } catch (err) {
      console.error("AI response error:", err);
      return "Oops! Connection mein problem hai. Thodi der baad try karo! 🙏";
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && !selectedImage) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
      imageUrl: selectedImage || undefined,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputValue("");
    const hadImage = !!selectedImage;
    setSelectedImage(null);
    setIsLoading(true);

    // Extract topic from message
    const topicKeywords = ["physics", "chemistry", "maths", "math", "biology", "history", "geography", "english", "hindi", "science", "social"];
    const foundTopic = topicKeywords.find((t) => inputValue.toLowerCase().includes(t));
    if (foundTopic && !currentTopic) {
      setCurrentTopic(foundTopic.charAt(0).toUpperCase() + foundTopic.slice(1));
    }

    // Get AI response
    const aiResponseText = await getAIResponse(newMessages);
    
    const aiResponse: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: aiResponseText,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, aiResponse]);
    setIsLoading(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Image too large",
          description: "Please upload an image smaller than 5MB",
          variant: "destructive"
        });
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEndStudy = () => {
    const timeSpent = Math.round((new Date().getTime() - startTime.getTime()) / 60000);
    onEndStudy({
      topic: currentTopic || "General Study",
      timeSpent: Math.max(timeSpent, 1),
      messages,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] bg-card rounded-2xl border border-border overflow-hidden">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <span className="text-lg">🤖</span>
          </div>
          <div>
            <h3 className="font-semibold">AI Study Buddy</h3>
            <p className="text-xs text-muted-foreground">
              {currentTopic ? `Studying: ${currentTopic}` : "Ready to help!"}
            </p>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={handleEndStudy}>
          End Study
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div className={message.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}>
              {message.imageUrl && (
                <img
                  src={message.imageUrl}
                  alt="Uploaded"
                  className="max-w-[200px] rounded-lg mb-2"
                />
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>
              <span className="text-xs opacity-60 mt-1 block">
                {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div className="chat-bubble-ai flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Typing...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Image Preview */}
      {selectedImage && (
        <div className="px-4 py-2 bg-secondary/30 border-t border-border">
          <div className="relative inline-block">
            <img src={selectedImage} alt="Preview" className="h-20 rounded-lg" />
            <button
              className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-background">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0"
          >
            <Image className="w-5 h-5" />
          </Button>
          <Input
            placeholder="Type your message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            variant="hero"
            size="icon"
            onClick={handleSendMessage}
            disabled={isLoading || (!inputValue.trim() && !selectedImage)}
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StudyChat;
