import fs from 'node:fs';

const path='apps/consumer-mobile/app/location/[id].tsx';
let source=fs.readFileSync(path,'utf8');
const replaceOnce=(before,after,label)=>{
  if(source.includes(after))return;
  if(!source.includes(before))throw new Error(`Consumer review score patch drift: ${label}`);
  source=source.replace(before,after);
};

replaceOnce(
  "type AmenityDraft={selected:boolean;quantity:string;sentiment:'good'|'needs_attention'};",
  "type AmenityDraft={selected:boolean;quantity:string;sentiment:'good'|'needs_attention'};\nconst RATING_CHOICES=[{score:1,label:'Poor'},{score:2,label:'Fair'},{score:3,label:'Good'},{score:4,label:'Very good'},{score:5,label:'Excellent'}] as const;",
  'rating choices'
);

replaceOnce(
  "[stars,setStars]=useState('5'),[cleanliness,setCleanliness]=useState('')",
  "[stars,setStars]=useState(''),[cleanliness,setCleanliness]=useState('')",
  'unbiased rating initial state'
);

replaceOnce(
  "setDraftHydrated(false);setStars('5');setCleanliness('');",
  "setDraftHydrated(false);setStars('');setCleanliness('');",
  'unbiased rating reset state'
);

replaceOnce(
  "  const missionSteps=missionMatches?(activeMission?.goal.steps||activeMission?.steps||[]):[];",
  "  const missionSteps=missionMatches?(activeMission?.goal.steps||activeMission?.steps||[]):[];\n  const cleanlinessNumber=Number(cleanliness);\n  const reviewScoresValid=/^[1-5]$/.test(stars)&&/^\\d{1,3}$/.test(cleanliness)&&cleanlinessNumber>=0&&cleanlinessNumber<=100;",
  'required score validity'
);

replaceOnce(
  "  function updateAmenity(id:string,patch:Partial<AmenityDraft>){setAmenityDraft(current=>({...current,[id]:{selected:current[id]?.selected||false,quantity:current[id]?.quantity||'',sentiment:current[id]?.sentiment||'good',...patch}}));}\n  async function navigate()",
  "  function updateAmenity(id:string,patch:Partial<AmenityDraft>){setAmenityDraft(current=>({...current,[id]:{selected:current[id]?.selected||false,quantity:current[id]?.quantity||'',sentiment:current[id]?.sentiment||'good',...patch}}));}\n  function updateCleanliness(value:string){const digits=value.replace(/[^0-9]/g,'').slice(0,3);if(digits===''||Number(digits)<=100)setCleanliness(digits);}\n  async function navigate()",
  'bounded cleanliness input'
);

replaceOnce(
  "  async function submit(){if(submitting||!checkInId)return;setSubmitting(true);try{const starValue=Number(stars),cleanValue=cleanliness===''?null:Number(cleanliness);if(!Number.isInteger(starValue)||starValue<1||starValue>5)throw new Error('Stars must be a whole number from 1 to 5.');if(cleanValue!=null&&(!Number.isFinite(cleanValue)||cleanValue<0||cleanValue>100))throw new Error('Cleanliness must be from 0 to 100.');",
  "  async function submit(){if(submitting||!checkInId||!reviewScoresValid)return;setSubmitting(true);try{const starValue=Number(stars),cleanValue=Number(cleanliness);if(!Number.isInteger(starValue)||starValue<1||starValue>5)throw new Error('Choose a rating from 1 to 5.');if(!Number.isInteger(cleanValue)||cleanValue<0||cleanValue>100)throw new Error('Cleanliness is required and must be a whole number from 0 to 100.');",
  'required bounded submit validation'
);

const oldInputs=`      <View style={s.inputGroup}><View style={s.fieldPair}><View style={s.field}><Text style={s.fieldLabel}>RATING</Text><TextInput style={s.input} value={stars} onChangeText={setStars} keyboardType="number-pad" placeholder="1–5 stars"/></View><View style={s.field}><Text style={s.fieldLabel}>CLEANLINESS</Text><TextInput style={s.input} value={cleanliness} onChangeText={setCleanliness} keyboardType="number-pad" placeholder="0–100%"/></View></View><Text style={s.fieldLabel}>WHAT SHOULD THE NEXT PERSON KNOW?</Text><TextInput style={[s.input,s.textarea]} value={comment} onChangeText={setComment} multiline placeholder="Cleanliness, privacy, access, wait, supplies, anything useful…"/></View>`;
const newInputs=`      <View style={s.inputGroup}><View style={s.ratingGuide}><Text style={s.fieldLabel}>RATING · REQUIRED</Text><Text style={s.helperText}>Choose one. 1 = poor · 3 = good · 5 = excellent.</Text><View style={s.ratingChoices}>{RATING_CHOICES.map(choice=>{const selected=stars===String(choice.score);return <Pressable key={choice.score} accessibilityRole="button" accessibilityState={{selected}} accessibilityLabel={\`\${choice.score} stars, \${choice.label}\`} style={[s.ratingChoice,selected&&s.ratingChoiceSelected]} onPress={()=>setStars(String(choice.score))}><Text style={[s.ratingChoiceScore,selected&&s.ratingChoiceTextSelected]}>{choice.score} ★</Text><Text style={[s.ratingChoiceLabel,selected&&s.ratingChoiceTextSelected]}>{choice.label}</Text></Pressable>})}</View></View><View style={s.field}><Text style={s.fieldLabel}>CLEANLINESS · REQUIRED</Text><Text style={s.helperText}>Enter a whole number from 0–100. 0 = very dirty or unusable · 50 = average · 100 = spotless.</Text><TextInput accessibilityLabel="Cleanliness score from 0 to 100" style={s.input} value={cleanliness} onChangeText={updateCleanliness} keyboardType="number-pad" inputMode="numeric" maxLength={3} placeholder="0–100"/></View><Text style={s.fieldLabel}>WHAT SHOULD THE NEXT PERSON KNOW? · OPTIONAL</Text><TextInput style={[s.input,s.textarea]} value={comment} onChangeText={setComment} multiline placeholder="Cleanliness, privacy, access, wait, supplies, anything useful…"/></View>`;
replaceOnce(oldInputs,newInputs,'review scoring guidance UI');

replaceOnce(
  "<Pressable style={[s.submitAction,(submitting||!checkInId||missionCompleted)&&s.disabled]} disabled={submitting||!checkInId||missionCompleted} onPress={submit}><Text style={s.submitKicker}>{missionMatches?'TRUST + PROGRESS':'CONTRIBUTE'}</Text><Text style={s.submitText}>{submitting?'Saving your contribution…':missionCompleted?'Mission completed ✓':checkInId?missionMatches?'Complete trust mission →':'Publish verified review →':'Check in to continue'}</Text></Pressable>",
  "<Pressable style={[s.submitAction,(submitting||!checkInId||missionCompleted||!reviewScoresValid)&&s.disabled]} disabled={submitting||!checkInId||missionCompleted||!reviewScoresValid} onPress={submit}><Text style={s.submitKicker}>{missionMatches?'TRUST + PROGRESS':'CONTRIBUTE'}</Text><Text style={s.submitText}>{submitting?'Saving your contribution…':missionCompleted?'Mission completed ✓':!checkInId?'Check in to continue':!reviewScoresValid?'Choose rating + cleanliness to continue':missionMatches?'Complete trust mission →':'Publish verified review →'}</Text></Pressable>",
  'submission readiness state'
);

replaceOnce(
  "fieldLabel:{fontSize:8,fontWeight:'900',letterSpacing:1,color:'#5a7163'},input:{backgroundColor:'#f9fbfa'",
  "fieldLabel:{fontSize:8,fontWeight:'900',letterSpacing:1,color:'#5a7163'},ratingGuide:{gap:7},helperText:{fontSize:11,lineHeight:16,color:'#65756b',fontWeight:'700'},ratingChoices:{flexDirection:'row',gap:6,flexWrap:'wrap'},ratingChoice:{minWidth:56,flexGrow:1,backgroundColor:'#f3f7f4',borderWidth:1,borderColor:'#ccd9d1',borderRadius:12,paddingVertical:9,paddingHorizontal:8,alignItems:'center',gap:2},ratingChoiceSelected:{backgroundColor:palette.green,borderColor:palette.green},ratingChoiceScore:{fontSize:13,fontWeight:'900',color:palette.ink},ratingChoiceLabel:{fontSize:8,fontWeight:'800',color:'#65756b'},ratingChoiceTextSelected:{color:'#fff'},input:{backgroundColor:'#f9fbfa'",
  'rating control styles'
);

if(/onChangeText=\{setStars\}/.test(source))throw new Error('Free-form rating input still present.');
if(!source.includes('maxLength={3}')||!source.includes('reviewScoresValid'))throw new Error('Bounded review score contract not installed.');
fs.writeFileSync(path,source);
console.log('Consumer review score guidance applied.');
