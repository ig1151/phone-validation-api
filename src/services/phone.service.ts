import { getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type { ValidateRequest, ValidationResult, LineType, PhoneRisk } from '../types/index';

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands',
  BR: 'Brazil', MX: 'Mexico', IN: 'India', CN: 'China', JP: 'Japan',
  KR: 'South Korea', SG: 'Singapore', ZA: 'South Africa', NG: 'Nigeria',
  KE: 'Kenya', GH: 'Ghana', AE: 'United Arab Emirates', SA: 'Saudi Arabia',
  PK: 'Pakistan', BD: 'Bangladesh', PH: 'Philippines', ID: 'Indonesia',
  TH: 'Thailand', VN: 'Vietnam', MY: 'Malaysia', NZ: 'New Zealand',
  AR: 'Argentina', CO: 'Colombia', CL: 'Chile', PE: 'Peru',
  PL: 'Poland', RU: 'Russia', UA: 'Ukraine', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', FI: 'Finland', CH: 'Switzerland',
  AT: 'Austria', BE: 'Belgium', PT: 'Portugal', GR: 'Greece',
  TR: 'Turkey', IL: 'Israel', EG: 'Egypt', MA: 'Morocco',
  GG: 'Guernsey', JE: 'Jersey', IM: 'Isle of Man',
  HK: 'Hong Kong', TW: 'Taiwan', MO: 'Macau',
  PR: 'Puerto Rico', GU: 'Guam', VI: 'US Virgin Islands',
};

const DISPOSABLE_PREFIXES = ['1900', '1976', '1977', '1978', '1979'];

function detectLineType(parsed: ReturnType<typeof parsePhoneNumberFromString>): LineType {
  if (!parsed) return 'unknown';
  const type = parsed.getType();
  switch (type) {
    case 'MOBILE': return 'mobile';
    case 'FIXED_LINE': return 'landline';
    case 'FIXED_LINE_OR_MOBILE': return 'mobile';
    case 'VOIP': return 'voip';
    case 'TOLL_FREE': return 'toll_free';
    case 'PREMIUM_RATE': return 'premium';
    default: return 'unknown';
  }
}

function calculateRisk(lineType: LineType, phone: string, _countryCode: string): PhoneRisk {
  const factors: string[] = [];
  let score = 0;

  const nationalNumber = phone.replace(/\D/g, '');
  const digitsOnly = nationalNumber.replace(/^1/, '');

  const isVoip = lineType === 'voip';
  const isTollFree = lineType === 'toll_free';
  const isPremium = lineType === 'premium';
  const isDisposable = DISPOSABLE_PREFIXES.some(p => nationalNumber.startsWith(p));
  const isLikelyFake =
    /^(\d)\1{6,}/.test(digitsOnly) ||
    digitsOnly === '1234567890' ||
    digitsOnly === '0987654321' ||
    digitsOnly.length < 7;

  if (isVoip) { score += 40; factors.push('VoIP number detected'); }
  if (isDisposable) { score += 50; factors.push('Disposable number prefix detected'); }
  if (isLikelyFake) { score += 60; factors.push('Sequential or repeated digits detected'); }
  if (isPremium) { score += 30; factors.push('Premium rate number'); }
  if (isTollFree) { score += 10; factors.push('Toll-free number'); }

  score = Math.min(100, score);
  const level = score >= 80 ? 'critical' : score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low';
  if (factors.length === 0) factors.push('No risk factors detected');

  return { score, level, is_voip: isVoip, is_disposable: isDisposable, is_likely_fake: isLikelyFake, factors };
}

const emptyRisk: PhoneRisk = {
  score: 0, level: 'low', is_voip: false, is_disposable: false, is_likely_fake: false,
  factors: ['No risk factors detected'],
};

export async function validatePhone(req: ValidateRequest): Promise<ValidationResult> {
  const t0 = Date.now();
  const phone = req.phone.trim();
  const id = uuidv4().slice(0, 8);

  logger.info({ id, phone }, 'Starting phone validation');

  try {
    const countryCode = req.country_code?.toUpperCase();
    const parsed = parsePhoneNumberFromString(phone, countryCode as never);

    if (!parsed) {
      return {
        phone, status: 'invalid', valid: false,
        formatted: { e164: '', international: '', national: '' },
        country: { code: '', name: '', dial_code: '' },
        line_type: 'unknown',
        risk: { score: 80, level: 'high', is_voip: false, is_disposable: false, is_likely_fake: true, factors: ['Could not parse phone number'] },
        is_possible: false,
        latency_ms: Date.now() - t0,
        created_at: new Date().toISOString(),
      };
    }

    const isValid = parsed.isValid();
    const isPossible = parsed.isPossible();
    const country = parsed.country ?? countryCode ?? '';
    const dialCode = country ? `+${getCountryCallingCode(country as never)}` : '';
    const lineType = detectLineType(parsed);
    const risk = calculateRisk(lineType, phone, country);

    logger.info({ id, isValid, country, lineType, riskScore: risk.score }, 'Validation complete');

    return {
      phone, status: isValid ? 'valid' : isPossible ? 'unknown' : 'invalid', valid: isValid,
      formatted: { e164: parsed.format('E.164'), international: parsed.formatInternational(), national: parsed.formatNational() },
      country: { code: country, name: COUNTRY_NAMES[country] ?? country, dial_code: dialCode },
      line_type: lineType,
      risk,
      is_possible: isPossible,
      latency_ms: Date.now() - t0,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.error({ id, phone, err }, 'Validation error');
    return {
      phone, status: 'invalid', valid: false,
      formatted: { e164: '', international: '', national: '' },
      country: { code: '', name: '', dial_code: '' },
      line_type: 'unknown',
      risk: emptyRisk,
      is_possible: false,
      latency_ms: Date.now() - t0,
      created_at: new Date().toISOString(),
    };
  }
}