# PropertyCard

The centrepiece of every MS listing surface: a photo (real `image` URL, or a coastal placeholder `tone`) carrying status badges, a save heart and a photo count, above price, title, location and a bed/bath/m² spec row.

```jsx
<PropertyCard
  tone="sea"
  badges={[{ variant: 'for-sale', label: 'For sale' }, { variant: 'new', label: 'New' }]}
  price="€245,000"
  title="Sea-view apartment, Marina Cape"
  location="St Vlas, Burgas"
  beds={2} baths={1} area={68} photos={24} reference="MK-2043"
/>

{/* Rental, in a search-result list */}
<PropertyCard orientation="horizontal" tone="sand"
  badges={[{ variant: 'for-rent', label: 'For rent' }]}
  price="€900" per="/mo" title="Town-centre studio" location="Sandanski"
  beds={1} baths={1} area={42} />
```

- `tone`: `sea` · `sky` · `sand` · `sunset` · `pine` · `night` (placeholder photography). Pass `image` for a real photo.
- `orientation="horizontal"` for list rows; default vertical for grids.
- Prices render in Source Serif (display) in Sea; the save heart turns Clay when active.
