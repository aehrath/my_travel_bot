export function safeConfirmationLink(value:string):string|null {
 try {
  const url=new URL(value);
  return ["https:","http:","mailto:"].includes(url.protocol)?url.href:null;
 } catch { return null; }
}
