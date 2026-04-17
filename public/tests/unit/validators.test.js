const fs = require('fs');
const path = require('path');

beforeAll(() => {
  const code = fs.readFileSync(path.resolve(__dirname, '../../js/validators.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', code)(global.window, global.document);
});

let V;
beforeAll(() => {
  V = window.Validators;
});

describe('Validators.validateEmail', () => {
  it('returns invalid for empty input', () => {
    expect(V.validateEmail('').valid).toBe(false);
    expect(V.validateEmail(null).valid).toBe(false);
  });

  it('returns invalid for missing @', () => {
    expect(V.validateEmail('notanemail').valid).toBe(false);
  });

  it('returns invalid when domain missing', () => {
    expect(V.validateEmail('user@').valid).toBe(false);
  });

  it('returns valid for correct email', () => {
    expect(V.validateEmail('user@example.com').valid).toBe(true);
  });

  it('returns valid for subdomain email', () => {
    expect(V.validateEmail('a@b.co').valid).toBe(true);
  });
});

describe('Validators.validatePassword', () => {
  it('returns invalid for empty input', () => {
    expect(V.validatePassword('').valid).toBe(false);
    expect(V.validatePassword(null).valid).toBe(false);
  });

  it('returns invalid for password shorter than 8 chars', () => {
    expect(V.validatePassword('abc').valid).toBe(false);
    expect(V.validatePassword('1234567').valid).toBe(false);
  });

  it('returns valid for 8+ char password', () => {
    expect(V.validatePassword('12345678').valid).toBe(true);
    expect(V.validatePassword('abcdefgh').valid).toBe(true);
  });
});

describe('Validators.validatePasswordStrength', () => {
  it('returns error string for empty password', () => {
    expect(V.validatePasswordStrength('')).toBeTruthy();
  });

  it('returns error string for password shorter than 8 chars', () => {
    expect(V.validatePasswordStrength('Abc1!')).toBeTruthy();
  });

  it('returns error string when missing uppercase', () => {
    expect(V.validatePasswordStrength('abcdefg1!')).toBeTruthy();
  });

  it('returns error string when missing lowercase', () => {
    expect(V.validatePasswordStrength('ABCDEFG1!')).toBeTruthy();
  });

  it('returns error string when missing number', () => {
    expect(V.validatePasswordStrength('Abcdefgh!')).toBeTruthy();
  });

  it('returns error string when missing special character', () => {
    expect(V.validatePasswordStrength('Abcdefg1')).toBeTruthy();
  });

  it('returns null for a strong password', () => {
    expect(V.validatePasswordStrength('Passw0rd!')).toBeNull();
  });
});

describe('Validators.validateName', () => {
  it('returns invalid for empty input', () => {
    expect(V.validateName('').valid).toBe(false);
    expect(V.validateName(null).valid).toBe(false);
  });

  it('returns invalid for whitespace-only input', () => {
    expect(V.validateName('   ').valid).toBe(false);
  });

  it('returns invalid for single character', () => {
    expect(V.validateName('A').valid).toBe(false);
  });

  it('returns valid for 2+ char name', () => {
    expect(V.validateName('Jo').valid).toBe(true);
    expect(V.validateName('Alice').valid).toBe(true);
  });

  it('uses custom fieldName in error message', () => {
    const result = V.validateName('', 'First Name');
    expect(result.error).toContain('First Name');
  });
});

describe('Validators.validateConfirmPassword', () => {
  it('returns invalid for empty confirm field', () => {
    expect(V.validateConfirmPassword('password', '').valid).toBe(false);
    expect(V.validateConfirmPassword('password', null).valid).toBe(false);
  });

  it('returns invalid when passwords do not match', () => {
    expect(V.validateConfirmPassword('password1', 'password2').valid).toBe(false);
  });

  it('returns valid when passwords match', () => {
    expect(V.validateConfirmPassword('mypassword', 'mypassword').valid).toBe(true);
  });
});

describe('Validators.escapeHtml', () => {
  it('escapes < and > characters', () => {
    const result = V.escapeHtml('<script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  it('escapes & character', () => {
    expect(V.escapeHtml('a & b')).toContain('&amp;');
  });

  it('converts number to string', () => {
    expect(typeof V.escapeHtml(42)).toBe('string');
  });

  it('handles null gracefully', () => {
    expect(V.escapeHtml(null)).toBe('');
  });

  it('handles undefined gracefully', () => {
    expect(V.escapeHtml(undefined)).toBe('');
  });
});
