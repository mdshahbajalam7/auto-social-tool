import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { TwitterApi } from 'twitter-api-v2';
import { Account } from '../models/Account.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensures an image URL is publicly reachable and complies with Instagram Graph API standards:
 * - Direct HTTPS URL with Content-Type: image/jpeg
 * - 1:1 Square (1080 x 1080 px)
 * - Color space: sRGB
 * - Quality: 90 JPEG
 */
async function getPublicImageUrl(imageUrl) {
    if (!imageUrl) return null;

    // Already a public web URL that is not localhost
    if (imageUrl.startsWith('http') && !imageUrl.includes('localhost') && !imageUrl.includes('127.0.0.1')) {
        return imageUrl;
    }

    try {
        let rawBuffer = null;
        let filename = `ig-post-${Date.now()}.jpg`;

        if (imageUrl.startsWith('data:image/')) {
            const base64Data = imageUrl.split(',')[1];
            rawBuffer = Buffer.from(base64Data, 'base64');
        } else if (imageUrl.includes('/api/media/')) {
            try {
                const idMatch = imageUrl.match(/\/api\/media\/([a-f0-9]+)/i);
                if (idMatch) {
                    const { Media } = await import('../models/Media.js');
                    const media = await Media.findById(idMatch[1]);
                    if (media?.data) {
                        rawBuffer = media.data;
                        filename = media.filename || filename;
                    }
                }
            } catch (_) {}
            if (!rawBuffer) {
                const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
                rawBuffer = Buffer.from(res.data);
            }
        } else if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
            try {
                const parsedUrl = new URL(imageUrl);
                const localRel = parsedUrl.pathname.replace(/^\//, '');
                const localFilePath = path.resolve(__dirname, '..', localRel);
                if (fs.existsSync(localFilePath)) {
                    rawBuffer = fs.readFileSync(localFilePath);
                    filename = path.basename(localFilePath);
                }
            } catch (_) {}

            if (!rawBuffer) {
                const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
                rawBuffer = Buffer.from(res.data);
            }
        } else if (fs.existsSync(imageUrl)) {
            rawBuffer = fs.readFileSync(imageUrl);
            filename = path.basename(imageUrl);
        }

        if (rawBuffer) {
            // Instagram strict requirements: 1080x1080 (1:1 square), sRGB, clean baseline JPEG
            const normalizedJpegBuffer = await sharp(rawBuffer)
                .resize(1080, 1080, { fit: 'cover' })
                .toColorspace('srgb')
                .jpeg({ quality: 90, mozjpeg: false })
                .toBuffer();

            // Method 1: Litterbox (Catbox) - Serves direct static files with Content-Type: image/jpeg
            try {
                const catForm = new FormData();
                catForm.append('reqtype', 'fileupload');
                catForm.append('time', '1h');
                catForm.append('fileToUpload', new Blob([normalizedJpegBuffer], { type: 'image/jpeg' }), filename);
                const catRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
                    method: 'POST',
                    body: catForm
                });
                const catUrl = await catRes.text();
                if (catUrl && catUrl.trim().startsWith('http')) {
                    const finalUrl = catUrl.trim();
                    console.log(`🌐 [Instagram] Converted local image to Litterbox JPEG: ${finalUrl}`);
                    return finalUrl;
                }
            } catch (catErr) {
                console.warn('ℹ️ Litterbox upload failed, trying FreeImage CDN...', catErr.message);
            }

            // Method 2: FreeImage.host - CDN serving pure image/jpeg with 200 OK
            try {
                const freeForm = new FormData();
                freeForm.append('key', '6d207e02198a847aa98d0a2a901485a5');
                freeForm.append('action', 'upload');
                freeForm.append('format', 'json');
                freeForm.append('source', normalizedJpegBuffer.toString('base64'));

                const freeRes = await fetch('https://freeimage.host/api/1/upload', {
                    method: 'POST',
                    body: freeForm
                });
                const freeData = await freeRes.json();
                if (freeData?.image?.url) {
                    console.log(`🌐 [Instagram] Converted local image to FreeImage JPEG: ${freeData.image.url}`);
                    return freeData.image.url;
                }
            } catch (freeErr) {
                console.warn('ℹ️ FreeImage upload failed:', freeErr.message);
            }
        }
    } catch (err) {
        console.warn('⚠️ [Instagram] Error normalizing / hosting image:', err.message);
    }

    return imageUrl;
}

// 1. LinkedIn Publishing
export async function publishToLinkedIn({ text, imageUrl }) {
    // Check connected account from MongoDB first, then fallback to .env
    const account = await Account.findOne({ platform: 'linkedin', isConnected: true });
    const token = account?.accessToken || process.env.LINKEDIN_ACCESS_TOKEN;
    let authorUrn = account?.accountUrn || process.env.LINKEDIN_PERSON_URN || '';
    let username = account?.username || 'LinkedIn Member';

    // Check if token exists and is not a placeholder
    const hasValidToken = token && !token.includes('your_') && token.length > 20;

    // If we have a valid token but no authorUrn (or placeholder), auto-fetch from LinkedIn API
    if (hasValidToken && (!authorUrn || authorUrn.includes('your_'))) {
        try {
            console.log('🔍 [LinkedIn] Fetching profile details via /v2/userinfo...');
            const userInfoRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (userInfoRes.data?.sub) {
                authorUrn = `urn:li:person:${userInfoRes.data.sub}`;
                username = userInfoRes.data.name || username;
                console.log(`✅ [LinkedIn] Auto-detected author: ${authorUrn} (${username})`);

                // Persist accountUrn into MongoDB Account
                if (account) {
                    await Account.findByIdAndUpdate(account._id, {
                        $set: {
                            accountUrn: authorUrn,
                            username
                        }
                    });
                }
            }
        } catch (err) {
            console.warn('⚠️ [LinkedIn] Could not auto-fetch userinfo:', err.response?.data || err.message);
        }
    }

    // If still no token or authorUrn, fallback to simulation mode
    if (!hasValidToken || !authorUrn || authorUrn.includes('your_')) {
        console.log(`ℹ️ [LinkedIn] Simulating post dispatch for: ${username}`);
        const mockId = `urn:li:share:${Date.now()}`;
        if (account) {
            await Account.findByIdAndUpdate(account._id, {
                $inc: { postCount: 1 },
                $set: { lastPostAt: new Date() }
            });
        }
        return {
            success: true,
            simulated: true,
            platform: 'linkedin',
            username,
            postId: mockId,
            postUrl: account?.profileUrl || 'https://linkedin.com/feed/',
            publishedAt: new Date().toISOString()
        };
    }

    console.log(`🚀 [LinkedIn] Publishing real post as ${authorUrn}...`);

    // Step A: Attempt LinkedIn Media Upload if imageUrl is provided
    let imageAsset = null;
    let restImageUrn = null;

    if (imageUrl) {
        try {
            console.log('📸 [LinkedIn] Preparing image asset for LinkedIn dispatch...');
            let imageBuffer = null;

            if (imageUrl.startsWith('data:image/')) {
                const base64Data = imageUrl.split(',')[1];
                imageBuffer = Buffer.from(base64Data, 'base64');
            } else if (imageUrl.includes('/api/media/')) {
                try {
                    const idMatch = imageUrl.match(/\/api\/media\/([a-f0-9]+)/i);
                    if (idMatch) {
                        const { Media } = await import('../models/Media.js');
                        const media = await Media.findById(idMatch[1]);
                        if (media?.data) {
                            imageBuffer = media.data;
                            console.log(`📦 [LinkedIn] Retrieved image directly from MongoDB Media (${imageBuffer.length} bytes)`);
                        }
                    }
                } catch (dbErr) {
                    console.warn('Could not read Media from database directly:', dbErr.message);
                }
            }

            if (!imageBuffer) {
                const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
                imageBuffer = Buffer.from(imgRes.data);
            }

            // Ensure buffer is valid sRGB JPEG
            const normalizedBuffer = await sharp(imageBuffer)
                .toColorspace('srgb')
                .jpeg({ quality: 90 })
                .toBuffer();

            // Attempt A: LinkedIn v2 Assets API
            try {
                const registerPayload = {
                    registerUploadRequest: {
                        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                        owner: authorUrn,
                        serviceRelationships: [
                            {
                                relationshipType: 'OWNER',
                                identifier: 'urn:li:userGeneratedContent'
                            }
                        ]
                    }
                };

                const regRes = await axios.post('https://api.linkedin.com/v2/assets?action=registerUpload', registerPayload, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });

                const uploadUrl = regRes.data?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
                const assetUrn = regRes.data?.value?.asset;

                if (uploadUrl && assetUrn) {
                    await axios.put(uploadUrl, normalizedBuffer, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'image/jpeg'
                        },
                        timeout: 20000
                    });

                    imageAsset = assetUrn;
                    console.log(`✅ [LinkedIn] v2 Media uploaded successfully! Asset URN: ${imageAsset}`);
                }
            } catch (v2UploadErr) {
                console.warn('ℹ️ [LinkedIn] v2 Assets upload note:', v2UploadErr.response?.data?.message || v2UploadErr.message);
            }

            // Attempt B: LinkedIn REST Images API
            if (!imageAsset) {
                const versionsToTry = ['202502', '202501', '202412'];
                for (const ver of versionsToTry) {
                    try {
                        const initRes = await axios.post(
                            'https://api.linkedin.com/rest/images?action=initializeUpload',
                            { initializeUploadRequest: { owner: authorUrn } },
                            {
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    'LinkedIn-Version': ver,
                                    'X-Restli-Protocol-Version': '2.0.0',
                                    'Content-Type': 'application/json'
                                },
                                timeout: 10000
                            }
                        );

                        const uploadUrl = initRes.data?.value?.uploadUrl;
                        const imageUrn = initRes.data?.value?.image;

                        if (uploadUrl && imageUrn) {
                            await axios.put(uploadUrl, normalizedBuffer, {
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    'Content-Type': 'image/jpeg'
                                },
                                timeout: 20000
                            });

                            restImageUrn = imageUrn;
                            imageAsset = imageUrn;
                            console.log(`✅ [LinkedIn REST] Image uploaded successfully! URN: ${restImageUrn}`);
                            break;
                        }
                    } catch (restImgErr) {
                        continue;
                    }
                }
            }
        } catch (imgErr) {
            console.warn('ℹ️ [LinkedIn] Image retrieval / upload warning (proceeding with text):', imgErr.response?.data?.message || imgErr.message);
        }
    }

    // Method 1: Try LinkedIn ugcPosts API
    try {
        const shareContent = imageAsset ? {
            shareCommentary: { text },
            shareMediaCategory: 'IMAGE',
            media: [
                {
                    status: 'READY',
                    description: { text: text.slice(0, 100) },
                    media: imageAsset,
                    title: { text: 'Social Asset' }
                }
            ]
        } : {
            shareCommentary: { text },
            shareMediaCategory: 'NONE'
        };

        const payload = {
            author: authorUrn,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': shareContent
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
            }
        };

        const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                'X-Restli-Protocol-Version': '2.0.0',
                'Content-Type': 'application/json'
            }
        });

        if (account) {
            await Account.findByIdAndUpdate(account._id, {
                $inc: { postCount: 1 },
                $set: { lastPostAt: new Date(), accountUrn: authorUrn }
            });
        }

        console.log(`✅ [LinkedIn] Post published successfully! ID: ${response.data.id}`);
        return {
            success: true,
            platform: 'linkedin',
            username,
            postId: response.data.id,
            postUrl: `https://www.linkedin.com/feed/update/${response.data.id}`,
            hasImage: Boolean(imageAsset),
            publishedAt: new Date().toISOString()
        };
    } catch (ugcError) {
        console.warn('⚠️ ugcPosts failed, attempting /rest/posts endpoint...', ugcError.response?.data || ugcError.message);

        // Method 2: Fallback to LinkedIn rest/posts API with active version fallback
        const restPayload = {
            author: authorUrn,
            commentary: text,
            visibility: 'PUBLIC',
            distribution: {
                feedDistribution: 'MAIN_FEED',
                targetEntities: [],
                thirdPartyDistributionChannels: []
            },
            content: imageAsset ? {
                media: {
                    id: imageAsset,
                    title: 'Social Asset'
                }
            } : undefined,
            lifecycleState: 'PUBLISHED',
            isReshareDisabledByAuthor: false
        };

        // Candidate active versions in YYYYMM format (LinkedIn versions expire after 12 months)
        const now = new Date();
        const curY = now.getFullYear();
        const curM = String(now.getMonth() + 1).padStart(2, '0');
        const versionsToTry = [
            '202502',
            '202501',
            '202412',
            '202411',
            '202410',
            '202503',
            '202504',
            `${curY}${curM}`
        ];

        let lastRestError = null;

        for (const ver of versionsToTry) {
            try {
                console.log(`📡 [LinkedIn] Attempting /rest/posts with LinkedIn-Version: ${ver}...`);
                const restRes = await axios.post('https://api.linkedin.com/rest/posts', restPayload, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'LinkedIn-Version': ver,
                        'X-Restli-Protocol-Version': '2.0.0',
                        'Content-Type': 'application/json'
                    }
                });

                const postId = restRes.data?.id || restRes.headers['x-restli-id'] || `post_${Date.now()}`;

                if (account) {
                    await Account.findByIdAndUpdate(account._id, {
                        $inc: { postCount: 1 },
                        $set: { lastPostAt: new Date(), accountUrn: authorUrn }
                    });
                }

                console.log(`✅ [LinkedIn] /rest/posts published successfully with version ${ver}! ID: ${postId}`);
                return {
                    success: true,
                    platform: 'linkedin',
                    username,
                    postId,
                    postUrl: `https://www.linkedin.com/feed/update/${postId}`,
                    publishedAt: new Date().toISOString()
                };
            } catch (verErr) {
                lastRestError = verErr;
                // If version is not active (426 Upgrade Required), try next version in the list
                if (verErr.response?.status === 426 || verErr.response?.data?.code === 'NONEXISTENT_VERSION') {
                    console.log(`ℹ️ LinkedIn version ${ver} not active, trying next candidate...`);
                    continue;
                }
                // For other errors (401, 403, 400), don't loop
                break;
            }
        }

        const errData = lastRestError?.response?.data || ugcError.response?.data;
        const errMsg = errData?.message || lastRestError?.message || ugcError.message;
        console.error('❌ LinkedIn Live API Error:', errData || errMsg);

        return {
            success: false,
            platform: 'linkedin',
            error: errMsg
        };
    }
}

// 2. Twitter / X Publishing
export async function publishToTwitter({ text, imageUrl }) {
    const account = await Account.findOne({ platform: 'twitter', isConnected: true });
    const username = account?.username || 'TwitterUser';
    const cleanHandle = username.replace('@', '');

    const apiKey = account?.apiKey || process.env.TWITTER_API_KEY;
    const apiSecret = account?.apiSecret || process.env.TWITTER_API_SECRET;
    const accessToken = account?.accessToken || process.env.TWITTER_ACCESS_TOKEN;
    const accessTokenSecret = account?.accessTokenSecret || process.env.TWITTER_ACCESS_SECRET;
    const bearerToken = process.env.TWITTER_BEARER_TOKEN && !process.env.TWITTER_BEARER_TOKEN.includes('your_') ? process.env.TWITTER_BEARER_TOKEN : null;

    const hasOAuth1 = apiKey && apiSecret && accessToken && accessTokenSecret;
    const hasOAuth2 = accessToken && !hasOAuth1 && (accessToken.length > 30);

    if (!hasOAuth1 && !hasOAuth2 && !bearerToken) {
        return {
            success: false,
            platform: 'twitter',
            error: 'Twitter API credentials missing. Please enter your API Key, API Secret, Access Token, and Access Token Secret in the Twitter connection modal.'
        };
    }

    try {
        console.log(`🚀 [Twitter/X] Publishing live tweet as @${cleanHandle}...`);
        const isOAuth2Format = accessToken && !accessToken.includes('-') && accessToken.length > 25;
        let client;

        if (isOAuth2Format) {
            console.log('🔑 [Twitter/X] Detected OAuth 2.0 User Access Token. Using Bearer authentication.');
            client = new TwitterApi(accessToken.trim());
        } else if (hasOAuth1) {
            console.log('🔑 [Twitter/X] Using OAuth 1.0a authentication.');
            client = new TwitterApi({
                appKey: apiKey.trim(),
                appSecret: apiSecret.trim(),
                accessToken: accessToken.trim(),
                accessSecret: accessTokenSecret.trim(),
            });
        } else {
            client = new TwitterApi((accessToken || bearerToken).trim());
        }

        // Optional media upload if image is present and OAuth 1.0a is configured
        let mediaId = null;
        if (imageUrl && hasOAuth1 && !isOAuth2Format) {
            try {
                let imageBuffer = null;
                if (imageUrl.startsWith('data:image/')) {
                    const base64Data = imageUrl.split(',')[1];
                    imageBuffer = Buffer.from(base64Data, 'base64');
                } else if (imageUrl.includes('/api/media/')) {
                    try {
                        const idMatch = imageUrl.match(/\/api\/media\/([a-f0-9]+)/i);
                        if (idMatch) {
                            const { Media } = await import('../models/Media.js');
                            const media = await Media.findById(idMatch[1]);
                            if (media?.data) imageBuffer = media.data;
                        }
                    } catch (_) {}
                }
                if (!imageBuffer) {
                    const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
                    imageBuffer = Buffer.from(imgRes.data);
                }
                if (imageBuffer) {
                    const jpegBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
                    mediaId = await client.v1.uploadMedia(jpegBuffer, { mimeType: 'image/jpeg' });
                    console.log(`📸 [Twitter/X] Media uploaded with ID: ${mediaId}`);
                }
            } catch (mediaErr) {
                console.warn('⚠️ [Twitter/X] Media upload warning (will post text-only):', mediaErr.message);
            }
        }

        const tweetPayload = { text: (text || '').trim().slice(0, 280) };
        if (mediaId) {
            tweetPayload.media = { media_ids: [mediaId] };
        }

        let tweetRes;
        try {
            tweetRes = await client.v2.tweet(tweetPayload);
        } catch (err) {
            console.error('❌ [Twitter/X] Live Publish Error:', err.data || err.message);
            const status = err.status || err.code || err.data?.status;
            let detail = err.data?.detail || err.data?.title || err.message;

            if (status === 402 || detail?.includes('credits depleted')) {
                detail = 'X/Twitter Developer Account me API credits khatam (depleted) ho gaye hain. Twitter Developer Portal (developer.x.com) par billing/credits check karein.';
            }

            return {
                success: false,
                platform: 'twitter',
                error: `Twitter API Error: ${detail}`
            };
        }
        const tweetId = tweetRes.data?.id || `tweet_${Date.now()}`;
        const tweetUrl = `https://x.com/${cleanHandle}/status/${tweetId}`;
        console.log(`🎉 [Twitter/X] Tweet published live! URL: ${tweetUrl}`);

        if (account) {
            await Account.findByIdAndUpdate(account._id, {
                $inc: { postCount: 1 },
                $set: { lastPostAt: new Date(), profileUrl: `https://x.com/${cleanHandle}` }
            });
        }

        return {
            success: true,
            platform: 'twitter',
            username: `@${cleanHandle}`,
            postId: tweetId,
            postUrl: tweetUrl,
            publishedAt: new Date().toISOString()
        };
    } catch (err) {
        console.error('❌ [Twitter/X] Live Publish General Error:', err.data || err.message);
        const detail = err.data?.detail || err.data?.title || err.message;
        return {
            success: false,
            platform: 'twitter',
            error: `Twitter API Error: ${detail}`
        };
    }
}

// 3. Instagram Publishing (Supports both Instagram Graph API and Meta Facebook Graph API)
export async function publishToInstagram({ text, imageUrl }) {
    const account = await Account.findOne({ platform: 'instagram', isConnected: true });
    const token = account?.accessToken || process.env.INSTAGRAM_ACCESS_TOKEN;
    const username = account?.username || 'instagram_creator';
    const cleanHandle = username.replace('@', '');
    let igUserId = account?.accountUrn || process.env.INSTAGRAM_USER_ID;

    const hasValidToken = token && !token.includes('your_') && token.length > 20;

    // If valid token is present, execute real Meta / Instagram Graph API publishing
    if (hasValidToken) {
        try {
            console.log(`🚀 [Instagram] Publishing live post via Meta/Instagram API for @${cleanHandle}...`);

            // Detect API host based on token format
            // Instagram User Tokens start with "IG" or "IGAA"
            const isInstagramUserToken = token.startsWith('IG');
            const defaultBaseUrl = isInstagramUserToken
                ? 'https://graph.instagram.com'
                : 'https://graph.facebook.com/v21.0';

            // Step 1: Auto-discover Instagram Account ID if not present
            if (!igUserId) {
                // Try graph.instagram.com first (for Instagram User Access Tokens)
                try {
                    console.log('🔍 [Instagram] Fetching account info via graph.instagram.com/me...');
                    const igMe = await axios.get('https://graph.instagram.com/me', {
                        params: { fields: 'id,username,account_type', access_token: token }
                    });
                    if (igMe.data?.id) {
                        igUserId = igMe.data.id;
                        console.log(`✅ [Instagram] Auto-discovered Instagram User ID: ${igUserId} (@${igMe.data.username || cleanHandle})`);
                    }
                } catch (igErr) {
                    // Try Facebook Page accounts fallback
                    try {
                        console.log('🔍 [Instagram] Fetching business account via graph.facebook.com/me/accounts...');
                        const fbMe = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
                            params: {
                                fields: 'instagram_business_account{id,username},name',
                                access_token: token
                            }
                        });
                        const pages = fbMe.data?.data || [];
                        for (const page of pages) {
                            if (page.instagram_business_account?.id) {
                                igUserId = page.instagram_business_account.id;
                                console.log(`✅ [Instagram] Auto-discovered Instagram Business Account ID: ${igUserId}`);
                                break;
                            }
                        }
                    } catch (_) {}
                }
            }

            if (!igUserId) {
                return {
                    success: false,
                    platform: 'instagram',
                    error: 'Instagram Account ID not found. Meta API requires an Instagram Professional/Creator account.'
                };
            }

            // Persist detected igUserId in MongoDB
            if (account && !account.accountUrn) {
                await Account.findByIdAndUpdate(account._id, { $set: { accountUrn: igUserId } });
            }

            // Step 2: Ensure Image URL is publicly accessible to Instagram's servers
            let publicImage = await getPublicImageUrl(imageUrl);
            if (!publicImage) {
                return {
                    success: false,
                    platform: 'instagram',
                    error: 'An image URL is required for Instagram posts.'
                };
            }

            // Determine active base API URL
            const apiBase = isInstagramUserToken ? 'https://graph.instagram.com' : 'https://graph.facebook.com/v21.0';

            // Step 3: Create Media Container on Instagram
            console.log(`📸 [Instagram] Creating media container at ${apiBase}/${igUserId}/media...`);
            const containerRes = await axios.post(
                `${apiBase}/${igUserId}/media`,
                null,
                {
                    params: {
                        image_url: publicImage,
                        caption: text,
                        access_token: token
                    }
                }
            );

            const creationId = containerRes.data?.id;
            if (!creationId) {
                return {
                    success: false,
                    platform: 'instagram',
                    error: 'Failed to create Instagram media container. Ensure image is publicly accessible.'
                };
            }

            // Step 4: Publish Media Container
            console.log(`🚀 [Instagram] Publishing media container ${creationId}...`);
            const publishRes = await axios.post(
                `${apiBase}/${igUserId}/media_publish`,
                null,
                {
                    params: {
                        creation_id: creationId,
                        access_token: token
                    }
                }
            );

            const liveMediaId = publishRes.data?.id;
            console.log(`🎉 [Instagram] Successfully published live post on Instagram! (ID: ${liveMediaId})`);

            if (account) {
                await Account.findByIdAndUpdate(account._id, {
                    $inc: { postCount: 1 },
                    $set: { lastPostAt: new Date(), accountUrn: igUserId }
                });
            }

            return {
                success: true,
                live: true,
                platform: 'instagram',
                username: `@${cleanHandle}`,
                postId: liveMediaId,
                postUrl: `https://instagram.com/${cleanHandle}`,
                publishedAt: new Date().toISOString()
            };
        } catch (apiErr) {
            const errMsg = apiErr.response?.data?.error?.message || apiErr.message;
            console.error(`❌ [Instagram] API error:`, errMsg);
            return {
                success: false,
                platform: 'instagram',
                error: `Instagram API Error: ${errMsg}`
            };
        }
    }

    // If NO Access Token was provided
    console.warn(`⚠️ [Instagram] No Meta Access Token configured for @${cleanHandle}`);
    return {
        success: false,
        platform: 'instagram',
        error: `Instagram par real post karne ke liye Meta Access Token zaroori hai. Sirf username se Instagram post allow nahi karta. Please UI me Connect par click karke apna Meta / Instagram Access Token paste karein.`
    };
}

// 4. Facebook Publishing (Meta Graph API for Facebook Pages)
export async function publishToFacebook({ text, imageUrl }) {
    const account = await Account.findOne({ platform: 'facebook', isConnected: true });
    const token = account?.accessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
    const username = account?.username || 'Facebook Page';
    let pageId = account?.accountUrn || process.env.FACEBOOK_PAGE_ID;

    const hasValidToken = token && !token.includes('your_') && token.length > 20;

    if (hasValidToken) {
        try {
            console.log(`🚀 [Facebook] Publishing live post for ${username} via Meta Graph API...`);

            let targetPageId = pageId;
            let pageToken = token;

            // Step 1: Verify token type - is it already a Page Access Token?
            try {
                const meRes = await axios.get('https://graph.facebook.com/v21.0/me', {
                    params: { fields: 'id,name,category', access_token: token }
                });
                if (meRes.data?.category) {
                    // Token is directly a Page Access Token!
                    targetPageId = meRes.data.id;
                    pageToken = token;
                    console.log(`✅ [Facebook] Token verified as Page Token for: ${meRes.data.name} (ID: ${targetPageId})`);
                }
            } catch (_) {}

            // Step 2: If not verified as Page Token, fetch managed Pages via /me/accounts
            if (!targetPageId) {
                try {
                    const pagesRes = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
                        params: { fields: 'id,name,access_token,category', access_token: token }
                    });
                    const pages = pagesRes.data?.data || [];
                    if (pages.length > 0) {
                        targetPageId = pages[0].id;
                        pageToken = pages[0].access_token || token;
                        console.log(`✅ [Facebook] Auto-detected Facebook Page: "${pages[0].name}" (ID: ${targetPageId})`);
                    }
                } catch (pageErr) {
                    console.warn('ℹ️ [Facebook] Could not fetch /me/accounts:', pageErr.response?.data?.error?.message || pageErr.message);
                }
            }

            // CRITICAL: NEVER fallback to a personal profile user ID!
            // Meta strictly deprecated publish_actions for personal profiles.
            if (!targetPageId) {
                return {
                    success: false,
                    platform: 'facebook',
                    error: 'Koi Facebook Page nahi mila! Meta personal Facebook profiles par direct posting allow nahi karta (error #200: publish_actions is deprecated). Kripya Facebook par ek Page banayein aur Page Access Token (pages_manage_posts permission) use karein.'
                };
            }

            let livePostId = null;

            // Step 3: If image provided, publish photo post to the Page
            if (imageUrl) {
                const publicImageUrl = await getPublicImageUrl(imageUrl);
                console.log(`📸 [Facebook] Publishing photo to Page (${targetPageId})...`);
                const photoRes = await axios.post(`https://graph.facebook.com/v21.0/${targetPageId}/photos`, null, {
                    params: {
                        url: publicImageUrl,
                        caption: text,
                        access_token: pageToken
                    }
                });
                livePostId = photoRes.data?.id || photoRes.data?.post_id;
            } else {
                // Step 4: Text feed post to the Page
                console.log(`📝 [Facebook] Publishing status message to Page (${targetPageId})...`);
                const feedRes = await axios.post(`https://graph.facebook.com/v21.0/${targetPageId}/feed`, null, {
                    params: {
                        message: text,
                        access_token: pageToken
                    }
                });
                livePostId = feedRes.data?.id;
            }

            console.log(`🎉 [Facebook] Successfully published live post on Facebook Page! (ID: ${livePostId})`);

            if (account) {
                await Account.findByIdAndUpdate(account._id, {
                    $inc: { postCount: 1 },
                    $set: { lastPostAt: new Date(), accountUrn: targetPageId }
                });
            }

            return {
                success: true,
                live: true,
                platform: 'facebook',
                username,
                postId: livePostId,
                postUrl: `https://facebook.com/${targetPageId}`,
                publishedAt: new Date().toISOString()
            };
        } catch (apiErr) {
            const errObj = apiErr.response?.data?.error;
            const errMsg = errObj?.message || apiErr.message;
            console.error(`❌ [Facebook] Meta Graph API error:`, errMsg);

            if (errObj?.code === 200 || errMsg.includes('publish_actions is deprecated')) {
                return {
                    success: false,
                    platform: 'facebook',
                    error: 'Meta Policy Error (#200): Aapka token Personal Profile ka hai. Meta ke anusaar personal Facebook timeline par auto-post permanently band hai. Kripya ek Facebook Page banayein aur developers.facebook.com se Page Access Token (pages_manage_posts permission) use karein.'
                };
            }

            return {
                success: false,
                platform: 'facebook',
                error: `Facebook API Error: ${errMsg}`
            };
        }
    }

    // If NO Access Token was provided
    console.warn(`⚠️ [Facebook] No Meta Page Access Token configured for ${username}`);
    return {
        success: false,
        platform: 'facebook',
        error: `Facebook Personal Profile par direct automated posting Meta allow nahi karta (privacy rules). Automated posting ke liye aapko ek Facebook Page aur uska Page Access Token chahiye hota hai. Please UI me Connect par click karke Page Access Token enter karein.`
    };
}

// 5. Multi-channel pipeline publisher
export async function publishToPlatforms({ content, imageUrl, platforms = [] }) {
    const results = {};

    if (platforms.includes('linkedin')) {
        results.linkedin = await publishToLinkedIn({
            text: content.linkedin || content.twitter,
            imageUrl
        });
    }

    if (platforms.includes('twitter')) {
        results.twitter = await publishToTwitter({
            text: content.twitter || content.linkedin,
            imageUrl
        });
    }

    if (platforms.includes('instagram')) {
        results.instagram = await publishToInstagram({
            text: content.instagramCaption || content.twitter,
            imageUrl
        });
    }

    if (platforms.includes('facebook')) {
        results.facebook = await publishToFacebook({
            text: content.facebook || content.linkedin,
            imageUrl
        });
    }

    if (platforms.includes('youtube')) {
        const account = await Account.findOne({ platform: 'youtube', isConnected: true });
        results.youtube = {
            success: true,
            simulated: true,
            platform: 'youtube',
            username: account?.username || 'YouTube Community',
            postId: `yt_${Date.now()}`,
            postUrl: account?.profileUrl || 'https://youtube.com',
            publishedAt: new Date().toISOString()
        };
        if (account) {
            await Account.findByIdAndUpdate(account._id, {
                $inc: { postCount: 1 },
                $set: { lastPostAt: new Date() }
            });
        }
    }

    return results;
}