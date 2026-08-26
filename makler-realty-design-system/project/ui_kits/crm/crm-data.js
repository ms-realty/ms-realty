/* MS Realty — Agent CRM sample data (Bulgarian, agent-facing).
   Back-office content for the MS Realty team: leads pipeline, contacts,
   the agency's stock, viewings, tasks and activity. Sandanski-first,
   plus Bansko (ski), Melnik, the coast (Sveti Vlas) and Greece.
   Money is € with thousands separators; rent shows /мес. */

const eur = (n) => '€' + Number(n).toLocaleString('en-US');

/* ---- Agents (the team) ---- */
const CRM_AGENTS = {
  elena:   { id: 'elena',   name: 'Елена Петрова',  role: 'Старши брокер',  office: 'Сандански', initials: 'ЕП', tone: 'sand',   phone: '+359 879 69 68 70' },
  dimitar: { id: 'dimitar', name: 'Димитър Колев',  role: 'Брокер',         office: 'Сандански', initials: 'ДК', tone: 'pine',   phone: '+359 88 903 1140' },
  mila:    { id: 'mila',    name: 'Мила Георгиева', role: 'Брокер',         office: 'Сандански', initials: 'МГ', tone: 'sea',    phone: '+359 88 421 7788' },
  radoslav:{ id: 'radoslav',name: 'Радослав Иванов',role: 'Управител',      office: 'Сандански', initials: 'РИ', tone: 'sunset', phone: '+359 879 69 68 71' },
};
const ME = 'elena';

/* Language flags shown on multilingual leads. Admin UI itself is BG/RU/EN. */
const LANGS = { BG: 'Български', EN: 'English', DE: 'Deutsch', NL: 'Nederlands', RU: 'Русский', EL: 'Ελληνικά', HE: 'עברית' };

/* ---- Pipeline stages (kanban order) ---- */
const STAGES = [
  { key: 'new',     label: 'Нови',            hint: 'Необработени запитвания' },
  { key: 'viewing', label: 'Оглед насрочен',  hint: 'Уговорен оглед' },
  { key: 'offer',   label: 'Оферта',          hint: 'Преговори по цена' },
  { key: 'won',     label: 'Спечелени',       hint: 'Сделка / капаро' },
];

/* Lead source → icon */
const SOURCES = {
  website:  { label: 'Уебсайт',    icon: 'globe' },
  phone:    { label: 'Обаждане',   icon: 'phone' },
  facebook: { label: 'Facebook',   icon: 'thumbs-up' },
  referral: { label: 'Препоръка',  icon: 'users' },
  whatsapp: { label: 'WhatsApp',   icon: 'message-circle' },
  walkin:   { label: 'На място',   icon: 'door-open' },
};

/* temperature: hot / warm / cold */
const LEADS = [
  { id: 'L-2087', name: 'Andreas Hofmann', stage: 'offer', temp: 'hot', lang: 'DE', deal: 'sale', source: 'website',
    budget: 180000, interest: 'Двустаен · Сандански, център', location: 'Сандански', agent: 'elena',
    phone: '+49 176 220 118', email: 'a.hofmann@mail.de', created: '2026-06-18', lastAct: 'преди 2 часа',
    matched: ['ms-987', 'ms-944'], tasks: 2, notes: 5, offer: 172000 },
  { id: 'L-2091', name: 'Willem de Vries', stage: 'viewing', temp: 'hot', lang: 'NL', deal: 'sale', source: 'referral',
    budget: 250000, interest: 'Тристаен с изглед Пирин', location: 'Сандански', agent: 'elena',
    phone: '+31 6 1188 4420', email: 'w.devries@post.nl', created: '2026-06-25', lastAct: 'вчера',
    matched: ['ms-778', 'ms-944'], tasks: 1, notes: 3 },
  { id: 'L-2096', name: 'Мария Стоянова', stage: 'new', temp: 'warm', lang: 'BG', deal: 'rent', source: 'phone',
    budget: 500, interest: 'Двустаен под наем, до парка', location: 'Сандански', agent: 'elena',
    phone: '+359 88 512 7710', email: 'm.stoyanova@abv.bg', created: '2026-07-03', lastAct: 'преди 1 час',
    matched: ['ms-957'], tasks: 1, notes: 1 },
  { id: 'L-2072', name: 'James Whitfield', stage: 'won', temp: 'hot', lang: 'EN', deal: 'sale', source: 'website',
    budget: 340000, interest: 'Къща с двор, полите на Пирин', location: 'Сандански', agent: 'elena',
    phone: '+44 7700 900 812', email: 'j.whitfield@uk.co', created: '2026-05-30', lastAct: 'преди 3 дни',
    matched: ['ms-939'], tasks: 0, notes: 8, offer: 331000 },
  { id: 'L-2099', name: 'Ирина Соколова', stage: 'new', temp: 'warm', lang: 'RU', deal: 'sale', source: 'facebook',
    budget: 200000, interest: 'Апартамент в спа комплекс', location: 'Сандански', agent: 'radoslav',
    phone: '+7 921 554 0090', email: 'i.sokolova@mail.ru', created: '2026-07-04', lastAct: 'преди 20 мин',
    matched: ['ms-778'], tasks: 0, notes: 0 },
  { id: 'L-2065', name: 'Familie Bakker', stage: 'viewing', temp: 'warm', lang: 'NL', deal: 'sale', source: 'website',
    budget: 90000, interest: 'Ски студио, Банско', location: 'Банско', agent: 'dimitar',
    phone: '+31 6 2044 7781', email: 'bakker@post.nl', created: '2026-06-20', lastAct: 'преди 4 часа',
    matched: ['ms-937'], tasks: 3, notes: 4 },
  { id: 'L-2081', name: 'Georgios Pappas', stage: 'offer', temp: 'warm', lang: 'EL', deal: 'sale', source: 'referral',
    budget: 150000, interest: 'Апартамент до плажа, Гърция', location: 'Офринио, Гърция', agent: 'mila',
    phone: '+30 694 55 20 118', email: 'g.pappas@greece.gr', created: '2026-06-12', lastAct: 'вчера',
    matched: ['ms-893'], tasks: 1, notes: 6, offer: 132000 },
  { id: 'L-2094', name: 'Петър Динев', stage: 'new', temp: 'cold', lang: 'BG', deal: 'sale', source: 'walkin',
    budget: 86000, interest: 'Вила за уикенд, Пирин', location: 'Илинденци', agent: 'dimitar',
    phone: '+359 87 664 2093', email: 'p.dinev@abv.bg', created: '2026-07-02', lastAct: 'преди 2 дни',
    matched: ['ms-956'], tasks: 0, notes: 1 },
  { id: 'L-2088', name: 'Sophie Laurent', stage: 'viewing', temp: 'warm', lang: 'EN', deal: 'sale', source: 'website',
    budget: 190000, interest: 'Море, Свети Влас', location: 'Свети Влас', agent: 'mila',
    phone: '+33 6 44 91 20 55', email: 's.laurent@fr.fr', created: '2026-06-28', lastAct: 'преди 6 часа',
    matched: ['ms-svlas'], tasks: 2, notes: 2 },
  { id: 'L-2058', name: 'Klaus Berger', stage: 'won', temp: 'hot', lang: 'DE', deal: 'sale', source: 'referral',
    budget: 170000, interest: 'Панорамен двустаен', location: 'Сандански', agent: 'elena',
    phone: '+49 151 220 7788', email: 'k.berger@de.de', created: '2026-05-22', lastAct: 'преди 5 дни',
    matched: ['ms-944'], tasks: 0, notes: 7, offer: 162000 },
  { id: 'L-2101', name: 'Noa Levi', stage: 'new', temp: 'warm', lang: 'HE', deal: 'rent', source: 'whatsapp',
    budget: 450, interest: 'Дългосрочен наем, обзаведен', location: 'Сандански', agent: 'elena',
    phone: '+972 52 118 4420', email: 'noa.levi@example.co.il', created: '2026-07-04', lastAct: 'преди 45 мин',
    matched: ['ms-957'], tasks: 0, notes: 0 },
  { id: 'L-2069', name: 'Николай Тодоров', stage: 'offer', temp: 'hot', lang: 'BG', deal: 'sale', source: 'phone',
    budget: 250000, interest: 'Апартамент в Парк Хотел Пирин', location: 'Сандански', agent: 'radoslav',
    phone: '+359 88 774 1120', email: 'n.todorov@gmail.com', created: '2026-06-15', lastAct: 'вчера',
    matched: ['ms-778'], tasks: 1, notes: 4, offer: 240000 },
];

/* ---- Stock the agency manages ---- */
const STOCK = [
  { ref: 'MS-987', id: 'ms-987', title: 'Двустаен в идеалния център', location: 'Сандански', deal: 'sale', price: 130000, status: 'active',   type: 'Двустаен', area: 55,  beds: 1, agent: 'elena',   views: 1840, enquiries: 12, listed: '2026-06-10' },
  { ref: 'MS-944', id: 'ms-944', title: 'Панорамен двустаен с гараж', location: 'Сандански', deal: 'sale', price: 165000, status: 'reserved', type: 'Двустаен', area: 117, beds: 1, agent: 'elena',   views: 2210, enquiries: 21, listed: '2026-05-28' },
  { ref: 'MS-778', id: 'ms-778', title: 'Тристаен, Парк Хотел Пирин', location: 'Сандански', deal: 'sale', price: 250000, status: 'active',   type: 'Тристаен', area: 93,  beds: 2, agent: 'radoslav',views: 1560, enquiries: 9,  listed: '2026-06-02' },
  { ref: 'MS-939', id: 'ms-939', title: 'Луксозна къща с двор', location: 'Сандански', deal: 'sale', price: 339000, status: 'sold',     type: 'Къща',     area: 220, beds: 4, agent: 'elena',   views: 3120, enquiries: 28, listed: '2026-04-18' },
  { ref: 'MS-937', id: 'ms-937', title: 'Обзаведено студио, Сапфир', location: 'Банско', deal: 'sale', price: 37500,  status: 'active',   type: 'Студио',   area: 30,  beds: 1, agent: 'dimitar', views: 4400, enquiries: 41, listed: '2026-03-30' },
  { ref: 'MS-956', id: 'ms-956', title: 'Каменна вила в Пирин', location: 'Илинденци', deal: 'sale', price: 86000,  status: 'active',   type: 'Вила',     area: 51,  beds: 2, agent: 'dimitar', views: 980,  enquiries: 6,  listed: '2026-06-22' },
  { ref: 'MS-957', id: 'ms-957', title: 'Двустаен под наем до парка', location: 'Сандански', deal: 'rent', price: 400, status: 'active',   type: 'Двустаен', area: 65,  beds: 1, agent: 'elena',   views: 1210, enquiries: 14, listed: '2026-06-26' },
  { ref: 'MS-2043',id: 'ms-svlas',title:'Апартамент с изглед море', location: 'Свети Влас', deal: 'sale', price: 189000, status: 'active',  type: 'Двустаен', area: 68,  beds: 2, agent: 'mila',    views: 2680, enquiries: 33, listed: '2026-06-05' },
  { ref: 'MS-893', id: 'ms-893', title: 'Тристаен в Паралия Офринио', location: 'Офринио, Гърция', deal: 'sale', price: 139000, status: 'reserved', type: 'Тристаен', area: 42, beds: 2, agent: 'mila', views: 1440, enquiries: 11, listed: '2026-05-14' },
  { ref: 'MS-1002',id: 'ms-1002',title:'Едностаен, ново строителство', location: 'Сандански', deal: 'sale', price: 62000, status: 'draft',    type: 'Едностаен', area: 38, beds: 0, agent: 'radoslav',views: 0,   enquiries: 0,  listed: '2026-07-01' },
];

const STOCK_STATUS = {
  active:   { label: 'Активна',    badge: 'for-sale' },
  reserved: { label: 'Резервирана',badge: 'reduced' },
  sold:     { label: 'Продадена',  badge: 'sold' },
  draft:    { label: 'Чернова',    badge: 'neutral' },
};

/* ---- This week's viewings (Mon–Sun, 09:00–19:00 scheduler) ---- */
const WEEK = ['Пон 06', 'Вт 07', 'Ср 08', 'Чет 09', 'Пет 10', 'Съб 11', 'Нед 12'];
const VIEWINGS = [
  { day: 0, start: 10, dur: 1, listing: 'MS-987', lead: 'Andreas Hofmann',  agent: 'elena',   status: 'confirmed' },
  { day: 0, start: 15, dur: 1, listing: 'MS-778', lead: 'Николай Тодоров',  agent: 'radoslav',status: 'confirmed' },
  { day: 1, start: 11, dur: 1, listing: 'MS-937', lead: 'Familie Bakker',   agent: 'dimitar', status: 'pending' },
  { day: 2, start: 9,  dur: 1, listing: 'MS-944', lead: 'Willem de Vries',  agent: 'elena',   status: 'confirmed' },
  { day: 2, start: 14, dur: 2, listing: 'MS-svlas',lead: 'Sophie Laurent',  agent: 'mila',    status: 'confirmed' },
  { day: 3, start: 12, dur: 1, listing: 'MS-957', lead: 'Emma Johansson',   agent: 'elena',   status: 'pending' },
  { day: 4, start: 10, dur: 1, listing: 'MS-778', lead: 'Ирина Соколова',   agent: 'radoslav',status: 'confirmed' },
  { day: 4, start: 16, dur: 1, listing: 'MS-893', lead: 'Georgios Pappas',  agent: 'mila',    status: 'cancelled' },
  { day: 5, start: 11, dur: 2, listing: 'MS-939', lead: 'James Whitfield',  agent: 'elena',   status: 'confirmed' },
];
const VIEW_STATUS = {
  confirmed: { label: 'Потвърден', tone: '#1F8A5B' },
  pending:   { label: 'Чака',      tone: '#C08422' },
  cancelled: { label: 'Отменен',   tone: '#B0A79A' },
};

/* ---- Contacts directory ---- */
const CONTACTS = [
  { id: 'C-101', name: 'Andreas Hofmann',  type: 'buyer',    lang: 'DE', location: 'München', phone: '+49 176 220 118', email: 'a.hofmann@mail.de', agent: 'elena',    props: 0, last: '2026-07-04' },
  { id: 'C-102', name: 'Стефан Маринов',   type: 'seller',   lang: 'BG', location: 'Сандански', phone: '+359 88 220 4471', email: 's.marinov@abv.bg', agent: 'elena',    props: 2, last: '2026-07-03' },
  { id: 'C-103', name: 'Willem de Vries',  type: 'buyer',    lang: 'NL', location: 'Utrecht', phone: '+31 6 1188 4420', email: 'w.devries@post.nl', agent: 'elena',    props: 0, last: '2026-07-02' },
  { id: 'C-104', name: 'Мария Стоянова',   type: 'tenant',   lang: 'BG', location: 'Сандански', phone: '+359 88 512 7710', email: 'm.stoyanova@abv.bg', agent: 'elena',   props: 0, last: '2026-07-03' },
  { id: 'C-105', name: 'Йорданка Петкова', type: 'landlord', lang: 'BG', location: 'Сандански', phone: '+359 88 991 3320', email: 'y.petkova@abv.bg', agent: 'elena',    props: 1, last: '2026-06-29' },
  { id: 'C-106', name: 'James Whitfield',  type: 'buyer',    lang: 'EN', location: 'Manchester', phone: '+44 7700 900 812', email: 'j.whitfield@uk.co', agent: 'elena',  props: 0, last: '2026-07-01' },
  { id: 'C-107', name: 'Familie Bakker',   type: 'buyer',    lang: 'NL', location: 'Rotterdam', phone: '+31 6 2044 7781', email: 'bakker@post.nl', agent: 'dimitar',    props: 0, last: '2026-07-04' },
  { id: 'C-108', name: 'Georgios Pappas',  type: 'buyer',    lang: 'EN', location: 'Kavala', phone: '+30 694 55 20 118', email: 'g.pappas@greece.gr', agent: 'mila',    props: 0, last: '2026-07-03' },
  { id: 'C-109', name: 'Ирина Соколова',   type: 'buyer',    lang: 'RU', location: 'Санкт-Петербург', phone: '+7 921 554 0090', email: 'i.sokolova@mail.ru', agent: 'radoslav', props: 0, last: '2026-07-04' },
  { id: 'C-110', name: 'Христо Ангелов',   type: 'seller',   lang: 'BG', location: 'Банско', phone: '+359 88 447 2210', email: 'h.angelov@abv.bg', agent: 'dimitar',    props: 1, last: '2026-06-27' },
];
const CONTACT_TYPE = {
  buyer:    { label: 'Купувач',    icon: 'search',     tone: 'sea' },
  seller:   { label: 'Продавач',   icon: 'home',       tone: 'brick' },
  tenant:   { label: 'Наемател',   icon: 'key',        tone: 'sun' },
  landlord: { label: 'Наемодател', icon: 'building-2', tone: 'ink' },
};

/* ---- Activity feed (recent, newest first) ---- */
const ACTIVITY = [
  { type: 'offer',  agent: 'elena',    text: 'Andreas Hofmann подаде оферта €172,000 за MS-987', time: 'преди 2 часа' },
  { type: 'lead',   agent: 'radoslav', text: 'Нов лийд: Ирина Соколова (RU) от Facebook', time: 'преди 20 мин' },
  { type: 'viewing',agent: 'mila',     text: 'Оглед потвърден: Sophie Laurent · MS-2043 · пет 14:00', time: 'преди 6 часа' },
  { type: 'note',   agent: 'elena',    text: 'Бележка към Willem de Vries: търси изглед към Пирин', time: 'вчера' },
  { type: 'won',    agent: 'elena',    text: 'Сделка спечелена: James Whitfield · MS-939 · капаро внесено', time: 'вчера' },
  { type: 'call',   agent: 'dimitar',  text: 'Обаждане до Familie Bakker (12 мин) — потвърден оглед', time: 'преди 4 часа' },
  { type: 'lead',   agent: 'elena',    text: 'Нов лийд: Noa Levi (HE) от WhatsApp', time: 'преди 45 мин' },
];
const ACT_ICON = {
  offer:   { icon: 'file-text',   tone: 'brick' },
  lead:    { icon: 'user-plus',   tone: 'sea' },
  viewing: { icon: 'calendar',    tone: 'sun' },
  note:    { icon: 'sticky-note', tone: 'ink' },
  won:     { icon: 'party-popper',tone: 'success' },
  call:    { icon: 'phone',       tone: 'sea' },
  email:   { icon: 'mail',        tone: 'sea' },
};

/* ---- Tasks (today / upcoming) ---- */
const TASKS = [
  { id: 't1', text: 'Изпрати договор на James Whitfield (MS-939)', due: 'Днес · 14:00', priority: 'high', done: false, lead: 'James Whitfield' },
  { id: 't2', text: 'Обади се на Andreas за насрещна оферта', due: 'Днес · 16:30', priority: 'high', done: false, lead: 'Andreas Hofmann' },
  { id: 't3', text: 'Подготви снимки за MS-1002', due: 'Утре · 10:00', priority: 'med', done: false, lead: null },
  { id: 't4', text: 'Потвърди оглед с Emma Johansson', due: 'Утре · 12:00', priority: 'med', done: false, lead: 'Emma Johansson' },
  { id: 't5', text: 'Актуализирай цената на MS-937 (−5%)', due: 'Чет · 09:00', priority: 'low', done: false, lead: null },
  { id: 't6', text: 'Изпрати оценка на Стефан Маринов', due: 'Вчера', priority: 'med', done: true, lead: 'Стефан Маринов' },
];

/* ---- KPIs for the dashboard ---- */
const KPIS = [
  { key: 'leads',    label: 'Активни лийдове',    value: 12,      delta: +3,   trend: 'up',   icon: 'users',        note: 'тази седмица' },
  { key: 'viewings', label: 'Огледи · седмица',   value: 9,       delta: +2,   trend: 'up',   icon: 'calendar-check',note: 'насрочени' },
  { key: 'offers',   label: 'Активни оферти',     value: 4,       delta: 0,    trend: 'flat', icon: 'file-text',    note: '€700,000 в игра' },
  { key: 'deals',    label: 'Сделки · месец',     value: 2,       delta: +1,   trend: 'up',   icon: 'handshake',    note: 'спечелени' },
  { key: 'revenue',  label: 'Комисиона · месец',  value: '€14,900',delta: +18, trend: 'up',   icon: 'trending-up',  note: '+18% спрямо май', wide: true },
];

/* ---- Reports data ---- */
const REPORTS = {
  funnel: [
    { stage: 'Запитвания', value: 48 },
    { stage: 'Огледи',     value: 26 },
    { stage: 'Оферти',     value: 11 },
    { stage: 'Сделки',     value: 6 },
  ],
  sources: [
    { label: 'Уебсайт',   value: 41, tone: 'ink' },
    { label: 'Препоръка', value: 22, tone: 'brick' },
    { label: 'Facebook',  value: 18, tone: 'sea' },
    { label: 'Обаждане',  value: 12, tone: 'sun' },
    { label: 'WhatsApp',  value: 7,  tone: 'success' },
  ],
  months: [
    { m: 'Яну', deals: 3, revenue: 9200 },
    { m: 'Фев', deals: 2, revenue: 6800 },
    { m: 'Мар', deals: 4, revenue: 13100 },
    { m: 'Апр', deals: 3, revenue: 10400 },
    { m: 'Май', deals: 5, revenue: 12600 },
    { m: 'Юни', deals: 6, revenue: 16800 },
    { m: 'Юли', deals: 2, revenue: 14900 },
  ],
  byAgent: [
    { agent: 'elena',    deals: 8, volume: 1240000 },
    { agent: 'radoslav', deals: 5, volume: 890000 },
    { agent: 'mila',     deals: 4, volume: 720000 },
    { agent: 'dimitar',  deals: 3, volume: 410000 },
  ],
};

/* ---- Messages inbox (multichannel threads with leads/contacts) ---- */
const CHANNELS = {
  whatsapp: { label: 'WhatsApp', icon: 'message-circle', tone: 'success' },
  email:    { label: 'Имейл',    icon: 'mail',           tone: 'sea' },
  website:  { label: 'Сайт',     icon: 'globe',          tone: 'ink' },
  sms:      { label: 'SMS',      icon: 'smartphone',     tone: 'sun' },
};

/* Each conversation: messages newest-last; dir 'in' (from client) / 'out' (agent). */
const CONVERSATIONS = [
  { id: 'CV-01', name: 'Andreas Hofmann', lead: 'L-2087', lang: 'DE', channel: 'whatsapp', agent: 'elena',
    unread: 2, pinned: true, last: 'преди 12 мин', online: true,
    preview: 'Können wir den Preis auf 170.000 € besprechen?',
    messages: [
      { dir: 'in',  t: '09:14', text: 'Guten Morgen Elena! Das Apartment MS-987 gefällt uns sehr.' },
      { dir: 'out', t: '09:20', text: 'Добро утро! Радвам се. Собственикът е отворен за разговор. Какво имате предвид?', orig: 'Guten Morgen! Freut mich. Der Eigentümer ist gesprächsbereit.' },
      { dir: 'in',  t: '09:36', text: 'Wir bieten 168.000 €. Ist ein Notartermin nächste Woche möglich?' },
      { dir: 'out', t: '10:02', text: 'Ще предам офертата днес. Нотариус — да, четвъртък е свободен.', orig: 'Ich leite das Angebot heute weiter. Notar am Donnerstag möglich.' },
      { dir: 'in',  t: '10:31', text: 'Können wir den Preis auf 170.000 € besprechen?' },
    ] },
  { id: 'CV-02', name: 'Мария Стоянова', lead: 'L-2096', lang: 'BG', channel: 'website', agent: 'elena',
    unread: 1, pinned: false, last: 'преди 1 час', online: false,
    preview: 'Свободен ли е двустайният до парка за оглед в събота?',
    messages: [
      { dir: 'in', t: '08:40', text: 'Здравейте! Видях двустаен под наем до парка (MS-957).' },
      { dir: 'in', t: '08:41', text: 'Свободен ли е двустайният до парка за оглед в събота?' },
    ] },
  { id: 'CV-03', name: 'Willem de Vries', lead: 'L-2091', lang: 'NL', channel: 'email', agent: 'elena',
    unread: 0, pinned: false, last: 'вчера', online: false,
    preview: 'Bedankt voor de rondleiding — we denken erover na.',
    messages: [
      { dir: 'out', t: 'Пон 16:10', text: 'Здравейте, потвърждавам огледа за MS-944 в сряда 09:00.', orig: 'Bevestiging bezichtiging MS-944, woensdag 09:00.' },
      { dir: 'in',  t: 'Ср 11:30', text: 'Bedankt voor de rondleiding — we denken erover na.' },
    ] },
  { id: 'CV-04', name: 'Emma Johansson', lead: 'L-2101', lang: 'EN', channel: 'whatsapp', agent: 'elena',
    unread: 3, pinned: false, last: 'преди 45 мин', online: true,
    preview: 'Is the furnished flat still available for long term?',
    messages: [
      { dir: 'in', t: '11:02', text: 'Hi! Saw your listing for a furnished 2-room.' },
      { dir: 'in', t: '11:03', text: 'Is the furnished flat still available for long term?' },
      { dir: 'in', t: '11:05', text: 'And is it pet friendly? 🐕' },
    ] },
  { id: 'CV-05', name: 'Николай Тодоров', lead: 'L-2069', lang: 'BG', channel: 'sms', agent: 'radoslav',
    unread: 0, pinned: false, last: 'преди 3 часа', online: false,
    preview: 'Разбрано, чакам обаждането ви следобед.',
    messages: [
      { dir: 'out', t: '13:20', text: 'Ще ви звънна за насрещната оферта по MS-778 около 16:00.' },
      { dir: 'in',  t: '13:44', text: 'Разбрано, чакам обаждането ви следобед.' },
    ] },
  { id: 'CV-06', name: 'Sophie Laurent', lead: 'L-2088', lang: 'EN', channel: 'email', agent: 'mila',
    unread: 0, pinned: false, last: 'вчера', online: false,
    preview: 'Perfect, Friday at 14:00 works for the sea-view viewing.',
    messages: [
      { dir: 'in', t: 'Чет 18:22', text: 'Perfect, Friday at 14:00 works for the sea-view viewing.' },
    ] },
  { id: 'CV-07', name: 'Ирина Соколова', lead: 'L-2099', lang: 'RU', channel: 'website', agent: 'radoslav',
    unread: 1, pinned: false, last: 'преди 20 мин', online: true,
    preview: 'Здравствуйте! Интересует апартамент в спа-комплексе.',
    messages: [
      { dir: 'in', t: '11:40', text: 'Здравствуйте! Интересует апартамент в спа-комплексе.' },
    ] },
];

window.CRM_DATA = {
  eur, CRM_AGENTS, ME, LANGS, STAGES, SOURCES, LEADS, STOCK, STOCK_STATUS,
  WEEK, VIEWINGS, VIEW_STATUS, CONTACTS, CONTACT_TYPE, ACTIVITY, ACT_ICON,
  TASKS, KPIS, REPORTS, CHANNELS, CONVERSATIONS,
};
