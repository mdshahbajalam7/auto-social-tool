import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { connectDB } from './config/db.js';
import { Post } from './models/Post.js';
import { Account } from './models/Account.js';
import { researchTrends } from './services/researcher.js';
import { generateSocialContent } from './services/aiGenerator.js';
import { generateImageWithGemini } from './services/imageService.js';
import {
    publishToPlatforms,
    publishToLinkedIn,
    publishToTwitter,
    publishToInstagram,
    publishToFacebook
} from './services/socialPublisher.js';
import {
    autoReplyAllRecentLinkedInPosts,
    processPostComments,
    replyToCommentManual,
    startAutoReplyCron
} from './services/autoReplyService.js';

dotenv.config();

// Connect MongoDB
connectDB();

// Start LinkedIn AI Auto-Reply background scheduler (checks every 10 min)
startAutoReplyCron();

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = process.env.VERCEL
    ? path.join(os.tmpdir(), 'uploads')
    : path.join(__dirname, 'uploads');

try {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
} catch (fsErr) {
    console.warn('⚠️ uploadsDir warning:', fsErr.message);
}

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Connect DB middleware for Serverless invocations
app.use(async (req, res, next) => {
    try {
        await connectDB();
    } catch (_) { }
    next();
});

// ==========================================
// 0. Deployment Test & Health Check Route (GET /)
// ==========================================
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 Auto Social Tool Backend API is running live!',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        endpoints: {
            health: 'GET /',
            accounts: 'GET /api/accounts',
            posts: 'GET /api/posts',
            pipeline: 'POST /api/pipeline/auto-run',
            connectAccount: 'POST /api/accounts/connect',
            publishSingle: 'POST /api/publish/:platform',
            publishAll: 'POST /api/publish-all'
        }
    });
});

// ==========================================
// 1. Pipeline Auto-Run (Research -> Write -> Render -> Publish -> Save)
// ==========================================
app.post('/api/pipeline/auto-run', async (req, res) => {
    try {
        const { niche = 'Artificial Intelligence', platforms = ['twitter', 'linkedin', 'instagram', 'facebook'], autoPublish = false } = req.body;
        console.log(`\n🚀 [Pipeline] Generating creative package for niche: "${niche}" (Auto-Publish: ${autoPublish})...`);

        // Step 1: Research using Google Gemini AI
        console.log('1️⃣ Researching latest trends with Google Gemini AI...');
        const researchData = await researchTrends(niche);

        // Step 2: Content Generation using Google Gemini AI
        console.log('2️⃣ Generating multi-channel copy with Google Gemini AI...');
        const generatedCopy = await generateSocialContent({
            topic: researchData.topic,
            summary: researchData.summary,
            niche
        });

        // Step 3: High-End Image Generation
        console.log('3️⃣ Generating ultra-high-definition visual assets...');
        const imageUrl = await generateImageWithGemini({
            imagePrompt: generatedCopy.imagePrompt,
            topic: researchData.topic,
            summary: researchData.summary,
            niche
        });

        // Step 4: Publishing to channels (Only if autoPublish requested)
        let publishResult = {};
        if (autoPublish) {
            console.log('4️⃣ Auto-publishing across channels...');
            publishResult = await publishToPlatforms({
                content: generatedCopy,
                imageUrl,
                platforms
            });
        } else {
            console.log('4️⃣ Generation complete! Ready for user review & 1-click manual publish.');
        }

        // Step 5: Save Record directly into MongoDB (Status is draft until published)
        console.log('💾 Saving generation record...');
        const savedPost = await Post.create({
            niche,
            research: researchData,
            content: generatedCopy,
            imageUrl,
            platforms,
            status: autoPublish ? 'published' : 'draft',
            publishResult
        });

        return res.status(201).json({
            success: true,
            message: autoPublish
                ? 'Pipeline executed and published to channels successfully!'
                : 'Post generated successfully! Ready to review and publish to LinkedIn.',
            data: savedPost
        });
    } catch (error) {
        console.error('Pipeline error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Clean up any historical un-published drafts from database
Post.deleteMany({ status: { $ne: 'published' } }).then((res) => {
    if (res.deletedCount > 0) {
        console.log(`🧹 Cleaned up ${res.deletedCount} non-published draft(s) from database.`);
    }
}).catch(() => { });

// ==========================================
// 2. Posts CRUD Endpoints (ONLY PUBLISHED POSTS)
// ==========================================
app.get('/api/posts', async (req, res) => {
    try {
        // Sirf wahi post ledger me aayenge jo publish ho chuke hain
        const posts = await Post.find({ status: 'published' }).sort({ createdAt: -1 });
        res.json({ success: true, posts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/posts/:id', async (req, res) => {
    try {
        const deletedPost = await Post.findByIdAndDelete(req.params.id);
        if (!deletedPost) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        res.json({ success: true, message: 'Post deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 3. Social Media Accounts (Connect / Disconnect from UI)
// ==========================================

// Get status of all 4 platforms
app.get('/api/accounts', async (req, res) => {
    try {
        const supported = ['linkedin', 'twitter', 'instagram', 'facebook', 'youtube'];
        const savedAccounts = await Account.find();

        const accountsMap = {};
        for (const platform of supported) {
            const found = savedAccounts.find((a) => a.platform === platform);
            accountsMap[platform] = found
                ? {
                    platform,
                    username: found.username,
                    profileUrl: found.profileUrl,
                    isConnected: found.isConnected,
                    postCount: found.postCount || 0,
                    lastPostAt: found.lastPostAt || null,
                    hasToken: Boolean(found.accessToken)
                }
                : {
                    platform,
                    username: '',
                    profileUrl: '',
                    isConnected: false,
                    postCount: 0,
                    lastPostAt: null,
                    hasToken: false
                };
        }

        res.json({ success: true, accounts: accountsMap });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Connect or update an account from the UI
app.post('/api/accounts/connect', async (req, res) => {
    try {
        const { platform, username = '', profileUrl = '', accessToken = '', accountUrn = '' } = req.body;
        if (!platform || !username.trim()) {
            return res.status(400).json({ success: false, error: 'Platform and username are required.' });
        }

        let finalUrn = accountUrn || '';
        let finalUsername = username.trim();

        // If LinkedIn and token provided, auto-fetch Person URN and Profile Name
        if (platform.toLowerCase() === 'linkedin' && accessToken && !accessToken.includes('your_')) {
            try {
                const userinfo = await axios.get('https://api.linkedin.com/v2/userinfo', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                if (userinfo.data?.sub) {
                    finalUrn = `urn:li:person:${userinfo.data.sub}`;
                    finalUsername = userinfo.data.name || finalUsername;
                    console.log(`✅ [Connect] LinkedIn URN auto-detected: ${finalUrn} (${finalUsername})`);
                }
            } catch (err) {
                console.warn('⚠️ Could not auto-detect LinkedIn URN:', err.message);
            }
        }

        // If Instagram and token provided, auto-fetch Instagram User ID & Username
        if (platform.toLowerCase() === 'instagram' && accessToken && !accessToken.includes('your_')) {
            try {
                const igRes = await axios.get('https://graph.instagram.com/me', {
                    params: { fields: 'id,username,account_type', access_token: accessToken }
                });
                if (igRes.data?.id) {
                    finalUrn = igRes.data.id;
                    if (igRes.data.username) finalUsername = igRes.data.username;
                    console.log(`✅ [Connect] Instagram User ID auto-detected: ${finalUrn} (@${finalUsername})`);
                }
            } catch (igErr) {
                try {
                    const fbRes = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
                        params: { fields: 'instagram_business_account{id,username}', access_token: accessToken }
                    });
                    const pages = fbRes.data?.data || [];
                    for (const page of pages) {
                        if (page.instagram_business_account?.id) {
                            finalUrn = page.instagram_business_account.id;
                            if (page.instagram_business_account.username) finalUsername = page.instagram_business_account.username;
                            console.log(`✅ [Connect] Instagram Business ID auto-detected: ${finalUrn}`);
                            break;
                        }
                    }
                } catch (_) { }
            }
        }

        const updateData = {
            platform: platform.toLowerCase(),
            username: finalUsername,
            profileUrl: profileUrl ? profileUrl.trim() : `https://${platform}.com/${finalUsername.replace('@', '')}`,
            accessToken: accessToken || '',
            isConnected: true
        };
        if (finalUrn) {
            updateData.accountUrn = finalUrn;
        }

        const updated = await Account.findOneAndUpdate(
            { platform: platform.toLowerCase() },
            { $set: updateData },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({
            success: true,
            message: `${platform.toUpperCase()} connected successfully!`,
            account: {
                platform: updated.platform,
                username: updated.username,
                profileUrl: updated.profileUrl,
                isConnected: updated.isConnected,
                postCount: updated.postCount,
                hasToken: Boolean(updated.accessToken)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Disconnect an account
app.delete('/api/accounts/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        await Account.findOneAndDelete({ platform: platform.toLowerCase() });
        res.json({ success: true, message: `${platform} account disconnected.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 4. Single-Channel 1-Click Publishing
// ==========================================
app.post('/api/publish/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { text, imageUrl, postId } = req.body;

        let result;
        if (platform === 'linkedin') {
            result = await publishToLinkedIn({ text, imageUrl });
        } else if (platform === 'twitter') {
            result = await publishToTwitter({ text });
        } else if (platform === 'instagram') {
            result = await publishToInstagram({ text, imageUrl });
        } else if (platform === 'facebook') {
            result = await publishToFacebook({ text, imageUrl });
        } else {
            return res.status(400).json({ success: false, error: `Unsupported platform: ${platform}` });
        }

        // Attach publish status to MongoDB Post if postId provided
        if (postId && result.success) {
            await Post.findByIdAndUpdate(postId, {
                $set: {
                    [`publishResult.${platform}`]: result,
                    status: 'published'
                }
            });
        }

        res.json({ success: true, platform, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 5. Multi-Channel Blast: Publish to All Connected Accounts
// ==========================================
app.post('/api/publish-all', async (req, res) => {
    try {
        const { postId, content = {}, imageUrl = '' } = req.body;

        // Find all accounts connected by the user in MongoDB
        const connectedAccounts = await Account.find({ isConnected: true });
        if (!connectedAccounts || connectedAccounts.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No social accounts are connected yet! Please connect at least one platform to publish.'
            });
        }

        const platforms = connectedAccounts.map((a) => a.platform);
        console.log(`🚀 [Multi-Publish] Dispatching across ${platforms.length} connected channel(s): ${platforms.join(', ')}...`);

        const publishResult = await publishToPlatforms({
            content,
            imageUrl,
            platforms
        });

        // Update post in MongoDB
        if (postId) {
            await Post.findByIdAndUpdate(postId, {
                $set: {
                    publishResult,
                    status: 'published'
                }
            });
        }

        res.json({
            success: true,
            publishedCount: platforms.length,
            platforms,
            results: publishResult
        });
    } catch (error) {
        console.error('Multi-channel publish error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 6. LinkedIn AI Auto-Reply to Comments
// ==========================================

// Trigger full scan & reply across all recent published LinkedIn posts
app.post('/api/linkedin/auto-reply-scan', async (req, res) => {
    try {
        console.log('⚡ [API] Manual LinkedIn comment scan requested...');
        const result = await autoReplyAllRecentLinkedInPosts();
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Trigger comment scan & reply for a specific post
app.post('/api/linkedin/posts/:id/auto-reply', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

        const account = await Account.findOne({ platform: 'linkedin', isConnected: true });
        const result = await processPostComments(post, account);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get auto-reply stats & history
app.get('/api/linkedin/auto-reply-stats', async (req, res) => {
    try {
        const postsWithReplies = await Post.find({
            'repliedComments.0': { $exists: true }
        }).select('research.topic niche repliedComments createdAt publishResult.linkedin');

        const totalReplies = postsWithReplies.reduce(
            (acc, p) => acc + (p.repliedComments?.length || 0),
            0
        );

        res.json({
            success: true,
            totalRepliesSent: totalReplies,
            postsWithRepliesCount: postsWithReplies.length,
            history: postsWithReplies
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Post an AI or custom comment reply to a LinkedIn post
app.post('/api/linkedin/reply-comment', async (req, res) => {
    try {
        const { postId, commentText, customReplyText } = req.body;
        if (!postId) return res.status(400).json({ success: false, error: 'postId is required' });

        const result = await replyToCommentManual({ postId, commentText, customReplyText });
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`✅ Backend server active on port ${PORT}`);
    });
}

export default app;