const prefix='kleenest.business.web.secure.';
const memory=new Map<string,string>();

function storage(){
  if(typeof window==='undefined')return null;
  try{return window.localStorage}catch{return null}
}

export async function getItemAsync(key:string){
  const store=storage();
  if(store){
    try{
      const value=store.getItem(prefix+key);
      if(value!==null)return value;
    }catch{}
  }
  return memory.get(prefix+key)??null;
}

export async function setItemAsync(key:string,value:string){
  memory.set(prefix+key,value);
  const store=storage();
  if(store){try{store.setItem(prefix+key,value)}catch{}}
}

export async function deleteItemAsync(key:string){
  memory.delete(prefix+key);
  const store=storage();
  if(store){try{store.removeItem(prefix+key)}catch{}}
}
