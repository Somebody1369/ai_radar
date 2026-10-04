// Shared config: used by the browser and by the Node build script.

export const API_BASE = 'https://freeserp.ai/api.php';
// FreeSerp sends `Access-Control-Allow-Origin: *` twice, which browsers reject, so the browser
// goes through a same-origin proxy (Netlify rewrite / scripts/serve.mjs) instead.
export const API_PROXY = '/api/fs';

// Identification fields requested by the FreeSerp docs ("Identify yourself").
export const API_IDENTITY = { agent: 'AIRadar/1.0', project: 'AI Radar (Semalt test task)' };

// Every list request pulls a capped slice of homepage text for the pricing/access heuristic.
export const CONTENT_MAX = 4000;
export const PAGE_SIZE = 24;
// When a pricing/access filter is active we scan this many results client-side.
export const DEEP_SCAN_SIZE = 100;
// API limit for index=sites: from + size <= 10 000.
export const MAX_WINDOW = 10000;

// Task finder. `params` go straight to the API; tasks with `q` sort by relevance by default,
// because sorting a text match by DR surfaces big unrelated sites. `widen` is the keyword used when
// the visitor switches a niche-based task to "all niches" (AI startups matching the word, by relevance).
export const TASKS = [
  { slug: 'music', icon: 'music', params: { ai_categories: 'Audio & Music', q: 'music' } },
  { slug: 'audio', icon: 'audio', params: { ai_categories: 'Audio & Music' }, widen: 'audio' },
  { slug: 'voice-over', icon: 'mic', params: { ai_categories: 'Voice & Text-to-Speech' }, widen: 'text to speech' },
  { slug: 'voice-cloning', icon: 'copy', params: { ai_categories: 'Voice Cloning' }, widen: 'voice cloning' },
  { slug: 'transcription', icon: 'captions', params: { ai_categories: 'Transcription & Speech-to-Text' }, widen: 'transcription' },
  { slug: 'video-generation', icon: 'video', params: { ai_categories: 'Video Generation' }, widen: 'video generator' },
  { slug: 'video-editing', icon: 'scissors', params: { ai_categories: 'Video Editing' }, widen: 'video editor' },
  { slug: 'image-generation', icon: 'image', params: { ai_categories: 'Image Generation' }, widen: 'image generator' },
  { slug: 'upscale', icon: 'maximize', params: { ai_categories: 'Image Editing & Enhancement', q: 'upscale' } },
  { slug: 'retouch', icon: 'sparkles', params: { ai_categories: 'Image Editing & Enhancement', q: 'retouch' } },
  { slug: 'background-removal', icon: 'eraser', params: { ai_categories: 'Background Removal' }, widen: 'background remover' },
  { slug: 'logo', icon: 'hexagon', params: { ai_categories: 'Logo & Branding', q: 'logo' } },
  { slug: 'branding', icon: 'palette', params: { ai_categories: 'Logo & Branding' }, widen: 'branding' },
  { slug: 'favicon', icon: 'favicon', params: { q: 'favicon generator' } },
  { slug: 'icons', icon: 'grid', params: { category: 'ai', q: 'icon generator' } },
  { slug: 'avatars', icon: 'user', params: { ai_categories: 'AI Avatars & Headshots' }, widen: 'ai avatar' },
  { slug: '3d', icon: 'box', params: { ai_categories: '3D & Modeling' }, widen: '3d model' },
  { slug: 'ui-design', icon: 'layout', params: { ai_categories: 'Design & UI' }, widen: 'ui design' },
  { slug: 'copywriting', icon: 'pen', params: { ai_categories: 'Copywriting & Marketing' }, widen: 'copywriting' },
  { slug: 'translation', icon: 'languages', params: { ai_categories: 'Translation & Language' }, widen: 'translation' },
  { slug: 'interior', icon: 'home', params: { ai_categories: 'Interior & Architecture' }, widen: 'interior design' },
];

// Niches the API counts as genuine AI startups (ai_startups=1). Each gets an SEO page.
export const NICHES = [
  'AI Agents & Autonomous',
  'AI Automation & Workflows',
  'Code & Dev Tools',
  'AI Infrastructure & API',
  'LLM & Prompt Tools',
  'AI Chatbot & Assistant',
  'AI Search & Answers',
  'AI Website Builder',
  'No-code / App Builder',
  'Data & Analytics',
  'Research & Science',
  'Design & UI',
  'Image Generation',
  'Video Generation',
  'Voice & Text-to-Speech',
];

// Every category offered in the catalog's niche filter (the live taxonomy is wider than the docs).
export const ALL_CATEGORIES = [
  ...NICHES,
  'Audio & Music', 'Video Editing', 'Image Editing & Enhancement', 'Background Removal',
  'Logo & Branding', 'AI Avatars & Headshots', 'Voice Cloning', 'Transcription & Speech-to-Text',
  '3D & Modeling', 'Copywriting & Marketing', 'Writing & Content', 'SEO & Content',
  'Translation & Language', 'Summarization', 'Knowledge & RAG', 'Productivity', 'Customer Support',
  'Marketing & Ads', 'Social Media', 'Sales & CRM', 'Lead Gen & Outreach', 'Recruiting & HR',
  'Education & Tutoring', 'Healthcare & Medical', 'Finance & Trading', 'Security & Moderation',
  'Interior & Architecture', 'E-commerce', 'Directory / Aggregator', 'Other AI',
];

// Builder / stack filter. `ai` maps to the API's ai=1 (any AI site builder).
// Only values that return results with ai_startups=1 (checked 2026-10-04: webflow = 0, react = 1, so both dropped).
export const BUILDERS = ['ai', 'lovable', 'v0', 'bolt', 'base44', 'ai_likely', 'framer', 'nextjs', 'wordpress', 'wix', 'shopify'];
export const AI_BUILDERS = ['lovable', 'v0', 'bolt', 'base44', 'ai_likely'];

export const TLDS = ['ai', 'io', 'com', 'app', 'dev', 'co', 'so', 'tech', 'net', 'org'];

// Hidden from every list: adult content, gambling and dead/parked pages that slip past real_site=1.
// Unambiguous terms match anywhere, also glued inside a domain (ainudegenerator.app, nudeai.com).
// Ambiguous ones need a word start: `sex\w*` catches sexhd88.live but not essex.ac.uk.
export const BLOCKLIST = /nsfw|porn|nude|nudif|undress|hentai|onlyfans|\b(xxx\w*|naked|sex\w*|erotic\w*|uncensored|casino\w*|betting|gambl\w*|gamstop)\b|domain is expired|domain (is )?for sale|buy this domain/i;

export const slugify = (s) => s.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const nicheBySlug = (slug) => NICHES.find((n) => slugify(n) === slug);
