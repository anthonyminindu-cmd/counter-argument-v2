// Read a trusted editorial export on stdin. Apply the emitted SQL as an editorial
// administrator. Existing notes are preserved so a retry cannot undo later edits.
import {readFileSync} from 'node:fs';

const source = JSON.parse(readFileSync(0, 'utf8'));
const rows = Object.entries(source).map(([id, profile]) => {
  const {style, politics, discussion, interests} = profile;
  if (!/^person-\d{3}$/.test(id) || !style || !politics?.id || !discussion?.voice || !Array.isArray(interests)) {
    throw Error('Incomplete debate notes for ' + id);
  }
  return {id, notes: {style, politics, discussion, interests}};
});
if (!rows.length) throw Error('Expected at least one bot profile.');
const data = JSON.stringify(rows).replaceAll("'", "''");
process.stdout.write(`with source as (
  select * from jsonb_to_recordset('${data}'::jsonb) as s(id text, notes jsonb)
), saved as (
  update dk_editorial.bot_accounts b set debate_profile=s.notes
  from source s where b.id=s.id and b.debate_profile is null returning b.id
)
select (select count(*) from source) as supplied, count(*) as populated from saved;
`);
