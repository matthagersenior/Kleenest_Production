import test from 'node:test';
import assert from 'node:assert/strict';
import { isPreciseLocationPermission, selectBestLocationFix } from '../apps/consumer-mobile/services/checkInLocationQuality.js';

test('verified check-in rejects approximate Android and iOS permission', () => {
  assert.equal(isPreciseLocationPermission({status:'granted',android:{accuracy:'coarse'}}, 'android'), false);
  assert.equal(isPreciseLocationPermission({status:'granted',android:{accuracy:'fine'}}, 'android'), true);
  assert.equal(isPreciseLocationPermission({status:'granted',ios:{accuracy:'reduced'}}, 'ios'), false);
  assert.equal(isPreciseLocationPermission({status:'granted',ios:{accuracy:'full'}}, 'ios'), true);
});

test('verified check-in uses the most accurate fix instead of the first indoor sample', () => {
  const best = selectBestLocationFix([
    {coords:{latitude:1,longitude:1,accuracy:92},timestamp:100},
    {coords:{latitude:2,longitude:2,accuracy:31},timestamp:90},
    {coords:{latitude:3,longitude:3,accuracy:48},timestamp:110},
  ]);
  assert.equal(best.coords.latitude, 2);
  assert.equal(best.coords.accuracy, 31);
});
