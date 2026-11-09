import { startFakeMuse } from "./fake-muse.mjs"
const fake = await startFakeMuse({ port: Number(process.env.FAKE_MUSE_PORT || 18777) })
console.log(fake.site)
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, async () => { await fake.close(); process.exit(0) })
