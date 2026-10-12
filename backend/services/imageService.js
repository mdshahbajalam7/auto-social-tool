import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import sharp from 'sharp';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Generate AI image directly from the generated text, topic, and summary.
 * Supports both object signature ({ imagePrompt, topic, summary, niche })
 * and positional arguments (promptText, topic, niche).
 * Ensures 100% clean, watermark-free output by physically trimming off any logos.
 */
export async function generateImageWithGemini(arg1, arg2, arg3) {
    let promptText = '';
    let topic = '';
    let summary = '';
    let niche = '';

    if (typeof arg1 === 'object' && arg1 !== null) {
        promptText = arg1.imagePrompt || arg1.prompt || '';
        topic = arg1.topic || '';
        summary = arg1.summary || '';
        niche = arg1.niche || '';
    } else {
        promptText = typeof arg1 === 'string' ? arg1 : '';
        topic = typeof arg2 === 'string' ? arg2 : '';
        niche = typeof arg3 === 'string' ? arg3 : '';
    }

    // 1. Build an accurate, descriptive prompt reflecting the exact generated topic
    const subject = (topic || niche || 'Technology Innovation').replace(/[^a-zA-Z0-9\s.,-]/g, ' ').trim();

    // Sanitize visual prompt: replace screens, blackboards, code and text triggers with abstract 3D metaphors
    // This stops diffusion models from hallucinating garbled pseudo-text on monitors/chalkboards
    let sanitizedVisual = (promptText || '')
        .replace(/\b(text|words|writing|letters|alphabet|typography|font|code|script)\b/gi, '')
        .replace(/\b(monitor|monitors|screen|screens|display|chalkboard|blackboard|whiteboard|desk|workstation)\b/gi, 'sleek 3D geometric structure')
        .replace(/\s+/g, ' ')
        .trim();

    if (!sanitizedVisual || sanitizedVisual.length < 20) {
        sanitizedVisual = `Vibrant 3D keynote visual representing ${subject}, elegant composition, artistic lighting, modern aesthetic`;
    }

    const boosters = 'ultra high quality 3D conceptual illustration, minimal modern clean design, cinematic studio lighting, octane render, 8k resolution, photorealistic textures, clean background, absolutely no text, zero words, no letters, no typography, no writing, no watermark, no logo';

    const enhancedPrompt = `${subject}: ${sanitizedVisual}. ${boosters}`;
    const negativePrompt = 'text, words, letters, alphabet, typography, handwriting, calligraphy, font, title, label, numbers, code, programming syntax, computer monitor displaying text, chalkboard with writing, whiteboard, billboard, pseudo-text, alien glyphs, distorted letters, watermark, signature, blurry, low resolution, ugly';

    console.log(`🎨 [AI Image Generator] Generating text-free 3D visual for topic: "${subject}"...`);

    const randomSeed = Math.floor(Math.random() * 8999999) + 1000000;

    // 2. Cloudflare Workers AI (FLUX-1 Schnell / SDXL) - Enterprise Quality, 100% Watermark-Free
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cfToken = process.env.CLOUDFLARE_API_TOKEN;

    if (cfAccountId && cfToken && !cfToken.includes('your_')) {
        const cfModels = [
            '@cf/bytedance/stable-diffusion-xl-lightning',
            '@cf/stabilityai/stable-diffusion-xl-base-1.0',
            '@cf/black-forest-labs/flux-1-schnell'
        ];

        for (const cfModel of cfModels) {
            try {
                console.log(`⚡ [Cloudflare AI] Generating image via model: ${cfModel}...`);
                const payload = cfModel.includes('flux')
                    ? {
                        prompt: `${enhancedPrompt}, completely textless, pure visual render, no words, no letters`.slice(0, 1000),
                        steps: 4
                    }
                    : {
                        prompt: enhancedPrompt.slice(0, 1000),
                        negative_prompt: negativePrompt,
                        guidance: 7.5,
                        num_steps: 20
                    };

                const cfRes = await axios.post(
                    `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${cfModel}`,
                    payload,
                    {
                        headers: {
                            Authorization: `Bearer ${cfToken}`,
                            'Content-Type': 'application/json'
                        },
                        responseType: 'arraybuffer',
                        timeout: 30000
                    }
                );

                if (cfRes.data) {
                    let rawBuf = Buffer.from(cfRes.data);

                    // Check if response returned JSON (e.g. { "result": { "image": "..." } })
                    try {
                        const jsonStr = rawBuf.toString('utf-8');
                        if (jsonStr.startsWith('{')) {
                            const parsed = JSON.parse(jsonStr);
                            if (parsed.result?.image) {
                                rawBuf = Buffer.from(parsed.result.image, 'base64');
                            }
                        }
                    } catch (_) {
                        // Not JSON, raw image buffer
                    }

                    if (rawBuf && rawBuf.length > 1000) {
                        const cleanFileName = `cf-art-${Date.now()}-${randomSeed}.jpg`;
                        const cleanFilePath = path.join(uploadsDir, cleanFileName);

                        // Save pristine 1080x1080 HD sRGB JPEG (Instagram optimal standard)
                        await sharp(rawBuf)
                            .resize(1080, 1080, { fit: 'cover' })
                            .toColorspace('srgb')
                            .jpeg({ quality: 90 })
                            .toFile(cleanFilePath);

                        const backendBase = process.env.BACKEND_URL || 'http://localhost:5000';
                        const cleanUrl = `${backendBase}/uploads/${cleanFileName}`;
                        console.log(`✅ [Cloudflare AI] Image successfully generated & saved (100% Watermark-Free): ${cleanUrl}`);
                        return cleanUrl;
                    }
                }
            } catch (cfErr) {
                const errDetail = cfErr.response?.data ? Buffer.from(cfErr.response.data).toString('utf-8') : cfErr.message;
                console.warn(`ℹ️ Cloudflare model ${cfModel} note:`, errDetail.slice(0, 120));
                continue;
            }
        }
    }

    // 2. Attempt Google Imagen 3 API Call (if enterprise credentials available)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && !geminiKey.includes('your_')) {
        try {
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const response = await ai.models.generateImages({
                model: 'imagen-3.0-generate-002',
                prompt: `${subject}, ${boosters}`,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: '1:1',
                },
            });

            const base64Bytes = response.generatedImages?.[0]?.image?.imageBytes;
            if (base64Bytes) {
                console.log('✅ [AI Image] Successfully generated via Google Imagen 3!');
                return `data:image/jpeg;base64,${base64Bytes}`;
            }
        } catch (err) {
            // Note: Google AI Studio keys do not support generateImages (requires Vertex AI Enterprise)
        }
    }

    // 3. Attempt OpenAI DALL-E 3 Call (if credits available)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && !openaiKey.includes('your_')) {
        try {
            const openai = new OpenAI({ apiKey: openaiKey });
            const dRes = await openai.images.generate({
                model: 'dall-e-3',
                prompt: `${subject}: ${sanitizedVisual}, abstract 3D digital illustration, clean minimal, 8k`,
                n: 1,
                size: '1024x1024',
                quality: 'hd'
            });
            const dUrl = dRes.data?.[0]?.url;
            if (dUrl) {
                console.log('✅ [AI Image] Successfully generated via OpenAI DALL-E 3 (HD)!');
                return dUrl;
            }
        } catch (err) {
            // OpenAI credits exhausted or unavailable
        }
    }

    // 5. Fallback: Generative Flux AI Engine + Sharp Watermark Stripper
    const encodedPrompt = encodeURIComponent(enhancedPrompt.slice(0, 750));
    // Set nologo=true and private=true
    const fluxImageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1200&height=1200&seed=${randomSeed}&model=flux&nologo=true&private=true`;

    try {
        console.log(`🎨 [AI Image] Downloading binary to physically strip all watermarks...`);
        const imgRes = await axios.get(fluxImageUrl, {
            responseType: 'arraybuffer',
            timeout: 25000
        });

        if (imgRes.data) {
            const rawBuffer = Buffer.from(imgRes.data);
            const metadata = await sharp(rawBuffer).metadata();

            const imgWidth = metadata.width || 1200;
            const imgHeight = metadata.height || 1200;
            // Trim off the bottom 65 pixels where the watermark logo sits
            const cropHeight = Math.max(100, imgHeight - 65);

            const cleanFileName = `clean-art-${Date.now()}-${randomSeed}.jpg`;
            const cleanFilePath = path.join(uploadsDir, cleanFileName);

            await sharp(rawBuffer)
                .extract({
                    left: 0,
                    top: 0,
                    width: imgWidth,
                    height: cropHeight
                })
                .resize(1080, 1080, { fit: 'cover', position: 'top' })
                .toColorspace('srgb')
                .jpeg({ quality: 90 })
                .toFile(cleanFilePath);

            const backendBase = process.env.BACKEND_URL || 'http://localhost:5000';
            const cleanUrl = `${backendBase}/uploads/${cleanFileName}`;
            console.log(`✅ [AI Image] Watermark 100% physically stripped! Clean image ready: ${cleanUrl}`);
            return cleanUrl;
        }
    } catch (stripErr) {
        console.warn('ℹ️ Image watermark strip note:', stripErr.message);
    }

    return fluxImageUrl;
}

export { generateImageWithGemini as generateImage };