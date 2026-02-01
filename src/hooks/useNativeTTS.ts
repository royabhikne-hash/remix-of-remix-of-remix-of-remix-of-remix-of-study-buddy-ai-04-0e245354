import { useCallback, useEffect, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

interface TTSOptions {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

/**
 * WebView-optimized TTS hook
 * Maximum compatibility with web-to-app converters and WebView wrappers
 */
export const useNativeTTS = () => {
  const [isNative, setIsNative] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    const checkPlatform = async () => {
      // Check if running in Capacitor native app
      let native = false;
      try {
        native = Capacitor.isNativePlatform();
      } catch {
        native = false;
      }
      setIsNative(native);

      // For WebView/Web-to-App: Use Web Speech API with optimizations
      if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
        setIsSupported(true);
        
        // Load voices with retry
        const loadVoices = () => {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            setAvailableVoices(voices);
            console.log('TTS: Loaded', voices.length, 'voices');
          }
        };
        
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        
        // Some WebViews need a delay
        setTimeout(loadVoices, 500);
        setTimeout(loadVoices, 1500);
      } else {
        console.log('TTS: Web Speech API not available');
        setIsSupported(false);
      }
    };

    checkPlatform();
    
    return () => {
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
      }
    };
  }, []);

  /**
   * Sanitize text for TTS - remove markdown, emojis, special chars
   * Optimized for Hinglish content
   */
  const sanitizeText = useCallback((text: string): string => {
    return text
      // Remove emojis first (comprehensive)
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
      .replace(/[\u{2600}-\u{26FF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
      .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
      // Remove markdown formatting
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Clean up special chars
      .replace(/[•●○◦▪▫→←↑↓✓✔✗✘]/g, '')
      // Normalize whitespace
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  /**
   * Get best voice for Hindi/Hinglish content
   * Prioritizes male voices, then Hindi, then Indian English
   */
  const getBestVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (availableVoices.length === 0) {
      try {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          setAvailableVoices(voices);
        }
      } catch {
        return null;
      }
    }

    const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
    
    // Priority order for voice selection
    const voicePreferences = [
      // Hindi male voices
      (v: SpeechSynthesisVoice) => v.lang === 'hi-IN' && v.name.toLowerCase().includes('male'),
      (v: SpeechSynthesisVoice) => v.lang === 'hi-IN' && /madhur|hemant|prabhat|ravi/i.test(v.name),
      (v: SpeechSynthesisVoice) => v.lang === 'hi-IN' && v.name.includes('Google') && !v.name.toLowerCase().includes('female'),
      (v: SpeechSynthesisVoice) => v.lang === 'hi-IN' && !v.name.toLowerCase().includes('female'),
      // Any Hindi voice
      (v: SpeechSynthesisVoice) => v.lang === 'hi-IN',
      (v: SpeechSynthesisVoice) => v.lang.startsWith('hi'),
      // Indian English
      (v: SpeechSynthesisVoice) => v.lang === 'en-IN' && !v.name.toLowerCase().includes('female'),
      (v: SpeechSynthesisVoice) => v.lang === 'en-IN',
      // Generic English (most compatible)
      (v: SpeechSynthesisVoice) => v.lang.startsWith('en') && v.name.includes('Google'),
      (v: SpeechSynthesisVoice) => v.lang.startsWith('en'),
    ];

    for (const preference of voicePreferences) {
      const voice = voices.find(preference);
      if (voice) return voice;
    }

    return voices[0] || null;
  }, [availableVoices]);

  /**
   * Split long text into chunks for better WebView compatibility
   * WebViews often fail on long text
   */
  const splitTextIntoChunks = useCallback((text: string, maxLength: number = 150): string[] => {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?।])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + ' ' + sentence).trim().length <= maxLength) {
        currentChunk = (currentChunk + ' ' + sentence).trim();
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    return chunks;
  }, []);

  /**
   * Speak a single chunk with WebView optimizations
   */
  const speakChunk = useCallback((
    text: string,
    voice: SpeechSynthesisVoice | null,
    rate: number,
    pitch: number,
    volume: number
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        // Cancel any existing speech
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utteranceRef.current = utterance;
        
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = 'hi-IN';
        }
        
        utterance.rate = Math.max(0.5, Math.min(2, rate));
        utterance.pitch = Math.max(0, Math.min(2, pitch));
        utterance.volume = Math.max(0, Math.min(1, volume));

        // WebView compatibility: Force resume if paused
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        utterance.onend = () => {
          resolve();
        };

        utterance.onerror = (event) => {
          console.warn('TTS chunk error:', event.error);
          // Don't reject on 'interrupted' or 'canceled' - these are normal
          if (event.error === 'interrupted' || event.error === 'canceled') {
            resolve();
          } else {
            reject(new Error(event.error));
          }
        };

        window.speechSynthesis.speak(utterance);

        // Chrome/WebView 15-second timeout fix
        if (keepAliveRef.current) {
          clearInterval(keepAliveRef.current);
        }
        keepAliveRef.current = setInterval(() => {
          if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }, []);

  /**
   * Main speak function - WebView optimized
   */
  const speak = useCallback(async (options: TTSOptions): Promise<void> => {
    const { text, lang = 'hi-IN', rate = 0.9, pitch = 1.0, volume = 1.0 } = options;
    
    if (!isSupported) {
      console.log('TTS: Not supported on this device');
      return;
    }

    const cleanText = sanitizeText(text);
    if (!cleanText) return;

    setIsSpeaking(true);
    retryCountRef.current = 0;

    try {
      const voice = getBestVoice();
      const chunks = splitTextIntoChunks(cleanText);
      
      console.log(`TTS: Speaking ${chunks.length} chunks with voice: ${voice?.name || 'default'}`);

      for (let i = 0; i < chunks.length; i++) {
        await speakChunk(chunks[i], voice, rate, pitch, volume);
        
        // Small delay between chunks for stability
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
    } catch (error) {
      console.error('TTS Error:', error);
      
      // Retry with English voice if Hindi fails
      if (retryCountRef.current < 1) {
        retryCountRef.current++;
        console.log('TTS: Retrying with English fallback...');
        
        try {
          const englishVoice = availableVoices.find(v => v.lang.startsWith('en')) || null;
          const shortText = cleanText.substring(0, 100);
          await speakChunk(shortText, englishVoice, rate, pitch, volume);
        } catch (retryError) {
          console.error('TTS Retry failed:', retryError);
        }
      }
    } finally {
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
      setIsSpeaking(false);
    }
  }, [isSupported, sanitizeText, getBestVoice, splitTextIntoChunks, speakChunk, availableVoices]);

  /**
   * Stop any ongoing speech
   */
  const stop = useCallback(async () => {
    try {
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
      
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch (error) {
      console.error('Stop TTS Error:', error);
    } finally {
      setIsSpeaking(false);
    }
  }, []);

  /**
   * Check if currently speaking
   */
  const checkSpeaking = useCallback((): boolean => {
    if ('speechSynthesis' in window) {
      return window.speechSynthesis.speaking;
    }
    return isSpeaking;
  }, [isSpeaking]);

  /**
   * Test if TTS actually works on this device
   */
  const testTTS = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    
    try {
      const testUtterance = new SpeechSynthesisUtterance('test');
      testUtterance.volume = 0.01; // Nearly silent
      testUtterance.rate = 2; // Fast
      
      return new Promise((resolve) => {
        testUtterance.onend = () => resolve(true);
        testUtterance.onerror = () => resolve(false);
        
        window.speechSynthesis.speak(testUtterance);
        
        // Timeout fallback
        setTimeout(() => {
          window.speechSynthesis.cancel();
          resolve(false);
        }, 3000);
      });
    } catch {
      return false;
    }
  }, [isSupported]);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
    isNative,
    availableVoices,
    checkSpeaking,
    sanitizeText,
    testTTS,
  };
};

export default useNativeTTS;
