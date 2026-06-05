import { useState, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../api/client'

const API_BASE = (import.meta.env.VITE_API_BASE || '') + '/v1'

export interface Post {
  id: string
  creatorType: string
  creatorId: string
  userId: string
  authorName: string | null
  title: string | null
  content: string
  imageUrls: string[]
  likeCount: number
  commentCount: number
  likedByMe: boolean
  createdAt: string
}

export interface PostComment {
  id: string
  userId: string
  authorName: string
  content: string
  createdAt: string
}

interface PostCardProps {
  post: Post
  onDeleted?: (id: string) => void
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export function PostCard({ post, onDeleted }: PostCardProps) {
  const { user } = useAuth()
  const [likeCount, setLikeCount] = useState(post.likeCount)
  const [likedByMe, setLikedByMe] = useState(post.likedByMe)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[] | null>(null)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  const isOwner = user?.id === post.userId

  async function toggleLike() {
    if (!user) return
    const prev = { likedByMe, likeCount }
    setLikedByMe(!likedByMe)
    setLikeCount(likedByMe ? likeCount - 1 : likeCount + 1)
    try {
      const res = await api.post<{ liked: boolean; likeCount: number }>(
        `/creator-posts/${post.id}/like`
      )
      setLikedByMe(res.liked)
      setLikeCount(res.likeCount)
    } catch {
      setLikedByMe(prev.likedByMe)
      setLikeCount(prev.likeCount)
    }
  }

  async function loadComments() {
    if (comments !== null) { setShowComments(true); return }
    try {
      const res = await fetch(`${API_BASE}/creator-posts/${post.id}/comments`, { credentials: 'include' })
      const data = await res.json()
      setComments(data.comments ?? [])
      setShowComments(true)
      setTimeout(() => commentInputRef.current?.focus(), 50)
    } catch {
      setComments([])
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim() || !user) return
    setSubmitting(true)
    try {
      const c = await api.post<PostComment>(`/creator-posts/${post.id}/comments`, { content: commentText.trim() })
      setComments(prev => [...(prev ?? []), c])
      setCommentText('')
    } catch { /* ignore */ } finally { setSubmitting(false) }
  }

  async function deleteComment(commentId: string) {
    try {
      await api.delete(`/creator-posts/${post.id}/comments/${commentId}`)
      setComments(prev => prev?.filter(c => c.id !== commentId) ?? null)
    } catch { /* ignore */ }
  }

  async function deletePost() {
    if (!window.confirm('Delete this post?')) return
    setDeleting(true)
    try {
      await api.delete(`/creator-posts/${post.id}`)
      onDeleted?.(post.id)
    } catch { setDeleting(false) }
  }

  return (
    <>
      {/* Lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img src={lightboxSrc} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>
      )}

      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 32, lineHeight: 1 }}>
            {post.creatorType === 'designer' ? '🎨' : '🏭'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{post.authorName ?? 'Creator'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{timeAgo(post.createdAt)}</div>
          </div>
          {isOwner && (
            <button onClick={deletePost} disabled={deleting}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 16, padding: '4px 8px' }}
              title="Delete post">
              🗑️
            </button>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '0 16px 12px' }}>
          {post.title && <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{post.title}</div>}
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{post.content}</p>
        </div>

        {/* Images */}
        {post.imageUrls.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: post.imageUrls.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: 2,
          }}>
            {post.imageUrls.map((url, i) => (
              <img
                key={i} src={url} alt=""
                onClick={() => setLightboxSrc(url)}
                style={{
                  width: '100%', aspectRatio: post.imageUrls.length === 1 ? '16/9' : '1',
                  objectFit: 'cover', cursor: 'zoom-in',
                  borderRadius: i === 0 && post.imageUrls.length === 1 ? 0 : 0,
                }}
              />
            ))}
          </div>
        )}

        {/* Action bar */}
        <div style={{ padding: '10px 16px', display: 'flex', gap: 16, borderTop: '1px solid var(--border)' }}>
          <button onClick={toggleLike} disabled={!user}
            style={{
              background: 'none', border: 'none', cursor: user ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 14,
              color: likedByMe ? 'var(--primary)' : 'var(--text-secondary)',
              padding: 0, fontWeight: likedByMe ? 600 : 400,
            }}>
            {likedByMe ? '❤️' : '🤍'} {likeCount > 0 ? likeCount : ''} Like
          </button>
          <button onClick={() => showComments ? setShowComments(false) : loadComments()}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 14,
              color: 'var(--text-secondary)', padding: 0,
            }}>
            💬 {post.commentCount > 0 ? post.commentCount : ''} Comment
          </button>
        </div>

        {/* Comments */}
        {showComments && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--bg-secondary)' }}>
            {(comments ?? []).map(c => (
              <div key={c.id} style={{ marginBottom: 12, display: 'flex', gap: 10 }}>
                <div style={{ fontSize: 24, lineHeight: 1 }}>👤</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.authorName}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{timeAgo(c.createdAt)}</span>
                    {user && (user.id === c.userId || user.id === post.userId) && (
                      <button onClick={() => deleteComment(c.id)}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', padding: 0 }}>
                        ✕
                      </button>
                    )}
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                </div>
              </div>
            ))}

            {user ? (
              <form onSubmit={submitComment} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <textarea
                  ref={commentInputRef}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Write a comment…"
                  rows={2}
                  maxLength={2000}
                  style={{
                    flex: 1, resize: 'vertical', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--input-bg)',
                    color: 'var(--text)', fontSize: 13,
                  }}
                />
                <button type="submit" disabled={submitting || !commentText.trim()} className="btn-primary"
                  style={{ alignSelf: 'flex-end', padding: '8px 14px', fontSize: 13 }}>
                  Post
                </button>
              </form>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Sign in to comment.</p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
