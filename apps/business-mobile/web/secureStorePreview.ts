const prefix='kleenest.business.web.secure.';
const memory=new Map<string,string>();

function storage(){
  if(typeof window==='undefined')return null;
  try{return window.localStorage}catch{return null}
}

export async function getItemAsync(key:string){
  const namespaced=prefix+key;
  const target=storage();
  if(target){
    try{
      const value=target.getItem(namespaced);
      if(value!==null)return value;
    }catch{}
  }
  return memory.get(namespaced)??null;
}

export async function setItemAsync(key:string,value:string){
  const namespaced=prefix+key;
  memory.set(namespaced,value);
  const target=storage();
  if(target){
    try{target.setItem(namespaced,value)}catch{}
  }
}

export async function deleteItemAsync(key:string){
  const namespaced=prefix+key;
  memory.delete(namespaced);
  const target=storage();
  if(target){
    try{target.removeItem(namespaced)}catch{}
  }
}
