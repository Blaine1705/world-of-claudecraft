# Selected production parses, high equipped item level

Item level is derived from current canonical definitions; partial averages are marked *. Full snapshots, exclusions and limitations are in selected-parse-summary.json.

| Boss | Difficulty | Build | Fight | Players | Known mean ilvl | Sampled boss HP | Kill seconds | Boss damage to players | Highest recipient DTPS |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| Morthen the Gravecaller | normal | 0.44.5 | [152689](https://parses.worldofclaudecraft.com/#/fight/152689) | 1 | 30.83 | 1191 | 4.7 | 72 | 15.32 |
| Ysolei, Avatar of the Drowned Moon | normal | 0.44.5 | [152941](https://parses.worldofclaudecraft.com/#/fight/152941) | 1 | 30.58 | 2176 | 7.95 | 74 | 9.31 |
| Vael the Fogbinder | normal | 0.44.5 | [152950](https://parses.worldofclaudecraft.com/#/fight/152950) | 1 | 28.36 | 1490 | 27 | 434 | 16.07 |
| Korzul the Gravewyrm | normal | 0.44.4 | [151963](https://parses.worldofclaudecraft.com/#/fight/151963) | 3 | 32.08 | 6127 | 12.25 | 1003 | 55.51 |
| Zulgar, Voice of the Basin | normal | 0.44.4 | [150161](https://parses.worldofclaudecraft.com/#/fight/150161) | 1 | 31.23 | 6882 | 39.15 | 2653 | 67.77 |
| Morthen the Gravecaller | heroic | 0.44.5 | [152244](https://parses.worldofclaudecraft.com/#/fight/152244) | 5 | 30.03* | 7883 | 11.95 | 3671 | 205.36 |
| Ysolei, Avatar of the Drowned Moon | heroic | 0.44.5 | [152234](https://parses.worldofclaudecraft.com/#/fight/152234) | 5 | 29.98* | 13132 | 20.35 | 6244 | 216.41 |
| Vael the Fogbinder | heroic | 0.44.5 | [152240](https://parses.worldofclaudecraft.com/#/fight/152240) | 5 | 29.98* | 8777 | 16.1 | 4372 | 143.73 |
| Korzul the Gravewyrm | heroic | 0.44.5 | [152230](https://parses.worldofclaudecraft.com/#/fight/152230) | 5 | 29.98* | 13138 | 24.3 | 6828 | 133.54 |
| Zulgar, Voice of the Basin | heroic | 0.44.5 | [152217](https://parses.worldofclaudecraft.com/#/fight/152217) | 5 | 29.98* | 14757 | 30.1 | 13739 | 255.38 |
| Ysolei, Avatar of the Drowned Moon | heroic | 0.44.4 | [152107](https://parses.worldofclaudecraft.com/#/fight/152107) | 5 | 32* | 13132 | 11.9 | 2705 | 127.48 |
| Korzul the Gravewyrm | normal | 0.44.5 | [152632](https://parses.worldofclaudecraft.com/#/fight/152632) | 1 | 30.83 | 6127 | 70.4 | 0 | 0 |
| Zulgar, Voice of the Basin | heroic | 0.44.5 | [152609](https://parses.worldofclaudecraft.com/#/fight/152609) | 1 | 29.69 | 14757 | 204.25 | 0 | 0 |

## Limitations

- Fifteen nominated fights were fetched by recency, difficulty and group size, before computing gear levels. High gear is characterized here by mean known occupied item levels of at least 28; this is a sampling label, not a game balance threshold.
- Average character item level uses all occupied items for which the canonical itemLevel returns a number. Non-tiered starter/cosmetic items and empty slots do not enter the denominator. Unknown item IDs are listed, never inferred. No instance payload is present in participant snapshots, so earned Perfected or dynamic item tiers cannot be reconstructed.
- Party average gives each character equal weight. Missing vanguard focus jewelry makes affected averages partial. The catalog is current local definitions, not a time-versioned production export.
- Boss HP comes from resources maxHp samples. Raw damage source is restricted to that boss with direction=done, source=bossId and pivot=target; the summary keeps only participant entity IDs, excluding pets, trash and adds as sources.
- Observed hit means are post mitigation and absorption. Means including absorbed still retain armor/resistance/stance effects. Never compare these values directly against authored raw damage without fixing the defender.
- Duration is fight duration, not participant active_ms; damage totals can include overkill. These are selected recent examples, not population percentiles or a median estimate.
- Current local rework includes bosses absent from production final-boss parse lists, such as Olen. A direct boss-for-boss production comparison is unavailable for those bosses.
