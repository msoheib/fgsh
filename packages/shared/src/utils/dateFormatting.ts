type GregorianDateFormatOptions = Pick<Intl.DateTimeFormatOptions, 'year' | 'month' | 'day'> & {
  locale?: string;
};

const DEFAULT_GREGORIAN_ARABIC_LOCALE = 'ar-SA-u-ca-gregory';

export function formatGregorianDate(
  date: string | number | Date,
  options: GregorianDateFormatOptions = {}
): string {
  const {
    locale = DEFAULT_GREGORIAN_ARABIC_LOCALE,
    year = 'numeric',
    month = 'long',
    day = 'numeric',
  } = options;

  return new Intl.DateTimeFormat(locale, {
    calendar: 'gregory',
    year,
    month,
    day,
  }).format(new Date(date));
}
