import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
try {await fs.writeFile('.env',`AGRIFLOW_DB_PASSWORD=${randomBytes(24).toString('hex')}\nAGRIFLOW_PORT=3000\n`,{flag:'wx',mode:0o600});console.log('.envを作成しました（既存ファイルは上書きしません）。');}
catch(e){if(e.code==='EEXIST')console.log('.envは既に存在します。変更していません。');else throw e;}
