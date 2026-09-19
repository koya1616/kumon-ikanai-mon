// Wrangler の Text モジュールルール (wrangler.jsonc の rules) で
// .css / .client.js を文字列として import できるようにする型宣言。
// .client.js は pnpm build:client の生成物 (dist/client/・git管理外)。
// ソースは src/client/*.tsx、ビルドは scripts/build-client.ts。
declare module "*.css" {
  const content: string;
  export default content;
}
declare module "*.client.js" {
  const content: string;
  export default content;
}
