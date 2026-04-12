import { parsePhoneNumber, isValidPhoneNumber, isPossiblePhoneNumber, getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type { ValidateRequest, ValidationResult, LineType } from '../types/index';

function detectLineType(phone: string, countryCode?: string): LineType {
  try {
    const parsed = parsePhoneNumberFromString(phone, countryCode as any);
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
  } catch { return 'unknown'; }
}

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

export async function validatePhone(req: ValidateRequest): Promise<ValidationResult> {
  const t0 = Date.now();
  const phone = req.phone.trim();
  const id = uuidv4().slice(0, 8);

  logger.info({ id, phone }, 'Starting phone validation');

  try {
    const countryCode = req.country_code?.toUpperCase();
    const parsed = parsePhoneNumberFromString(phone, countryCode as any);

    if (!parsed) {
      return {
        phone,
        status: 'invalid',
        valid: false,
        formatted: { e164: '', international: '', national: '' },
        country: { code: '', name: '', dial_code: '' },
        line_type: 'unknown',
        is_possible: false,
        latency_ms: Date.now() - t0,
        created_at: new Date().toISOString(),
      };
    }

    const isValid = parsed.isValid();
    const isPossible = parsed.isPossible();
    const country = parsed.country ?? countryCode ?? '';
    const dialCode = country ? `+${getCountryCallingCode(country as any)}` : '';
    const lineType = detectLineType(phone, countryCode);

    logger.info({ id, isValid, country, lineType }, 'Validation complete');

    return {
      phone,
      status: isValid ? 'valid' : isPossible ? 'unknown' : 'invalid',
      valid: isValid,
      formatted: {
        e164: parsed.format('E.164'),
        international: parsed.formatInternational(),
        national: parsed.formatNational(),
      },
      country: {
        code: country,
        name: COUNTRY_NAMES[country] ?? country,
        dial_code: dialCode,
      },
      line_type: lineType,
      location: parsed.country ? undefined : undefined,
      timezone: parsed.getType() ? undefined : undefined,
      is_possible: isPossible,
      latency_ms: Date.now() - t0,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.error({ id, phone, err }, 'Validation error');
    return {
      phone,
      status: 'invalid',
      valid: false,
      formatted: { e164: '', international: '', national: '' },
      country: { code: '', name: '', dial_code: '' },
      line_type: 'unknown',
      is_possible: false,
      latency_ms: Date.now() - t0,
      created_at: new Date().toISOString(),
    };
  }
}
