const GEORGIAN_MONTHS = [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი",
];

const getGeorgiaDateISO = () => {
  const now = new Date();
  const georgiaTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  return georgiaTime.toISOString().slice(0, 10);
};

const formatGeorgianDate = (isoDate) => {
  if (!isoDate) return "";

  const [year, month, day] = isoDate.split("-");
  const monthName = GEORGIAN_MONTHS[Number(month) - 1];

  return `${Number(day)} ${monthName} ${year} წელი`;
};

module.exports = {
  getGeorgiaDateISO,
  formatGeorgianDate,
};