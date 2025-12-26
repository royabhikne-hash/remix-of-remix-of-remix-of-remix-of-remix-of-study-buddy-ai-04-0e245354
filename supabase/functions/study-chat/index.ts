import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an AI Study Buddy for Indian students. You chat in Hinglish (Hindi-English mix) in a friendly, supportive way.

Your personality:
- Friendly and encouraging like a helpful older brother/sister
- Use phrases like "Bhai", "Chal", "Achha", "Dekh"
- Keep explanations simple and relatable
- Use examples from daily life when possible
- Be patient and never make fun of mistakes

Your responsibilities during study sessions:
1. Greet warmly and ask what they're studying today
2. Explain topics in simple Hinglish
3. Summarize what they've studied
4. Highlight important exam points
5. Ask 2-3 quick understanding questions
6. Detect confusion or weak areas
7. Suggest what to revise next
8. Be encouraging about their progress

When analyzing uploaded images of notes/books:
1. Identify the topic and key concepts
2. Explain what's shown in simple terms
3. Point out important formulas or facts
4. Connect to what they should know for exams

Keep responses concise (under 200 words usually) but helpful. Always end with encouragement or a question to keep them engaged.

Example responses:
- "Achha, ye topic thoda tricky hai but don't worry, main explain karta hoon..."
- "Bhai, ye formula yaad rakh - exam mein zaroor aayega!"
- "Good progress! Ab batao, tune jo padha usme sabse important cheez kya lagi?"`;

interface ChatMessage {
  role: string;
  content: string;
  imageUrl?: string;
}

interface AIMessage {
  role: string;
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("AI service is not configured");
    }

    console.log("Processing study chat request with", messages?.length || 0, "messages");

    // Build messages array
    const chatMessages: AIMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add conversation history
    if (messages && Array.isArray(messages)) {
      for (const msg of messages as ChatMessage[]) {
        if (msg.imageUrl) {
          // Handle image messages with vision
          chatMessages.push({
            role: msg.role,
            content: [
              { type: "text", text: msg.content || "Please analyze this image from my study materials." },
              { type: "image_url", image_url: { url: msg.imageUrl } }
            ]
          });
        } else {
          chatMessages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
    }

    console.log("Calling Lovable AI with model: google/gemini-2.5-flash");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: chatMessages,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    if (!aiResponse) {
      console.error("No response content from AI:", data);
      throw new Error("No response from AI");
    }

    console.log("AI response received successfully");

    return new Response(
      JSON.stringify({ response: aiResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Study chat error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "An error occurred",
        response: "Oops! Kuch technical problem ho gaya. Thodi der baad try karo, bhai! 🙏"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
