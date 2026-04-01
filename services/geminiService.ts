
import { GoogleGenAI, Type } from "@google/genai";

export const getGeminiAssistance = async (prompt: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are an academic assistant for the Peer E-Tutoring App. Help users draft messages, explain concepts simply, or structure tutoring session goals. Keep responses concise and professional.",
      }
    });
    return response.text || "I'm sorry, I couldn't generate a response at this time.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "I am currently unavailable. Please try again later.";
  }
};
