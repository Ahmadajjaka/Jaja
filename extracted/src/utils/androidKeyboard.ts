/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lightweight native Android IME (device keyboard & autofill) viewport helpers.
 * Never injects a secondary HTML keyboard; leaves all typing and autofill
 * strictly to the device's own system keyboard (Gboard / Samsung Keyboard / Android IME).
 */

export type EditableElement = HTMLInputElement | HTMLTextAreaElement;

export function isEditableInputElement(el: unknown): el is EditableElement {
  if (!el || typeof el !== 'object') return false;
  const node = el as HTMLElement;
  if (node.tagName === 'TEXTAREA') {
    return !(node as HTMLTextAreaElement).readOnly && !(node as HTMLTextAreaElement).disabled;
  }
  if (node.tagName === 'INPUT') {
    const input = node as HTMLInputElement;
    const nonTextTypes = new Set([
      'checkbox',
      'radio',
      'file',
      'button',
      'submit',
      'reset',
      'range',
      'color',
      'hidden',
      'image',
    ]);
    return !nonTextTypes.has(input.type) && !input.readOnly && !input.disabled;
  }
  return false;
}

/**
 * Computes whether an active input field is currently obscured by the device's system keyboard.
 */
export function isInputObscuredByKeyboard(
  rectBottom: number,
  visualViewportHeight: number,
  marginPx = 16
): boolean {
  if (!Number.isFinite(rectBottom) || !Number.isFinite(visualViewportHeight)) return false;
  if (visualViewportHeight <= 0) return false;
  return rectBottom > visualViewportHeight - marginPx;
}

/**
 * Computes keyboard height gap from window innerHeight and VisualViewport height.
 */
export function computeSystemKeyboardHeightGap(
  windowInnerHeight: number,
  visualViewportHeight: number
): number {
  if (!Number.isFinite(windowInnerHeight) || !Number.isFinite(visualViewportHeight)) return 0;
  const gap = Math.max(0, Math.round(windowInnerHeight - visualViewportHeight));
  return gap > 80 ? gap : 0;
}

/**
 * Tracks the Android device's own system keyboard via VisualViewport without
 * ever interfering with WebView InputConnection focus or autofill popups.
 */
export function initAndroidKeyboardBridge(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  let scrollTimer: number | undefined;

  const ensureVisibleIfCovered = (target: EditableElement) => {
    const vv = window.visualViewport;
    if (!vv) return;
    const gap = computeSystemKeyboardHeightGap(window.innerHeight, vv.height);
    if (gap <= 0) return;

    const rect = target.getBoundingClientRect();
    if (isInputObscuredByKeyboard(rect.bottom, vv.height)) {
      try {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {}
    }
  };

  const handleVisualViewportResize = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const gap = computeSystemKeyboardHeightGap(window.innerHeight, vv.height);
    document.documentElement.style.setProperty('--android-ime-height', `${gap}px`);

    if (gap > 0 && isEditableInputElement(document.activeElement)) {
      ensureVisibleIfCovered(document.activeElement);
    }
  };

  const handleFocusIn = (e: FocusEvent) => {
    const target = e.target;
    if (!isEditableInputElement(target)) return;
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      ensureVisibleIfCovered(target);
    }, 280);
  };

  document.addEventListener('focusin', handleFocusIn, true);
  window.visualViewport?.addEventListener('resize', handleVisualViewportResize);

  return () => {
    window.clearTimeout(scrollTimer);
    document.removeEventListener('focusin', handleFocusIn, true);
    window.visualViewport?.removeEventListener('resize', handleVisualViewportResize);
  };
}
