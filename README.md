# Token Radar — pre-token protocols ranked by implied value

A radar of pre-token protocols ranked by what their token launch would be worth,
with a farm plan for each. Built for the make.fun token-radar-01 competition.

## How it works

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot
(`input/snapshot.json`), scores every pre-token protocol with the radar-2 model
in `lib/model.ts`, and writes the ranked board to `board.json` plus a static
dashboard (`dashboard/`) and `dossier.json`.

The radar-2 model prices a launch from observable figures: TVL times the
category's median market-cap/TVL ratio among live-token peers, adjusted for
7-day growth, age since first listing, and chain reach. The board covers all
40 watchlist protocols plus 186 early pre-token protocols below the floor —
226 rows in total.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

## License

MIT
