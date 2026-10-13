'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bot,
  RefreshCw,
  Sparkles,
  Send,
  CornerDownRight,
  ArrowLeft,
  MessageSquare,
  CheckCircle2,
  ExternalLink,
  ThumbsUp,
  Heart,
  Copy,
  Check,
  Clock,
  User,
  ArrowRight,
  Layers,
  Flame,
  Globe
} from 'lucide-react';
import { Linkedin } from '@/components/SocialIcons';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'https://auto-social-tool-ctzn.vercel.app').replace(/\/$/, '');

export default function CommentsPage() {
  const [posts, setPosts] = useState([]);
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
  const [selectedTone, setSelectedTone] = useState('insightful'); // 'insightful', 'warm', 'concise', 'question'
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isLikingComment, setIsLikingComment] = useState(false);
  const [repliesHistory, setRepliesHistory] = useState([]);
  const [bannerMsg, setBannerMsg] = useState({ type: '', text: '' });
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [activeTab, setActiveTab] = useState('studio'); // 'studio' | 'ledger'

  // 1. Fetch published posts
  const fetchPosts = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/posts`);
      const data = await res.json();
      if (data.success && Array.isArray(data.posts)) {
        setPosts(data.posts);
        const linkedInPost = data.posts.find((p) => p.publishResult?.linkedin?.postId);
        if (linkedInPost && !commentPostId) {
          setCommentPostId(linkedInPost._id);
        }
      }
    } catch (err) {
      console.warn('Could not fetch posts:', err.message);
    }
  };

  // 2. Fetch Auto-Reply stats and history
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

  useEffect(() => {
    fetchPosts();
    fetchAutoReplyStats();
  }, []);

  // Scan LinkedIn for new comments
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
          text: `🤖 Checked ${postsChecked} post(s). ${replies > 0 ? `Sent ${replies} new AI reply(s) to comments!` : 'Scan complete — all comments are currently answered.'}`
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
      const baseTopic = selectedPost?.research?.topic || selectedPost?.niche || 'Professional Topic';
      const toneInstruction = selectedTone === 'warm' 
        ? `${baseTopic} (Tone: warm, appreciative and humble)`
        : selectedTone === 'concise'
        ? `${baseTopic} (Tone: short, crisp and punchy, 1 sentence)`
        : selectedTone === 'question'
        ? `${baseTopic} (Tone: engaging, ends with an insightful question)`
        : `${baseTopic} (Tone: thoughtful, industry-expert and insightful)`;

      const payload = {
        commentText: incomingComment.trim(),
        commenterName: commenterName.trim() || undefined,
        postId: commentPostId && commentPostId !== 'custom' ? commentPostId : undefined,
        postTopic: toneInstruction,
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

  // Standalone Like Comment
  const handleLikeCommentOnly = async () => {
    if (!commentLinkOrUrn.trim()) {
      setBannerMsg({ type: 'error', text: 'Please paste the LinkedIn comment link above to like it.' });
      return;
    }

    setIsLikingComment(true);
    setBannerMsg({ type: '', text: '' });
    try {
      const selectedPost = posts.find((p) => p._id === commentPostId);
      const postUrn = commentPostId === 'custom' ? commentCustomUrn.trim() : (selectedPost?.publishResult?.linkedin?.postId || '');

      const res = await fetch(`${BACKEND_URL}/api/linkedin/like-comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentUrn: commentLinkOrUrn.trim(),
          postUrn
        })
      });
      const data = await res.json();
      if (data.success) {
        setBannerMsg({
          type: 'success',
          text: '❤️ Comment liked on LinkedIn (👍 reaction registered)!'
        });
      } else {
        setBannerMsg({
          type: 'error',
          text: data.error || data.message || 'Could not react to comment.'
        });
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: 'Error liking comment: ' + err.message });
    } finally {
      setIsLikingComment(false);
    }
  };

  // Post Reply LIVE to LinkedIn (with auto-like)
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
        const likeNotice = data.result?.liked ? ' + Liked (👍)' : '';
        setBannerMsg({
          type: 'success',
          text: `🎉 Reply published on LinkedIn${likeNotice}! AI replied: "${data.result?.replyText}"`
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

  // Quick Copy Draft
  const handleCopyDraft = () => {
    if (!replyDraft) return;
    navigator.clipboard.writeText(replyDraft);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  // Quick load sample comment
  const handleLoadSample = (sampleText, sampleAuthor = 'Alex Johnson') => {
    setIncomingComment(sampleText);
    setCommenterName(sampleAuthor);
  };

  const selectedPostObj = posts.find((p) => p._id === commentPostId);

  return (
    <main className="min-h-screen bg-[#fbfbf9] text-stone-900 font-sans p-4 sm:p-6 md:p-10 selection:bg-stone-200">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* 1. Classic Studio Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-stone-200/80 pb-5 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-stone-900 text-stone-100 flex items-center justify-center shadow-xs">
              <span className="text-red-500 font-bold text-base leading-none">✱</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-stone-900">
                  AutoSocial Copilot
                </h1>
                <span className="text-[10px] font-mono uppercase bg-stone-100 text-stone-600 border border-stone-200/90 px-2 py-0.5 rounded-full font-medium">
                  Editorial v2.0
                </span>
                <span className="text-[10px] font-mono uppercase bg-blue-50 text-blue-700 border border-blue-200/80 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <Linkedin size={10} /> LinkedIn Responder
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5 font-sans">
                Human-grade AI comment replies, threaded conversations and auto-likes for your LinkedIn presence
              </p>
            </div>
          </div>

          {/* Navigation Bar */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <Link
              href="/"
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-medium text-stone-600 bg-white hover:bg-stone-100 border border-stone-200/80 transition flex items-center gap-1.5 shadow-xs"
            >
              📝 Content Studio
            </Link>
            <div className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold text-white bg-stone-900 shadow-xs flex items-center gap-1.5">
              <Bot size={13} className="text-stone-300" /> Comments Copilot
            </div>
          </div>
        </header>

        {/* 2. Feedback Alert Banner */}
        {bannerMsg.text && (
          <div
            className={`p-3.5 sm:p-4 rounded-2xl border text-xs font-mono flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
              bannerMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                : 'bg-red-50 text-red-800 border-red-200/80'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{bannerMsg.type === 'success' ? '✓' : '⚠'}</span>
              <span>{bannerMsg.text}</span>
            </div>
            <button
              onClick={() => setBannerMsg({ type: '', text: '' })}
              className="text-stone-400 hover:text-stone-700 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 3. Status Bar & View Switcher */}
        <section className="bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0a66c2] flex items-center justify-center shrink-0 border border-blue-200/60 shadow-xs">
              <Linkedin size={20} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-stone-900 font-mono">
                  Autonomous Background Bot
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active (1-Min Sync)
                </span>
                {autoReplyStats.totalRepliesSent > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200 font-medium">
                    {autoReplyStats.totalRepliesSent} Live Replies
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 font-sans mt-0.5">
                Connected Profile: <span className="font-mono text-stone-700 font-medium">urn:li:person:c5I8n_aGMS</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {/* View switcher tabs */}
            <div className="flex bg-[#fcfbf8] border border-stone-200 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('studio')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'studio'
                    ? 'bg-white text-stone-900 shadow-xs border border-stone-200/80 font-bold'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <Sparkles size={12} className={activeTab === 'studio' ? 'text-amber-500' : ''} />
                Reply Studio
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'ledger'
                    ? 'bg-white text-stone-900 shadow-xs border border-stone-200/80 font-bold'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <Clock size={12} />
                Activity Ledger ({repliesHistory.length})
              </button>
            </div>

            <button
              type="button"
              onClick={handleScanLinkedInReplies}
              disabled={autoReplyScanning}
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-medium text-white bg-[#0a66c2] hover:bg-[#004182] transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              title="Scan LinkedIn for incoming comments right now"
            >
              <RefreshCw size={12} className={autoReplyScanning ? 'animate-spin' : ''} />
              <span>{autoReplyScanning ? 'Scanning...' : 'Scan Feed ⚡'}</span>
            </button>
          </div>
        </section>

        {/* 4. Primary Workspace: Classic 2-Column Copilot */}
        {activeTab === 'studio' && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

              {/* LEFT CARD: Incoming Comment Input */}
              <div className="lg:col-span-6 bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  
                  {/* Section Title */}
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <span className="text-red-500 font-bold text-xs">✱</span>
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600 font-mono">
                        Incoming Comment Details
                      </h2>
                    </div>
                    <span className="text-[10px] font-mono text-stone-400">Step 1 of 2</span>
                  </div>

                  {/* Post Context Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono font-medium text-stone-700 flex items-center justify-between">
                      <span>Target Post Context</span>
                      <span className="text-[10px] text-stone-400 font-sans">
                        {posts.length} published post(s) found
                      </span>
                    </label>
                    <select
                      value={commentPostId}
                      onChange={(e) => setCommentPostId(e.target.value)}
                      className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-sans cursor-pointer transition shadow-2xs"
                    >
                      {posts.filter((p) => p.publishResult?.linkedin?.postId).map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.research?.topic || p.niche} ({new Date(p.createdAt).toLocaleDateString()})
                        </option>
                      ))}
                      <option value="custom">✏️ Enter Custom LinkedIn Post URL / URN</option>
                    </select>
                  </div>

                  {commentPostId === 'custom' && (
                    <div className="space-y-1 animate-in fade-in duration-150">
                      <label className="text-xs font-mono font-medium text-stone-700 block">
                        Custom Post URL or URN
                      </label>
                      <input
                        type="text"
                        value={commentCustomUrn}
                        onChange={(e) => setCommentCustomUrn(e.target.value)}
                        placeholder="https://www.linkedin.com/feed/update/urn:li:activity:... or urn:li:share:..."
                        className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-mono"
                      />
                    </div>
                  )}

                  {/* Comment Link / Thread Link (Optional) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono font-medium text-stone-700 flex items-center gap-1.5">
                        <span>Direct Comment Link</span>
                        <span className="text-[10px] text-stone-400 font-normal">(For Threaded Reply)</span>
                      </label>
                      <span className="text-[10px] font-mono text-stone-400">
                        ··· &gt; Copy link to comment
                      </span>
                    </div>
                    <input
                      type="text"
                      value={commentLinkOrUrn}
                      onChange={(e) => setCommentLinkOrUrn(e.target.value)}
                      placeholder="Paste link from LinkedIn (e.g. https://lnkd.in/p/...)"
                      className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-mono transition shadow-2xs"
                    />
                    {commentLinkOrUrn.trim() ? (
                      <div className="text-[11px] font-sans text-emerald-800 flex items-center gap-1.5 bg-emerald-50/80 border border-emerald-200/80 px-2.5 py-1 rounded-lg">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span><strong>Threaded Mode Active:</strong> Reply will be nested directly under this comment and auto-liked (👍).</span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-stone-400 font-sans">
                        Tip: Click (···) on the LinkedIn comment &gt; "Copy link to comment" to reply inside the thread.
                      </p>
                    )}
                  </div>

                  {/* Commenter Name & Comment Text */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-1 space-y-1.5">
                      <label className="text-xs font-mono font-medium text-stone-700 block">
                        Commenter
                      </label>
                      <input
                        type="text"
                        value={commenterName}
                        onChange={(e) => setCommenterName(e.target.value)}
                        placeholder="e.g. Alex"
                        className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-sans transition shadow-2xs"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="text-xs font-mono font-medium text-stone-700 flex items-center justify-between">
                        <span>Comment Text *</span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {incomingComment.length} chars
                        </span>
                      </label>
                      <textarea
                        rows={3}
                        value={incomingComment}
                        onChange={(e) => setIncomingComment(e.target.value)}
                        placeholder="Paste what the user wrote on LinkedIn..."
                        className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl p-2.5 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-sans resize-y leading-relaxed transition shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Tone Preset Chips */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">
                      AI Reply Tone:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {[
                        { id: 'insightful', label: '✨ Insightful', desc: 'Expert & nuanced' },
                        { id: 'warm', label: '🤝 Warm', desc: 'Humble & thankful' },
                        { id: 'concise', label: '⚡ Punchy', desc: '1 short sentence' },
                        { id: 'question', label: '❓ Follow-up', desc: 'Ask a question' }
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTone(t.id)}
                          className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-mono transition text-left cursor-pointer ${
                            selectedTone === t.id
                              ? 'bg-stone-900 text-white border-stone-900 font-medium shadow-xs'
                              : 'bg-[#fcfbf8] text-stone-600 border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          <div className="font-semibold">{t.label}</div>
                          <div className={`text-[9px] ${selectedTone === t.id ? 'text-stone-300' : 'text-stone-400'}`}>
                            {t.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sample Pills */}
                  {!incomingComment && (
                    <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-sans">
                      <span className="text-stone-400 font-mono">Try Sample:</span>
                      <button
                        type="button"
                        onClick={() => handleLoadSample('Great insights! How do you recommend scaling this with a smaller team?')}
                        className="text-stone-600 bg-stone-100 hover:bg-stone-200 px-2 py-0.5 rounded-md transition cursor-pointer"
                      >
                        "Scaling with smaller team?"
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLoadSample('Totally agree with this breakdown, huge time saver.')}
                        className="text-stone-600 bg-stone-100 hover:bg-stone-200 px-2 py-0.5 rounded-md transition cursor-pointer"
                      >
                        "Totally agree..."
                      </button>
                    </div>
                  )}

                </div>

                {/* Generate AI Button */}
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={handleAnalyzeComment}
                    disabled={isAnalyzing || !incomingComment.trim()}
                    className="w-full py-2.5 rounded-xl text-xs font-mono font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-40 transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isAnalyzing ? (
                      <RefreshCw size={13} className="animate-spin text-amber-400" />
                    ) : (
                      <Sparkles size={13} className="text-yellow-400" />
                    )}
                    {isAnalyzing ? 'Crafting Personalized Response...' : '✦ Generate AI Reply'}
                  </button>
                </div>

              </div>

              {/* RIGHT CARD: AI Crafted Response & 1-Click Publishing */}
              <div className="lg:col-span-6 bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
                
                {replyDraft ? (
                  <div className="space-y-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-3">
                      
                      {/* Section Title with Sentiment badge */}
                      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                        <div className="flex items-center gap-2">
                          <span className="text-red-500 font-bold text-xs">✱</span>
                          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600 font-mono">
                            AI Crafted Reply
                          </h2>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {sentiment && (
                            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              {sentiment}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={handleCopyDraft}
                            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                            title="Copy reply text"
                          >
                            {copiedDraft ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>

                      {/* Editable Textarea */}
                      <div className="space-y-1">
                        <textarea
                          rows={5}
                          value={replyDraft}
                          onChange={(e) => setReplyDraft(e.target.value)}
                          placeholder="AI response draft..."
                          className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl p-3.5 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-sans resize-y leading-relaxed transition shadow-2xs"
                        />
                        <div className="flex items-center justify-between text-[10px] font-mono text-stone-400 px-1">
                          <span>Feel free to edit before publishing</span>
                          <span>{replyDraft.length} chars</span>
                        </div>
                      </div>

                      {/* Alternative Option Card */}
                      {altReplyDraft && (
                        <div className="p-3 rounded-xl bg-stone-50/80 border border-stone-200/80 text-[11px] space-y-1.5 transition">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] text-stone-500 uppercase font-medium flex items-center gap-1">
                              <span>💡 Alternative Draft</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const current = replyDraft;
                                setReplyDraft(altReplyDraft);
                                setAltReplyDraft(current);
                              }}
                              className="text-[10px] font-mono text-blue-600 hover:text-blue-800 underline cursor-pointer"
                            >
                              Swap Draft
                            </button>
                          </div>
                          <p className="text-stone-600 font-sans italic leading-relaxed">
                            "{altReplyDraft}"
                          </p>
                        </div>
                      )}

                    </div>

                    {/* Action Buttons Row */}
                    <div className="pt-4 border-t border-stone-100 space-y-2">
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        <button
                          type="button"
                          onClick={handlePublishCommentReply}
                          disabled={isPostingComment || isLikingComment || !replyDraft.trim()}
                          className={`flex-1 w-full py-3 rounded-xl text-xs font-mono font-bold text-white transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                            commentLinkOrUrn.trim()
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-[#0a66c2] hover:bg-[#004182]'
                          }`}
                        >
                          {isPostingComment ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          {isPostingComment
                            ? 'Publishing & Liking...'
                            : commentLinkOrUrn.trim()
                              ? '💬 Reply & Like Comment (👍 + 💬)'
                              : '🚀 Post to Root Post'}
                        </button>

                        {commentLinkOrUrn.trim() && (
                          <button
                            type="button"
                            onClick={handleLikeCommentOnly}
                            disabled={isLikingComment || isPostingComment}
                            className="w-full sm:w-auto px-4 py-3 rounded-xl text-xs font-mono font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200/80 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                            title="Register a like (reaction) on LinkedIn without posting a text reply"
                          >
                            {isLikingComment ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : (
                              <ThumbsUp size={13} className="text-blue-600" />
                            )}
                            {isLikingComment ? 'Liking...' : '👍 Like Only'}
                          </button>
                        )}
                      </div>

                      <p className="text-[10px] text-stone-500 font-sans text-center">
                        {commentLinkOrUrn.trim()
                          ? '🎯 Direct thread targeted: Replies within nested comment & auto-likes commenter.'
                          : 'ℹ️ Root Post Mode: Replies to the overall post directly.'}
                      </p>
                    </div>

                  </div>
                ) : (
                  /* Clean Classic Empty State */
                  <div className="h-full min-h-[300px] rounded-xl border border-dashed border-stone-200 bg-[#fcfbf8]/60 p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-stone-200 text-stone-400 flex items-center justify-center shadow-2xs">
                      <MessageSquare size={20} className="text-stone-500" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xs font-mono font-bold text-stone-800">
                        AI Comment Copilot Ready
                      </h3>
                      <p className="text-[11px] text-stone-500 font-sans max-w-xs leading-relaxed">
                        Paste the incoming comment from LinkedIn on the left, pick your preferred tone, and click <span className="font-mono text-stone-800 font-semibold">"Generate AI Reply"</span>.
                      </p>
                    </div>
                    <div className="pt-2 flex items-center gap-2 text-[10px] font-mono text-stone-400">
                      <span>1. Paste Link/Text</span>
                      <span>→</span>
                      <span>2. Review Draft</span>
                      <span>→</span>
                      <span>3. 1-Click Post</span>
                    </div>
                  </div>
                )}

              </div>

            </div>

            {/* Quick Preview of Recent Replies in Studio Mode */}
            {repliesHistory.length > 0 && (
              <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 font-bold text-xs">✱</span>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-600 font-mono">
                      Recent Activity ({repliesHistory.length})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ledger')}
                    className="text-[11px] font-mono text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    View Full Ledger <ArrowRight size={12} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {repliesHistory.slice(0, 2).map((item, idx) => (
                    <div
                      key={item._id || `${item.commentId || 'recent'}-${idx}`}
                      className="p-3.5 rounded-xl border border-stone-200/80 bg-[#fcfbf8] text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold text-stone-800">
                          {item.commenterName || 'LinkedIn Member'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {item.liked && (
                            <span className="text-[9px] font-mono text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded-full font-medium">
                              👍 Liked
                            </span>
                          )}
                          <span className="text-[9px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full font-medium">
                            Published
                          </span>
                        </div>
                      </div>
                      <p className="text-stone-500 text-[11px] font-sans italic truncate">
                        "{item.commentText}"
                      </p>
                      <div className="flex items-start gap-1 text-stone-800 text-[11px] font-sans font-medium pt-0.5">
                        <CornerDownRight size={12} className="text-[#0a66c2] shrink-0 mt-0.5" />
                        <span className="truncate">{item.replyText}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 5. Full Activity Ledger View */}
        {activeTab === 'ledger' && (
          <section className="bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="text-red-500 font-bold text-xs">✱</span>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600 font-mono">
                  Live LinkedIn Activity Ledger ({repliesHistory.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={fetchAutoReplyStats}
                className="text-[11px] font-mono text-stone-500 hover:text-stone-800 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={11} /> Refresh Ledger
              </button>
            </div>

            {repliesHistory.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs font-mono space-y-2">
                <p>No replies recorded yet.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('studio')}
                  className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-[11px] font-mono cursor-pointer"
                >
                  Go to Reply Studio
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {repliesHistory.map((item, idx) => (
                  <div
                    key={item._id || `${item.commentId || 'reply'}-${item.repliedAt || idx}-${idx}`}
                    className="p-4 rounded-xl border border-stone-200/80 bg-[#fcfbf8] text-xs space-y-2 hover:border-stone-300 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] font-bold text-stone-900 truncate">
                          {item.commenterName || 'LinkedIn Member'}
                        </span>
                        <span className="text-[10px] font-mono text-stone-400 truncate max-w-xs">
                          • {item.postTopic}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.liked && (
                          <span className="text-[10px] font-mono text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <ThumbsUp size={10} className="text-rose-600" /> Liked
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                          ✓ Published Live
                        </span>
                        <span className="text-[10px] font-mono text-stone-400">
                          {item.repliedAt ? new Date(item.repliedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                        </span>
                      </div>
                    </div>

                    <p className="text-stone-600 text-[11px] font-sans pl-3 border-l-2 border-stone-300 leading-relaxed">
                      "{item.commentText}"
                    </p>

                    <div className="pt-1 flex items-start gap-1.5 text-stone-900 text-[11px] font-sans font-medium">
                      <CornerDownRight size={13} className="text-[#0a66c2] shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{item.replyText}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

      </div>
    </main>
  );
}
