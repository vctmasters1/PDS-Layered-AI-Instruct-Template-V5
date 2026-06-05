const { Client } = require('pg');
const c = new Client({ host:'localhost', port:5432, user:'pds', password:'pds_dev_password', database:'pds_marketplace' });
c.connect()
  .then(() => c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='devices' AND column_name LIKE '%[Oo]ta%' OR (table_name='devices' AND column_name LIKE '%pending%') ORDER BY column_name"
  ))
  .then(r => { console.log(JSON.stringify(r.rows)); return c.end(); })
  .catch(e => { console.error(e.message); c.end(); });
