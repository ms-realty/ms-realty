/* Contact: EnquiryForm (shared), ContactPanel (modal), ContactPage (route). */
const CT_DS = window.MaklerRealtyDesignSystem_9b7f1e;
const { Input: CTInput, Select: CTSelect, Checkbox: CTCheckbox, Button: CTButton,
        IconButton: CTIconButton, Icon: CTIcon, Card: CTCard } = CT_DS;

const ctCss = `
.ct-scrim { position:fixed; inset:0; z-index:80; background:var(--overlay); display:flex; align-items:center; justify-content:center; padding:24px; }
.ct-modal { width:100%; max-width:500px; background:var(--surface); border-radius:var(--radius-modal); box-shadow:var(--shadow-modal); overflow:hidden; }
@media (prefers-reduced-motion:no-preference){ .ct-scrim{ animation:ct-fade var(--dur-base) var(--ease-out); } .ct-modal{ animation:ct-pop var(--dur-slow) var(--ease-out); } }
@keyframes ct-fade{ from{ opacity:0 } to{ opacity:1 } }
@keyframes ct-pop{ from{ opacity:0; transform:translateY(14px) scale(.98) } to{ opacity:1; transform:none } }
.ct-modal__hd { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:22px 22px 0; }
.ct-modal__hd h2 { font-size:var(--text-2xl); }
.ct-modal__hd p { color:var(--text-muted); margin-top:5px; font-size:var(--text-base); }
.ct-ctx { display:flex; align-items:center; gap:12px; margin:16px 22px 0; padding:12px; background:var(--surface-sunken); border-radius:var(--radius-md); }
.ct-ctx__ph { width:46px; height:46px; border-radius:var(--radius-sm); flex:none; }
.ct-ctx b { display:block; font-size:var(--text-sm); color:var(--text-strong); font-weight:var(--fw-semibold); }
.ct-ctx span { font-size:var(--text-xs); color:var(--text-muted); }
.ct-ctx__price { margin-left:auto; font-family:var(--font-display); font-weight:600; color:var(--price); font-size:var(--text-lg); }

.ct-form { padding:20px 22px 24px; display:flex; flex-direction:column; gap:14px; }
.ct-form__row { display:flex; gap:12px; }
.ct-form__row > * { flex:1; }
.ct-ta { display:flex; flex-direction:column; gap:var(--space-2); font-family:var(--font-sans); }
.ct-ta label { font-size:var(--text-sm); font-weight:var(--fw-medium); color:var(--text-strong); }
.ct-ta textarea { border:1px solid var(--border-strong); border-radius:var(--radius-input); background:var(--surface); padding:12px; font:inherit; color:var(--text-strong); resize:vertical; min-height:88px; outline:none; transition:border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard); }
.ct-ta textarea:focus { border-color:var(--brand); box-shadow:var(--shadow-focus); }
.ct-ta textarea::placeholder { color:var(--text-subtle); }

.ct-done { padding:44px 30px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:14px; }
.ct-done__ic { width:64px; height:64px; border-radius:var(--radius-full); background:var(--success-50); color:var(--success-500); display:grid; place-items:center; }
.ct-done h2 { font-size:var(--text-2xl); }
.ct-done p { color:var(--text-muted); max-width:36ch; line-height:1.6; }

.ct-page { max-width:var(--container-2xl); margin:0 auto; padding:var(--section-y-sm) var(--gutter) 64px; }
.ct-page__head { max-width:60ch; margin-bottom:36px; }
.ct-page__head h1 { font-size:var(--display-sm); line-height:1.1; }
.ct-page__head p { color:var(--text-muted); font-size:var(--text-lg); margin-top:12px; }
.ct-page__cols { display:grid; grid-template-columns:1fr 480px; gap:44px; align-items:start; }
.ct-offices { display:flex; flex-direction:column; gap:16px; }
.ct-office { display:flex; gap:16px; }
.ct-office__ph { width:96px; height:96px; border-radius:var(--radius-lg); flex:none; }
.ct-office h3 { font-size:var(--text-lg); }
.ct-office__meta { display:flex; flex-direction:column; gap:5px; margin-top:7px; color:var(--text-body); font-size:var(--text-base); }
.ct-office__meta span { display:flex; align-items:center; gap:8px; }
.ct-office__meta .mk-icon { color:var(--text-muted); flex:none; }
@media (max-width:1080px){ .ct-page__cols{ grid-template-columns:1fr; } }
`;
if (!document.getElementById('mk-ct-css')) { const s=document.createElement('style'); s.id='mk-ct-css'; s.textContent=ctCss; document.head.appendChild(s); }

function EnquiryForm({ submitLabel = 'Изпрати запитване', onDone }) {
  return (
    <form className="ct-form" onSubmit={(e) => { e.preventDefault(); onDone && onDone(); }}>
      <div className="ct-form__row">
        <CTInput label="Име" placeholder="Иван" required />
        <CTInput label="Фамилия" placeholder="Петров" required />
      </div>
      <div className="ct-form__row">
        <CTInput label="Имейл" type="email" iconStart="mail" placeholder="you@email.com" required />
        <CTInput label="Телефон" type="tel" iconStart="phone" placeholder="+359 …" />
      </div>
      <CTSelect label="Предпочитан оглед" iconStart="calendar"
        options={['Възможно най-скоро','Този уикенд','До 2 седмици','Купувам от разстояние']} />
      <div className="ct-ta">
        <label htmlFor="ct-msg">Съобщение</label>
        <textarea id="ct-msg" placeholder="Кажете ни какво търсите — дати, бюджет, задължителни изисквания…"></textarea>
      </div>
      <CTCheckbox defaultChecked label="Изпращайте ми подобни нови оферти в района" />
      <CTButton type="submit" variant="accent" size="lg" fullWidth iconStart="send">{submitLabel}</CTButton>
    </form>
  );
}

function ContactPanel({ open, onClose, listing, money }) {
  const [done, setDone] = React.useState(false);
  React.useEffect(() => { if (open) setDone(false); }, [open]);
  if (!open) return null;
  return (
    <div className="ct-scrim" onClick={onClose}>
      <div className="ct-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {done ? (
          <div className="ct-done">
            <div className="ct-done__ic"><CTIcon name="check" size={30} strokeWidth={2.5} /></div>
            <h2>Запитването е изпратено</h2>
            <p>Благодарим — нашият {listing ? 'брокер за този имот' : 'екип'} ще ви върне обаждане до час, на вашия език.</p>
            <CTButton variant="primary" onClick={onClose}>Затвори</CTButton>
          </div>
        ) : (
          <>
            <div className="ct-modal__hd">
              <div>
                <h2>Запази оглед</h2>
                <p>Безплатно и без ангажимент. Ще потвърдим часа по телефона.</p>
              </div>
              <CTIconButton icon="x" label="Затвори" variant="ghost" onClick={onClose} />
            </div>
            {listing && (
              <div className="ct-ctx">
                <div className={`ct-ctx__ph mk-photo mk-photo--${listing.tone}`}></div>
                <div>
                  <b>{listing.title}</b>
                  <span>{listing.location} · Реф. {listing.ref}</span>
                </div>
                <div className="ct-ctx__price">{money(listing.price)}{listing.per || ''}</div>
              </div>
            )}
            <EnquiryForm submitLabel="Заяви оглед" onDone={() => setDone(true)} />
          </>
        )}
      </div>
    </div>
  );
}

function ContactPage() {
  const [done, setDone] = React.useState(false);
  const offices = [
    { name: 'Морски офис — Свети Влас', tone: 'sea', addr: 'Морски квартал, Свети Влас 8256', phone: '+359 88 421 7788', hours: 'Пон–Съб · 9:00–18:00' },
    { name: 'Струмски офис — Сандански', tone: 'sand', addr: 'ул. Македония 21, Сандански 2800', phone: '+359 88 660 2093', hours: 'Пон–Пет · 9:00–17:30' },
    { name: 'Пирински офис — Банско', tone: 'pine', addr: 'ул. Пирин 4, Банско 2770', phone: '+359 88 903 1140', hours: 'Зимен сезон · всеки ден' },
  ];
  return (
    <main className="ct-page">
      <div className="ct-page__head">
        <h1>Свържете се с местен брокер</h1>
        <p>Три офиса в България и екип, който работи на български, английски, немски, нидерландски и руски. Кажете ни какво търсите и ние поемаме нещата оттам.</p>
      </div>
      <div className="ct-page__cols">
        <div className="ct-offices">
          {offices.map(o => (
            <div className="ct-office" key={o.name}>
              <div className={`ct-office__ph mk-photo mk-photo--${o.tone}`}></div>
              <div>
                <h3>{o.name}</h3>
                <div className="ct-office__meta">
                  <span><CTIcon name="map-pin" size={16} /> {o.addr}</span>
                  <span><CTIcon name="phone" size={16} /> {o.phone}</span>
                  <span><CTIcon name="clock" size={16} /> {o.hours}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <CTCard elevated padding="lg">
          {done ? (
            <div className="ct-done" style={{ padding: '20px 4px' }}>
              <div className="ct-done__ic"><CTIcon name="check" size={30} strokeWidth={2.5} /></div>
              <h2>Съобщението е изпратено</h2>
              <p>Благодарим, че се свързахте — ще отговорим до час в работно време.</p>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 4 }}>Изпратете ни съобщение</h2>
              <EnquiryForm onDone={() => setDone(true)} />
            </>
          )}
        </CTCard>
      </div>
    </main>
  );
}

Object.assign(window, { EnquiryForm, ContactPanel, ContactPage });
