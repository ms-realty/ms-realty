# 360 Tour CMS Field Prototype

The design-system handoff screen at
`makler-realty-design-system/project/ui_kits/remaining/index.html` includes a
property-editor section with a dedicated 360 tour field.

Field contract:

- `tour_provider`: fixed to `photo-sphere-viewer` for the first CMS slice.
- `panorama_url`: required HTTPS URL for the equirectangular panorama image.
- `thumbnail_url`: optional listing-card thumbnail.
- `hotspots[]`: optional room labels with yaw, pitch, label, and target media.
- `is_public`: boolean gate for publishing the tour on listing detail pages.
- `accessibility_caption`: required text alternative for users who cannot use
  drag-based panorama navigation.

Minimal mount target:

```html
<div
  id="psv-editor-preview"
  data-library="Photo Sphere Viewer"
  data-panorama-url="https://cdn.example.test/listings/ms-987/panorama.jpg"
></div>
```

Implementation note for the CMS slice:

```js
import { Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

const viewer = new Viewer({
  container: document.querySelector("#psv-editor-preview"),
  panorama: formState.panorama_url,
  caption: formState.accessibility_caption,
  navbar: ["zoom", "move", "caption", "fullscreen"],
});
```

Do not publish a listing with a 360 tour unless the fallback gallery, caption,
and lead CTA still work without WebGL.
