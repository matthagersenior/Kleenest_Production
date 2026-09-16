export const CREATOR_CAMPAIGN_CODE='kleenest-stl-creators-2026' as const;
export const KLEENEST_WEB_ORIGIN='https://kleenest.app' as const;

export type CreatorMission={
  creatorName:string;
  creatorHandle:string;
  creatorSlug:string;
  missionCode:string;
  trackingSlug:string;
  title:string;
  shortTitle:string;
  summary:string;
  steps:string[];
  primaryAction:string;
  target:number;
  xpReward:number;
  audience:string;
  cta:string;
};

export const CREATOR_MISSIONS:CreatorMission[]=[
  {
    creatorName:'Alexis Zotos',creatorHandle:'@alexiszotos',creatorSlug:'alexis-zotos',
    missionCode:'creator-alexis-family-outing',trackingSlug:'alexis-family-outing',
    title:'The Parent Panic Test',shortTitle:'Family Outing Challenge',
    summary:'Use Kleenest during a real family outing, find a family-appropriate restroom, confirm useful details, navigate there, and leave one legitimate freshness update.',
    steps:['Start a normal family outing around Forest Park, the Zoo, or another STL family destination.','When restroom planning becomes relevant, open Kleenest and compare nearby options.','Check family-relevant details such as changing table, accessibility, freshness, and distance.','Navigate to the selected stop and complete one legitimate verification or update.','Show the audience what changed because of the contribution.'],
    primaryAction:'verify_location',target:1,xpReward:175,audience:'consumer',
    cta:'Save Kleenest before your next family outing.'
  },
  {
    creatorName:'Steph Hampton',creatorHandle:'@explorestlparks',creatorSlug:'steph-hampton',
    missionCode:'creator-steph-park-scout',trackingSlug:'steph-park-scout',
    title:'STL Park Scout Challenge',shortTitle:'Park Scout Challenge',
    summary:'Visit three parks and improve the restroom information families need before leaving home.',
    steps:['Choose three STL-area parks that fit your normal content.','Open Kleenest at each park and inspect current restroom details.','Confirm or update one legitimate restroom fact at each stop.','Call out missing family or accessibility details when they matter.','Finish with a before/after recap of how the three park records improved.'],
    primaryAction:'verify_location',target:3,xpReward:350,audience:'consumer',
    cta:'Scout one park near you and make its information fresher.'
  },
  {
    creatorName:'Sara / Midwest Nomad Family',creatorHandle:'@midwestnomadfamily',creatorSlug:'sara-midwest-nomad',
    missionCode:'creator-sara-road-trip',trackingSlug:'sara-road-trip',
    title:'Road Trip Without Guessing',shortTitle:'Road Trip Challenge',
    summary:'Plan restroom stops on a real family road trip, use the plan on the road, and refresh the network after the stops.',
    steps:['Choose a real family drive already on your calendar.','Before departure, use Kleenest to identify at least two plausible restroom stops.','Show the route plan before you leave.','Use at least one planned stop when it naturally fits the trip.','Submit legitimate updates after the stop so the next traveler gets fresher information.'],
    primaryAction:'reverify_stale',target:2,xpReward:300,audience:'consumer',
    cta:'Plan your next road-trip stops in Kleenest.'
  },
  {
    creatorName:'Abbey / The Abbey Normal Blog',creatorHandle:'@theabbeynormalblog',creatorSlug:'abbey-normal',
    missionCode:'creator-abbey-neighborhood-scout',trackingSlug:'abbey-neighborhood-scout',
    title:'Neighborhood Bathroom Scout',shortTitle:'Neighborhood Scout',
    summary:'Choose one STL neighborhood and improve three places families actually use.',
    steps:['Pick one STL neighborhood you already explore with your family.','Choose three real destinations in that neighborhood.','Check each location in Kleenest and identify what is useful, stale, or missing.','Add or confirm legitimate evidence at each location.','End with a neighborhood map recap and invite followers to repeat the mission where they live.'],
    primaryAction:'helpful_contribution',target:3,xpReward:325,audience:'consumer',
    cta:'Update three places in your own neighborhood.'
  },
  {
    creatorName:'Mikayla Isabelle',creatorHandle:'@mikayla.isabelle',creatorSlug:'mikayla-isabelle',
    missionCode:'creator-mikayla-weekend-ready',trackingSlug:'mikayla-weekend-ready',
    title:'STL Night-Out Backup Plan',shortTitle:'Weekend Ready',
    summary:'Make restroom planning part of a real STL night-out checklist and test the plan during the outing.',
    steps:['Pick a real event, date night, festival, or evening out.','Before leaving, open Kleenest and compare restroom options near the destination.','Save or remember two backup options and show why each is useful.','During the outing, use Kleenest if a restroom stop becomes relevant.','Afterward, contribute one legitimate update if you learned something new.'],
    primaryAction:'discover_gps',target:2,xpReward:200,audience:'consumer',
    cta:'Before you go out, know two possible stops.'
  },
  {
    creatorName:'Braden Tewolde',creatorHandle:'@BradENSTL',creatorSlug:'braden-tewolde',
    missionCode:'creator-braden-kleenest-stop',trackingSlug:'braden-kleenest-stop',
    title:'The Kleenest Stop',shortTitle:'Local Business Spotlight',
    summary:'Feature a local business and show how restroom quality fits the customer experience without turning the piece into a cleanliness takedown.',
    steps:['Choose a local business that fits your normal food or STL coverage.','Show the business in Kleenest and explain what a customer can learn before visiting.','If appropriate, make one legitimate restroom evidence contribution.','With operator permission, briefly show or discuss the claim/manage-location value for businesses.','Close on the idea that restroom quality is part of the customer experience.'],
    primaryAction:'substantive_review',target:1,xpReward:225,audience:'consumer',
    cta:'Find a Kleenest Stop — and businesses can claim their location.'
  },
  {
    creatorName:'STL Bucket List',creatorHandle:'@stlbucketlist',creatorSlug:'stl-bucket-list',
    missionCode:'creator-stl-bucket-list-weekend-map',trackingSlug:'stl-bucket-list-weekend-map',
    title:'The Kleenest STL Weekend Map',shortTitle:'Weekend Map',
    summary:'Create an editorial-style event guide that makes Kleenest useful before people leave home.',
    steps:['Choose one high-traffic STL weekend, event, or district.','Build a short list of useful restroom options around the activity area.','Explain which details matter before visitors leave home.','Refresh at least three legitimate location details where possible.','Publish the guide as a reusable STL utility rather than a generic app promotion.'],
    primaryAction:'helpful_contribution',target:3,xpReward:350,audience:'consumer',
    cta:'Open the STL map before heading out this weekend.'
  },
  {
    creatorName:'Amy Funderburk',creatorHandle:'@amyfunderburk',creatorSlug:'amy-funderburk',
    missionCode:'creator-amy-real-stl-day',trackingSlug:'amy-real-stl-day',
    title:'One Real STL Day',shortTitle:'Real STL Day',
    summary:'Work Kleenest naturally into a normal STL day instead of building the entire day around the app.',
    steps:['Film a real day with errands, food, family activity, or local stops.','Introduce Kleenest only when restroom planning naturally becomes relevant.','Show one real product decision: nearby options, amenities, freshness, or directions.','Use the selected stop if it fits the day.','Leave one legitimate update and show that the network improves after normal use.'],
    primaryAction:'verify_location',target:1,xpReward:175,audience:'consumer',
    cta:'Keep Kleenest on your phone for the moment you actually need it.'
  },
  {
    creatorName:'Kelly Stumpe / The Car Mom',creatorHandle:'@the_car_mom',creatorSlug:'kelly-stumpe',
    missionCode:'creator-kelly-road-trip-prep',trackingSlug:'kelly-road-trip-prep',
    title:'Family Road-Trip Prep',shortTitle:'Road-Trip Prep',
    summary:'Add restroom planning to the same practical pre-drive checklist as fuel, snacks, chargers, and car-seat setup.',
    steps:['Use a real family drive or road-trip preparation segment.','Add restroom planning to the pre-drive checklist.','Use Kleenest to identify family-appropriate stops along the route.','Show at least one useful filter or detail that changes the stop decision.','After a stop, leave one legitimate update when possible.'],
    primaryAction:'discover_gps',target:2,xpReward:225,audience:'consumer',
    cta:'Add restroom planning to your road-trip checklist.'
  }
];

export function creatorMissionByTrackingSlug(slug:string){
  const normalized=String(slug||'').trim().toLowerCase();
  return CREATOR_MISSIONS.find(mission=>mission.trackingSlug===normalized)||null;
}

export function creatorMissionTrackingUrl(mission:CreatorMission,channel='social'){
  return `${KLEENEST_WEB_ORIGIN}/creator?m=${encodeURIComponent(mission.trackingSlug)}&channel=${encodeURIComponent(channel)}`;
}
