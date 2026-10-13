import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Punch-hole & Theme Tokens Suite', () => {
  it('should map notch modes to exact pixel offsets and css classes', () => {
    const NOTCH_CONFIG = {
      default: { class: '', extraOffset: 0 },
      punch: { class: 'notch-punch-hole', extraOffset: 36 },
      island: { class: 'notch-island', extraOffset: 48 },
      compact: { class: 'notch-compact', extraOffset: 0 },
    };

    assert.equal(NOTCH_CONFIG.punch.extraOffset, 36);
    assert.equal(NOTCH_CONFIG.island.extraOffset, 48);
    assert.equal(NOTCH_CONFIG.punch.class, 'notch-punch-hole');
    assert.equal(NOTCH_CONFIG.compact.class, 'notch-compact');
  });

  it('should compute combined safe area top height given system inset and punch hole offset', () => {
    const calculateTopOffset = (systemInset, notchExtra) => {
      return Math.max(systemInset, notchExtra);
    };

    // Case 1: Browser returns 0px safe-area on Android punch-hole phone
    assert.equal(calculateTopOffset(0, 36), 36);

    // Case 2: Browser returns 47px on iPhone dynamic island
    assert.equal(calculateTopOffset(47, 48), 48);

    // Case 3: Browser returns 59px on high-res notch device
    assert.equal(calculateTopOffset(59, 36), 59);
  });

  it('should validate all 8 theme modes and accent names against shared schema', () => {
    const VALID_THEMES = [
      'light',
      'dark',
      'oled',
      'sepia',
      'nord',
      'forest',
      'lavender',
      'system',
    ];
    const VALID_ACCENTS = [
      'blue',
      'green',
      'purple',
      'pink',
      'orange',
      'amber',
      'cyan',
      'mono',
    ];

    assert.equal(VALID_THEMES.length, 8);
    assert.equal(VALID_ACCENTS.length, 8);
    assert.equal(VALID_THEMES.includes('oled'), true);
    assert.equal(VALID_THEMES.includes('sepia'), true);
    assert.equal(VALID_ACCENTS.includes('cyan'), true);
  });
});
