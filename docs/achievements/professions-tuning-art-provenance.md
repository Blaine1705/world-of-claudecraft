# Professions tuning art provenance (2026-08-01)

This pass replaces the 13 temporary derived item icons introduced by the
professions tuning packet and supplies painted crests for the five deed records
added on the branch. All 18 paintings were created with OpenAI built-in image
generation from references already licensed for and shipped by World of
ClaudeCraft. Most references are project-owned or project-generated. Three
CraftPix Premium item icons were also supplied as licensed references:
`simple_fishing_pole` for the two rods, `grubjaw_tusk` for
`chr_marsh_rares_ii`, and `old_cragmaws_pelt` for `chr_peaks_rares_ii`. The
CraftPix source-pack lineage remains recorded in `public/ui/items/mapping.json`.
No unlicensed external or proprietary-game art was used.

The shipping item WebPs and their batch prompts are recorded in
`public/ui/items/mapping.json`. Item sources were generated as opaque square
paintings, inspected at 128px and 28px, then converted with
`npm run assets:items -- --quality 82`. The nine fine materials reference their
matching base material plus same-family peers. The two rods reference the
Simple, Ironreel and Silverstream rod paintings for composition. The two charms
reference the arcane reagent family and the project's physical talisman icons.

## Deed crest prompt contract

Shared direction for every crest:

- Complete, centered, hand-painted classic dark-fantasy MMORPG medallion.
- Blackened bronze or steel body, antique-gold double rim, exactly four small
  cardinal kite points, and a dark enamel inset.
- Badge occupies about 78 percent of the square with no text, ribbon, extra
  frame, crop, watermark, exterior shadow or exterior glow.
- A flat chroma exterior absent from the subject is removed locally, producing
  a reviewed 512x512 RGBA source. `npm run assets:deeds --
  tmp/imagegen/professions-deeds` creates the committed 128px WebP and
  regenerates `src/ui/deed_image_ids.ts`.

Per-crest subject direction and in-repository references:

- `chr_peaks_gatherer`: an equally readable triad of violet-banded Osmium ore,
  an amber-faced Highpine log and one five-petal Sunpetal bloom against icy
  Thornpeak stone. References: `chr_vale_gatherer`, `chr_marsh_gatherer`,
  `chr_peaks_rares`, `thorium_ore`, `elderwood_log`, and `sunpetal_herb`.
- `chr_marsh_rares_ii`: a painterly Grubjaw trophy portrait with a moss-green
  glutton head, blue-black crest, broad hungry maw and ivory tusks, with only
  restrained marsh reeds and mist. References: `chr_marsh_rares`, `grubjaw`,
  and `grubjaw_tusk`.
- `chr_peaks_rares_ii`: a balanced diagonal pairing of Old Cragmaw's scarred
  charcoal pelt and claw with Shardlord Kazzix's faceted ice-blue rime heart.
  References: `chr_peaks_rares`, `exp_peaks_wayfarer`, `old_cragmaw`,
  `old_cragmaws_pelt`, and `shardlord_kazzix`.
- `chr_gleamstag`: one serene pale lilac-silver stag bust turning back in a
  hidden violet grove, with enormous luminous antlers as the main silhouette.
  References: `chr_vale_packbreaker`, `chr_vale_rares`, and `gleamstag`.
- `chr_hollow_rares`: an equal paired emblem with Old Marrowshell's blue-violet
  crystalline shell and claw below Aurelhorn's golden stag head and antlers.
  References: `chr_vale_rares`, `chr_peaks_rares`, `old_marrowshell`, and
  `aurelhorn`. Its accepted source received a 16px downward canvas translation
  after generation so the shipping alpha bounds center exactly at 128px.

The five shipping crests are gate-pinned for transparent padding, alpha bounds,
center, coverage, dimensions, decoding, weight and byte uniqueness in
`tests/deed_icons.test.ts`. The item gate literal-pins all 13 replacements and
rejects the exact hashes of their retired placeholders.
