import axios from 'axios';
import cron from 'node-cron';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { connectDB } from '../config/db.js';
import { Account } from '../models/Account.js';
import { Post } from '../models/Post.js';

/**
 * Generate a smart, contextual, and engaging LinkedIn comment reply using AI
 */
export async function generateAIReply({ postTopic, postContent, commenterName, commentText }) {
    const prompt = `
You are the author of a professional LinkedIn post. Someone commented on your post, and you want to write a genuine, thoughtful, and engaging reply.

Post Topic: ${postTopic || 'Industry Insight'}
Post Snippet: ${(postContent || '').slice(0, 300)}
Commenter: ${commenterName || 'A professional'}
Comment: "${commentText}"

Instructions:
1. Write a natural, personalized 1-3 sentence response.
2. Be appreciative, courteous, and professionally engaging.
3. If they asked a question or shared an opinion, address their specific point directly with insight.
4. Do NOT sound like an automated robotic bot. Keep it conversational, warm, and authentic.
5. Return ONLY the reply text directly (no greetings like "Subject:", no quotes, no markdown headers).
`;

    // 1. Try Google Gemini AI
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && !geminiKey.includes('your_')) {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const models = [
            'gemini-2.5-flash',
            'gemini-flash-latest',
            'gemini-flash-lite-latest',
            'gemini-2.5-flash-lite'
        ];

        for (const model of models) {
            try {
                const res = await ai.models.generateContent({
                    model,
                    contents: prompt
                });
                const reply = res.text?.trim();
                if (reply && reply.length > 5) {
                    console.log(`🤖 [AI Auto-Reply] Generated reply via Gemini (${model})`);
                    return reply.replace(/^["']|["']$/g, '').trim();
                }
            } catch (err) {
                continue;
            }
        }
    }

    // 2. Try OpenAI fallback
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && !openaiKey.includes('your_')) {
        try {
            const openai = new OpenAI({ apiKey: openaiKey });
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 150
            });
            const reply = completion.choices?.[0]?.message?.content?.trim();
            if (reply) {
                console.log(`🤖 [AI Auto-Reply] Generated reply via OpenAI`);
                return reply.replace(/^["']|["']$/g, '').trim();
            }
        } catch (_) {}
    }

    // 3. Fallback human response
    return `Thank you for sharing your thoughts! Really appreciate your perspective on this. Let's keep the conversation going!`;
}

/**
 * Fetch all comments on a LinkedIn post
 */
export async function fetchLinkedInComments({ targetUrn, token }) {
    if (!targetUrn || !token) return [];

    const encodedUrn = encodeURIComponent(targetUrn);

    // Method 1: LinkedIn v2 socialActions comments API
    try {
        const res = await axios.get(`https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'X-Restli-Protocol-Version': '2.0.0'
            },
            timeout: 10000
        });

        const elements = res.data?.elements || [];
        return elements.map((item) => ({
            id: item['$URN'] || item.created?.time?.toString() || `comment_${Date.now()}`,
            actor: item.actor || item.created?.actor || '',
            text: item.message?.text || item.message || '',
            createdAt: item.created?.time || Date.now()
        }));
    } catch (v2Err) {
        console.warn('ℹ️ [LinkedIn] v2 comments fetch attempt:', v2Err.response?.data?.message || v2Err.message);
    }

    // Method 2: LinkedIn REST API with version fallback
    const versionsToTry = ['202502', '202501', '202412', '202411', '202410'];
    for (const ver of versionsToTry) {
        try {
            const res = await axios.get(`https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'LinkedIn-Version': ver,
                    'X-Restli-Protocol-Version': '2.0.0'
                },
                timeout: 10000
            });

            const elements = res.data?.elements || [];
            return elements.map((item) => ({
                id: item['$URN'] || item.id || `comment_${Date.now()}`,
                actor: item.actor || '',
                text: item.message?.text || '',
                createdAt: item.createdAt || Date.now()
            }));
        } catch (restErr) {
            if (restErr.response?.status === 403) {
                console.warn('⚠️ [LinkedIn] Comments read requires r_member_social permission on your token.');
                break;
            }
            if (restErr.response?.status === 426 || restErr.response?.data?.code === 'NONEXISTENT_VERSION') {
                continue;
            }
            break;
        }
    }

    return [];
}

/**
 * Post a comment reply back to LinkedIn
 */
export async function postLinkedInReply({ targetUrn, token, authorUrn, replyText, parentCommentUrn }) {
    const encodedUrn = encodeURIComponent(targetUrn);

    // Method 1: LinkedIn v2 socialActions POST
    try {
        const payload = {
            actor: authorUrn,
            message: {
                text: replyText
            }
        };

        if (parentCommentUrn) {
            payload.parentComment = parentCommentUrn;
        }

        const res = await axios.post(`https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments`, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                'X-Restli-Protocol-Version': '2.0.0',
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log(`✅ [LinkedIn] Comment reply posted successfully! (URN: ${res.data?.['$URN'] || 'OK'})`);
        return { success: true, id: res.data?.['$URN'] || `reply_${Date.now()}` };
    } catch (v2Err) {
        console.warn('ℹ️ [LinkedIn] v2 reply post attempt failed, trying REST endpoint...', v2Err.response?.data || v2Err.message);
    }

    // Method 2: LinkedIn REST API with version fallback
    const versionsToTry = ['202502', '202501', '202412', '202411', '202410'];
    let lastError = null;

    for (const ver of versionsToTry) {
        try {
            const restPayload = {
                actor: authorUrn,
                message: {
                    text: replyText
                }
            };

            const res = await axios.post(`https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments`, restPayload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'LinkedIn-Version': ver,
                    'X-Restli-Protocol-Version': '2.0.0',
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            console.log(`✅ [LinkedIn REST] Comment reply posted successfully with version ${ver}!`);
            return { success: true, id: res.data?.id || `reply_${Date.now()}` };
        } catch (restErr) {
            lastError = restErr;
            if (restErr.response?.status === 426 || restErr.response?.data?.code === 'NONEXISTENT_VERSION') {
                continue;
            }
            break;
        }
    }

    const errMsg = lastError?.response?.data?.message || lastError?.message || 'Failed to post comment reply';
    console.error('❌ [LinkedIn] Failed to post comment reply:', errMsg);
    return { success: false, error: errMsg };
}

/**
 * Manually submit a comment reply using AI or custom text
 */
export async function replyToCommentManual({ postId, linkedinPostUrn, commentText, customReplyText, commenterName, parentCommentUrn }) {
    await connectDB();
    let post = null;
    if (postId) {
        try {
            post = await Post.findById(postId);
        } catch (_) {}
    }

    const account = await Account.findOne({ platform: 'linkedin', isConnected: true });
    const token = account?.accessToken || process.env.LINKEDIN_ACCESS_TOKEN;
    const authorUrn = account?.accountUrn || process.env.LINKEDIN_PERSON_URN;

    let targetUrn = (linkedinPostUrn || '').trim();
    if (!targetUrn && post) {
        targetUrn = post.publishResult?.linkedin?.postId || '';
    }

    if (targetUrn) {
        // Support direct LinkedIn URLs: extract URN
        const urnMatch = targetUrn.match(/urn:li:(?:share|ugcPost|activity):[0-9]+/i);
        if (urnMatch) {
            targetUrn = urnMatch[0];
        }
    }

    if (!targetUrn) throw new Error('Target LinkedIn Post ID or URN is required.');
    if (!token || !authorUrn) throw new Error('LinkedIn is not connected.');

    // 1. Generate AI Reply if custom text not provided
    const aiReply = customReplyText?.trim() || await generateAIReply({
        postTopic: post?.research?.topic || post?.niche || 'Professional Discussion',
        postContent: post?.content?.linkedin || post?.content?.twitter || '',
        commenterName: commenterName || 'LinkedIn User',
        commentText: commentText || 'Great post!'
    });

    // 2. Post reply to LinkedIn
    const postRes = await postLinkedInReply({
        targetUrn,
        token,
        authorUrn,
        replyText: aiReply,
        parentCommentUrn
    });

    if (!postRes.success) {
        throw new Error(postRes.error || 'Failed to post reply to LinkedIn');
    }

    const replyRecord = {
        commentId: parentCommentUrn || `manual_${Date.now()}`,
        commentText: commentText || 'User Comment',
        replyText: aiReply,
        targetUrn,
        commenterName: commenterName || 'LinkedIn User',
        repliedAt: new Date()
    };

    if (post) {
        await Post.findByIdAndUpdate(post._id, {
            $push: { repliedComments: replyRecord }
        });
    }

    return {
        success: true,
        replyText: aiReply,
        targetUrn,
        record: replyRecord
    };
}

/**
 * Scan a specific post, detect new comments, generate AI replies, and publish
 */
export async function processPostComments(post, account) {
    const linkedinPostId = post.publishResult?.linkedin?.postId;
    if (!linkedinPostId) return { checked: false, reason: 'No LinkedIn post ID' };

    const token = account?.accessToken || process.env.LINKEDIN_ACCESS_TOKEN;
    const authorUrn = account?.accountUrn || process.env.LINKEDIN_PERSON_URN;

    if (!token || !authorUrn) {
        return { checked: false, reason: 'No LinkedIn credentials' };
    }

    console.log(`🔍 [Auto-Reply] Scanning comments for LinkedIn Post: ${linkedinPostId}...`);
    const comments = await fetchLinkedInComments({ targetUrn: linkedinPostId, token });

    if (!comments || comments.length === 0) {
        return { checked: true, newReplies: 0, message: 'No comments found' };
    }

    const alreadyRepliedIds = new Set(
        (post.repliedComments || []).map((r) => r.commentId)
    );

    let repliesCount = 0;
    const newRepliesList = [];

    for (const comment of comments) {
        // Skip empty comments
        if (!comment.text || !comment.text.trim()) continue;

        // Skip if already replied
        if (alreadyRepliedIds.has(comment.id)) continue;

        // Skip if author themselves wrote the comment (don't reply to self)
        if (comment.actor && comment.actor.toLowerCase() === authorUrn.toLowerCase()) continue;

        console.log(`💬 [Auto-Reply] New comment found: "${comment.text.slice(0, 50)}..." by ${comment.actor}`);

        // 1. Generate contextual AI reply with Gemini
        const aiReply = await generateAIReply({
            postTopic: post.research?.topic || post.niche,
            postContent: post.content?.linkedin || post.content?.twitter,
            commenterName: 'Community Member',
            commentText: comment.text
        });

        // 2. Post reply to LinkedIn
        const postResult = await postLinkedInReply({
            targetUrn: linkedinPostId,
            token,
            authorUrn,
            replyText: aiReply,
            parentCommentUrn: comment.id
        });

        if (postResult.success) {
            const replyRecord = {
                commentId: comment.id,
                commentText: comment.text,
                replyText: aiReply,
                repliedAt: new Date()
            };

            await Post.findByIdAndUpdate(post._id, {
                $push: { repliedComments: replyRecord }
            });

            alreadyRepliedIds.add(comment.id);
            repliesCount++;
            newRepliesList.push(replyRecord);
            console.log(`🎉 [Auto-Reply] Replied to comment ${comment.id}: "${aiReply.slice(0, 60)}..."`);
        }
    }

    return {
        checked: true,
        commentsTotal: comments.length,
        newReplies: repliesCount,
        replies: newRepliesList
    };
}

let isScanning = false;

/**
 * Scan all recently published LinkedIn posts and auto-reply to any new comments
 */
export async function autoReplyAllRecentLinkedInPosts() {
    if (isScanning) {
        return { success: false, reason: 'Previous comment scan still running' };
    }

    isScanning = true;
    try {
        await connectDB();
        const account = await Account.findOne({ platform: 'linkedin', isConnected: true });
        if (!account && !process.env.LINKEDIN_ACCESS_TOKEN) {
            return { success: false, reason: 'LinkedIn not connected' };
        }

        // Fetch posts from last 14 days that have a LinkedIn post ID
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const posts = await Post.find({
            status: 'published',
            'publishResult.linkedin.postId': { $exists: true, $ne: '' },
            createdAt: { $gte: fourteenDaysAgo }
        }).sort({ createdAt: -1 });

        if (posts.length === 0) {
            return { success: true, postsChecked: 0, totalNewReplies: 0 };
        }

        let totalNewReplies = 0;
        const processedPosts = [];

        for (const post of posts) {
            const res = await processPostComments(post, account);
            if (res.newReplies > 0) {
                totalNewReplies += res.newReplies;
            }
            processedPosts.push({
                postId: post._id,
                linkedinId: post.publishResult?.linkedin?.postId,
                ...res
            });
        }

        if (totalNewReplies > 0) {
            console.log(`🎉 [Auto-Reply Scheduler] Real-time Scan: Successfully posted ${totalNewReplies} new AI reply(s) live on LinkedIn!`);
        }

        return {
            success: true,
            postsChecked: posts.length,
            totalNewReplies,
            details: processedPosts
        };
    } catch (err) {
        console.error('❌ [Auto-Reply Scheduler] Error during auto-reply execution:', err.message);
        return { success: false, error: err.message };
    } finally {
        isScanning = false;
    }
}

/**
 * Initialize Background Cron Job (Runs every 1 minute)
 */
let cronJob = null;
export function startAutoReplyCron() {
    if (cronJob) return;

    // Run every 1 minute: '* * * * *'
    cronJob = cron.schedule('* * * * *', async () => {
        await autoReplyAllRecentLinkedInPosts();
    });

    console.log('⚡ [Cron] LinkedIn AI Auto-Reply active: Checking for new comments EVERY 1 MINUTE!');

    // Run initial scan 5 seconds after startup
    setTimeout(() => {
        autoReplyAllRecentLinkedInPosts().catch(() => {});
    }, 5000);
}

/**
 * Preview and analyze a comment before publishing
 */
export async function previewCommentReply({ postId, commentText, postTopic, postContent }) {
    await connectDB();
    let topic = postTopic || 'Industry Insight';
    let snippet = postContent || '';

    if (postId) {
        try {
            const post = await Post.findById(postId);
            if (post) {
                topic = post.research?.topic || post.niche || topic;
                snippet = post.content?.linkedin || post.content?.twitter || snippet;
            }
        } catch (_) {}
    }

    const prompt = `
You are the author of a professional LinkedIn post.
Post Topic: ${topic}
Post Snippet: ${snippet.slice(0, 300)}
User Comment: "${commentText}"

Analyze the comment and generate:
1. Primary AI Reply (1-2 sentences, natural, engaging, professional).
2. Alternative Reply (more conversational / thoughtful).
3. Sentiment (one word: "Positive", "Curious", "Question", "Constructive", or "Praise").

Return raw JSON only:
{
  "sentiment": "Positive",
  "primaryReply": "reply here",
  "alternateReply": "alternate reply here"
}
`;

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && !geminiKey.includes('your_')) {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        try {
            const res = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });
            const raw = res.text || '';
            const b1 = raw.indexOf('{');
            const b2 = raw.lastIndexOf('}');
            if (b1 !== -1 && b2 !== -1) {
                const parsed = JSON.parse(raw.slice(b1, b2 + 1));
                return parsed;
            }
        } catch (_) {}
    }

    const fallbackReply = await generateAIReply({
        postTopic: topic,
        postContent: snippet,
        commenterName: 'LinkedIn User',
        commentText
    });

    return {
        sentiment: 'Engaging',
        primaryReply: fallbackReply,
        alternateReply: 'Thank you for your valuable perspective! Glad this resonated with you.'
    };
}
