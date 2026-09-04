import fs from 'node:fs';

const file = new URL('../apps/consumer-mobile/app/explore.tsx', import.meta.url);
let source = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    '() => rows.find((row) => idOf(row) === selectedId) || rows[0] || null,',
    '() => rows.find((row) => idOf(row) === selectedId) || null,',
  ],
  [
    `const preservedId =\n        selectedId && enriched.some((row: any) => idOf(row) === selectedId)\n          ? selectedId\n          : enriched[0]\n            ? idOf(enriched[0])\n            : "";`,
    `const preservedId =\n        selectedId && enriched.some((row: any) => idOf(row) === selectedId)\n          ? selectedId\n          : "";`,
  ],
  [
    `const fallbackSelected =\n          fallback.selectedId &&\n          fallback.rows.some((row: any) => idOf(row) === fallback.selectedId)\n            ? fallback.selectedId\n            : idOf(fallback.rows[0]);`,
    `const fallbackSelected =\n          selectedId && fallback.rows.some((row: any) => idOf(row) === selectedId)\n            ? selectedId\n            : "";`,
  ],
  [
    `const rememberedId = continuity?.selectedId || cache.selectedId || "";\n          const nextSelected =\n            rememberedId &&\n            cache.rows.some((row: any) => idOf(row) === rememberedId\n              ? rememberedId\n              : idOf(cache.rows[0]);`,
    `const nextSelected = "";`,
  ],
  [
    `const rememberedId = continuity?.selectedId || cache.selectedId || "";\n          const nextSelected =\n            rememberedId &&\n            cache.rows.some((row: any) => idOf(row) === rememberedId)\n              ? rememberedId\n              : idOf(cache.rows[0]);`,
    `const nextSelected = "";`,
  ],
  [
    '<Map androidView="texture" style={s.map} mapStyle={OSM_STYLE}>',
    '<Map androidView="texture" style={s.map} mapStyle={OSM_STYLE} onPress={() => setSelectedId("")}>',
  ],
  [
    `              >\n                <Text style={s.selectedLabel}>BEST NEXT DECISION</Text>`,
    `              >\n                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>\n                  <Text style={[s.selectedLabel, { flex: 1 }]}>BEST NEXT DECISION</Text>\n                  <Pressable\n                    accessibilityRole="button"\n                    accessibilityLabel="Close selected location"\n                    hitSlop={8}\n                    onPress={() => setSelectedId("")}\n                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#eef4f0", alignItems: "center", justifyContent: "center" }}\n                  >\n                    <Text style={{ color: palette.green, fontSize: 22, lineHeight: 24, fontWeight: "900" }}>×</Text>\n                  </Pressable>\n                </View>`,
  ],
  [
    `        </View>\n        <View style={s.filterLine}>`,
    `        </View>\n        <Pressable\n          accessibilityRole="button"\n          accessibilityLabel="Discover or add a missing place"\n          onPress={() => router.push('/discover')}\n          style={{ marginTop: 8, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: '#b9ccc0', backgroundColor: '#edf5f0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}\n        >\n          <Text style={{ color: palette.green, fontSize: 11, fontWeight: '900' }}>MISSING A PLACE? DISCOVER IT →</Text>\n        </Pressable>\n        <View style={s.filterLine}>`,
  ],
];

for (const [from, to] of replacements) {
  if (source.includes(to)) continue;
  if (!source.includes(from)) throw new Error(`Consumer Explore overlay patch contract drifted: missing ${from.slice(0, 80)}`);
  source = source.replace(from, to);
}

fs.writeFileSync(file, source);
console.log('Consumer Explore patched: explicit selection, dismissible card, and first-class missing-place discovery CTA.');
