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
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [repliesHistory, setRepliesHistory] = useState([]);
  const [bannerMsg, setBannerMsg] = useState({ type: '', text: '' });

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

  return (
    <main className="min-h-screen bg-[#fbfbf9] text-stone-900 font-sans p-4 sm:p-6 md:p-10 selection:bg-stone-200">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Top Header with Back Navigation */}
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-stone-200/80 pb-5 gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-10 h-10 rounded-2xl bg-white border border-stone-200/80 hover:bg-stone-100 text-stone-700 flex items-center justify-center transition shadow-xs cursor-pointer"
              title="Back to Studio Generator"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-stone-900">
                  LinkedIn AI Comments Copilot
                </h1>
                <span className="text-[10px] font-mono uppercase bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                  Live Responder
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5 font-sans">
                Paste incoming comments, analyze sentiment with Google Gemini, and publish live threaded replies directly to LinkedIn
              </p>
            </div>
          </div>

          {/* Quick Nav Switches */}
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-medium text-stone-600 bg-white hover:bg-stone-100 border border-stone-200/80 transition"
            >
              📝 Studio Generator
            </Link>
            <div className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold text-white bg-stone-900 shadow-xs flex items-center gap-1.5">
              <Bot size={14} /> Comments Copilot
            </div>
          </div>
        </header>

        {/* Feedback Alert Banner */}
        {bannerMsg.text && (
          <div
            className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
              bannerMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                : 'bg-red-50 text-red-800 border-red-200/80'
            }`}
          >
            <span>{bannerMsg.text}</span>
            <button
              onClick={() => setBannerMsg({ type: '', text: '' })}
              className="text-stone-400 hover:text-stone-700 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Dashboard Status Bar */}
        <section className="bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0a66c2]/10 text-[#0a66c2] flex items-center justify-center shrink-0 border border-blue-200/50">
              <Linkedin size={20} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xs font-bold text-stone-900 font-mono">
                  Autonomous LinkedIn Responder
                </h2>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Cron Active (Every 1 min ⚡)
                </span>
                {autoReplyStats.totalRepliesSent > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                    {autoReplyStats.totalRepliesSent} Live Replies Sent
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 font-sans mt-0.5">
                Connected Profile: <span className="font-mono text-stone-700 font-semibold">urn:li:person:c5I8n_aGMS</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleScanLinkedInReplies}
            disabled={autoReplyScanning}
            className="px-4 py-2 rounded-xl text-xs font-mono font-medium text-white bg-[#0a66c2] hover:bg-[#004182] transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto"
          >
            {autoReplyScanning ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            {autoReplyScanning ? 'Scanning Feed...' : 'Scan LinkedIn Feed ⚡'}
          </button>
        </section>

        {/* Main 2-Column Copilot Studio */}
        <section className="bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* Left Column: Post Selection, Comment Link & Comment Input */}
            <div className="lg:col-span-6 space-y-4">
              <div>
                <label className="text-xs font-mono font-bold text-stone-700 block mb-1">
                  1. Target LinkedIn Post Context
                </label>
                <select
                  value={commentPostId}
                  onChange={(e) => setCommentPostId(e.target.value)}
                  className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-sans cursor-pointer"
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
                <div>
                  <label className="text-xs font-mono font-medium text-stone-700 block mb-1">
                    LinkedIn Post URL or URN
                  </label>
                  <input
                    type="text"
                    value={commentCustomUrn}
                    onChange={(e) => setCommentCustomUrn(e.target.value)}
                    placeholder="e.g. https://www.linkedin.com/feed/update/urn:li:activity:... or urn:li:share:..."
                    className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-mono"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-mono font-bold text-stone-700">
                    2. Comment Link for Threaded Reply (Comment ke andar reply karne ke liye)
                  </label>
                  <span className="text-[10px] text-stone-500 font-mono font-medium">··· &gt; Copy link to comment</span>
                </div>
                <input
                  type="text"
                  value={commentLinkOrUrn}
                  onChange={(e) => setCommentLinkOrUrn(e.target.value)}
                  placeholder="Paste comment link from LinkedIn (··· > Copy link to comment)"
                  className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-mono"
                />
                {commentLinkOrUrn.trim() ? (
                  <p className="text-[11px] font-sans text-emerald-800 mt-1.5 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span><strong>✅ Threaded Reply Mode:</strong> Yeh reply direct user ke comment ke andar (nested thread me) jayega!</span>
                  </p>
                ) : (
                  <div className="text-[11px] font-sans text-amber-800 mt-1.5 flex items-start gap-1.5 bg-amber-50 border border-amber-200/80 px-2.5 py-1.5 rounded-lg leading-snug">
                    <span className="shrink-0">💡</span>
                    <span><strong>Comment ke andar reply ke liye:</strong> LinkedIn par comment ke 3 dots (<strong>···</strong>) par click karein &gt; <em>"Copy link to comment"</em> karein &gt; aur yahan paste karein. Agar link nahi dalenge, toh LinkedIn isko bahar post level par dalega.</span>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-mono font-bold text-stone-700">
                    3. Commenter Name (Optional)
                  </label>
                  <span className="text-[10px] text-stone-400 font-mono">e.g. Rahul Sharma</span>
                </div>
                <input
                  type="text"
                  value={commenterName}
                  onChange={(e) => setCommenterName(e.target.value)}
                  placeholder="e.g. Rahul Sharma (AI will address: 'Thanks Rahul!')"
                  className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-sans"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-mono font-bold text-stone-700">
                    4. Paste User Comment from LinkedIn *
                  </label>
                  <span className="text-[10px] text-stone-400 font-mono">
                    {incomingComment.length} chars
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={incomingComment}
                  onChange={(e) => setIncomingComment(e.target.value)}
                  placeholder="Paste the user's comment here (e.g. 'Loved this breakdown! How do you recommend scaling this with a smaller team?')..."
                  className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl p-3 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-sans resize-y leading-relaxed"
                />
              </div>

              {/* Quick-fill sample pills */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">
                  Quick Sample Questions:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Great insights! How can startups adopt this without huge cost?',
                    'Totally agree, especially on the workflow automation aspect.',
                    'How does this integrate with existing tools and APIs?'
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setIncomingComment(sample)}
                      className="text-[10px] font-sans text-stone-600 bg-stone-50 hover:bg-stone-100 border border-stone-200/80 px-2 py-1 rounded-lg transition text-left cursor-pointer truncate max-w-full"
                    >
                      "{sample}"
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleAnalyzeComment}
                disabled={isAnalyzing || !incomingComment.trim()}
                className="w-full py-2.5 rounded-xl text-xs font-mono font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isAnalyzing ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} className="text-yellow-400" />
                )}
                {isAnalyzing ? 'Reading & Analyzing Comment...' : '🧠 AI Read & Analyze Comment'}
              </button>
            </div>

            {/* Right Column: AI Analysis, Live Editor & 1-Click Publisher */}
            <div className="lg:col-span-6 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-stone-200/70 pt-4 lg:pt-0 lg:pl-6 space-y-4">
              {replyDraft ? (
                <div className="space-y-3.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-stone-700 flex items-center gap-1.5">
                        <span>5. AI Crafted Reply</span>
                        <span className="text-[10px] text-stone-400 font-normal">(Editable)</span>
                      </span>
                      {sentiment && (
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          Sentiment: {sentiment}
                        </span>
                      )}
                    </div>

                    <textarea
                      rows={5}
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      placeholder="AI response draft..."
                      className="w-full bg-[#fcfbf8] border border-stone-200 rounded-xl p-3 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-sans resize-y leading-relaxed"
                    />

                    {altReplyDraft && (
                      <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 text-[11px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-stone-400 uppercase font-medium">
                            Alternative Suggestion:
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
                        <p className="text-stone-600 font-sans italic">
                          "{altReplyDraft}"
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handlePublishCommentReply}
                      disabled={isPostingComment || !replyDraft.trim()}
                      className={`w-full py-3.5 rounded-xl text-xs font-mono font-bold text-white transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                        commentLinkOrUrn.trim()
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-[#0a66c2] hover:bg-[#004182]'
                      }`}
                    >
                      {isPostingComment ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      {isPostingComment
                        ? 'Posting LIVE to LinkedIn...'
                        : commentLinkOrUrn.trim()
                          ? '💬 Post Reply Inside Comment Thread'
                          : '🚀 Post as Root Comment (Outside Thread)'}
                    </button>
                    <p className="text-[10px] text-stone-500 font-sans text-center mt-1.5">
                      {commentLinkOrUrn.trim()
                        ? '🎯 Target comment thread linked: Replying directly inside the thread under this comment.'
                        : 'ℹ️ No comment link: Will post directly on the post outside any specific thread.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[260px] rounded-xl border border-dashed border-stone-200/80 bg-stone-50/50 p-6 flex flex-col items-center justify-center text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-stone-200 text-stone-400 flex items-center justify-center shadow-xs">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <h3 className="text-xs font-mono font-bold text-stone-700">
                      AI Comment Copilot Ready
                    </h3>
                    <p className="text-[11px] text-stone-400 font-sans max-w-xs mt-1">
                      Paste any LinkedIn comment on the left and click <span className="font-mono text-stone-600 font-semibold">"AI Read & Analyze Comment"</span> to review sentiment analysis and editable AI drafts.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Live Replies Ledger: Full History */}
        <section className="bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="text-xs font-mono font-bold text-stone-700 flex items-center gap-1.5">
              <span>⚡ Live Replies Ledger ({repliesHistory.length})</span>
            </span>
            <span className="text-[10px] font-mono text-stone-400">
              Real-time comment replies history
            </span>
          </div>

          {repliesHistory.length === 0 ? (
            <div className="text-center py-8 text-stone-400 text-xs font-mono">
              No replies posted yet. Analyze and post a reply above to see it recorded here.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {repliesHistory.map((item, idx) => (
                <div
                  key={item._id || `${item.commentId || 'reply'}-${item.repliedAt || idx}-${idx}`}
                  className="p-3.5 rounded-xl border border-stone-200/70 bg-[#fcfbf8] text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] font-bold text-stone-800 truncate">
                        {item.commenterName || 'LinkedIn Member'}:
                      </span>
                      <span className="text-[10px] font-mono text-stone-400 truncate max-w-xs">
                        • {item.postTopic}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.2 rounded-full font-medium">
                        ✓ Published Live
                      </span>
                      <span className="text-[10px] font-mono text-stone-400">
                        {item.repliedAt ? new Date(item.repliedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                      </span>
                    </div>
                  </div>

                  <p className="text-stone-600 text-[11px] font-sans pl-2.5 border-l-2 border-stone-300">
                    "{item.commentText}"
                  </p>

                  <div className="pt-1.5 flex items-start gap-1.5 text-stone-900 text-[11px] font-sans font-medium">
                    <CornerDownRight size={13} className="text-[#0a66c2] shrink-0 mt-0.5" />
                    <span>{item.replyText}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
