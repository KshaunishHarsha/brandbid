import * as countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(en);

export const COUNTRY_OPTIONS = Object.entries(countries.getNames('en'))
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

const COUNTRY_CODES = new Set(COUNTRY_OPTIONS.map((country) => country.code));

export function isCountryCode(value: string): boolean {
  return COUNTRY_CODES.has(value.toUpperCase());
}
