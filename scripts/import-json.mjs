import fs from 'node:fs/promises';
import { PostgresRepository } from '../src/storage/postgres.js';
import { validateImport } from '../src/storage/import-validation.js';
const file=process.argv[2];
if(!file||!process.env.DATABASE_URL)throw new Error('Usage: DATABASE_URL=... npm run import:json -- /path/to/state.json');
const state=validateImport(JSON.parse(await fs.readFile(file,'utf8')));
const repository=new PostgresRepository(process.env.DATABASE_URL);
try {await repository.migrate();await repository.importState(state);console.log(JSON.stringify({imported:true,revision:state.revision,operations:state.operations.length,proposals:state.proposals.length,committed:state.committed.length,sourceUnchanged:true}));}finally{await repository.close();}
