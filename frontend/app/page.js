'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Flame,
  Clock,
  Layers,
  Image as ImageIcon,
  Share2,
  AlertCircle,
  Plus,
  Settings,
  X,
  User,
  Globe,
  Copy,
  Check,
  LayoutTemplate,
  Bot,
  MessageSquare,
  Send,
  MessageCircle,
  CornerDownRight,
  ThumbsUp,
  ArrowRight
} from 'lucide-react';
import { Linkedin, Twitter, Instagram, Facebook, YouTube } from '@/components/SocialIcons';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'https://auto-social-tool-ctzn.vercel.app').replace(/\/$/, '');

const normalizeMediaUrl = (url) => {
  if (!url) return url;
  if (url.includes('/api/media/')) {
    const id = url.split('/api/media/')[1];
    return `${BACKEND_URL}/api/media/${id}`;
  }
  return url;
};

const PLATFORM_CONFIG = {
  linkedin: {
    name: 'LinkedIn',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200/80',
    tabColor: 'bg-[#0a66c2] text-white',
    icon: Linkedin,
    placeholderHandle: 'e.g. John Doe or company-name',
    defaultUrl: 'https://linkedin.com/in/'
  },
  twitter: {
    name: 'Twitter / X',
    badgeColor: 'bg-stone-100 text-stone-800 border-stone-300',
    tabColor: 'bg-stone-900 text-white',
    icon: Twitter,
    placeholderHandle: 'e.g. @yourhandle',
    defaultUrl: 'https://x.com/'
  },
  instagram: {
    name: 'Instagram',
    badgeColor: 'bg-pink-50 text-pink-700 border-pink-200/80',
    tabColor: 'bg-pink-600 text-white',
    icon: Instagram,
    placeholderHandle: 'e.g. @your_creator_handle',
    defaultUrl: 'https://instagram.com/'
  },
  facebook: {
    name: 'Facebook',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    tabColor: 'bg-indigo-600 text-white',
    icon: Facebook,
    placeholderHandle: 'e.g. My Brand Page',
    defaultUrl: 'https://facebook.com/'
  },
  youtube: {
    name: 'YouTube',
    badgeColor: 'bg-red-50 text-red-700 border-red-200/80',
    tabColor: 'bg-red-600 text-white',
    icon: YouTube,
    placeholderHandle: 'e.g. @MyChannel or channel-name',
    defaultUrl: 'https://youtube.com/@'
  }
};

export default function Home() {
  const [niche, setNiche] = useState('');
  const [platforms, setPlatforms] = useState(['linkedin', 'twitter', 'instagram', 'facebook']);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [activeTab, setActiveTab] = useState('linkedin');
  const [visualMode, setVisualMode] = useState('art'); // 'art' (AI Artwork default) or 'card' (Classic card)
  const [copied, setCopied] = useState(false);

  // Connected Accounts State (from MongoDB)
  const [accounts, setAccounts] = useState({
    linkedin: { isConnected: false, username: '' },
    twitter: { isConnected: false, username: '' },
    instagram: { isConnected: false, username: '' },
    facebook: { isConnected: false, username: '' },
    youtube: { isConnected: false, username: '' }
  });

  // Modal State for Connecting an Account
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('linkedin');
  const [formUsername, setFormUsername] = useState('');
  const [formProfileUrl, setFormProfileUrl] = useState('');
  const [formToken, setFormToken] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Publishing State
  const [publishing, setPublishing] = useState(false);

  // Posts & Feedback
  const [latestPost, setLatestPost] = useState(null);
  const [posts, setPosts] = useState([]);
  const [bannerMsg, setBannerMsg] = useState({ type: '', text: '', link: '' });
  const [publishedModal, setPublishedModal] = useState(null);

  // 1. Fetch connected accounts
  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/accounts`);
      const data = await res.json();
      if (data.success && data.accounts) {
        setAccounts(data.accounts);
      }
    } catch (err) {
      console.warn('Could not fetch accounts:', err.message);
    }
  };

  // 2. Fetch published posts
  const fetchPosts = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/posts`);
      const data = await res.json();
      if (data.success && Array.isArray(data.posts)) {
        setPosts(data.posts.map((p) => ({ ...p, imageUrl: normalizeMediaUrl(p.imageUrl) })));
      }
    } catch (err) {
      console.warn('Backend connection note:', err.message);
    }
  };

  // 3. LinkedIn AI Comments Copilot Dashboard State
  const [autoReplyScanning, setAutoReplyScanning] = useState(false);
  const [autoReplyStats, setAutoReplyStats] = useState({ totalRepliesSent: 0, postsWithRepliesCount: 0 });
  const [commentPostId, setCommentPostId] = useState('');
  const [commentCustomUrn, setCommentCustomUrn] = useState('');
  const [commentLinkOrUrn, setCommentLinkOrUrn] = useState('');
  const [commenterName, setCommenterName] = useState('');
  const [incomingComment, setIncomingComment] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [altReplyDraft, setAltReplyDraft] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [repliesHistory, setRepliesHistory] = useState([]);

  const fetchAutoReplyStats = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/linkedin/auto-reply-stats`);
      const data = await res.json();
      if (data.success) {
        setAutoReplyStats({
          totalRepliesSent: data.totalRepliesSent || 0,
          postsWithRepliesCount: data.postsWithRepliesCount || 0
        });

        const list = [];
        (data.history || []).forEach((p) => {
          (p.repliedComments || []).forEach((r) => {
            list.push({
              ...r,
              postTopic: p.research?.topic || p.niche || 'Discussion Post',
              postId: p._id,
              postUrn: p.publishResult?.linkedin?.postId || r.targetUrn || ''
            });
          });
        });
        list.sort((a, b) => new Date(b.repliedAt || 0) - new Date(a.repliedAt || 0));
        setRepliesHistory(list);
      }
    } catch (_) {}
  };

  const handleScanLinkedInReplies = async () => {
    setAutoReplyScanning(true);
    setBannerMsg({ type: '', text: '' });
    try {
      const res = await fetch(`${BACKEND_URL}/api/linkedin/auto-reply-scan`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        const replies = data.result?.totalNewReplies || 0;
        const postsChecked = data.result?.postsChecked || 0;
        setBannerMsg({
          type: 'success',
          text: `🤖 [LinkedIn AI Auto-Reply] Checked ${postsChecked} post(s). ${replies > 0 ? `Sent ${replies} new AI reply(s) to comments!` : 'Scan complete — all comments are up to date.'}`
        });
        fetchAutoReplyStats();
        fetchPosts();
      } else {
        setBannerMsg({
          type: 'error',
          text: data.error || data.result?.reason || 'Failed to scan LinkedIn comments.'
        });
      }
    } catch (err) {
      setBannerMsg({
        type: 'error',
        text: 'Error scanning LinkedIn comments: ' + err.message
      });
    } finally {
      setAutoReplyScanning(false);
    }
  };

  // AI Read & Analyze Comment
  const handleAnalyzeComment = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!incomingComment.trim()) return;

    setIsAnalyzing(true);
    setBannerMsg({ type: '', text: '' });
    try {
      const selectedPost = posts.find((p) => p._id === commentPostId);
      const payload = {
        commentText: incomingComment.trim(),
        commenterName: commenterName.trim() || undefined,
        postId: commentPostId && commentPostId !== 'custom' ? commentPostId : undefined,
        postTopic: selectedPost?.research?.topic || selectedPost?.niche || 'Professional Topic',
        postContent: selectedPost?.content?.linkedin || selectedPost?.content?.twitter || ''
      };

      const res = await fetch(`${BACKEND_URL}/api/linkedin/preview-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success && data.preview) {
        setReplyDraft(data.preview.primaryReply || '');
        setAltReplyDraft(data.preview.alternateReply || '');
        setSentiment(data.preview.sentiment || 'Positive');
      } else {
        setBannerMsg({ type: 'error', text: data.error || 'Could not analyze comment.' });
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: 'Error analyzing comment: ' + err.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Post Reply LIVE to LinkedIn
  const handlePublishCommentReply = async () => {
    if (!replyDraft.trim()) return;

    setIsPostingComment(true);
    setBannerMsg({ type: '', text: '' });
    try {
      const selectedPost = posts.find((p) => p._id === commentPostId);
      const targetUrn = commentPostId === 'custom'
        ? commentCustomUrn.trim()
        : (selectedPost?.publishResult?.linkedin?.postId || '');

      const res = await fetch(`${BACKEND_URL}/api/linkedin/reply-comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: commentPostId && commentPostId !== 'custom' ? commentPostId : undefined,
          linkedinPostUrn: targetUrn || undefined,
          parentCommentUrn: commentLinkOrUrn.trim() || undefined,
          commentText: incomingComment.trim(),
          customReplyText: replyDraft.trim(),
          commenterName: commenterName.trim() || 'LinkedIn Member'
        })
      });
      const data = await res.json();

      if (data.success) {
        setBannerMsg({
          type: 'success',
          text: `🎉 Comment reply successfully posted LIVE on LinkedIn! AI replied: "${data.result?.replyText}"`
        });
        setIncomingComment('');
        setCommentLinkOrUrn('');
        setReplyDraft('');
        setAltReplyDraft('');
        setSentiment('');
        fetchAutoReplyStats();
        fetchPosts();
      } else {
        setBannerMsg({
          type: 'error',
          text: data.error || 'Failed to post reply on LinkedIn.'
        });
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: 'Error publishing comment reply: ' + err.message });
    } finally {
      setIsPostingComment(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchPosts();
    fetchAutoReplyStats();
  }, []);

  useEffect(() => {
    if (!commentPostId && posts.length > 0) {
      const lp = posts.find((p) => p.publishResult?.linkedin?.postId);
      if (lp) setCommentPostId(lp._id);
    }
  }, [posts, commentPostId]);

  // Open modal to connect/manage
  const openConnectModal = (platform) => {
    setSelectedPlatform(platform);
    const existing = accounts[platform];
    setFormUsername(existing?.username || '');
    setFormProfileUrl(existing?.profileUrl || '');
    setFormToken('');
    setModalOpen(true);
  };

  // Save account to MongoDB
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    if (!formUsername.trim()) return;

    setFormSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/accounts/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: selectedPlatform,
          username: formUsername.trim(),
          profileUrl: formProfileUrl.trim() || `${PLATFORM_CONFIG[selectedPlatform].defaultUrl}${formUsername.replace('@', '')}`,
          accessToken: formToken.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setBannerMsg({
          type: 'success',
          text: `Connected ${PLATFORM_CONFIG[selectedPlatform].name} as ${formUsername}!`
        });
        fetchAccounts();
        setModalOpen(false);
      } else {
        setBannerMsg({ type: 'error', text: data.error || 'Failed to connect.' });
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: 'Error connecting account.' });
    } finally {
      setFormSaving(false);
    }
  };

  // Disconnect account
  const handleDisconnect = async (platform) => {
    if (!confirm(`Are you sure you want to disconnect ${PLATFORM_CONFIG[platform].name}?`)) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/accounts/${platform}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setBannerMsg({ type: 'success', text: `Disconnected ${PLATFORM_CONFIG[platform].name}` });
        fetchAccounts();
        setModalOpen(false);
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: 'Error disconnecting.' });
    }
  };

  // Toggle platform selection for pipeline
  const togglePlatform = (p) => {
    if (platforms.includes(p)) {
      if (platforms.length === 1) return;
      setPlatforms(platforms.filter((item) => item !== p));
    } else {
      setPlatforms([...platforms, p]);
    }
  };

  // Visual Regeneration State & Handler
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);

  const handleRegenerateImage = async () => {
    if (!latestPost || isRegeneratingImage) return;
    setIsRegeneratingImage(true);
    setBannerMsg({ type: 'info', text: '🎨 Generating fresh visual asset with AI...' });
    try {
      const res = await fetch(`${BACKEND_URL}/api/pipeline/regenerate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: latestPost.research?.topic,
          imagePrompt: latestPost.content?.imagePrompt,
          summary: latestPost.research?.summary,
          niche: latestPost.niche,
          postId: latestPost._id
        })
      });
      const data = await res.json();
      if (data.success && data.imageUrl) {
        const cleanUrl = normalizeMediaUrl(data.imageUrl);
        setLatestPost((prev) => prev ? { ...prev, imageUrl: cleanUrl } : prev);
        setBannerMsg({ type: 'success', text: '✨ Fresh visual created and synced!' });
      } else {
        setBannerMsg({ type: 'error', text: data.error || 'Failed to regenerate visual.' });
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: 'Error connecting to image generation service.' });
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  // Pipeline Generation
  const triggerPipeline = async () => {
    if (!niche.trim()) return;

    setLoading(true);
    setLatestPost(null); // Clear previous post so old content is never shown during new generation
    setBannerMsg({ type: '', text: '' });
    setStatusText('Step 1/3: Researching trending topics with Google Gemini AI...');

    const t1 = setTimeout(() => {
      setStatusText('Step 2/3: Drafting human editorial copy with Gemini AI...');
    }, 1500);

    const t2 = setTimeout(() => {
      setStatusText('Step 3/3: Designing classic card & rendering visual asset...');
    }, 3500);

    try {
      const res = await fetch(`${BACKEND_URL}/api/pipeline/auto-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, platforms, autoPublish: false })
      });

      const data = await res.json();

      if (data.success) {
        const postData = data.data;
        if (postData?.imageUrl) {
          postData.imageUrl = normalizeMediaUrl(postData.imageUrl);
        }
        setLatestPost(postData);
        setActiveTab('linkedin');
        setBannerMsg({
          type: 'success',
          text: '✨ Post & Editorial Card created! Review below and click "Post to LinkedIn Now" to publish.'
        });
        fetchPosts();
        fetchAccounts();
      } else {
        setBannerMsg({ type: 'error', text: data.error || 'Pipeline execution failed.' });
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: `Failed to reach backend at ${BACKEND_URL}` });
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setLoading(false);
      setStatusText('');
    }
  };

  // 1-Click Publish to active tab platform (with Connect Verification)
  const handlePublishActiveTab = async () => {
    if (!latestPost) return;

    // 1. Gatecheck: If current platform is not connected, prompt user to connect first!
    const isConnected = accounts[activeTab]?.isConnected;
    if (!isConnected) {
      setBannerMsg({
        type: 'error',
        text: `⚠️ ${PLATFORM_CONFIG[activeTab]?.name} is not connected yet! Please enter your username/credentials to connect first.`
      });
      openConnectModal(activeTab);
      return;
    }

    let postText = '';
    if (activeTab === 'linkedin') postText = latestPost.content?.linkedin || latestPost.content?.twitter;
    else if (activeTab === 'twitter') postText = latestPost.content?.twitter || latestPost.content?.linkedin;
    else if (activeTab === 'instagram') postText = latestPost.content?.instagramCaption || latestPost.content?.twitter;
    else if (activeTab === 'facebook') postText = latestPost.content?.facebook || latestPost.content?.linkedin;
    else if (activeTab === 'youtube') postText = latestPost.content?.linkedin || latestPost.content?.twitter;

    if (!postText) return;

    setPublishing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/publish/${activeTab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: postText,
          imageUrl: latestPost.imageUrl,
          postId: latestPost._id
        })
      });

      const data = await res.json();
      if (data.success) {
        const dest = data.result?.username ? `to ${data.result.username}` : `to ${PLATFORM_CONFIG[activeTab]?.name || activeTab}`;
        
        // Show rich celebration prompt modal
        setPublishedModal({
          title: `Post Published to ${PLATFORM_CONFIG[activeTab]?.name}!`,
          topic: latestPost.research?.topic || niche,
          channels: [
            {
              platform: activeTab,
              name: PLATFORM_CONFIG[activeTab]?.name,
              username: data.result?.username || accounts[activeTab]?.username || 'Account',
              postUrl: data.result?.postUrl || accounts[activeTab]?.profileUrl || '#'
            }
          ]
        });

        // Clear draft and input field
        setLatestPost(null);
        setNiche('');

        setBannerMsg({
          type: 'success',
          text: `🎉 Successfully published ${dest}!`,
          link: data.result?.postUrl
        });
        fetchPosts();
        fetchAccounts();
      } else {
        setBannerMsg({ type: 'error', text: data.error || `Publishing to ${activeTab} failed.` });
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: `Failed to dispatch post to ${activeTab}.` });
    } finally {
      setPublishing(false);
    }
  };

  // 1-Click Publish to ALL Connected Platforms
  const handlePublishAll = async () => {
    if (!latestPost) return;

    // Filter which accounts are connected
    const connectedPlatforms = Object.keys(accounts).filter(
      (p) => accounts[p]?.isConnected
    );

    // If zero accounts connected, prompt user to connect first
    if (connectedPlatforms.length === 0) {
      setBannerMsg({
        type: 'error',
        text: '⚠️ No accounts connected yet! Please connect at least one social media account below to post.'
      });
      openConnectModal(activeTab || 'linkedin');
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/publish-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: latestPost._id,
          content: latestPost.content,
          imageUrl: latestPost.imageUrl
        })
      });

      const data = await res.json();
      if (data.success) {
        const publishedChannels = (data.platforms || []).map((p) => {
          const resObj = data.results?.[p] || {};
          return {
            platform: p,
            name: PLATFORM_CONFIG[p]?.name || p,
            username: resObj.username || accounts[p]?.username || 'Account',
            postUrl: resObj.postUrl || accounts[p]?.profileUrl || '#'
          };
        });

        // Show rich celebration prompt modal
        setPublishedModal({
          title: `Published across ${data.publishedCount} Connected Channel(s)!`,
          topic: latestPost.research?.topic || niche,
          channels: publishedChannels
        });

        // Clear draft and input field
        setLatestPost(null);
        setNiche('');

        setBannerMsg({
          type: 'success',
          text: `🎉 Successfully published across ${data.publishedCount} connected channel(s)!`
        });
        fetchPosts();
        fetchAccounts();
      } else {
        setBannerMsg({
          type: 'error',
          text: data.error || 'Multi-channel publishing failed.'
        });
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: 'Failed to dispatch multi-channel post.' });
    } finally {
      setPublishing(false);
    }
  };

  // Delete Post
  const deletePost = async (id) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/posts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setPosts((prev) => prev.filter((p) => p._id !== id));
        if (latestPost && latestPost._id === id) setLatestPost(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Copy current post copy
  const handleCopyText = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentPostText = latestPost
    ? activeTab === 'linkedin'
      ? latestPost.content?.linkedin || latestPost.content?.twitter
      : activeTab === 'twitter'
        ? latestPost.content?.twitter || latestPost.content?.linkedin
        : activeTab === 'instagram'
          ? latestPost.content?.instagramCaption || latestPost.content?.twitter
          : latestPost.content?.facebook || latestPost.content?.linkedin
    : '';

  return (
    <main className="min-h-screen bg-[#fbfbf9] text-stone-900 font-sans p-4 sm:p-6 md:p-10 selection:bg-stone-200">
      <div className="max-w-6xl mx-auto space-y-7">

        {/* 1. Header: Classic Warm Minimalist */}
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-stone-200/80 pb-5 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-stone-900 text-stone-100 flex items-center justify-center shadow-sm">
              <span className="text-red-500 font-bold text-base leading-none">✱</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-stone-900">
                  AutoSocial Studio
                </h1>
                <span className="text-[10px] font-mono uppercase bg-stone-100 text-stone-600 border border-stone-200/90 px-2 py-0.5 rounded-full">
                  Editorial v2.0
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5 font-sans">
                Human-crafted autonomous research, classic cards & multi-channel publishing
              </p>
            </div>
          </div>

          {/* Navigation Bar */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold text-white bg-stone-900 shadow-xs flex items-center gap-1.5">
              📝 Content Studio
            </div>
            <Link
              href="/comments"
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-medium text-blue-700 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 transition shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Bot size={14} className="text-[#0a66c2]" />
              <span>AI Comments Copilot</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </Link>
          </div>
        </header>

        {/* 2. Connected Social Profiles: Clean Classic Cards */}
        <section className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-stone-100 gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-red-500 font-bold text-xs">✱</span>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600 font-mono">
                Connected Social Profiles
              </h2>
            </div>
            <p className="text-xs text-stone-400 font-sans">
              Connect accounts directly in UI without touching .env
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {Object.keys(PLATFORM_CONFIG).map((pKey) => {
              const cfg = PLATFORM_CONFIG[pKey];
              const acc = accounts[pKey] || { isConnected: false, username: '' };
              const Icon = cfg.icon;

              return (
                <div
                  key={pKey}
                  className={`p-3.5 rounded-xl border transition flex flex-col justify-between ${acc.isConnected
                    ? 'bg-[#fcfbf8] border-stone-300/80 shadow-xs'
                    : 'bg-stone-50/60 border-dashed border-stone-200 text-stone-500'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${acc.isConnected ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-500'}`}>
                        <Icon size={14} />
                      </div>
                      <span className="text-xs font-bold text-stone-800">{cfg.name}</span>
                    </div>

                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${acc.isConnected
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium'
                        : 'bg-stone-100 text-stone-400 border-stone-200'
                        }`}
                    >
                      {acc.isConnected ? 'Connected' : 'Offline'}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-stone-200/60 flex items-center justify-between">
                    <div className="overflow-hidden">
                      <p className="text-xs font-medium text-stone-800 truncate" title={acc.username || 'Not connected'}>
                        {acc.username || 'Not set'}
                      </p>
                      {acc.postCount > 0 && (
                        <p className="text-[10px] text-stone-400 font-mono mt-0.5">
                          {acc.postCount} published
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => openConnectModal(pKey)}
                      className="text-[11px] font-mono text-stone-600 hover:text-stone-900 underline ml-2 shrink-0 cursor-pointer"
                    >
                      {acc.isConnected ? 'Manage' : 'Connect'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* LinkedIn AI Auto-Reply Launcher Card */}
          <div className="mt-5 pt-4 border-t border-stone-200/80 bg-gradient-to-r from-blue-50/70 via-white to-stone-50 border border-blue-200/60 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0a66c2]/10 text-[#0a66c2] flex items-center justify-center shrink-0 border border-blue-200/50">
                <Bot size={20} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-bold text-stone-900 font-mono">
                    LinkedIn AI Comments Copilot & Auto-Responder
                  </h3>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Cron (Every 1 min ⚡)
                  </span>
                  {autoReplyStats.totalRepliesSent > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                      {autoReplyStats.totalRepliesSent} Live Replies Sent
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-stone-500 font-sans mt-0.5">
                  Autonomous comment reading, sentiment analysis, and live threaded replies via Google Gemini AI.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleScanLinkedInReplies}
                disabled={autoReplyScanning}
                className="px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200/90 transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {autoReplyScanning ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {autoReplyScanning ? 'Scanning Feed...' : 'Scan Feed ⚡'}
              </button>

              <Link
                href="/comments"
                className="px-4 py-2.5 rounded-xl text-xs font-mono font-bold text-white bg-[#0a66c2] hover:bg-[#004182] transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Bot size={14} />
                <span>Open Comments Copilot Page 🚀</span>
              </Link>
            </div>
          </div>
        </section>

        {/* 3. Action Studio: Research & Generate */}
        <section className="bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-5 space-y-1.5">
              <label className="text-xs font-semibold text-stone-700 font-mono flex items-center gap-1.5">
                <span>Topic / Keywords</span>
              </label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. Node.js, AI Agents, Electric Vehicles, Web Development"
                className="w-full bg-[#fbfbf9] border border-stone-200 focus:border-stone-400 text-stone-900 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition"
              />
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-semibold text-stone-700 font-mono">
                Target Channels
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {['linkedin', 'twitter', 'instagram', 'facebook'].map((pKey) => {
                  const cfg = PLATFORM_CONFIG[pKey];
                  const selected = platforms.includes(pKey);
                  return (
                    <button
                      key={pKey}
                      type="button"
                      onClick={() => togglePlatform(pKey)}
                      className={`px-3 py-1.5 rounded-full text-xs font-mono font-medium border transition cursor-pointer ${selected
                        ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                        : 'bg-stone-100 text-stone-500 border-stone-200 hover:text-stone-800'
                        }`}
                    >
                      {cfg.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-3">
              <button
                type="button"
                onClick={triggerPipeline}
                disabled={loading}
                className="w-full h-[42px] flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-medium text-xs font-mono rounded-xl transition shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {loading ? 'Researching...' : '✨ Create Post & Card'}
              </button>
            </div>
          </div>

          {statusText && (
            <div className="p-3 bg-[#fcfbf8] rounded-xl text-xs font-mono text-stone-700 border border-stone-200 flex items-center gap-2">
              <RefreshCw size={13} className="animate-spin text-red-500" />
              <span>{statusText}</span>
            </div>
          )}

          {bannerMsg.text && (
            <div
              className={`p-3.5 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border ${bannerMsg.type === 'success'
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-red-50/70 border-red-200 text-red-900'
                }`}
            >
              <div className="flex items-center gap-2">
                {bannerMsg.type === 'success' ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertCircle size={15} className="text-red-600" />}
                <span className="font-medium">{bannerMsg.text}</span>
              </div>
              {bannerMsg.link && (
                <a
                  href={bannerMsg.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-bold underline text-stone-900 hover:text-blue-700 flex items-center gap-1 shrink-0 ml-6 sm:ml-0"
                >
                  View Live Post <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
        </section>

        {/* Loading State Skeleton */}
        {loading && (
          <div className="bg-white border border-stone-200/80 rounded-2xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-red-50 text-red-600 rounded-full mb-3">
              <Sparkles size={22} className="animate-spin" />
            </div>
            <h3 className="text-sm font-semibold text-stone-900 mb-1">
              Generating Live AI Content {niche ? `for "${niche}"` : ''}
            </h3>
            <p className="text-xs text-stone-500 font-mono max-w-md mx-auto">{statusText || 'Researching trends, drafting social copy, and generating high-res visual asset...'}</p>
          </div>
        )}

        {/* 4. Inspector Preview: Multi-Channel Human Post & Classic Card */}
        {latestPost && !loading && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Column A: Editorial Post Copy */}
            <div className="lg:col-span-7 bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-stone-100 pb-3 mb-4 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 font-bold text-xs">✱</span>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700 font-mono">
                      Human Post Draft
                    </h3>
                  </div>

                  <div className="flex items-center bg-[#fcfbf8] p-1 rounded-xl border border-stone-200/80 gap-1">
                    {['linkedin', 'twitter', 'instagram', 'facebook'].map((pKey) => {
                      const cfg = PLATFORM_CONFIG[pKey];
                      const active = activeTab === pKey;
                      const isConn = accounts[pKey]?.isConnected;
                      return (
                        <button
                          key={pKey}
                          onClick={() => setActiveTab(pKey)}
                          className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-xs font-mono flex items-center gap-1.5 ${active
                            ? 'bg-stone-900 text-white font-medium shadow-xs'
                            : 'text-stone-500 hover:text-stone-800'
                            }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${isConn ? 'bg-emerald-500' : 'bg-stone-300'}`}
                            title={isConn ? `${cfg.name}: Connected` : `${cfg.name}: Not Connected`}
                          />
                          {cfg.name.split(' ')[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#fcfbf8] border border-stone-200/80 rounded-xl p-3.5 mb-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-400 font-mono">Researched Headline</span>
                    <p className="text-xs font-semibold text-stone-900 mt-0.5">{latestPost.research?.topic}</p>
                  </div>

                  {!accounts[activeTab]?.isConnected && (
                    <button
                      type="button"
                      onClick={() => openConnectModal(activeTab)}
                      className="text-[11px] text-amber-800 font-mono bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200 shrink-0 ml-2 flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus size={11} /> Connect {PLATFORM_CONFIG[activeTab]?.name}
                    </button>
                  )}
                </div>

                <div className="bg-[#fcfbf8] border border-stone-200/80 rounded-xl p-4 text-sm text-stone-800 font-sans leading-relaxed whitespace-pre-wrap min-h-[160px] select-text">
                  {currentPostText}
                </div>
              </div>

              {/* Action: Copy, 1-Click Publish to Active Channel, and Multi-Channel Blast */}
              <div className="mt-5 pt-3.5 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleCopyText(currentPostText)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200/70 transition cursor-pointer self-start sm:self-auto"
                >
                  {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Single Channel Button (with Connect Gatecheck) */}
                  <button
                    type="button"
                    onClick={handlePublishActiveTab}
                    disabled={publishing}
                    className={`flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-xs font-mono font-semibold transition shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${!accounts[activeTab]?.isConnected
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : activeTab === 'linkedin'
                        ? 'bg-[#0a66c2] hover:bg-[#004182]'
                        : 'bg-stone-900 hover:bg-stone-800'
                      }`}
                  >
                    {publishing ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : !accounts[activeTab]?.isConnected ? (
                      <Plus size={13} />
                    ) : (
                      <Share2 size={13} />
                    )}
                    {publishing
                      ? `Publishing to ${PLATFORM_CONFIG[activeTab]?.name}...`
                      : !accounts[activeTab]?.isConnected
                        ? `🔗 Connect ${PLATFORM_CONFIG[activeTab]?.name} to Post`
                        : `🚀 Post to ${PLATFORM_CONFIG[activeTab]?.name}`}
                  </button>

                  {/* Multi-Channel Blast: Publish across all connected channels */}
                  <button
                    type="button"
                    onClick={handlePublishAll}
                    disabled={publishing}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${Object.keys(accounts).filter((p) => accounts[p]?.isConnected).length > 0
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-600 border border-stone-200'
                      }`}
                    title={Object.keys(accounts).filter((p) => accounts[p]?.isConnected).length > 0
                      ? 'Publish simultaneously across all connected platforms'
                      : 'Connect social accounts first'}
                  >
                    <Sparkles size={13} />
                    {Object.keys(accounts).filter((p) => accounts[p]?.isConnected).length > 0
                      ? `⚡ Blast All Connected (${Object.keys(accounts).filter((p) => accounts[p]?.isConnected).length})`
                      : '🔗 Connect Channels to Blast'}
                  </button>
                </div>
              </div>
            </div>

            {/* Column B: Visual Asset Studio (Classic Editorial Card vs Artwork) */}
            <div className="lg:col-span-5 bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 font-bold text-xs">✱</span>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700 font-mono">
                      Visual Asset Studio
                    </h3>
                  </div>

                  {/* Switch between AI Image & Card Layout */}
                  <div className="flex items-center bg-[#fcfbf8] p-1 rounded-xl border border-stone-200/80 gap-1 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setVisualMode('art')}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${visualMode === 'art'
                        ? 'bg-stone-900 text-white font-medium shadow-xs'
                        : 'text-stone-500 hover:text-stone-800'
                        }`}
                    >
                      <ImageIcon size={12} /> AI Image (Primary)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisualMode('card')}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${visualMode === 'card'
                        ? 'bg-stone-900 text-white font-medium shadow-xs'
                        : 'text-stone-500 hover:text-stone-800'
                        }`}
                    >
                      <LayoutTemplate size={12} /> Card Mockup
                    </button>
                  </div>
                </div>

                {visualMode === 'card' ? (
                  /* 1-to-1 Recreation of the User's Classic Minimalist Card Reference */
                  <div className="bg-[#fcfbf8] border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between min-h-[320px]">
                    {/* Top Bar: * [Icon] Topic / Skill Title */}
                    <div className="flex items-center justify-between pb-3.5 border-b border-stone-200/60">
                      <div className="flex items-center gap-2">
                        <span className="text-red-500 font-bold text-xs">✱</span>
                        <div className="w-5 h-5 rounded-md bg-red-600 text-white flex items-center justify-center">
                          <YouTube size={12} />
                        </div>
                        <span className="text-xs font-bold text-stone-800 font-sans">
                          {PLATFORM_CONFIG[activeTab]?.name} Agent Skill
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-stone-400">
                        Public
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="py-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-stone-500 text-xs">🗂</span>
                        <h4 className="font-mono text-sm font-bold text-stone-900 tracking-tight">
                          {(latestPost.research?.topic || 'agent-skill')
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .slice(0, 32)}
                        </h4>
                        <span className="text-[10px] font-mono bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded-full">
                          Public
                        </span>
                      </div>

                      <p className="text-xs text-stone-700 font-sans leading-relaxed">
                        {latestPost.research?.summary || 'Autonomous multi-channel skill workflow orchestrator.'}
                      </p>

                      {/* Pill tags matching reference screenshot */}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <span className="text-xs font-mono bg-stone-100/90 text-stone-600 border border-stone-200 px-2.5 py-0.5 rounded-full">
                          MIT License
                        </span>
                        <span className="text-xs font-mono bg-red-50 text-red-600 border border-red-200/70 px-2.5 py-0.5 rounded-full">
                          Open source
                        </span>
                        <span className="text-xs font-mono bg-stone-100/90 text-stone-600 border border-stone-200 px-2.5 py-0.5 rounded-full">
                          11 skills
                        </span>
                      </div>

                      {/* Clean source link */}
                      <div className="pt-2 text-[11px] font-mono text-stone-400 truncate">
                        github.com/···/{(latestPost.niche || 'agent-skill').toLowerCase().replace(/\s+/g, '-')}
                      </div>
                    </div>

                    {/* Bottom Red Progress Scrubber Line */}
                    <div className="pt-3 border-t border-stone-200/60">
                      <div className="w-full h-1 bg-stone-200 rounded-full overflow-hidden relative">
                        <div className="h-full bg-red-500 w-1/4 rounded-full" />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Clean Warm Editorial AI Artwork */
                  <div className="aspect-square w-full rounded-2xl overflow-hidden bg-[#fcfbf8] border border-stone-200 flex items-center justify-center relative group">
                    <img
                      src={normalizeMediaUrl(latestPost.imageUrl)}
                      alt="AI Editorial Creative"
                      onError={(e) => {
                        const fallbackPrompt = encodeURIComponent(
                          `${latestPost.research?.topic || latestPost.niche || 'Technology Innovation'}, 3D modern conceptual illustration, minimal, 8k`
                        );
                        const fallbackUrl = `https://image.pollinations.ai/prompt/${fallbackPrompt}?width=1080&height=1080&nologo=true&seed=42`;
                        e.currentTarget.src = fallbackUrl;
                        setLatestPost((prev) => prev ? { ...prev, imageUrl: fallbackUrl } : prev);
                      }}
                      className="w-full h-full object-cover object-top"
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRegenerateImage}
                        disabled={isRegeneratingImage}
                        className="bg-stone-900/80 hover:bg-stone-900 text-white px-2.5 py-1.5 rounded-xl text-xs font-mono backdrop-blur-xs transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                        title="Generate a new AI visual"
                      >
                        <RefreshCw size={12} className={isRegeneratingImage ? 'animate-spin' : ''} />
                        {isRegeneratingImage ? 'Creating...' : 'New Visual'}
                      </button>
                      <a
                        href={normalizeMediaUrl(latestPost.imageUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-stone-900/80 hover:bg-stone-900 text-white p-2 rounded-xl text-xs font-mono backdrop-blur-xs transition flex items-center gap-1.5 shadow-sm"
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400 font-mono">
                <span>Format: 1:1 Editorial</span>
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Ready to Publish
                </span>
              </div>
            </div>

          </section>
        )}

        {/* 5. Ledger History: Published Posts Only */}
        <section className="bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between pb-3.5 border-b border-stone-100 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-red-500 font-bold text-xs">✱</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700 font-mono">
                Published Posts Ledger ({posts.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={fetchPosts}
              className="text-xs font-mono text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {posts.length === 0 ? (
            <div className="text-center py-10 text-stone-400 text-xs font-mono">
              No published posts yet. Generate and publish a post above to view it in the ledger.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-stone-100 text-stone-400 font-mono uppercase text-[10px]">
                    <th className="pb-2.5 font-medium">Topic</th>
                    <th className="pb-2.5 font-medium">Channels</th>
                    <th className="pb-2.5 font-medium">Date</th>
                    <th className="pb-2.5 font-medium">Status</th>
                    <th className="pb-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {posts.map((p) => {
                    const isSelected = latestPost?._id === p._id;
                    const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Today';

                    return (
                      <tr
                        key={p._id}
                        onClick={() => setLatestPost(p)}
                        className={`hover:bg-[#fcfbf8] transition cursor-pointer ${isSelected ? 'bg-stone-50 font-medium' : ''
                          }`}
                      >
                        <td className="py-3 text-stone-800 max-w-xs truncate">
                          {p.research?.topic || p.niche}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            {p.platforms?.map((plat) => (
                              <span
                                key={plat}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-stone-100 text-stone-600 border border-stone-200"
                              >
                                {plat}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 text-stone-500 font-mono text-[11px]">
                          {dateStr}
                        </td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${p.status === 'published'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium'
                              : 'bg-stone-100 text-stone-600 border-stone-200'
                              }`}
                          >
                            {p.status || 'ready'}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePost(p._id);
                            }}
                            className="text-stone-400 hover:text-red-600 p-1 rounded-lg transition"
                            title="Delete Post"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>

      {/* Account Connection Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-stone-900/30 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-red-500 font-bold text-xs">✱</span>
                  <h3 className="font-mono text-sm font-bold text-stone-900">
                    Connect {PLATFORM_CONFIG[selectedPlatform]?.name}
                  </h3>
                </div>
                <p className="text-[11px] text-stone-400 font-sans mt-0.5">
                  Enter your handle & credentials so your posts can be published directly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-3.5">
              <div>
                <label className="text-xs font-mono text-stone-600 block mb-1">
                  Username / Profile Handle *
                </label>
                <input
                  type="text"
                  required
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder={PLATFORM_CONFIG[selectedPlatform]?.placeholderHandle}
                  className="w-full bg-[#fbfbf9] border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-400"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-stone-600 block mb-1">
                  Profile URL (Optional)
                </label>
                <input
                  type="url"
                  value={formProfileUrl}
                  onChange={(e) => setFormProfileUrl(e.target.value)}
                  placeholder={`${PLATFORM_CONFIG[selectedPlatform]?.defaultUrl}...`}
                  className="w-full bg-[#fbfbf9] border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-400"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-stone-600 block mb-1">
                  Access Token / API Key
                </label>
                <textarea
                  rows={2}
                  value={formToken}
                  onChange={(e) => setFormToken(e.target.value)}
                  placeholder={
                    selectedPlatform === 'instagram'
                      ? 'Paste Meta User Access Token (from developers.facebook.com)...'
                      : selectedPlatform === 'facebook'
                        ? 'Paste Facebook Page Access Token (pages_manage_posts)...'
                        : selectedPlatform === 'linkedin'
                          ? 'Paste LinkedIn OAuth 2.0 Access Token...'
                          : 'Paste OAuth Access Token / API Key...'
                  }
                  className="w-full bg-[#fbfbf9] border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-mono"
                />
                <p className="text-[10px] text-stone-400 font-sans mt-1">
                  {selectedPlatform === 'instagram'
                    ? 'Meta Graph API token with instagram_content_publish permission is required to post live.'
                    : selectedPlatform === 'facebook'
                      ? 'Meta rules: Only Facebook Pages allow automated posting (Personal profiles are not supported by Meta). Requires Page Access Token.'
                      : selectedPlatform === 'linkedin'
                        ? 'LinkedIn token with w_member_social permission is required to post live.'
                        : 'Stored securely in database for automated publishing.'}
                </p>
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                {accounts[selectedPlatform]?.isConnected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(selectedPlatform)}
                    className="text-xs font-mono text-red-600 hover:text-red-700 underline"
                  >
                    Disconnect
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-mono text-stone-600 bg-stone-100 hover:bg-stone-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSaving}
                    className="px-4 py-2 rounded-xl text-xs font-mono font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50"
                  >
                    {formSaving ? 'Saving...' : 'Save & Connect'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Post Published Celebration Modal Prompt */}
      {publishedModal && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-lg p-6 sm:p-7 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            {/* Header with celebration icon */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/80 shadow-xs">
                  <CheckCircle2 size={26} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 tracking-tight">
                    {publishedModal.title}
                  </h3>
                  <p className="text-xs text-stone-500 font-sans mt-0.5">
                    Your post has been successfully dispatched to the live feeds!
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPublishedModal(null)}
                className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Published Topic Card */}
            {publishedModal.topic && (
              <div className="bg-[#fcfbf8] border border-stone-200/80 rounded-2xl p-3.5">
                <span className="text-[10px] font-mono uppercase text-stone-400 font-bold block mb-1">
                  Published Headline & Story
                </span>
                <p className="text-xs font-semibold text-stone-800 line-clamp-2">
                  {publishedModal.topic}
                </p>
              </div>
            )}

            {/* List of Destination Channels with Live Links */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-stone-500 uppercase tracking-wider">
                <span>Destination Channels</span>
                <span>Status</span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {publishedModal.channels?.map((ch) => {
                  const cfg = PLATFORM_CONFIG[ch.platform] || { name: ch.platform, icon: Globe };
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={ch.platform}
                      className="p-3 rounded-2xl border border-stone-200/80 bg-white hover:bg-[#fcfbf8] transition flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-stone-900 truncate">{cfg.name}</span>
                            <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded-full font-medium">
                              Live
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500 font-mono truncate">{ch.username}</p>
                        </div>
                      </div>

                      {ch.postUrl && ch.postUrl !== '#' ? (
                        <a
                          href={ch.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-mono font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 px-3 py-1.5 rounded-xl transition shrink-0"
                        >
                          View Live <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-xs font-mono text-emerald-600 font-medium">
                          ✓ Sent
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Action: Create Next Post */}
            <div className="pt-2 border-t border-stone-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setPublishedModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-mono font-bold text-white bg-stone-900 hover:bg-stone-800 transition shadow-sm cursor-pointer"
              >
                ✨ Create Another Post
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}