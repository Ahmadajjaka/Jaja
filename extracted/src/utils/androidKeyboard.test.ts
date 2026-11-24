import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSystemKeyboardHeightGap,
  isInputObscuredByKeyboard,
} from './androidKeyboard';

test('computeSystemKeyboardHeightGap detects when native device keyboard is open', () => {
  assert.equal(computeSystemKeyboardHeightGap(844, 844), 0);
  assert.equal(computeSystemKeyboardHeightGap(844, 790), 0); // small browser chrome changes ignored
  assert.equal(computeSystemKeyboardHeightGap(844, 520), 324);
});

test('isInputObscuredByKeyboard detects inputs hidden under active system keyboard', () => {
  assert.equal(isInputObscuredByKeyboard(540, 520), true);
  assert.equal(isInputObscuredByKeyboard(510, 520), true); // within 16px margin
  assert.equal(isInputObscuredByKeyboard(380, 520), false);
});
