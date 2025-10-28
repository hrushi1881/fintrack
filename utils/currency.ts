// Currency formatting utility
export interface CurrencyConfig {
  code: string;
  symbol: string;
  locale: string;
}

// Common currency configurations
export const CURRENCY_CONFIGS: { [key: string]: CurrencyConfig } = {
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', locale: 'en-EU' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB' },
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN' },
  JPY: { code: 'JPY', symbol: '¥', locale: 'ja-JP' },
  CAD: { code: 'CAD', symbol: 'C$', locale: 'en-CA' },
  AUD: { code: 'AUD', symbol: 'A$', locale: 'en-AU' },
  CHF: { code: 'CHF', symbol: 'CHF', locale: 'de-CH' },
  CNY: { code: 'CNY', symbol: '¥', locale: 'zh-CN' },
  KRW: { code: 'KRW', symbol: '₩', locale: 'ko-KR' },
  BRL: { code: 'BRL', symbol: 'R$', locale: 'pt-BR' },
  MXN: { code: 'MXN', symbol: '$', locale: 'es-MX' },
  RUB: { code: 'RUB', symbol: '₽', locale: 'ru-RU' },
  ZAR: { code: 'ZAR', symbol: 'R', locale: 'en-ZA' },
  SEK: { code: 'SEK', symbol: 'kr', locale: 'sv-SE' },
  NOK: { code: 'NOK', symbol: 'kr', locale: 'nb-NO' },
  DKK: { code: 'DKK', symbol: 'kr', locale: 'da-DK' },
  PLN: { code: 'PLN', symbol: 'zł', locale: 'pl-PL' },
  CZK: { code: 'CZK', symbol: 'Kč', locale: 'cs-CZ' },
  HUF: { code: 'HUF', symbol: 'Ft', locale: 'hu-HU' },
};

// Default currency (can be changed based on user preference)
const DEFAULT_CURRENCY = 'INR';

export function getCurrencyConfig(currencyCode: string = DEFAULT_CURRENCY): CurrencyConfig {
  return CURRENCY_CONFIGS[currencyCode] || CURRENCY_CONFIGS[DEFAULT_CURRENCY];
}

export function formatCurrency(
  amount: number,
  currencyCode: string = DEFAULT_CURRENCY,
  options?: {
    showSymbol?: boolean;
    showCode?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  const config = getCurrencyConfig(currencyCode);
  const {
    showSymbol = true,
    showCode = false,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options || {};

  try {
    const formatted = new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount);

    if (showSymbol && !showCode) {
      return formatted;
    }

    if (showCode && !showSymbol) {
      return formatted.replace(config.symbol, config.code);
    }

    if (!showSymbol && !showCode) {
      return formatted.replace(config.symbol, '').trim();
    }

    return formatted;
  } catch (error) {
    console.error('Error formatting currency:', error);
    // Fallback formatting
    return `${config.symbol}${amount.toLocaleString()}`;
  }
}

export function formatCurrencyAmount(
  amount: number,
  currencyCode: string = DEFAULT_CURRENCY
): string {
  return formatCurrency(amount, currencyCode, {
    showSymbol: true,
    showCode: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatCurrencySymbol(currencyCode: string = DEFAULT_CURRENCY): string {
  return getCurrencyConfig(currencyCode).symbol;
}

export function formatCurrencyCode(currencyCode: string = DEFAULT_CURRENCY): string {
  return getCurrencyConfig(currencyCode).code;
}
