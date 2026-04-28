'use strict';
const router = require('express').Router();
const db     = require('../db');
const { verify, requireRole } = require('../middleware/auth');

const slugify = s =>
  s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');

// GET /api/blog — list posts (admin view, all statuses)
router.get('/', verify, (req, res) => {
  const { status } = req.query;
  const posts = status
    ? db.prepare(
        'SELECT * FROM blog_posts WHERE status = ? ORDER BY created_at DESC'
      ).all(status)
    : db.prepare(
        'SELECT * FROM blog_posts WHERE archived_at IS NULL ORDER BY created_at DESC'
      ).all();
  res.json({ ok: true, data: { posts } });
});

// POST /api/blog — create post
router.post('/', verify, requireRole('super_admin', 'marketing_manager'), (req, res) => {
  const { title, content, excerpt, cover_image, status, scheduled_at } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'Title required' });

  const baseSlug = slugify(title) || 'post';
  const slug     = `${baseSlug}-${Date.now()}`;
  const st       = status || 'draft';
  const published_at = st === 'published' ? new Date().toISOString() : null;

  const result = db.prepare(`
    INSERT INTO blog_posts (title, slug, status, content, excerpt, cover_image, author_id, published_at, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, slug, st, content || null, excerpt || null,
    cover_image || null, req.user.id, published_at, scheduled_at || null
  );

  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ok: true, data: { post } });
});

// GET /api/blog/:id
router.get('/:id', verify, (req, res) => {
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Post not found' });
  res.json({ ok: true, data: { post } });
});

// PUT /api/blog/:id — update post
router.put('/:id', verify, requireRole('super_admin', 'marketing_manager'), (req, res) => {
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Post not found' });

  const { title, content, excerpt, cover_image, status, scheduled_at } = req.body || {};
  const st = status ?? post.status;
  let published_at = post.published_at;
  if (st === 'published' && !published_at) {
    published_at = new Date().toISOString();
  }

  db.prepare(`
    UPDATE blog_posts
    SET title = ?, content = ?, excerpt = ?, cover_image = ?, status = ?,
        scheduled_at = ?, published_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title        ?? post.title,
    content      ?? post.content,
    excerpt      ?? post.excerpt,
    cover_image  ?? post.cover_image,
    st,
    scheduled_at ?? post.scheduled_at,
    published_at,
    post.id
  );

  res.json({ ok: true, data: { post: db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(post.id) } });
});

// DELETE /api/blog/:id — soft-delete (archive)
router.delete('/:id', verify, requireRole('super_admin', 'marketing_manager'), (req, res) => {
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Post not found' });
  db.prepare(`
    UPDATE blog_posts
    SET status = 'archived', archived_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(post.id);
  res.json({ ok: true });
});

module.exports = router;
