# Breadcrumb

Location trail above listing and resort pages. The last item is the current page (unlinked, stronger).

```jsx
<Breadcrumb items={[
  { label: 'Home', href: '/' },
  { label: 'For sale', href: '/for-sale' },
  { label: 'Burgas', href: '/for-sale/burgas' },
  { label: 'St Vlas' },
]} />
```

- Separator defaults to a chevron; muted links darken on hover.
