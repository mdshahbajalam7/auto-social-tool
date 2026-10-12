import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

export async function generateSocialContent({ topic, summary, niche }) {
    console.log(`🤖 [AI Content Generator] Generating real multi-platform copy for "${topic}" in niche "${niche}"...`);

    const prompt = `
You are an insightful industry specialist and social media writer in the field of "${niche}". Write in a natural, authentic, human voice directly about "${topic}". Avoid robotic AI buzzwords or tacky hype.
Topic: ${topic}
Details: ${summary}
Niche: ${niche}

Generate a JSON object with EXACTLY this structure (no markdown fences, raw JSON only):
{
  "twitter": "Concise, insightful tweet under 260 characters written in a genuine human tone with 2 relevant hashtags",
  "linkedin": "Engaging human-written LinkedIn post with clear practical takeaways, authentic highlights, no cheesy cliches, and professional hashtags",
  "instagramCaption": "Clean, human caption with thoughtful points and 4-5 hashtags",
  "facebook": "Conversational, relatable Facebook post sharing this update with community insights",
  "imagePrompt": "A captivating, high-end 3D conceptual illustration specifically representing ${topic} in the ${niche} domain. Describe the visual essence of the subject (e.g. elegant financial growth symbols and gold crystal assets for finance, futuristic vehicles for automotive, clean modern concepts for lifestyle), cinematic studio lighting, vibrant color palette, and premium aesthetic. CRITICAL: Strictly NO text, NO letters, NO words, NO computer screens with text, NO blackboards, NO code, 100% clean visual design."
}
`;

    // 1. Try Google Gemini across available models
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && !geminiKey.includes('your_')) {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const models = [
            'gemini-2.5-flash',
            'gemini-flash-latest',
            'gemini-flash-lite-latest',
            'gemini-2.5-flash-lite',
            'gemini-3.5-flash',
            'gemini-3.7-flash',
            'gemini-3.8-flash'
        ];

        for (const modelName of models) {
            try {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt,
                });

                const rawText = response.text || '';
                const firstBrace = rawText.indexOf('{');
                const lastBrace = rawText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    const jsonSub = rawText.slice(firstBrace, lastBrace + 1);
                    const parsed = JSON.parse(jsonSub);
                    console.log(`✅ [AI Generator] Real AI content generated via Google Gemini (${modelName})!`);
                    return parsed;
                }
            } catch (err) {
                console.warn(`ℹ️ Model ${modelName} attempt:`, err.message?.slice(0, 80));
                continue;
            }
        }
    }

    // 2. Try OpenAI API
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && !openaiKey.includes('your_')) {
        try {
            const openai = new OpenAI({ apiKey: openaiKey });
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a social media copywriter. Output only valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' }
            });

            const content = completion.choices[0]?.message?.content;
            if (content) {
                console.log('✅ [AI Generator] Real AI content generated via OpenAI (gpt-4o-mini)!');
                return JSON.parse(content);
            }
        } catch (err) {
            console.warn('ℹ️ OpenAI chat unavailable:', err.message);
        }
    }

    // 3. Live Generative AI API (Pollinations Multi-Model LLM)
    try {
        console.log('🤖 [AI Generator] Calling Pollinations Generative LLM API for live AI generation...');
        const res = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content: 'You are an elite multi-channel social media marketing strategist. Output ONLY raw JSON matching schema without any markdown backticks.'
                    },
                    { role: 'user', content: prompt }
                ],
                jsonMode: true
            })
        });

        if (res.ok) {
            const rawText = await res.text();
            const firstBrace = rawText.indexOf('{');
            const lastBrace = rawText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                const parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
                if (parsed.twitter && parsed.linkedin) {
                    console.log('✅ [AI Generator] Real AI social posts successfully generated via Pollinations LLM API!');
                    return {
                        twitter: parsed.twitter,
                        linkedin: parsed.linkedin,
                        instagramCaption: parsed.instagramCaption || parsed.twitter,
                        facebook: parsed.facebook || parsed.linkedin,
                        imagePrompt: parsed.imagePrompt || `Ultra realistic 8k digital artwork illustrating ${topic}, cinematic lighting, photorealistic 3D render`
                    };
                }
            }
        }
    } catch (pollErr) {
        console.warn('ℹ️ Pollinations AI text API error:', pollErr.message);
    }

    // 4. Dynamic authentic topic-aligned copy (failsafe)
    console.log('ℹ️ Generating authentic bespoke copy for topic...');
    const tag = (niche || 'Tech').replace(/[^a-zA-Z0-9]/g, '');
    return {
        twitter: `💡 Insight on ${topic}:\n\n${summary?.slice(0, 180) || 'Exciting shifts underway with major performance implications.'}\n\n#${tag} #Innovation #Future`,
        linkedin: `🚀 Deep Dive: ${topic}\n\n${summary || 'Rapid acceleration in modernization and smart ecosystem workflows.'}\n\nKey Strategic Takeaways:\n• Tangible performance improvements and modernized architecture.\n• Broadening industry adoption and faster deployment velocity.\n\nWhat are your thoughts on this direction? Would love to hear your insights!\n\n#${tag} #Engineering #Leadership`,
        instagramCaption: `✨ Exploring the latest in ${niche}:\n\n"${topic}"\n\n${summary || 'Key shifts shaping tomorrow’s technology.'}\n\nSave this for later & share your perspective below! 💬\n\n#${tag.toLowerCase()} #insights #innovation #future`,
        facebook: `📢 Important update in ${niche}:\n\n${topic}\n\n${summary || 'Significant enhancements are taking shape across the board.'}\n\nHow do you see this impacting your daily workflow? Let us know below! 👇\n\n#${tag} #Updates #IndustryNews`,
        imagePrompt: `A high-impact 3D modern tech hero banner specifically illustrating ${topic} in ${niche}, glowing data pipelines, octane render 8k, cinematic lighting, ultra-sharp detail, no watermark.`
    };
}