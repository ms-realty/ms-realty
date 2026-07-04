import React from 'react';
import { Icon } from '../general/Icon';
import { IconButton } from '../actions/IconButton';
import { Badge } from './Badge';

const CSS = `
.mk-pcard {
  display: flex; flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  font-family: var(--font-sans);
  color: var(--text-body);
  transition: box-shadow var(--dur-base) var(--ease-standard),
              transform var(--dur-base) var(--ease-out),
              border-color var(--dur-fast) var(--ease-standard);
}
.mk-pcard--interactive:hover { box-shadow: var(--shadow-card-hover); transform: translateY(-3px); }

.mk-pcard__media { position: relative; display: block; aspect-ratio: 4 / 3; text-decoration: none; }
.mk-pcard__media .mk-pcard__badges {
  position: absolute; top: 12px; left: 12px; z-index: 2;
  display: flex; gap: 6px; flex-wrap: wrap;
}
.mk-pcard__save { position: absolute; top: 10px; right: 10px; z-index: 2; }
.mk-pcard__count {
  position: absolute; bottom: 12px; right: 12px; z-index: 2;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px; border-radius: var(--radius-full);
  background: rgba(22,19,14,0.55); color: #fff;
  font-size: var(--text-xs); font-weight: var(--fw-medium);
  -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
}

.mk-pcard__body { display: flex; flex-direction: column; gap: 7px; padding: 16px 16px 14px; }
.mk-pcard__pricerow { display: flex; align-items: baseline; gap: 6px; }
.mk-pcard__price {
  font-family: var(--font-display); font-weight: var(--fw-semibold);
  font-size: var(--text-2xl); color: var(--price);
  letter-spacing: var(--tracking-tight); line-height: 1;
}
.mk-pcard__per { color: var(--text-muted); font-size: var(--text-sm); font-weight: var(--fw-medium); }
.mk-pcard__title {
  font-family: var(--font-display); font-weight: var(--fw-semibold);
  font-size: var(--text-lg); color: var(--text-strong);
  line-height: var(--lh-snug); margin: 0;
}
.mk-pcard__loc { display: flex; align-items: center; gap: 5px; color: var(--text-muted); font-size: var(--text-sm); }
.mk-pcard__loc .mk-icon { color: var(--text-muted); flex: none; }
.mk-pcard__specs {
  display: flex; align-items: center; gap: 16px;
  margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--border);
  color: var(--text-body); font-size: var(--text-sm);
}
.mk-pcard__specs span { display: inline-flex; align-items: center; gap: 6px; }
.mk-pcard__specs .mk-icon { color: var(--text-muted); flex: none; }
.mk-pcard__ref { margin-left: auto; font-family: var(--font-mono); font-size: var(--text-2xs); color: var(--text-subtle); letter-spacing: 0.02em; }

/* Horizontal (search-result row) */
.mk-pcard--row { flex-direction: row; }
.mk-pcard--row .mk-pcard__media { aspect-ratio: auto; flex: none; width: 38%; min-width: 210px; max-width: 340px; min-height: 190px; }
.mk-pcard--row .mk-pcard__body { flex: 1; padding: 18px 20px; gap: 8px; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-pcard-css')) {
  const el = document.createElement('style');
  el.id = 'mk-pcard-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * badges: array of { variant, label } (e.g. [{variant:'for-sale',label:'For sale'}])
 * specs:  { beds, baths, area } — area in m²
 */
export function PropertyCard({
  href = '#',
  image,
  tone = 'sea',
  badges = [],
  price,
  per,
  title,
  location,
  beds,
  baths,
  area,
  photos,
  reference,
  saved = false,
  onSave,
  orientation = 'vertical',
  className = '',
  ...rest
}) {
  const [isSaved, setSaved] = React.useState(saved);
  React.useEffect(() => setSaved(saved), [saved]);

  const mediaStyle = image ? { backgroundImage: `url(${image})` } : undefined;
  const cls = [
    'mk-pcard',
    orientation === 'horizontal' ? 'mk-pcard--row' : '',
    'mk-pcard--interactive',
    className,
  ].filter(Boolean).join(' ');

  const handleSave = (e) => {
    e.preventDefault(); e.stopPropagation();
    setSaved(s => !s);
    onSave && onSave(!isSaved);
  };

  return (
    <article className={cls} {...rest}>
      <a className={`mk-pcard__media mk-photo mk-photo--${tone}`} href={href} style={mediaStyle} aria-label={title}>
        {badges.length > 0 && (
          <div className="mk-pcard__badges">
            {badges.map((b, i) => <Badge key={i} variant={b.variant} solid>{b.label}</Badge>)}
          </div>
        )}
        <div className="mk-pcard__save">
          <IconButton icon={isSaved ? 'heart' : 'heart'} label={isSaved ? 'Saved' : 'Save'}
            variant="glass" round active={isSaved} onClick={handleSave} />
        </div>
        {photos != null && (
          <span className="mk-pcard__count"><Icon name="camera" size={13} /> {photos}</span>
        )}
      </a>
      <div className="mk-pcard__body">
        <div className="mk-pcard__pricerow">
          <span className="mk-pcard__price">{price}</span>
          {per && <span className="mk-pcard__per">{per}</span>}
        </div>
        {title && <h3 className="mk-pcard__title">{title}</h3>}
        {location && (
          <div className="mk-pcard__loc"><Icon name="map-pin" size={14} /> {location}</div>
        )}
        {(beds != null || baths != null || area != null) && (
          <div className="mk-pcard__specs">
            {beds != null && <span><Icon name="bed" size={16} /> {beds}</span>}
            {baths != null && <span><Icon name="bath" size={16} /> {baths}</span>}
            {area != null && <span><Icon name="ruler" size={16} /> {area} m²</span>}
            {reference && <span className="mk-pcard__ref">{reference}</span>}
          </div>
        )}
      </div>
    </article>
  );
}
