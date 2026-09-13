export const AndroidImportance={DEFAULT:3,HIGH:4};
export function setNotificationHandler(){return undefined}
export async function getLastNotificationResponseAsync(){return null}
export async function clearLastNotificationResponseAsync(){return undefined}
export function addNotificationResponseReceivedListener(){return{remove(){}}}
export async function setNotificationChannelAsync(){return null}
export async function getPermissionsAsync(){return{status:'denied',canAskAgain:false}}
export async function requestPermissionsAsync(){return{status:'denied',canAskAgain:false}}
export async function getExpoPushTokenAsync(){return{data:''}}
export type NotificationResponse=any;
