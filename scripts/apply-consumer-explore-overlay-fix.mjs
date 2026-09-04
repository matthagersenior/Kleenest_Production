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
    `const rememberedId = continuity?.selectedId || cache.selectedId || "";\n          const nextSelected =\n            rememberedId &&\n            cache.rows.some((row: any) => idOf(row) === rememberedId)\n              ? rememberedId\n              : idOf(cache.rows[0]);`,
    `const nextSelected = "";`,
  ],
  [
    '<View style={[s.mapFrame, { height: 300 }]}>' ,
    '<View style={[s.mapFrame, { height: 230 }]}>' ,
  ],
  [
    `<View\n              style={[s.legendWrap, { top: 48, bottom: undefined, right: 74 }]}\n            >`,
    `<View\n              pointerEvents="none"\n              style={[s.legendWrap, { top: 48, bottom: undefined, right: 74 }]}\n            >`,
  ],
  [
    `{selected ? (\n              <View\n                style={{`,
    `{selected ? (\n              <View\n                pointerEvents="box-none"\n                style={{`,
  ],
  [
    `              >\n                <Text style={s.selectedLabel}>BEST NEXT DECISION</Text>`,
    `              >\n                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>\n                  <Text style={[s.selectedLabel, { flex: 1 }]}>BEST NEXT DECISION</Text>\n                  <Pressable\n                    accessibilityRole="button"\n                    accessibilityLabel="Close selected location"\n                    hitSlop={8}\n                    onPress={() => setSelectedId("")}\n                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#eef4f0", alignItems: "center", justifyContent: "center" }}\n                  >\n                    <Text style={{ color: palette.green, fontSize: 22, lineHeight: 24, fontWeight: "900" }}>×</Text>\n                  </Pressable>\n                </View>`,
  ],
  [
    `        renderItem={({ item }) => (`,
    `        ListFooterComponent={rows.length ? (\n          <Pressable\n            accessibilityRole="button"\n            onPress={() => router.push('/discover')}\n            style={{ marginTop: 8, marginBottom: 12, borderRadius: 16, padding: 14, backgroundColor: "#eef4f0", borderWidth: 1, borderColor: "#d4e0d8" }}\n          >\n            <Text style={{ color: palette.green, fontSize: 11, fontWeight: "900", letterSpacing: 0.7 }}>MISSING A PLACE?</Text>\n            <Text style={{ color: palette.ink, fontSize: 16, fontWeight: "900", marginTop: 3 }}>Add a missing bathroom</Text>\n            <Text style={{ color: "#5f7468", fontSize: 12, lineHeight: 17, marginTop: 3 }}>Reached the end of nearby results? Add a missing place to the Kleenest network.</Text>\n          </Pressable>\n        ) : null}\n        renderItem={({ item }) => (`,
  ],
];

for (const [from, to] of replacements) {
  if (source.includes(to)) continue;
  if (!source.includes(from)) throw new Error(`Consumer Explore overlay patch contract drifted: missing ${from.slice(0, 80)}`);
  source = source.replace(from, to);
}

fs.writeFileSync(file, source);
console.log('Consumer Explore patched: explicit pin selection, touch-safe overlays, dismissible details, expanded result viewport, and scroll-end discovery recovery.');
