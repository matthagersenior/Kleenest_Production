export const AndroidImportance={DEFAULT:3};
export function setNotificationHandler(){return undefined}
export async function getLastNotificationResponseAsync(){return null}
export async function clearLastNotificationResponseAsync(){return undefined}
export function addNotificationResponseReceivedListener(){return{remove(){}}}
export async function setNotificationChannelAsync(){return null}
export async function getPermissionsAsync(){return{status:'denied'}}
export async function requestPermissionsAsync(){return{status:'denied'}}
export async function getExpoPushTokenAsync(){return{data:''}}
export type NotificationResponse=any;
