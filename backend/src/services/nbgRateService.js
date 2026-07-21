const getGeorgiaDateISO = () => {
  const now = new Date();
  const georgiaTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  return georgiaTime.toISOString().slice(0, 10);
};

const normalizeNbgDateToISO = (value, fallbackDate) => {
  if (!value) return fallbackDate || getGeorgiaDateISO();

  const raw = String(value).trim();

  // უკვე ISO ფორმატია: 2026-07-06 ან 2026-07-06T00:00:00
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  // NBG-დან თუ მოვიდა MM/DD/YYYY ან MM/DD/YY
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    const day = slashMatch[2].padStart(2, "0");
    let year = slashMatch[3];

    if (year.length === 2) {
      year = `20${year}`;
    }

    return `${year}-${month}-${day}`;
  }

  // თუ Date.parse-ით იკითხება, მაინც ISO-ში გადავიყვანოთ
  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return fallbackDate || getGeorgiaDateISO();
};

const getNbgUsdRate = async (date = getGeorgiaDateISO()) => {
  const url = `https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?date=${date}`;

  const response = await fetch(url);

  if (!response.ok) {
    const error = new Error("NBG კურსის წამოღება ვერ მოხერხდა.");
    error.statusCode = 502;
    throw error;
  }

  const data = await response.json();
  const dayData = data?.[0] || {};
  const currencies = dayData?.currencies || [];
  const usd = currencies.find((item) => item.code === "USD");

  if (!usd) {
    const error = new Error("USD კურსი NBG პასუხში ვერ მოიძებნა.");
    error.statusCode = 502;
    throw error;
  }

  const rate = Number(usd.rate);

  if (Number.isNaN(rate) || rate <= 0) {
    const error = new Error("USD კურსი NBG პასუხში ვერ მოიძებნა.");
    error.statusCode = 502;
    throw error;
  }

  const rawRateDate =
    usd.validFromDate ||
    usd.date ||
    dayData.date ||
    dayData.validFromDate ||
    date;

  const isoRateDate = normalizeNbgDateToISO(rawRateDate, date);

  return {
    code: usd.code,
    quantity: Number(usd.quantity || 1),
    rate,
    rateFormatted: usd.rateFormated || usd.rateFormatted || String(usd.rate),

    // frontend-ისთვის ყოველთვის YYYY-MM-DD
    validFromDate: isoRateDate,
    sourceDate: isoRateDate,

    // მხოლოდ შესამოწმებლად, რომ ვნახოთ NBG-დან რეალურად რა მოვიდა
    rawValidFromDate: rawRateDate,

    source: "NBG",
  };
};

module.exports = {
  getGeorgiaDateISO,
  getNbgUsdRate,
};