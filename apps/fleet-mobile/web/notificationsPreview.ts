export const AndroidImportance={DEFAULT:3,HIGH:4};
export function setNotificationHandler(){return undefined}
export async function getLastNotificationResponseAsync(){return null}
export async function clearLastNotificationResponseAsync(){return undefined}
export function addNotificationResponseReceivedListener(){return{remove(){}}}
export async function setNotificationChannelAsync(){return null}
function webPermission(){if(typeof window==='undefined'||!('Notification'in window))return{status:'denied',canAskAgain:false};const value=window.Notification.permission;return{status:value==='granted'?'granted':value==='denied'?'denied':'undetermined',canAskAgain:value==='default'};}
export async function getPermissionsAsync(){return webPermission()}
export async function requestPermissionsAsync(){if(typeof window==='undefined'||!('Notification'in window))return{status:'denied',canAskAgain:false};await window.Notification.requestPermission();return webPermission()}
export async function getExpoPushTokenAsync(){return{data:''}}
export type NotificationResponse=any;
