const units = {
  0: "",
  1: "ერთი",
  2: "ორი",
  3: "სამი",
  4: "ოთხი",
  5: "ხუთი",
  6: "ექვსი",
  7: "შვიდი",
  8: "რვა",
  9: "ცხრა",
  10: "ათი",
  11: "თერთმეტი",
  12: "თორმეტი",
  13: "ცამეტი",
  14: "თოთხმეტი",
  15: "თხუთმეტი",
  16: "თექვსმეტი",
  17: "ჩვიდმეტი",
  18: "თვრამეტი",
  19: "ცხრამეტი",
};

const exactTwenties = {
  20: "ოცი",
  40: "ორმოცი",
  60: "სამოცი",
  80: "ოთხმოცი",
};

const twentyStems = {
  20: "ოც",
  40: "ორმოც",
  60: "სამოც",
  80: "ოთხმოც",
};

const exactHundreds = {
  100: "ასი",
  200: "ორასი",
  300: "სამასი",
  400: "ოთხასი",
  500: "ხუთასი",
  600: "ექვსასი",
  700: "შვიდასი",
  800: "რვაასი",
  900: "ცხრაასი",
};

const hundredStems = {
  100: "ას",
  200: "ორას",
  300: "სამას",
  400: "ოთხას",
  500: "ხუთას",
  600: "ექვსას",
  700: "შვიდას",
  800: "რვაას",
  900: "ცხრაას",
};

const underHundred = (number) => {
  if (number < 20) {
    return units[number];
  }

  const base = Math.floor(number / 20) * 20;
  const remainder = number % 20;

  if (remainder === 0) {
    return exactTwenties[base];
  }

  return `${twentyStems[base]}და${units[remainder]}`;
};

const underThousand = (number) => {
  if (number < 100) {
    return underHundred(number);
  }

  const base = Math.floor(number / 100) * 100;
  const remainder = number % 100;

  if (remainder === 0) {
    return exactHundreds[base];
  }

  return `${hundredStems[base]} ${underHundred(remainder)}`;
};

const underMillion = (number) => {
  if (number < 1000) {
    return underThousand(number);
  }

  const thousands = Math.floor(number / 1000);
  const remainder = number % 1000;

  let thousandText;

  if (remainder === 0) {
    thousandText =
      thousands === 1 ? "ათასი" : `${underThousand(thousands)} ათასი`;
  } else {
    thousandText =
      thousands === 1 ? "ათას" : `${underThousand(thousands)} ათას`;
  }

  if (remainder === 0) {
    return thousandText;
  }

  return `${thousandText} ${underThousand(remainder)}`;
};

const numberToGeorgian = (value) => {
  const number = Number.parseInt(value, 10);

  if (Number.isNaN(number)) return "";
  if (number === 0) return "ნული";

  if (number < 1000000) {
    return underMillion(number);
  }

  const millions = Math.floor(number / 1000000);
  const remainder = number % 1000000;

  const millionText =
    millions === 1 ? "ერთი მილიონი" : `${underMillion(millions)} მილიონი`;

  if (remainder === 0) {
    return millionText;
  }

  return `${millionText} ${underMillion(remainder)}`;
};

module.exports = {
  numberToGeorgian,
};