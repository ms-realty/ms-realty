/* MS Realty — sample content for the website UI kit (Bulgarian copy).
   Based on the real portfolio at makler-realty.com: MS Realty is a
   Sandanski-based agency. The bulk of stock is in Sandanski (a SPA town in
   the Struma valley, at the foot of Pirin — NO sea), plus Bansko (ski) and
   the coast (Sveti Vlas / Greece). `.mk-photo` tones stand in for real photos. */

const AGENTS = {
  elena:   { name: 'Елена Петрова',   office: 'Централен офис · Сандански', phone: '+359 879 69 68 70', tone: 'sand' },
  dimitar: { name: 'Димитър Колев',   office: 'Пирински офис · Банско',     phone: '+359 88 903 1140', tone: 'pine' },
  mila:    { name: 'Мила Георгиева',  office: 'Морски офис · Свети Влас',   phone: '+359 88 421 7788', tone: 'sea' },
};

const money = (n) => '€' + n.toLocaleString('en-US');

const LISTINGS = [
  {
    id: 'ms-987', ref: 'MS-987', deal: 'sale', tone: 'sand',
    title: 'Двустаен в идеалния център на Сандански', location: 'Сандански', region: 'Струмска долина',
    price: 130000, beds: 1, baths: 1, area: 55, floor: '3 / 5', year: 2019, photos: 22,
    badges: [{ variant: 'for-sale', label: 'Продажба' }, { variant: 'new', label: 'Ново' }],
    features: ['Обзаведен', 'Гараж', 'Климатик', 'До спа парка', 'Асансьор'],
    nearby: ['Минерален спа парк — 5 мин пеша', 'Пешеходна зона — 3 мин', 'Пирин — 15 мин', 'Границата с Гърция — 20 мин'],
    agent: 'elena', rating: 4.8, reviews: 34,
    desc: 'Напълно обзаведен двустаен апартамент в самия център на Сандански — най-топлия град в България. На минути от минералния спа парк и пешеходната зона, готов за нанасяне.',
  },
  {
    id: 'ms-944', ref: 'MS-944', deal: 'sale', tone: 'sand',
    title: 'Панорамен двустаен с гараж, паркова зона', location: 'Сандански', region: 'Струмска долина',
    price: 165000, beds: 1, baths: 1, area: 117, floor: '2 / 4', year: 2021, photos: 26,
    badges: [{ variant: 'for-sale', label: 'Продажба' }, { variant: 'featured', label: 'Топ оферта' }],
    features: ['Гараж', 'Панорамен изглед', 'Изглед към Пирин', 'Обзаведен', 'Балкон', 'Асансьор'],
    nearby: ['Спа парк — 8 мин', 'Център — 10 мин', 'Пирински пътеки — 15 мин', 'Мелник — 20 мин'],
    agent: 'elena', rating: 4.9, reviews: 18,
    desc: 'Просторен двустаен апартамент с гараж в тиха паркова зона на Сандански. Панорамен изглед към Пирин, продава се напълно обзаведен.',
  },
  {
    id: 'ms-778', ref: 'MS-778', deal: 'sale', tone: 'sand',
    title: 'Тристаен в комплекс Парк Хотел Пирин', location: 'Сандански', region: 'Струмска долина',
    price: 250000, beds: 2, baths: 2, area: 93, floor: '4 / 6', year: 2016, photos: 30,
    badges: [{ variant: 'for-sale', label: 'Продажба' }],
    features: ['СПА и минерален басейн', 'Изглед към Пирин', 'Обзаведен', 'Балкон', 'Рецепция', 'Паркинг'],
    nearby: ['СПА център — на място', 'Градски парк — 2 мин', 'Център — 10 мин', 'Границата с Гърция — 20 мин'],
    agent: 'elena', rating: 5.0, reviews: 12,
    desc: 'Обзаведен тристаен апартамент в комплекс Парк Хотел Пирин с целогодишен достъп до минерални басейни и спа. Силен имот за отдаване през спа сезона.',
  },
  {
    id: 'ms-939', ref: 'MS-939', deal: 'sale', tone: 'pine',
    title: 'Луксозна къща в Сандански', location: 'Сандански', region: 'Струмска долина',
    price: 339000, beds: 4, baths: 3, area: 220, floor: 'Самостоятелна', year: 2014, photos: 38,
    badges: [{ variant: 'for-sale', label: 'Продажба' }, { variant: 'featured', label: 'Топ оферта' }],
    features: ['Двор', 'Гараж', 'Изглед към Пирин', 'Камина', 'Барбекю', 'Собствено парно'],
    nearby: ['Център — 7 мин', 'Спа комплекс — 10 мин', 'Мелник — 20 мин', 'Границата с Гърция — 20 мин'],
    agent: 'elena', rating: 4.9, reviews: 9,
    desc: 'Съвременна четиристайна къща в полите на Пирин над Сандански, с двор, гараж и открит изглед към планината. Продава се с обзавеждане и барбекю зона.',
  },
  {
    id: 'ms-937', ref: 'MS-937', deal: 'sale', tone: 'pine',
    title: 'Обзаведено студио, Сапфир Резиденс', location: 'Банско', region: 'Пирин планина',
    price: 37500, beds: 1, baths: 1, area: 30, floor: '3 / 5', year: 2010, photos: 16,
    badges: [{ variant: 'for-sale', label: 'Продажба' }, { variant: 'reduced', label: 'Намалена' }],
    features: ['СПА и басейн', 'Ски мазе', 'Обзаведено', 'Изглед към планина', 'Асансьор'],
    nearby: ['Кабинков лифт — 700 м', 'Център — 10 мин пеша', 'Ресторанти — 5 мин', 'София — 2ч30'],
    agent: 'dimitar', rating: 4.6, reviews: 41,
    desc: 'Компактно обзаведено студио в поддържан ски комплекс Сапфир Резиденс, на кратка разходка от кабинковия лифт в Банско. Отличен имот за наем през зимата.',
  },
  {
    id: 'ms-956', ref: 'MS-956', deal: 'sale', tone: 'pine',
    title: 'Каменна вила в Пирин над Илинденци', location: 'Илинденци, Струмяни', region: 'Пирин планина',
    price: 86000, beds: 2, baths: 1, area: 51, floor: 'Самостоятелна', year: 2008, photos: 20,
    badges: [{ variant: 'for-sale', label: 'Продажба' }],
    features: ['Двор', 'Изглед към планина', 'Камина', 'Кладенец', 'Тишина', 'Барбекю'],
    nearby: ['Илинденци — 3 км', 'Мелник — 25 мин', 'Сандански — 30 мин', 'Границата с Гърция — 40 мин'],
    agent: 'dimitar', rating: 4.7, reviews: 15,
    desc: 'Каменна вила сред природата на Пирин над село Илинденци — тишина, чист въздух и открит планински изглед. Идеална за уикенд убежище.',
  },
  {
    id: 'ms-957', ref: 'MS-957', deal: 'rent', tone: 'sand',
    title: 'Двустаен под наем до парка на Сандански', location: 'Сандански', region: 'Струмска долина',
    price: 400, per: '/мес', beds: 1, baths: 1, area: 65, floor: '2 / 5', year: 2017, photos: 14,
    badges: [{ variant: 'for-rent', label: 'Под наем' }],
    features: ['Обзаведен', 'Климатик', 'Балкон', 'До спа парка', 'Асансьор'],
    nearby: ['Градски парк — 3 мин', 'Пешеходна зона — 5 мин', 'Автогара — 10 мин', 'Границата с Гърция — 20 мин'],
    agent: 'elena', rating: 4.7, reviews: 11,
    desc: 'Просторен и светъл двустаен апартамент под наем до градския парк на Сандански. Обзаведен, свободен за дългосрочен наем.',
  },
  {
    id: 'ms-svlas', ref: 'MS-2043', deal: 'sale', tone: 'sea',
    title: 'Апартамент с изглед море, Свети Влас', location: 'Свети Влас', region: 'Черноморие',
    price: 189000, beds: 2, baths: 1, area: 68, floor: '4 / 8', year: 2018, photos: 24,
    badges: [{ variant: 'for-sale', label: 'Продажба' }, { variant: 'new', label: 'Ново' }],
    features: ['Изглед море', 'Балкон', 'Общ басейн', 'Обзаведен', 'Асансьор', 'Паркинг'],
    nearby: ['Плаж — 300 м', 'Марина — 500 м', 'Несебър — 10 мин', 'Летище Бургас — 35 мин'],
    agent: 'mila', rating: 4.8, reviews: 63,
    desc: 'Светъл двустаен апартамент на няколко крачки от морето в Свети Влас. Южен балкон с изглед към залива, продава се обзаведен и готов за летния сезон.',
  },
  {
    id: 'ms-893', ref: 'MS-893', deal: 'sale', tone: 'sunset',
    title: 'Тристаен в Паралия Офринио, Гърция', location: 'Офринио, Гърция', region: 'Егейско крайбрежие',
    price: 139000, beds: 2, baths: 1, area: 42, floor: '1 / 3', year: 2012, photos: 18,
    badges: [{ variant: 'for-sale', label: 'Продажба' }],
    features: ['Близо до плажа', 'Балкон', 'Обзаведен', 'Климатик', 'Паркинг'],
    nearby: ['Плаж — 200 м', 'Кавала — 25 мин', 'Солун — 1ч', 'Границата — 1ч20'],
    agent: 'mila', rating: 4.5, reviews: 22,
    desc: 'Тристаен апартамент на 200 метра от плажа в Паралия Офринио, Северна Гърция. Удобен за клиенти от Сандански — на час от Солун.',
  },
];

const RESORTS = [
  { slug: 'sandanski',    name: 'Сандански',    region: 'СПА курорт · Струмска долина', count: 142, tone: 'sand' },
  { slug: 'bansko',       name: 'Банско',       region: 'Ски курорт · Пирин планина',   count: 88,  tone: 'pine' },
  { slug: 'melnik',       name: 'Мелник',       region: 'Вино и история · Струма',       count: 24,  tone: 'sunset' },
  { slug: 'st-vlas',      name: 'Свети Влас',   region: 'Морски курорт · Черноморие',    count: 57,  tone: 'sea' },
  { slug: 'nafplio',      name: 'Нафплио',      region: 'Морски курорт · Гърция',        count: 19,  tone: 'sunset' },
  { slug: 'petrich',      name: 'Петрич',       region: 'Струмска долина',               count: 46,  tone: 'sand' },
];

window.MK_DATA = { LISTINGS, RESORTS, AGENTS, money };
