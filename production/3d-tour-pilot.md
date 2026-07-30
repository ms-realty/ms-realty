# Phone-video 3D-tour pilot

This is a private processing and reviewed-publication path, not a public upload feature.
The browser accepts only a reviewed HTTPS static viewer URL after a broker/editor has checked
the result. It never receives the original phone video.

## Operating path

1. Capture one slow, continuous walkthrough with no people, personal documents, mirrors showing
   staff, or unrelated rooms. Do not promise measured dimensions from the reconstruction.
2. Process the authorized source in an isolated GPU environment with
   [Vid2scene](https://github.com/samuelm2/vid2scene). It is an Apache-2.0, self-hostable
   phone-video-to-Gaussian-splat pipeline, but its worker requires Linux/Windows with an NVIDIA
   GPU; this macOS workstation is not a video-processing worker.
3. Inspect, crop, and optimize the result in
   [SuperSplat](https://github.com/playcanvas/supersplat), then use its Viewer App / HTML export.
   Publish the generated static viewer and splat assets on the approved MS Realty HTTPS origin,
   under a listing-specific path such as /tours/LISTING-ID/.
4. In the authenticated listing editor, select Supersplat Viewer, provide the HTTPS viewer URL,
   write the accessible description, review the existing fallback gallery, and explicitly confirm
   the human review. The append-only tour approval ledger is the publish boundary.
5. Check the link on desktop and phone. Confirm that the accessible caption and ordinary photo
   gallery remain useful if the viewer does not load or WebGL is unavailable.

## Guardrails

- Keep raw walkthroughs, GPU job metadata, and intermediate assets private and outside this repository.
- Do not add a public video-upload or GPU-job endpoint without a separate privacy, retention,
  abuse-control, and capacity design.
- Use only HTTPS viewer URLs. The reviewer should publish to the approved MS Realty origin;
  the application opens the viewer with an isolated new-tab link.
- Treat the splat as visual media, not a survey: no claims about exact measurements, boundaries,
  condition, or legal status without the normal broker verification evidence.
