const fs = require('fs');
const path = 'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx';
let source = fs.readFileSync(path, 'utf8');
function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(before, after);
}
replaceOnce(
  '        targetCount: 3,\n        limit: 30,',
  '        targetCount: 3,\n        limit: 500,',
  'nearby result budget',
);
replaceOnce(
  '    const enriched = await enrich(result.rows);\n    const preservedId = selectedId && enriched.some((row) => idOf(row) === selectedId)',
  '    const enriched = await enrich(result.rows);\n    const verificationCandidates = enriched.filter((row) => row?.needs_restroom_verification === true).length;\n    const restroomEvidence = enriched.length - verificationCandidates;\n    const preservedId = selectedId && enriched.some((row) => idOf(row) === selectedId)',
  'nearby result classification summary',
);
const oldSummary = `    } else {\n      setMessage(\n        enriched.length\n          ? \`\${enriched.length} qualifying bathroom\${enriched.length === 1 ? '' : 's'} within \${radiusLabel(result.effectiveRadiusMeters)}.\`\n          : \`No qualifying bathrooms found within \${radiusLabel(result.effectiveRadiusMeters)}.\`,\n      );\n    }`;
const newSummary = `    } else if (!query && !selectedAmenityNames.length) {\n      setMessage(\n        enriched.length\n          ? \`\${enriched.length} nearby places within \${radiusLabel(result.effectiveRadiusMeters)} · \${restroomEvidence} with restroom evidence · \${verificationCandidates} need bathroom verification.\`\n          : \`No nearby places found within \${radiusLabel(result.effectiveRadiusMeters)}.\`,\n      );\n    } else {\n      setMessage(\n        enriched.length\n          ? \`\${enriched.length} qualifying bathroom\${enriched.length === 1 ? '' : 's'} within \${radiusLabel(result.effectiveRadiusMeters)}.\`\n          : \`No qualifying bathrooms found within \${radiusLabel(result.effectiveRadiusMeters)}.\`,\n      );\n    }`;
replaceOnce(oldSummary, newSummary, 'unfiltered nearby summary');
replaceOnce(
  '              {rows.filter(hasCoordinates).slice(0, 100).map((row) => {',
  '              {rows.filter(hasCoordinates).map((row) => {',
  'map marker truncation',
);
replaceOnce(
  "              <Text style={s.listTitle}>{mode === 'route' ? 'Bathrooms ahead' : 'Bathrooms near you'}</Text>",
  "              <Text style={s.listTitle}>{mode === 'route' ? 'Bathrooms ahead' : 'Nearby businesses & bathrooms'}</Text>",
  'nearby list title',
);
fs.writeFileSync(path, source);
