// Content of the /plan/ page (the site plan required by the brief), in both languages.

const uk = ({ tasks, niches, latest }) => `
<p class="eyebrow">План сайту</p>
<h1 class="h1">AI Radar: мета, аудиторія, структура</h1>
<p class="lead">AI Radar — каталог нових AI-сайтів на основі публічного FreeSerp API (index=sites, головні сторінки). Головна ідея: шукати не «AI взагалі», а інструмент під конкретну задачу, одразу бачити, чи він безкоштовний і чи потрібна реєстрація.</p>

<h2 id="goal">Мета</h2>
<ul>
  <li>Скоротити шлях від «мені потрібно зробити лого / озвучку / апскейл» до 2–3 відповідних сервісів.</li>
  <li>Показувати нові AI-продукти, яких ще немає у великих каталогах (FreeSerp щодня знаходить нові домени).</li>
  <li>Давати швидке порівняння за ціною, доступом, API, авторитетністю (DR) і стеком.</li>
  <li>Збирати органічний трафік: сторінки задач і ніш — це посадкові сторінки під пошукові запити «безкоштовний генератор лого», «AI для музики» тощо.</li>
</ul>

<h2 id="audience">Аудиторія</h2>
<div class="table-wrap"><table>
  <thead><tr><th>Хто</th><th>Що шукає</th><th>Чим допомагає сайт</th></tr></thead>
  <tbody>
    <tr><td>Креатори, SMM, дизайнери</td><td>Інструмент під задачу, бажано безкоштовний і без реєстрації</td><td>Пошук за задачею + фільтри ціни/доступу</td></tr>
    <tr><td>Фаундери й продакти</td><td>Хто ще працює в моїй ніші, нові конкуренти</td><td>Ніші, «Новинки», порівняння, сортування за DR</td></tr>
    <tr><td>Маркетологи та SEO-фахівці</td><td>Нові гравці для партнерств, лінкбілдингу, аутрічу</td><td>DR, дата появи, стек, фільтр TLD</td></tr>
    <tr><td>Інвестори / скаути</td><td>Ранні AI-стартапи, тренди конструкторів (Lovable, v0, Bolt)</td><td>Фільтр «AI-конструктор», сортування «спершу нові»</td></tr>
  </tbody>
</table></div>

<h2 id="pages">Сторінки та структура</h2>
<pre class="tree">/                     головна: пошук, задачі, свіжі, топ за DR, ніші
├── /tools/           ${tasks} задач (музика, відео, лого, фавіконки, ретуш…)
│   └── /tools/{задача}/   інструменти + фільтри ціни, доступу, API
├── /sites/           каталог: пошук і всі фільтри (стан у URL)
├── /niche/{ніша}/    ${niches} SEO-сторінок ніш AI-стартапів
├── /new/             новинки за останній тиждень даних
├── /site/{домен}/    картка сайту + схожі
├── /compare/         порівняння до 3 сайтів (?d=a,b,c)
├── /plan/            цей план
└── /en/…             англійська версія всіх сторінок</pre>
<p>Кожна сторінка списку — один компонент із різними пресетами API-параметрів, тому поведінка фільтрів однакова скрізь.</p>

<h2 id="flows">Ключові сценарії</h2>
<ol>
  <li><strong>«Потрібен безкоштовний апскейлер без реєстрації»:</strong> головна → плитка «Покращення якості» → Ціна: «Free / freemium», Доступ: «Без реєстрації» → картка → «Відкрити сайт».</li>
  <li><strong>«Хто конкурує з моїм AI-агентом»:</strong> Ніші → «AI-агенти» → сортування «Спершу нові» → «Порівняти» на 3 картках → /compare/.</li>
  <li><strong>«Що нового зробили на Lovable»:</strong> Каталог → Конструктор: Lovable → Спершу нові.</li>
</ol>

<h2 id="data">Дані та API</h2>
<ul>
  <li>Джерело — <code>GET https://freeserp.ai/api.php</code>, index=sites (за замовчуванням). Використано: <code>ai_startups</code>, <code>ai_categories</code>, <code>ai</code>/<code>ai_source</code>, <code>tld</code>, <code>dr_min/max</code>, <code>from_date/to_date</code>, <code>sort/order</code>, <code>from/size</code>, <code>content</code> + <code>content_max</code>, <code>stats=1</code>, пошук домену через <code>q=домен&amp;all=1</code>.</li>
  <li><strong>Ціна й доступ</strong> в API немає. Їх визначає евристика за текстом головної сторінки (<code>content=1</code>, перші 4000 символів) і AI-описом: фрази «free plan», «$9/mo», «free trial», «no sign up», «waitlist» тощо. Біля кожної позначки є пояснення з фразами, що спрацювали. Кнопка «Log in» не означає обов’язкової реєстрації, тому позначка називається «Є акаунти».</li>
  <li>Фільтр за ціною/доступом працює на клієнті: API не вміє так фільтрувати, тому ми беремо перші 100 результатів, класифікуємо й показуємо збіги (про це написано біля результатів).</li>
  <li>Задачі зіставлені з AI-нішами API; частина звужена текстовим запитом (апскейл, ретуш, лого). Для фавіконок окремої ніші немає — пошук за текстом.</li>
  <li>Обмеження, знайдені під час перевірки API: одна ніша на запит; <code>ai_startups=1</code> відсікає медійні ніші (для задач не використовується); <code>dr</code> буває <code>null</code>; дата <code>went_live</code> — поява в індексі, а не запуск; останні дані на ${latest}.</li>
  <li>Приховано NSFW, казино та «мертві» домени (стоп-лист за доменом, заголовком і описом). Поле <code>category=betting/casino</code> не використовується: воно помилково позначає, наприклад, favicon.io.</li>
</ul>

<h2 id="tech">Технічне рішення</h2>
<ul>
  <li>HTML, CSS і ванільний JavaScript (ES-модулі), без фреймворків і залежностей.</li>
  <li>Під час збірки на Netlify Node-скрипт робить ~40 запитів до API і генерує статичні сторінки задач, ніш, новинок і карток сайтів (українською та англійською). Пошуковики отримують готовий контент, а фільтри далі працюють у браузері через ті самі шаблони.</li>
  <li>SEO: ЧПУ, унікальні title/description, canonical, hreflang uk/en, JSON-LD (WebSite + SearchAction, BreadcrumbList, ItemList), sitemap.xml із альтернативними мовами, robots.txt.</li>
  <li>Кеш відповідей у sessionStorage, повтор при помилці, зрозумілі стани «порожньо / помилка».</li>
</ul>

<h2 id="next">Що далі</h2>
<ul>
  <li>Щоденна перезбірка (Netlify build hook + cron), щоб статичні сторінки були свіжими.</li>
  <li>Зберігати щоденні знімки в БД, щоб показувати тренди ніш і конструкторів (API не має історії).</li>
  <li>Точніше визначення ціни: окремо завантажувати сторінку /pricing через index=web.</li>
  <li>Скріншоти сайтів, вибране, відгуки користувачів про точність позначок.</li>
</ul>`;

const en = ({ tasks, niches, latest }) => `
<p class="eyebrow">Site plan</p>
<h1 class="h1">AI Radar: goal, audience, structure</h1>
<p class="lead">AI Radar is a directory of new AI sites built on the public FreeSerp API (index=sites, homepages). The core idea: don’t search “AI in general” — find a tool for a specific task and instantly see whether it is free and whether it needs a sign-up.</p>

<h2 id="goal">Goal</h2>
<ul>
  <li>Shorten the path from “I need a logo / voice-over / upscale” to 2–3 suitable services.</li>
  <li>Surface new AI products that big directories don’t list yet (FreeSerp discovers new domains daily).</li>
  <li>Offer quick comparison by pricing, access, API, authority (DR) and stack.</li>
  <li>Earn organic traffic: task and niche pages are landing pages for queries like “free logo generator” or “AI for music”.</li>
</ul>

<h2 id="audience">Audience</h2>
<div class="table-wrap"><table>
  <thead><tr><th>Who</th><th>What they look for</th><th>How the site helps</th></tr></thead>
  <tbody>
    <tr><td>Creators, SMM, designers</td><td>A tool for the task, ideally free and without sign-up</td><td>Task finder + pricing/access filters</td></tr>
    <tr><td>Founders and PMs</td><td>Who else works in my niche, new competitors</td><td>Niches, “New”, compare, sort by DR</td></tr>
    <tr><td>Marketers and SEOs</td><td>New players for partnerships, link building, outreach</td><td>DR, date indexed, stack, TLD filter</td></tr>
    <tr><td>Investors / scouts</td><td>Early AI startups, builder trends (Lovable, v0, Bolt)</td><td>“AI builder” filter, newest-first sorting</td></tr>
  </tbody>
</table></div>

<h2 id="pages">Pages and structure</h2>
<pre class="tree">/                     home: search, tasks, fresh, top by DR, niches
├── /tools/           ${tasks} tasks (music, video, logo, favicons, retouch…)
│   └── /tools/{task}/     tools + pricing, access, API filters
├── /sites/           catalog: search and every filter (state in the URL)
├── /niche/{niche}/   ${niches} SEO pages for AI startup niches
├── /new/             newest sites from the latest week of data
├── /site/{domain}/   site card + similar sites
├── /compare/         compare up to 3 sites (?d=a,b,c)
├── /plan/            this plan
└── /en/…             English version of every page (Ukrainian is the default)</pre>
<p>Every list page is one component with a different API preset, so filters behave the same everywhere.</p>

<h2 id="flows">Key scenarios</h2>
<ol>
  <li><strong>“I need a free upscaler without sign-up”:</strong> home → “Upscaling” tile → Pricing: “Free / freemium”, Access: “No sign-up” → card → “Visit site”.</li>
  <li><strong>“Who competes with my AI agent”:</strong> Niches → “AI Agents” → sort “Newest first” → “Compare” on 3 cards → /compare/.</li>
  <li><strong>“What’s new built with Lovable”:</strong> Catalog → Builder: Lovable → Newest first.</li>
</ol>

<h2 id="data">Data and API</h2>
<ul>
  <li>Source: <code>GET https://freeserp.ai/api.php</code>, index=sites (default). Used: <code>ai_startups</code>, <code>ai_categories</code>, <code>ai</code>/<code>ai_source</code>, <code>tld</code>, <code>dr_min/max</code>, <code>from_date/to_date</code>, <code>sort/order</code>, <code>from/size</code>, <code>content</code> + <code>content_max</code>, <code>stats=1</code>, domain lookup via <code>q=domain&amp;all=1</code>.</li>
  <li><strong>Pricing and access</strong> are not in the API. A heuristic reads the homepage text (<code>content=1</code>, first 4,000 characters) and the AI summary for phrases like “free plan”, “$9/mo”, “free trial”, “no sign up”, “waitlist”. Every label shows the phrases that triggered it. A “Log in” button does not mean sign-up is required, so the label says “Has accounts”.</li>
  <li>Pricing/access filtering happens client-side: the API cannot filter that way, so we take the first 100 results, classify them and show matches (stated next to the results).</li>
  <li>Tasks map to the API’s AI niches; some are narrowed with a text query (upscale, retouch, logo). Favicons have no niche — they use text search.</li>
  <li>Limits found while testing the API: one niche per request; <code>ai_startups=1</code> drops media niches (not used for tasks); <code>dr</code> may be <code>null</code>; <code>went_live</code> is when the site entered the index, not its launch; latest data: ${latest}.</li>
  <li>NSFW, casino and dead domains are hidden (blocklist on domain, title and summary). The API’s <code>category=betting/casino</code> is not used: it mislabels e.g. favicon.io.</li>
</ul>

<h2 id="tech">Technical approach</h2>
<ul>
  <li>HTML, CSS and vanilla JavaScript (ES modules), no frameworks or dependencies.</li>
  <li>At build time on Netlify a Node script makes ~40 API requests and prerenders task, niche, new and site pages (Ukrainian and English). Search engines get real content; filters then run in the browser with the same templates.</li>
  <li>SEO: clean URLs, unique title/description, canonical, hreflang uk/en, JSON-LD (WebSite + SearchAction, BreadcrumbList, ItemList), sitemap.xml with language alternates, robots.txt.</li>
  <li>Responses cached in sessionStorage, retry on failure, clear empty/error states.</li>
</ul>

<h2 id="next">What’s next</h2>
<ul>
  <li>Daily rebuilds (Netlify build hook + cron) to keep static pages fresh.</li>
  <li>Store daily snapshots in a database to show niche and builder trends (the API has no history).</li>
  <li>More accurate pricing: fetch the /pricing page separately via index=web.</li>
  <li>Site screenshots, favourites, user feedback on label accuracy.</li>
</ul>`;

export const planHtml = (lang, ctx) => (lang === 'en' ? en(ctx) : uk(ctx));
