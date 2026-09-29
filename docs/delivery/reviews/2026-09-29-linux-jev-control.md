# Linux WebKit native select correction

CI `36602187769` on `857ae11d` failed two 320px Jev review tests in Linux WebKit, with and without
JavaScript. Mac browser checks had passed. Reproduction in the pinned Linux Playwright image
showed the Russian decision label expanding document scroll width to 324px despite a 320px
viewport. The select's box itself remained within the viewport; its native painting overflowed
the grid label. Limiting the box width did not fix it.

One-variable probes confirmed that a block label, native appearance removal, shortened text or
padding removal each removed the overflow. The selected fix uses block layout for the two AI
select labels, preserving the complete text, native control appearance and ordinary padding.
No page overflow is clipped and no assertion tolerance was relaxed. Debug probes were removed;
the existing browser test retains useful bounded layout diagnostics on failure.

`jev-linux-fixed.log` records a fresh Linux build and both original failing tests passing, including
BG/RU/EN, actual logo loading, visible uncertainty and human review. Earlier failed repro/probe
logs remain in `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`.

The same CI run exposed an unrelated flaky no-JavaScript discovery test reading `page.url()`
before its submitted form finished navigating. It now waits for the expected properties route
before checking every exact selected filter. This changes synchronization, not the expected
product result. No model/provider call was made for these checks.
