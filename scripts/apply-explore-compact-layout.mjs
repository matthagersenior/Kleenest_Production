import fs from 'node:fs';

const screenPath = 'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx';
const auditPath = 'scripts/native-map-authority-audit.mjs';
let source = fs.readFileSync(screenPath, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Missing ${label} anchor`);
  source = source.replace(oldText, newText);
}

replaceOnce(
  "  FlatList,\n  Pressable,",
  "  FlatList,\n  Modal,\n  Pressable,",
  'Modal import',
);

replaceOnce(
  '            <Text style={s.heroBody}>Nearby when you need one now. Along your route when you are planning ahead.</Text>\n',
  '',
  'hero explanatory copy',
);

const searchTail = `          </Pressable>\n        </View>\n\n        {mode === 'nearby' ? (`;
const primaryModes = `          </Pressable>\n        </View>\n\n        <View style={s.segment} accessibilityRole="tablist">\n          <Pressable\n            accessibilityRole="button"\n            accessibilityLabel="Nearby search"\n            accessibilityState={{ selected: mode === 'nearby' }}\n            onPress={() => chooseMode('nearby')}\n            style={[s.segmentButton, mode === 'nearby' && s.segmentActive]}\n          >\n            <Text style={[s.segmentText, mode === 'nearby' && s.segmentTextActive]}>Nearby</Text>\n          </Pressable>\n          <Pressable\n            accessibilityRole="button"\n            accessibilityLabel="Along route search"\n            accessibilityState={{ selected: mode === 'route' }}\n            onPress={() => chooseMode('route')}\n            style={[s.segmentButton, mode === 'route' && s.segmentActive]}\n          >\n            <Text style={[s.segmentText, mode === 'route' && s.segmentTextActive]}>Along route</Text>\n          </Pressable>\n        </View>\n\n        {mode === 'nearby' ? (`;
replaceOnce(searchTail, primaryModes, 'primary mode insertion');

const advancedStartToken = `        <Pressable\n          accessibilityRole="button"\n          accessibilityState={{ expanded: showAdvanced }}`;
const advancedStart = source.indexOf(advancedStartToken);
if (advancedStart < 0) throw new Error('Missing legacy advanced block start');
const advancedEnd = source.indexOf('\n\n        {message ?', advancedStart);
if (advancedEnd < 0) throw new Error('Missing legacy advanced block end');
const advancedModal = `        <Pressable\n          accessibilityRole="button"\n          accessibilityLabel="Advanced filters"\n          accessibilityState={{ expanded: showAdvanced }}\n          onPress={() => setShowAdvanced(true)}\n          style={s.advancedButton}\n        >\n          <View style={{ flex: 1 }}>\n            <Text style={s.filterTitle}>Advanced filters</Text>\n            <Text style={s.help}>Trip distance, corridor, and match rules</Text>\n          </View>\n          <Text style={s.linkText}>Open</Text>\n        </Pressable>\n\n        <Modal\n          transparent\n          animationType="fade"\n          visible={showAdvanced}\n          onRequestClose={() => setShowAdvanced(false)}\n        >\n          <View style={s.modalBackdrop}>\n            <Pressable\n              accessibilityRole="button"\n              accessibilityLabel="Close advanced filters"\n              style={StyleSheet.absoluteFill}\n              onPress={() => setShowAdvanced(false)}\n            />\n            <View style={s.advancedModalCard}>\n              <View style={s.advancedModalHeader}>\n                <View style={{ flex: 1 }}>\n                  <Text style={s.advancedModalTitle}>Advanced filters</Text>\n                  <Text style={s.help}>{mode === 'nearby' ? 'Tune required amenities and maximum search distance.' : 'Tune the route corridor and match rules.'}</Text>\n                </View>\n                <Pressable\n                  accessibilityRole="button"\n                  accessibilityLabel="Close advanced filters"\n                  style={s.modalClose}\n                  onPress={() => setShowAdvanced(false)}\n                >\n                  <Text style={s.modalCloseText}>×</Text>\n                </Pressable>\n              </View>\n              <ScrollView\n                style={s.advancedModalScroll}\n                contentContainerStyle={s.advancedModalContent}\n                showsVerticalScrollIndicator={false}\n              >\n                {mode === 'nearby' ? (\n                  <>\n                    <View style={s.rowHeading}>\n                      <Text style={s.filterTitle}>Adaptive amenity search</Text>\n                      <View style={s.autoRow}>\n                        <Text style={s.autoLabel}>Expand for required amenities</Text>\n                        <Switch\n                          disabled={!selectedAmenityNames.length}\n                          value={selectedAmenityNames.length > 0 && autoExpand}\n                          onValueChange={setAutoExpand}\n                        />\n                      </View>\n                    </View>\n                    {selectedAmenityNames.length > 0 && autoExpand ? (\n                      <View style={s.inlineBlock}>\n                        <Text style={s.filterTitle}>Maximum distance</Text>\n                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>\n                          {maxChoices.map((choice) => {\n                            const enabledValue = Math.max(radius, choice.meters);\n                            return (\n                              <Pressable\n                                key={choice.meters}\n                                style={[s.choice, maxRadius === enabledValue && s.choiceActive]}\n                                onPress={() => setMaxRadius(enabledValue)}\n                              >\n                                <Text style={[s.choiceText, maxRadius === enabledValue && s.choiceTextActive]}>{choice.label}</Text>\n                              </Pressable>\n                            );\n                          })}\n                        </ScrollView>\n                      </View>\n                    ) : null}\n                  </>\n                ) : (\n                  <View style={s.inlineBlock}>\n                    <View style={s.rowHeading}>\n                      <Text style={s.filterTitle}>Route corridor</Text>\n                      <Pressable onPress={() => { setShowAdvanced(false); router.push('/route'); }}>\n                        <Text style={s.linkText}>Open Route planner</Text>\n                      </Pressable>\n                    </View>\n                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>\n                      {corridorChoices.map((choice) => (\n                        <Pressable\n                          key={choice.meters}\n                          style={[s.choice, corridor === choice.meters && s.choiceActive]}\n                          onPress={() => setCorridor(choice.meters)}\n                        >\n                          <Text style={[s.choiceText, corridor === choice.meters && s.choiceTextActive]}>{choice.label}</Text>\n                        </Pressable>\n                      ))}\n                    </ScrollView>\n                  </View>\n                )}\n\n                {selectedAmenityNames.length ? (\n                  <View style={s.ruleRow}>\n                    <Pressable\n                      onPress={() => setMatchRule('all')}\n                      style={[s.rule, matchRule === 'all' && s.ruleActive]}\n                    >\n                      <Text style={[s.ruleText, matchRule === 'all' && s.ruleTextActive]}>Must include all</Text>\n                    </Pressable>\n                    <Pressable\n                      onPress={() => setMatchRule('any')}\n                      style={[s.rule, matchRule === 'any' && s.ruleActive]}\n                    >\n                      <Text style={[s.ruleText, matchRule === 'any' && s.ruleTextActive]}>Include any</Text>\n                    </Pressable>\n                  </View>\n                ) : null}\n              </ScrollView>\n              <Pressable style={s.modalDone} onPress={() => setShowAdvanced(false)}>\n                <Text style={s.primaryText}>Done</Text>\n              </Pressable>\n            </View>\n          </View>\n        </Modal>`;
source = source.slice(0, advancedStart) + advancedModal + source.slice(advancedEnd);

replaceOnce(
  '                    <Text style={s.closeText}>×</Text>',
  '                    <Text style={s.closeText}>×</Text>\n                    <Text style={s.closeLabel}>Close</Text>',
  'visible map close label',
);

replaceOnce(
`  hero: {\n    marginHorizontal: 12,\n    marginTop: 8,\n    borderRadius: 18,\n    paddingHorizontal: 13,\n    paddingVertical: 9,\n    backgroundColor: palette.green,\n  },`,
`  hero: {\n    marginHorizontal: 12,\n    marginTop: 4,\n    borderRadius: 16,\n    paddingHorizontal: 12,\n    paddingVertical: 5,\n    backgroundColor: palette.green,\n  },`,
  'compact hero style',
);
replaceOnce(
  "  title: { fontSize: 19, lineHeight: 23, fontWeight: '900', color: '#fff', marginTop: 2 },",
  "  title: { fontSize: 17, lineHeight: 20, fontWeight: '900', color: '#fff', marginTop: 1 },",
  'compact hero title',
);
replaceOnce(
  '  searchPanel: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 7, gap: 7 },',
  '  searchPanel: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 5, gap: 5 },',
  'compact search panel',
);
replaceOnce(
  "  segmentButton: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },",
  "  segmentButton: { flex: 1, minHeight: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },",
  'compact mode segment',
);
replaceOnce(
  '    minHeight: 44,',
  '    minHeight: 40,',
  'compact search input',
);
replaceOnce(
  "  searchButton: { minHeight: 44, borderRadius: 12, backgroundColor: palette.green, paddingHorizontal: 12, justifyContent: 'center' },",
  "  searchButton: { minHeight: 40, borderRadius: 12, backgroundColor: palette.green, paddingHorizontal: 12, justifyContent: 'center' },",
  'compact search button',
);
replaceOnce(
  "  choice: { minHeight: 38, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#e8efea', justifyContent: 'center' },",
  "  choice: { minHeight: 32, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#e8efea', justifyContent: 'center' },",
  'compact radius choices',
);
replaceOnce(
  "  amenityPill: { minHeight: 38, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#eef3ef', justifyContent: 'center' },",
  "  amenityPill: { minHeight: 32, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#eef3ef', justifyContent: 'center' },",
  'compact amenity pills',
);
replaceOnce(
  "  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#eef4f0', alignItems: 'center', justifyContent: 'center' },\n  closeText: { color: palette.green, fontSize: 21, lineHeight: 23, fontWeight: '900' },",
  "  close: { minHeight: 38, borderRadius: 19, backgroundColor: palette.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 10 },\n  closeText: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '900' },\n  closeLabel: { color: '#fff', fontSize: 9, fontWeight: '900' },",
  'high contrast close control',
);

const styleAnchor = "  routeCoverage: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff7e8', borderWidth: 1, borderColor: '#ead9b4' },";
if (!source.includes(styleAnchor)) throw new Error('Missing modal style anchor');
source = source.replace(styleAnchor, `  advancedButton: { minHeight: 34, borderRadius: 11, borderWidth: 1, borderColor: '#d6e2da', backgroundColor: '#f7faf8', paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 8 },\n  modalBackdrop: { flex: 1, backgroundColor: 'rgba(13,31,22,.46)', justifyContent: 'center', padding: 18 },\n  advancedModalCard: { maxHeight: '82%', borderRadius: 20, backgroundColor: '#fff', padding: 14, gap: 12 },\n  advancedModalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },\n  advancedModalTitle: { fontSize: 18, lineHeight: 22, fontWeight: '900', color: palette.ink },\n  advancedModalScroll: { flexGrow: 0 },\n  advancedModalContent: { gap: 12, paddingBottom: 4 },\n  modalClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },\n  modalCloseText: { color: '#fff', fontSize: 22, lineHeight: 24, fontWeight: '900' },\n  modalDone: { minHeight: 40, borderRadius: 11, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },\n${styleAnchor}`);

fs.writeFileSync(screenPath, source);

let audit = fs.readFileSync(auditPath, 'utf8');
audit = audit.replace("adaptiveExplore.includes('styles={s.advancedModalCard}')", "adaptiveExplore.includes('style={s.advancedModalCard}')");
fs.writeFileSync(auditPath, audit);

console.log('Applied compact Consumer Explore layout.');
