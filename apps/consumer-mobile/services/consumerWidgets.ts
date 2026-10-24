// Web and platforms without a native widget provider do not publish widget data.
export async function publishConsumerWidgetSnapshot(_rows:unknown[]):Promise<void>{}

export async function chooseConsumerWidgetCurrentArea(_widgetId:number,_rows:unknown[]):Promise<void>{
  throw new Error('Android widget location settings are unavailable on this platform.');
}
export async function chooseConsumerWidgetNamedArea(_widgetId:number,_label:string,_rows:unknown[]):Promise<void>{
  throw new Error('Android widget location settings are unavailable on this platform.');
}
