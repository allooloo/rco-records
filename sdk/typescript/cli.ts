// cli.ts — node cli.ts <id> [base]: fetch a receipt and the keyring from the door and verify it locally.
import { verify } from "./verify.ts";
const [id, base = "https://rco-records.ai"] = process.argv.slice(2);
const get = async (u: string) => (await fetch(u, { headers: { "user-agent": "rco-verify/1.0 (typescript)" } })).json();
const body = await get(`${base}/receipts/${id}`);
console.log(JSON.stringify(await verify(body.receipt, await get(`${base}/.well-known/jwks.json`)), null, 1));
