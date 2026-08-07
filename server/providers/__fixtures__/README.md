# Yahoo fixtures

`recorded/` was captured from the live API with `pnpm capture:fixtures` and is committed as is.
Recapture it only if the API shape changes; the figures inside it are whatever the market did on
the day of capture, and no test asserts a specific one.

`handmade/` is written by hand. Every exact numeric assertion in `../yahoo.test.ts` reads from
here, so those tests stay deterministic no matter when the recorded files were refreshed.

No test in this repository calls the network. A test that hits Yahoo goes red on a train with no
wifi, and that proves nothing about our code.
