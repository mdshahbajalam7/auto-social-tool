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
    const cleanName = commenterName && !['A professional', 'LinkedIn Member', 'LinkedIn User'].includes(commenterName.trim())
        ? commenterName.trim()
        : '';

    const prompt = `
You are the author of a professional LinkedIn post. A user commented on your post, and you need to reply directly to their comment.

Post Topic: ${postTopic || 'Industry Insight'}
Post Snippet: ${(postContent || '').slice(0, 300)}
Commenter Name: ${cleanName || 'Community Member'}
User's Comment: "${commentText}"

Instructions:
1. Write a natural, personalized 1-3 sentence reply directly answering their comment.
2. ${cleanName ? `Address ${cleanName} warmly by first name (e.g. "Thanks ${cleanName}!", "Great question, ${cleanName}!").` : 'Start with a warm, professional greeting.'}
3. Answer or build upon their specific question, opinion, or feedback with real insight.
4. Keep it conversational, warm, and authentic — do NOT sound like a generic robotic bot.
5. Return ONLY the reply text directly (no quotes, no subject line, no markdown).
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
 * Parse LinkedIn comment URL or URN to extract postUrn and commentUrn
 */
export function parseLinkedInCommentUrl(input, fallbackPostUrn = '') {
    if (!input || typeof input !== 'string') return { postUrn: null, commentUrn: null };
    let decoded = input.trim();
    try {
        decoded = decodeURIComponent(decoded);
    } catch (_) {}

    let commentUrn = null;
    let postUrn = null;

    // 1. Extract Post URN (activity, share, ugcPost)
    const postMatch = decoded.match(/urn:li:(?:activity|share|ugcPost):[0-9]+/i);
    if (postMatch) {
        postUrn = postMatch[0];
    } else {
        const actNumMatch = decoded.match(/activity:([0-9]+)/i);
        if (actNumMatch) {
            postUrn = `urn:li:activity:${actNumMatch[1]}`;
        }
    }

    const effectivePostUrn = postUrn || fallbackPostUrn || '';

    // 2. Format A: Modern fsd_comment (e.g. urn:li:fsd_comment:(7515364667288973313,urn:li:activity:7515363685549211649))
    const fsdMatch = decoded.match(/fsd_comment:\(([0-9]+),([^)]+)\)/i);
    if (fsdMatch) {
        const commentId = fsdMatch[1];
        let actUrn = fsdMatch[2].trim();
        if (!actUrn.startsWith('urn:li:')) actUrn = `urn:li:${actUrn}`;
        commentUrn = `urn:li:comment:(${actUrn},${commentId})`;
        if (!postUrn) postUrn = actUrn;
    }

    // 3. Format B: Standard composite comment (e.g. urn:li:comment:(urn:li:activity:123,456) or urn:li:comment:(activity:123,456))
    if (!commentUrn) {
        const compMatch = decoded.match(/urn:li:comment:\(([^,]+),([0-9]+)\)/i);
        if (compMatch) {
            let actPart = compMatch[1].trim();
            const commentId = compMatch[2].trim();
            if (!actPart.startsWith('urn:li:')) {
                if (actPart.startsWith('activity:')) actPart = `urn:li:${actPart}`;
                else actPart = `urn:li:activity:${actPart}`;
            }
            commentUrn = `urn:li:comment:(${actPart},${commentId})`;
            if (!postUrn) postUrn = actPart;
        }
    }

    // 4. Format C: Simple comment URN (e.g. urn:li:comment:7515364667288973313)
    if (!commentUrn) {
        const simpleCommentMatch = decoded.match(/urn:li:comment:([0-9]+)/i);
        if (simpleCommentMatch) {
            const commentId = simpleCommentMatch[1];
            if (effectivePostUrn) {
                commentUrn = `urn:li:comment:(${effectivePostUrn},${commentId})`;
            } else {
                commentUrn = `urn:li:comment:${commentId}`;
            }
        }
    }

    // 5. Format D: Pure numeric comment ID (e.g. 7515364667288973313)
    if (!commentUrn && /^[0-9]{15,25}$/.test(decoded)) {
        if (effectivePostUrn) {
            commentUrn = `urn:li:comment:(${effectivePostUrn},${decoded})`;
        } else {
            commentUrn = `urn:li:comment:${decoded}`;
        }
    }

    return { postUrn, commentUrn };
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

        console.log(`✅ [LinkedIn] Comment reply posted successfully! (URN: ${res.data?.['$URN'] || 'OK'}, In-Reply-To: ${parentCommentUrn || 'Top-level'})`);
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

            if (parentCommentUrn) {
                restPayload.parentComment = parentCommentUrn;
            }

            const res = await axios.post(`https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments`, restPayload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'LinkedIn-Version': ver,
                    'X-Restli-Protocol-Version': '2.0.0',
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            console.log(`✅ [LinkedIn REST] Comment reply posted successfully with version ${ver}! (In-Reply-To: ${parentCommentUrn || 'Top-level'})`);
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

    let finalParentComment = (parentCommentUrn || '').trim();

    // If parentCommentUrn is provided (URL, URN, or ID), parse and normalize
    if (finalParentComment) {
        const parsed = parseLinkedInCommentUrl(finalParentComment, targetUrn);
        if (parsed.commentUrn) finalParentComment = parsed.commentUrn;
        if (parsed.postUrn && !targetUrn) targetUrn = parsed.postUrn;
    }

    if (targetUrn && targetUrn.startsWith('http')) {
        const parsed = parseLinkedInCommentUrl(targetUrn);
        if (parsed.postUrn) targetUrn = parsed.postUrn;
        if (parsed.commentUrn && !finalParentComment) finalParentComment = parsed.commentUrn;
    }

    if (targetUrn) {
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

    // 2. Post reply directly to LinkedIn (with parentComment if replying to a specific comment)
    const postRes = await postLinkedInReply({
        targetUrn,
        token,
        authorUrn,
        replyText: aiReply,
        parentCommentUrn: finalParentComment || undefined
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
export async function previewCommentReply({ postId, commentText, commenterName, postTopic, postContent }) {
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

    const cleanName = commenterName && !['A professional', 'LinkedIn Member', 'LinkedIn User'].includes(commenterName.trim())
        ? commenterName.trim()
        : '';

    const prompt = `
You are the author of a professional LinkedIn post. A user commented on your post, and you want to reply directly to their specific comment.

Post Topic: ${topic}
Post Snippet: ${snippet.slice(0, 300)}
Commenter Name: ${cleanName || 'Community Member'}
User Comment: "${commentText}"

Analyze the comment and generate:
1. Primary AI Reply (1-2 sentences, natural, engaging, personalized. ${cleanName ? `Directly address ${cleanName} by name and answer their point.` : 'Directly answer their point with warmth.'}).
2. Alternative Reply (more conversational or punchier, directly addressing the commenter).
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
        commenterName: cleanName || 'LinkedIn User',
        commentText
    });

    return {
        sentiment: 'Engaging',
        primaryReply: fallbackReply,
        alternateReply: cleanName
            ? `Thanks ${cleanName}! Really appreciate your perspective on this.`
            : 'Thank you for your valuable perspective! Glad this resonated with you.'
    };
}
