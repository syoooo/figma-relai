// Markdown files are inlined as text at build time (tsup loader)
declare module "*.md" {
  const content: string;
  export default content;
}
