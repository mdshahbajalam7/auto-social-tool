import axios from 'axios';
import cron from 'node-cron';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
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

    // Method 2: LinkedIn REST API fallback
    try {
        const res = await axios.get(`https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'LinkedIn-Version': '202502',
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
        console.warn('ℹ️ [LinkedIn] REST comments fetch attempt:', restErr.response?.data?.message || restErr.message);
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

    // Method 2: LinkedIn REST API fallback
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
                'LinkedIn-Version': '202502',
                'X-Restli-Protocol-Version': '2.0.0',
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log(`✅ [LinkedIn REST] Comment reply posted successfully!`);
        return { success: true, id: res.data?.id || `reply_${Date.now()}` };
    } catch (restErr) {
        const errMsg = restErr.response?.data?.message || restErr.message;
        console.error('❌ [LinkedIn] Failed to post comment reply:', errMsg);
        return { success: false, error: errMsg };
    }
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

/**
 * Scan all recently published LinkedIn posts and auto-reply to any new comments
 */
export async function autoReplyAllRecentLinkedInPosts() {
    try {
        const account = await Account.findOne({ platform: 'linkedin', isConnected: true });
        if (!account && !process.env.LINKEDIN_ACCESS_TOKEN) {
            console.log('ℹ️ [Auto-Reply] LinkedIn is not connected, skipping scan.');
            return { success: false, reason: 'LinkedIn not connected' };
        }

        // Fetch posts from last 14 days that have a LinkedIn post ID
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const posts = await Post.find({
            status: 'published',
            'publishResult.linkedin.postId': { $exists: true, $ne: '' },
            createdAt: { $gte: fourteenDaysAgo }
        }).sort({ createdAt: -1 });

        console.log(`🚀 [Auto-Reply Scheduler] Checking ${posts.length} published LinkedIn post(s) for comments...`);

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

        console.log(`✅ [Auto-Reply Scheduler] Check complete. Total new AI replies sent: ${totalNewReplies}`);
        return {
            success: true,
            postsChecked: posts.length,
            totalNewReplies,
            details: processedPosts
        };
    } catch (err) {
        console.error('❌ [Auto-Reply Scheduler] Error during auto-reply execution:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Initialize Background Cron Job (Runs every 10 minutes)
 */
let cronJob = null;
export function startAutoReplyCron() {
    if (cronJob) return;

    // Run every 10 minutes: '*/10 * * * *'
    cronJob = cron.schedule('*/10 * * * *', async () => {
        console.log('⏰ [Cron] Triggering automatic LinkedIn comment scan & reply...');
        await autoReplyAllRecentLinkedInPosts();
    });

    console.log('⏰ [Cron] LinkedIn AI Auto-Reply background scheduler active (runs every 10 minutes)!');
}
