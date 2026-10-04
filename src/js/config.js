// Shared config: used by the browser and by the Node build script.

export const API_BASE = 'https://freeserp.ai/api.php';
// FreeSerp sends `Access-Control-Allow-Origin: *` twice, which browsers reject, so the browser
// goes through a same-origin proxy (netlify/functions/fs.mjs, also run by scripts/serve.mjs) instead.
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
// first_seen is 2025-01-01 for every domain the index already knew when tracking began (google.com
// too), so that value means "before 2025", not a discovery date.
export const FIRST_SEEN_EPOCH = '2025-01-01';

// Real calendar dates only: FreeSerp answers 502 to impossible ones such as 2026-02-31.
export const isDate = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

// Task finder. `params` go straight to the API; tasks with `q` sort by relevance by default,
// because sorting a text match by DR surfaces big unrelated sites. `widen` is the keyword used when
// the visitor switches a niche-based task to "all niches" (AI startups matching the word, by relevance).
// `words` route a typed query to the task: FreeSerp searches English page text only, so "генератор
// лого" finds nothing and has to open the logo task instead. Entries are word stems (uk + en); a stem
// ending in "." must be the whole word ("біт." is not "біткоїн"). `topic` says what the task is about,
// `action` only adds weight, so "video editor" goes to editing and "video" alone to generation.
export const TASKS = [
  { slug: 'music', icon: 'music', params: { ai_categories: 'Audio & Music', q: 'music' }, words: { topic: ['музик', 'пісн', 'пісен', 'мелоді', 'біт.', 'біти.', 'music', 'song', 'melod', 'beat'] } },
  { slug: 'audio', icon: 'audio', params: { ai_categories: 'Audio & Music' }, widen: 'audio', words: { topic: ['аудіо', 'звук', 'подкаст', 'стем', 'audio', 'sound', 'podcast', 'stem'] } },
  { slug: 'voice-over', icon: 'mic', params: { ai_categories: 'Voice & Text-to-Speech' }, widen: 'text to speech', words: { topic: ['озвуч', 'диктор', 'голос', 'tts.', 'voice', 'speech', 'narrat'], action: ['текст', 'text'] } },
  { slug: 'voice-cloning', icon: 'copy', params: { ai_categories: 'Voice Cloning' }, widen: 'voice cloning', words: { topic: ['клон', 'clon'], action: ['голос', 'voice'] } },
  { slug: 'transcription', icon: 'captions', params: { ai_categories: 'Transcription & Speech-to-Text' }, widen: 'transcription', words: { topic: ['транскри', 'субтитр', 'розшифр', 'transcri', 'subtitl', 'caption', 'stt.'], action: ['аудіо', 'відео', 'audio', 'video', 'текст', 'text', 'speech'] } },
  { slug: 'video-generation', icon: 'video', params: { ai_categories: 'Video Generation' }, widen: 'video generator', words: { topic: ['відео', 'ролик', 'video'], action: ['текст', 'text', 'prompt'] } },
  { slug: 'video-editing', icon: 'scissors', params: { ai_categories: 'Video Editing' }, widen: 'video editor', words: { topic: ['відео', 'ролик', 'монтаж', 'video'], action: ['монтаж', 'редаг', 'нарізк', 'edit', 'cut.', 'trim'] } },
  { slug: 'image-generation', icon: 'image', params: { ai_categories: 'Image Generation' }, widen: 'image generator', words: { topic: ['зображ', 'картин', 'малюн', 'ілюстр', 'арт.', 'image', 'picture', 'illustrat', 'art.'], action: ['намал', 'draw', 'текст', 'text', 'prompt'] } },
  { slug: 'upscale', icon: 'maximize', params: { ai_categories: 'Image Editing & Enhancement', q: 'upscale' }, words: { topic: ['апскейл', 'роздільн', 'якіст', 'upscal', 'resolution', 'enhanc', 'quality'], action: ['покращ', 'збільш', 'фото', 'photo', 'image', 'improv'] } },
  { slug: 'retouch', icon: 'sparkles', params: { ai_categories: 'Image Editing & Enhancement', q: 'retouch' }, words: { topic: ['ретуш', 'портрет', 'шкір', 'retouch', 'portrait', 'skin'], action: ['фото', 'обличч', 'photo', 'face'] } },
  { slug: 'background-removal', icon: 'eraser', params: { ai_categories: 'Background Removal' }, widen: 'background remover', words: { topic: ['фон.', 'фону.', 'фоном.', 'background', 'bg.'], action: ['видал', 'прибр', 'прозор', 'фото', 'remov', 'eras', 'transparent', 'photo', 'image'] } },
  { slug: 'logo', icon: 'hexagon', params: { ai_categories: 'Logo & Branding', q: 'logo' }, words: { topic: ['лого', 'logo'], action: ['дизайн', 'design'] } },
  { slug: 'branding', icon: 'palette', params: { ai_categories: 'Logo & Branding' }, widen: 'branding', words: { topic: ['бренд', 'айдентик', 'назв', 'brand', 'identity', 'naming'], action: ['name.', 'names.'] } },
  { slug: 'favicon', icon: 'favicon', params: { q: 'favicon generator' }, words: { topic: ['фавікон', 'favicon'] } },
  { slug: 'icons', icon: 'grid', params: { category: 'ai', q: 'icon generator' }, words: { topic: ['ікон', 'icon'] } },
  { slug: 'avatars', icon: 'user', params: { ai_categories: 'AI Avatars & Headshots' }, widen: 'ai avatar', words: { topic: ['аватар', 'хедшот', 'avatar', 'headshot'], action: ['фото', 'профіл', 'photo', 'profile'] } },
  { slug: '3d', icon: 'box', params: { ai_categories: '3D & Modeling' }, widen: '3d model', words: { topic: ['3d.', '3д.', 'тривимір'], action: ['модел', 'рендер', 'сцен', 'текстур', 'model', 'render', 'scene', 'textur'] } },
  { slug: 'ui-design', icon: 'layout', params: { ai_categories: 'Design & UI' }, widen: 'ui design', words: { topic: ['інтерфейс', 'макет', 'мокап', 'прототип', 'ui.', 'ux.', 'interface', 'mockup', 'wirefram', 'prototyp'], action: ['дизайн', 'design', 'web'] } },
  { slug: 'copywriting', icon: 'pen', params: { ai_categories: 'Copywriting & Marketing' }, widen: 'copywriting', words: { topic: ['копірайт', 'реклам', 'слоган', 'copywrit', 'copy.', 'slogan', 'ad.', 'ads.'], action: ['текст', 'маркет', 'пост', 'text', 'market', 'post'] } },
  { slug: 'translation', icon: 'languages', params: { ai_categories: 'Translation & Language' }, widen: 'translation', words: { topic: ['переклад', 'дубляж', 'translat', 'dubbing'], action: ['текст', 'документ', 'text', 'document'] } },
  { slug: 'interior', icon: 'home', params: { ai_categories: 'Interior & Architecture' }, widen: 'interior design', words: { topic: ['інтерєр', 'інтерьер', 'архітект', 'кімнат', 'ремонт', 'interior', 'architect', 'room'], action: ['дизайн', 'рендер', 'design', 'render'] } },
];
// Words that say nothing about the task ("free online AI logo generator" is about logos), same notation.
export const QUERY_FILLER = ['ai.', 'ші.', 'штучн', 'інтелект', 'нейро', 'artificial', 'intelligence', 'онлайн', 'online', 'free', 'безкоштовн', 'best', 'найкращ', 'інструмент', 'tool', 'сервіс', 'service', 'app.', 'apps.', 'додат', 'програм', 'сайт', 'site', 'website', 'генер', 'generat', 'створ', 'creat', 'maker', 'make.', 'зроб', 'для.', 'for.', 'the.', 'a.', 'an.', 'of.', 'і.', 'й.', 'та.', 'and.', 'з.', 'із.', 'with.', 'в.', 'у.', 'на.', 'to.', 'як.', 'how.', 'мені.', 'треба.', 'потрібн', 'хочу.', 'my.', 'мій.'];

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
  // Found in the data later (checked 2026-10-04, 100–900 sites each).
  'Document & PDF AI', 'Notes & Meetings', 'Presentations & Slides', 'Email AI', 'Grammar & Editing',
  'OCR & Extraction', 'Coding Assistant', 'Conversational AI', 'AI Companion & Character', 'Photography',
  'Real Estate', 'Legal', 'Fitness & Wellness', 'Food & Recipe', 'Travel', 'Gaming',
];
// The taxonomy keeps growing: an unknown category from a chip or a shared link is still a valid filter.
export const CATEGORY_RX = /^[A-Za-z0-9][A-Za-z0-9 &\/,.+'-]{1,59}$/;

// Builder / stack filter. `ai` maps to the API's ai=1 (any AI site builder).
// Only values that return results with ai_startups=1 (checked 2026-10-04: webflow = 0, react = 1, so both dropped).
export const BUILDERS = ['ai', 'lovable', 'v0', 'bolt', 'base44', 'ai_likely', 'framer', 'nextjs', 'wordpress', 'wix', 'shopify'];
export const AI_BUILDERS = ['lovable', 'v0', 'bolt', 'base44', 'ai_likely'];

export const TLDS = ['ai', 'io', 'com', 'app', 'dev', 'co', 'so', 'tech', 'net', 'org'];

// Hidden from every list: adult content, gambling and dead/parked pages that slip past real_site=1.
// Unambiguous terms match anywhere, also glued inside a domain (ainudegenerator.app, nudeai.com).
// Ambiguous ones need a word start: `sex\w*` catches sexhd88.live but not essex.ac.uk.
export const BLOCKLIST = /nsfw|porn|nude|nudif|undress|hentai|onlyfans|\b(xxx\w*|naked|sex\w*|erotic\w*|uncensored|casino\w*|betting|gambl\w*|gamstop)\b|domain is expired|domain (is )?for sale|buy this domain/i;
// Except tools that fight such content: a summary that describes moderation or detection ("removes
// spam, NSFW content", "CSAM detection") keeps the site, unless the text also describes generating it.
// Checked on 1 129 sites (597 blocked, 2026-10-04): only telegram-bot.app and safer.io came back.
export const SAFETY_TOOL = /\b(?:content moderation|moderat(?:e|es|ing) (?:content|images|chats?|groups?|communities)|moderation (?:api|service|tool|platform|bot|solution)s?|(?:nsfw|nudity|explicit|adult|csam) (?:content |image )?(?:detection|detector|classifier|classification|filter(?:ing)?|scanning)|detects? (?:nudity|nsfw|explicit)|child (?:safety|protection|sexual abuse)|csam|trust (?:and|&) safety)\b/i;
export const ADULT_MAKER = /undress|nudif|uncensored|porn|hentai|onlyfans|\bxxx|deepnude|ai girlfriend|\b(?:nsfw|nude|adult|sex\w*) (?:ai|image|video|art|photo|chat|generat\w*|girlfriend|companion|roleplay|stories|games?)\b|gambl|casino|betting/i;

// Real sites that are not tools: agencies and consultancies, portfolios and personal pages, unfinished
// templates. Judged by the API's own summary, which says what the site is ("X is a Boston-based design
// agency", "the personal website of…"); "for marketing agencies" does not match, and a summary that
// also talks about building or generating things keeps the site (a portfolio builder is a tool).
// Checked on 2 018 sites from the index (2026-10-04). Lists only: a site card or a comparison still
// opens such a domain.
export const NOT_A_PRODUCT = {
  agency: /\b(?:is an? (?:[\w-]+ ){0,4}?(?:agency|consultancy|(?:software|web|app|mobile app) (?:development|engineering) (?:company|firm|studio))|agency (?:based|located|headquartered) in)\b/i,
  personal: /\b(?:(?:personal|academic) (?:academic )?(?:website|homepage|home page|portfolio|blog|site)|professional (?:academic )?(?:portfolio|homepage|home page)|portfolio (?:website|site) (?:of|for))\b/i,
  builder: /\b(?:builder|generator|maker|templates?|create (?:a |your )|build (?:a |your ))/i,
  title: /^(?:create next app|react app|vite \+ react(?: \+ ts)?|vite app|welcome to nginx!?)$/i,
};

// Famous AI brands and their official domains. The index has many third-party sites named after
// them (chatgptxt.com "Chat GPT login", mms-deepseek.com "官方网站", CapCut MOD APKs), and they
// often rank first, so such domains get an "unofficial" label. Ambiguous words (gemini, copilot,
// runway, jasper…) are left out or narrowed (runwayml, leonardoai; "canvas" is not Canva).
// Names that are also ordinary words or first names need `context`: the site's title or summary must
// talk about the AI product (claude-leblanc.com is a wine merchant, anthropic.in a WiFi company).
export const BRANDS = [
  { name: 'ChatGPT', token: 'chatgpt', official: ['chatgpt.com', 'openai.com'] },
  { name: 'OpenAI', token: 'openai', official: ['openai.com', 'openai.fund'] },
  { name: 'Claude', token: 'claude', official: ['claude.ai', 'claude.com', 'anthropic.com'], context: /\bclaude[\s-]?(?:ai|code|chat|opus|sonnet|haiku|fable|\d)\b|anthropic/i },
  { name: 'Anthropic', token: 'anthropic', official: ['anthropic.com'], context: /\bclaude\b|anthropic(?:'s)? (?:ai|pbc)\b/i },
  { name: 'Midjourney', token: 'midjourney', official: ['midjourney.com'] },
  { name: 'Perplexity', token: 'perplexity', official: ['perplexity.ai'], context: /perplexity[\s-]?(?:ai|pro)\b|perplexity\.ai/i },
  { name: 'DeepSeek', token: 'deepseek', official: ['deepseek.com'] },
  { name: 'Grok', token: 'grok', official: ['grok.com', 'x.ai'], context: /\bgrok\b[^.]*\bai\b|\bgrok[\s-]?(?:imagine|bot|chat|token|\d)|\bx\.?ai\b|\belon\b/i },
  { name: 'ElevenLabs', token: 'elevenlabs', official: ['elevenlabs.io'] },
  { name: 'Suno', token: 'suno', official: ['suno.com', 'suno.ai'] },
  { name: 'HeyGen', token: 'heygen', official: ['heygen.com'] },
  { name: 'Synthesia', token: 'synthesia', official: ['synthesia.io'] },
  { name: 'Ideogram', token: 'ideogram', official: ['ideogram.ai'], context: /ideogram[\s-]?(?:ai|\.ai|\d)\b/i },
  { name: 'Leonardo.Ai', token: 'leonardoai', official: ['leonardo.ai'] },
  { name: 'Runway', token: 'runwayml', official: ['runwayml.com'] },
  { name: 'Canva', token: 'canva', match: /canva(?!s)/, official: ['canva.com'] },
  { name: 'CapCut', token: 'capcut', official: ['capcut.com'] },
  { name: 'InShot', token: 'inshot', official: ['inshot.com'] },
];

export const slugify = (s) => s.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
