# MS Realty — Website UI kit

High-fidelity recreation of the MS Realty public website, composed from the design-system components. `index.html` is an interactive click-through:

**Home → Search results → Listing detail → Book a viewing**

## Run it
Open `index.html`. It loads `../../styles.css` + `../../_ds_bundle.js` (the compiled component library), Lucide (icons), React and Babel, then the screen files below.

## Screens
| File | Screen | Notes |
|---|---|---|
| `data.js` | Sample content | 8 listings across the six focus locations + 6 resorts + 3 agents. Prices via `money()`. Photography is represented by `.mk-photo` tones. |
| `SiteChrome.jsx` | `Wordmark`, `Header`, `Footer` | Sticky translucent header with nav, BG/EN/DE/NL/RU language switch and a Clay “Call an agent” CTA; dark Sea footer. |
| `HomePage.jsx` | Homepage | Full-bleed hero with the `SearchBar`, browse-by-resort grid, featured `PropertyCard` grid, value props, sell CTA band. |
| `SearchResults.jsx` | Search results | Sticky compact `SearchBar`, sticky filter sidebar (deal / price / beds / type / amenities), removable filter `Tag`s, horizontal `PropertyCard` rows, `Pagination`. |
| `ListingDetail.jsx` | Listing detail | `Breadcrumb`, photo gallery with overlaid `Badge`s + save/share, spec strip, description, feature `Tag`s, what’s-nearby, sticky agent `Card`, similar homes. |
| `ContactPanel.jsx` | Enquiry | `EnquiryForm` (shared) → `ContactPanel` (booking modal, opened from a listing) + `ContactPage` (the /contact route with office cards). Both have a success state. |

## Interaction map
- Hero `SearchBar` **Search** → results.
- Any `PropertyCard` → that listing’s detail page.
- Detail **Book a viewing** / **Request a call** → `ContactPanel` modal (pre-filled with the listing).
- Header **Contact** → full contact page.
- Header wordmark / footer → home.

## Notes
- Screens read primitives from `window.MaklerRealtyDesignSystem_9b7f1e` and export themselves to `window` (Babel scripts don’t share scope), so the load order in `index.html` matters: `data.js` → chrome → screens → inline `App`.
- This is a cosmetic recreation: filters, sort and pagination update local UI state but don’t re-query real data.
- No real photography or logo was supplied — see the root `readme.md` caveats.
