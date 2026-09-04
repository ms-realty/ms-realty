import fs from "node:fs";
import { page, icon, subnav } from "../shell.mjs";
const W = (n) => new URL(`../${n}`, import.meta.url);

const SITE_NAV = (on) => subnav([
  ["Pages", "tree", on === "pages"], ["Area guides", "map", on === "guides"], ["News", "file", on === "news"],
  ["Navigation", "list", on === "nav"], ["Forms", "form", on === "forms"], ["Media", "image", on === "media"],
  ["SEO and redirects", "route", on === "seo"],
]);

const MED_CSS = `
    .drop { display:grid; place-items:center; gap:8px; margin:16px; padding:24px; border-radius:var(--r-md);
      border:1.5px dashed var(--border-control); background:var(--tile); text-align:center; }
    .drop b { font-size:13px; font-weight:600; color:var(--text-strong); }
    .drop span { font-size:13px; color:var(--text-muted); }
    .gal { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; padding:0 16px 16px; }
    .tile { border:1px solid var(--border); border-radius:var(--r-md); overflow:hidden; background:var(--surface);
      position:relative; }
    .tile .im { height:104px; display:grid; place-items:center; background:var(--joint); color:var(--marble-500);
      position:relative; }
    /* Actions appear on hover; the tile shows three, and the rest live in the editor.
       Five buttons in a 150px tile was a scrollbar pretending to be a toolbar. */
    .tile .ov { position:absolute; inset:auto 0 0 0; display:flex; gap:4px; padding:8px; justify-content:center;
      background:linear-gradient(transparent,rgba(24,24,24,.78)); opacity:0; transition:opacity .14s ease-out; }
    .tile:hover .ov, .tile[data-hover] .ov { opacity:1; }
    .tile .ov button { display:grid; place-items:center; width:28px; height:28px; border-radius:var(--r-sm);
      border:0; background:rgba(255,255,255,.94); color:var(--ink-800); cursor:pointer; }
    .tile .sel { position:absolute; top:7px; left:7px; width:17px; height:17px; border-radius:var(--r-xs);
      border:1.5px solid rgba(255,255,255,.9); background:rgba(24,24,24,.35); }
    .tile .sel[data-on] { background:var(--ink-800); border-color:var(--ink-800);
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12 5 5 9-10'/%3E%3C/svg%3E");
      background-size:12px 12px; background-position:center; background-repeat:no-repeat; }
    .tile .flag { position:absolute; top:6px; right:6px; }
    .tile .mt { padding:8px 8px; display:grid; gap:4px; }
    .tile .mt b { font-size:11px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tile .mt span { font-size:11px; color:var(--text-muted); }
    .bulk { display:flex; align-items:center; gap:8px; padding:12px 16px; background:var(--spring-50);
      border-bottom:1px solid var(--spring-100); font-size:13px; font-weight:600; color:var(--spring-800);
      flex-wrap:wrap; }
    .side-sect { padding:16px 16px; border-bottom:1px solid var(--border); }
    .side-sect:last-child { border-bottom:0; }
    .side-sect > b { display:block; font-size:13px; margin-bottom:8px; }
`;

const TILES = [
  ["villa-katuntsi-01.jpg", "MS-00191 · 2400×1600 · 412 KB", "Cover", "ink", "", ""],
  ["villa-katuntsi-02.jpg", "MS-00191 · 2400×1600 · 388 KB", "", "", true],
  ["villa-katuntsi-pool.jpg", "MS-00191 · no alt text", "Needs alt", "warn", "", ""],
  ["sandanski-apt-01.jpg", "MS-00815 · 1800×1200 · 301 KB", "", "", "", ""],
  ["sandanski-apt-02.jpg", "MS-00815 · note: a face is visible", "Needs review", "warn", "blur", ""],
  ["studio-baths-01.jpg", "MS-00791 · 1600×1067 · 244 KB", "", "", "", ""],
  ["plot-levunovo-01.jpg", "MS-00872 · note: a document is in frame", "Held", "danger", "blur", ""],
  ["melnik-house-01.jpg", "MS-00932 · 2000×1333 · 356 KB", "", "", "", ""],
  ["tour-villa-katuntsi.jpg", "360° tour · equirectangular", "Tour", "sea", "", ""],
  ["office-sandanski.jpg", "Contact page · 1600×900", "", "", "", ""],
  ["team-mariya.jpg", "Team profile · 800×800", "", "", "", ""],
  ["legacy-unnamed-4412.jpg", "Not attached to anything", "Unmatched", "sand", "", ""],
];

const MED_BODY = `      <div class="ph">
        <div><h1>Media</h1><p>11,859 files mirrored from the legacy sites into R2. A photo reaches the public site only after a person has checked what is in it.</p></div>
        <div class="ph-actions">
          <button class="btn" type="button">${icon("download", 15)}<span>Download selection</span></button>
          <button class="btn" type="button">${icon("check", 15)}<span>Review queue (46)</span></button>
          <button class="btn btn--primary" type="button">${icon("upload", 15)}<span>Upload</span></button>
        </div>
      </div>
      ${SITE_NAV("media")}
      <div style="display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:20px; align-items:start">
        <section class="panel">
          <div class="toolbar">
            <span class="find">${icon("search", 14)}File name, listing or caption</span>
            <button class="btn btn--sm" type="button">Needs review ${icon("down", 13)}</button>
            <button class="btn btn--sm" type="button">Any listing ${icon("down", 13)}</button>
            <button class="btn btn--sm" type="button">Missing alt text ${icon("down", 13)}</button>
            <button class="btn btn--sm btn--ghost" type="button">Clear</button>
            <span style="margin-left:auto; display:flex; gap:8px">
              <button class="btn btn--sm" type="button">${icon("grid", 13)}</button>
              <button class="btn btn--sm" type="button">${icon("list", 13)}</button></span>
          </div>
          <div class="bulk">
            ${icon("check", 15)}<span>3 selected</span>
            <button class="btn btn--sm" type="button">${icon("check", 12)}<span>Review 3 together…</span></button>
            <button class="btn btn--sm" type="button">${icon("alert", 12)}<span>Hold</span></button>
            <button class="btn btn--sm" type="button">${icon("sparkles", 12)}<span>Draft alt text</span></button>
            <button class="btn btn--sm" type="button">${icon("building", 12)}<span>Attach to a listing</span></button>
            <button class="btn btn--sm" type="button">${icon("swap", 12)}<span>Replace</span></button>
            <button class="btn btn--sm" type="button">${icon("download", 12)}<span>Download</span></button>
            <button class="btn btn--sm btn--danger" type="button">${icon("trash", 12)}<span>Remove</span></button>
            <a href="#" style="margin-left:auto; font-weight:600">Clear selection</a>
          </div>
          <div class="drop">
            ${icon("upload", 22)}
            <b>Drop photos here, or choose files</b>
            <span>JPEG, PNG, WebP or AVIF · up to 50 megapixels · location data is removed on upload</span>
          </div>
          <div class="gal">
${TILES.map(([n, m, flag, tone, hover]) => `            <div class="tile">
              <div class="im">${icon("image", 26)}
                <span class="sel"${flag === "Cover" ? ' data-on="1"' : ""}></span>
                ${flag ? `<span class="flag pill pill--${tone}" style="padding:4px 8px; font-size:11px">${flag}</span>` : ""}
                <span class="ov"${hover ? ' style="opacity:1"' : ""}>
                  <button type="button" title="Open the editor">${icon("crop", 15)}</button>
                  <button type="button" title="Set as cover">${icon("star", 15)}</button>
                  <button type="button" title="More">${icon("list", 15)}</button>
                </span>
              </div>
              <div class="mt"><b>${n}</b><span>${m}</span></div>
            </div>`).join("\n")}
          </div>
          <div class="foot"><span>Showing 12 of 11,859 · 46 awaiting review · 312 without alt text</span>
            <span style="display:flex; gap:8px">
              <button class="btn btn--sm" type="button">${icon("sparkles", 13)}<span>Draft alt text for 312</span></button>
              <button class="btn btn--sm" type="button">Next</button></span></div>
        </section>
        <div style="display:grid; gap:16px">
          <section class="panel">
            <div class="panel-hd"><h2>Review queue</h2><span class="sub">46</span></div>
            <div class="side-sect" style="display:grid; gap:8px; font-size:13px">
              <div class="kvline"><span>Awaiting a human review</span><b>46</b></div>
              <div class="kvline"><span>Without alt text</span><b>312</b></div>
              <div class="kvline"><span>Gallery too thin to publish</span><b>18</b></div>
              <div class="kvline"><span>Tour awaiting review</span><b>3</b></div>
              <button class="btn btn--sm btn--primary" type="button" style="margin-top:4px">Start reviewing</button>
              <span class="hint">These four are what listing-quality computes: media_review_pending,
                missing_alt_text, thin_public_gallery, tour_review_pending. Nothing here detects a face,
                a number plate or a watermark — a person does, and records it as a note.</span>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>What happens on upload</h2></div>
            <div class="side-sect" style="display:grid; gap:8px; font-size:13px">
              <div style="display:flex; gap:8px">${icon("shield", 15)}<span>EXIF, XMP and IPTC are stripped in process, so a seller's home coordinates never reach storage.</span></div>
              <div style="display:flex; gap:8px">${icon("image", 15)}<span>Resized to a 2560px long edge at quality 82, and a 640px thumbnail is written beside it.</span></div>
              <div style="display:flex; gap:8px">${icon("layers", 15)}<span>Stored as JPEG, PNG or WebP, whichever is smaller for that photo.</span></div>
              <div style="display:flex; gap:8px">${icon("lock", 15)}<span>Nothing is public until a person approves it.</span></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-hd"><h2>Storage</h2></div>
            <div class="side-sect" style="display:grid; gap:8px">
              <div class="kvline"><span>Files in R2</span><b>11,859</b></div>
              <div class="kvline"><span>Originals kept</span><b>4,978</b></div>
              <div class="kvline"><span>Total</span><b>38.4 GB</b></div>
              <div class="kvline"><span>Unreferenced</span><b>15 · 41 MB</b></div>
              <button class="btn btn--sm" type="button" style="margin-top:4px">Review the unreferenced</button>
            </div>
          </section>
        </div>
      </div>`;
fs.writeFileSync(W("Media.dc.html"), page({ active: "website", body: MED_BODY, extraCss: MED_CSS, height: 1240 }));

/* -------------------------------------------------------------- Media editor */
const ED_CSS = `
    .ed { display:grid; grid-template-columns:52px minmax(0,1fr) 352px; gap:0; border:1px solid var(--border);
      border-radius:var(--r-lg); overflow:hidden; background:var(--surface); box-shadow:var(--e-2); }
    .tools { border-right:1px solid var(--border); background:var(--tile); display:grid;
      align-content:start; gap:4px; padding:8px 8px; }
    .tool { display:grid; place-items:center; width:38px; height:38px; border-radius:var(--r-md);
      border:1px solid transparent; background:transparent; color:var(--text-body); cursor:pointer; }
    .tool:hover { background:var(--joint); }
    .tool[data-on] { background:var(--ink-800); color:#fff; }
    .tool-sep { height:1px; background:var(--border); margin:4px 4px; }
    .stage { background:var(--marble-900); display:grid; grid-template-rows:auto minmax(0,1fr) auto; min-width:0; }
    .stage-top { display:flex; align-items:center; gap:8px; padding:8px 12px;
      border-bottom:1px solid rgba(255,255,255,.1); }
    .chip { display:inline-flex; align-items:center; gap:8px; height:27px; padding:0 12px; border-radius:var(--r-sm);
      background:rgba(255,255,255,.09); color:rgba(255,255,255,.82); font-size:11px; font-weight:600;
      border:1px solid transparent; cursor:pointer; }
    .chip[data-on] { background:#fff; color:var(--marble-900); }
    .canvas { position:relative; display:grid; place-items:center; padding:24px; min-height:396px; }
    /* A stand-in for the photograph itself: warm stone tones so the crop overlay,
       the focal marker and the redaction box are all judged against a real value range. */
    .photo { position:relative; width:576px; height:384px; overflow:hidden;
      background:linear-gradient(160deg,#6f6350 0%,#9b8a6b 42%,#c4b394 72%,#8d7c5e 100%); }
    .photo::after { content:''; position:absolute; inset:0;
      background:radial-gradient(120% 90% at 30% 25%, rgba(255,255,255,.22), transparent 60%),
        radial-gradient(90% 70% at 78% 82%, rgba(20,19,14,.32), transparent 62%); }
    .cropbox { position:absolute; inset:34px 62px 30px 48px; box-shadow:0 0 0 9999px rgba(20,19,14,.58);
      border:1px solid rgba(255,255,255,.92); }
    .cropbox i { position:absolute; width:12px; height:12px; border:2px solid #fff; background:transparent; }
    .cropbox .tl { top:-2px; left:-2px; border-right:0; border-bottom:0; }
    .cropbox .tr { top:-2px; right:-2px; border-left:0; border-bottom:0; }
    .cropbox .bl { bottom:-2px; left:-2px; border-right:0; border-top:0; }
    .cropbox .br { bottom:-2px; right:-2px; border-left:0; border-top:0; }
    .thirds { position:absolute; inset:0; }
    .thirds span { position:absolute; background:rgba(255,255,255,.3); }
    .focal { position:absolute; width:24px; height:24px; border-radius:var(--r-pill); border:2px solid #fff;
      background:rgba(255,255,255,.22); display:grid; place-items:center; }
    .focal::after { content:''; width:5px; height:5px; border-radius:var(--r-pill); background:#fff; }
    .redact { position:absolute; border:1.5px dashed var(--brick-400); background:rgba(219,62,62,.2);
      display:grid; place-items:center; }
    .redact span { font:600 11px var(--font-sans); color:#fff; background:var(--brick-600);
      padding:4px 4px; border-radius:var(--r-edge); }
    .stage-foot { display:flex; align-items:center; gap:12px; padding:8px 12px;
      border-top:1px solid rgba(255,255,255,.1); color:rgba(255,255,255,.66); font-size:11px; }
    .insp { display:grid; align-content:start; min-width:0; }
    .insp-tabs { display:flex; gap:16px; padding:0 16px; border-bottom:1px solid var(--border); }
    .insp-tabs a { padding:12px 0 12px; font-size:13px; font-weight:600; color:var(--text-muted);
      border-bottom:2px solid transparent; margin-bottom:-4px; }
    .insp-tabs a[data-on] { color:var(--text-strong); border-bottom-color:var(--ink-800); }
    .isect { padding:16px 16px; border-bottom:1px solid var(--border); display:grid; gap:8px; }
    .isect > b { font-size:13px; font-weight:600; }
    .locline { display:grid; grid-template-columns:30px minmax(0,1fr) auto; gap:8px; align-items:center;
      font-size:13px; padding:4px 0; border-bottom:1px solid var(--border); }
    .locline:last-child { border-bottom:0; }
    .locline u { text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      color:var(--text-body); }
    .rend { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:12px; align-items:center;
      font-size:13px; padding:8px 0; border-bottom:1px solid var(--border); }
    .rend:last-child { border-bottom:0; }
    .slider { height:4px; border-radius:var(--r-pill); background:var(--joint); position:relative; }
    .slider i { position:absolute; top:-5px; width:14px; height:14px; border-radius:var(--r-pill); background:var(--surface);
      border:1.5px solid var(--border-control); box-shadow:var(--e-1); }
`;

const ED_BODY = `      <div class="crumbs">
        <a href="#">Website</a> ${icon("chevron", 13)} <a href="#">Media</a> ${icon("chevron", 13)}
        <b>villa-katuntsi-pool.jpg</b>
      </div>
      <div class="ph">
        <div><h1>villa-katuntsi-pool.jpg</h1>
          <p>Attached to <span class="mono">MS-00191</span> · uploaded 2 Aug by Mariya · 2400 × 1600 · 412 KB · JPEG</p></div>
        <div class="ph-actions">
          <span class="pill pill--warn"><i></i>No alt text</span>
          <button class="btn" type="button">${icon("undo", 15)}<span>Revert to original</span></button>
          <button class="btn" type="button">${icon("download", 15)}<span>Download</span></button>
          <button class="btn btn--primary" type="button">Save</button>
        </div>
      </div>
      <div class="ed">
        <div class="tools">
          <button class="tool" data-on="1" type="button" title="Crop">${icon("crop", 18)}</button>
          <button class="tool" type="button" title="Rotate and straighten">${icon("rotate", 18)}</button>
          <button class="tool" type="button" title="Flip">${icon("flip", 18)}</button>
          <button class="tool" type="button" title="Focal point">${icon("focus", 18)}</button>
          <button class="tool" type="button" title="Redact">${icon("blur", 18)}</button>
          <div class="tool-sep"></div>
          <button class="tool" type="button" title="Replace the file">${icon("swap", 18)}</button>
          <button class="tool" type="button" title="Set as cover">${icon("star", 18)}</button>
          <div class="tool-sep"></div>
          <button class="tool" type="button" title="Undo">${icon("undo", 18)}</button>
          <button class="tool" type="button" title="Zoom">${icon("zoom", 18)}</button>
          <div class="tool-sep"></div>
          <button class="tool" type="button" title="Remove">${icon("trash", 18)}</button>
        </div>

        <div class="stage">
          <div class="stage-top">
            <span class="chip" data-on="1">Free</span>
            <span class="chip">16:9</span>
            <span class="chip">4:3</span>
            <span class="chip">3:2</span>
            <span class="chip">1:1</span>
            <span class="chip">Card 5:4</span>
            <span class="chip" style="margin-left:8px">${icon("rotate", 13)}−1.5°</span>
            <span style="margin-left:auto; display:flex; gap:8px">
              <span class="chip">${icon("undo", 13)}Undo</span>
              <span class="chip">Reset</span>
            </span>
          </div>
          <div class="canvas">
            <div class="photo">
              <div class="cropbox">
                <div class="thirds">
                  <span style="left:33.3%; top:0; bottom:0; width:1px"></span>
                  <span style="left:66.6%; top:0; bottom:0; width:1px"></span>
                  <span style="top:33.3%; left:0; right:0; height:1px"></span>
                  <span style="top:66.6%; left:0; right:0; height:1px"></span>
                </div>
                <i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>
                <div class="focal" style="left:38%; top:44%"></div>
              </div>
              <div class="redact" style="left:66%; top:62%; width:82px; height:46px"><span>Face</span></div>
            </div>
          </div>
          <div class="stage-foot">
            <span>Crop 1980 × 1320 · 3:2</span><span>·</span>
            <span>Focal point 38% 44%</span><span>·</span>
            <span>1 redaction</span>
            <span style="margin-left:auto">Editing a copy — the original is kept</span>
          </div>
        </div>

        <div class="insp">
          <nav class="insp-tabs"><a href="#" data-on="1">Details</a><a href="#">Renditions</a><a href="#">Provenance</a><a href="#">Usage</a></nav>

          <div class="isect">
            <b>Alt text <span class="muted" style="font-weight:400">— what a screen reader says</span></b>
            <div class="locline"><span style="display:grid; place-items:center; height:19px; border-radius:var(--r-xs); background:var(--joint); color:var(--marble-700); font:700 11px var(--font-sans)">BG</span>
              <u class="muted">Not set</u><button class="btn btn--sm" type="button">Write</button></div>
            <div class="locline"><span style="display:grid; place-items:center; height:19px; border-radius:var(--r-xs); background:var(--joint); color:var(--marble-700); font:700 11px var(--font-sans)">EN</span>
              <u class="muted">Not set</u><button class="btn btn--sm" type="button">Write</button></div>
            <div class="locline"><span style="display:grid; place-items:center; height:19px; border-radius:var(--r-xs); background:var(--joint); color:var(--marble-700); font:700 11px var(--font-sans)">DE</span>
              <u class="muted">Not set</u><button class="btn btn--sm" type="button">Write</button></div>
            <div class="note note--ai">${icon("sparkles", 14)}<span>Hermes can describe what is visible in all five published languages. It flagged a face in this photo.</span></div>
            <button class="btn btn--sm" type="button">${icon("sparkles", 13)}<span>Draft alt text</span></button>
          </div>

          <div class="isect">
            <b>Caption <span class="muted" style="font-weight:400">— shown under the photo</span></b>
            <span class="in in--empty">Not set</span>
          </div>

          <div class="isect">
            <b>Placement</b>
            <div class="kvline"><span>Listing</span><span class="mono">MS-00191</span></div>
            <div class="kvline"><span>Position in the gallery</span><b>3 of 14</b></div>
            <div style="display:flex; gap:8px; flex-wrap:wrap">
              <button class="btn btn--sm" type="button">${icon("star", 12)}<span>Set as cover</span></button>
              <button class="btn btn--sm" type="button">${icon("swap", 12)}<span>Move</span></button>
              <button class="btn btn--sm" type="button">${icon("building", 12)}<span>Reattach</span></button>
            </div>
          </div>

          <div class="isect">
            <b>Compression</b>
            <div class="kvline"><span>Quality</span><b>82</b></div>
            <div class="slider"><i style="left:74%"></i></div>
            <div class="kvline"><span>Long edge</span><b>2560 px</b></div>
            <div class="slider"><i style="left:80%"></i></div>
            <span class="hint">Lower quality below 70 shows on a large screen. These are the workspace defaults.</span>
          </div>

          <div class="isect" style="border-bottom:0">
            <b>Review</b>
            <div class="note note--warn">${icon("alert", 14)}<span>Reviewer's note: a face is visible. Publish
              it only with the person's permission, or redact it first.</span></div>
            <div style="display:grid; gap:12px; margin-top:8px">
              <div class="field"><label for="media-decision">Decision</label>
                <span class="in" id="media-decision">Publish on the public site ${icon("down", 13)}</span></div>
              <div class="field"><label for="media-kind">Kind</label>
                <span class="in" id="media-kind">Photo ${icon("down", 13)}</span></div>
              <div class="field"><label for="media-alt">Alt text <em>required to publish</em></label>
                <span class="in in--area" id="media-alt">South-facing terrace of a two-bedroom apartment,
                  looking towards the Pirin ridge.</span></div>
              <div class="field"><label for="media-reviewer">Reviewer <em>required</em></label>
                <span class="in" id="media-reviewer">mariya.ivanova</span></div>
              <div style="display:flex; align-items:flex-start; gap:8px; font-size:13px">
                <span class="box" data-on="1"></span>
                <span>I have looked at this image and I am accountable for publishing it.</span>
              </div>
            </div>
            <div style="display:flex; gap:8px; margin-top:12px">
              <button class="btn btn--sm btn--primary" type="button">${icon("check", 12)}<span>Save this review</span></button>
              <button class="btn btn--sm" type="button">Hold</button>
            </div>
            <span class="hint">The server refuses a review without a named person and that confirmation,
              and refuses to publish without alt text. A one-click Approve cannot exist here.</span>
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:16px">
        <section class="panel">
          <div class="panel-hd"><h2>Renditions</h2><span class="sub">Written on save</span></div>
          <div style="padding:8px 16px 12px">
            <div class="rend">${icon("image", 16)}<span><b style="font-size:13px">Original</b>
              <span style="display:block; font-size:11px" class="muted">2400 × 1600 · JPEG · 412 KB</span></span>
              <button class="btn btn--sm" type="button">Download</button></div>
            <div class="rend">${icon("image", 16)}<span><b style="font-size:13px">Public</b>
              <span style="display:block; font-size:11px" class="muted">1980 × 1320 after crop · WebP · 168 KB</span></span>
              <span class="pill pill--ok"><i></i>Served</span></div>
            <div class="rend">${icon("image", 16)}<span><b style="font-size:13px">Thumbnail</b>
              <span style="display:block; font-size:11px" class="muted">640 × 427 · WebP · 34 KB · quality 75</span></span>
              <span class="pill pill--ok"><i></i>Served</span></div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Provenance</h2></div>
          <div style="padding:12px 16px; display:grid; gap:8px">
            <div class="kvline"><span>Source</span><span class="mono">makler-realty.com/obj/0114</span></div>
            <div class="kvline"><span>Mirrored</span><span class="muted">2 Aug 2026, 11:04</span></div>
            <div class="kvline"><span>Checksum</span><span class="mono">sha256:9c1f…a4e2</span></div>
            <div class="kvline"><span>EXIF, XMP, IPTC</span><span class="pill pill--ok"><i></i>Stripped</span></div>
            <div class="kvline"><span>GPS coordinates</span><span class="pill pill--ok"><i></i>Removed</span></div>
            <div class="kvline"><span>Edits</span><span class="muted">2 by Mariya</span></div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-hd"><h2>Where it appears</h2><span class="sub">3 surfaces</span></div>
          <div style="padding:12px 16px; display:grid; gap:8px; font-size:13px">
            <div style="display:flex; gap:8px">${icon("building", 15)}<span>Listing gallery, position 3 — five languages</span></div>
            <div style="display:flex; gap:8px">${icon("globe", 15)}<span>Katuntsi location page, featured strip</span></div>
            <div style="display:flex; gap:8px">${icon("mail", 15)}<span>Viewing invitation to Anna Weber, 28 Aug</span></div>
            <div class="note note--info">${icon("alert", 14)}<span>Removing it changes all three. The listing needs at least six photos to stay published.</span></div>
          </div>
        </section>
      </div>`;
fs.writeFileSync(W("MediaEditor.dc.html"), page({ active: "website", body: ED_BODY, extraCss: ED_CSS, height: 1240 }));

console.log("Media, MediaEditor");
