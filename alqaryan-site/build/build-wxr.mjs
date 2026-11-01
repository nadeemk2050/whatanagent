// Builds a WordPress import file (WXR 1.2) for alqaryangroup.com
// Usage: node build/build-wxr.mjs
// Output: dist/alqaryan-content.wxr
//
// Every page is written as a single Custom HTML block so WordPress never runs
// wpautop over the markup and the layout cannot be mangled on import.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PAGES, MENU, SITE } from './content-pages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'dist');

const cdata = (s) => '<![CDATA[' + String(s == null ? '' : s).replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const PUB_DATE = 'Sun, 01 Nov 2026 12:00:00 +0000';
const LOCAL_DATE = '2026-11-01 17:00:00';

function meta(key, value) {
  return '    <wp:postmeta>\n      <wp:meta_key>' + cdata(key) + '</wp:meta_key>\n      <wp:meta_value>' + cdata(value) + '</wp:meta_value>\n    </wp:postmeta>';
}

function pageItem(p) {
  const content = '<!-- wp:html -->\n' + p.html.trim() + '\n<!-- /wp:html -->';
  const metas = [];
  if (p.seoTitle) metas.push(meta('rank_math_title', p.seoTitle));
  if (p.seoDesc) metas.push(meta('rank_math_description', p.seoDesc));
  if (p.focus) metas.push(meta('rank_math_focus_keyword', p.focus));
  metas.push(meta('_qaryan_built', '1'));

  return [
    '  <item>',
    '    <title>' + cdata(p.title) + '</title>',
    '    <link>' + esc(SITE.url + '/' + (p.slug === 'home' ? '' : p.slug + '/')) + '</link>',
    '    <pubDate>' + PUB_DATE + '</pubDate>',
    '    <dc:creator>' + cdata(SITE.author) + '</dc:creator>',
    '    <guid isPermaLink="false">' + esc(SITE.url + '/?page_id=' + p.id) + '</guid>',
    '    <description></description>',
    '    <content:encoded>' + cdata(content) + '</content:encoded>',
    '    <excerpt:encoded>' + cdata('') + '</excerpt:encoded>',
    '    <wp:post_id>' + p.id + '</wp:post_id>',
    '    <wp:post_date>' + cdata(LOCAL_DATE) + '</wp:post_date>',
    '    <wp:post_date_gmt>' + cdata(LOCAL_DATE) + '</wp:post_date_gmt>',
    '    <wp:comment_status>' + cdata('closed') + '</wp:comment_status>',
    '    <wp:ping_status>' + cdata('closed') + '</wp:ping_status>',
    '    <wp:post_name>' + cdata(p.slug) + '</wp:post_name>',
    '    <wp:status>' + cdata(p.status || 'publish') + '</wp:status>',
    '    <wp:post_parent>' + (p.parent || 0) + '</wp:post_parent>',
    '    <wp:menu_order>' + (p.order || 0) + '</wp:menu_order>',
    '    <wp:post_type>' + cdata('page') + '</wp:post_type>',
    '    <wp:post_password>' + cdata('') + '</wp:post_password>',
    '    <wp:is_sticky>0</wp:is_sticky>',
    ...metas,
    '  </item>'
  ].join('\n');
}

function menuItem(p, order) {
  const metas = [
    ['_menu_item_type', 'post_type'],
    ['_menu_item_menu_item_parent', '0'],
    ['_menu_item_object_id', String(p.id)],
    ['_menu_item_object', 'page'],
    ['_menu_item_target', ''],
    ['_menu_item_classes', 'a:1:{i:0;s:0:"";}'],
    ['_menu_item_xfn', ''],
    ['_menu_item_url', '']
  ].map(function (pair) { return meta(pair[0], pair[1]); }).join('\n');

  return [
    '  <item>',
    '    <title>' + cdata('') + '</title>',
    '    <link>' + esc(SITE.url + '/?p=' + (9000 + order)) + '</link>',
    '    <pubDate>' + PUB_DATE + '</pubDate>',
    '    <dc:creator>' + cdata(SITE.author) + '</dc:creator>',
    '    <guid isPermaLink="false">' + esc(SITE.url + '/?p=' + (9000 + order)) + '</guid>',
    '    <description></description>',
    '    <content:encoded>' + cdata('') + '</content:encoded>',
    '    <excerpt:encoded>' + cdata('') + '</excerpt:encoded>',
    '    <wp:post_id>' + (9000 + order) + '</wp:post_id>',
    '    <wp:post_date>' + cdata(LOCAL_DATE) + '</wp:post_date>',
    '    <wp:post_date_gmt>' + cdata(LOCAL_DATE) + '</wp:post_date_gmt>',
    '    <wp:comment_status>' + cdata('closed') + '</wp:comment_status>',
    '    <wp:ping_status>' + cdata('closed') + '</wp:ping_status>',
    '    <wp:post_name>' + cdata(String(9000 + order)) + '</wp:post_name>',
    '    <wp:status>' + cdata('publish') + '</wp:status>',
    '    <wp:post_parent>0</wp:post_parent>',
    '    <wp:menu_order>' + order + '</wp:menu_order>',
    '    <wp:post_type>' + cdata('nav_menu_item') + '</wp:post_type>',
    '    <wp:post_password>' + cdata('') + '</wp:post_password>',
    '    <wp:is_sticky>0</wp:is_sticky>',
    '    <category domain="nav_menu" nicename="' + esc(SITE.menuSlug) + '">' + cdata(SITE.menuName) + '</category>',
    metas,
    '  </item>'
  ].join('\n');
}

function build() {
  const bySlug = new Map(PAGES.map(function (p) { return [p.slug, p]; }));
  const missing = MENU.filter(function (s) { return !bySlug.has(s); });
  if (missing.length) throw new Error('MENU references unknown slugs: ' + missing.join(', '));

  const ids = PAGES.map(function (p) { return p.id; });
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate post_id values');
  const slugs = PAGES.map(function (p) { return p.slug; });
  if (new Set(slugs).size !== slugs.length) throw new Error('Duplicate slugs');

  PAGES.forEach(function (p) {
    if (p.parent && !ids.includes(p.parent)) throw new Error('Page "' + p.slug + '" has unknown parent id ' + p.parent);
    if (!p.html || p.html.length < 80) throw new Error('Page "' + p.slug + '" has almost no content');
  });

  const items = PAGES.map(pageItem).concat(MENU.map(function (slug, i) { return menuItem(bySlug.get(slug), i + 1); }));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    '<rss version="2.0"',
    '  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"',
    '  xmlns:content="http://purl.org/rss/1.0/modules/content/"',
    '  xmlns:wfw="http://wellformedweb.org/CommentAPI/"',
    '  xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '  xmlns:wp="http://wordpress.org/export/1.2/">',
    '<channel>',
    '  <title>' + cdata(SITE.name) + '</title>',
    '  <link>' + esc(SITE.url) + '</link>',
    '  <description>' + cdata(SITE.tagline) + '</description>',
    '  <pubDate>' + PUB_DATE + '</pubDate>',
    '  <language>en-US</language>',
    '  <wp:wxr_version>1.2</wp:wxr_version>',
    '  <wp:base_site_url>' + esc(SITE.url) + '</wp:base_site_url>',
    '  <wp:base_blog_url>' + esc(SITE.url) + '</wp:base_blog_url>',
    '  <wp:author>',
    '    <wp:author_id>1</wp:author_id>',
    '    <wp:author_login>' + cdata(SITE.author) + '</wp:author_login>',
    '    <wp:author_email>' + cdata(SITE.authorEmail) + '</wp:author_email>',
    '    <wp:author_display_name>' + cdata(SITE.authorName) + '</wp:author_display_name>',
    '    <wp:author_first_name>' + cdata('') + '</wp:author_first_name>',
    '    <wp:author_last_name>' + cdata('') + '</wp:author_last_name>',
    '  </wp:author>',
    ...items,
    '</channel>',
    '</rss>',
    ''
  ].join('\n');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, 'alqaryan-content.wxr');
  fs.writeFileSync(out, xml, 'utf8');
  console.log('Wrote ' + out);
  console.log('Pages: ' + PAGES.length + '  Menu items: ' + MENU.length + '  Size: ' + Math.round(Buffer.byteLength(xml) / 1024) + ' KB');
}

build();
