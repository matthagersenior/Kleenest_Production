from pathlib import Path

path = Path('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx')
text = path.read_text()

anchor = "  const [mode, setMode] = useState<'nearby' | 'route'>('nearby');\n"
state = "  const [showAdvanced, setShowAdvanced] = useState(false);\n"
if state not in text:
    if anchor not in text:
        raise SystemExit('mode state anchor missing')
    text = text.replace(anchor, anchor + state, 1)

start_marker = "      <View style={s.searchPanel}>\n"
end_marker = "        {message ? <Text accessibilityLiveRegion=\"polite\" style={s.message}>{message}</Text> : null}\n"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('search panel anchors missing')

replacement = r'''      <View style={s.searchPanel}>
        <View style={s.searchRow}>
          <TextInput
            accessibilityLabel="Search bathrooms"
            style={s.input}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => void load()}
            returnKeyType="search"
            placeholder="Search a place, address or brand"
            placeholderTextColor="#7b8b82"
          />
          <Pressable accessibilityRole="button" style={s.searchButton} disabled={loading} onPress={() => void load()}>
            <Text style={s.searchButtonText}>{loading ? 'WORKING…' : 'SEARCH'}</Text>
          </Pressable>
        </View>

        {mode === 'nearby' ? (
          <>
            <View style={s.rowHeading}>
              <Text style={s.filterTitle}>Starting radius</Text>
              <Text style={s.autoLabel}>Local search</Text>
            </View>
            <View accessibilityRole="radiogroup">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
                {radiusChoices.map((choice) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: radius === choice.meters }}
                    key={choice.meters}
                    style={[s.choice, radius === choice.meters && s.choiceActive]}
                    onPress={() => chooseRadius(choice.meters)}
                  >
                    <Text style={[s.choiceText, radius === choice.meters && s.choiceTextActive]}>{choice.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </>
        ) : (
          <View style={s.rowHeading}>
            <Text style={s.filterTitle}>Along-route search</Text>
            <Text style={s.autoLabel}>Route controls are under advanced</Text>
          </View>
        )}

        <View style={s.amenityHeading}>
          <Text style={s.amenityTitle}>What matters on this stop?</Text>
          {selectedAmenityNames.length ? (
            <Pressable accessibilityRole="button" onPress={() => setSelectedAmenityNames([])}>
              <Text style={s.clear}>Clear filters</Text>
            </Pressable>
          ) : null}
        </View>
        {filterAmenities.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.amenityRow}>
            {filterAmenities.map((item) => (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selectedAmenityNames.includes(item.name) }}
                key={item.id}
                style={[s.amenityPill, selectedAmenityNames.includes(item.name) && s.amenityPillActive]}
                onPress={() => toggleAmenity(item.name)}
              >
                <Text style={[s.amenityText, selectedAmenityNames.includes(item.name) && s.amenityTextActive]}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={s.help}>Amenity catalog is loading.</Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvanced }}
          onPress={() => setShowAdvanced((current) => !current)}
          style={[s.rowHeading, { minHeight: 40, paddingVertical: 3 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.filterTitle}>Road trip / advanced</Text>
            <Text style={s.help}>Advanced trip controls</Text>
          </View>
          <Text style={s.linkText}>{showAdvanced ? 'Hide' : 'Show'}</Text>
        </Pressable>

        {showAdvanced ? (
          <View style={[s.inlineBlock, { gap: 7 }]}>
            <View style={s.segment}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'nearby' }}
                onPress={() => chooseMode('nearby')}
                style={[s.segmentButton, mode === 'nearby' && s.segmentActive]}
              >
                <Text style={[s.segmentText, mode === 'nearby' && s.segmentTextActive]}>Nearby</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'route' }}
                onPress={() => chooseMode('route')}
                style={[s.segmentButton, mode === 'route' && s.segmentActive]}
              >
                <Text style={[s.segmentText, mode === 'route' && s.segmentTextActive]}>Along route</Text>
              </Pressable>
            </View>

            {mode === 'nearby' ? (
              <>
                <View style={s.rowHeading}>
                  <Text style={s.filterTitle}>Adaptive amenity search</Text>
                  <View style={s.autoRow}>
                    <Text style={s.autoLabel}>Expand for required amenities</Text>
                    <Switch
                      disabled={!selectedAmenityNames.length}
                      value={selectedAmenityNames.length > 0 && autoExpand}
                      onValueChange={setAutoExpand}
                    />
                  </View>
                </View>
                {selectedAmenityNames.length > 0 && autoExpand ? (
                  <View style={s.inlineBlock}>
                    <Text style={s.filterTitle}>Maximum distance</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
                      {maxChoices.map((choice) => {
                        const enabledValue = Math.max(radius, choice.meters);
                        return (
                          <Pressable
                            key={choice.meters}
                            style={[s.choice, maxRadius === enabledValue && s.choiceActive]}
                            onPress={() => setMaxRadius(enabledValue)}
                          >
                            <Text style={[s.choiceText, maxRadius === enabledValue && s.choiceTextActive]}>{choice.label}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={s.inlineBlock}>
                <View style={s.rowHeading}>
                  <Text style={s.filterTitle}>Route corridor</Text>
                  <Pressable onPress={() => router.push('/route')}>
                    <Text style={s.linkText}>Open Route planner</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
                  {corridorChoices.map((choice) => (
                    <Pressable
                      key={choice.meters}
                      style={[s.choice, corridor === choice.meters && s.choiceActive]}
                      onPress={() => setCorridor(choice.meters)}
                    >
                      <Text style={[s.choiceText, corridor === choice.meters && s.choiceTextActive]}>{choice.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {selectedAmenityNames.length ? <View style={s.ruleRow}>
              <Pressable
                disabled={!selectedAmenityNames.length}
                onPress={() => setMatchRule('all')}
                style={[s.rule, matchRule === 'all' && s.ruleActive, !selectedAmenityNames.length && s.disabled]}
              >
                <Text style={[s.ruleText, matchRule === 'all' && s.ruleTextActive]}>Must include all</Text>
              </Pressable>
              <Pressable
                disabled={!selectedAmenityNames.length}
                onPress={() => setMatchRule('any')}
                style={[s.rule, matchRule === 'any' && s.ruleActive, !selectedAmenityNames.length && s.disabled]}
              >
                <Text style={[s.ruleText, matchRule === 'any' && s.ruleTextActive]}>Include any</Text>
              </Pressable>
            </View> : null}
          </View>
        ) : null}

'''

path.write_text(text[:start] + replacement + text[end:])
print('Patched AdaptiveExploreScreen progressive disclosure.')
