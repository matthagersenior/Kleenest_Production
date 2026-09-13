const defined=new Set<string>();
export function isTaskDefined(name:string){return defined.has(name)}
export function defineTask(name:string,_handler:unknown){defined.add(name)}
export async function isTaskRegisteredAsync(){return false}
export async function getRegisteredTasksAsync(){return[]}
