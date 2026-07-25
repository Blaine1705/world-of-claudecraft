const { Client } = require("pg");
const cs = process.argv[1];
(async () => {
  const c = new Client({ connectionString: cs });
  try {
    await c.connect();
    console.log('OK', cs);
    await c.end();
  } catch (e) { console.log('FAIL', cs, e.code || e.message); }
})();
