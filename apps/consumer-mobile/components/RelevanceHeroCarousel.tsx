import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HeroCard } from './ConsumerUI';
import { useConsumerTheme } from '../services/theme';
import type { OrganicHeroItem } from '../services/heroRelevance';

export function RelevanceHeroCarousel({items,onOpen,dotIndicators=true,swipeEnabled=true}:{items:OrganicHeroItem[];onOpen:(route:string)=>void;dotIndicators?:boolean;swipeEnabled?:boolean}){
  const theme=useConsumerTheme();
  const[width,setWidth]=useState(0);
  const[index,setIndex]=useState(0);
  if(!items.length)return null;
  const updateIndex=(x:number)=>{if(width>0)setIndex(Math.max(0,Math.min(items.length-1,Math.round(x/width))))};
  return <View onLayout={event=>setWidth(Math.round(event.nativeEvent.layout.width))} style={s.wrap}>
    <ScrollView
      horizontal
      pagingEnabled={swipeEnabled}
      scrollEnabled={swipeEnabled&&items.length>1}
      showsHorizontalScrollIndicator={false}
      onMomentumScrollEnd={event=>updateIndex(event.nativeEvent.contentOffset.x)}
      scrollEventThrottle={16}
    >
      {items.map(item=><View key={item.id} style={{width:width||1,paddingRight:width?0:undefined}}>
        <HeroCard eyebrow={item.eyebrow} title={item.title} body={item.body}>
          {item.meta?<Text style={[s.meta,{color:theme.resolved==='dark'?theme.muted:'#d5e7dc'}]}>{item.meta}</Text>:null}
          <Pressable accessibilityRole="button" accessibilityLabel={item.cta} style={[s.cta,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={()=>onOpen(item.route)}>
            <Text style={[s.ctaText,{color:theme.accent}]}>{item.cta} →</Text>
          </Pressable>
        </HeroCard>
      </View>)}
    </ScrollView>
    {dotIndicators&&items.length>1?<View accessibilityLabel={`Hero ${index+1} of ${items.length}`} style={s.dots}>
      {items.map((item,i)=><View key={item.id} style={[s.dot,{backgroundColor:i===index?theme.accent:theme.line},i===index&&s.dotActive]}/>)}
    </View>:null}
  </View>;
}
const s=StyleSheet.create({
  wrap:{gap:8,overflow:'hidden'},
  meta:{fontSize:10,fontWeight:'900',letterSpacing:.4},
  cta:{alignSelf:'flex-start',paddingHorizontal:13,paddingVertical:10,borderRadius:12,borderWidth:1,marginTop:3},
  ctaText:{fontSize:11,fontWeight:'900'},
  dots:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,minHeight:12},
  dot:{width:6,height:6,borderRadius:3},
  dotActive:{width:18},
});
