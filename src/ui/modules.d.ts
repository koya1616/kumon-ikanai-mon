// Wrangler の Text モジュールルール (wrangler.jsonc の rules) で
// .css / .client.js を文字列として import できるようにする型宣言
declare module "*.css" {
  const content: string;
  export default content;
}
declare module "*.client.js" {
  const content: string;
  export default content;
}
