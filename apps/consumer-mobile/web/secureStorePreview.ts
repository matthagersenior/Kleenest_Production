const prefix='kleenest.preview.secure.';
function storage(){return typeof window==='undefined'?null:window.localStorage}
export async function getItemAsync(key:string){return storage()?.getItem(prefix+key)??null}
export async function setItemAsync(key:string,value:string){storage()?.setItem(prefix+key,value)}
export async function deleteItemAsync(key:string){storage()?.removeItem(prefix+key)}
