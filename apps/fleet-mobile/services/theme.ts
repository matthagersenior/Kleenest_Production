import { useEffect,useState } from 'react';
import { useColorScheme } from 'react-native';
import { loadKleenestThemeMode,resolveKleenestTheme,subscribeKleenestTheme,type KleenestThemeMode } from '@kleenest/mobile-core';

export function useFleetTheme(){
  const systemScheme=useColorScheme();
  const[mode,setMode]=useState<KleenestThemeMode>('default');
  useEffect(()=>{let active=true;void loadKleenestThemeMode().then(next=>{if(active)setMode(next)});const unsubscribe=subscribeKleenestTheme(next=>{if(active)setMode(next)});return()=>{active=false;unsubscribe()}},[]);
  return resolveKleenestTheme(mode,systemScheme==='dark','fleet');
}
