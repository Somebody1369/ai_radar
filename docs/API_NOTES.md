# FreeSerp API — що перевірено вручну

Перевірено curl-запитами та в браузері 4 жовтня 2026. Документація: https://freeserp.ai/docs.php, живий довідник: `?help=1`.

| Що | Результат | Як враховано |
|---|---|---|
| Швидкість | 150–300 мс, edge-кеш 30 с | Кеш у sessionStorage на 10 хв |
| **CORS** | Документація каже «CORS-open», але сервер шле `Access-Control-Allow-Origin: *` **двічі** (`*, *`). Браузер блокує відповідь | Проксі на своєму домені: Netlify rewrite `/api/fs` → `api.php` (і такий самий у `scripts/serve.mjs`) |
| Свіжість | Найновіший `went_live` = 2026-09-08 (≈4 тижні до дати перевірки), `ai_startups.today = 0` | «Новинки» = останній тиждень **наявних** даних, дата показана в UI |
| Кілька ніш | `ai_categories[]=A&ai_categories[]=B` → не-JSON; `A,B` → 0 результатів | Одна ніша на запит |
| Таксономія | Ширша за документацію: `Audio & Music`, `Image Editing & Enhancement`, `Background Removal`, `Logo & Branding`, `Voice Cloning`, `AI Avatars & Headshots`, `Transcription & Speech-to-Text`, `3D & Modeling`, `Video Editing`, `Copywriting & Marketing`, `Translation & Language`, `Interior & Architecture`… | Задачі зіставлені з цими нішами |
| `ai_startups=1` | Відсікає медійні ніші (Audio & Music: 353 → 154) | Для задач і ніш не використовується; лише в каталозі без вибраної ніші |
| Фавіконки | Окремої ніші немає; `category=ai&q=favicon` дає SEO-сервіси | Задача = `q=favicon generator` без фільтра ніші, сортування за релевантністю |
| Сортування | Текстовий запит + `sort=dr` піднімає великі нерелевантні сайти | Задачі з `q` за замовчуванням сортуються за релевантністю |
| `category=betting/casino` | Хибні спрацювання (favicon.io) | Не використовується; казино ловить текстовий стоп-лист |
| NSFW | У нішах зображень є undress/nudify/faceswap-сайти; у `category=ai` трапляються домени на кшталт `sexhd88.live` | Стоп-лист за доменом, заголовком і описом (`sex\w*` з межею слова на початку — `essex` не зачіпає) |
| Мертві домени | Трапляються «Your domain is expired» при `real_site=1` | Теж у стоп-листі |
| `dr` | Буває `null` у нових доменів | Показуємо «—» |
| Пошук домену | Окремого ендпоінта немає | `q=домен&all=1&size=1` + перевірка `results[0].domain` |
| Ціна / реєстрація | Полів немає | Евристика по `content=1&content_max=4000` + `ai_summary` |
| `content` | ~150 КБ на 24 результати з `content_max=6000`; 4000 — компроміс | `CONTENT_MAX = 4000` |
| Підказка в `q` | `q=free` / `q=no sign up` у межах ніші піднімає релевантні сторінки | Додається лише в режимі фільтра ціни/доступу |
| Префіксний пошук | Немає: `q=suno` знаходить suno.com, `q=su` і `q=su*` — ні | Для підказок — локальний індекс сайтів зі збірки (`assets/sites-index.json`), пошук за префіксом у браузері + результати API |
| Глибина | `from + size ≤ 10 000` | Пагінація обмежена (`MAX_PAGE`) |
| Ідентифікація | Документація просить `agent`/`project` | Додаються до кожного запиту |

## Перевірка евристики ціни (24 відомі сервіси)

Порівняно з відомою моделлю оплати сервісів (suno, capcut, clipchamp, kapwing, synthesia, pixlr, fotor, photoroom, topazlabs, upscale.media, slazzer, picwish, turbologo, namelix, kittl, favicon.io, realfavicongenerator, jasper, rytr, lalal.ai, flexclip, pictory, krisp, sonix):

- 16 — точно;
- 2 — частково (знайдено безкоштовний рівень, але не помічено платний: capcut, upscale.media);
- 2 — помилка (picwish → «пробний період» замість freemium, sonix → freemium замість «платно + trial»);
- 4 — «не визначено» (на перших 4000 символах немає явних фраз).

Жодного платного продукту не позначено як «Безкоштовно». Після першого прогону посилання «Pricing» у меню стало слабкою ознакою (раніше kapwing і flexclip помилково отримували «Платно»).
