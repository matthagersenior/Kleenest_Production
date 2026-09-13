import { router } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
const brand = {
  forest: '#123E2A',
  forestDark: '#0A291C',
  evergreen: '#1D5A3D',
  mint: '#DFF0E6',
  mintSoft: '#EEF7F1',
  cream: '#F8F5EE',
  paper: '#FFFDF8',
  ink: '#11251A',
  muted: '#617066',
  line: '#D8E3DB',
  gold: '#D9B86B',
  alert: '#F2E3B7',
};

const webShadow = Platform.OS === 'web'
  ? ({ boxShadow: '0 22px 60px rgba(15, 52, 34, 0.14)' } as any)
  : {
      shadowColor: '#0f3422',
      shadowOpacity: 0.12,
      shadowOffset: { width: 0, height: 18 },
      shadowRadius: 30,
      elevation: 8,
    };

const go = (route: string) => () => router.push(route as any);

function useMarketingMeta(title: string, description: string) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc = (globalThis as any).document;
    if (!doc) return;
    doc.title = title;
    let meta = doc.querySelector?.('meta[name="description"]');
    if (!meta) {
      meta = doc.createElement?.('meta');
      if (meta) {
        meta.setAttribute('name', 'description');
        doc.head?.appendChild(meta);
      }
    }
    meta?.setAttribute('content', description);
  }, [description, title]);
}

function LogoLockup({ light = false }: { light?: boolean }) {
  return (
    <Pressable onPress={go('/')} accessibilityRole="button" accessibilityLabel="Kleenest home" style={s.logoLockup}>
      <View style={[s.logoMark, light && s.logoMarkLight]}>
        <Text style={[s.logoMarkText, light && s.logoMarkTextLight]}>K</Text>
      </View>
      <View>
        <Text style={[s.logoText, light && s.logoTextLight]}>KLEENEST</Text>
        <Text style={[s.logoTag, light && s.logoTagLight]}>Know before you go.</Text>
      </View>
    </Pressable>
  );
}

function Header() {
  const { width } = useWindowDimensions();
  const compact = width < 900;
  return (
    <>
      <View style={s.utilityBar}>
        <Text style={s.utilityText}>RESTROOM DISCOVERY · FRESH EVIDENCE · REAL-WORLD TRUST</Text>
        {!compact && <Text style={s.utilityNote}>Built for everyday life, travel, families and businesses.</Text>}
      </View>
      <View style={[s.header, Platform.OS === 'web' ? ({ position: 'sticky', top: 0, zIndex: 40 } as any) : null]}>
        <LogoLockup />
        <View style={s.headerActions}>
          {!compact && (
            <>
              <Pressable onPress={go('/for-you')}><Text style={s.navText}>For You</Text></Pressable>
              <Pressable onPress={go('/for-business')}><Text style={s.navText}>For Business</Text></Pressable>
              <Pressable onPress={go('/trust')}><Text style={s.navText}>Trust</Text></Pressable>
            </>
          )}
          <Pressable style={s.openButton} onPress={go('/?app=1')}>
            <Text style={s.openButtonText}>Open App</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Install Kleenest now" style={s.installButton} onPress={go('/install')}>
            <Text style={s.installButtonText}>Install Now</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Header />
        {children}
        <Footer />
      </ScrollView>
    </SafeAreaView>
  );
}

function Footer() {
  return (
    <View style={s.footer}>
      <View style={s.footerMain}>
        <LogoLockup light />
        <Text style={s.footerStatement}>A clearer way to find, verify and improve the restroom experience.</Text>
      </View>
      <View style={s.footerLinks}>
        <Pressable onPress={go('/for-you')}><Text style={s.footerLink}>For You</Text></Pressable>
        <Pressable onPress={go('/for-business')}><Text style={s.footerLink}>For Business</Text></Pressable>
        <Pressable onPress={go('/trust')}><Text style={s.footerLink}>Trust + Freshness</Text></Pressable>
        <Pressable onPress={go('/install')}><Text style={s.footerLink}>Install</Text></Pressable>
        <Pressable onPress={go('/support')}><Text style={s.footerLink}>Support</Text></Pressable>
      </View>
      <Text style={s.footerFine}>Kleenest helps people make better restroom decisions with community evidence that can be refreshed over time.</Text>
    </View>
  );
}

function Eyebrow({ children, light = false }: { children: string; light?: boolean }) {
  return <Text style={[s.eyebrow, light && s.eyebrowLight]}>{children}</Text>;
}

function TrustChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.trustChip}>
      <Text style={s.trustChipValue}>{value}</Text>
      <Text style={s.trustChipLabel}>{label}</Text>
    </View>
  );
}

function LiveAppPreview() {
  const items = [
    {
      name: 'Riverfront Market',
      meta: '0.3 mi · Open now',
      score: '4.8',
      evidence: 'Verified 9 min ago',
      details: 'Accessible · changing table · stocked',
      best: true,
    },
    {
      name: 'Central Library',
      meta: '0.6 mi · Free access',
      score: '4.7',
      evidence: 'Verified 24 min ago',
      details: 'Family restroom · low traffic',
      best: false,
    },
    {
      name: 'Coffee House',
      meta: '0.8 mi · Customer access',
      score: '4.5',
      evidence: 'Verified 1 hr ago',
      details: 'Clean · stocked · accessible stall',
      best: false,
    },
  ];

  return (
    <View style={[s.device, webShadow]}>
      <View style={s.deviceTop}>
        <Text style={s.deviceBrand}>KLEENEST</Text>
        <View style={s.livePill}><View style={s.liveDot} /><Text style={s.livePillText}>LIVE</Text></View>
      </View>
      <Text style={s.deviceKicker}>EXPLORE</Text>
      <Text style={s.deviceTitle}>Find a bathroom you can trust.</Text>
      <View style={s.searchField}>
        <Text style={s.searchLabel}>SEARCH ANY ADDRESS</Text>
        <Text style={s.searchValue}>Downtown, school, work, hotel...</Text>
      </View>
      <View style={s.deviceFilterRow}>
        <Text style={s.filterPillActive}>CLEANEST</Text>
        <Text style={s.filterPill}>NEAREST</Text>
        <Text style={s.filterPill}>ACCESSIBLE</Text>
      </View>
      <View style={s.placeStack}>
        {items.map((item) => (
          <View key={item.name} style={[s.placeCard, item.best && s.placeCardBest]}>
            <View style={s.scoreBadge}><Text style={s.scoreNumber}>{item.score}</Text><Text style={s.scoreStar}>★</Text></View>
            <View style={s.placeCopy}>
              <View style={s.placeTitleRow}>
                <Text style={s.placeName}>{item.name}</Text>
                {item.best && <Text style={s.bestBadge}>BEST MATCH</Text>}
              </View>
              <Text style={s.placeMeta}>{item.meta}</Text>
              <Text style={s.placeEvidence}>● {item.evidence}</Text>
              <Text style={s.placeDetails}>{item.details}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={s.deviceActions}>
        <View style={s.navAction}><Text style={s.navActionText}>START NAVIGATION</Text></View>
        <View style={s.routeAction}><Text style={s.routeActionText}>ADD TO ROUTE</Text></View>
      </View>
    </View>
  );
}

function MetricCard({ value, label, body }: { value: string; label: string; body: string }) {
  return (
    <View style={s.metricCard}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricBody}>{body}</Text>
    </View>
  );
}

function IconCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <View style={s.iconCard}>
      <View style={s.iconCircle}><Text style={s.iconText}>{icon}</Text></View>
      <Text style={s.iconCardTitle}>{title}</Text>
      <Text style={s.iconCardBody}>{body}</Text>
    </View>
  );
}

function ScenarioCard({
  label,
  headline,
  place,
  detail,
}: {
  label: string;
  headline: string;
  place: string;
  detail: string;
}) {
  return (
    <View style={s.scenarioCard}>
      <Text style={s.scenarioLabel}>{label}</Text>
      <Text style={s.scenarioHeadline}>{headline}</Text>
      <View style={s.scenarioPlaceCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.scenarioPlace}>{place}</Text>
          <Text style={s.scenarioDetail}>{detail}</Text>
        </View>
        <Text style={s.scenarioArrow}>→</Text>
      </View>
    </View>
  );
}

function PurposeHero({
  eyebrow,
  title,
  body,
  primary = 'INSTALL KLEENEST',
  secondary = 'OPEN THE APP',
}: {
  eyebrow: string;
  title: string;
  body: string;
  primary?: string;
  secondary?: string;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  return (
    <View style={[s.detailHero, wide && s.detailHeroWide]}>
      <View style={s.detailHeroCopy}>
        <Eyebrow light>{eyebrow}</Eyebrow>
        <Text style={s.detailHeroTitle}>{title}</Text>
        <Text style={s.detailHeroBody}>{body}</Text>
        <View style={s.heroButtonRow}>
          <Pressable style={s.heroButtonLight} onPress={go('/install')}><Text style={s.heroButtonLightText}>{primary}</Text></Pressable>
          <Pressable style={s.heroButtonOutline} onPress={go('/?app=1')}><Text style={s.heroButtonOutlineText}>{secondary}</Text></Pressable>
        </View>
      </View>
      <View style={s.detailHeroBadge}>
        <Text style={s.detailHeroBadgeKicker}>KLEENEST PRINCIPLE</Text>
        <Text style={s.detailHeroBadgeTitle}>Useful first.</Text>
        <Text style={s.detailHeroBadgeBody}>Every feature should make the restroom decision clearer, the evidence fresher or the experience better.</Text>
      </View>
    </View>
  );
}

function GroupCard({ number, title, body, items }: { number: string; title: string; body: string; items: string[] }) {
  return (
    <View style={s.groupCard}>
      <Text style={s.groupNumber}>{number}</Text>
      <Text style={s.groupTitle}>{title}</Text>
      <Text style={s.groupBody}>{body}</Text>
      <View style={s.groupList}>
        {items.map((item) => (
          <View style={s.groupListItem} key={item}>
            <Text style={s.groupBullet}>✓</Text>
            <Text style={s.groupItemText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MarketingHome() {
  const { width } = useWindowDimensions();
  const wide = width >= 980;

  useMarketingMeta(
    'Kleenest | Find bathrooms you can trust',
    'Kleenest helps people find cleaner, more usable bathrooms with fresh community evidence, trustworthy details, routes, rewards and business participation.'
  );

  return (
    <Shell>
      <View style={[s.hero, wide && s.heroWide]}>
        <View style={s.heroCopy}>
          <View style={s.heroBadgeRow}>
            <Text style={s.heroBadge}>FRESH EVIDENCE</Text>
            <Text style={s.heroBadge}>COMMUNITY VERIFIED</Text>
          </View>
          <Text style={[s.heroTitle, !wide && s.heroTitleCompact]}>Clean bathrooms shouldn’t be a gamble.</Text>
          <Text style={s.heroBody}>
            Kleenest helps you find a bathroom you can trust before you stop. Search near you or around any address, compare cleanliness, access, amenities and freshness, then navigate with confidence.
          </Text>
          <View style={s.heroButtonRow}>
            <Pressable style={s.heroPrimary} onPress={go('/install')}><Text style={s.heroPrimaryText}>INSTALL KLEENEST</Text></Pressable>
            <Pressable style={s.heroSecondary} onPress={go('/?app=1')}><Text style={s.heroSecondaryText}>TRY THE WEB APP</Text></Pressable>
          </View>
          <View style={s.heroTrustRow}>
            <TrustChip value="NOW" label="See what is fresh" />
            <TrustChip value="WHY" label="Understand the evidence" />
            <TrustChip value="GO" label="Navigate with confidence" />
          </View>
        </View>
        <View style={s.heroPreviewWrap}>
          <View style={s.heroGlow} />
          <LiveAppPreview />
        </View>
      </View>

      <View style={s.promiseBand}>
        <Text style={s.promiseEyebrow}>THE KLEENEST PROMISE</Text>
        <Text style={s.promiseTitle}>Know what you are walking into.</Text>
        <Text style={s.promiseBody}>
          Restroom conditions change. Kleenest is built around fresh observations, repeated verification and practical details so you can make a better decision before you arrive.
        </Text>
      </View>

      <View style={s.section}>
        <Eyebrow>WHY IT MATTERS</Eyebrow>
        <Text style={s.sectionTitle}>A bathroom can change the whole stop.</Text>
        <Text style={s.sectionLead}>
          A clean, usable restroom affects comfort, dignity, travel, family routines, workdays and how people remember a business. Kleenest makes that hidden part of the experience visible.
        </Text>
        <View style={s.metricsGrid}>
          <MetricCard value="LESS" label="GUESSING" body="Compare likely options before you commit to a stop." />
          <MetricCard value="FEWER" label="BAD STOPS" body="Use access, amenity and freshness signals to avoid surprises." />
          <MetricCard value="MORE" label="CONFIDENCE" body="Understand what people actually observed and how recently." />
          <MetricCard value="BETTER" label="EXPERIENCES" body="Turn useful feedback into smarter choices and better operations." />
        </View>
      </View>

      <View style={s.darkSection}>
        <View style={s.darkSectionIntro}>
          <Eyebrow light>TRUST + FRESHNESS</Eyebrow>
          <Text style={s.darkSectionTitle}>Not just a rating. A living evidence trail.</Text>
          <Text style={s.darkSectionBody}>
            A five-star review from last year cannot tell you what a restroom is like today. Kleenest looks at freshness, confidence, repeated evidence and contradiction so old information becomes a reason to verify—not a reason to pretend certainty.
          </Text>
          <Pressable style={s.darkSectionButton} onPress={go('/trust')}><Text style={s.darkSectionButtonText}>HOW TRUST WORKS</Text></Pressable>
        </View>
        <View style={s.trustRail}>
          {[
            ['01', 'DISCOVER', 'A restroom or business enters the network.'],
            ['02', 'VERIFY', 'People confirm access, condition and amenities.'],
            ['03', 'REFRESH', 'New visits keep the evidence current.'],
            ['04', 'IMPROVE', 'Users and businesses respond to what changed.'],
          ].map(([num, title, body]) => (
            <View style={s.trustRailItem} key={num}>
              <Text style={s.trustRailNum}>{num}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.trustRailTitle}>{title}</Text>
                <Text style={s.trustRailBody}>{body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={s.section}>
        <View style={s.sectionSplitHeader}>
          <View style={{ flex: 1 }}>
            <Eyebrow>FOR YOU</Eyebrow>
            <Text style={s.sectionTitle}>Find what you need. Make the network better.</Text>
          </View>
          <Pressable style={s.textLinkButton} onPress={go('/for-you')}><Text style={s.textLink}>SEE EVERYTHING FOR YOU →</Text></Pressable>
        </View>
        <Text style={s.sectionLead}>
          Kleenest solves the practical problem first, then rewards the useful actions that make the map smarter for everyone.
        </Text>
        <View style={s.iconGrid}>
          <IconCard icon="⌖" title="Search anywhere" body="Use your location, an address, a school, work, a hotel or a route destination." />
          <IconCard icon="✓" title="Choose with confidence" body="Compare cleanliness, access, amenities, distance and freshness before you stop." />
          <IconCard icon="★" title="Earn useful progress" body="Turn real check-ins and verified contributions into XP, levels, badges and specialties." />
          <IconCard icon="↗" title="Plan the next stop" body="Save trusted bathrooms, add them to routes and keep practical options close at hand." />
        </View>
      </View>

      <View style={s.rewardSection}>
        <View style={s.rewardCopy}>
          <Eyebrow>USEFUL CAN STILL BE FUN</Eyebrow>
          <Text style={s.rewardTitle}>Progress is tied to helping people.</Text>
          <Text style={s.rewardBody}>
            Quests, contests, leaderboards, journeys and challenges are built around useful real-world actions: discovering places, verifying conditions, confirming amenities and keeping information fresh.
          </Text>
          <View style={s.rewardPills}>
            {['XP + LEVELS', 'QUESTS', 'CONTESTS', 'BADGES', 'LEADERBOARDS', 'JOURNEYS'].map((item) => <Text style={s.rewardPill} key={item}>{item}</Text>)}
          </View>
        </View>
        <View style={s.rewardPanel}>
          <Text style={s.rewardPanelKicker}>TODAY’S MISSION</Text>
          <Text style={s.rewardPanelTitle}>Freshen the route.</Text>
          <Text style={s.rewardPanelBody}>Verify two saved restroom stops and confirm one amenity while you are already there.</Text>
          <View style={s.progressTrack}><View style={s.progressFill} /></View>
          <View style={s.rewardPanelBottom}><Text style={s.rewardPanelStatus}>2 of 3 complete</Text><Text style={s.rewardPanelXp}>+180 XP</Text></View>
        </View>
      </View>

      <View style={s.section}>
        <Eyebrow>KLEENEST ANYWHERE</Eyebrow>
        <Text style={s.sectionTitle}>Built for the places restroom decisions actually happen.</Text>
        <Text style={s.sectionLead}>
          The same trust layer can help whether you are crossing town, crossing a state, taking children out for the day or entering a crowded venue.
        </Text>
        <View style={s.scenarioGrid}>
          <ScenarioCard label="ROAD TRIP" headline="Make the next exit a better stop." place="Travel stop ahead · 7.2 mi" detail="4.8 ★ · verified 14 min ago · family restroom" />
          <ScenarioCard label="FAMILY DAY" headline="Find the amenities that matter." place="Museum family restroom · 0.8 mi" detail="Changing table · accessible · stroller friendly" />
          <ScenarioCard label="WORKDAY" headline="Know the reliable option nearby." place="Public lobby restroom · 0.4 mi" detail="Free access · stocked · low wait" />
          <ScenarioCard label="EVENT NIGHT" headline="Avoid the worst part of the crowd." place="Venue concourse · Gate C" detail="High traffic · stocked · accessible stall confirmed" />
        </View>
      </View>

      <View style={s.businessSection}>
        <View style={s.businessLead}>
          <Eyebrow light>FOR BUSINESS</Eyebrow>
          <Text style={s.businessTitle}>Turn restroom quality into a visible advantage.</Text>
          <Text style={s.businessBody}>
            Kleenest gives businesses a way to be discovered, keep information accurate, respond to customer evidence and connect restroom quality to measurable engagement and operations.
          </Text>
          <Pressable style={s.businessButton} onPress={go('/for-business')}><Text style={s.businessButtonText}>EXPLORE BUSINESS VALUE</Text></Pressable>
        </View>
        <View style={s.businessGrid}>
          {[
            ['DISCOVERY', 'Help the right customers find you', 'Manage location details, access, amenities and customer-facing restroom information.'],
            ['TRUST', 'Build and recover confidence', 'Reply to feedback, show updates and give fresh evidence a chance to replace stale perceptions.'],
            ['ENGAGEMENT', 'Connect visits to action', 'Use QR check-ins, campaigns, contests and promotions to make physical visits measurable.'],
            ['OPERATIONS', 'Act on what customers see', 'Use trends, analytics and reverification needs as an operational improvement loop.'],
          ].map(([kicker, title, body]) => (
            <View style={s.businessCard} key={kicker}>
              <Text style={s.businessCardKicker}>{kicker}</Text>
              <Text style={s.businessCardTitle}>{title}</Text>
              <Text style={s.businessCardBody}>{body}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.finalCta}>
        <Text style={s.finalCtaKicker}>READY WHEN YOU NEED IT</Text>
        <Text style={s.finalCtaTitle}>Put Kleenest one tap away.</Text>
        <Text style={s.finalCtaBody}>Install the web app on your phone, tablet or computer, or open Kleenest in your browser right now.</Text>
        <View style={s.finalCtaActions}>
          <Pressable style={s.finalCtaPrimary} onPress={go('/install')}><Text style={s.finalCtaPrimaryText}>INSTALL NOW</Text></Pressable>
          <Pressable style={s.finalCtaSecondary} onPress={go('/?app=1')}><Text style={s.finalCtaSecondaryText}>OPEN WEB APP</Text></Pressable>
        </View>
      </View>
    </Shell>
  );
}

const forYouGroups = [
  {
    title: 'Find the right bathroom faster',
    body: 'Start with the practical decision: where should I go?',
    items: [
      'Search near you or around any address',
      'Compare distance, cleanliness and freshness',
      'See access, amenities and practical details',
      'Save trusted places and start navigation',
      'Build restroom-aware routes for travel',
    ],
  },
  {
    title: 'Contribute evidence that matters',
    body: 'Useful observations make the next person’s decision clearer.',
    items: [
      'Check in when you are actually there',
      'Review cleanliness and condition',
      'Confirm amenities and access',
      'Add missing places and fresh observations',
      'Help stale information get reverified',
    ],
  },
  {
    title: 'Earn progress through useful action',
    body: 'Participation can be rewarding without replacing the utility.',
    items: [
      'XP, levels and specialties',
      'Quests, missions and journeys',
      'Badges, rankings and leaderboards',
      'Contests, challenges and campaigns',
      'Recognition for useful evidence',
    ],
  },
  {
    title: 'Keep your network close',
    body: 'Community, saved places and account controls stay part of one experience.',
    items: [
      'Follow useful contributors',
      'See activity and community signals',
      'Receive relevant notifications',
      'Use Premium or Family paths where appropriate',
      'Control privacy, support and account settings',
    ],
  },
];

export function ForYouMarketingPage() {
  useMarketingMeta(
    'Kleenest for You | Find, verify, earn and explore',
    'Explore Kleenest consumer benefits: trusted restroom discovery, fresh evidence, routes, XP, quests, contests, leaderboards and community.'
  );
  return (
    <Shell>
      <PurposeHero
        eyebrow="FOR YOU"
        title="A better restroom decision—and a reason to make the map better."
        body="Kleenest starts with a simple promise: help you choose a better restroom. Community, progress and rewards exist to strengthen that promise, not distract from it."
      />
      <View style={s.detailSection}>
        <Eyebrow>THE CONSUMER EXPERIENCE</Eyebrow>
        <Text style={s.detailSectionTitle}>Simple when you need it. Deeper when you want it.</Text>
        <Text style={s.detailSectionLead}>Open Kleenest for a fast answer, then contribute, save, plan and progress as much as fits your day.</Text>
        <View style={s.groupGrid}>
          {forYouGroups.map((group, index) => <GroupCard key={group.title} number={'0' + (index + 1)} {...group} />)}
        </View>
      </View>
      <View style={s.pageCta}>
        <Text style={s.pageCtaTitle}>Find your next trusted stop.</Text>
        <Text style={s.pageCtaBody}>Open the app now or install Kleenest so it is ready when you need it.</Text>
        <View style={s.finalCtaActions}>
          <Pressable style={s.finalCtaPrimary} onPress={go('/install')}><Text style={s.finalCtaPrimaryText}>INSTALL KLEENEST</Text></Pressable>
          <Pressable style={s.finalCtaSecondary} onPress={go('/?app=1')}><Text style={s.finalCtaSecondaryText}>OPEN THE APP</Text></Pressable>
        </View>
      </View>
    </Shell>
  );
}

const businessGroups = [
  {
    title: 'Get discovered for the right reasons',
    body: 'Make accurate restroom information part of the customer decision.',
    items: [
      'Claim and manage business and location information',
      'Publish restroom access, amenities and availability',
      'Improve discovery in search, maps and routes',
      'Use QR entry points for check-ins and reviews',
      'Keep customer-facing details current',
    ],
  },
  {
    title: 'Build and recover trust',
    body: 'A problem does not have to become a permanent reputation problem.',
    items: [
      'See reviews and evidence tied to locations',
      'Reply to customer feedback',
      'Track freshness and reverification needs',
      'Manage issue and remediation workflows',
      'Show that conditions changed after action',
    ],
  },
  {
    title: 'Create measurable engagement',
    body: 'Connect the physical visit to experiences that can bring customers back.',
    items: [
      'QR check-ins and attributed engagement',
      'Promotions, campaigns and offers',
      'Contests, challenges and events',
      'Business participation in Kleenest gamification',
      'Location-specific engagement paths',
    ],
  },
  {
    title: 'Operate with better signals',
    body: 'Use customer evidence as an operational feedback loop.',
    items: [
      'Location and restroom analytics',
      'Trend and issue visibility',
      'Preventive and follow-up workflows',
      'Multi-location operational oversight',
      'Freshness, confidence and verification signals',
    ],
  },
];

export function ForBusinessMarketingPage() {
  useMarketingMeta(
    'Kleenest for Business | Turn clean restrooms into an advantage',
    'Kleenest gives businesses discovery, trust, QR, review, engagement, analytics and operational tools built around the restroom experience.'
  );
  return (
    <Shell>
      <PurposeHero
        eyebrow="FOR BUSINESS"
        title="Make a clean restroom part of your customer experience strategy."
        body="Kleenest helps businesses get found, earn trust, engage visitors and act on restroom experience data. The goal is a tighter loop between what customers experience and what the business can improve."
        primary="INSTALL KLEENEST"
        secondary="SEE CONSUMER VIEW"
      />
      <View style={s.detailSection}>
        <Eyebrow>BUSINESS VALUE</Eyebrow>
        <Text style={s.detailSectionTitle}>Four clear jobs. One connected loop.</Text>
        <Text style={s.detailSectionLead}>The business experience stays organized around outcomes instead of overwhelming people with a long feature list.</Text>
        <View style={s.groupGrid}>
          {businessGroups.map((group, index) => <GroupCard key={group.title} number={'0' + (index + 1)} {...group} />)}
        </View>
      </View>
      <View style={s.businessLoop}>
        <Text style={s.businessLoopKicker}>THE KLEENEST BUSINESS LOOP</Text>
        <Text style={s.businessLoopTitle}>Discover → visit → verify → respond → improve → earn more trust.</Text>
        <Text style={s.businessLoopBody}>When customers can see fresh evidence and businesses can act on that evidence, restroom quality becomes something that can be managed—not just complained about.</Text>
      </View>
      <View style={s.pageCta}>
        <Text style={s.pageCtaTitle}>See Kleenest from the customer side.</Text>
        <Text style={s.pageCtaBody}>Open the web app and experience the same discovery path your customers use.</Text>
        <View style={s.finalCtaActions}>
          <Pressable style={s.finalCtaPrimary} onPress={go('/?app=1')}><Text style={s.finalCtaPrimaryText}>OPEN THE APP</Text></Pressable>
          <Pressable style={s.finalCtaSecondary} onPress={go('/install')}><Text style={s.finalCtaSecondaryText}>INSTALL KLEENEST</Text></Pressable>
        </View>
      </View>
    </Shell>
  );
}

export function TrustMarketingPage() {
  useMarketingMeta(
    'Kleenest Trust + Freshness | Understand the evidence',
    'Learn how Kleenest uses freshness, confidence, repeated community evidence and reverification to make restroom information more useful.'
  );
  return (
    <Shell>
      <PurposeHero
        eyebrow="TRUST + FRESHNESS"
        title="A restroom can change in an hour. The evidence should be able to change with it."
        body="Kleenest is designed around a simple reality: restroom conditions are temporary. Trust should come from what was observed, how recently it was observed and how much independent evidence supports the picture."
        primary="INSTALL KLEENEST"
        secondary="OPEN THE APP"
      />
      <View style={s.detailSection}>
        <Eyebrow>WHAT TRUST MEANS HERE</Eyebrow>
        <Text style={s.detailSectionTitle}>Confidence, not false certainty.</Text>
        <Text style={s.detailSectionLead}>Kleenest should make it clear when information is strong, when it is aging and when the right answer is simply: this needs another visit.</Text>
        <View style={s.trustPrinciplesGrid}>
          {[
            ['FRESHNESS', 'Recent observations matter more when conditions can change quickly.'],
            ['REPEAT EVIDENCE', 'Multiple independent observations are more useful than one isolated rating.'],
            ['CONTEXT', 'Access, amenities, condition and contributor context make a score understandable.'],
            ['CONTRADICTION', 'Conflicting evidence is a signal to investigate, not hide the disagreement.'],
            ['REVERIFICATION', 'Stale information creates a reason to check again instead of remaining permanently authoritative.'],
            ['TRANSPARENCY', 'People should be able to understand why Kleenest is confident—or why it is not.'],
          ].map(([title, body]) => (
            <View style={s.trustPrinciple} key={title}>
              <Text style={s.trustPrincipleTitle}>{title}</Text>
              <Text style={s.trustPrincipleBody}>{body}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.trustExample}>
        <View style={s.trustExampleScore}>
          <Text style={s.trustExampleScoreNum}>4.8</Text>
          <Text style={s.trustExampleStar}>★</Text>
        </View>
        <View style={s.trustExampleCopy}>
          <Text style={s.trustExampleKicker}>EXAMPLE TRUST SIGNAL</Text>
          <Text style={s.trustExampleTitle}>Strong recent agreement.</Text>
          <Text style={s.trustExampleBody}>Three recent observations agree on cleanliness and access. Amenities were confirmed twice. No unresolved contradictory evidence is currently visible.</Text>
          <View style={s.trustExampleTags}>
            <Text style={s.trustExampleTag}>VERIFIED 9M AGO</Text>
            <Text style={s.trustExampleTag}>3 RECENT OBSERVATIONS</Text>
            <Text style={s.trustExampleTag}>AMENITIES CONFIRMED</Text>
          </View>
        </View>
      </View>
      <View style={s.pageCta}>
        <Text style={s.pageCtaTitle}>Trust the evidence. Help refresh it.</Text>
        <Text style={s.pageCtaBody}>Use Kleenest when you need a better stop, then contribute when you can make the next person’s decision easier.</Text>
        <View style={s.finalCtaActions}>
          <Pressable style={s.finalCtaPrimary} onPress={go('/install')}><Text style={s.finalCtaPrimaryText}>INSTALL NOW</Text></Pressable>
          <Pressable style={s.finalCtaSecondary} onPress={go('/?app=1')}><Text style={s.finalCtaSecondaryText}>OPEN THE APP</Text></Pressable>
        </View>
      </View>
    </Shell>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.cream },
  scroll: { flexGrow: 1, backgroundColor: brand.cream },
  utilityBar: { backgroundColor: brand.forestDark, paddingHorizontal: 28, paddingVertical: 9, flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  utilityText: { color: '#DCE8E0', fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  utilityNote: { color: '#9AB4A4', fontSize: 9, fontWeight: '700' },
  header: { backgroundColor: 'rgba(255,253,248,0.96)', borderBottomWidth: 1, borderBottomColor: '#E7EBE7', minHeight: 78, paddingHorizontal: 28, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  logoLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.forest },
  logoMarkLight: { backgroundColor: '#F5F0E5' },
  logoMarkText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  logoMarkTextLight: { color: brand.forestDark },
  logoText: { color: brand.ink, fontSize: 15, fontWeight: '900', letterSpacing: 2.6 },
  logoTextLight: { color: '#FFFFFF' },
  logoTag: { color: '#738078', fontSize: 9, fontWeight: '700', marginTop: 2 },
  logoTagLight: { color: '#A8BCB0' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  navText: { color: brand.ink, fontSize: 11, fontWeight: '800' },
  openButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#C9D6CD' },
  openButtonText: { color: brand.forest, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  installButton: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, backgroundColor: brand.forest },
  installButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  hero: { paddingHorizontal: 24, paddingVertical: 44, gap: 28, backgroundColor: brand.paper },
  heroWide: { minHeight: 720, paddingHorizontal: 56, paddingVertical: 66, flexDirection: 'row', alignItems: 'center' },
  heroCopy: { flex: 1, maxWidth: 720 },
  heroBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  heroBadge: { color: brand.forest, backgroundColor: brand.mintSoft, borderWidth: 1, borderColor: '#CFE3D6', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { color: brand.ink, fontSize: 68, lineHeight: 70, letterSpacing: -2.4, fontWeight: '900', maxWidth: 700 },
  heroTitleCompact: { fontSize: 44, lineHeight: 47, letterSpacing: -1.3 },
  heroBody: { color: brand.muted, fontSize: 18, lineHeight: 29, fontWeight: '500', maxWidth: 660, marginTop: 20 },
  heroButtonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 26 },
  heroPrimary: { backgroundColor: brand.forest, paddingHorizontal: 21, paddingVertical: 16, borderRadius: 12 },
  heroPrimaryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  heroSecondary: { backgroundColor: '#FFFFFF', paddingHorizontal: 21, paddingVertical: 15, borderRadius: 12, borderWidth: 1, borderColor: '#CAD6CE' },
  heroSecondaryText: { color: brand.forest, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  heroTrustRow: { marginTop: 32, flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  trustChip: { minWidth: 125, backgroundColor: '#F2F6F3', borderRadius: 14, borderWidth: 1, borderColor: '#DBE5DE', paddingHorizontal: 12, paddingVertical: 11 },
  trustChipValue: { color: brand.forest, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  trustChipLabel: { color: '#718076', fontSize: 10, fontWeight: '700', marginTop: 2 },
  heroPreviewWrap: { flex: 0.85, minWidth: 320, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  heroGlow: { position: 'absolute', width: 340, height: 340, borderRadius: 170, backgroundColor: '#DDEEE3', opacity: 0.8 },
  device: { width: '100%', maxWidth: 430, borderRadius: 34, padding: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE6DF', transform: [{ rotate: '-1deg' }] },
  deviceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deviceBrand: { color: brand.forest, fontSize: 12, fontWeight: '900', letterSpacing: 2.1 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EBF6EF', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2C8B54' },
  livePillText: { color: '#2C754B', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  deviceKicker: { color: '#708178', fontSize: 8, fontWeight: '900', letterSpacing: 1.5, marginTop: 22 },
  deviceTitle: { color: brand.ink, fontSize: 26, lineHeight: 31, fontWeight: '900', marginTop: 3 },
  searchField: { marginTop: 16, backgroundColor: '#F6F7F3', borderWidth: 1, borderColor: '#DEE5DF', borderRadius: 14, padding: 12 },
  searchLabel: { color: brand.forest, fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  searchValue: { color: '#66746C', fontSize: 12, fontWeight: '700', marginTop: 4 },
  deviceFilterRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  filterPill: { color: '#708178', backgroundColor: '#F6F7F3', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, fontSize: 7, fontWeight: '900' },
  filterPillActive: { color: '#FFFFFF', backgroundColor: brand.forest, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, fontSize: 7, fontWeight: '900' },
  placeStack: { gap: 9, marginTop: 12 },
  placeCard: { flexDirection: 'row', gap: 11, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: '#DFE6E0', backgroundColor: '#FFFFFF' },
  placeCardBest: { borderColor: '#B7D2C1', backgroundColor: '#F5FAF7' },
  scoreBadge: { width: 48, height: 48, borderRadius: 14, backgroundColor: brand.forest, alignItems: 'center', justifyContent: 'center' },
  scoreNumber: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  scoreStar: { color: '#F1D68C', fontSize: 9, marginTop: -1 },
  placeCopy: { flex: 1 },
  placeTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  placeName: { color: brand.ink, fontSize: 12, fontWeight: '900' },
  bestBadge: { color: brand.forest, backgroundColor: '#DDEFE3', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3, fontSize: 6, fontWeight: '900' },
  placeMeta: { color: '#6C7A72', fontSize: 9, fontWeight: '700', marginTop: 2 },
  placeEvidence: { color: '#2F7A50', fontSize: 8, fontWeight: '900', marginTop: 4 },
  placeDetails: { color: '#79857D', fontSize: 8, fontWeight: '600', marginTop: 2 },
  deviceActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  navAction: { flex: 1, backgroundColor: brand.forest, borderRadius: 11, paddingVertical: 11, alignItems: 'center' },
  navActionText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  routeAction: { flex: 1, borderWidth: 1, borderColor: '#C8D5CC', borderRadius: 11, paddingVertical: 10, alignItems: 'center' },
  routeActionText: { color: brand.forest, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  promiseBand: { backgroundColor: brand.mint, paddingHorizontal: 24, paddingVertical: 40, alignItems: 'center' },
  promiseEyebrow: { color: brand.forest, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  promiseTitle: { color: brand.ink, fontSize: 31, lineHeight: 36, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  promiseBody: { color: '#55675C', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 760, marginTop: 10 },
  section: { paddingHorizontal: 24, paddingVertical: 60, maxWidth: 1240, width: '100%', alignSelf: 'center' },
  eyebrow: { color: brand.forest, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  eyebrowLight: { color: '#B7D2C1' },
  sectionTitle: { color: brand.ink, fontSize: 39, lineHeight: 44, fontWeight: '900', letterSpacing: -0.8, marginTop: 8, maxWidth: 780 },
  sectionLead: { color: brand.muted, fontSize: 15, lineHeight: 24, maxWidth: 820, marginTop: 12 },
  sectionSplitHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18 },
  textLinkButton: { paddingVertical: 8 },
  textLink: { color: brand.forest, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 30 },
  metricCard: { flexGrow: 1, flexBasis: 220, minHeight: 175, backgroundColor: brand.paper, borderWidth: 1, borderColor: '#E0E6E1', borderRadius: 20, padding: 20 },
  metricValue: { color: brand.forest, fontSize: 27, fontWeight: '900', letterSpacing: -0.5 },
  metricLabel: { color: brand.ink, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 5 },
  metricBody: { color: brand.muted, fontSize: 12, lineHeight: 18, marginTop: 9 },
  darkSection: { backgroundColor: brand.forestDark, paddingHorizontal: 24, paddingVertical: 62, gap: 30 },
  darkSectionIntro: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  darkSectionTitle: { color: '#FFFFFF', fontSize: 39, lineHeight: 44, fontWeight: '900', letterSpacing: -0.7, marginTop: 8 },
  darkSectionBody: { color: '#B8C9BF', fontSize: 15, lineHeight: 24, marginTop: 12, maxWidth: 760 },
  darkSectionButton: { alignSelf: 'flex-start', marginTop: 22, borderWidth: 1, borderColor: '#58725F', borderRadius: 11, paddingHorizontal: 15, paddingVertical: 12 },
  darkSectionButtonText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  trustRail: { maxWidth: 900, width: '100%', alignSelf: 'center', gap: 1, backgroundColor: '#294536', borderRadius: 20, overflow: 'hidden' },
  trustRailItem: { flexDirection: 'row', gap: 16, padding: 18, backgroundColor: '#163526' },
  trustRailNum: { color: brand.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  trustRailTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  trustRailBody: { color: '#AFC0B6', fontSize: 12, lineHeight: 18, marginTop: 4 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 30 },
  iconCard: { flexGrow: 1, flexBasis: 240, minHeight: 210, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#DFE5E0', padding: 20 },
  iconCircle: { width: 44, height: 44, borderRadius: 14, backgroundColor: brand.mintSoft, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: brand.forest, fontSize: 20, fontWeight: '900' },
  iconCardTitle: { color: brand.ink, fontSize: 18, lineHeight: 23, fontWeight: '900', marginTop: 16 },
  iconCardBody: { color: brand.muted, fontSize: 12, lineHeight: 19, marginTop: 7 },
  rewardSection: { marginHorizontal: 24, marginVertical: 20, maxWidth: 1192, alignSelf: 'center', width: '100%', backgroundColor: '#E7F2EA', borderRadius: 28, padding: 30, gap: 24 },
  rewardCopy: { flex: 1 },
  rewardTitle: { color: brand.ink, fontSize: 35, lineHeight: 40, fontWeight: '900', marginTop: 8 },
  rewardBody: { color: brand.muted, fontSize: 14, lineHeight: 22, maxWidth: 760, marginTop: 10 },
  rewardPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 18 },
  rewardPill: { color: brand.forest, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CADFD1', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  rewardPanel: { backgroundColor: brand.forest, borderRadius: 22, padding: 20 },
  rewardPanelKicker: { color: '#B7D0C0', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  rewardPanelTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 5 },
  rewardPanelBody: { color: '#BFD0C5', fontSize: 12, lineHeight: 19, marginTop: 7 },
  progressTrack: { backgroundColor: '#315D46', height: 8, borderRadius: 999, overflow: 'hidden', marginTop: 18 },
  progressFill: { width: '67%', height: 8, borderRadius: 999, backgroundColor: '#F0D17D' },
  rewardPanelBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  rewardPanelStatus: { color: '#C3D3C9', fontSize: 9, fontWeight: '800' },
  rewardPanelXp: { color: '#F0D17D', fontSize: 9, fontWeight: '900' },
  scenarioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 28 },
  scenarioCard: { flexGrow: 1, flexBasis: 250, minHeight: 220, borderRadius: 22, backgroundColor: brand.paper, borderWidth: 1, borderColor: '#E1E6E2', padding: 20 },
  scenarioLabel: { color: brand.forest, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  scenarioHeadline: { color: brand.ink, fontSize: 20, lineHeight: 25, fontWeight: '900', marginTop: 8, minHeight: 54 },
  scenarioPlaceCard: { marginTop: 20, backgroundColor: '#F1F5F2', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  scenarioPlace: { color: brand.ink, fontSize: 11, fontWeight: '900' },
  scenarioDetail: { color: '#6B786F', fontSize: 9, lineHeight: 14, marginTop: 4 },
  scenarioArrow: { color: brand.forest, fontSize: 22, fontWeight: '700' },
  businessSection: { backgroundColor: '#1B4732', paddingHorizontal: 24, paddingVertical: 62, gap: 26 },
  businessLead: { maxWidth: 850, width: '100%', alignSelf: 'center' },
  businessTitle: { color: '#FFFFFF', fontSize: 40, lineHeight: 45, fontWeight: '900', letterSpacing: -0.7, marginTop: 8 },
  businessBody: { color: '#BCD0C3', fontSize: 15, lineHeight: 24, marginTop: 12, maxWidth: 780 },
  businessButton: { alignSelf: 'flex-start', marginTop: 22, backgroundColor: '#FFFFFF', borderRadius: 11, paddingHorizontal: 15, paddingVertical: 12 },
  businessButtonText: { color: brand.forest, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  businessGrid: { maxWidth: 1000, width: '100%', alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  businessCard: { flexGrow: 1, flexBasis: 230, minHeight: 185, backgroundColor: '#244F3A', borderRadius: 18, borderWidth: 1, borderColor: '#376049', padding: 18 },
  businessCardKicker: { color: brand.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  businessCardTitle: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '900', marginTop: 7 },
  businessCardBody: { color: '#B9CABE', fontSize: 11, lineHeight: 18, marginTop: 7 },
  finalCta: { margin: 24, maxWidth: 1192, alignSelf: 'center', width: '100%', backgroundColor: brand.forestDark, borderRadius: 28, paddingHorizontal: 28, paddingVertical: 48, alignItems: 'center' },
  finalCtaKicker: { color: brand.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  finalCtaTitle: { color: '#FFFFFF', fontSize: 39, lineHeight: 44, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  finalCtaBody: { color: '#B8C9BF', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 620, marginTop: 10 },
  finalCtaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 22 },
  finalCtaPrimary: { backgroundColor: '#FFFFFF', borderRadius: 11, paddingHorizontal: 18, paddingVertical: 14 },
  finalCtaPrimaryText: { color: brand.forest, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  finalCtaSecondary: { borderWidth: 1, borderColor: '#6A8173', borderRadius: 11, paddingHorizontal: 18, paddingVertical: 13 },
  finalCtaSecondaryText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  detailHero: { backgroundColor: brand.forestDark, paddingHorizontal: 24, paddingVertical: 54, gap: 28 },
  detailHeroWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 56, paddingVertical: 72 },
  detailHeroCopy: { flex: 1, maxWidth: 760 },
  detailHeroTitle: { color: '#FFFFFF', fontSize: 48, lineHeight: 53, fontWeight: '900', letterSpacing: -1.1, marginTop: 9 },
  detailHeroBody: { color: '#B9C9C0', fontSize: 16, lineHeight: 25, marginTop: 14, maxWidth: 700 },
  heroButtonLight: { backgroundColor: '#FFFFFF', borderRadius: 11, paddingHorizontal: 17, paddingVertical: 14 },
  heroButtonLightText: { color: brand.forest, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  heroButtonOutline: { borderWidth: 1, borderColor: '#5E7768', borderRadius: 11, paddingHorizontal: 17, paddingVertical: 13 },
  heroButtonOutlineText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  detailHeroBadge: { maxWidth: 310, backgroundColor: '#173727', borderWidth: 1, borderColor: '#31513E', borderRadius: 22, padding: 22 },
  detailHeroBadgeKicker: { color: brand.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  detailHeroBadgeTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 7 },
  detailHeroBadgeBody: { color: '#B7C8BD', fontSize: 12, lineHeight: 19, marginTop: 7 },
  detailSection: { maxWidth: 1180, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 60 },
  detailSectionTitle: { color: brand.ink, fontSize: 38, lineHeight: 43, fontWeight: '900', marginTop: 8, maxWidth: 760 },
  detailSectionLead: { color: brand.muted, fontSize: 14, lineHeight: 22, maxWidth: 760, marginTop: 10 },
  groupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 30 },
  groupCard: { flexGrow: 1, flexBasis: 350, minHeight: 360, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DFE6E1', borderRadius: 22, padding: 22 },
  groupNumber: { color: brand.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  groupTitle: { color: brand.ink, fontSize: 23, lineHeight: 29, fontWeight: '900', marginTop: 10 },
  groupBody: { color: brand.muted, fontSize: 12, lineHeight: 19, marginTop: 8 },
  groupList: { marginTop: 18, gap: 9 },
  groupListItem: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  groupBullet: { color: brand.forest, fontSize: 11, fontWeight: '900', marginTop: 1 },
  groupItemText: { flex: 1, color: '#435349', fontSize: 11, lineHeight: 17, fontWeight: '700' },
  pageCta: { marginHorizontal: 24, marginBottom: 46, maxWidth: 1180, width: '100%', alignSelf: 'center', backgroundColor: brand.forest, borderRadius: 24, padding: 32, alignItems: 'center' },
  pageCtaTitle: { color: '#FFFFFF', fontSize: 32, lineHeight: 37, fontWeight: '900', textAlign: 'center' },
  pageCtaBody: { color: '#C4D3C9', fontSize: 13, lineHeight: 21, textAlign: 'center', maxWidth: 600, marginTop: 8 },
  businessLoop: { maxWidth: 1180, width: '100%', alignSelf: 'center', marginBottom: 46, paddingHorizontal: 24, paddingVertical: 38, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#D8E2DB' },
  businessLoopKicker: { color: brand.forest, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  businessLoopTitle: { color: brand.ink, fontSize: 28, lineHeight: 35, fontWeight: '900', marginTop: 8 },
  businessLoopBody: { color: brand.muted, fontSize: 13, lineHeight: 21, marginTop: 8, maxWidth: 820 },
  trustPrinciplesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 30 },
  trustPrinciple: { flexGrow: 1, flexBasis: 300, minHeight: 180, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DFE6E1', borderRadius: 20, padding: 20 },
  trustPrincipleTitle: { color: brand.forest, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  trustPrincipleBody: { color: '#47574D', fontSize: 13, lineHeight: 20, marginTop: 11 },
  trustExample: { maxWidth: 1180, width: '100%', alignSelf: 'center', marginBottom: 46, padding: 26, backgroundColor: '#E4F0E7', borderRadius: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 22, alignItems: 'center' },
  trustExampleScore: { width: 110, height: 110, borderRadius: 28, backgroundColor: brand.forest, alignItems: 'center', justifyContent: 'center' },
  trustExampleScoreNum: { color: '#FFFFFF', fontSize: 35, fontWeight: '900' },
  trustExampleStar: { color: brand.gold, fontSize: 16, marginTop: -3 },
  trustExampleCopy: { flex: 1, minWidth: 260 },
  trustExampleKicker: { color: brand.forest, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  trustExampleTitle: { color: brand.ink, fontSize: 27, lineHeight: 33, fontWeight: '900', marginTop: 5 },
  trustExampleBody: { color: brand.muted, fontSize: 12, lineHeight: 19, marginTop: 7 },
  trustExampleTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 13 },
  trustExampleTag: { color: brand.forest, backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 6, fontSize: 7, fontWeight: '900' },
  footer: { backgroundColor: brand.forestDark, paddingHorizontal: 28, paddingTop: 42, paddingBottom: 30, gap: 24 },
  footerMain: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  footerStatement: { color: '#AFC1B6', fontSize: 12, lineHeight: 18, maxWidth: 430 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  footerLink: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  footerFine: { color: '#80968A', fontSize: 9, lineHeight: 15, maxWidth: 760 },
});
