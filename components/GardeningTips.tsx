
import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { API_KEY } from '../constants';

interface PlantTip {
  name: string;
  type: string;
  tip: string;
}

const GardeningTips: React.FC = () => {
  const [tips, setTips] = useState<PlantTip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGardeningTips = async () => {
    try {
      const month = new Date().toLocaleString('default', { month: 'long' });
      const ai = new GoogleGenAI({ apiKey: API_KEY! });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `What are 3 specific plants (vegetables or flowers) to plant right now in the Kapiti Coast, New Zealand during the month of ${month}? Consider the sandy soil and maritime climate. Return only a JSON array of objects with keys: name, type (Veggie/Flower), and tip (brief advice).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                type: { type: Type.STRING },
                tip: { type: Type.STRING }
              },
              required: ["name", "type", "tip"]
            }
          }
        }
      });
      
      setTips(JSON.parse(response.text));
    } catch (err) {
      console.error("Gardening fetch failed", err);
      // Fallback tips
      setTips([
        { name: "Silverbeet", type: "Veggie", tip: "Extremely hardy in Kapiti wind." },
        { name: "Calendula", type: "Flower", tip: "Great for sandy coastal soils." },
        { name: "Broad Beans", type: "Veggie", tip: "Stake them well against the nor'westers." }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGardeningTips();
  }, []);

  return (
    <div className="bg-emerald-50 rounded-[2rem] p-6 border border-emerald-100 shadow-sm overflow-hidden relative">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-emerald-700 flex items-center gap-2">
           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" /></svg>
           Kāpiti Garden
        </h3>
        <span className="text-[10px] font-bold text-emerald-600 bg-white/50 px-2 py-0.5 rounded-full uppercase">
          {new Date().toLocaleString('default', { month: 'long' })}
        </span>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-emerald-100 rounded w-3/4"></div>
            <div className="h-4 bg-emerald-100 rounded w-full"></div>
            <div className="h-4 bg-emerald-100 rounded w-2/3"></div>
          </div>
        ) : (
          tips.map((plant, i) => (
            <div key={i} className="bg-white/60 backdrop-blur-sm p-3 rounded-2xl border border-emerald-100/50 hover:bg-white transition-colors">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-black text-emerald-800">{plant.name}</span>
                <span className="text-[8px] font-bold uppercase tracking-tighter text-emerald-500">{plant.type}</span>
              </div>
              <p className="text-[10px] text-emerald-700 leading-tight italic">{plant.tip}</p>
            </div>
          ))
        )}
      </div>

      {/* Subtle organic shape deco */}
      <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-emerald-200/20 rounded-full blur-xl"></div>
    </div>
  );
};

export default GardeningTips;
